/**
 * M11C.2: discovering the connected player's canonical Blobbis (kind 31124), read-only. Relays are untrusted: wrong
 * authors, malformed and legacy events, duplicates, disagreeing relays, failures and timeouts are all handled; only a
 * V3 adult may visit (V1/V2, eggs and babies are listed with the reason); nothing is published or signed; the
 * selection is stored beside (never inside) the island save, and a Blobbi chosen with an account walks only while
 * that account is connected.
 */
import { describe, expect, it } from 'vitest';
import { buildEggTags, deriveBlobbiV3Seed, getCanonicalBlobbiD } from '@blobbi-kit/core';
import { NostrAccount } from '../src/nostr/account';
import { generationOf, pickBlobbis } from '../src/nostr/blobbis';
import { BLOBBI_MARKER, DEFAULT_RELAYS, relayBlobbiReader, type BlobbiReader, type ProfileReader } from '../src/nostr/relays';
import type { OwnedBlobbi } from '../src/nostr/port';
import { memoryStore, saveKey } from '../src/game/persistence';
import { effectiveSelection, loadSelection, loadSelectionRecord, SELECTION_KEY, storeSelection } from '../src/game/blobbi-selection';
import { resolveBlobbi } from '../src/blobbi/source';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { GameUI } from '../src/ui/game-ui';
import { BlobbisScreen, reasonKey, type BlobbiChooser } from '../src/ui/screens/blobbis';
import { en } from '../src/i18n/messages/en';
import { ptBR } from '../src/i18n/messages/pt-BR';
import { es } from '../src/i18n/messages/es';
import { t } from '../src/i18n';
import { vi } from 'vitest';

const PK = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';
const PK2 = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';

let serial = 0;
/** A kind 31124 event shaped by the kit's own builder, then grown to `stage`. */
function blobbiEvent(o: { pet?: string; name?: string; gen?: 'v1' | 'v2' | 'v3'; stage?: 'egg' | 'baby' | 'adult'; at?: number; pubkey?: string; author?: string; id?: string; tags?: (tags: string[][]) => string[][]; kind?: number } = {}) {
  const owner = o.pubkey ?? PK;
  const pet = o.pet ?? '0123456789';
  let tags = buildEggTags(owner, pet, 1_700_000_000, o.name ?? 'Pip', { visualGeneration: o.gen ?? 'v3' }).map((t) => (t[0] === 'stage' ? ['stage', o.stage ?? 'adult'] : t));
  if (o.tags) tags = o.tags(tags);
  return { id: o.id ?? (++serial).toString(16).padStart(64, '0'), pubkey: o.author ?? owner, created_at: o.at ?? 1_700_000_000 + serial, kind: o.kind ?? 31124, tags, content: '', sig: 'a'.repeat(128) };
}

