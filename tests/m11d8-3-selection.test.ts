// M11D.8.3, SMART BLOBBI SELECTION: which Blobbi comes along when the one chosen on this device and the one current
// across the Blobbi apps (kind 11125) differ. The most recent EXPLICIT choice wins when the two can be ordered
// reliably: the device's choice carries when and by whom it was made (`selectedAt`, `selectedBy`); the current one
// carries its profile event's `created_at`. A Blobbi's own state event (kind 31124) never decides. Unknown, equal,
// near-equal or future-dated times keep the safe question ("who comes along?"). Nothing here publishes.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from 'nostr-tools/pure';
import { buildBlobbonautTags, buildEggTags, getCanonicalBlobbiD, updateBlobbonautTags } from '@blobbi-kit/core';
import { compareSelections, currentSelectionAt, decideEntry, rememberStay, stayedWith, SELECTION_SKEW_MS, type EntryFacts } from '../src/game/world-entry';
import { loadSelectionRecord, markSelectionChosen, setSelectionStage, storeGuestSelection, storeSelection, SELECTION_KEY } from '../src/game/blobbi-selection';
import { recordVisit, lastVisitor, visitedBefore } from '../src/game/island-visits';
import { memoryStore } from '../src/game/persistence';
import { resolveBlobbi, sourceFromSeed } from '../src/blobbi/source';
import { resolveCurrentBlobbi } from '../src/nostr/current-blobbi';
import { READ_RELAYS } from '../src/nostr/relay-config';
import { babyStateTemplate } from '../src/nostr/canonical-events';
import { addGuestBlobbi } from '../src/game/guest-blobbis';

const MIN = 60_000;
const NOW = 1_760_000_000_000; // ms
const ME = 'a'.repeat(64);
const BOCA = { d: 'blobbi-aaaaaaaaaaaa-b0cab0cab0', name: 'Boca rosa', seed: 'seed-boca', walkable: true };
const MOON = { d: 'blobbi-aaaaaaaaaaaa-m00nm00nm0', name: 'Moon', seed: 'seed-moon', walkable: true };
const ISLAND = 'turtle:dewy-shell';

/** Dewy Shell, last visited by Boca rosa who walks now; Moon is current in the other worlds, chosen at `remoteAt`. */
const facts = (o: Partial<EntryFacts> & { remoteAt?: number | null; localAt?: number | null; by?: 'player' | 'remote' } = {}): EntryFacts => {
  const { remoteAt = NOW - 5 * MIN, localAt = NOW - 15 * MIN, by = 'player', ...rest } = o;
  return {
    allowed: true,
    account: { pubkey: ME, present: true },
    islands: [{ identity: ISLAND, lastSeed: BOCA.seed }],
    mine: new Set([BOCA.seed, MOON.seed]),
    walkingSeed: BOCA.seed,
    current: { status: 'current', ...MOON, at: remoteAt },
    local: localAt === null ? null : { at: localAt, by },
    now: NOW,
    ...rest,
  };
};
const ENTER = { kind: 'enter', island: ISLAND };
const BRING = { kind: 'bring', island: ISLAND, d: MOON.d, name: 'Moon' };
const ASK = { kind: 'offer-switch', island: ISLAND, d: MOON.d, name: 'Moon' };

