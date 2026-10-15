// M11D.8 FIX, THE INTERMITTENT TITLE: a returning connected player sometimes stopped on the main menu. Root cause:
// while an island is played the game writes it into the address bar (`#seed=...&mode=play&...`, `saveHash`), and
// the automatic entry treated ANY `#seed` as a link from someone else, so a reload from inside the island kept the
// title; that load wrote `#mode=play` back, so the next reload went in. These tests replay the start of play
// (`entryAddress`, `runEntry`, `decideEntry`) with the real resolver over offline relays, in every completion order.
import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from 'nostr-tools/pure';
import { buildEggTags, getCanonicalBlobbiD, getCanonicalBlobbonautD } from '@blobbi-kit/core';
import { decideEntry, entryAddress, runEntry, type EntryFacts, type EntryHost } from '../src/game/world-entry';
import { resolveCurrentBlobbi, type CurrentBlobbiResult as CurrentBlobbi } from '../src/nostr/current-blobbi';
import { READ_RELAYS } from '../src/nostr/relay-config';
import type { ProfileReadResult } from '../src/nostr/relays';
import { readFileSync } from 'node:fs';

const sk = generateSecretKey();
const ME = getPublicKey(sk);
const OTHER = getPublicKey(generateSecretKey());
const at = 1_760_000_100;
const pet = (id: string, name: string, stage: 'baby' | 'adult') => finalizeEvent({ kind: 31124, created_at: at, content: '', tags: buildEggTags(ME, id, at, name, { visualGeneration: 'v3' }).map((t) => (t[0] === 'stage' ? ['stage', stage] : t)) }, sk);
const PUDDING = pet('a1b2c3d4e5', 'Pudding', 'baby');
const MOCHI = pet('b1b2c3d4e5', 'Mochi', 'adult');
const profileNaming = (id: string) => finalizeEvent({ kind: 11125, created_at: at + 100, content: '', tags: [['d', getCanonicalBlobbonautD(ME)], ['b', 'blobbi:ecosystem:v1'], ['current_companion', getCanonicalBlobbiD(ME, id)], ['client', 'Blobbi']] }, sk);
const wire = (e: NostrEvent): NostrEvent => JSON.parse(JSON.stringify(e));