describe('reading the events (pickBlobbis)', () => {
  it('a V3 adult is available, its seed derived from the address by the kit', () => {
    const { items, skipped } = pickBlobbis([blobbiEvent({ name: 'Mochi' })], PK);
    expect(skipped).toBe(0);
    const d = getCanonicalBlobbiD(PK, '0123456789');
    expect(items).toEqual([expect.objectContaining({ name: 'Mochi', stage: 'adult', generation: 'v3', availability: 'available', d, address: `31124:${PK}:${d}`, seed: deriveBlobbiV3Seed(PK, d), colors: null })]);
  });

  it('V1 and V2 are listed but not available, with their real colours; V3 eggs wait (M11D.1: a V3 Baby may visit)', () => {
    const { items } = pickBlobbis([blobbiEvent({ pet: '0000000001', gen: 'v1' }), blobbiEvent({ pet: '0000000002', gen: 'v2' }), blobbiEvent({ pet: '0000000003', stage: 'egg' }), blobbiEvent({ pet: '0000000004', stage: 'baby' })], PK);
    const by = (pet: string) => items.find((b) => b.d.endsWith(pet))!;
    expect(by('0000000001')).toMatchObject({ generation: 'v1', availability: 'older-generation', seed: null });
    expect(by('0000000002')).toMatchObject({ generation: 'v2', availability: 'older-generation', seed: null });
    for (const c of Object.values(by('0000000002').colors!)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(by('0000000003').availability).toBe('egg');
    expect(by('0000000004').availability).toBe('available');
    expect(items.filter((b) => b.availability === 'available').map((b) => b.stage)).toEqual(['baby']);
  });

  it('an unknown future generation is "unknown", never treated as V1 or drawn', () => {
    expect(generationOf([['visual_generation', 'v4']])).toBe('unknown');
    expect(generationOf([])).toBe('v1');
    const { items } = pickBlobbis([blobbiEvent({ tags: (tags) => tags.map((t) => (t[0] === 'visual_generation' ? ['visual_generation', 'v9'] : t)) })], PK);
    expect(items[0]).toMatchObject({ generation: 'unknown', availability: 'unknown-generation', seed: null });
  });

  it('refuses events by another author (even for the same d), of another kind, without d, or malformed', () => {
    const good = blobbiEvent({ name: 'Mine' });
    const { items, skipped } = pickBlobbis(
      [
        good,
        blobbiEvent({ name: 'Impostor', author: PK2, at: good.created_at + 100 }), // newer, but signed by someone else
        blobbiEvent({ kind: 30078, pet: '0000000009' }),
        blobbiEvent({ pet: '0000000008', tags: (tags) => tags.filter((t) => t[0] !== 'd') }),
        { ...blobbiEvent({ pet: '0000000007' }), sig: 'nope' },
        null,
        'text',
        { kind: 31124 },
      ],
      PK,
    );
    expect(items.map((b) => b.name)).toEqual(['Mine']);
    expect(skipped).toBe(7);
  });

  it('legacy and invalid events (the kit\'s classification) are never shown or repaired', () => {
    const { items, skipped } = pickBlobbis(
      [
        blobbiEvent({ pet: '0000000001', tags: (tags) => tags.filter((t) => t[0] !== 'b') }), // no ecosystem marker
        blobbiEvent({ pet: '0000000002', tags: (tags) => tags.map((t) => (t[0] === 'stage' ? ['stage', 'teen'] : t)) }),
        blobbiEvent({ pet: '0000000003', tags: (tags) => tags.map((t) => (t[0] === 'd' ? ['d', 'blobbi-puck'] : t)) }), // legacy d
        blobbiEvent({ pet: '0000000004', tags: (tags) => tags.filter((t) => t[0] !== 'name') }),
      ],
      PK,
    );
    expect(items).toEqual([]);
    expect(skipped).toBe(4);
  });

  it('duplicates: the same event from two relays counts once; for a d the newest wins (ties to the lower id)', () => {
    const old = blobbiEvent({ name: 'Old', at: 100 });
    const newer = blobbiEvent({ name: 'New', at: 200 });
    const same = { ...newer };
    expect(pickBlobbis([old, newer, same], PK)).toMatchObject({ items: [expect.objectContaining({ name: 'New' })], skipped: 1 });
    expect(pickBlobbis([newer, old], PK).items[0].name).toBe('New'); // relays disagree: order does not matter
    const a = blobbiEvent({ name: 'A', at: 300, id: 'b'.repeat(64) });
    const b = blobbiEvent({ name: 'B', at: 300, id: 'a'.repeat(64) });
    expect(pickBlobbis([a, b], PK).items[0].name).toBe('B');
    expect(pickBlobbis([b, a], PK).items[0].name).toBe('B');
  });

  it('when the newest version is malformed, the Blobbi is not shown (no fallback to an older state), as the kit does', () => {
    const old = blobbiEvent({ name: 'Old', at: 100 });
    const broken = blobbiEvent({ name: 'Broken', at: 200, tags: (tags) => tags.filter((t) => t[0] !== 'last_interaction') });
    expect(pickBlobbis([old, broken], PK).items).toEqual([]);
  });

  it('names are cleaned (no direction or invisible characters, short), and several Blobbis are newest first', () => {
    const { items } = pickBlobbis([blobbiEvent({ pet: '0000000001', name: 'A‮evil​ name that goes on and on and on', at: 10 }), blobbiEvent({ pet: '0000000002', name: 'Second', at: 20 })], PK);
    expect(items.map((b) => b.name)).toEqual(['Second', expect.stringMatching(/^Aevil name that goes on/)]);
    expect([...items[1].name].length).toBeLessThanOrEqual(24);
    expect(items[1].name).not.toMatch(/[‮​]/);
  });
});

const noProfile: ProfileReader = { readProfile: async () => ({ events: [], reachable: 2 }) };
function accountWith(read: BlobbiReader['readBlobbis'], o: { store?: ReturnType<typeof memoryStore>; pk?: () => string; now?: () => number } = {}) {
  const calls: { pubkey: string }[] = [];
  const reader: BlobbiReader = { readBlobbis: (pubkey, relays, signal) => (calls.push({ pubkey }), read(pubkey, relays, signal)) };
  const pk = o.pk ?? (() => PK);
  const account = new NostrAccount({ store: o.store ?? memoryStore(), signer: { available: () => true, getPublicKey: async () => pk() }, reader: noProfile, blobbiReader: reader, relays: DEFAULT_RELAYS, readTimeoutMs: 60, connectTimeoutMs: 60, now: o.now });
  return { account, calls };
}

describe('the account reads the collection', () => {
  it('a guest reads nothing; connected, it reads once and caches (no repeated relay queries)', async () => {
    let now = 1000;
    const { account, calls } = accountWith(async () => ({ events: [blobbiEvent()], reachable: 2 }), { now: () => now });
    await account.loadBlobbis();
    expect(calls).toEqual([]);
    expect(account.blobbis().status).toBe('idle');
    await account.connect();
    await account.settled();
    expect(calls).toEqual([]); // connecting never reads Blobbis by itself
    await account.loadBlobbis();
    expect(account.blobbis()).toMatchObject({ status: 'ready', owner: PK, partial: false, skipped: 0 });
    expect(account.blobbis().items.length).toBe(1);
    await account.loadBlobbis();
    now += 60_000;
    await account.loadBlobbis();
    expect(calls.length).toBe(1);
    await account.loadBlobbis(true); // TRY AGAIN
    expect(calls.length).toBe(2);
    now += 10 * 60_000;
    await account.loadBlobbis();
    expect(calls.length).toBe(3);
  });

  it('relays down: unavailable; one relay down: partial; a reader that throws: unavailable', async () => {
    const a = accountWith(async () => ({ events: [], reachable: 0 }));
    await a.account.connect();
    await a.account.loadBlobbis();
    expect(a.account.blobbis().status).toBe('unavailable');
    const b = accountWith(async () => ({ events: [blobbiEvent()], reachable: 1 }));
    await b.account.connect();
    await b.account.loadBlobbis();
    expect(b.account.blobbis()).toMatchObject({ status: 'ready', partial: true });
    const c = accountWith(async () => {
      throw new Error('boom');
    });
    await c.account.connect();
    await c.account.loadBlobbis();
    expect(c.account.blobbis().status).toBe('unavailable');
  });

  it('a relay that never answers times out (the deadline aborts the read) and the game goes on', async () => {
    const { account } = accountWith((_pk, _relays, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))));
    await account.connect();
    const t0 = Date.now();
    await account.loadBlobbis();
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(account.blobbis().status).toBe('unavailable');
  });

  it('an empty collection is "ready" with no items (nothing is created)', async () => {
    const { account } = accountWith(async () => ({ events: [], reachable: 2 }));
    await account.connect();
    await account.loadBlobbis();
    expect(account.blobbis()).toMatchObject({ status: 'ready', items: [] });
  });

  it('switching accounts forgets the old list; a late answer for the old account is ignored; disconnect clears it', async () => {
    let who = PK;
    let release: (() => void) | null = null;
    const { account } = accountWith(
      (pubkey) => new Promise((resolve) => (release = () => resolve({ events: [blobbiEvent({ pubkey, name: pubkey === PK ? 'Old' : 'New' })], reachable: 2 }))),
      { pk: () => who },
    );
    await account.connect();
    const first = account.loadBlobbis();
    who = PK2;
    await account.connect(); // CHECK THE ACCOUNT AGAIN: the extension now has another account
    release!();
    await first;
    expect(account.blobbis().items).toEqual([]);
    const second = account.loadBlobbis();
    release!();
    await second;
    expect(account.blobbis().items.map((b) => [b.name, b.pubkey])).toEqual([['New', PK2]]);
    account.disconnect();
    expect(account.blobbis()).toMatchObject({ status: 'idle', items: [] });
  });

  it('change listeners hear connect, the list and disconnect (the HUD never polls the account per frame)', async () => {
    const { account } = accountWith(async () => ({ events: [blobbiEvent()], reachable: 2 }));
    let n = 0;
    const stop = account.onChange(() => n++);
    await account.connect();
    const afterConnect = n;
    expect(afterConnect).toBeGreaterThan(0);
    await account.loadBlobbis();
    expect(n).toBeGreaterThan(afterConnect);
    stop();
    const before = n;
    account.disconnect();
    expect(n).toBe(before);
  });
});