describe('M11D.8.3: ordering two choices', () => {
  it('a clear gap, both in the past: the newer one; a missing time, a near-equal time or a future time: ambiguous', () => {
    expect(compareSelections(NOW - 15 * MIN, NOW - 5 * MIN, NOW)).toBe('remote');
    expect(compareSelections(NOW - 5 * MIN, NOW - 15 * MIN, NOW)).toBe('local');
    expect(compareSelections(NOW - 5 * MIN, NOW - 5 * MIN, NOW)).toBe('ambiguous');
    expect(compareSelections(NOW - 5 * MIN, NOW - 5 * MIN + SELECTION_SKEW_MS, NOW)).toBe('ambiguous');
    expect(compareSelections(NOW - 5 * MIN, NOW - 5 * MIN + SELECTION_SKEW_MS + 1, NOW)).toBe('remote');
    expect(compareSelections(null, NOW - 5 * MIN, NOW)).toBe('ambiguous');
    expect(compareSelections(NOW - 5 * MIN, null, NOW)).toBe('ambiguous');
    // Clock skew: a choice stamped in the future of this device (beyond the skew) cannot be ordered.
    expect(compareSelections(NOW - 5 * MIN, NOW + 2 * MIN, NOW)).toBe('ambiguous');
    expect(compareSelections(NOW + 2 * MIN, NOW - 5 * MIN, NOW)).toBe('ambiguous');
    // Within the skew of now (another device slightly ahead): still ordered.
    expect(compareSelections(NOW - 5 * MIN, NOW + 30_000, NOW)).toBe('remote');
    expect(compareSelections(NaN, NOW, NOW)).toBe('ambiguous');
    expect(compareSelections(NOW - MIN, NOW - 10 * MIN, NaN)).toBe('ambiguous');
  });

  it('the profile time is in seconds and becomes milliseconds; nonsense becomes nothing', () => {
    expect(currentSelectionAt(1_760_000_000)).toBe(1_760_000_000_000);
    expect(currentSelectionAt(1_760_000_000.9)).toBe(1_760_000_000_000);
    expect(currentSelectionAt(0)).toBeNull();
    expect(currentSelectionAt(-5)).toBeNull();
    expect(currentSelectionAt(NaN)).toBeNull();
    expect(currentSelectionAt(null)).toBeNull();
    expect(currentSelectionAt(undefined)).toBeNull();
  });
});

describe('M11D.8.3: who comes along (the brief\'s examples)', () => {
  it('A. Boca rosa chosen here at 14:00, Moon in another app at 14:10, Pixel at 14:15: Moon comes along, no question', () => {
    expect(decideEntry(facts({ localAt: NOW - 15 * MIN, remoteAt: NOW - 5 * MIN }))).toEqual(BRING);
  });
  it('B. Moon at 14:00 elsewhere, Boca rosa chosen here at 14:10, a reload at 14:15: Boca rosa stays', () => {
    expect(decideEntry(facts({ remoteAt: NOW - 15 * MIN, localAt: NOW - 5 * MIN }))).toEqual(ENTER);
  });
  it('C. a newer kind 31124 for Boca rosa changes nothing: only the profile\'s time counts', async () => {
    // The resolver: the profile (Moon, older) and a Boca rosa state event newer than it: `profileAt` is the profile's.
    const sk = generateSecretKey();
    const owner = getPublicKey(sk);
    const at = 1_760_000_000;
    const wire = (e: NostrEvent): NostrEvent => JSON.parse(JSON.stringify(e));
    const moon = finalizeEvent({ kind: 31124, created_at: at, content: '', tags: buildEggTags(owner, '0a0a0a0a0a', at, 'Moon', { visualGeneration: 'v3' }).map((t) => (t[0] === 'stage' ? ['stage', 'adult'] : t)) }, sk);
    const bocaNewer = finalizeEvent(babyStateTemplate({ owner, petId: 'b0cab0cab0', name: 'Boca rosa', bornAt: at }, at + 900), sk);
    const profile = finalizeEvent({ kind: 11125, created_at: at + 600, content: '', tags: updateBlobbonautTags(buildBlobbonautTags(owner), { current_companion: getCanonicalBlobbiD(owner, '0a0a0a0a0a') }) }, sk);
    const r = await resolveCurrentBlobbi(owner, {
      relays: READ_RELAYS,
      timeoutMs: 200,
      profiles: { readBlobbonaut: async () => ({ events: [wire(profile)], reachable: 3 }) },
      blobbis: { readBlobbis: async () => ({ events: [wire(moon), wire(bocaNewer)], reachable: 3 }) },
    });
    expect(r.status).toBe('current');
    expect(r.status === 'current' && r.blobbi.name).toBe('Moon');
    expect(r.status === 'current' && r.profileAt).toBe(at + 600);
    // With Boca rosa chosen here at 14:00 and the profile at 14:10, the decision is Moon's: the state event at 14:15 is irrelevant.
    expect(decideEntry(facts({ localAt: (at - 600) * 1000, remoteAt: currentSelectionAt(at + 600), now: (at + 1200) * 1000 }))).toEqual(BRING);
  });
  it('D. Moon came along by the remote choice, then a reload: the same Blobbi, straight in, no new stamp', () => {
    // The device's choice is Moon, stamped with the remote choice's own time: a reload compares nothing (same Blobbi).
    expect(decideEntry(facts({ walkingSeed: MOON.seed, localAt: NOW - 5 * MIN, by: 'remote', remoteAt: NOW - 5 * MIN }))).toEqual(ENTER);
  });
  it('E. Boca rosa chosen here at 14:10 over Moon (14:00), then Moon again elsewhere at 14:20: Moon comes along again', () => {
    expect(decideEntry(facts({ remoteAt: NOW - 20 * MIN, localAt: NOW - 10 * MIN }))).toEqual(ENTER);
    expect(decideEntry(facts({ remoteAt: NOW, localAt: NOW - 10 * MIN }))).toEqual(BRING);
  });
  it('the remote choice adopted here, then an even newer remote choice: it follows; an older (stale) one does not', () => {
    expect(decideEntry(facts({ walkingSeed: MOON.seed, localAt: NOW - 5 * MIN, by: 'remote', current: { status: 'current', ...BOCA, at: NOW - MIN } }))).toEqual({ kind: 'bring', island: ISLAND, d: BOCA.d, name: 'Boca rosa' });
    expect(decideEntry(facts({ walkingSeed: MOON.seed, localAt: NOW - 5 * MIN, by: 'remote', current: { status: 'current', ...BOCA, at: NOW - 30 * MIN } }))).toEqual(ENTER);
  });
});

