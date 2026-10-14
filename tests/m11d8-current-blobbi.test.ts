// M11D.8, PART C: the read-only current-Blobbi resolver. Fixtures follow Blobbi Standalone's own shapes (its
// `profileEvent` fixture and `useSetCurrentCompanion` write: kind 11125, d `blobbonaut-<p12>`, `b`, `has`,
// `current_companion` = a bare d, a `client` tag), every event really signed; relays are offline fakes that hand back
// whatever they hold, so authorship and signatures are checked by the resolver, never trusted.
import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from 'nostr-tools/pure';
import { buildEggTags, getCanonicalBlobbiD, getCanonicalBlobbonautD } from '@blobbi-kit/core';
import { ownersReference, pickBlobbonautProfile, resolveCurrentBlobbi } from '../src/nostr/current-blobbi';
import { READ_RELAYS } from '../src/nostr/relay-config';
import type { ProfileReadResult } from '../src/nostr/relays';

const sk = generateSecretKey();
const OWNER = getPublicKey(sk);
const strangerSk = generateSecretKey();

/** A canonical 31124 by `key` (the kit's egg tags, its stage set), as the Blobbi apps publish it. */
function blobbi(pet: string, name: string, gen: 'v1' | 'v2' | 'v3', stage: 'egg' | 'baby' | 'adult', at = 1_760_000_100, key = sk): NostrEvent {
  const owner = getPublicKey(key);
  return finalizeEvent({ kind: 31124, created_at: at, content: '', tags: buildEggTags(owner, pet, at, name, { visualGeneration: gen }).map((t) => (t[0] === 'stage' ? ['stage', stage] : t)) }, key);
}
/** A Blobbonaut profile as Standalone writes it. */
function profile(o: { current?: string; has?: string[]; at?: number; kind?: number; key?: Uint8Array; extra?: string[][] } = {}): NostrEvent {
  const key = o.key ?? sk;
  const owner = getPublicKey(key);
  const tags = [['d', getCanonicalBlobbonautD(owner)], ['b', 'blobbi:ecosystem:v1'], ['name', 'Tester'], ...(o.has ?? []).map((d) => ['has', d]), ...(o.current ? [['current_companion', o.current]] : []), ['client', 'Blobbi'], ...(o.extra ?? [])];
  return finalizeEvent({ kind: o.kind ?? 11125, created_at: o.at ?? 1_760_000_200, content: '', tags }, key);
}
const D = (pet: string, owner = OWNER) => getCanonicalBlobbiD(owner, pet);
/** As a relay hands it over: plain JSON (nostr-tools caches "verified" on the objects it signed; a relay's are not). */
const wire = (e: NostrEvent): NostrEvent => JSON.parse(JSON.stringify(e));

/** Fake relays: `profiles` answer the 11125/31125 read, `blobbis` the 31124 read; `reachable` relays answered. */
function relays(o: { profiles?: NostrEvent[]; blobbis?: NostrEvent[]; reachable?: number; blobbiReachable?: number; hang?: boolean } = {}) {
  const asked: string[] = [];
  const answer = (events: NostrEvent[], reachable: number): Promise<ProfileReadResult> => (o.hang ? new Promise(() => {}) : Promise.resolve({ events, reachable }));
  return {
    asked,
    deps: {
      relays: READ_RELAYS,
      timeoutMs: 50,
      profiles: { readBlobbonaut: (pk: string) => (asked.push(`profile:${pk}`), answer(o.profiles ?? [], o.reachable ?? READ_RELAYS.length)) },
      blobbis: { readBlobbis: (pk: string) => (asked.push(`blobbis:${pk}`), answer(o.blobbis ?? [], o.blobbiReachable ?? o.reachable ?? READ_RELAYS.length)) },
    },
  };
}

const PUDDING = blobbi('a1b2c3d4e5', 'Pudding', 'v3', 'baby');
const MOON = blobbi('b1b2c3d4e5', 'Moon', 'v1', 'adult', 1_760_000_050);
const MINT = blobbi('c1b2c3d4e5', 'Mint', 'v2', 'baby', 1_760_000_060);
const SUNNY = blobbi('d1b2c3d4e5', 'Sunny', 'v3', 'egg', 1_760_000_070);
const BIG = blobbi('e1b2c3d4e5', 'Big', 'v3', 'adult', 1_760_000_080);
const ALL = [PUDDING, MOON, MINT, SUNNY, BIG];