describe('nothing is published, signed, or secret', () => {
  it('the relay reader asks only for kind 31124 by the owner with the ecosystem marker, and never sends an event', async () => {
    const seen: { filters: unknown[]; events: number; closed: number } = { filters: [], events: 0, closed: 0 };
    vi.doMock('@nostrify/nostrify', () => ({
      NRelay1: class {
        constructor(readonly url: string) {}
        async query(filters: unknown[]) {
          seen.filters.push(...filters);
          return [];
        }
        async event() {
          seen.events++;
        }
        async close() {
          seen.closed++;
        }
      },
    }));
    const res = await relayBlobbiReader().readBlobbis(PK, DEFAULT_RELAYS, new AbortController().signal);
    vi.doUnmock('@nostrify/nostrify');
    expect(res.reachable).toBe(DEFAULT_RELAYS.length);
    expect(seen.events).toBe(0);
    expect(seen.closed).toBe(DEFAULT_RELAYS.length);
    for (const f of seen.filters) expect(f).toEqual({ kinds: [31124], authors: [PK], '#b': [BLOBBI_MARKER], limit: 200 });
  });

  it('the extension is asked only for the public key, never to sign or encrypt, and the account record stays public', async () => {
    const asked: string[] = [];
    const ext = { getPublicKey: async () => (asked.push('getPublicKey'), PK), signEvent: async () => (asked.push('signEvent'), null), nip44: { encrypt: async () => (asked.push('nip44'), '') } };
    const store = memoryStore();
    const { account } = accountWith(async () => ({ events: [blobbiEvent()], reachable: 2 }), { store });
    const real = new NostrAccount({ store, signer: { available: () => true, getPublicKey: ext.getPublicKey }, reader: noProfile, blobbiReader: { readBlobbis: async () => ({ events: [blobbiEvent()], reachable: 2 }) }, relays: DEFAULT_RELAYS });
    await real.connect();
    await real.loadBlobbis();
    expect(asked).toEqual(['getPublicKey']);
    expect(store.get('blobbi-pixel-lab:account')).not.toMatch(/nsec|secret|sig/i);
    void account;
  });
});