describe('M11D.8.3: the safe question stays when nothing reliable says otherwise', () => {
  it('matching choices: straight in, nothing compared', () => {
    expect(decideEntry(facts({ walkingSeed: MOON.seed, localAt: null }))).toEqual(ENTER);
  });
  it('a choice made before M11D.8.3 (no time): asked, as before; the answer is remembered', () => {
    expect(decideEntry(facts({ localAt: null }))).toEqual(ASK);
    const store = memoryStore();
    rememberStay(store, ISLAND, ME, MOON.d, NOW);
    expect(decideEntry(facts({ localAt: null, stayed: (i, d) => stayedWith(store, i, ME, d) }))).toEqual(ENTER);
  });
  it('no current choice known (no profile, no companion, missing, offline): the device\'s Blobbi, no question', () => {
    for (const status of ['no-selection', 'missing', 'unavailable'] as const) expect(decideEntry(facts({ current: { status } }))).toEqual(ENTER);
    expect(decideEntry(facts({ current: { status: 'current', ...MOON, at: null } }))).toEqual(ASK);
  });
  it('equal, near-equal, future-dated or skewed times: asked; the remembered answer then holds', () => {
    expect(decideEntry(facts({ localAt: NOW - 5 * MIN, remoteAt: NOW - 5 * MIN }))).toEqual(ASK);
    expect(decideEntry(facts({ localAt: NOW - 5 * MIN, remoteAt: NOW - 5 * MIN + 30_000 }))).toEqual(ASK);
    expect(decideEntry(facts({ localAt: NOW - 5 * MIN, remoteAt: NOW + 60 * MIN }))).toEqual(ASK);
    expect(decideEntry(facts({ localAt: NOW + 60 * MIN, remoteAt: NOW - 5 * MIN }))).toEqual(ASK);
    expect(decideEntry(facts({ now: undefined }))).toEqual(ASK);
    const store = memoryStore();
    rememberStay(store, ISLAND, ME, MOON.d, NOW);
    expect(decideEntry(facts({ localAt: NOW - 5 * MIN, remoteAt: NOW + 60 * MIN, stayed: (i, d) => stayedWith(store, i, ME, d) }))).toEqual(ENTER);
  });
  it('an egg or a Blobbi that cannot walk never comes along, whatever its time', () => {
    expect(decideEntry(facts({ current: { status: 'current', ...MOON, walkable: false, at: NOW - MIN } }))).toEqual(ENTER);
    expect(decideEntry(facts({ current: { status: 'current', ...MOON, seed: null, at: NOW - MIN } }))).toEqual(ENTER);
  });
  it('several islands: the islands page; no island: a new adventure with the current Blobbi; another identity: the title', () => {
    expect(decideEntry(facts({ islands: [{ identity: 'a', lastSeed: BOCA.seed }, { identity: 'b', lastSeed: MOON.seed }], remoteAt: NOW - MIN }))).toEqual({ kind: 'choose-island', islands: ['a', 'b'] });
    expect(decideEntry(facts({ islands: [], remoteAt: NOW - MIN }))).toEqual({ kind: 'welcome', d: MOON.d, name: 'Moon' });
    expect(decideEntry(facts({ account: { pubkey: ME, present: false }, remoteAt: NOW - MIN }))).toEqual({ kind: 'title', why: 'not-present' });
    expect(decideEntry(facts({ islands: [{ identity: ISLAND, lastSeed: 'someone-else' }], remoteAt: NOW - MIN }))).toEqual({ kind: 'title', why: 'not-mine' });
  });
});

