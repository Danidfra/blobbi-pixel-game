/**
 * M11D.6, THE LIVE RELAY CHECK (a disposable identity only). The step that needs the owner's approval: it is the only
 * script that can publish to the real relays, and it does nothing of the kind unless asked twice.
 *
 *   npx tsx scripts/m11d6-live-check.ts                                  DRY RUN (default): nothing leaves this machine
 *   npx tsx scripts/m11d6-live-check.ts --publish --i-have-approval      publishes ONE disposable test Blobbi
 *
 * Both modes generate a brand-new identity in memory (never written anywhere, never printed: only its public key),
 * build the canonical Baby (31124) and its profile (11125) exactly as the game does, sign, verify and read them as
 * the kit reads them. The dry run stops there and prints what WOULD be sent.
 *
 * With approval it registers through the game's own `activate` against `PUBLISH_RELAYS` and then checks, each by a
 * SEPARATE connection: every relay's acknowledgement, read-back per relay, owner, d tag, stage, the V3 look (the
 * kit's seed from owner and d), discovery by the Standalone's own query (31124 by author with the ecosystem marker),
 * and that a second run sends nothing (idempotent retry). The test Blobbi is named "Pixel live check" so nobody takes
 * it for a real one. Its events stay public on those relays (relays may keep them even after a deletion request).
 * No real account, no player Blobbi, no browser profile is involved.
 */
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent, type NostrEvent } from 'nostr-tools/pure';
import { npubEncode } from 'nostr-tools/nip19';
import { classifyBlobbiEvent, deriveBlobbiV3Seed, generatePetId10, getTagValue, parseBlobbiEvent, BLOBBI_ECOSYSTEM_NAMESPACE } from '@blobbi-kit/core';
import { babyStateTemplate, canonicalD, profileTemplate, type EventTemplate } from '../src/nostr/canonical-events';
import { activate } from '../src/nostr/activation';
import { relayPublisher } from '../src/nostr/publisher';
import { PUBLISH_RELAYS, policyMet } from '../src/nostr/relay-config';
import { memoryStore } from '../src/game/persistence';

const args = new Set(process.argv.slice(2));
const live = args.has('--publish') && args.has('--i-have-approval');
if (args.has('--publish') && !live) {
  console.error('Refusing: --publish also needs --i-have-approval (the owner approved publishing a disposable test Blobbi).');
  process.exit(2);
}

// A disposable identity: in memory for this run only.
let secret: Uint8Array | null = generateSecretKey();
const owner = getPublicKey(secret);
const sign = async (t: EventTemplate): Promise<NostrEvent> => finalizeEvent(t, secret!);
const petId = generatePetId10();
const d = canonicalD(owner, petId);
const facts = { owner, petId, name: 'Pixel live check', bornAt: Math.floor(Date.now() / 1000) };
const now = Math.floor(Date.now() / 1000);
const fail = (what: string) => {
  console.log(`FAIL  ${what}`);
  process.exitCode = 1;
};
const check = (ok: boolean, what: string) => (ok ? console.log(`PASS  ${what}`) : fail(what));

console.log(`mode     ${live ? 'LIVE (approved): publishing to real relays' : 'DRY RUN: nothing is sent'}`);
console.log(`identity ${npubEncode(owner)} (disposable, public key only)`);
console.log(`d        ${d}`);
console.log(`relays   ${PUBLISH_RELAYS.join(', ')}`);

