/**
 * THE PRIMARY RELAY (wss://relay.blobbi.pet) beside the relays the game always used: it is asked and written to
 * first, and it is never a gate. Down, slow, empty or refusing (its write list answers `blocked:`), it holds nothing
 * back and decides nothing alone; what the other relays hold is carried to it, and what only it holds to them, with
 * the limits every carried event keeps. Everything here runs on in-memory relays: nothing leaves the test.
 */
import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent, type NostrEvent } from 'nostr-tools/pure';
import { BLOBBI_WORLD_TRAVEL_RELAYS, WORLD_PIXEL, buildWorldLocationTemplate, createWorldTravel, getCanonicalBlobbiD } from '@blobbi-kit/core';
import { memoryStore } from '../src/game/persistence';
import { guestBlobbi, updateGuestBlobbi } from '../src/game/guest-blobbis';
import { activate, activationRun, ActivationError, spreadRegistration } from '../src/nostr/activation';
import { babyStateTemplate, companionProfileTemplate, profileTemplate } from '../src/nostr/canonical-events';
import { pendingShare, shareCompanion, spreadCompanionShares } from '../src/nostr/companion-share';
import { resolveCurrentBlobbi } from '../src/nostr/current-blobbi';
import { IdentityService } from '../src/nostr/identity';
import { KeyVault, memoryVaultBackend } from '../src/nostr/keystore';
import { memoryRelay, relayGroup, type Publisher } from '../src/nostr/publisher';
import { PRIMARY_RELAY, PROFILE_REQUIRED_RELAYS, PUBLISH_RELAYS, READ_RELAYS, SECONDARY_RELAYS, emptyIsKnown, permanentRefusal, primaryStanding } from '../src/nostr/relay-config';
import { RELAY_SYNC_KEY, SYNC_MAX_EVENTS, syncOwnEvents } from '../src/nostr/relay-sync';
import { SYNC_CONSENT_KEY, SYNC_DESTINATIONS, setSyncChoice, syncChoice, syncConsent } from '../src/nostr/sync-consent';
import { queryRelays, relayBlobbiReader, relayBlobbonautReader, type RelayConnection } from '../src/nostr/relays';
import { PIXEL_TRAVEL_RELAYS, pixelTravelRelays, type TravelConnection } from '../src/nostr/world-travel';

const [DITTO, PRIMAL, DREAMITH] = SECONDARY_RELAYS;
const noSleep = async () => {};
const PASSWORD = 'bubbles and stars';

type Faults = { down?: Set<string>; refuse?: Set<string>; forget?: Set<string> };
/** The four relays of the game in memory, named like the real ones, each with its faults. */
function network(faults: Faults = {}) {
  const members = PUBLISH_RELAYS.map((url) => memoryRelay({ url, mode: 'live', down: () => !!faults.down?.has(url), refuse: () => !!faults.refuse?.has(url), forget: () => !!faults.forget?.has(url) }));
  const on = (url: string) => members[PUBLISH_RELAYS.indexOf(url)];
  return { members, on, faults, group: relayGroup(members, 'live'), seed: (e: NostrEvent, urls: readonly string[] = PUBLISH_RELAYS) => urls.forEach((u) => on(u).events.push(e)) };
}
const sentTo = (net: ReturnType<typeof network>, url: string) => net.on(url).sent.map((e) => e.id);

function person() {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const d = (petId: string) => getCanonicalBlobbiD(pk, petId);
  return {
    sk,
    pk,
    d,
    sign: async (t: Parameters<typeof finalizeEvent>[0]) => finalizeEvent(t, sk),
    blobbi: (petId: string, at: number, name = 'Pudding') => finalizeEvent(babyStateTemplate({ owner: pk, petId, name, bornAt: at }, at), sk),
    profile: (petId: string, at: number, over: NostrEvent | null = null) => finalizeEvent(profileTemplate(pk, d(petId), at, over), sk),
  };
}
const facts = (p: ReturnType<typeof person>, petId: string) => ({ owner: p.pk, petId, name: 'Pudding', bornAt: 1_770_000_000 });
const NOW = 1_770_000_000_000;

/** The account turned copies of its existing events on, for every relay of the game (as SETTINGS > ACCOUNT does). */
function agreed(store: ReturnType<typeof memoryStore>, pubkey: string) {
  setSyncChoice(store, pubkey, true, () => NOW);
  return syncConsent(store, () => NOW);
}

/** An identity service; given another's `store` and `vault`, it is a LATER VISIT of the same browser (a reload). */
function service(publisher: Publisher, account: () => string | null = () => null, kept: { store?: ReturnType<typeof memoryStore>; vault?: KeyVault } = {}) {
  const store = kept.store ?? memoryStore();
  const vault = kept.vault ?? new KeyVault(memoryVaultBackend());
  let t = NOW;
  const svc = new IdentityService({ store, vault, publisher, now: () => (t += 1000), currentAccount: account, sleep: noSleep });
  return { store, vault, svc, advance: (ms: number) => (t += ms) };
}
async function readyGuest(s: ReturnType<typeof service>) {
  const r = await s.svc.reserve({ kind: 'guest' }, 'island-1');
  if (!r.ok) throw new Error(r.problem);
  updateGuestBlobbi(s.store, r.value.d, { born: true });
  const file = await s.svc.makeBackup(r.value.owner, PASSWORD, ['Backup']);
  if (!file.ok) throw new Error(file.problem);
  expect((await s.svc.verifyBackup(r.value.owner, file.value.text, PASSWORD)).ok).toBe(true);
  return guestBlobbi(s.store, r.value.d)!;
}

