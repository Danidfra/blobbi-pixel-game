/**
 * CANONICAL CARE, READ ONLY (phase 6): the Blobbi's shared care stats (kind 31124: hunger, happiness, health,
 * hygiene, energy) read from the relays for the Blobbi walking here and shown as they stand by the kit's own
 * decay. Every event really signed; relays are offline fakes that hand back whatever they hold, so authorship and
 * signatures are checked by the reader, never trusted. Nothing is ever published: the reader cannot.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from 'nostr-tools/pure';
import { applyBlobbiDecay, buildEggTags, getCanonicalBlobbiD, updateBlobbiTags } from '@blobbi-kit/core';
import { pickCanonicalCare, readCanonicalCare, relayCanonicalCareReader } from '../src/nostr/canonical-care';
import { SharedCareService, sharedAddressOf, type SharedCareRead } from '../src/game/shared-care';
import { READ_RELAYS } from '../src/nostr/relay-config';
import type { RelayConnection } from '../src/nostr/relays';
import type { BlobbiSource } from '../src/blobbi/source';

const sk = generateSecretKey();
const OWNER = getPublicKey(sk);
const strangerSk = generateSecretKey();
const PET = 'a1b2c3d4e5';
const D = getCanonicalBlobbiD(OWNER, PET);
const T0 = 1_760_000_000;

/** A canonical 31124 by `key` with the given stats and decay checkpoint, as the Blobbi apps publish it. */
function state(o: { stats?: Partial<Record<'hunger' | 'happiness' | 'health' | 'hygiene' | 'energy', number>>; decayAt?: number; at?: number; stage?: 'egg' | 'baby' | 'adult'; state?: 'active' | 'sleeping'; key?: Uint8Array; pet?: string; name?: string } = {}): NostrEvent {
  const key = o.key ?? sk;
  const owner = getPublicKey(key);
  const at = o.at ?? T0;
  const updates: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.stats ?? {})) updates[k] = String(v);
  if (o.decayAt !== undefined) updates.last_decay_at = String(o.decayAt);
  if (o.state) updates.state = o.state;
  const tags = updateBlobbiTags(buildEggTags(owner, o.pet ?? PET, at, o.name ?? 'Pudding', { visualGeneration: 'v3' }).map((t) => (t[0] === 'stage' ? ['stage', o.stage ?? 'adult'] : t)), updates);
  return finalizeEvent({ kind: 31124, created_at: at, content: '', tags }, key);
}
/** As a relay hands it over: plain JSON (nostr-tools caches "verified" on the objects it signed). */
const wire = (e: NostrEvent): NostrEvent => JSON.parse(JSON.stringify(e));

/** Fake relays: each holds events (or fails); `asked` records every filter sent. Nothing can be published. */
function relays(held: (NostrEvent[] | 'down' | 'hang')[]) {
  const asked: Record<string, unknown>[] = [];
  let i = 0;
  const open = (): RelayConnection => {
    const mine = held[i++ % held.length];
    return {
      query: (filters, { signal }) => {
        asked.push(filters[0]);
        if (mine === 'down') return Promise.reject(new Error('refused'));
        if (mine === 'hang') return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
        const f = filters[0] as { '#d'?: string[]; authors?: string[] };
        return Promise.resolve(mine.filter((e) => (!f.authors || f.authors.includes(e.pubkey)) && (!f['#d'] || e.tags.some((t) => t[0] === 'd' && f['#d']!.includes(t[1])))).map(wire));
      },
      close: () => {},
    };
  };
  return { asked, reader: relayCanonicalCareReader({ open }) };
}
const read = (r: ReturnType<typeof relays>, timeoutMs = 200) => readCanonicalCare(OWNER, D, { reader: r.reader, relays: READ_RELAYS, timeoutMs });

