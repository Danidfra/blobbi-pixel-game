/**
 * M11D.6: real canonical publishing made safe to switch on, and the way back after a restore. Everything here runs
 * against in-memory relays or a DISPOSABLE LOCAL RELAY on 127.0.0.1 (`tests/helpers/local-relay.ts`) with freshly
 * generated identities: nothing is ever sent to a public relay, and no real account or Blobbi is involved.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent, type NostrEvent } from 'nostr-tools/pure';
import { classifyBlobbiEvent, deriveBlobbiV3Seed, getCanonicalBlobbiD, getCanonicalBlobbonautD, getTagValue, parseBlobbiEvent } from '@blobbi-kit/core';
import { KeyVault, memoryVaultBackend } from '../src/nostr/keystore';
import { IdentityService } from '../src/nostr/identity';
import { memoryRelay, reasonOf, relayGroup, relayPublisher, type Publisher } from '../src/nostr/publisher';
import { activate, activationRun, ACTIVATION_KEY } from '../src/nostr/activation';
import { babyStateTemplate, profileTemplate, type EventTemplate } from '../src/nostr/canonical-events';
import { PUBLISH_RELAYS, READ_RELAYS, REQUIRED_RELAY, policyMet, publishModeFor, quorumFor } from '../src/nostr/relay-config';
import { DEFAULT_RELAYS } from '../src/nostr/relays';
import { buildBackupFile } from '../src/nostr/backup';
import { GUEST_BLOBBIS_KEY, awaitsName, guestBlobbi, readGuestBlobbis, updateGuestBlobbi } from '../src/game/guest-blobbis';
import { memoryStore } from '../src/game/persistence';
import { IdentityScreen } from '../src/ui/screens/identity';
import { TitleScreen } from '../src/ui/title';
import { GameUI } from '../src/ui/game-ui';
import { LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { setLocale } from '../src/i18n';
import { en } from '../src/i18n/messages/en';
import { ptBR } from '../src/i18n/messages/pt-BR';
import { es } from '../src/i18n/messages/es';
import { startLocalRelay, type LocalRelay } from './helpers/local-relay';
import type { WorldEntry } from '../src/game/worlds';

const PASSWORD = 'bubbles and stars';
const noSleep = async () => {};

/** Three in-memory relays named like the real ones (so the policy's required relay applies), each with its faults. */
function threeRelays(faults: { down?: Set<string>; refuse?: Set<string>; forget?: Set<string> } = {}) {
  const members = PUBLISH_RELAYS.map((url) => memoryRelay({ url, mode: 'live', down: () => !!faults.down?.has(url), refuse: () => !!faults.refuse?.has(url), forget: () => !!faults.forget?.has(url) }));
  return { members, group: relayGroup(members, 'live') };
}

function setup(publisher: Publisher, o: { account?: string } = {}) {
  const store = memoryStore();
  const vault = new KeyVault(memoryVaultBackend());
  const registered: string[] = [];
  let t = 1_760_000_000_000;
  const svc = new IdentityService({ store, vault, publisher, now: () => (t += 1000), currentAccount: () => o.account ?? null, onRegistered: (b) => registered.push(b.d), sleep: noSleep });
  return { store, vault, svc, registered, advance: (ms: number) => (t += ms) };
}

/** A born guest Blobbi with a checked Protected Key backup. */
async function readyGuest(s: ReturnType<typeof setup>) {
  const r = await s.svc.reserve({ kind: 'guest' }, 'island-1');
  if (!r.ok) throw new Error(r.problem);
  updateGuestBlobbi(s.store, r.value.d, { born: true });
  const file = await s.svc.makeBackup(r.value.owner, PASSWORD, ['Backup']);
  if (!file.ok) throw new Error(file.problem);
  expect((await s.svc.verifyBackup(r.value.owner, file.value.text, PASSWORD)).ok).toBe(true);
  return guestBlobbi(s.store, r.value.d)!;
}

const sentKinds = (m: { sent: NostrEvent[] }) => m.sent.map((e) => e.kind);