describe('the relay lists: the primary first, the secondaries kept, the census unchanged', () => {
  it('the Blobbi relay leads every list; the profile census still asks only the two relays every app writes to', () => {
    expect(PUBLISH_RELAYS[0]).toBe('wss://relay.blobbi.pet');
    expect(READ_RELAYS[0]).toBe(PRIMARY_RELAY);
    expect(PUBLISH_RELAYS.slice(1)).toEqual([...SECONDARY_RELAYS]);
    expect(PROFILE_REQUIRED_RELAYS).toEqual([DITTO, PRIMAL]);
    expect(PROFILE_REQUIRED_RELAYS).not.toContain(PRIMARY_RELAY); // the primary never gates a profile write
    expect(PIXEL_TRAVEL_RELAYS).toEqual([PRIMARY_RELAY, ...BLOBBI_WORLD_TRAVEL_RELAYS]);
  });

  it('"nothing found" is a fact only once every secondary answered: never from the primary alone, never waiting for it', () => {
    expect(emptyIsKnown(PUBLISH_RELAYS, { reachable: 1, answered: [PRIMARY_RELAY] })).toBe(false); // empty and alone
    expect(emptyIsKnown(PUBLISH_RELAYS, { reachable: 3, answered: [PRIMARY_RELAY, DITTO, PRIMAL] })).toBe(false); // a secondary silent
    expect(emptyIsKnown(PUBLISH_RELAYS, { reachable: 3, answered: [...SECONDARY_RELAYS] })).toBe(true); // the primary down
    expect(emptyIsKnown(PUBLISH_RELAYS, { reachable: 4, answered: [...PUBLISH_RELAYS] })).toBe(true);
    expect(emptyIsKnown([PRIMARY_RELAY], { reachable: 1, answered: [PRIMARY_RELAY] })).toBe(true); // a set with no secondary
    // A reader that cannot say which relays answered is believed only when all did.
    expect(emptyIsKnown(PUBLISH_RELAYS, { reachable: 3 })).toBe(false);
    expect(emptyIsKnown(PUBLISH_RELAYS, { reachable: 4 })).toBe(true);
  });

  it('the write list of the primary (`blocked`) is a refusal for good; a share through the secondaries has a standing, not a problem', () => {
    expect(permanentRefusal('blocked')).toBe(true);
    expect(['timeout', 'rate-limited', 'error', 'refused', 'replaced', 'duplicate'].some(permanentRefusal)).toBe(false);
    expect(primaryStanding(PUBLISH_RELAYS, [DITTO], [])).toBe('pending');
    expect(primaryStanding(PUBLISH_RELAYS, [DITTO], [PRIMARY_RELAY])).toBe('refused');
    expect(primaryStanding(PUBLISH_RELAYS, [PRIMARY_RELAY, DITTO], [])).toBe('held');
    expect(primaryStanding(PUBLISH_RELAYS, [], [PRIMARY_RELAY])).toBeUndefined(); // nothing delivered: that is a failure, told elsewhere
    expect(primaryStanding(SECONDARY_RELAYS, [DITTO], [])).toBeUndefined(); // a set without the primary
  });
});

describe('first registration: the primary never holds it back and never decides alone', () => {
  const deps = (p: ReturnType<typeof person>, net: ReturnType<typeof network>, store = memoryStore()) => ({ store, publisher: net.group, sign: p.sign, now: () => NOW, sleep: noSleep });

  it('the primary DOWN: an account with no profile anywhere registers on the first try (every secondary answered)', async () => {
    const p = person();
    const net = network({ down: new Set([PRIMARY_RELAY]) });
    const run = await activate({ facts: facts(p, 'aaaaaaaaaa'), consent: true, backupVerified: true, ownerKind: 'account', mayHaveProfile: true }, deps(p, net));
    expect(run.stage).toBe('confirmed');
    expect(run.seenOn!.blobbi.sort()).toEqual([...SECONDARY_RELAYS].sort());
    expect(net.on(DITTO).events.map((e) => e.kind).sort()).toEqual([11125, 31124]);
    expect(net.on(PRIMARY_RELAY).events).toEqual([]);
  });

  it('the primary answering EMPTY while a secondary is silent: "no profile" is not concluded (nothing signed, nothing sent)', async () => {
    const p = person();
    const net = network({ down: new Set([PRIMAL]) });
    let signed = 0;
    const attempt = activate({ facts: facts(p, 'aaaaaaaaaa'), consent: true, backupVerified: true, ownerKind: 'account', mayHaveProfile: true }, { ...deps(p, net), sign: async (t) => (signed++, p.sign(t)) });
    await expect(attempt).rejects.toMatchObject({ problem: 'unreachable' });
    await expect(attempt).rejects.toBeInstanceOf(ActivationError);
    expect(signed).toBe(0);
    expect(net.members.flatMap((m) => m.sent)).toEqual([]);
  });

  it('a profile only the secondaries hold is built OVER (never from scratch), whatever the empty primary says', async () => {
    const p = person();
    const net = network();
    const existing = p.profile('bbbbbbbbbb', 1_700_000_000);
    net.seed(existing, [DITTO, PRIMAL]);
    const run = await activate({ facts: facts(p, 'aaaaaaaaaa'), consent: true, backupVerified: true, ownerKind: 'account', mayHaveProfile: true }, deps(p, net));
    const has = run.profile!.tags.filter((t) => t[0] === 'has').map((t) => t[1]);
    expect(has).toEqual(expect.arrayContaining([p.d('bbbbbbbbbb'), p.d('aaaaaaaaaa')]));
    expect(net.on(PRIMARY_RELAY).events.map((e) => e.id).sort()).toEqual([run.blobbi!.id, run.profile!.id].sort()); // the primary got both
  });

  it('the required census is intact: relay.ditto.pub silent with a profile elsewhere still stops the write', async () => {
    const p = person();
    const net = network({ down: new Set([DITTO]) });
    net.seed(p.profile('bbbbbbbbbb', 1_700_000_000), [PRIMARY_RELAY, PRIMAL]);
    await expect(activate({ facts: facts(p, 'aaaaaaaaaa'), consent: true, backupVerified: true, ownerKind: 'account', mayHaveProfile: true }, deps(p, net))).rejects.toMatchObject({ problem: 'unreachable' });
    expect(net.members.flatMap((m) => m.sent)).toEqual([]);
  });

  it('the primary REFUSING (its write list): registered through the secondaries; refused is a visible state, and it is never sent again', async () => {
    const net = network({ refuse: new Set([PRIMARY_RELAY]), down: new Set([DREAMITH]) });
    const s = service(net.group);
    const b = await readyGuest(s);
    const res = await s.svc.register(b.d, true);
    expect(res).toMatchObject({ ok: true, value: { stage: 'done', heldBy: 2, owed: 1, primary: 'refused', problem: null } }); // only dreamith is owed
    expect(await s.svc.shareStatus(b.d)).toBe('spreading'); // dreamith was down: it gets it by itself
    const once = sentTo(net, PRIMARY_RELAY);
    // Offered the Blobbi once; refused for good, it is not owed the profile that points at it either.
    expect(once).toEqual([activationRun(s.store, b.d, 'live')!.blobbi!.id]);
    net.faults.down!.clear();
    for (let i = 0; i < 4; i++) await s.svc.spreadAll();
    expect(sentTo(net, PRIMARY_RELAY)).toEqual(once); // the refusal ended the deliveries to the primary...
    expect(net.on(DREAMITH).events.map((e) => e.kind).sort()).toEqual([11125, 31124]); // ...and to no other relay
    expect(s.svc.registration(b.d)).toMatchObject({ owed: 0, primary: 'refused' });
    expect(await s.svc.shareStatus(b.d)).toBe('sharedElsewhere');
  }, 30_000);

  it('the primary SILENT at the share: pending (not a failure), and it receives the very same events once it answers', async () => {
    const net = network({ down: new Set([PRIMARY_RELAY]) });
    const s = service(net.group);
    const b = await readyGuest(s);
    expect(await s.svc.register(b.d, true)).toMatchObject({ ok: true, value: { stage: 'done', owed: 1, primary: 'pending' } });
    expect(await s.svc.shareStatus(b.d)).toBe('spreading');
    net.faults.down!.clear();
    expect(await s.svc.spreadAll()).toBe(0);
    expect(net.on(PRIMARY_RELAY).events.map((e) => e.id).sort()).toEqual(net.on(DITTO).events.map((e) => e.id).sort());
    expect(s.svc.registration(b.d)).toMatchObject({ owed: 0, primary: 'held' });
    expect(await s.svc.shareStatus(b.d)).toBe('shared');
  }, 30_000);

  it('every relay refusing is still the failure it was (the primary is no exception), and TRY AGAIN asks every relay again', async () => {
    const refuse = new Set(PUBLISH_RELAYS);
    const net = network({ refuse });
    const s = service(net.group);
    const b = await readyGuest(s);
    expect(await s.svc.register(b.d, true)).toEqual({ ok: false, problem: 'publish-failed' });
    refuse.clear();
    expect((await s.svc.register(b.d, true)).ok).toBe(true);
    expect(net.on(PRIMARY_RELAY).events.map((e) => e.kind).sort()).toEqual([11125, 31124]);
  }, 30_000);
});

