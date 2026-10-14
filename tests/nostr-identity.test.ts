/**
 * M11B: read-only Nostr identity. A guest plays without any signer; a browser extension (NIP-07, mocked) connects;
 * every failure (no signer, rejected, timeout, nonsense key, relays down, bad profiles) leaves the game as it was;
 * nothing is ever published, signed, encrypted or stored secretly, and no island save changes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NostrAccount } from '../src/nostr/account';
import { ACCOUNT_KEY, loadAccount } from '../src/nostr/account-store';
import { isPublicKeyHex, npubEncode, shortNpub } from '../src/nostr/keys';
import { cleanName, parseProfile, pickProfile } from '../src/nostr/profile';
import { DEFAULT_RELAYS, relayProfileReader, type ProfileReader } from '../src/nostr/relays';
import { browserExtensionSigner, hasBrowserSigner, type PublicKeySigner } from '../src/nostr/signer';
import { memoryStore, saveKey } from '../src/game/persistence';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';

// NIP-19's own example.
const PK = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';
const NPUB = 'npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg';
const PK2 = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';

let serial = 0;
const profileEvent = (content: unknown, over: Record<string, unknown> = {}) => ({
  id: (++serial).toString(16).padStart(64, '0'),
  pubkey: PK,
  created_at: 1_700_000_000 + serial,
  kind: 0,
  tags: [],
  content: typeof content === 'string' ? content : JSON.stringify(content),
  sig: 'a'.repeat(128),
  ...over,
});

const signerOf = (getPublicKey: () => Promise<string>, available = true): PublicKeySigner & { calls: number } => {
  const s = { calls: 0, available: () => available, getPublicKey: () => (s.calls++, getPublicKey()) };
  return s;
};
const readerOf = (fn: ProfileReader['readProfile']): ProfileReader & { calls: number } => {
  const r = { calls: 0, readProfile: (...a: Parameters<ProfileReader['readProfile']>) => (r.calls++, fn(...a)) };
  return r;
};
const make = (o: { store?: ReturnType<typeof memoryStore>; signer?: PublicKeySigner; reader?: ProfileReader; now?: () => number } = {}) => {
  const store = o.store ?? memoryStore();
  const account = new NostrAccount({
    store,
    signer: o.signer ?? signerOf(async () => PK),
    reader: o.reader ?? readerOf(async () => ({ events: [profileEvent({ name: 'Ana' })], reachable: 2 })),
    relays: DEFAULT_RELAYS,
    now: o.now,
    readTimeoutMs: 50,
    connectTimeoutMs: 50,
  });
  return { store, account };
};

afterEach(() => {
  delete (globalThis as { nostr?: unknown }).nostr;
  vi.restoreAllMocks();
});

describe('public keys', () => {
  it('encodes the NIP-19 example and shortens it', () => {
    expect(npubEncode(PK)).toBe(NPUB);
    expect(shortNpub(NPUB)).toBe('npub10elf…jptg');
    expect(isPublicKeyHex(PK)).toBe(true);
    expect(isPublicKeyHex(PK.toUpperCase())).toBe(false);
    expect(isPublicKeyHex(PK.slice(1))).toBe(false);
    expect(() => npubEncode('nope')).toThrow();
  });
});

describe('profiles are checked before anything is shown', () => {
  it('reads display_name, then displayName, then name', () => {
    expect(parseProfile(profileEvent({ name: 'a', display_name: 'Ana Clara' }), PK)).toMatchObject({ ok: true, name: 'Ana Clara' });
    expect(parseProfile(profileEvent({ name: 'ana', displayName: 'Ana' }), PK)).toMatchObject({ ok: true, name: 'Ana' });
    expect(parseProfile(profileEvent({ name: 'ana' }), PK)).toMatchObject({ ok: true, name: 'ana' });
    expect(parseProfile(profileEvent({ about: 'no name' }), PK)).toMatchObject({ ok: true, name: null });
  });

  it('refuses another author, another kind, malformed events, non-objects and huge content', () => {
    expect(parseProfile(profileEvent({ name: 'Eve' }, { pubkey: PK2 }), PK)).toEqual({ ok: false, reason: 'wrong-author' });
    expect(parseProfile(profileEvent({ name: 'x' }, { kind: 1 }), PK)).toEqual({ ok: false, reason: 'wrong-kind' });
    expect(parseProfile(profileEvent({ name: 'x' }, { sig: 'nope' }), PK)).toEqual({ ok: false, reason: 'malformed' });
    expect(parseProfile(profileEvent({ name: 'x' }, { tags: [[1]] }), PK)).toEqual({ ok: false, reason: 'malformed' });
    expect(parseProfile(null, PK)).toEqual({ ok: false, reason: 'malformed' });
    expect(parseProfile(profileEvent('{not json'), PK)).toEqual({ ok: false, reason: 'not-json' });
    expect(parseProfile(profileEvent('["Ana"]'), PK)).toEqual({ ok: false, reason: 'not-json' });
    expect(parseProfile(profileEvent({ name: 'x', about: 'y'.repeat(40_000) }), PK)).toEqual({ ok: false, reason: 'too-big' });
  });

  it('cleans names: no controls, no direction overrides, no invisible characters, one short line', () => {
    expect(cleanName('Ana‮<script>')).toBe('Ana<script>'); // shown as text by a pixel font, never as markup
    expect(cleanName('​A\u0000n\u0007a⁦ ')).toBe('Ana');
    expect(cleanName('  two\n lines\t ')).toBe('two lines');
    expect(cleanName('x'.repeat(60))).toBe(`${'x'.repeat(23)}…`);
    expect(cleanName('   ')).toBeNull();
    expect(cleanName(42)).toBeNull();
    expect(cleanName('João')).toBe('João'); // NFC
  });

  it('picks the newest valid profile; reports invalid when only bad ones came, missing when none', () => {
    const old = profileEvent({ name: 'Old' }, { created_at: 10 });
    const fresh = profileEvent({ name: 'New' }, { created_at: 20 });
    const forged = profileEvent({ name: 'Forged' }, { created_at: 99, pubkey: PK2 });
    expect(pickProfile([old, forged, fresh], PK)).toMatchObject({ status: 'found', name: 'New' });
    expect(pickProfile([forged, { nonsense: true }], PK)).toEqual({ status: 'invalid' });
    expect(pickProfile([], PK)).toEqual({ status: 'missing' });
  });
});

describe('the account (guest, connect, failures, reload, switch, disconnect)', () => {
  it('a guest needs nothing: no signer, no record, no network', () => {
    const reader = readerOf(async () => ({ events: [], reachable: 0 }));
    const { account, store } = make({ signer: signerOf(async () => PK, false), reader });
    expect(account.snapshot()).toMatchObject({ status: 'guest', pubkey: null, signerAvailable: false, profile: 'idle' });
    expect(store.data.size).toBe(0);
    expect(reader.calls).toBe(0);
  });

  it('with no signer installed, CONNECT says so and changes nothing', async () => {
    const signer = signerOf(async () => PK, false);
    const { account, store } = make({ signer });
    await account.connect();
    expect(account.snapshot()).toMatchObject({ status: 'guest', problem: 'no-signer' });
    expect(signer.calls).toBe(0);
    expect(store.data.size).toBe(0);
  });

  it('connects with a mocked NIP-07 extension through Nostrify, asking only for the public key', async () => {
    const nostr = { getPublicKey: vi.fn(async () => PK), signEvent: vi.fn(), nip44: { encrypt: vi.fn(), decrypt: vi.fn() }, nip04: { encrypt: vi.fn(), decrypt: vi.fn() } };
    (globalThis as { nostr?: unknown }).nostr = nostr;
    expect(hasBrowserSigner()).toBe(true);
    const { account, store } = make({ signer: browserExtensionSigner() });
    await account.connect();
    await account.settled();
    const s = account.snapshot();
    expect(s).toMatchObject({ status: 'connected', pubkey: PK, npub: NPUB, npubShort: 'npub10elf…jptg', method: 'nip07', displayName: 'Ana', profile: 'found', problem: null });
    expect(nostr.getPublicKey).toHaveBeenCalledTimes(1);
    for (const f of [nostr.signEvent, nostr.nip44.encrypt, nostr.nip44.decrypt, nostr.nip04.encrypt, nostr.nip04.decrypt]) expect(f).not.toHaveBeenCalled();
    // Only the public record is stored, with exactly its public fields.
    expect([...store.data.keys()]).toEqual([ACCOUNT_KEY]);
    const rec = JSON.parse(store.data.get(ACCOUNT_KEY)!);
    expect(Object.keys(rec).sort()).toEqual(['connectedAt', 'method', 'profile', 'pubkey', 'version']);
    expect(store.data.get(ACCOUNT_KEY)).not.toMatch(/nsec|secret|privkey|seckey|bunker/i);
  });

  it('a rejected prompt, a prompt left unanswered and a nonsense key all leave the player a guest', async () => {
    const rejected = make({ signer: signerOf(() => Promise.reject(new Error('User rejected'))) });
    await rejected.account.connect();
    expect(rejected.account.snapshot()).toMatchObject({ status: 'guest', problem: 'rejected' });
    const slow = make({ signer: signerOf(() => new Promise(() => {})) });
    await slow.account.connect();
    expect(slow.account.snapshot()).toMatchObject({ status: 'guest', problem: 'timeout' });
    const nonsense = make({ signer: signerOf(async () => 'npub1notahexkey') });
    await nonsense.account.connect();
    expect(nonsense.account.snapshot()).toMatchObject({ status: 'guest', problem: 'invalid-key' });
    const gone = make({ signer: signerOf(() => Promise.reject(new Error('Browser extension not available'))) });
    await gone.account.connect();
    expect(gone.account.snapshot()).toMatchObject({ status: 'guest', problem: 'no-signer' });
    for (const { store } of [rejected, slow, nonsense, gone]) expect(store.data.size).toBe(0);
  });

  it('relays down, slow, empty or lying: the account stays connected and shows the short npub', async () => {
    const down = make({ reader: readerOf(async () => ({ events: [], reachable: 0 })) });
    await down.account.connect();
    await down.account.settled();
    expect(down.account.snapshot()).toMatchObject({ status: 'connected', profile: 'unavailable', displayName: null });
    const thrown = make({ reader: readerOf(async () => Promise.reject(new Error('socket'))) });
    await thrown.account.connect();
    await thrown.account.settled();
    expect(thrown.account.snapshot().profile).toBe('unavailable');
    const slow = make({ reader: readerOf((_pk, _r, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))) });
    await slow.account.connect();
    await slow.account.settled();
    expect(slow.account.snapshot().profile).toBe('unavailable');
    const empty = make({ reader: readerOf(async () => ({ events: [], reachable: 2 })) });
    await empty.account.connect();
    await empty.account.settled();
    expect(empty.account.snapshot().profile).toBe('missing');
    const lying = make({ reader: readerOf(async () => ({ events: [profileEvent({ name: 'Mallory' }, { pubkey: PK2 })], reachable: 1 })) });
    await lying.account.connect();
    await lying.account.settled();
    expect(lying.account.snapshot()).toMatchObject({ profile: 'invalid', displayName: null });
  });

  it('a reload remembers the account without prompting; the profile is read again only when stale', async () => {
    let t = 1_000_000;
    const first = make({ now: () => t });
    await first.account.connect();
    await first.account.settled();
    const signer = signerOf(async () => PK);
    const reader = readerOf(async () => ({ events: [profileEvent({ name: 'Ana 2' })], reachable: 2 }));
    const again = make({ store: first.store, signer, reader, now: () => t });
    expect(again.account.snapshot()).toMatchObject({ status: 'connected', pubkey: PK, displayName: 'Ana', profile: 'found' });
    await again.account.refreshProfile();
    expect(reader.calls).toBe(0); // fresh enough
    t += 11 * 60_000;
    await again.account.refreshProfile();
    expect(reader.calls).toBe(1);
    expect(again.account.snapshot().displayName).toBe('Ana 2');
    expect(signer.calls).toBe(0); // never prompted on reload
  });

  it('switching accounts in the extension: the next connect forgets the old profile', async () => {
    let key = PK;
    const reader = readerOf(async (pk) => ({ events: pk === PK ? [profileEvent({ name: 'Ana' })] : [], reachable: 2 }));
    const { account } = make({ signer: signerOf(async () => key), reader });
    await account.connect();
    await account.settled();
    expect(account.snapshot().displayName).toBe('Ana');
    key = PK2;
    await account.connect();
    await account.settled();
    expect(account.snapshot()).toMatchObject({ pubkey: PK2, displayName: null, profile: 'missing' });
  });

  it('disconnecting forgets only the account: islands, saves and other settings are untouched', async () => {
    const store = memoryStore({ 'blobbi-pixel-lab:settings': '{"goals":true}', 'blobbi-pixel-lab:active-world': 'x' });
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store });
    live.save();
    const before = new Map(store.data);
    const { account } = make({ store });
    await account.connect();
    await account.settled();
    for (const [k, v] of before) expect(store.get(k), k).toBe(v);
    account.disconnect();
    expect(account.snapshot()).toMatchObject({ status: 'guest', pubkey: null, displayName: null });
    expect(loadAccount(store)).toBeNull();
    expect(new Map(store.data)).toEqual(before);
    expect(store.get(saveKey(live.identity))).toBe(before.get(saveKey(live.identity)));
  });

  it('a profile answer arriving after a disconnect is ignored', async () => {
    let release: (v: { events: unknown[]; reachable: number }) => void = () => {};
    const { account, store } = make({ reader: readerOf(() => new Promise((r) => (release = r))) });
    await account.connect();
    account.disconnect();
    release({ events: [profileEvent({ name: 'Late' })], reachable: 1 });
    await new Promise((r) => setTimeout(r, 5));
    expect(account.snapshot()).toMatchObject({ status: 'guest', displayName: null });
    expect(store.data.size).toBe(0);
  });

  it('a stored record with extra or secret-looking fields is ignored whole', () => {
    const bad = memoryStore({ [ACCOUNT_KEY]: JSON.stringify({ version: 1, pubkey: PK, method: 'nip07', connectedAt: 1, profile: null, nsec: 'x' }) });
    expect(loadAccount(bad)).toBeNull();
    expect(make({ store: bad }).account.snapshot().status).toBe('guest');
  });
});

describe('the relay reader can only read', () => {
  it('asks each relay for one kind 0 by the author, closes it, and never sends an event', async () => {
    const made: { url: string; opts: Record<string, unknown>; queries: unknown[]; events: number; closed: number }[] = [];
    vi.doMock('@nostrify/nostrify', () => ({
      NRelay1: class {
        rec: (typeof made)[number];
        constructor(url: string, opts: Record<string, unknown>) {
          this.rec = { url, opts, queries: [], events: 0, closed: 0 };
          made.push(this.rec);
        }
        async query(filters: unknown) {
          this.rec.queries.push(filters);
          if (this.rec.url.includes('primal')) throw new Error('down');
          return [profileEvent({ name: 'Ana' })];
        }
        async event() {
          this.rec.events++;
        }
        async close() {
          this.rec.closed++;
        }
      },
    }));
    const res = await relayProfileReader().readProfile(PK, DEFAULT_RELAYS, new AbortController().signal);
    vi.doUnmock('@nostrify/nostrify');
    expect(made.map((m) => m.url)).toEqual([...DEFAULT_RELAYS]);
    expect(res.reachable).toBe(DEFAULT_RELAYS.length - 1); // every relay but the one that failed
    expect(res.events).toHaveLength(DEFAULT_RELAYS.length - 1);
    for (const m of made) {
      expect(m.queries).toEqual([[{ kinds: [0], authors: [PK], limit: 1 }]]);
      expect(m.events).toBe(0);
      expect(m.closed).toBe(1);
      expect(m.opts).not.toHaveProperty('auth'); // never answers AUTH (that would sign)
    }
  });
});

describe('the account page shows names safely', () => {
  it('keeps what the pixel fonts can draw; an unreadable name falls back to the short npub', async () => {
    const { accountName } = await import('../src/ui/screens/settings');
    const base = { status: 'connected', pubkey: PK, npub: NPUB, npubShort: shortNpub(NPUB), method: 'nip07', profile: 'found', profileAt: 1, problem: null, signerAvailable: true, relays: [] } as const;
    expect(accountName({ ...base, displayName: 'Ana Clara' })).toBe('Ana Clara');
    expect(accountName({ ...base, displayName: 'João 🌊' })).toBe('João');
    expect(accountName({ ...base, displayName: '🌊🌊' })).toBe('npub10elf…jptg');
    expect(accountName({ ...base, displayName: '山田' })).toBe('npub10elf…jptg');
    expect(accountName({ ...base, displayName: null })).toBe('No profile name');
  });
});