describe('M11D.8: the current Blobbi from kind 11125', () => {
  it('a valid profile names Pudding: the Blobbi, its stage and generation, read only', async () => {
    const r = relays({ profiles: [profile({ current: D('a1b2c3d4e5'), has: ALL.map((e) => e.tags.find((t) => t[0] === 'd')![1]) })], blobbis: ALL });
    const res = await resolveCurrentBlobbi(OWNER, r.deps);
    expect(res).toMatchObject({ status: 'current', partial: false, blobbi: { d: D('a1b2c3d4e5'), name: 'Pudding', stage: 'baby', generation: 'v3', availability: 'available', pubkey: OWNER } });
    if (res.status === 'current') expect(res.items.length).toBe(5);
    expect(r.asked).toEqual([`profile:${OWNER}`, `blobbis:${OWNER}`]);
  });

  it('V1 and V2 keep their generation (world form), an egg is current but cannot walk, an adult walks', async () => {
    for (const [ev, gen, stage, availability] of [
      [MOON, 'v1', 'adult', 'available'],
      [MINT, 'v2', 'baby', 'available'],
      [SUNNY, 'v3', 'egg', 'egg'],
      [BIG, 'v3', 'adult', 'available'],
    ] as const) {
      const d = ev.tags.find((t) => t[0] === 'd')![1];
      const res = await resolveCurrentBlobbi(OWNER, relays({ profiles: [profile({ current: d })], blobbis: ALL }).deps);
      expect(res).toMatchObject({ status: 'current', blobbi: { d, generation: gen, stage, availability } });
      if (res.status === 'current' && gen !== 'v3') expect(res.blobbi.worldForm).toBeTruthy();
    }
  });

  it('a profile with a broken signature, or by another author, is never used', async () => {
    const good = profile({ current: D('a1b2c3d4e5') });
    const forged = wire({ ...profile({ current: D('b1b2c3d4e5'), at: 1_760_000_900 }), sig: good.sig }); // newer, signature not its own
    const stranger = profile({ current: D('c1b2c3d4e5'), at: 1_760_000_950, key: strangerSk }); // newer, someone else
    const res = await resolveCurrentBlobbi(OWNER, relays({ profiles: [forged, stranger, good], blobbis: ALL }).deps);
    expect(res).toMatchObject({ status: 'current', blobbi: { name: 'Pudding' } });
    // Only forged or foreign profiles: nothing is chosen (never someone else's choice).
    const none = await resolveCurrentBlobbi(OWNER, relays({ profiles: [forged, stranger], blobbis: ALL }).deps);
    expect(none).toMatchObject({ status: 'no-selection', reason: 'no-profile' });
  });

  it('the referenced Blobbi must be the owner\'s own, authentic 31124', async () => {
    // A stranger's event with Pudding's d, and a copy of Pudding with a broken signature: neither counts.
    const fake = blobbi('a1b2c3d4e5', 'Impostor', 'v3', 'adult', 1_760_000_999, strangerSk);
    const tampered = wire({ ...blobbi('a1b2c3d4e5', 'Tampered', 'v3', 'adult', 1_760_000_998), sig: PUDDING.sig });
    const res = await resolveCurrentBlobbi(OWNER, relays({ profiles: [profile({ current: D('a1b2c3d4e5') })], blobbis: [fake, tampered, PUDDING] }).deps);
    expect(res).toMatchObject({ status: 'current', blobbi: { name: 'Pudding', stage: 'baby' } });
  });

  it('a reference that is not one of the owner\'s canonical d tags is refused', async () => {
    const strangers = getCanonicalBlobbiD(getPublicKey(strangerSk), 'a1b2c3d4e5');
    for (const current of [strangers, '31124:' + OWNER + ':' + D('a1b2c3d4e5'), 'blobbi-puck', 'nonsense'])
      expect(await resolveCurrentBlobbi(OWNER, relays({ profiles: [profile({ current })], blobbis: ALL }).deps)).toMatchObject({ status: 'no-selection', reason: 'invalid-reference' });
    expect(ownersReference(D('a1b2c3d4e5'), OWNER)).toBe(true);
  });

  it('no profile, or a profile without current_companion: nothing chosen, the Blobbis still listed', async () => {
    expect(await resolveCurrentBlobbi(OWNER, relays({ profiles: [], blobbis: ALL }).deps)).toMatchObject({ status: 'no-selection', reason: 'no-profile' });
    const res = await resolveCurrentBlobbi(OWNER, relays({ profiles: [profile({ has: [D('a1b2c3d4e5')] })], blobbis: ALL }).deps);
    expect(res).toMatchObject({ status: 'no-selection', reason: 'no-companion' });
    if (res.status === 'no-selection') expect(res.items.length).toBe(5);
  });

  it('the named Blobbi is missing (deleted or not found): said so, never replaced', async () => {
    const res = await resolveCurrentBlobbi(OWNER, relays({ profiles: [profile({ current: D('f1b2c3d4e5') })], blobbis: ALL }).deps);
    expect(res).toMatchObject({ status: 'missing', d: D('f1b2c3d4e5'), partial: false });
  });

  it('conflicting profiles (two devices): the newest 11125 wins; an 11125 beats a newer legacy 31125; ties by lower id', async () => {
    const older = profile({ current: D('a1b2c3d4e5'), at: 1_760_000_200 });
    const newer = profile({ current: D('e1b2c3d4e5'), at: 1_760_000_300 });
    expect(await resolveCurrentBlobbi(OWNER, relays({ profiles: [older, newer], blobbis: ALL }).deps)).toMatchObject({ status: 'current', blobbi: { name: 'Big' } });
    const legacy = profile({ current: D('b1b2c3d4e5'), at: 1_760_009_999, kind: 31125 });
    expect(await resolveCurrentBlobbi(OWNER, relays({ profiles: [legacy, older], blobbis: ALL }).deps)).toMatchObject({ status: 'current', blobbi: { name: 'Pudding' } });
    // Only a legacy profile: it is read (the kit still reads 31125).
    expect(await resolveCurrentBlobbi(OWNER, relays({ profiles: [legacy], blobbis: ALL }).deps)).toMatchObject({ status: 'current', blobbi: { name: 'Moon' } });
    const a = profile({ current: D('a1b2c3d4e5'), at: 1_760_000_500 });
    const b = profile({ current: D('e1b2c3d4e5'), at: 1_760_000_500 });
    const lower = a.id < b.id ? a : b;
    expect(pickBlobbonautProfile([a, b], OWNER)?.id).toBe(lower.id);
    expect(pickBlobbonautProfile([b, a], OWNER)?.id).toBe(lower.id);
  });

  it('several states of the same Blobbi: the newest 31124 for its d is the one returned', async () => {
    const grown = blobbi('a1b2c3d4e5', 'Pudding', 'v3', 'adult', 1_760_001_000);
    const res = await resolveCurrentBlobbi(OWNER, relays({ profiles: [profile({ current: D('a1b2c3d4e5') })], blobbis: [PUDDING, grown] }).deps);
    expect(res).toMatchObject({ status: 'current', blobbi: { stage: 'adult', updatedAt: 1_760_001_000 } });
  });

  it('some relays did not answer: the answer is marked partial', async () => {
    const res = await resolveCurrentBlobbi(OWNER, relays({ profiles: [profile({ current: D('a1b2c3d4e5') })], blobbis: ALL, reachable: 1 }).deps);
    expect(res).toMatchObject({ status: 'current', partial: true });
  });

  it('offline or too slow: unavailable (nothing guessed from the Blobbis alone)', async () => {
    expect(await resolveCurrentBlobbi(OWNER, relays({ hang: true }).deps)).toEqual({ status: 'unavailable' });
    expect(await resolveCurrentBlobbi(OWNER, relays({ profiles: [], blobbis: ALL, reachable: 0, blobbiReachable: 3 }).deps)).toEqual({ status: 'unavailable' });
    const throwing = relays().deps;
    throwing.profiles.readBlobbonaut = () => Promise.reject(new Error('socket closed'));
    expect(await resolveCurrentBlobbi(OWNER, throwing)).toEqual({ status: 'unavailable' });
    expect(await resolveCurrentBlobbi('not-a-key', relays().deps)).toEqual({ status: 'unavailable' });
  });

  it('is read only: the resolver has no way to publish (readers only), and asks for the owner alone', async () => {
    const r = relays({ profiles: [profile({ current: D('a1b2c3d4e5') })], blobbis: ALL });
    await resolveCurrentBlobbi(OWNER, r.deps);
    expect(r.asked.every((a) => a.endsWith(OWNER))).toBe(true);
    const src = (await import('node:fs')).readFileSync('src/nostr/current-blobbi.ts', 'utf8');
    expect(src).not.toMatch(/\bpublish\(|signEvent|finalizeEvent|getSecret|\.event\(/);
  });
});