describe('reading the shared care', () => {
  it('the newest valid state of that Blobbi by its owner: its name, stage, the five stats, the decay checkpoint; the filter asks for that d only', async () => {
    const older = state({ stats: { hunger: 40 }, at: T0 - 100, decayAt: T0 - 100 });
    const newest = state({ stats: { hunger: 73, happiness: 61, health: 88, hygiene: 52, energy: 30 }, decayAt: T0 });
    const r = relays([[older, newest], [older], [newest]]);
    const res = await read(r);
    expect(res.status).toBe('ready');
    if (res.status !== 'ready') return;
    expect(res.partial).toBe(false);
    expect(res.care).toMatchObject({ pubkey: OWNER, d: D, name: 'Pudding', stage: 'adult', state: 'active', lastDecayAt: T0, createdAt: T0, eventId: newest.id });
    expect(res.care.stats).toEqual({ hunger: 73, happiness: 61, health: 88, hygiene: 52, energy: 30 });
    expect(r.asked.length).toBe(READ_RELAYS.length);
    expect(r.asked[0]).toMatchObject({ kinds: [31124], authors: [OWNER], '#d': [D] });
  });

  it('projects the stats by the kit\'s own decay: none at the checkpoint, lower hours later, slower asleep; never above the event', async () => {
    const stats = { hunger: 90, happiness: 80, health: 95, hygiene: 70, energy: 60 };
    const awake = (await read(relays([[state({ stats, decayAt: T0 })]]))) as Extract<SharedCareRead, { status: 'ready' }>;
    expect(awake.care.project(T0)).toEqual(stats);
    const later = awake.care.project(T0 + 3 * 3600);
    const expected = applyBlobbiDecay({ stage: 'adult', state: 'active', stats, lastDecayAt: T0, now: T0 + 3 * 3600 }).stats;
    expect(later).toEqual(expected);
    expect(later.hunger).toBeLessThan(stats.hunger);
    expect(later.energy).toBeLessThan(stats.energy);
    // Asleep: the same event with state sleeping decays slower (and energy comes back).
    const asleep = (await read(relays([[state({ stats, decayAt: T0, state: 'sleeping' })]]))) as Extract<SharedCareRead, { status: 'ready' }>;
    expect(asleep.care.state).toBe('sleeping');
    expect(asleep.care.project(T0 + 3 * 3600).hunger).toBeGreaterThan(later.hunger);
    // A clock behind the checkpoint projects nothing (never a gain from the future).
    expect(awake.care.project(T0 - 3600)).toEqual(stats);
  });

  it('stale data: an older event does not beat a newer one, whatever order the relays answer in; without a checkpoint nothing decays', async () => {
    const a = state({ stats: { hunger: 20 }, at: T0 - 500, decayAt: T0 - 500 });
    const b = state({ stats: { hunger: 95 }, at: T0, decayAt: T0 });
    for (const order of [[a, b], [b, a]]) {
      const res = (await read(relays([order]))) as Extract<SharedCareRead, { status: 'ready' }>;
      expect(res.care.stats.hunger).toBe(95);
    }
    const bare = finalizeEvent({ kind: 31124, created_at: T0, content: '', tags: buildEggTags(OWNER, PET, T0, 'Pudding', { visualGeneration: 'v3' }).filter((t) => t[0] !== 'last_decay_at') }, sk);
    const res = (await read(relays([[bare]]))) as Extract<SharedCareRead, { status: 'ready' }>;
    expect(res.care.lastDecayAt).toBeNull();
    expect(res.care.project(T0 + 48 * 3600)).toEqual(res.care.project(T0));
  });

  it('never trusts a relay: a state by another author, one with a broken signature, or another d is not this Blobbi\'s', async () => {
    const good = state({ stats: { hunger: 50 }, decayAt: T0 });
    const stranger = state({ stats: { hunger: 99 }, at: T0 + 10, key: strangerSk });
    const forged = wire({ ...state({ stats: { hunger: 1 }, at: T0 + 20 }), sig: good.sig });
    const otherPet = state({ stats: { hunger: 77 }, at: T0 + 30, pet: 'ffffffffff' });
    const res = (await read(relays([[stranger, forged, otherPet, good]]))) as Extract<SharedCareRead, { status: 'ready' }>;
    expect(res.status).toBe('ready');
    expect(res.care.stats.hunger).toBe(50);
    expect(pickCanonicalCare([stranger, forged, otherPet], OWNER, D)).toBeNull();
  });

  it('missing: the relays answered and none holds the Blobbi; partial when some did not answer', async () => {
    expect(await read(relays([[], [], []]))).toEqual({ status: 'missing', partial: false });
    expect(await read(relays([[], 'down', []]))).toEqual({ status: 'missing', partial: true });
    const res = await read(relays([[state({ stats: { hunger: 42 }, decayAt: T0 })], 'down', 'down']));
    expect(res).toMatchObject({ status: 'ready', partial: true });
  });

  it('relay failures: every relay refused or hung means unavailable (within the deadline), never a guess', async () => {
    expect(await read(relays(['down', 'down', 'down']))).toEqual({ status: 'unavailable' });
    const t0 = Date.now();
    expect(await read(relays(['hang', 'hang', 'hang']), 150)).toEqual({ status: 'unavailable' });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(await readCanonicalCare('not-a-pubkey', D, { reader: relays([[]]).reader, relays: READ_RELAYS })).toEqual({ status: 'unavailable' });
  });

  it('is read only by construction: the module cannot sign or publish', () => {
    for (const file of ['src/nostr/canonical-care.ts', 'src/game/shared-care.ts']) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/\bpublish\(|signEvent|finalizeEvent|getSecret|\.event\(|statsToTagUpdates|updateBlobbiTags/);
    }
  });
});

