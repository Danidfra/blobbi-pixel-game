// PX-I1, A PROFILE IS NEVER BUILT FROM SCRATCH OVER ONE THAT MAY EXIST. The bug: a guest identity restored from a
// backup (a Recovery Key nsec, or a Protected Key file whose Blobbis come back with no local run) was treated like a
// key generated on this device a moment ago. Registering a Blobbi then skipped the "every secondary relay answered"
// guard: one answering relay (the young, empty primary) was enough, and a from-scratch kind 11125 profile replaced the
// real one everywhere (`has`, `current_companion`, onboarding lost).
//
// Here, with in-memory relays named like the real ones (nothing reaches a network; every key is disposable): a
// restored identity, an existing Nostr account and an identity that already shared a Blobbi each need a COMPLETE
// read before a profile is built from scratch, and a profile that exists is always built over, never reset.
import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from 'nostr-tools/pure';
import { nsecEncode } from 'nostr-tools/nip19';
import { getCanonicalBlobbiD } from '@blobbi-kit/core';
import { memoryStore } from '../src/game/persistence';
import { guestBlobbi, readGuestBlobbis, updateGuestBlobbi } from '../src/game/guest-blobbis';
import { activationRun } from '../src/nostr/activation';
import { profileTemplate, type EventTemplate } from '../src/nostr/canonical-events';
import { IdentityService } from '../src/nostr/identity';
import { KeyVault, memoryVaultBackend } from '../src/nostr/keystore';
import { memoryRelay, relayGroup, type Publisher } from '../src/nostr/publisher';
import { PRIMARY_RELAY, PUBLISH_RELAYS, SECONDARY_RELAYS } from '../src/nostr/relay-config';

const [DITTO] = SECONDARY_RELAYS;
const PASSWORD = 'bubbles and stars';
const NOW = 1_770_000_000_000;
const noSleep = async () => {};

/** The game's relays in memory, each one possibly down (it never answers a query and takes nothing). */
function network() {
  const down = new Set<string>();
  const members = PUBLISH_RELAYS.map((url) => memoryRelay({ url, mode: 'live', down: () => down.has(url) }));
  const on = (url: string) => members[PUBLISH_RELAYS.indexOf(url)];
  return {
    down,
    on,
    group: relayGroup(members, 'live'),
    sent: () => members.flatMap((m) => m.sent),
    seed: (e: NostrEvent, urls: readonly string[]) => urls.forEach((u) => on(u).events.push(e)),
    profiles: (url: string) => on(url).events.filter((e) => e.kind === 11125),
  };
}

/** A disposable Nostr key with a profile another Blobbi app wrote (it lists Blobbi `old` and says onboarding is done). */
function player() {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const d = (petId: string) => getCanonicalBlobbiD(pk, petId);
  const sign = async (t: EventTemplate) => finalizeEvent(t, sk);
  const built = profileTemplate(pk, d('0ld0ld0ld0'), 1_700_000_000, null);
  const profile = finalizeEvent({ ...built, tags: [...built.tags.map((t) => (t[0] === 'blobbi_onboarding_done' ? [t[0], 'true'] : t)), ['xp', '420']] }, sk);
  return { sk, pk, d, sign, profile, nsec: nsecEncode(sk) };
}

/** One browser's identity service. Given another's `store` and `vault`, it is a later visit of the same browser. */
function browser(publisher: Publisher, o: { accountSigner?: (t: EventTemplate) => Promise<NostrEvent>; store?: ReturnType<typeof memoryStore>; vault?: KeyVault } = {}) {
  const store = o.store ?? memoryStore();
  const vault = o.vault ?? new KeyVault(memoryVaultBackend());
  let t = NOW;
  const svc = new IdentityService({ store, vault, publisher, accountSigner: o.accountSigner, now: () => (t += 1000), sleep: noSleep });
  return { store, vault, svc };
}

/** A new hatched Blobbi of an identity this browser's vault keeps (as `main.ts` reserves one for a vault account). */
async function hatchUnder(b: ReturnType<typeof browser>, owner: string) {
  const r = await b.svc.reserve({ kind: 'vault', pubkey: owner }, 'island-1');
  if (!r.ok) throw new Error(r.problem);
  updateGuestBlobbi(b.store, r.value.d, { born: true });
  return guestBlobbi(b.store, r.value.d)!;
}

const hasOf = (e: NostrEvent) => e.tags.filter((t) => t[0] === 'has').map((t) => t[1]);
const tag = (e: NostrEvent, name: string) => e.tags.find((t) => t[0] === name)?.[1];
/** The secondaries are silent; only the (empty) primary answers. */
const onlyPrimary = (net: ReturnType<typeof network>) => SECONDARY_RELAYS.forEach((u) => net.down.add(u));