describe('M11D.8.3: the stored choice says when and by whom', () => {
  const PK = ME;
  const d = getCanonicalBlobbiD(PK, 'b0cab0cab0');
  const src = () => {
    const r = resolveBlobbi({ pubkey: PK, d });
    if (!r.ok) throw new Error(r.error);
    return r.source;
  };
  it('a choice with its moment is stamped; without one, the record is exactly as before (older readers unchanged)', () => {
    const store = memoryStore();
    storeSelection(store, src(), { name: 'Boca rosa', account: PK }, { at: NOW, by: 'player' });
    expect(JSON.parse(store.get(SELECTION_KEY)!)).toEqual({ version: 1, source: src(), name: 'Boca rosa', account: PK, selectedAt: NOW, selectedBy: 'player' });
    expect(loadSelectionRecord(store)).toMatchObject({ selectedAt: NOW, selectedBy: 'player' });
    storeSelection(store, src(), { name: 'Boca rosa', account: PK });
    expect(JSON.parse(store.get(SELECTION_KEY)!)).toEqual({ version: 1, source: src(), name: 'Boca rosa', account: PK });
    expect(loadSelectionRecord(store)).not.toHaveProperty('selectedAt');
  });
  it('companion sync: a stage refreshed from another app changes only the stage, never the choice (time, origin, profile)', () => {
    const store = memoryStore();
    const synced = { id: 'c'.repeat(64), createdAt: 1_700_000_000 };
    const over = { id: 'd'.repeat(64), createdAt: 1_699_999_000, d: 'x' };
    storeSelection(store, src(), { name: 'Boca rosa', account: PK, stage: 'baby' }, { at: NOW - 5 * MIN, by: 'remote', synced, over });
    const before = JSON.parse(store.get(SELECTION_KEY)!);
    setSelectionStage(store, `31124:${PK}:${d}`, 'adult');
    const after = JSON.parse(store.get(SELECTION_KEY)!);
    expect(after).toEqual({ ...before, stage: undefined } as never);
    expect(after).not.toHaveProperty('stage');
    expect(loadSelectionRecord(store)).toMatchObject({ selectedAt: NOW - 5 * MIN, selectedBy: 'remote', synced, stage: 'adult' });
    // Another Blobbi's address: the record is left alone
    setSelectionStage(store, `31124:${PK}:other`, 'baby');
    expect(JSON.parse(store.get(SELECTION_KEY)!)).toEqual(after);
  });
  it('a remote adoption carries the remote choice\'s own time; nonsense stamps are dropped', () => {
    const store = memoryStore();
    storeSelection(store, src(), { name: 'Boca rosa', account: PK }, { at: NOW - 5 * MIN, by: 'remote' });
    expect(loadSelectionRecord(store)).toMatchObject({ selectedAt: NOW - 5 * MIN, selectedBy: 'remote' });
    storeSelection(store, src(), { name: 'Boca rosa', account: PK }, { at: NaN, by: 'player' });
    expect(loadSelectionRecord(store)).not.toHaveProperty('selectedBy');
    storeSelection(store, src(), { name: 'Boca rosa', account: PK }, { at: NOW, by: 'robot' as 'player' });
    expect(loadSelectionRecord(store)).not.toHaveProperty('selectedBy');
    // A damaged stamp in storage reads as unknown, never as a time.
    store.set(SELECTION_KEY, JSON.stringify({ version: 1, source: src(), name: 'Boca rosa', account: PK, selectedAt: 'yesterday', selectedBy: 'player' }));
    expect(loadSelectionRecord(store)).toMatchObject({ name: 'Boca rosa' });
    expect(loadSelectionRecord(store)).not.toHaveProperty('selectedAt');
  });
  it('CONTINUE WITH (staying) stamps the stored choice as the player\'s, now, changing nothing else', () => {
    const store = memoryStore();
    storeSelection(store, src(), { name: 'Boca rosa', account: PK, stage: 'baby' }, { at: NOW - 60 * MIN, by: 'remote' });
    markSelectionChosen(store, NOW);
    expect(JSON.parse(store.get(SELECTION_KEY)!)).toEqual({ version: 1, source: src(), name: 'Boca rosa', account: PK, stage: 'baby', selectedAt: NOW, selectedBy: 'player' });
    // An empty or damaged store: nothing happens.
    const empty = memoryStore();
    markSelectionChosen(empty, NOW);
    expect(empty.get(SELECTION_KEY)).toBeNull();
    empty.set(SELECTION_KEY, '{not json');
    markSelectionChosen(empty, NOW);
    expect(empty.get(SELECTION_KEY)).toBe('{not json');
  });
  it('a Blobbi met here (a guest record) is stamped the same way; the visiting Blobbi too', () => {
    const store = memoryStore();
    addGuestBlobbi(store, { owner: PK, ownerKind: 'guest', petId: 'b0cab0cab0', d, name: 'Boca rosa', createdAt: 1, bornAt: 1, island: null, born: true, activatedAt: null, named: true } as Parameters<typeof addGuestBlobbi>[1]);
    storeGuestSelection(store, src(), 'baby', { at: NOW, by: 'player' });
    expect(loadSelectionRecord(store)).toMatchObject({ guest: true, selectedAt: NOW, selectedBy: 'player' });
    storeSelection(store, sourceFromSeed('blobbi-9'), undefined, { at: NOW, by: 'player' });
    expect(loadSelectionRecord(store)).toMatchObject({ source: { kind: 'demo' }, selectedAt: NOW, selectedBy: 'player' });
  });
  it('the choice lives beside the islands, never in one: no island key is touched by any of it', () => {
    const store = memoryStore();
    store.set('blobbi-pixel-lab:save:v1:dewy', '{"version":9,"buildings":[1]}');
    storeSelection(store, src(), { name: 'Boca rosa', account: PK }, { at: NOW, by: 'remote' });
    markSelectionChosen(store, NOW + 1);
    recordVisit(store, 'dewy', { seed: MOON.seed, name: 'Moon', stage: 'adult' });
    expect(store.get('blobbi-pixel-lab:save:v1:dewy')).toBe('{"version":9,"buildings":[1]}');
  });
});