describe('the deliveries owed after a share keep the limits', () => {
  async function shared(net: ReturnType<typeof network>) {
    const p = person();
    const store = memoryStore();
    const run = await activate({ facts: facts(p, 'aaaaaaaaaa'), consent: true, backupVerified: true, ownerKind: 'guest' }, { store, publisher: net.group, sign: p.sign, now: () => NOW, sleep: noSleep });
    return { p, store, run, d: run.d };
  }

  it('a relay that does not ANSWER the look is not sent anything (its absence there is unknown); it stays owed', async () => {
    const net = network({ down: new Set([PRIMARY_RELAY]) });
    const { store, d } = await shared(net);
    const before = sentTo(net, PRIMARY_RELAY);
    expect(await spreadRegistration(store, d, { publisher: net.group, allow: () => true, now: () => NOW, sleep: noSleep })).toEqual([PRIMARY_RELAY]);
    expect(sentTo(net, PRIMARY_RELAY)).toEqual(before);
  });

  it('a Blobbi revised since (another app) is never sent in its OLD revision to a relay that lacks it', async () => {
    const net = network({ down: new Set([PRIMARY_RELAY]) });
    const { p, store, run, d } = await shared(net);
    const revised = p.blobbi('aaaaaaaaaa', run.blobbi!.created_at + 600, 'Pudding the Second');
    for (const url of SECONDARY_RELAYS) await net.on(url).publish(revised, 1000);
    net.faults.down!.clear();
    const tried = net.on(PRIMARY_RELAY).sent.length; // the share itself tried the primary while it was down
    const left = await spreadRegistration(store, d, { publisher: net.group, allow: () => true, now: () => NOW, sleep: noSleep });
    expect(activationRun(store, d, 'live')!.spread).toMatchObject({ blobbiSuperseded: true });
    expect(net.on(PRIMARY_RELAY).sent.slice(tried).map((e) => e.id)).toEqual([run.profile!.id]); // the profile only
    expect(net.on(PRIMARY_RELAY).events.some((e) => e.id === run.blobbi!.id)).toBe(false);
    expect(left).toEqual([]); // the profile reached the primary; the old state is owed to nobody
    // The winning revision is what the primary is given (the read-side carry).
    await syncOwnEvents(p.pk, { store, publisher: net.group, consent: agreed(store, p.pk), now: () => NOW });
    expect(net.on(PRIMARY_RELAY).events.find((e) => e.kind === 31124)!.id).toBe(revised.id);
  });
});

describe('sharing the companion: the primary is one more relay, never the gate', () => {
  function shareSetup(net: ReturnType<typeof network>) {
    const p = person();
    const store = memoryStore();
    const base = p.profile('aaaaaaaaaa', 1_700_000_000);
    const both = finalizeEvent(companionProfileTemplate(p.pk, p.d('aaaaaaaaaa'), 1_700_000_100, { ...p.profile('bbbbbbbbbb', 1_700_000_050, base) }), p.sk);
    const req = { owner: p.pk, d: p.d('bbbbbbbbbb'), at: NOW, over: null };
    const deps = { store, publisher: net.group, sign: p.sign, stillAccount: () => true, now: () => NOW, sleep: noSleep };
    return { p, store, both, req, deps };
  }

  it('the primary down or empty: the choice is shared over the secondaries\' profile; the primary is pending', async () => {
    const net = network({ down: new Set([PRIMARY_RELAY]) });
    const s = shareSetup(net);
    net.seed(s.both, SECONDARY_RELAYS);
    const out = await shareCompanion(s.req, s.deps);
    expect(out).toMatchObject({ kind: 'shared', primary: 'pending' });
    expect(pendingShare(s.store, s.p.pk, s.req.d)).toMatchObject({ delivered: true });
    net.faults.down!.clear();
    expect(await spreadCompanionShares(s.store, net.group, { allow: () => true, sleep: noSleep })).toBe(0);
    expect(net.on(PRIMARY_RELAY).events.map((e) => e.id)).toEqual([(out as { event: NostrEvent }).event.id]);
  });

  it('the primary refusing: shared, standing `refused`, nothing left owed, and never sent to it again', async () => {
    const net = network({ refuse: new Set([PRIMARY_RELAY]) });
    const s = shareSetup(net);
    net.seed(s.both, SECONDARY_RELAYS);
    expect(await shareCompanion(s.req, s.deps)).toMatchObject({ kind: 'shared', primary: 'refused' });
    expect(pendingShare(s.store, s.p.pk, s.req.d)).toBeNull(); // every relay holds it or refused it for good
    const once = sentTo(net, PRIMARY_RELAY);
    expect(once).toHaveLength(1);
    expect(await spreadCompanionShares(s.store, net.group, { allow: () => true, sleep: noSleep })).toBe(0);
    expect(sentTo(net, PRIMARY_RELAY)).toEqual(once);
  });

  it('only the primary answered: nothing is built (the census needs the two profile relays), and nothing is signed', async () => {
    const net = network({ down: new Set(SECONDARY_RELAYS) });
    const s = shareSetup(net);
    net.seed(s.both, [PRIMARY_RELAY]);
    let signed = 0;
    expect(await shareCompanion(s.req, { ...s.deps, sign: async (t) => (signed++, s.p.sign(t)) })).toEqual({ kind: 'unsafe' });
    expect(signed).toBe(0);
  });
});