describe('PX-I1: a guest restored from a backup never publishes a profile from scratch on an incomplete read', () => {
  it('a raw Recovery Key (nsec) of a key with a profile out there, only the primary answering: unreachable, nothing signed or sent', async () => {
    const p = player();
    const net = network();
    net.seed(p.profile, SECONDARY_RELAYS);
    const b = browser(net.group);
    expect((await b.svc.restoreBackup(p.nsec, '')).ok).toBe(true);
    expect((await b.vault.identity(p.pk))?.origin).toBe('restored');
    const fresh = await hatchUnder(b, p.pk);
    onlyPrimary(net);
    expect(await b.svc.register(fresh.d, true)).toEqual({ ok: false, problem: 'unreachable' });
    expect(net.sent()).toEqual([]);
    expect(activationRun(b.store, fresh.d, 'live')).toMatchObject({ blobbi: null, profile: null, lastProblem: 'unreachable' }); // nothing signed
    expect(guestBlobbi(b.store, fresh.d)?.activatedAt).toBeNull();
    // The relays answer again: the profile is built OVER the real one, which keeps everything it said.
    net.down.clear();
    const done = await b.svc.register(fresh.d, true);
    expect(done).toMatchObject({ ok: true, value: { stage: 'done' } });
    const now = activationRun(b.store, fresh.d, 'live')!.profile!;
    expect(hasOf(now)).toEqual(expect.arrayContaining([p.d('0ld0ld0ld0'), fresh.d]));
    expect(tag(now, 'blobbi_onboarding_done')).toBe('true');
    expect(tag(now, 'xp')).toBe('420');
    for (const url of SECONDARY_RELAYS) expect(net.profiles(url).map((e) => e.id), url).toEqual([now.id]);
  }, 30_000);

  it('a Protected Key file whose Blobbi comes back with no local run (activatedAt null): the same Blobbi is never re-registered over an unseen profile', async () => {
    const net = network();
    // The first browser: a fresh guest shares its Blobbi while the primary is down (the secondaries hold it, the
    // primary never saw it), then saves its Protected Key.
    net.down.add(PRIMARY_RELAY);
    const first = browser(net.group);
    const r = await first.svc.reserve({ kind: 'guest' }, 'island-1');
    if (!r.ok) throw new Error(r.problem);
    updateGuestBlobbi(first.store, r.value.d, { born: true });
    const file = await first.svc.makeBackup(r.value.owner, PASSWORD, ['Backup']);
    if (!file.ok) throw new Error(file.problem);
    expect((await first.svc.verifyBackup(r.value.owner, file.value.text, PASSWORD)).ok).toBe(true);
    expect((await first.svc.register(r.value.d, true)).ok).toBe(true);
    const shared = net.profiles(DITTO)[0];
    expect(hasOf(shared)).toEqual([r.value.d]);
    expect(net.on(PRIMARY_RELAY).events).toEqual([]);
    net.down.clear();
    // Another browser restores the file; the look for shared Blobbis was skipped (CONTINUE WITHOUT THEM).
    const second = browser(net.group);
    expect((await second.svc.restoreBackup(file.value.text, PASSWORD)).ok).toBe(true);
    const back = guestBlobbi(second.store, r.value.d)!;
    expect(back).toMatchObject({ owner: r.value.owner, born: true, activatedAt: null });
    expect(activationRun(second.store, back.d)).toBeNull();
    onlyPrimary(net);
    const before = net.sent().length;
    expect(await second.svc.register(back.d, true)).toEqual({ ok: false, problem: 'unreachable' });
    expect(net.sent().length).toBe(before);
    // A NEW Blobbi of that restored identity is held back the same way.
    const tofu = await hatchUnder(second, r.value.owner);
    expect(await second.svc.register(tofu.d, true)).toEqual({ ok: false, problem: 'unreachable' });
    expect(net.sent().length).toBe(before);
    for (const url of SECONDARY_RELAYS) expect(net.profiles(url).map((e) => e.id), url).toEqual([shared.id]);
  }, 30_000);

  it('one secondary silent is enough to hold it back (the primary and the other secondaries empty of the profile)', async () => {
    const p = player();
    const net = network();
    net.seed(p.profile, [DITTO]); // only relay.ditto.pub holds the profile, and it is the one that is down
    const b = browser(net.group);
    expect((await b.svc.restoreBackup(p.nsec, '')).ok).toBe(true);
    const fresh = await hatchUnder(b, p.pk);
    net.down.add(DITTO);
    expect(await b.svc.register(fresh.d, true)).toEqual({ ok: false, problem: 'unreachable' });
    expect(net.sent()).toEqual([]);
  }, 30_000);

  it('a restored key with genuinely no profile, after a COMPLETE read (every secondary answered): one is created', async () => {
    const p = player(); // its profile is never seeded: nobody ever used this key for a Blobbi
    const net = network();
    net.down.add(PRIMARY_RELAY); // the primary is never needed for "nothing there"
    const b = browser(net.group);
    expect((await b.svc.restoreBackup(p.nsec, '')).ok).toBe(true);
    const fresh = await hatchUnder(b, p.pk);
    expect(await b.svc.register(fresh.d, true)).toMatchObject({ ok: true, value: { stage: 'done' } });
    const made = activationRun(b.store, fresh.d, 'live')!.profile!;
    expect(hasOf(made)).toEqual([fresh.d]);
    expect(tag(made, 'current_companion')).toBe(fresh.d);
    for (const url of SECONDARY_RELAYS) expect(net.profiles(url).map((e) => e.id), url).toEqual([made.id]);
  }, 30_000);
});

