/**
 * ARRIVING THROUGH WORLD TRAVEL (2026-10-20): a player whose Blobbi was moved here by Home or Island opens Pixel's
 * plain address and must land in play, where the opening's own move brings the Blobbi in with the teleport's arrival.
 * The entry (`src/game/world-entry.ts`) already goes straight in for a connected player with their island; what left
 * players on the menu was a browser extension answering for the account AFTER the entry's wait (a permission prompt):
 * `entrySecondChance` runs the entry once more then, and only then.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decideEntry, entrySecondChance, type EntryDecision, type EntryFacts } from '../src/game/world-entry';
import { LiveWorld } from '../src/sim/live-world';
import { memoryStore, saveKey } from '../src/game/persistence';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { ARRIVE } from '../src/game/teleport';

const ME = 'a'.repeat(64);
const ISLAND = 'seed=island-dune-8896|kind=turtle|turtle=turtle-fern-9200|variant=4|704x560|scale=1.6|palette=cozy|density=1|islands=1|house=none';
const facts = (o: Partial<EntryFacts> = {}): EntryFacts => ({ allowed: true, linked: null, account: { pubkey: ME, present: true }, islands: [{ identity: ISLAND, lastSeed: 'boca-seed' }], mine: new Set(['boca-seed']), walkingSeed: 'boca-seed', current: { status: 'unavailable' }, now: Date.now(), ...o });
const NOT_PRESENT: EntryDecision = { kind: 'title', why: 'not-present' };
const chance = (o: Partial<Parameters<typeof entrySecondChance>[0]> = {}) => entrySecondChance({ first: NOT_PRESENT, firstPubkey: ME, pubkey: ME, extension: 'verified', titleActive: true, titleTouched: false, playing: false, taken: false, ...o });

describe('arrival with an existing playable save', () => {
  it('a connected player whose island is here goes straight in: the decision is `enter` for that island (the same save, nothing created)', () => {
    expect(decideEntry(facts())).toEqual({ kind: 'enter', island: ISLAND });
    // The identity in the vault answers at once; with the extension, once it answers for the account
    expect(decideEntry(facts({ account: { pubkey: ME, present: true } }))).toEqual({ kind: 'enter', island: ISLAND });
  });

  it('the extension answering after the entry\'s wait: the first run is `not-present` (the menu), and the second chance runs it again, once', () => {
    expect(decideEntry(facts({ account: { pubkey: ME, present: false } }))).toEqual(NOT_PRESENT);
    expect(chance()).toBe(true);
    expect(chance({ taken: true })).toBe(false);
  });

  it('the second chance never fires for another reason, another account, an unverified extension, a touched title, or play already on', () => {
    expect(chance({ first: { kind: 'title', why: 'not-mine' } })).toBe(false);
    expect(chance({ first: { kind: 'title', why: 'nothing-to-bring' } })).toBe(false);
    expect(chance({ first: { kind: 'enter', island: ISLAND } })).toBe(false);
    expect(chance({ first: null })).toBe(false);
    expect(chance({ pubkey: 'b'.repeat(64) })).toBe(false);
    expect(chance({ pubkey: null })).toBe(false);
    expect(chance({ extension: 'unconfirmed' })).toBe(false);
    expect(chance({ extension: 'mismatch' })).toBe(false);
    expect(chance({ extension: null })).toBe(false); // a vault identity never needs it
    expect(chance({ titleTouched: true })).toBe(false);
    expect(chance({ titleActive: false })).toBe(false);
    expect(chance({ playing: true })).toBe(false);
  });
});

describe('arrival without an existing save, and a normal launch', () => {
  it('no island on this device: the welcome back page with the current Blobbi, or the title; never an island made for them', () => {
    expect(decideEntry(facts({ islands: [], current: { status: 'current', d: 'd1', name: 'Boca rosa', seed: 'boca-seed', walkable: true } }))).toEqual({ kind: 'welcome', d: 'd1', name: 'Boca rosa' });
    expect(decideEntry(facts({ islands: [] }))).toEqual({ kind: 'title', why: 'nothing-to-bring' });
    // An island another identity or a guest played last is not entered for this one
    expect(decideEntry(facts({ islands: [{ identity: ISLAND, lastSeed: 'someone-else' }] }))).toEqual({ kind: 'title', why: 'not-mine' });
  });

  it('a guest or a disconnected player: the title as always, and no second chance', () => {
    expect(decideEntry(facts({ account: null }))).toEqual({ kind: 'title', why: 'guest' });
    expect(chance({ first: { kind: 'title', why: 'guest' } })).toBe(false);
  });

  it('a normal launch without World Travel is the same decision: the entry does not read where the Blobbi is', () => {
    // The facts carry nothing about World Travel: the island opens the same way, and the Blobbi\'s place is the
    // travel host\'s business once play is on (here or away, settled or arriving)
    expect(decideEntry(facts())).toEqual({ kind: 'enter', island: ISLAND });
    const src = readFileSync('src/game/world-entry.ts', 'utf8');
    expect(src).not.toMatch(/31126|WorldLocation|world-travel-departure/);
  });

  it('the page wires the second chance: the first run is kept, the account change runs the entry again once', () => {
    const main = readFileSync('src/playground/main.ts', 'utf8');
    expect(main).toMatch(/if \(run\) entryFirst = \{ decision: run\.decision, pubkey: run\.pubkey \};/);
    expect(main).toMatch(/async function autoEnter\(again = false\): Promise<void> \{\n  if \(entryTried && !again\) return;/);
    expect(main).toMatch(/if \(!entrySecondChance\(\{ first: entryFirst\?\.decision \?\? null, firstPubkey: entryFirst\?\.pubkey \?\? null, pubkey: s\.status === 'connected' \? \(s\.pubkey \?\? null\) : null, extension: s\.extension \?\? null, titleActive: state\.mode === 'play' && title\.active && !intro && !entry\.active, titleTouched: title\.touched, playing: playStarted, taken: entrySecondTaken \}\)\) return;\n  entrySecondTaken = true;/);
    expect(main.match(/void autoEnter\(true\)/g)).toHaveLength(1);
  });
});

describe('the arrival in play keeps the island as it was', () => {
  it('an away Blobbi arriving by the teleport: absent, then arriving for the teleport\'s time, then present; the save unchanged by it', () => {
    const store = memoryStore();
    const live = new LiveWorld(generateWhaleWorld('island-arrival-1', { carrierSeed: 'w', generatedHouse: false }), 'boca-seed', 16, { store });
    live.brain.enabled = false;
    live.inventory.add('stick', 3);
    live.save();
    const before = store.get(saveKey(live.identity))!;
    expect(live.settleBlobbi('absent')).toBe('absent');
    expect(live.enterBlobbi()).toBe(true);
    expect(live.getPresenceState()).toBe('arriving');
    const t0 = live.clock.time;
    const input = { up: false, down: false, left: false, right: false, interact: false, plant: false };
    while (live.clock.time < t0 + ARRIVE.end + 0.5) live.step(input);
    expect(live.getPresenceState()).toBe('present');
    live.save();
    const after = JSON.parse(store.get(saveKey(live.identity))!);
    const was = JSON.parse(before);
    expect(after.inventory).toEqual(was.inventory);
    expect(after.islandName ?? null).toEqual(was.islandName ?? null);
    expect([...store.data.keys()].filter((k) => k.startsWith('blobbi-pixel-lab:save:'))).toHaveLength(1);
  });
});
