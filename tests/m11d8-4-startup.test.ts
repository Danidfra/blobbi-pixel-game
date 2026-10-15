// M11D.8.4, THE FIRST-LOAD INCONSISTENCY. Manual test: Boca rosa walked on Breezy Glade, Moon was set as companion in
// Ditto; the first load of Pixel went in with Boca rosa, a refresh then found Moon and asked "who comes along?".
// Root cause 1 (confirmed at the previous commit): the resolver's deadline answered "nothing" in the same tick it
// aborted the reads, so ONE slow relay erased the answers of the others and the entry went in as if offline.
// Root cause 2: the device's choice had no stamp (made before M11D.8.3), which is ambiguous by design, so the second
// load (relays fast enough) asked. These tests replay the start of play with the REAL relay reader (`queryRelays`,
// a connection that behaves like Nostrify's NRelay1: it rejects when aborted) and the real resolver and decision.
// Disposable keys only; nothing is published.
import { afterEach, describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from 'nostr-tools/pure';
import { buildBlobbonautTags, buildEggTags, getCanonicalBlobbiD, updateBlobbonautTags } from '@blobbi-kit/core';
import { resolveCurrentBlobbi, type CurrentBlobbiResult } from '../src/nostr/current-blobbi';
import { queryRelays, relayBlobbiReader, relayBlobbonautReader, type RelayConnection } from '../src/nostr/relays';
import { READ_RELAYS } from '../src/nostr/relay-config';
import { babyStateTemplate } from '../src/nostr/canonical-events';
import { currentSelectionAt, decideEntry, entryDiagnostic, runEntry, selectionOrder, SELECTION_SKEW_MS, type EntryDecision, type EntryFacts } from '../src/game/world-entry';
import { loadSelectionRecord, markSelectionChosen, noteUnstampedChoice, storeSelection, SELECTION_KEY } from '../src/game/blobbi-selection';
import { memoryStore, type KeyValueStore } from '../src/game/persistence';
import { resolveBlobbi } from '../src/blobbi/source';

const sk = generateSecretKey();
const OWNER = getPublicKey(sk);
const MIN = 60_000;
const wire = (e: NostrEvent): NostrEvent => JSON.parse(JSON.stringify(e));
const BOCA_ID = 'b0cab0cab0';
const MOON_ID = '0a0a0a0a0a';
const BOCA_D = getCanonicalBlobbiD(OWNER, BOCA_ID);
const MOON_D = getCanonicalBlobbiD(OWNER, MOON_ID);
const T0 = 1_760_000_000; // seconds
const boca = wire(finalizeEvent(babyStateTemplate({ owner: OWNER, petId: BOCA_ID, name: 'Boca rosa', bornAt: T0 - 7200 }, T0 - 3600), sk));
const moon = wire(finalizeEvent({ kind: 31124, created_at: T0 - 3000, content: '', tags: buildEggTags(OWNER, MOON_ID, T0 - 3000, 'Moon', { visualGeneration: 'v3' }).map((t) => (t[0] === 'stage' ? ['stage', 'adult'] : t)) }, sk));
const profileNaming = (d: string, at: number) => wire(finalizeEvent({ kind: 11125, created_at: at, content: '', tags: updateBlobbonautTags(buildBlobbonautTags(OWNER), { current_companion: d }) }, sk));
const src = (id: string) => {
  const r = resolveBlobbi({ pubkey: OWNER, d: getCanonicalBlobbiD(OWNER, id) });
  if (!r.ok) throw new Error(r.error);
  return r.source;
};
const BOCA_SEED = src(BOCA_ID).seed;
const MOON_SEED = src(MOON_ID).seed;
const ISLAND = 'turtle:breezy-glade';
const SAVE_KEY = `blobbi-pixel-lab:save:v1:${ISLAND}`;
const SAVE = JSON.stringify({ version: 9, owner: 'local-world', world: ISLAND, buildings: [{ id: 'house' }], plots: [1, 2], inventory: { wood: 4 }, objectives: { done: ['first-home'] } });

// ─── Relays that behave like NRelay1 ────────────────────────────────────────────────────────────────────────────

type Cfg = { delay?: number; hang?: boolean; down?: boolean };
let open: Set<() => void> = new Set();
afterEach(() => {
  for (const close of open) close();
  open = new Set();
});
/** One connection per relay: answers by kind after `delay`, never (`hang`), or refuses (`down`); rejects on abort. */
function relaysWith(events: () => NostrEvent[], cfg: Record<string, Cfg> = {}) {
  const sent: string[] = [];
  const conn = (url: string): RelayConnection => ({
    query: (filters, { signal }) =>
      new Promise((resolve, reject) => {
        const c = cfg[url.replace('wss://', '')] ?? {};
        sent.push(JSON.stringify(['REQ', url, ...filters]));
        if (c.down) return reject(new Error('connection refused'));
        const abort = () => (clearTimeout(timer), reject(new DOMException('aborted', 'AbortError')));
        if (signal.aborted) return abort();
        signal.addEventListener('abort', abort, { once: true });
        const kinds = (filters[0] as { kinds: number[] }).kinds;
        const timer = c.hang ? undefined : setTimeout(() => resolve(events().filter((e) => kinds.includes(e.kind))), c.delay ?? 5);
        open.add(() => clearTimeout(timer));
      }),
    close: () => {},
  });
  return {
    sent,
    resolve: (timeoutMs = 300, graceMs?: number): Promise<CurrentBlobbiResult> =>
      resolveCurrentBlobbi(OWNER, { relays: READ_RELAYS, timeoutMs, profiles: relayBlobbonautReader({ open: conn, graceMs }), blobbis: relayBlobbiReader({ open: conn, graceMs }) }),
  };
}

// ─── One page load, as main.ts runs it ──────────────────────────────────────────────────────────────────────────

interface Device {
  store: KeyValueStore;
  walking: string;
  present?: () => Promise<boolean>;
  account?: () => { pubkey: string } | null;
}
/** Boca rosa walks Breezy Glade; her choice stamped `localAt` (ms) by the player, or unstamped when null. */
function device(localAt: number | null, walking = BOCA_SEED): Device {
  const store = memoryStore();
  store.set(SAVE_KEY, SAVE);
  storeSelection(store, src(walking === BOCA_SEED ? BOCA_ID : MOON_ID), { name: walking === BOCA_SEED ? 'Boca rosa' : 'Moon', account: OWNER }, localAt === null ? undefined : { at: localAt, by: 'player' });
  return { store, walking };
}
/** The facts `autoEnter` builds (main.ts), from this device and the answer, at `now` (ms). */
function factsFor(dev: Device, answer: CurrentBlobbiResult, now: number): EntryFacts {
  const rec = loadSelectionRecord(dev.store);
  const mineNow = rec && rec.source.seed === dev.walking;
  const existedBy = mineNow && rec.selectedAt == null ? noteUnstampedChoice(dev.store, now) : null;
  const item = answer.status === 'current' ? answer.blobbi : null;
  return {
    allowed: true,
    account: { pubkey: OWNER, present: true },
    islands: [{ identity: ISLAND, lastSeed: BOCA_SEED }],
    mine: new Set([BOCA_SEED, MOON_SEED]),
    walkingSeed: dev.walking,
    current: item ? { status: 'current', d: item.d, name: item.name, seed: item.seed, walkable: item.availability === 'available', at: currentSelectionAt(answer.status === 'current' ? answer.profileAt : null) } : { status: answer.status === 'current' ? 'unavailable' : answer.status },
    local: mineNow ? { at: rec.selectedAt ?? null, by: rec.selectedBy ?? null, existedBy } : null,
    now,
  };
}
/** A page load: the read starts at once (beside the identity check), the decision when both are in. */
async function load(dev: Device, read: () => Promise<CurrentBlobbiResult>, now: number) {
  const early = read();
  let used: EntryFacts | null = null;
  const run = await runEntry<CurrentBlobbiResult>({
    account: dev.account ?? (() => ({ pubkey: OWNER })),
    present: dev.present ?? (async () => true),
    current: () => early,
    waiting: () => true,
    facts: (_pk, _present, answer) => (used = factsFor(dev, answer, now)),
  });
  return { decision: run?.decision ?? null, answer: run?.answer ?? null, facts: used as EntryFacts | null };
}
const BRING_MOON = { kind: 'bring', island: ISLAND, d: MOON_D, name: 'Moon' };
const ENTER = { kind: 'enter', island: ISLAND };
const ASK_MOON = { kind: 'offer-switch', island: ISLAND, d: MOON_D, name: 'Moon' };

describe('M11D.8.4: the relay read keeps what arrived', () => {
  it('ROOT CAUSE: one relay slower than the deadline no longer erases the others\' answers (it used to read as offline)', async () => {
    const r = relaysWith(() => [boca, moon, profileNaming(MOON_D, T0)], { 'relay.dreamith.to': { hang: true } });
    const res = await r.resolve(200);
    expect(res.status).toBe('current');
    expect(res.status === 'current' && res.blobbi.name).toBe('Moon');
    expect(res.status === 'current' && res.partial).toBe(true);
  });
  it('queryRelays settles at the deadline with the relays that answered, and counts only them', async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 80);
    const res = await queryRelays(READ_RELAYS, { kinds: [31124] }, ac.signal, { open: (url) => ({ query: (f, o) => singleRelay(url, f, o), close: () => {} }) });
    expect(res.reachable).toBe(1);
    expect(res.events).toHaveLength(1);
  });
  it('with a grace period, a hanging relay costs the grace, not the whole deadline', async () => {
    const r = relaysWith(() => [boca, moon, profileNaming(MOON_D, T0)], { 'relay.dreamith.to': { hang: true } });
    const t = Date.now();
    const res = await r.resolve(5000, 100);
    expect(res.status).toBe('current');
    expect(Date.now() - t).toBeLessThan(1500);
  });
});
// A tiny relay for the queryRelays test above: ditto answers, primal hangs, dreamith is down; rejects on abort.
function singleRelay(url: string, _filters: Record<string, unknown>[], { signal }: { signal: AbortSignal }): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    if (url.includes('dreamith')) return reject(new Error('down'));
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    if (url.includes('ditto')) setTimeout(() => resolve([moon]), 5);
  });
}