describe('PX-I1: an existing Nostr account (browser extension) is never overwritten from an incomplete read', () => {
  it('only the primary answers: unreachable, nothing signed, the profile untouched; complete again: built over it', async () => {
    const p = player();
    const net = network();
    net.seed(p.profile, SECONDARY_RELAYS);
    let signed = 0;
    const b = browser(net.group, { accountSigner: async (t) => (signed++, p.sign(t)) });
    const r = await b.svc.reserve({ kind: 'account', pubkey: p.pk }, 'island-1');
    if (!r.ok) throw new Error(r.problem);
    updateGuestBlobbi(b.store, r.value.d, { born: true });
    onlyPrimary(net);
    expect(await b.svc.register(r.value.d, true)).toEqual({ ok: false, problem: 'unreachable' });
    expect(signed).toBe(0);
    expect(net.sent()).toEqual([]);
    net.down.clear();
    expect(await b.svc.register(r.value.d, true)).toMatchObject({ ok: true, value: { stage: 'done' } });
    const now = activationRun(b.store, r.value.d, 'live')!.profile!;
    expect(hasOf(now)).toEqual(expect.arrayContaining([p.d('0ld0ld0ld0'), r.value.d]));
    expect(tag(now, 'xp')).toBe('420');
  }, 30_000);
});

describe('PX-I1: moving between identities carries the profile, never resets it', () => {
  it('a guest that shared a Blobbi becomes the saved account; a later visit registers a second one over the same profile', async () => {
    const net = network();
    const first = browser(net.group);
    const r = await first.svc.reserve({ kind: 'guest' }, 'island-1');
    if (!r.ok) throw new Error(r.problem);
    updateGuestBlobbi(first.store, r.value.d, { born: true });
    const file = await first.svc.makeBackup(r.value.owner, PASSWORD, ['Backup']);
    if (!file.ok) throw new Error(file.problem);
    expect((await first.svc.verifyBackup(r.value.owner, file.value.text, PASSWORD)).ok).toBe(true);
    expect((await first.svc.register(r.value.d, true)).ok).toBe(true);
    const owner = r.value.owner;
    // Another Blobbi app then adds to that profile (a newer revision with a tag of its own).
    const ours = net.profiles(DITTO)[0];
    const theirs = await first.vault.sign(owner, { kind: 11125, created_at: ours.created_at + 60, tags: [...ours.tags, ['xp', '7']], content: ours.content });
    for (const url of SECONDARY_RELAYS) net.on(url).events.splice(net.on(url).events.indexOf(ours), 1, theirs);
    // A later visit of the same browser (a reload): the identity is now the saved account, and hatches Tofu.
    const later = browser(net.group, { store: first.store, vault: first.vault });
    const tofu = await hatchUnder(later, owner);
    onlyPrimary(net);
    expect(await later.svc.register(tofu.d, true)).toEqual({ ok: false, problem: 'unreachable' }); // it has a profile: never from scratch
    net.down.clear();
    expect(await later.svc.register(tofu.d, true)).toMatchObject({ ok: true, value: { stage: 'done' } });
    const now = activationRun(later.store, tofu.d, 'live')!.profile!;
    expect(hasOf(now)).toEqual(expect.arrayContaining([r.value.d, tofu.d]));
    expect(tag(now, 'xp')).toBe('7');
    expect(now.created_at).toBeGreaterThan(theirs.created_at);
  }, 30_000);

  it('a key change (the player starts a new guest identity): the old identity\'s profile is never written, the new one is its own', async () => {
    const p = player();
    const net = network();
    net.seed(p.profile, SECONDARY_RELAYS);
    const b = browser(net.group);
    expect((await b.svc.restoreBackup(p.nsec, '')).ok).toBe(true);
    // NEW ADVENTURE under a brand-new identity (generated here, nothing shared under it yet).
    const r = await b.svc.reserve({ kind: 'guest' }, 'island-2');
    if (!r.ok) throw new Error(r.problem);
    expect(r.value.owner).not.toBe(p.pk);
    expect((await b.vault.identity(r.value.owner))?.origin).toBe('generated');
    updateGuestBlobbi(b.store, r.value.d, { born: true });
    const file = await b.svc.makeBackup(r.value.owner, PASSWORD, ['Backup']);
    if (!file.ok) throw new Error(file.problem);
    expect((await b.svc.verifyBackup(r.value.owner, file.value.text, PASSWORD)).ok).toBe(true);
    expect(await b.svc.register(r.value.d, true)).toMatchObject({ ok: true, value: { stage: 'done' } });
    expect(net.sent().filter((e) => e.pubkey === p.pk)).toEqual([]);
    for (const url of SECONDARY_RELAYS) expect(net.profiles(url).find((e) => e.pubkey === p.pk)?.id, url).toBe(p.profile.id);
    expect(readGuestBlobbis(b.store).filter((x) => x.owner === p.pk)).toEqual([]);
  }, 30_000);
});