describe('carrying the player\'s own events between the relays (relay-sync)', () => {
  const round = (p: ReturnType<typeof person>, net: ReturnType<typeof network>, store = memoryStore(), now = () => NOW) => syncOwnEvents(p.pk, { store, publisher: net.group, consent: agreed(store, p.pk), now });

  it('found only on the secondaries: the ORIGINAL events reach the primary (same id, same signature), once', async () => {
    const p = person();
    const net = network();
    const blobbi = p.blobbi('aaaaaaaaaa', 1_700_000_000);
    const profile = p.profile('aaaaaaaaaa', 1_700_000_010);
    net.seed(blobbi, SECONDARY_RELAYS);
    net.seed(profile, SECONDARY_RELAYS);
    const store = memoryStore();
    expect(await round(p, net, store)).toEqual({ carried: 2, pending: 0 });
    expect(net.on(PRIMARY_RELAY).events.map((e) => [e.id, e.sig]).sort()).toEqual([blobbi, profile].map((e) => [e.id, e.sig]).sort());
    expect(net.on(PRIMARY_RELAY).events.every((e) => verifyEvent(e))).toBe(true);
    for (const url of SECONDARY_RELAYS) expect(net.on(url).sent).toEqual([]); // they had them: nothing is sent where it is held
    const sent = net.members.map((m) => m.sent.length);
    expect(await round(p, net, store)).toEqual({ carried: 0, pending: 0 });
    expect(net.members.map((m) => m.sent.length)).toEqual(sent); // a second look sends nothing
  });

  it('found only on the primary: carried to every secondary', async () => {
    const p = person();
    const net = network();
    const blobbi = p.blobbi('aaaaaaaaaa', 1_700_000_000);
    net.seed(blobbi, [PRIMARY_RELAY]);
    expect((await round(p, net)).carried).toBe(3);
    for (const url of SECONDARY_RELAYS) expect(net.on(url).events.map((e) => e.id)).toEqual([blobbi.id]);
    expect(net.on(PRIMARY_RELAY).sent).toEqual([]);
  });

  it('only the WINNING revision is carried, and a relay holding an older one is given it', async () => {
    const p = person();
    const net = network();
    const older = p.profile('aaaaaaaaaa', 1_700_000_000);
    const newer = p.profile('bbbbbbbbbb', 1_700_000_100, older);
    net.seed(older, [DITTO]);
    net.seed(newer, [PRIMAL]);
    await round(p, net);
    for (const url of PUBLISH_RELAYS) expect(net.on(url).events.map((e) => e.id), url).toEqual([newer.id]);
    expect(net.members.flatMap((m) => m.sent).some((e) => e.id === older.id)).toBe(false); // the old revision travels nowhere
  });

  it('a silent relay is left alone (its absence is unknown), and so is a relay whose answer may be cut off', async () => {
    const p = person();
    const net = network({ down: new Set([PRIMARY_RELAY]) });
    net.seed(p.blobbi('aaaaaaaaaa', 1_700_000_000), [DITTO]);
    await round(p, net);
    expect(net.on(PRIMARY_RELAY).sent).toEqual([]); // not even tried: nothing is known of it
    expect(net.on(PRIMAL).events).toHaveLength(1);
    // An answer as long as the filter's limit may be truncated: nothing is concluded about that relay.
    const q = person();
    const full = network();
    for (let i = 0; i < 200; i++) full.on(DITTO).events.push({ ...q.blobbi('aaaaaaaaaa', 1_700_000_000), id: i.toString(16).padStart(64, '0'), tags: [['d', `x${i}`], ['b', 'blobbi:ecosystem:v1']] });
    const real = q.blobbi('bbbbbbbbbb', 1_700_000_000);
    full.seed(real, [PRIMARY_RELAY]);
    await round(q, full);
    expect(full.on(DITTO).sent).toEqual([]);
    expect(full.on(PRIMAL).events.map((e) => e.id)).toEqual([real.id]); // a relay that answered in full and lacks it is given it
  });

  it('never another author\'s events, never the legacy profile, never an event the kit does not read as a Blobbi', async () => {
    const p = person();
    const other = person();
    const net = network();
    const theirs = other.blobbi('aaaaaaaaaa', 1_700_000_000);
    const legacy = finalizeEvent({ ...profileTemplate(p.pk, p.d('aaaaaaaaaa'), 1_700_000_000, null), kind: 31125 }, p.sk);
    const notBlobbi = finalizeEvent({ kind: 31124, created_at: 1_700_000_000, content: '', tags: [['d', 'something-else'], ['b', 'blobbi:ecosystem:v1']] }, p.sk);
    // A relay may answer with anything: each of these is on one relay only.
    net.on(DITTO).events.push(theirs, legacy, notBlobbi);
    expect(await round(p, net)).toEqual({ carried: 0, pending: 0 });
    expect(net.members.flatMap((m) => m.sent)).toEqual([]);
  });

  it('a forged copy (a bad signature) is never carried', async () => {
    const p = person();
    const net = network();
    const real = p.blobbi('aaaaaaaaaa', 1_700_000_000);
    net.on(DITTO).events.push({ ...(JSON.parse(JSON.stringify(real)) as NostrEvent), sig: '0'.repeat(128) }); // as off the wire
    await round(p, net);
    expect(net.members.flatMap((m) => m.sent)).toEqual([]);
  });

  it('an event its owner deleted (NIP-09) is not brought back; deletions that cannot be read leave everything where it is', async () => {
    const p = person();
    const net = network();
    const blobbi = p.blobbi('aaaaaaaaaa', 1_700_000_000);
    const deletion = finalizeEvent({ kind: 5, created_at: 1_700_000_500, content: '', tags: [['a', `31124:${p.pk}:${p.d('aaaaaaaaaa')}`]] }, p.sk);
    net.seed(blobbi, [PRIMAL]); // one relay never honoured the deletion
    net.seed(deletion, [DITTO]);
    expect(await round(p, net)).toEqual({ carried: 0, pending: 0 });
    expect(net.members.flatMap((m) => m.sent)).toEqual([]);
    // The deletions unreadable on a relay the plan rests on: undecided, nothing is sent this round.
    const q = person();
    const shy = network();
    shy.seed(q.blobbi('aaaaaaaaaa', 1_700_000_000), [PRIMAL]);
    const ask = shy.on(DITTO).query.bind(shy.on(DITTO));
    shy.on(DITTO).query = async (f, ms) => (f.kinds.includes(5) ? { events: [], reachable: 0, byRelay: { [DITTO]: null } } : ask(f, ms));
    expect(await round(q, shy)).toMatchObject({ carried: 0 });
    expect(shy.members.flatMap((m) => m.sent)).toEqual([]);
  });

  it('the primary\'s write list (`blocked`): offered once, then left alone, while the other relays are still served', async () => {
    const p = person();
    const net = network({ refuse: new Set([PRIMARY_RELAY]) });
    const blobbi = p.blobbi('aaaaaaaaaa', 1_700_000_000);
    net.seed(blobbi, [DITTO]);
    const store = memoryStore();
    let t = NOW;
    expect(await round(p, net, store, () => t)).toEqual({ carried: 2, pending: 0 }); // primal and dreamith took it
    expect(sentTo(net, PRIMARY_RELAY)).toEqual([blobbi.id]);
    for (let i = 0; i < 5; i++) {
      t += 10 * 60_000;
      await round(p, net, store, () => t);
    }
    expect(sentTo(net, PRIMARY_RELAY)).toEqual([blobbi.id]); // no loop: not offered again within hours
    expect(JSON.parse(store.get(RELAY_SYNC_KEY)!).entries[`${blobbi.id}@${PRIMARY_RELAY}`]).toMatchObject({ s: 'rejected', m: 'blocked' });
    // The write list may open: much later it is offered once more, and taken.
    net.faults.refuse!.clear();
    t += 7 * 60 * 60_000;
    expect(await round(p, net, store, () => t)).toEqual({ carried: 1, pending: 0 });
    expect(net.on(PRIMARY_RELAY).events.map((e) => e.id)).toEqual([blobbi.id]);
  });

  it('a relay that gives no verdict is tried again after a wait, three times in all, then no more', async () => {
    const p = person();
    const net = network();
    const blobbi = p.blobbi('aaaaaaaaaa', 1_700_000_000);
    net.seed(blobbi, SECONDARY_RELAYS);
    // The primary answers reads and never acknowledges a write.
    net.on(PRIMARY_RELAY).publish = async (event, _ms, only) => (only && !only.includes(PRIMARY_RELAY) ? [] : (net.on(PRIMARY_RELAY).sent.push(event), [{ relay: PRIMARY_RELAY, ok: false, reason: 'timeout' }]));
    const store = memoryStore();
    let t = NOW;
    expect(await round(p, net, store, () => t)).toEqual({ carried: 0, pending: 1 });
    await round(p, net, store, () => t); // at once: too soon
    expect(sentTo(net, PRIMARY_RELAY)).toHaveLength(1);
    for (let i = 0; i < 10; i++) {
      t += 10 * 60_000;
      await round(p, net, store, () => t);
    }
    expect(sentTo(net, PRIMARY_RELAY)).toHaveLength(3);
  });

  it('a round offers a bounded number of events; the rest follow in later rounds', async () => {
    const p = person();
    const net = network();
    const many = Array.from({ length: SYNC_MAX_EVENTS + 5 }, (_, i) => p.blobbi(i.toString(16).padStart(10, '0'), 1_700_000_000 + i));
    for (const e of many) net.seed(e, SECONDARY_RELAYS);
    const store = memoryStore();
    expect(await round(p, net, store)).toEqual({ carried: SYNC_MAX_EVENTS, pending: 5 });
    expect(await round(p, net, store)).toEqual({ carried: 5, pending: 0 });
    expect(net.on(PRIMARY_RELAY).events).toHaveLength(many.length);
  }, 30_000);

  it('a rehearsal build carries nothing; and only the CONNECTED account is ever compared (IdentityService.spreadAll)', async () => {
    const p = person();
    const net = network();
    const blobbi = p.blobbi('aaaaaaaaaa', 1_700_000_000);
    net.seed(blobbi, SECONDARY_RELAYS);
    expect(await syncOwnEvents(p.pk, { store: memoryStore(), publisher: relayGroup(net.members, 'rehearsal'), consent: agreed(memoryStore(), p.pk), now: () => NOW })).toEqual({ carried: 0, pending: 0 });
    expect(net.on(PRIMARY_RELAY).sent).toEqual([]);
    const nobody = service(net.group);
    expect(await nobody.svc.spreadAll()).toBe(0);
    expect(net.on(PRIMARY_RELAY).sent).toEqual([]); // no account connected: nothing is anyone's to carry
    const connected = service(net.group, () => p.pk);
    expect(await connected.svc.spreadAll()).toBe(0);
    expect(net.on(PRIMARY_RELAY).sent).toEqual([]); // connected, and it never said copies may be sent: nothing
    setSyncChoice(connected.store, p.pk, true);
    expect(await connected.svc.spreadAll()).toBe(0);
    expect(net.on(PRIMARY_RELAY).events.map((e) => e.id)).toEqual([blobbi.id]);
    const asked = net.on(DITTO).events.length;
    await connected.svc.spreadAll(); // again at once: not even read again
    expect(net.on(PRIMARY_RELAY).sent).toHaveLength(1);
    expect(net.on(DITTO).events.length).toBe(asked);
  });
});