/** The address the game itself writes while an island is played (`saveHash` in main.ts), and the island it names. */
const ISLAND = 'seed=island-dune-8896|kind=turtle|turtle=turtle-fern-9200|variant=4|704x560|scale=1.6|palette=cozy|density=1|islands=1|house=none';
const OWN_ADDRESS = `seed=island-dune-8896&mode=play&pubkey=${ME}&d=${encodeURIComponent(getCanonicalBlobbiD(ME, 'a1b2c3d4e5'))}&kind=turtle&turtle=turtle-fern-9200&variant=4&house=none`;
const hash = (h: string) => new URLSearchParams(h.replace(/^#/, ''));

/** Offline relays for the resolver: answer at once, never (`hang`), on `release()` (`gate`), or not reachable. */
function relays(o: { profile?: NostrEvent | null; hang?: boolean; gate?: boolean; down?: boolean } = {}) {
  let releases: (() => void)[] = [];
  const reads: string[] = [];
  const answer = (events: NostrEvent[]): Promise<ProfileReadResult> => {
    const r = { events: events.map(wire), reachable: o.down ? 0 : READ_RELAYS.length };
    if (o.hang) return new Promise(() => {});
    if (o.gate) return new Promise((res) => releases.push(() => res(r)));
    return Promise.resolve(r);
  };
  return {
    reads,
    release: () => (releases.forEach((r) => r()), (releases = [])),
    resolve: (pubkey: string, timeoutMs = 60) =>
      resolveCurrentBlobbi(pubkey, {
        relays: READ_RELAYS,
        timeoutMs,
        profiles: { readBlobbonaut: () => (reads.push('profile'), answer(o.profile === null || o.down ? [] : [o.profile ?? profileNaming('a1b2c3d4e5')])) },
        blobbis: { readBlobbis: () => (reads.push('blobbis'), answer(o.down ? [] : [PUDDING, MOCHI])) },
      }),
  };
}

/** One page load's device state: the island Pudding played last, Pudding walking, the account connected. */
interface Device {
  account: { pubkey: string } | null;
  present: boolean;
  touched: boolean;
  islands: { identity: string; lastSeed: string | null }[];
  walking: string;
  local: string[];
}
const PUDDING_SEED = 'pudding-seed';
const device = (o: Partial<Device> = {}): Device => ({ account: { pubkey: ME }, present: true, touched: false, islands: [{ identity: ISLAND, lastSeed: PUDDING_SEED }], walking: PUDDING_SEED, local: [PUDDING_SEED], ...o });

/** The host as main.ts builds it, over one device; `address` is the page's hash. */
function host(dev: Device, address: string, current: (pubkey: string) => Promise<CurrentBlobbi>, o: { present?: () => Promise<boolean> } = {}): EntryHost<CurrentBlobbi> & { calls: string[] } {
  const a = entryAddress(hash(address));
  const calls: string[] = [];
  const seedOf = (d: string) => (d === getCanonicalBlobbiD(ME, 'a1b2c3d4e5') ? PUDDING_SEED : d === getCanonicalBlobbiD(ME, 'b1b2c3d4e5') ? 'mochi-seed' : null);
  return {
    calls,
    account: () => dev.account,
    present: (pk) => (calls.push(`present:${pk.slice(0, 4)}`), o.present ? o.present() : Promise.resolve(dev.present)),
    current: (pk) => (calls.push(`current:${pk.slice(0, 4)}`), current(pk)),
    waiting: () => a.allowed && !dev.touched,
    facts: (pubkey, present, answer): EntryFacts => {
      const mine = new Set(dev.local);
      if (answer.status !== 'unavailable') for (const b of answer.items) if (seedOf(b.d)) mine.add(seedOf(b.d)!);
      const item = answer.status === 'current' ? answer.blobbi : null;
      return {
        allowed: true,
        linked: a.linked ? (address.includes('island-dune') ? ISLAND : 'elsewhere') : null,
        account: { pubkey, present },
        islands: dev.islands,
        mine,
        walkingSeed: dev.walking,
        current: item ? { status: 'current', d: item.d, name: item.name, seed: seedOf(item.d), walkable: item.availability === 'available' } : { status: answer.status === 'current' ? 'unavailable' : answer.status },
      };
    },
  };
}
const ENTER = { kind: 'enter', island: ISLAND };

describe('M11D.8 fix: the root cause (the game\'s own address after a reload)', () => {
  it('the address written while playing is not a foreign link: a reload from inside the island goes back in', async () => {
    expect(entryAddress(hash(OWN_ADDRESS))).toEqual({ allowed: true, linked: true });
    const r = relays();
    expect((await runEntry(host(device(), OWN_ADDRESS, (pk) => r.resolve(pk))))?.decision).toEqual(ENTER);
  });

  it('twenty reloads with identical local state, alternating the two addresses the game writes: the same entry every time', async () => {
    const seen: unknown[] = [];
    for (let i = 0; i < 20; i++) {
      const r = relays();
      seen.push((await runEntry(host(device(), i % 2 ? '#mode=play' : `#${OWN_ADDRESS}`, (pk) => r.resolve(pk))))?.decision);
    }
    expect(seen).toEqual(Array(20).fill(ENTER));
  });

  it('the main.ts gate no longer refuses every #seed (it hands the linked island to the decision)', () => {
    const src = readFileSync('src/playground/main.ts', 'utf8');
    const body = src.slice(src.indexOf('async function autoEnter'), src.indexOf('Make a new island'));
    expect(body).not.toMatch(/!linkedWorld/);
    expect(body).toMatch(/entryAddress\(params\)/);
    expect(body).toMatch(/linked,/);
  });

  it('a link to an island not saved here keeps the title; with several islands a link names only its own', () => {
    const base: EntryFacts = { allowed: true, account: { pubkey: ME, present: true }, islands: [{ identity: 'a', lastSeed: 'p' }, { identity: 'b', lastSeed: 'p' }], mine: new Set(['p']), walkingSeed: 'p', current: { status: 'unavailable' } };
    expect(decideEntry({ ...base, linked: 'elsewhere' })).toEqual({ kind: 'title', why: 'linked-not-here' });
    expect(decideEntry({ ...base, linked: 'b' })).toEqual({ kind: 'enter', island: 'b' });
    expect(decideEntry({ ...base, linked: null })).toEqual({ kind: 'choose-island', islands: ['a', 'b'] });
    // The linked island must still be this identity's (its last visitor), and the walking Blobbi too.
    expect(decideEntry({ ...base, linked: 'a', islands: [{ identity: 'a', lastSeed: 'someone' }] })).toEqual({ kind: 'title', why: 'not-mine' });
    expect(decideEntry({ ...base, linked: 'a', walkingSeed: 'stranger' })).toEqual({ kind: 'title', why: 'walking-not-mine' });
    // No islands here and a link: never the welcome page for a stranger's island.
    expect(decideEntry({ ...base, islands: [], linked: 'x', current: { status: 'current', d: 'd', name: 'P', seed: 'p', walkable: true } })).toEqual({ kind: 'title', why: 'linked-not-here' });
  });

  it('#menu (and the lab #intro) keep the title, with or without the island in the address', async () => {
    for (const a of ['#menu', `#${OWN_ADDRESS}&menu=1`, '#mode=play&intro=whale']) {
      expect(entryAddress(hash(a)).allowed).toBe(false);
      const r = relays();
      const h = host(device(), a, (pk) => r.resolve(pk));
      expect(await runEntry(h)).toBeNull();
      expect(h.calls).toEqual([]); // nothing asked: not the vault, not the relays
    }
  });
});

describe('M11D.8 fix: relays slow, offline, timing out; profiles valid or missing', () => {
  for (const address of ['#mode=play', `#${OWN_ADDRESS}`])
    it(`always the island (${address.length > 20 ? 'own address' : 'plain'}): fast, timeout, offline, no profile, the walking Blobbi current`, async () => {
      const cases = [relays(), relays({ hang: true }), relays({ down: true }), relays({ profile: null })];
      const out = [];
      for (const r of cases) out.push((await runEntry(host(device(), address, (pk) => r.resolve(pk, 30))))?.decision);
      expect(out).toEqual([ENTER, ENTER, ENTER, ENTER]);
    });

  it('another current Blobbi (a valid 11125 naming Mochi): asked who comes along, on either address', async () => {
    for (const address of ['#mode=play', `#${OWN_ADDRESS}`]) {
      const r = relays({ profile: profileNaming('b1b2c3d4e5') });
      expect((await runEntry(host(device(), address, (pk) => r.resolve(pk))))?.decision).toMatchObject({ kind: 'offer-switch', island: ISLAND, name: 'Mochi' });
    }
  });

  it('a profile signed by someone else is not believed: straight in with the Blobbi of this device', async () => {
    const forged = { ...wire(profileNaming('b1b2c3d4e5')), pubkey: OTHER };
    const r = relays({ profile: forged });
    expect((await runEntry(host(device(), '#mode=play', (pk) => r.resolve(pk))))?.decision).toEqual(ENTER);
  });

  it('several islands of this identity and another current Blobbi: the islands page on a plain load, that island when named', async () => {
    const dev = device({ islands: [{ identity: ISLAND, lastSeed: PUDDING_SEED }, { identity: 'other-island', lastSeed: PUDDING_SEED }] });
    const r = relays({ profile: profileNaming('b1b2c3d4e5') });
    expect((await runEntry(host(dev, '#mode=play', (pk) => r.resolve(pk))))?.decision).toEqual({ kind: 'choose-island', islands: [ISLAND, 'other-island'] });
    expect((await runEntry(host(dev, `#${OWN_ADDRESS}`, (pk) => r.resolve(pk))))?.decision).toMatchObject({ kind: 'offer-switch', island: ISLAND });
  });
});

describe('M11D.8 fix: completion orders and changes while waiting', () => {
  const gated = () => {
    const r = relays({ gate: true });
    return { r, current: (pk: string) => r.resolve(pk, 5000) };
  };
  const tick = () => new Promise((res) => setTimeout(res, 0));

  it('the relays answer late (after the vault): still the island, once they answer', async () => {
    const { r, current } = gated();
    const run = runEntry(host(device(), '#mode=play', current));
    await tick();
    r.release();
    expect((await run)?.decision).toEqual(ENTER);
  });

  it('the vault answers late: the relays are not asked before it does; then the island', async () => {
    let open!: (v: boolean) => void;
    const r = relays();
    const h = host(device(), '#mode=play', (pk) => r.resolve(pk), { present: () => new Promise((res) => (open = res)) });
    const run = runEntry(h);
    await tick();
    expect(h.calls).toEqual([`present:${ME.slice(0, 4)}`]);
    open(true);
    expect((await run)?.decision).toEqual(ENTER);
  });

  it('the vault no longer keeps the key (or fails): the title, and the relays are never asked', async () => {
    for (const present of [() => Promise.resolve(false), () => Promise.reject(new Error('vault closed'))]) {
      const r = relays();
      const h = host(device(), '#mode=play', (pk) => r.resolve(pk), { present });
      expect((await runEntry(h))?.decision).toEqual({ kind: 'title', why: 'not-present' });
      expect(r.reads).toEqual([]);
    }
  });

  it('a key or a touch on the title while the vault or the relays are answering: the player leads, nothing taken over', async () => {
    for (const when of ['vault', 'relays'] as const) {
      const dev = device();
      let open!: (v: boolean) => void;
      const { r, current } = gated();
      const run = runEntry(host(dev, '#mode=play', current, { present: () => new Promise((res) => (open = res)) }));
      if (when === 'vault') dev.touched = true;
      open(true);
      await tick();
      if (when === 'relays') dev.touched = true;
      r.release();
      expect(await run).toBeNull();
    }
  });

  it('the account switched or disconnected while waiting: nothing is entered for anyone', async () => {
    for (const next of [{ pubkey: OTHER }, null]) {
      const dev = device();
      const { r, current } = gated();
      const run = runEntry(host(dev, '#mode=play', current));
      await tick();
      dev.account = next;
      r.release();
      expect(await run).toBeNull();
    }
  });

  it('no account, or a guest: the title, nothing asked', async () => {
    const r = relays();
    const h = host(device({ account: null }), `#${OWN_ADDRESS}`, (pk) => r.resolve(pk));
    expect(await runEntry(h)).toBeNull();
    expect(h.calls).toEqual([]);
  });

  it('SETTINGS > MAIN MENU is kept in the address until play starts again (a reload keeps the main menu)', () => {
    const src = readFileSync('src/playground/main.ts', 'utf8');
    expect(src).toMatch(/let menuChosen = params\.has\('menu'\);/);
    const onMenu = src.slice(src.indexOf('settingsScreen.onMainMenu = '), src.indexOf('/** The canonical Blobbi walking now'));
    expect(onMenu).toMatch(/menuChosen = true;\s*saveHash\(\);/);
    const begin = src.slice(src.indexOf('function beginPlay'), src.indexOf('function beginPlay') + 200);
    expect(begin).toMatch(/menuChosen = false;/);
    const save = src.slice(src.indexOf('function saveHash'), src.indexOf('// ─── World mode'));
    expect(save.match(/\$\{menu\}/g)?.length).toBe(3);
    expect(entryAddress(hash('#mode=play&menu=1')).allowed).toBe(false);
  });

  it('the start of play reaches no signer and no publisher', () => {
    const src = readFileSync('src/playground/main.ts', 'utf8');
    const body = src.slice(src.indexOf('async function autoEnter'), src.indexOf('Make a new island'));
    expect(body).not.toMatch(/publish|signEvent|reserve\(|createWorld|createAdventure|adoptVaultIdentity|\.save\(/);
  });
});