describe('the selection (stored beside the island, never in it)', () => {
  const d = getCanonicalBlobbiD(PK, '0123456789');
  const src = () => {
    const r = resolveBlobbi({ pubkey: PK, d });
    if (!r.ok) throw new Error(r.error);
    return r.source;
  };

  it('stores the address with its name and account in the same version-1 record; older readers still read it', () => {
    const store = memoryStore();
    storeSelection(store, src(), { name: 'Mochi‮', account: PK });
    const raw = JSON.parse(store.get(SELECTION_KEY)!);
    expect(raw).toEqual({ version: 1, source: src(), name: 'Mochi', account: PK });
    expect(loadSelection(store)).toEqual(src()); // what M3.4-M11B code reads
    expect(loadSelectionRecord(store)).toEqual({ source: src(), name: 'Mochi', account: PK, stage: 'adult' });
    // An M11B record (no name, no account) reads as before (M11D.1: drawn as the adult).
    store.set(SELECTION_KEY, JSON.stringify({ version: 1, source: { kind: 'demo', seed: 'blobbi-9' } }));
    expect(loadSelectionRecord(store)).toEqual({ source: { kind: 'demo', seed: 'blobbi-9' }, name: null, account: null, stage: 'adult' });
  });

  it('an account marker that does not own the address, or a tampered seed, makes the record invalid', () => {
    const store = memoryStore();
    store.set(SELECTION_KEY, JSON.stringify({ version: 1, source: src(), name: 'x', account: PK2 }));
    expect(loadSelectionRecord(store)).toBe(null);
    store.set(SELECTION_KEY, JSON.stringify({ version: 1, source: { ...src(), seed: 'f'.repeat(64) }, account: PK }));
    expect(loadSelectionRecord(store)).toBe(null);
  });

  it('a Blobbi chosen with an account walks only while that account is connected', () => {
    const rec = { source: src(), name: 'Mochi', account: PK };
    expect(effectiveSelection(rec, PK)).toBe(rec);
    expect(effectiveSelection(rec, null)).toBe(null);
    expect(effectiveSelection(rec, PK2)).toBe(null);
    const lab = { source: { kind: 'demo' as const, seed: 'blobbi-3' }, name: null, account: null };
    expect(effectiveSelection(lab, null)).toBe(lab);
  });

  it('choosing a canonical Blobbi changes only who walks: the island save is byte-identical and names no Blobbi', () => {
    const store = memoryStore();
    const world = generateTurtleWorld('turtle-0');
    const live = new LiveWorld(world, 'blobbi-9', 16, { store });
    live.inventory.add('blobbi-pixel:tool:simple-axe', 1);
    live.addFriendship(4);
    live.save();
    const key = saveKey(live.identity);
    const before = store.get(key);
    live.setBlobbi(src());
    storeSelection(store, src(), { name: 'Mochi', account: PK });
    live.save();
    const after = store.get(key)!;
    expect(after).not.toMatch(new RegExp(d));
    expect(after).not.toMatch(new RegExp(PK));
    expect(JSON.parse(after).inventory).toEqual(JSON.parse(before!).inventory);
    expect(JSON.parse(after).version).toBe(JSON.parse(before!).version); // schema unchanged (12)
    expect(live.blobbi.seed).toBe(deriveBlobbiV3Seed(PK, d));
    expect(live.inventory.count('blobbi-pixel:tool:simple-axe')).toBe(1);
  });
});