describe('M11D.8.4: the regression scenarios', () => {
  const NOW = (T0 + 600) * 1000;

  it('A. Boca rosa chosen here, Moon set as companion later elsewhere: Moon comes along automatically', async () => {
    const dev = device(NOW - 30 * MIN);
    const r = relaysWith(() => [boca, moon, profileNaming(MOON_D, T0 + 300)]);
    expect((await load(dev, () => r.resolve(), NOW)).decision).toEqual(BRING_MOON);
  });

  it('B. a first and a second load with the same stored state and relays give the same decision, every time', async () => {
    for (const cfg of [{}, { 'relay.dreamith.to': { hang: true } }, { 'relay.primal.net': { delay: 120 } }] as Record<string, Cfg>[]) {
      const dev = device(NOW - 30 * MIN);
      const seen: (EntryDecision | null)[] = [];
      for (let i = 0; i < 4; i++) seen.push((await load(dev, () => relaysWith(() => [boca, moon, profileNaming(MOON_D, T0 + 300)], cfg).resolve(150), NOW)).decision);
      expect(seen, JSON.stringify(cfg)).toEqual(Array(4).fill(BRING_MOON));
    }
  });

  it('C. slow relays that answer within the wait: the decision is made with Moon, before any entry', async () => {
    const dev = device(NOW - 30 * MIN);
    const r = relaysWith(() => [boca, moon, profileNaming(MOON_D, T0 + 300)], { 'relay.ditto.pub': { delay: 150 }, 'relay.primal.net': { delay: 200 }, 'relay.dreamith.to': { delay: 250 } });
    const out = await load(dev, () => r.resolve(1000), NOW);
    expect(out.answer?.status).toBe('current');
    expect(out.decision).toEqual(BRING_MOON);
  });

  it('D. every relay times out: the device\'s Blobbi, no question, and no stamp written', async () => {
    const dev = device(NOW - 30 * MIN);
    const before = dev.store.get(SELECTION_KEY);
    const r = relaysWith(() => [boca, moon, profileNaming(MOON_D, T0 + 300)], { 'relay.ditto.pub': { hang: true }, 'relay.primal.net': { hang: true }, 'relay.dreamith.to': { hang: true } });
    const out = await load(dev, () => r.resolve(80), NOW);
    expect(out.answer).toEqual({ status: 'unavailable' });
    expect(out.decision).toEqual(ENTER);
    expect(dev.store.get(SELECTION_KEY)).toBe(before);
  });

  it('E. no profile at all and an unreachable profile are different outcomes (and neither invents a choice)', async () => {
    const none = await relaysWith(() => [boca, moon]).resolve();
    expect(none).toMatchObject({ status: 'no-selection', reason: 'no-profile' });
    const down = await relaysWith(() => [boca, moon, profileNaming(MOON_D, T0)], { 'relay.ditto.pub': { down: true }, 'relay.primal.net': { down: true }, 'relay.dreamith.to': { down: true } }).resolve();
    expect(down).toEqual({ status: 'unavailable' });
    // Moon's own state event alone (no profile) never makes Moon current.
    expect((await load(device(NOW - 30 * MIN), () => relaysWith(() => [boca, moon]).resolve(), NOW)).decision).toEqual(ENTER);
  });

  it('F. Boca rosa chosen here AFTER Moon was set elsewhere: Boca rosa stays', async () => {
    const dev = device(NOW - 2 * MIN);
    const r = relaysWith(() => [boca, moon, profileNaming(MOON_D, T0 - 1800)]);
    expect((await load(dev, () => r.resolve(), NOW)).decision).toEqual(ENTER);
  });

  it('G. reloads without any input never write a new stamp (a stamped record stays byte for byte)', async () => {
    const dev = device(NOW - 30 * MIN);
    const before = dev.store.get(SELECTION_KEY);
    for (let i = 0; i < 3; i++) await load(dev, () => relaysWith(() => [boca, moon, profileNaming(BOCA_D, T0)]).resolve(), NOW + i * MIN);
    expect(dev.store.get(SELECTION_KEY)).toBe(before);
  });

  it('G. an unstamped choice (from before M11D.8.3) gets its existed-by bound ONCE; later loads keep the first one', async () => {
    const dev = device(null);
    const r = () => relaysWith(() => [boca, moon]).resolve();
    await load(dev, r, NOW);
    const first = JSON.parse(dev.store.get(SELECTION_KEY)!);
    expect(first.existedBy).toBe(NOW);
    expect(first).not.toHaveProperty('selectedAt');
    await load(dev, r, NOW + 10 * MIN);
    expect(dev.store.get(SELECTION_KEY)).toBe(JSON.stringify(first));
  });

  it('H. two choices within the skew, a future-dated companion, or an unstamped choice older than nothing known: asked', async () => {
    const close = await load(device(NOW - 30_000), () => relaysWith(() => [boca, moon, profileNaming(MOON_D, Math.floor(NOW / 1000) - 10)]).resolve(), NOW);
    expect(close.decision).toEqual(ASK_MOON);
    expect(entryDiagnostic(close.decision!, close.facts, { status: 'current', partial: false }, 10, NOW)).toMatchObject({ order: 'ambiguous', reason: 'too-close', local: 'stamp-player' });
    const future = await load(device(NOW - 30 * MIN), () => relaysWith(() => [boca, moon, profileNaming(MOON_D, Math.floor(NOW / 1000) + 3600)]).resolve(), NOW);
    expect(future.decision).toEqual(ASK_MOON);
    // THE MANUAL CASE: an unstamped Boca rosa, Moon set BEFORE this device first saw her: still asked (cannot be ordered).
    const legacy = await load(device(null), () => relaysWith(() => [boca, moon, profileNaming(MOON_D, T0 + 300)]).resolve(), NOW);
    expect(legacy.decision).toEqual(ASK_MOON);
    expect(entryDiagnostic(legacy.decision!, legacy.facts, { status: 'current', partial: false }, 10, NOW)).toMatchObject({ order: 'ambiguous', reason: 'no-local-time', local: 'bound' });
  });

  it('H. the unstamped choice seen first, then Moon set later elsewhere: Moon comes along (the bound orders it)', async () => {
    const dev = device(null);
    await load(dev, () => relaysWith(() => [boca, moon]).resolve(), NOW); // the first load with this code: no profile yet
    const later = Math.floor((NOW + 10 * MIN) / 1000);
    expect((await load(dev, () => relaysWith(() => [boca, moon, profileNaming(MOON_D, later)]).resolve(), NOW + 15 * MIN)).decision).toEqual(BRING_MOON);
    // Within the skew of the bound: not ordered.
    const dev2 = device(null);
    await load(dev2, () => relaysWith(() => [boca, moon]).resolve(), NOW);
    expect((await load(dev2, () => relaysWith(() => [boca, moon, profileNaming(MOON_D, Math.floor(NOW / 1000) + 30)]).resolve(), NOW + 15 * MIN)).decision).toEqual(ASK_MOON);
  });

  it('H. answering the question stamps the choice and drops the bound', () => {
    const dev = device(null);
    noteUnstampedChoice(dev.store, NOW);
    markSelectionChosen(dev.store, NOW + MIN);
    const rec = JSON.parse(dev.store.get(SELECTION_KEY)!);
    expect(rec).toMatchObject({ selectedAt: NOW + MIN, selectedBy: 'player' });
    expect(rec).not.toHaveProperty('existedBy');
    expect(noteUnstampedChoice(dev.store, NOW + 2 * MIN)).toBeNull();
  });

  it('I. a slow extension: the read starts at once but nothing is decided before the identity answers; another key, nothing', async () => {
    let answered = false;
    const dev = device(NOW - 30 * MIN);
    dev.present = () => new Promise((r) => setTimeout(() => ((answered = true), r(true)), 120));
    let readStartedBeforeAnswer = false;
    const read = () => ((readStartedBeforeAnswer = !answered), relaysWith(() => [boca, moon, profileNaming(MOON_D, T0 + 300)]).resolve());
    expect((await load(dev, read, NOW)).decision).toEqual(BRING_MOON);
    expect(readStartedBeforeAnswer).toBe(true);
    const other = device(NOW - 30 * MIN);
    other.present = async () => false; // the extension answered with another key (`verifyExtension` -> mismatch)
    expect((await load(other, () => relaysWith(() => [boca, moon, profileNaming(MOON_D, T0 + 300)]).resolve(), NOW)).decision).toEqual({ kind: 'title', why: 'not-present' });
    // The account changed while waiting: the run stops (nothing decided, nothing entered).
    const switched = device(NOW - 30 * MIN);
    let who = OWNER;
    switched.account = () => ({ pubkey: who });
    switched.present = () => new Promise((r) => setTimeout(() => ((who = 'f'.repeat(64)), r(true)), 30));
    expect((await load(switched, () => relaysWith(() => [boca, moon, profileNaming(MOON_D, T0 + 300)]).resolve(), NOW)).decision).toBeNull();
  });

  it('J. Moon coming along never touches Breezy Glade\'s save; the island stays the identity\'s whoever came last', async () => {
    const dev = device(NOW - 30 * MIN);
    const out = await load(dev, () => relaysWith(() => [boca, moon, profileNaming(MOON_D, T0 + 300)]).resolve(), NOW);
    expect(out.decision).toEqual(BRING_MOON);
    // The adoption main.ts makes for `bring`: the choice, stamped with the remote time.
    storeSelection(dev.store, src(MOON_ID), { name: 'Moon', account: OWNER }, { at: currentSelectionAt(T0 + 300)!, by: 'remote' });
    expect(dev.store.get(SAVE_KEY)).toBe(SAVE);
    // The next load: Moon walks and is current: straight in, the save still untouched.
    const moonDev: Device = { store: dev.store, walking: MOON_SEED };
    expect((await load(moonDev, () => relaysWith(() => [boca, moon, profileNaming(MOON_D, T0 + 300)]).resolve(), NOW + MIN)).decision).toEqual(ENTER);
    expect(dev.store.get(SAVE_KEY)).toBe(SAVE);
  });

  it('the diagnostic record holds no key, no address and no name', async () => {
    const out = await load(device(NOW - 30 * MIN), () => relaysWith(() => [boca, moon, profileNaming(MOON_D, T0 + 300)]).resolve(), NOW);
    const diag = JSON.stringify(entryDiagnostic(out.decision!, out.facts, { status: 'current', partial: false }, 1234, NOW));
    expect(diag).not.toContain(OWNER);
    expect(diag).not.toContain(OWNER.slice(0, 12));
    expect(diag).not.toMatch(/Moon|Boca|blobbi-|breezy/i);
    expect(JSON.parse(diag)).toMatchObject({ decision: 'bring', order: 'remote', local: 'stamp-player', differs: true, waitedMs: 1234 });
  });

  it('nothing is ever sent but requests', async () => {
    const r = relaysWith(() => [boca, moon, profileNaming(MOON_D, T0 + 300)]);
    await load(device(NOW - 30 * MIN), () => r.resolve(), NOW);
    expect(r.sent.every((f) => f.startsWith('["REQ"'))).toBe(true);
    expect(r.sent.length).toBe(READ_RELAYS.length * 2);
  });
});