describe('M11D.6: the relays and the confirmation policy', () => {
  it('publishes where the Blobbi apps read: relay.ditto.pub (every app), primal (Standalone, Island), dreamith (Ditto)', () => {
    expect(PUBLISH_RELAYS).toEqual(['wss://relay.ditto.pub', 'wss://relay.primal.net', 'wss://relay.dreamith.to']);
    expect(READ_RELAYS).toEqual(PUBLISH_RELAYS);
    expect(DEFAULT_RELAYS).toEqual(READ_RELAYS); // what is published can be found by the same game
    expect(PUBLISH_RELAYS).not.toContain('wss://relay.nostr.band');
    expect(REQUIRED_RELAY).toBe('wss://relay.ditto.pub');
    expect(quorumFor(PUBLISH_RELAYS)).toBe(2);
  });

  it('shared means read back from two relays, relay.ditto.pub among them', () => {
    expect(policyMet(PUBLISH_RELAYS, ['wss://relay.ditto.pub', 'wss://relay.primal.net'])).toBe(true);
    expect(policyMet(PUBLISH_RELAYS, ['wss://relay.primal.net', 'wss://relay.dreamith.to'])).toBe(false); // not where every app reads
    expect(policyMet(PUBLISH_RELAYS, ['wss://relay.ditto.pub'])).toBe(false);
    expect(policyMet(['memory://one'], ['memory://one'])).toBe(true); // a single test relay: one is all
    expect(policyMet(PUBLISH_RELAYS, ['wss://relay.ditto.pub', 'wss://elsewhere.example'])).toBe(false); // only our relays count
  });

  it('a production build cannot be switched to real relays by a link; only the build (or a dev server) decides', () => {
    const hash = new URLSearchParams('publish=live');
    expect(publishModeFor({ dev: false, hash })).toBe('rehearsal');
    expect(publishModeFor({ dev: true, hash })).toBe('live');
    expect(publishModeFor({ dev: true, hash: new URLSearchParams('') })).toBe('rehearsal');
    expect(publishModeFor({ buildMode: 'live', dev: false, hash: new URLSearchParams('') })).toBe('live');
    expect(publishModeFor({ buildMode: 'rehearsal', dev: false, hash })).toBe('rehearsal');
  });

  it('the production CSP lets the page reach only its own relays (no other wss: host)', async () => {
    const { CSP } = await import('../vite.config');
    const connect = CSP.split('; ').find((d) => d.startsWith('connect-src'))!;
    expect(connect.split(' ').slice(1).sort()).toEqual(["'self'", ...PUBLISH_RELAYS].sort());
    expect(connect).not.toMatch(/ wss:( |$)/);
  });

  it("a relay's words are reduced to the NIP-01 prefix (its free text is never kept or shown)", () => {
    expect(reasonOf(new Error('blocked: you are banned, call 555-1234'))).toBe('blocked');
    expect(reasonOf(new Error('duplicate: have it'))).toBe('duplicate');
    expect(reasonOf(new Error('whatever <script>'))).toBe('refused');
    expect(reasonOf(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe('timeout');
  });
});

describe('M11D.6: registration against several relays (partial outages, retries, no duplicates)', () => {
  it('all three relays: both events read back from each; the Blobbi is registered and keeps its identity', async () => {
    const { members, group } = threeRelays();
    const s = setup(group);
    const b = await readyGuest(s);
    const r = await s.svc.register(b.d, true);
    expect(r).toMatchObject({ ok: true, value: { stage: 'done', mode: 'live', heldBy: 3, relays: 3 } });
    for (const m of members) expect(sentKinds(m)).toEqual([31124, 11125]);
    const run = activationRun(s.store, b.d)!;
    expect(run.seenOn!.blobbi.sort()).toEqual([...PUBLISH_RELAYS].sort());
    const g = guestBlobbi(s.store, b.d)!;
    expect(g.activatedAt).not.toBe(null);
    expect([g.owner, g.d, g.petId]).toEqual([b.owner, b.d, b.petId]);
    expect(s.registered).toEqual([b.d]);
    expect(await s.svc.shareStatus(b.d)).toBe('shared');
  }, 30_000);

  it('one relay (not relay.ditto.pub) down: still shared (two hold it); nothing is sent twice afterwards', async () => {
    const down = new Set(['wss://relay.dreamith.to']);
    const { members, group } = threeRelays({ down });
    const s = setup(group);
    const b = await readyGuest(s);
    expect((await s.svc.register(b.d, true)).ok).toBe(true);
    expect(guestBlobbi(s.store, b.d)!.activatedAt).not.toBe(null);
    down.clear();
    expect((await s.svc.register(b.d, true)).ok).toBe(true); // done is done
    expect(members.map((m) => m.sent.length)).toEqual([2, 2, 2]); // the down relay saw two attempts only
  }, 30_000);

  it('relay.ditto.pub down: a PARTIAL share (not registered); TRY AGAIN sends the same events only to it', async () => {
    const down = new Set(['wss://relay.ditto.pub']);
    const { members, group } = threeRelays({ down });
    const s = setup(group);
    const b = await readyGuest(s);
    expect(await s.svc.register(b.d, true)).toEqual({ ok: false, problem: 'partial' });
    expect(guestBlobbi(s.store, b.d)!.activatedAt).toBe(null);
    expect(s.registered).toEqual([]);
    expect(await s.svc.shareStatus(b.d)).toBe('partial');
    const ids = members[1].sent.map((e) => e.id);
    down.clear();
    const before = members.map((m) => m.sent.length);
    expect((await s.svc.register(b.d, true)).ok).toBe(true);
    expect(members[1].sent.length).toBe(before[1]); // primal already had both: not sent again
    expect(members[2].sent.length).toBe(before[2]);
    expect(members[0].sent.slice(before[0]).map((e) => e.id)).toEqual(ids); // the very same signed events
    expect(await s.svc.shareStatus(b.d)).toBe('shared');
  }, 30_000);

  it('a fresh device with the same identity: both events adopted from the relays, nothing signed, nothing sent', async () => {
    const { members, group } = threeRelays();
    const s = setup(group);
    const b = await readyGuest(s);
    expect((await s.svc.register(b.d, true)).ok).toBe(true);
    const sent = members.map((m) => m.sent.length);
    let signed = 0;
    const run = await activate({ facts: { owner: b.owner, petId: b.petId, name: b.name, bornAt: b.bornAt }, consent: true, backupVerified: true, ownerKind: 'guest' }, { store: memoryStore(), publisher: group, sign: async () => (signed++, Promise.reject(new Error('no'))), now: () => 1_770_000_000_000, sleep: noSleep });
    expect(run.adopted).toBe(true);
    expect(signed).toBe(0);
    expect(members.map((m) => m.sent.length)).toEqual(sent);
  }, 30_000);

    it('a relay that says OK but keeps nothing does not count; every relay refusing is a failure (nothing lost)', async () => {
    const forget = new Set(['wss://relay.primal.net', 'wss://relay.dreamith.to']);
    const a = threeRelays({ forget });
    const s = setup(a.group);
    const b = await readyGuest(s);
    expect(await s.svc.register(b.d, true)).toEqual({ ok: false, problem: 'partial' }); // only ditto really holds them
    const refuse = new Set(PUBLISH_RELAYS);
    const c = threeRelays({ refuse });
    const s2 = setup(c.group);
    const b2 = await readyGuest(s2);
    expect(await s2.svc.register(b2.d, true)).toEqual({ ok: false, problem: 'publish-failed' });
    expect(c.members.flatMap((m) => sentKinds(m))).toEqual([31124, 31124, 31124]); // no profile for a Blobbi nowhere
    expect(await s2.svc.shareStatus(b2.d)).toBe('failed');
    refuse.clear();
    expect((await s2.svc.register(b2.d, true)).ok).toBe(true);
    expect(new Set(c.members.flatMap((m) => m.sent.filter((e) => e.kind === 31124).map((e) => e.id))).size).toBe(1); // one Blobbi event, ever
  }, 30_000);
});

describe('M11D.6: practice is not sharing', () => {
  it('a rehearsal marks the Blobbi practiced (never registered, the account untouched); a live build then shares it for real', async () => {
    const store = memoryStore();
    const vault = new KeyVault(memoryVaultBackend());
    const registered: string[] = [];
    const rehearsal = memoryRelay();
    const svc = new IdentityService({ store, vault, publisher: rehearsal, onRegistered: (b) => registered.push(b.d), sleep: noSleep });
    const s = { store, vault, svc, registered, advance: () => 0 };
    const b = await readyGuest(s);
    expect(await svc.register(b.d, true)).toMatchObject({ ok: true, value: { mode: 'rehearsal', stage: 'done' } });
    const g = guestBlobbi(store, b.d)!;
    expect(g.activatedAt).toBe(null);
    expect(g.practicedAt).not.toBe(null);
    expect(registered).toEqual([]); // no account adoption for a rehearsal
    expect(await svc.shareStatus(b.d)).toBe('practiced');
    // The same device, a live build: the rehearsal run is not taken for a live one.
    const { members, group } = threeRelays();
    const live = new IdentityService({ store, vault, publisher: group, onRegistered: (x) => registered.push(x.d), sleep: noSleep });
    expect(live.registration(b.d).stage).toBe('none');
    expect(await live.shareStatus(b.d)).toBe('backedUp');
    expect((await live.register(b.d, true)).ok).toBe(true);
    expect(members.every((m) => sentKinds(m).join() === '31124,11125')).toBe(true);
    expect(guestBlobbi(store, b.d)!.activatedAt).not.toBe(null);
    expect(registered).toEqual([b.d]);
  }, 30_000);

  it('records from before M11D.6: a rehearsed "registration" reads as practiced; a live one stays registered', () => {
    const store = memoryStore();
    const owner = getPublicKey(generateSecretKey());
    const mk = (petId: string, activatedAt: number) => ({ owner, ownerKind: 'guest', petId, d: getCanonicalBlobbiD(owner, petId), name: 'Pip', createdAt: 1, bornAt: 1, island: null, born: true, activatedAt, named: true, namingLaterAt: null });
    const a = mk('00000000aa', 50);
    const c = mk('00000000cc', 70);
    store.set(GUEST_BLOBBIS_KEY, JSON.stringify({ version: 1, blobbis: [a, c] }));
    store.set(ACTIVATION_KEY, JSON.stringify({ version: 1, runs: { [a.d]: { owner, d: a.d, mode: 'rehearsal', stage: 'done' }, [c.d]: { owner, d: c.d, mode: 'live', stage: 'done' } } }));
    const [ra, rc] = readGuestBlobbis(store);
    expect([ra.activatedAt, ra.practicedAt]).toEqual([null, 50]);
    expect([rc.activatedAt, rc.practicedAt]).toEqual([70, null]);
    expect(awaitsName(ra)).toBe(false); // it went through the flow: its name was chosen
    expect(JSON.parse(store.get(GUEST_BLOBBIS_KEY)!).blobbis[0].activatedAt).toBe(50); // nothing rewritten by reading
  });
});

describe("M11D.6: the owner's profile is never rebuilt from a guess", () => {
  const owner = () => {
    const sk = generateSecretKey();
    return { sk, pk: getPublicKey(sk), sign: async (t: EventTemplate) => finalizeEvent(t, sk) };
  };

  it("an account's profile out of sight (its relay down) means unreachable: nothing is signed or sent", async () => {
    const down = new Set(['wss://relay.primal.net']);
    const { members, group } = threeRelays({ down });
    const o = owner();
    // The account's real profile lives only on the relay that is down.
    const existing = finalizeEvent(profileTemplate(o.pk, getCanonicalBlobbiD(o.pk, 'aaaaaaaaaa'), 1_700_000_000, null), o.sk);
    down.clear();
    await members[1].publish(existing, 1000);
    down.add('wss://relay.primal.net');
    members[1].sent.length = 0;
    const store = memoryStore();
    let signed = 0;
    const run = activate({ facts: { owner: o.pk, petId: 'bbbbbbbbbb', name: 'Pip', bornAt: 1 }, consent: true, backupVerified: true, ownerKind: 'account', mayHaveProfile: true }, { store, publisher: group, sign: (t) => (signed++, o.sign(t)), now: () => 1_760_000_000_000, sleep: noSleep });
    await expect(run).rejects.toMatchObject({ problem: 'unreachable' });
    expect(signed).toBe(0);
    expect(members.flatMap((m) => m.sent)).toEqual([]);
    // Back up: the existing profile is merged over, its Blobbi kept.
    down.clear();
    const done = await activate({ facts: { owner: o.pk, petId: 'bbbbbbbbbb', name: 'Pip', bornAt: 1 }, consent: true, backupVerified: true, ownerKind: 'account', mayHaveProfile: true }, { store, publisher: group, sign: o.sign, now: () => 1_760_000_000_000, sleep: noSleep });
    const has = done.profile!.tags.filter((t) => t[0] === 'has').map((t) => t[1]);
    expect(has).toEqual([getCanonicalBlobbiD(o.pk, 'aaaaaaaaaa'), getCanonicalBlobbiD(o.pk, 'bbbbbbbbbb')]);
  }, 30_000);

  it('companion sync audit: an OLDER profile on the answering relays, the newest one out of sight: unreachable, nothing sent', async () => {
    const down = new Set<string>();
    const { members, group } = threeRelays({ down });
    const o = owner();
    const older = finalizeEvent(profileTemplate(o.pk, getCanonicalBlobbiD(o.pk, 'aaaaaaaaaa'), 1_700_000_000, null), o.sk);
    const newer = finalizeEvent(profileTemplate(o.pk, getCanonicalBlobbiD(o.pk, 'cccccccccc'), 1_700_000_100, older), o.sk);
    await members[0].publish(older, 1000);
    await members[1].publish(newer, 1000);
    for (const m of members) m.sent.length = 0;
    down.add('wss://relay.primal.net');
    const store = memoryStore();
    let signed = 0;
    const run = activate({ facts: { owner: o.pk, petId: 'bbbbbbbbbb', name: 'Pip', bornAt: 1 }, consent: true, backupVerified: true, ownerKind: 'account', mayHaveProfile: true }, { store, publisher: group, sign: (t) => (signed++, o.sign(t)), now: () => 1_760_000_000_000, sleep: noSleep });
    await expect(run).rejects.toMatchObject({ problem: 'unreachable' });
    expect(signed).toBe(0);
    expect(members.flatMap((m) => m.sent).filter((e) => e.kind === 11125)).toEqual([]);
    // Back up: built over the newest, so the Blobbi only it listed is kept
    down.clear();
    const done = await activate({ facts: { owner: o.pk, petId: 'bbbbbbbbbb', name: 'Pip', bornAt: 1 }, consent: true, backupVerified: true, ownerKind: 'account', mayHaveProfile: true }, { store, publisher: group, sign: o.sign, now: () => 1_760_000_000_000, sleep: noSleep });
    expect(done.profile!.tags.filter((t) => t[0] === 'has').map((t) => t[1])).toContain(getCanonicalBlobbiD(o.pk, 'cccccccccc'));
  }, 30_000);

  it('a newer profile made meanwhile (another app) is merged over before the profile goes out, never replaced', async () => {
    const o = owner();
    let refuseProfile = true;
    const relay = memoryRelay({ mode: 'live', url: 'memory://live', refuse: (e) => e.kind === 11125 && refuseProfile });
    const store = memoryStore();
    let now = 1_760_000_000_000;
    const deps = { store, publisher: relay, sign: o.sign, now: () => now, sleep: noSleep };
    const req = { facts: { owner: o.pk, petId: 'cccccccccc', name: 'Pip', bornAt: 1 }, consent: true, backupVerified: true, ownerKind: 'account' as const, mayHaveProfile: true };
    await expect(activate(req, deps)).rejects.toMatchObject({ problem: 'publish-failed' });
    // Another app adds a Blobbi to the profile (newer), then the relay accepts profiles again.
    refuseProfile = false;
    const other = getCanonicalBlobbiD(o.pk, 'dddddddddd');
    now += 60_000;
    await relay.publish(finalizeEvent({ ...profileTemplate(o.pk, other, Math.floor(now / 1000), null), tags: [...profileTemplate(o.pk, other, Math.floor(now / 1000), null).tags, ['coins', '7']] }, o.sk), 1000);
    // Our stored profile was never accepted anywhere, so it is rebuilt over the newer one.
    const done = await activate(req, deps);
    const has = done.profile!.tags.filter((t) => t[0] === 'has').map((t) => t[1]);
    expect(has).toContain(other);
    expect(has).toContain(getCanonicalBlobbiD(o.pk, 'cccccccccc'));
    expect(done.profile!.tags).toContainEqual(['coins', '7']); // another app's tag kept
  }, 30_000);

  it('a legacy 31125 profile is carried into the 11125 with the canonical d, every tag kept', () => {
    const pk = getPublicKey(generateSecretKey());
    const legacy = { kind: 31125, tags: [['d', `blobbonaut-${pk.slice(0, 8)}`], ['b', 'blobbi:ecosystem:v1'], ['has', 'blobbi-old'], ['xp', '120']], content: 'hello' };
    const t = profileTemplate(pk, getCanonicalBlobbiD(pk, 'eeeeeeeeee'), 5, legacy);
    expect(t.kind).toBe(11125);
    expect(getTagValue(t.tags, 'd')).toBe(getCanonicalBlobbonautD(pk));
    expect(t.tags).toContainEqual(['xp', '120']);
    expect(t.tags.filter((x) => x[0] === 'has').map((x) => x[1])).toEqual(['blobbi-old', getCanonicalBlobbiD(pk, 'eeeeeeeeee')]);
    expect(t.content).toBe('hello');
  });
});

describe('M11D.6: a disposable identity through the whole event lifecycle (local only)', () => {
  it('generate, build the Baby and its profile, sign, verify, and read them as the kit (the Standalone) does', async () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const petId = 'f0e1d2c3b4';
    const d = getCanonicalBlobbiD(pk, petId);
    const bornAt = 1_700_000_000; // reserved long ago...
    const now = 1_760_000_000; // ...shared now
    const blobbi = finalizeEvent(babyStateTemplate({ owner: pk, petId, name: 'Momo', bornAt }, now), sk);
    const profile = finalizeEvent(profileTemplate(pk, d, now, null), sk);
    expect(verifyEvent(blobbi) && verifyEvent(profile)).toBe(true);
    expect(classifyBlobbiEvent(blobbi as never)).toBe('modern');
    const parsed = parseBlobbiEvent(blobbi as never)!;
    expect(parsed).toMatchObject({ d, stage: 'baby', name: 'Momo' });
    expect(parsed.v3Identity?.seed).toBe(deriveBlobbiV3Seed(pk, d));
    expect(getTagValue(blobbi.tags, 'visual_generation')).toBe('v3');
    expect(getTagValue(blobbi.tags, 'b')).toBe('blobbi:ecosystem:v1');
    expect(blobbi.tags.some((t) => t[0] === 'seed')).toBe(false);
    // The care clock starts when it is shared (the Standalone projects decay from it), never at the reservation.
    for (const tag of ['last_interaction', 'last_decay_at', 'care_streak_last_at']) expect(getTagValue(blobbi.tags, tag)).toBe(String(now));
    expect(profile.tags).toContainEqual(['has', d]);
    expect(profile.tags).toContainEqual(['current_companion', d]);
    // Nothing secret in either event.
    expect(JSON.stringify([blobbi, profile])).not.toMatch(/nsec1|ncryptsec/);
  });

  it('the Recovery Key file stays under the 4 KB Blobbi Standalone accepts, even naming 30 Blobbis', () => {
    const pk = getPublicKey(generateSecretKey());
    const nsec = `nsec1${'q'.repeat(58)}`;
    const blobbis = Array.from({ length: 30 }, (_, i) => ({ d: getCanonicalBlobbiD(pk, i.toString(16).padStart(10, '0')), petId: i.toString(16).padStart(10, '0'), name: 'X'.repeat(24), bornAt: 1_760_000_000, named: true }));
    for (const cat of [en, ptBR, es] as Record<string, string>[]) {
      const lines = ['identity.rfile.l1', 'identity.rfile.l2', 'identity.rfile.l3', 'identity.rfile.l4'].map((k) => String(cat[k]).replace('{name}', 'X'.repeat(24)));
      expect(Buffer.byteLength(buildBackupFile(nsec, pk, blobbis, lines))).toBeLessThan(4096);
    }
  });
});

describe('M11D.6: the real relay code against a disposable local relay (127.0.0.1)', () => {
  const relays: LocalRelay[] = [];
  afterEach(async () => {
    await Promise.all(relays.splice(0).map((r) => r.close()));
  });

  it('OK true, a refusal, a duplicate and a silent relay are each told apart; only OK counts, then read back', async () => {
    const good = await startLocalRelay('ok');
    const blocked = await startLocalRelay('refuse');
    const silent = await startLocalRelay('silent');
    relays.push(good, blocked, silent);
    const pub = relayPublisher([good.url, blocked.url, silent.url]);
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const e = finalizeEvent(babyStateTemplate({ owner: pk, petId: 'a1b2c3d4e5', name: 'Pip', bornAt: 1 }, 1_760_000_000), sk);
    const acks = await pub.publish(e, 600);
    expect(acks).toEqual([
      { relay: good.url, ok: true, reason: '' },
      { relay: blocked.url, ok: false, reason: 'blocked' },
      { relay: silent.url, ok: false, reason: 'timeout' },
    ]);
    // Sent again: the relay that has it says "duplicate", which still means it holds it.
    expect(await pub.publish(e, 600, [good.url])).toEqual([{ relay: good.url, ok: true, reason: '' }]);
    const back = await pub.query({ kinds: [31124], authors: [pk], '#d': [getCanonicalBlobbiD(pk, 'a1b2c3d4e5')], limit: 5 }, 600);
    expect(back.byRelay[good.url]!.map((x) => x.id)).toEqual([e.id]);
    expect(back.byRelay[blocked.url]).toEqual([]);
    expect(back.byRelay[silent.url]).toEqual([]); // it answers REQ, it just never says OK
  }, 20_000);

  it('a full registration through Nostrify to two local relays: published, read back, registered; a retry sends nothing', async () => {
    const a = await startLocalRelay('ok');
    const b = await startLocalRelay('ok');
    relays.push(a, b);
    const s = setup(relayPublisher([a.url, b.url]));
    const g = await readyGuest(s);
    const r = await s.svc.register(g.d, true);
    expect(r).toMatchObject({ ok: true, value: { mode: 'live', stage: 'done', heldBy: 2 } });
    for (const relay of [a, b]) {
      expect(relay.events.map((e) => e.kind).sort()).toEqual([11125, 31124]);
      const baby = relay.events.find((e) => e.kind === 31124)!;
      expect(baby.pubkey).toBe(g.owner);
      expect(getTagValue(baby.tags, 'd')).toBe(g.d);
      expect(getTagValue(baby.tags, 'stage')).toBe('baby');
      expect(parseBlobbiEvent(baby as never)!.v3Identity?.seed).toBe(deriveBlobbiV3Seed(g.owner, g.d)); // the same look
    }
    const count = a.received.length + b.received.length;
    expect((await s.svc.register(g.d, true)).ok).toBe(true);
    expect(a.received.length + b.received.length).toBe(count);
  }, 20_000);

  it('a relay that loses what it accepted keeps the share partial until it really holds it', async () => {
    const a = await startLocalRelay('ok');
    const b = await startLocalRelay('forget');
    relays.push(a, b);
    const s = setup(relayPublisher([a.url, b.url]));
    const g = await readyGuest(s);
    expect(await s.svc.register(g.d, true)).toEqual({ ok: false, problem: 'partial' });
    b.behaviour = 'ok';
    expect((await s.svc.register(g.d, true)).ok).toBe(true);
    expect(b.events.map((e) => e.kind).sort()).toEqual([11125, 31124]);
  }, 20_000);
});

describe('M11D.6: after a restore, one clear way on', () => {
  const entry = (name: string): WorldEntry => ({ identity: `id-${name}`, params: {} as WorldEntry['params'], name, day: 1, quests: 0, buildings: 0, lastPlayed: 0 });
  const title = (worlds: WorldEntry[], current: string | null) => new TitleScreen({ worlds: () => worlds, current: () => ({ identity: '', name: '', saved: false }), continueGame: () => {}, openWorld: () => {}, settings: () => {}, currentBlobbi: () => (current ? { name: current } : null) });

  it('with islands: the islands page, the restored Blobbi greeted; a new adventure offers it first', () => {
    setLocale('en');
    const t = title([entry('Sunny'), entry('Misty')], 'Momo');
    t.active = false;
    t.afterRestore('Momo');
    expect(t.active).toBe(true);
    expect(t.page).toBe('islands');
    expect(t.restoredName).toBe('Momo');
    expect(t.pendingCreate).toBe(null); // nothing created by itself
  });

  it('without islands: straight into a new adventure; CONTINUE WITH <name> comes first, MEET A NEW BLOBBI stays', () => {
    setLocale('en');
    const t = title([], 'Momo');
    t.afterRestore('Momo');
    expect(t.page).toBe('carrier');
    t.key('Enter'); // the Carrier
    t.key('Enter'); // CREATE ISLAND (the name)
    expect(t.page).toBe('companion');
    expect(t.pendingCreate).toBe(null);
    t.key('Enter'); // the first row
    expect(t.takeCreate()).toMatchObject({ companion: 'current' });
    // Without a restore the order is as before (meeting a new Blobbi first).
    const u = title([], 'Momo');
    u.newAdventure();
    u.key('Enter');
    u.key('Enter');
    u.key('Enter');
    expect(u.takeCreate()).toMatchObject({ companion: 'new' });
  });

  it('an identity back without a Blobbi: the menu as usual (nothing made)', () => {
    const t = title([], null);
    t.afterRestore(null);
    expect(['welcome', 'main']).toContain(t.page);
    expect(t.pendingCreate).toBe(null);
  });

  it('the restore page ends on "<name> is back!" with CONTINUE WITH <name>, which hands the restored Blobbi to the host', async () => {
    setLocale('en');
    const { group } = threeRelays();
    const s = setup(group);
    const g = await readyGuest(s);
    s.svc.rename(g.d, 'Momo');
    const file = await s.svc.makeRecoveryKey(g.owner, ['Recovery']);
    if (!file.ok) throw new Error(file.problem);
    // Another device: an empty store and vault.
    const s2 = setup(group);
    const behind = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16); // the island behind the menu
    const ui = new GameUI(() => behind, () => paletteFor('cozy'));
    const sc = new IdentityScreen();
    const continued: (string | null)[] = [];
    sc.identity = s2.svc;
    sc.host = { editText: () => {}, pickFile: () => {}, pasteText: () => {}, download: () => {}, copy: async () => false, walking: () => ({ reserved: null, legacyLocal: false }), bring: () => {}, continueAfterRestore: (d) => continued.push(d), portraitOf: () => null };
    ui.register(sc);
    sc.start('restore');
    ui.open('identity');
    sc.setLoaded(file.value.text);
    sc.index = 2; // LOOK INSIDE (no password for a Recovery Key)
    ui.handleKey('Enter');
    for (let i = 0; i < 100 && sc.page !== 'restorePreview'; i++) await new Promise((r) => setTimeout(r, 10));
    ui.handleKey('Enter'); // RESTORE
    for (let i = 0; i < 100 && (sc.page !== 'restoreDone' || sc.search?.status === 'looking'); i++) await new Promise((r) => setTimeout(r, 10));
    expect(sc.page).toBe('restoreDone');
    const buf = new PixelBuffer(960, 540);
    ui.render(buf, 0);
    ui.handleKey('Enter'); // CONTINUE WITH MOMO (the first, primary action)
    expect(continued).toEqual([g.d]);
    expect(ui.screen).toBe(null);
    // The same character came back: same owner, same d, its name; nothing was published by restoring.
    expect(guestBlobbi(s2.store, g.d)).toMatchObject({ owner: g.owner, d: g.d, petId: g.petId, name: 'Momo', named: true });
  }, 30_000);
});