describe('MY BLOBBIS', () => {
  const palette = paletteFor('cozy');
  function screenWith(items: OwnedBlobbi[], status: 'ready' | 'loading' | 'unavailable' | 'idle' = 'ready', selected: string | null = null) {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    const ui = new GameUI(() => live, () => palette);
    const s = new BlobbisScreen();
    let loads = 0;
    s.collection = { blobbis: () => ({ status, owner: status === 'idle' ? null : PK, items, partial: false, skipped: 0, fetchedAt: 1 }), loadBlobbis: async () => void loads++ };
    const chosen: OwnedBlobbi[] = [];
    let sel = selected;
    const chooser: BlobbiChooser = { selectedAddress: () => sel, choose: (b) => (chosen.push(b), (sel = b.address), true), useVisitor: () => (sel = null) };
    s.chooser = chooser;
    ui.register(s);
    ui.open('blobbis');
    const draw = () => ui.render(new PixelBuffer(960, 540), 0);
    return { ui, s, chosen, draw, loads: () => loads, selected: () => sel };
  }
  const all = pickBlobbis([blobbiEvent({ pet: '0000000001', name: 'Adult', at: 50 }), blobbiEvent({ pet: '0000000002', gen: 'v2', name: 'Old', at: 40 }), blobbiEvent({ pet: '0000000003', stage: 'egg', name: 'Eggy', at: 30 })], PK).items;

  it('opening reads the list (once per open); Enter brings an available V3 adult; V1/V2 and eggs are refused with the reason', () => {
    const { ui, chosen, draw, loads, selected } = screenWith([...all]);
    expect(loads()).toBe(1);
    draw();
    ui.handleKey('Enter');
    expect(chosen.map((b) => b.name)).toEqual(['Adult']);
    expect(selected()).toBe(all[0].address);
    ui.handleKey('ArrowDown');
    ui.handleKey('Enter');
    expect(chosen.length).toBe(1);
    expect(ui.message?.text).toBe(t('blobbis.reason.older', { g: 'V2' }));
    ui.handleKey('ArrowDown');
    ui.handleKey('Enter');
    expect(chosen.length).toBe(1);
    expect(reasonKey(all[2])).toBe('blobbis.reason.egg');
    draw();
  });

  it('draws every state without throwing: empty, loading, unavailable, not connected, a long list', () => {
    for (const status of ['ready', 'loading', 'unavailable', 'idle'] as const) screenWith([], status).draw();
    const many = Array.from({ length: 20 }, (_, i) => ({ ...all[0], d: `d${i}`, address: `a${i}`, name: `Blobbi number ${i} with a long name` }));
    const { ui, draw } = screenWith(many);
    for (let i = 0; i < 25; i++) ui.handleKey('ArrowDown');
    draw();
  });

  it('every new text exists in English, Portuguese and Spanish, and none uses an em dash', () => {
    const keys = Object.keys(en).filter((k) => k.startsWith('blobbis.') || k === 'account.myBlobbis');
    expect(keys.length).toBeGreaterThan(25);
    for (const cat of [en, ptBR, es] as Record<string, unknown>[])
      for (const k of keys) {
        expect(cat[k], k).toBeDefined();
        expect(JSON.stringify(cat[k]), k).not.toMatch(/—/);
      }
  });
});