describe('M11D.8.3: islands and their visitors', () => {
  it('a new visitor replaces who came last and joins the ones seen; the earlier visitor is not forgotten', () => {
    const store = memoryStore();
    recordVisit(store, ISLAND, { seed: BOCA.seed, name: 'Boca rosa', stage: 'baby' });
    recordVisit(store, ISLAND, { seed: MOON.seed, name: 'Moon', stage: 'adult' });
    expect(lastVisitor(store, ISLAND)).toEqual({ seed: MOON.seed, name: 'Moon', stage: 'adult' });
    expect(visitedBefore(store, ISLAND, BOCA.seed)).toBe(true);
    expect(visitedBefore(store, ISLAND, MOON.seed)).toBe(true);
    // Both are the identity's: the island stays theirs whichever came last.
    for (const last of [BOCA.seed, MOON.seed]) expect(decideEntry(facts({ islands: [{ identity: ISLAND, lastSeed: last }], walkingSeed: MOON.seed, localAt: null }))).toEqual(ENTER);
  });
});

describe('M11D.8.3: the wiring in main.ts', () => {
  const src = readFileSync('src/playground/main.ts', 'utf8');
  const between = (a: string, b: string) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));
  it('a reload, the account sync and the automatic entry never stamp a choice; only the player\'s acts and a remote adoption do', () => {
    const sync = between('function syncAccountBlobbi', 'account.onChange');
    expect(sync).not.toMatch(/storeSelection\(|selectBlobbi\(|storeGuestSelection\(|markSelectionChosen\(/);
    expect(sync).toMatch(/applyBlobbi\(/);
    const carry = between('function carryOut', 'async function autoEnter');
    // Companion sync: an adopted choice also keeps the profile event it came from (`synced`), so it is never shared again
    expect(carry).toMatch(/case 'bring':[\s\S]*choose\(item, \{ at: currentAt \?\? Date\.now\(\), by: 'remote', synced \}\)/);
    expect(carry).toMatch(/bring: \(\) => \{\s*if \(item && blobbisScreen\.chooser\?\.choose\(item, playerNow\(\)\)\)/);
    expect(carry).toMatch(/keep: \(\) => \{[\s\S]*markSelectionChosen\(store, Date\.now\(\), seenNow\(\)\);/);
    expect(src).toMatch(/choose: \(b, when = playerNow\(\)\) =>/);
    expect(src).toMatch(/function selectBlobbi\(source: BlobbiSource, from\?: [^)]*, when: SelectionWhen = playerNow\(\)\)/);
  });
  it('the entry facts carry the device\'s choice and the profile\'s time in milliseconds, with this device\'s clock', () => {
    const auto = between('async function autoEnter', 'blobbisScreen.onChosen');
    expect(auto).toMatch(/const mineNow = rec && rec\.source\.seed === state\.blobbi\.seed;/);
    expect(auto).toMatch(/const local = mineNow \? \{ at: rec\.selectedAt \?\? null, by: rec\.selectedBy \?\? null, existedBy, synced: rec\.synced \?\? null, over: rec\.over \?\? null \} : null;/);
    expect(auto).toMatch(/at: answer\.status === 'current' \? currentSelectionAt\(answer\.profileAt\) : null/);
    expect(auto).toMatch(/const now = Date\.now\(\);/);
    expect(auto).toMatch(/\n\s+now,\n/);
    // Never the Blobbi's own state time.
    expect(auto).not.toMatch(/blobbi\.updatedAt/);
  });
  it('nothing new is published: no publisher, signer or EVENT reaches the entry, the chooser or the stamp', () => {
    const region = src.slice(src.indexOf('/** The pixel seed a Blobbi of the account walks with'), src.indexOf('Make a new island'));
    expect(region).not.toMatch(/publish|signEvent|accountSigner|Publisher/);
  });
});