describe('reads: the primary is asked first and combined with the others', () => {
  const p = person();
  const older = p.profile('aaaaaaaaaa', 1_700_000_000);
  const newer = finalizeEvent(companionProfileTemplate(p.pk, p.d('bbbbbbbbbb'), 1_700_000_100, p.profile('bbbbbbbbbb', 1_700_000_050, older)), p.sk);
  const a = p.blobbi('aaaaaaaaaa', 1_700_000_000);
  const b = p.blobbi('bbbbbbbbbb', 1_700_000_000);
  type Held = Record<string, NostrEvent[] | 'down' | 'hang'>;
  const opener =
    (held: Held) =>
    (url: string): RelayConnection => ({
      query: (filters, { signal }) =>
        new Promise((resolve, reject) => {
          const mine = held[url] ?? [];
          if (mine === 'down') return reject(new Error('refused'));
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
          if (mine === 'hang') return;
          const kinds = (filters[0] as { kinds: number[] }).kinds;
          setTimeout(() => resolve(mine.filter((e) => kinds.includes(e.kind)).map((e) => JSON.parse(JSON.stringify(e)))), 2);
        }),
      close: () => {},
    });
  const resolve = (held: Held, timeoutMs = 120) => resolveCurrentBlobbi(p.pk, { relays: READ_RELAYS, timeoutMs, profiles: relayBlobbonautReader({ open: opener(held), graceMs: 40 }), blobbis: relayBlobbiReader({ open: opener(held), graceMs: 40 }) });

  it('every relay is asked, the primary first; the read says which relays answered', async () => {
    const asked: string[] = [];
    const open = (url: string): RelayConnection => (asked.push(url), opener({ [DITTO]: 'down' })(url));
    const res = await queryRelays(READ_RELAYS, { kinds: [31124] }, new AbortController().signal, { open });
    expect(asked).toEqual([...READ_RELAYS]);
    expect(asked[0]).toBe(PRIMARY_RELAY);
    expect(res.answered!.sort()).toEqual([PRIMARY_RELAY, PRIMAL, DREAMITH].sort());
  });

  it('the newest profile wins wherever it is: an older one on the primary never hides a secondary\'s newer one', async () => {
    const res = await resolveCurrentBlobbi(p.pk, { relays: READ_RELAYS, timeoutMs: 200, profiles: relayBlobbonautReader({ open: opener({ [PRIMARY_RELAY]: [older, a, b], [DITTO]: [newer, a, b] }) }), blobbis: relayBlobbiReader({ open: opener({ [PRIMARY_RELAY]: [a, b], [DITTO]: [a, b] }) }) });
    expect(res).toMatchObject({ status: 'current', profileId: newer.id, blobbi: { d: p.d('bbbbbbbbbb') } });
  });

  it('the primary EMPTY and the secondaries silent: unknown, never "no profile"', async () => {
    expect(await resolve({ [PRIMARY_RELAY]: [], [DITTO]: 'hang', [PRIMAL]: 'hang', [DREAMITH]: 'hang' })).toEqual({ status: 'unavailable' });
    expect(await resolve({ [PRIMARY_RELAY]: [], [DITTO]: [], [PRIMAL]: [], [DREAMITH]: 'down' })).toEqual({ status: 'unavailable' }); // one secondary missing
  });

  it('the primary DOWN or silent and every secondary answering with nothing: "no profile" is known (it never blocks a read)', async () => {
    expect(await resolve({ [PRIMARY_RELAY]: 'down' })).toMatchObject({ status: 'no-selection', reason: 'no-profile' });
    expect(await resolve({ [PRIMARY_RELAY]: 'hang' })).toMatchObject({ status: 'no-selection', reason: 'no-profile' });
  });

  it('the primary down and the secondaries holding the profile: the player\'s Blobbi, as before', async () => {
    expect(await resolve({ [PRIMARY_RELAY]: 'down', [DITTO]: [newer, a, b], [PRIMAL]: [newer, a, b] })).toMatchObject({ status: 'current', blobbi: { d: p.d('bbbbbbbbbb') } });
  });
});