describe('the shared care service (what the Blobbi panel shows)', () => {
  const address: BlobbiSource = { kind: 'v3-address', pubkey: OWNER, d: D, seed: 'a'.repeat(64) };
  const other: BlobbiSource = { kind: 'v3-address', pubkey: OWNER, d: getCanonicalBlobbiD(OWNER, 'b1b2c3d4e5'), seed: 'b'.repeat(64) };
  const ready = (hunger: number): SharedCareRead => ({ status: 'ready', partial: false, care: { pubkey: OWNER, d: D, name: 'Pudding', stage: 'adult', state: 'active', stats: { hunger }, lastDecayAt: T0, lastInteraction: T0, createdAt: T0, eventId: 'x', project: () => ({ hunger, happiness: 1, health: 1, hygiene: 1, energy: 1 }) } });

  it('a demo or seed-only Blobbi has no shared care: nothing is read, nothing is invented', async () => {
    let reads = 0;
    const s = new SharedCareService({ read: async () => (reads++, ready(50)) });
    for (const source of [{ kind: 'demo', seed: 'blobbi-9' }, { kind: 'v3-seed', seed: 'c'.repeat(64) }] as BlobbiSource[]) {
      await s.refresh(source);
      expect(s.snapshot()).toMatchObject({ status: 'none', address: null, care: null });
      expect(sharedAddressOf(source)).toBeNull();
    }
    expect(reads).toBe(0);
    expect(sharedAddressOf(address)).toEqual({ pubkey: OWNER, d: D });
    expect(sharedAddressOf({ kind: 'world-form', pubkey: OWNER, d: D, generation: 'v1', seed: 'd'.repeat(64), traits: { base: '#000000', secondary: '#000000', eye: '#000000', pattern: 'solid', mark: 'none' } })).toEqual({ pubkey: OWNER, d: D });
  });

  it('reads once and keeps it for two minutes, re-reads when forced or old; an outage keeps the last state on show, marked', async () => {
    let now = 1_000_000;
    let answer: SharedCareRead = ready(50);
    let reads = 0;
    const s = new SharedCareService({ read: async () => (reads++, answer), now: () => now });
    await s.refresh(address);
    expect(s.snapshot()).toMatchObject({ status: 'ready', address: `31124:${OWNER}:${D}`, fetchedAt: now });
    expect(s.snapshot().care?.stats.hunger).toBe(50);
    await s.refresh(address);
    expect(reads).toBe(1);
    now += 60_000;
    await s.refresh(address);
    expect(reads).toBe(1);
    answer = ready(45);
    await s.refresh(address, true);
    expect(reads).toBe(2);
    expect(s.snapshot().care?.stats.hunger).toBe(45);
    now += 130_000;
    answer = { status: 'unavailable' };
    await s.refresh(address);
    expect(reads).toBe(3);
    expect(s.snapshot()).toMatchObject({ status: 'unavailable' });
    expect(s.snapshot().care?.stats.hunger).toBe(45); // the last read stays on show
    answer = { status: 'missing', partial: true };
    await s.refresh(address, true);
    expect(s.snapshot()).toMatchObject({ status: 'missing', partial: true, care: null });
    answer = ready(70);
    await s.refresh(address, true);
    expect(s.snapshot().status).toBe('ready');
  });

  it('switching Blobbi: the panel starts afresh for the new one and an answer for the old one is dropped; a reader that throws is unavailable', async () => {
    const pending: ((r: SharedCareRead) => void)[] = [];
    const s = new SharedCareService({ read: () => new Promise<SharedCareRead>((resolve) => pending.push(resolve)) });
    const first = s.refresh(address);
    expect(s.snapshot()).toMatchObject({ status: 'loading', address: `31124:${OWNER}:${D}`, care: null });
    const second = s.refresh(other);
    expect(s.snapshot().address).toBe(`31124:${OWNER}:${other.d}`);
    pending[0](ready(10)); // the old Blobbi's answer, late
    await first;
    expect(s.snapshot()).toMatchObject({ status: 'loading', address: `31124:${OWNER}:${other.d}`, care: null });
    const r80 = ready(80) as Extract<SharedCareRead, { status: 'ready' }>;
    pending[1]({ status: 'ready', partial: false, care: { ...r80.care, d: other.d } });
    await second;
    expect(s.snapshot()).toMatchObject({ status: 'ready', address: `31124:${OWNER}:${other.d}` });
    expect(s.snapshot().care?.stats.hunger).toBe(80);
    const broken = new SharedCareService({ read: () => Promise.reject(new Error('boom')) });
    await broken.refresh(address);
    expect(broken.snapshot()).toMatchObject({ status: 'unavailable', care: null });
  });
});