describe('M11D.6: what the player is told', () => {
  it('a rehearsal ends on PRACTICE COMPLETE (never "shared"); the account page tells each state apart', async () => {
    setLocale('en');
    const s = setup(memoryRelay());
    const g = await readyGuest(s);
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    const ui = new GameUI(() => live, () => paletteFor('cozy'));
    const sc = new IdentityScreen();
    sc.identity = s.svc;
    sc.host = { editText: () => {}, pickFile: () => {}, pasteText: () => {}, download: () => {}, copy: async () => false, walking: () => ({ reserved: s.svc.reserved().find((x) => x.d === g.d)!, legacyLocal: false }), bring: () => {} };
    ui.register(sc);
    sc.start('activate');
    ui.open('identity');
    ui.handleKey('Enter'); // LET'S DO IT: the backup is already checked, so straight to consent
    for (let i = 0; i < 100 && sc.page !== 'consent'; i++) await new Promise((r) => setTimeout(r, 10));
    expect(sc.page).toBe('consent');
    await sc.register();
    expect(sc.page).toBe('reveal');
    ui.render(new PixelBuffer(960, 540), 0); // the practice page draws (its words are the practice keys)
    expect(en['identity.practice.title']).toBe('Practice complete!');
    expect(guestBlobbi(s.store, g.d)!.activatedAt).toBe(null);
    // The account page's words for each state.
    for (const k of ['local', 'backedUp', 'practiced', 'pending', 'partial', 'failed', 'shared'])
      for (const cat of [en, ptBR, es] as Record<string, string>[]) {
        expect(cat[`account.share.${k}`]).toBeTruthy();
        expect(cat[`account.share.${k}`]).not.toMatch(/\u2014/);
      }
    expect(en['account.share.practiced']).toMatch(/nothing was shared/);
  }, 30_000);

  it('no em dash in any text added for M11D.6', () => {
    const keys = Object.keys(en).filter((k) => /^(identity\.(practice|restore\.(continue|later|welcome)|working\.rehearsal|consent\.keepAccount|problem\.partial)|account\.(share|blobbiPracticed|blobbiPending)|title\.restored)/.test(k));
    expect(keys.length).toBeGreaterThan(15);
    for (const cat of [en, ptBR, es] as Record<string, string>[]) for (const k of keys) expect(cat[k], k).not.toMatch(/\u2014/);
  });
});