describe('world travel: the primary joins the kit\'s relays, and its empty answer alone is not "at home"', () => {
  const sk = generateSecretKey();
  const owner = getPublicKey(sk);
  const d = getCanonicalBlobbiD(owner, '0123456789');
  const [TRAVEL_DITTO, TRAVEL_PRIMAL] = BLOBBI_WORLD_TRAVEL_RELAYS;
  type Held = Record<string, NostrEvent[] | 'down' | 'hang'>;
  const conns = (held: Held) => async (url: string): Promise<TravelConnection> => ({
    query: (_filters, { signal }) =>
      new Promise((resolve, reject) => {
        const mine = held[url] ?? [];
        if (mine === 'down') return reject(new Error('refused'));
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
        if (mine !== 'hang') setTimeout(() => resolve(mine.map((e) => structuredClone(e))), 2);
      }),
    req: () => ({ async *[Symbol.asyncIterator]() {} }),
    close: () => {},
  });
  const filter = { kinds: [31126], authors: [owner], '#d': [d] };
  const look = (r: ReturnType<typeof pixelTravelRelays>, ms = 60) => {
    const abort = new AbortController();
    setTimeout(() => abort.abort(), ms);
    return Promise.allSettled(r.urls.map((url) => r.query(url, filter, abort.signal)));
  };
  const elsewhere = finalizeEvent(buildWorldLocationTemplate({ owner, d, world: 'blobbi-island', latest: null, now: NOW }), sk);

  it('the primary is first in the list the host passes; the kit\'s two follow', () => {
    expect(pixelTravelRelays({ open: conns({}) }).urls).toEqual([PRIMARY_RELAY, TRAVEL_DITTO, TRAVEL_PRIMAL]);
  });

  it('empty and alone: reported as no answer; with a secondary\'s answer: its empty answer stands', async () => {
    const alone = await look(pixelTravelRelays({ open: conns({ [TRAVEL_DITTO]: 'hang', [TRAVEL_PRIMAL]: 'down' }) }));
    expect(alone.map((a) => a.status)).toEqual(['rejected', 'rejected', 'rejected']);
    const together = await look(pixelTravelRelays({ open: conns({ [TRAVEL_DITTO]: 'hang' }) }));
    expect(together.map((a) => a.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect((together[0] as PromiseFulfilledResult<NostrEvent[]>).value).toEqual([]);
  });

  it('what the primary DOES hold is passed on at once, whatever the others do; a primary down is one relay missing', async () => {
    const holds = await look(pixelTravelRelays({ open: conns({ [PRIMARY_RELAY]: [elsewhere], [TRAVEL_DITTO]: 'hang', [TRAVEL_PRIMAL]: 'hang' }) }));
    expect(holds.map((a) => a.status)).toEqual(['fulfilled', 'rejected', 'rejected']);
    expect((holds[0] as PromiseFulfilledResult<NostrEvent[]>).value.map((e) => e.id)).toEqual([elsewhere.id]);
    const down = await look(pixelTravelRelays({ open: conns({ [PRIMARY_RELAY]: 'down', [TRAVEL_DITTO]: [elsewhere] }) }));
    expect(down.map((a) => a.status)).toEqual(['rejected', 'fulfilled', 'fulfilled']);
  });

  it('each look is weighed on its own: a secondary\'s answer to an earlier look never vouches for a later one', async () => {
    const held: Held = {};
    const r = pixelTravelRelays({ open: conns(held) });
    expect((await look(r)).map((a) => a.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
    held[TRAVEL_DITTO] = 'hang';
    held[TRAVEL_PRIMAL] = 'hang';
    expect((await look(r)).map((a) => a.status)).toEqual(['rejected', 'rejected', 'rejected']);
  });

  it('THE KIT\'S SESSION, a device with nothing remembered: the empty primary alone never reads as "at home" (nothing to sign an arrival on)', async () => {
    const session = (held: Held) => createWorldTravel({ owner, d, world: WORLD_PIXEL, relays: pixelTravelRelays({ open: conns(held) }), verify: verifyEvent as never, signer: () => null, timeoutMs: 40 });
    const settled = async (s: ReturnType<typeof session>) => {
      await s.refresh();
      const snap = s.snapshot();
      s.dispose();
      return snap;
    };
    // Only the primary answers, and it is empty: the place is NOT confirmed.
    const alone = await settled(session({ [TRAVEL_DITTO]: 'hang', [TRAVEL_PRIMAL]: 'hang' }));
    expect(alone).toMatchObject({ status: 'unreachable', location: null });
    expect(alone.resolution).not.toBe('confirmed');
    // A secondary answers too, also with nothing: at home is now a fact.
    expect(await settled(session({ [TRAVEL_PRIMAL]: 'hang' }))).toMatchObject({ status: 'ready', resolution: 'confirmed', location: null });
    // The secondaries know it is elsewhere and the primary holds nothing: elsewhere.
    expect(await settled(session({ [TRAVEL_DITTO]: [elsewhere], [TRAVEL_PRIMAL]: [elsewhere] }))).toMatchObject({ status: 'ready', resolution: 'confirmed', place: 'blobbi-island' });
  });
});

describe('READ MODE: a restored session sends nothing until the account turns copies on', () => {
  const sentCount = (net: ReturnType<typeof network>) => net.members.map((m) => m.sent.length);

  /**
   * An EARLIER VISIT shared a Blobbi and a companion choice while the primary was down (both are owed to it, and the
   * records are stored); another Blobbi app left a Blobbi of the account on the secondaries only. Then the page is
   * opened again: a new service over the same storage, the same account remembered.
   */
  async function restored() {
    const net = network({ down: new Set([PRIMARY_RELAY]) });
    const first = service(net.group);
    const b = await readyGuest(first);
    expect((await first.svc.register(b.d, true)).ok).toBe(true);
    const run = activationRun(first.store, b.d, 'live')!;
    // A companion choice of that visit, shared and still owed to the primary.
    const other = await first.vault.sign(b.owner, babyStateTemplate({ owner: b.owner, petId: 'bbbbbbbbbb', name: 'Bo', bornAt: 1_700_000_000 }, 1_700_000_000));
    net.seed(other, SECONDARY_RELAYS); // made in another Blobbi app: on the secondaries only
    const share = await first.svc.shareCompanion({ owner: b.owner, d: getCanonicalBlobbiD(b.owner, 'bbbbbbbbbb'), at: NOW, over: null }, { method: 'vault', stillAccount: () => true });
    expect(share).toMatchObject({ kind: 'shared', primary: 'pending' });
    net.faults.down!.clear(); // the primary is back, and empty
    const later = service(net.group, () => b.owner, { store: first.store, vault: first.vault });
    return { net, b, run, other, later, first };
  }

  it('opening the game with a saved account, stored owed deliveries and state on the relays: it reads, and no relay receives a single EVENT', async () => {
    const { net, b, later } = await restored();
    const before = sentCount(net);
    expect(later.svc.registration(b.d)).toMatchObject({ stage: 'done', owed: 1, primary: 'pending' }); // owed is known...
    for (let i = 0; i < 6; i++) expect(await later.svc.spreadAll()).toBe(0); // ...and nothing is delivered by itself
    // The reads still work and still merge every relay (the Blobbi the secondaries hold is found).
    const found = await later.svc.registration(b.d);
    expect(found.stage).toBe('done');
    const q = await net.group.query({ kinds: [31124], authors: [b.owner], limit: 50 }, 1000);
    expect(new Set(q.events.map((e) => e.id)).size).toBe(2);
    expect(sentCount(net)).toEqual(before);
    expect(net.on(PRIMARY_RELAY).events).toEqual([]);
    expect(later.store.get(SYNC_CONSENT_KEY)).toBeNull(); // nobody was asked, nobody agreed
  }, 30_000);

  it('the same visit that shared goes on delivering its own events (a retry of that publication), sync off', async () => {
    const net = network({ down: new Set([PRIMARY_RELAY]) });
    const s = service(net.group);
    const b = await readyGuest(s);
    expect((await s.svc.register(b.d, true)).ok).toBe(true); // the player's act: every relay is sent it
    for (const url of SECONDARY_RELAYS) expect(net.on(url).events.map((e) => e.kind).sort()).toEqual([11125, 31124]);
    net.faults.down!.clear();
    expect(await s.svc.spreadAll()).toBe(0);
    expect(net.on(PRIMARY_RELAY).events.map((e) => e.kind).sort()).toEqual([11125, 31124]);
    expect(s.store.get(SYNC_CONSENT_KEY)).toBeNull();
  }, 30_000);

  it('a player action in a restored session still publishes the NEW event to the primary and the secondaries', async () => {
    const { net, b, later } = await restored();
    const before = sentCount(net);
    const again = await later.svc.shareCompanion({ owner: b.owner, d: b.d, at: NOW + 60_000, over: null }, { method: 'vault', stillAccount: () => true });
    expect(again.kind).toBe('shared');
    const id = (again as { event: NostrEvent }).event.id;
    for (const url of PUBLISH_RELAYS) expect(net.on(url).events.some((e) => e.id === id), url).toBe(true);
    // Only that one new event went out: the earlier visit's owed events stayed where they were.
    expect(sentCount(net)).toEqual(before.map((n) => n + 1));
    expect(net.on(PRIMARY_RELAY).events.map((e) => e.id)).toEqual([id]);
  }, 30_000);

  it('once the account turns copies on: the owed events and the winning revisions reach the relays that lack them, and only those', async () => {
    const { net, b, run, other, later } = await restored();
    expect(syncChoice(later.store, b.owner)).toEqual({ on: false, relays: [...SYNC_DESTINATIONS] }); // what the settings page shows
    setSyncChoice(later.store, b.owner, true);
    expect(syncChoice(later.store, b.owner).on).toBe(true);
    const secondaries = SECONDARY_RELAYS.map((u) => net.on(u).sent.length);
    for (let i = 0; i < 3; i++) await later.svc.spreadAll();
    const onPrimary = net.on(PRIMARY_RELAY).events;
    expect(onPrimary.map((e) => e.id)).toEqual(expect.arrayContaining([run.blobbi!.id, other.id])); // the owed Blobbi, and the one found elsewhere
    expect(onPrimary.filter((e) => e.kind === 11125).map((e) => e.id)).toEqual([net.on(DITTO).events.find((e) => e.kind === 11125)!.id]); // the winning profile only
    expect(onPrimary.some((e) => e.id === run.profile!.id)).toBe(false); // the profile the companion choice replaced is never carried
    expect(SECONDARY_RELAYS.map((u) => net.on(u).sent.length)).toEqual(secondaries); // nothing to a relay that already has it
    // Turned off again: nothing more.
    setSyncChoice(later.store, b.owner, false);
    net.on(PRIMARY_RELAY).events.length = 0;
    const off = sentCount(net);
    later.advance(60 * 60_000);
    for (let i = 0; i < 3; i++) await later.svc.spreadAll();
    expect(sentCount(net)).toEqual(off);
  }, 30_000);

  it('the choice covers exactly the relays it named, and exactly the account that made it', async () => {
    const { net, b, later } = await restored();
    net.on(DREAMITH).events.length = 0; // dreamith lacks everything too
    syncConsent(later.store).enable(b.owner, [PRIMARY_RELAY]); // an answer given when only the primary was listed
    const offered = net.on(DREAMITH).sent.length;
    expect(syncChoice(later.store, b.owner).on).toBe(false); // not every relay is covered: the page asks again
    for (let i = 0; i < 3; i++) await later.svc.spreadAll();
    expect(net.on(PRIMARY_RELAY).events.length).toBeGreaterThan(0);
    expect(net.on(DREAMITH).sent).toHaveLength(offered); // not even offered
    expect(net.on(DREAMITH).events).toEqual([]); // not named: it receives nothing
    // Another account connected in the same browser: the first account's choice is not its own, and vice versa.
    const stranger = person();
    const theirs = stranger.blobbi('aaaaaaaaaa', 1_700_000_000);
    net.seed(theirs, [DITTO]);
    const elsewhere = service(net.group, () => stranger.pk, { store: later.store, vault: later.vault });
    for (let i = 0; i < 3; i++) await elsewhere.svc.spreadAll();
    for (const url of [PRIMARY_RELAY, PRIMAL, DREAMITH]) expect(net.on(url).events.some((e) => e.pubkey === stranger.pk), url).toBe(false);
    expect(elsewhere.svc.maySend({ id: 'x'.repeat(64), pubkey: b.owner }, PRIMARY_RELAY)).toBe(false); // nor the absent account's events
  }, 30_000);

  it('signed out: never, whatever was chosen before', async () => {
    const { net, b, first } = await restored();
    setSyncChoice(first.store, b.owner, true);
    const nobody = service(net.group, () => null, { store: first.store, vault: first.vault });
    const before = sentCount(net);
    for (let i = 0; i < 3; i++) expect(await nobody.svc.spreadAll()).toBe(0);
    expect(sentCount(net)).toEqual(before);
  }, 30_000);

  it('world travel: the kit\'s repair of a relay with an EXISTING location is refused (`blocked:`); a move signed in this visit goes out', async () => {
    const sk = generateSecretKey();
    const owner = getPublicKey(sk);
    const d = getCanonicalBlobbiD(owner, '0123456789');
    const existing = finalizeEvent(buildWorldLocationTemplate({ owner, d, world: WORLD_PIXEL, latest: null, now: NOW - 60_000 }), sk);
    const held: Record<string, NostrEvent[]> = { [BLOBBI_WORLD_TRAVEL_RELAYS[0]]: [existing], [BLOBBI_WORLD_TRAVEL_RELAYS[1]]: [existing] }; // the primary lacks it
    const open = async (url: string): Promise<TravelConnection> => ({
      query: async () => (held[url] ?? []).map((e) => structuredClone(e)),
      req: () => ({ async *[Symbol.asyncIterator]() {} }),
      close: () => {},
    });
    const store = memoryStore();
    const svc = new IdentityService({ store, vault: new KeyVault(memoryVaultBackend()), publisher: memoryRelay({ mode: 'live' }), now: () => NOW, currentAccount: () => owner, accountSigner: async (t) => finalizeEvent(t, sk), sleep: noSleep });
    const sends: [string, string][] = [];
    const refusals: string[] = [];
    const relays = pixelTravelRelays({ open, send: async (url, e) => void sends.push([url, e.id]), mayPublish: (url, e) => svc.maySend(e, url) });
    const publish = relays.publish.bind(relays);
    relays.publish = (url, e, signal) => publish(url, e, signal).catch((error: Error) => (refusals.push(error.message), Promise.reject(error)));
    const session = createWorldTravel({ owner, d, world: WORLD_PIXEL, relays, verify: verifyEvent as never, signer: () => null, timeoutMs: 40 });
    await session.refresh();
    await new Promise((r) => setTimeout(r, 30));
    expect(session.snapshot()).toMatchObject({ status: 'ready', here: true });
    expect(sends).toEqual([]); // the look found the primary lacking the location, and nothing was sent
    expect(refusals.length).toBeGreaterThan(0); // the kit did try its repair...
    expect(refusals.every((m) => m.startsWith('blocked:'))).toBe(true); // ...and was told for good
    await session.refresh();
    await new Promise((r) => setTimeout(r, 30));
    expect(refusals).toHaveLength(1); // it does not try again
    session.dispose();
    // A move the player makes now: signed through the service in this visit, so every relay is sent it.
    const mine = await svc.signAsAccount(owner, 'nip07', buildWorldLocationTemplate({ owner, d, world: 'blobbi-island', latest: null, now: NOW }) as never);
    await Promise.all(relays.urls.map((url) => relays.publish(url, mine as never, new AbortController().signal)));
    expect(sends.map(([url]) => url)).toEqual([...relays.urls]);
    // With the account's choice, the existing location may be copied to a relay it named.
    setSyncChoice(store, owner, true);
    await relays.publish(PRIMARY_RELAY, existing as never, new AbortController().signal);
    expect(sends.at(-1)).toEqual([PRIMARY_RELAY, existing.id]);
    // No gate given at all: nothing is ever sent.
    await expect(pixelTravelRelays({ open, send: async () => {} }).publish(PRIMARY_RELAY, mine as never, new AbortController().signal)).rejects.toThrow(/^blocked:/);
  });
});