// 1-6: build, sign, verify, read as the kit does (local).
const baby = await sign(babyStateTemplate(facts, now));
const profile = await sign(profileTemplate(owner, d, now, null));
check(verifyEvent(baby) && verifyEvent(profile), 'both events are signed by the disposable identity and verify');
check(classifyBlobbiEvent(baby as never) === 'modern', 'the kit reads the Baby as a modern canonical Blobbi');
const parsed = parseBlobbiEvent(baby as never);
check(!!parsed && parsed.d === d && parsed.stage === 'baby' && parsed.v3Identity?.seed === deriveBlobbiV3Seed(owner, d), 'd, stage and the V3 look (seed of owner and d) are as the game draws it');
check(getTagValue(baby.tags, 'last_decay_at') === String(now), 'the care clock starts now (not at the reservation)');
check(profile.tags.some((t) => t[0] === 'has' && t[1] === d) && profile.tags.some((t) => t[0] === 'current_companion' && t[1] === d), 'the profile lists the Blobbi and makes it the companion');
check(!/nsec1|ncryptsec/.test(JSON.stringify([baby, profile])), 'no secret in either event');

if (!live) {
  console.log('\nWould publish (public data only):');
  for (const e of [baby, profile]) console.log(`  kind ${e.kind}  id ${e.id}  tags ${JSON.stringify(e.tags)}`);
  console.log('\nDRY RUN complete. Nothing was sent. To publish this disposable test Blobbi: --publish --i-have-approval');
  secret = null;
  process.exit();
}

// LIVE (approved): through the game's own registration, then independent checks.
const store = memoryStore();
const publisher = relayPublisher(PUBLISH_RELAYS);
const req = { facts, consent: true, backupVerified: true, ownerKind: 'guest' as const, mayHaveProfile: false };
let run;
try {
  run = await activate(req, { store, publisher, sign, now: () => Date.now(), timeoutMs: 10_000 });
  console.log('PASS  registration confirmed by the policy (read back from two relays, relay.ditto.pub among them)');
} catch (e) {
  const problem = (e as { problem?: string }).problem ?? 'error';
  run = (e as { run?: typeof run }).run;
  fail(`registration stopped: ${problem}`);
}
console.log(`acks     blobbi: ${run?.accepted.blobbi.join(', ') || 'none'} | profile: ${run?.accepted.profile.join(', ') || 'none'}`);
console.log(`readback blobbi: ${run?.seenOn?.blobbi.join(', ') || 'none'} | profile: ${run?.seenOn?.profile.join(', ') || 'none'}`);

// A separate connection per relay: ownership, d, stage, look; and discovery by the Standalone's own query.
const { NRelay1 } = await import('@nostrify/nostrify');
const found: string[] = [];
for (const url of PUBLISH_RELAYS) {
  const relay = new NRelay1(url, { backoff: false, idleTimeout: false });
  try {
    const events = await relay.query([{ kinds: [31124], authors: [owner], '#b': [BLOBBI_ECOSYSTEM_NAMESPACE], limit: 20 }], { signal: AbortSignal.timeout(10_000) });
    const mine = events.find((e) => getTagValue(e.tags, 'd') === d);
    const p = mine ? parseBlobbiEvent(mine as never) : null;
    const ok = !!mine && verifyEvent(mine) && mine.pubkey === owner && p?.stage === 'baby' && p.v3Identity?.seed === deriveBlobbiV3Seed(owner, d);
    if (ok) found.push(url);
    console.log(`${ok ? 'PASS' : 'MISS'}  ${url}: discovered as the Standalone looks (owner, d, stage, look)`);
  } catch (e) {
    console.log(`MISS  ${url}: ${(e as Error).name}`);
  } finally {
    await relay.close().catch(() => {});
  }
}
check(policyMet(PUBLISH_RELAYS, found), 'discovered by a separate client on enough relays');

// Safe retry: the same run again sends nothing new.
let sentAgain = 0;
const counting = { ...publisher, publish: async (...a: Parameters<typeof publisher.publish>) => ((sentAgain += 1), publisher.publish(...a)) };
await activate(req, { store, publisher: counting, sign, now: () => Date.now(), timeoutMs: 10_000 }).catch(() => {});
check(sentAgain === 0, 'a second run sends nothing (idempotent)');
secret = null;
console.log(`\nDone. The disposable test Blobbi stays public on these relays: ${npubEncode(owner)}`);