describe('M11D.8.4: the order rule itself', () => {
  const NOW = 1_770_000_000_000;
  it('a stamp orders both ways; a bound only finds the local choice older; nothing else is ever assumed', () => {
    expect(selectionOrder({ at: NOW - 10 * MIN, by: 'player' }, NOW - MIN, NOW)).toMatchObject({ order: 'remote', basis: 'stamp' });
    expect(selectionOrder({ at: NOW - MIN, by: 'player' }, NOW - 10 * MIN, NOW)).toMatchObject({ order: 'local', basis: 'stamp' });
    expect(selectionOrder({ at: null, by: null, existedBy: NOW - 10 * MIN }, NOW - MIN, NOW)).toMatchObject({ order: 'remote', basis: 'bound' });
    expect(selectionOrder({ at: null, by: null, existedBy: NOW - MIN }, NOW - 10 * MIN, NOW)).toMatchObject({ order: 'ambiguous', reason: 'no-local-time' });
    expect(selectionOrder({ at: null, by: null, existedBy: NOW - 10 * MIN }, NOW - 10 * MIN + SELECTION_SKEW_MS, NOW)).toMatchObject({ order: 'ambiguous' });
    expect(selectionOrder({ at: null, by: null, existedBy: NOW + 10 * MIN }, NOW, NOW)).toMatchObject({ order: 'ambiguous' });
    expect(selectionOrder(null, NOW - MIN, NOW)).toMatchObject({ order: 'ambiguous', reason: 'no-local-time', basis: 'none' });
    expect(selectionOrder({ at: NOW - MIN, by: 'player' }, null, NOW)).toMatchObject({ order: 'ambiguous', reason: 'no-remote-time' });
    expect(selectionOrder({ at: NOW - MIN, by: 'player' }, NOW + 10 * MIN, NOW)).toMatchObject({ order: 'ambiguous', reason: 'future' });
    expect(selectionOrder({ at: NOW - MIN, by: 'player' }, NOW - MIN, NaN)).toMatchObject({ order: 'ambiguous', reason: 'no-clock' });
  });
  it('the decision uses it: a bound newer than nothing never keeps the local choice silently', () => {
    const base: EntryFacts = { allowed: true, account: { pubkey: OWNER, present: true }, islands: [{ identity: ISLAND, lastSeed: BOCA_SEED }], mine: new Set([BOCA_SEED, MOON_SEED]), walkingSeed: BOCA_SEED, current: { status: 'current', d: MOON_D, name: 'Moon', seed: MOON_SEED, walkable: true, at: NOW - 10 * MIN }, now: NOW };
    expect(decideEntry({ ...base, local: { at: null, by: null, existedBy: NOW - MIN } })).toEqual(ASK_MOON);
    expect(decideEntry({ ...base, local: { at: null, by: null, existedBy: NOW - 20 * MIN } })).toEqual(BRING_MOON);
  });
});
