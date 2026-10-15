// M11D.8, PART D: seamless world entry. The decision (`src/game/world-entry.ts`) for every scenario of the brief, the
// "stay" memory, and the two title pages it may open (welcome back with the current Blobbi; who comes along?). The
// host (`main.ts`) carries a decision out; the browser check (`scripts/m11d8-entry-browser.ts`) plays it end to end.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decideEntry, rememberStay, stayedWith, ENTRY_CHOICE_KEY, type EntryFacts } from '../src/game/world-entry';
import { memoryStore } from '../src/game/persistence';
import { TitleScreen, type TitleAccount } from '../src/ui/title';
import { setLocale, upper } from '../src/i18n';
import { en } from '../src/i18n/messages/en';
import { browser, fakeRelays, ownedBaby } from './helpers/restore-fixtures';
import { ptBR } from '../src/i18n/messages/pt-BR';
import { es } from '../src/i18n/messages/es';

const ME = 'a'.repeat(64);
const PUDDING = { d: 'blobbi-aaaaaaaaaaaa-a1b2c3d4e5', name: 'Pudding', seed: 'seed-pudding', walkable: true };
const MOCHI = { d: 'blobbi-aaaaaaaaaaaa-b1b2c3d4e5', name: 'Mochi', seed: 'seed-mochi', walkable: true };

/** A returning connected player: one island Pudding played last, Pudding walking, Pudding current. */
const facts = (o: Partial<EntryFacts> = {}): EntryFacts => ({
  allowed: true,
  account: { pubkey: ME, present: true },
  islands: [{ identity: 'turtle:island-1', lastSeed: 'seed-pudding' }],
  mine: new Set(['seed-pudding', 'seed-mochi']),
  walkingSeed: 'seed-pudding',
  current: { status: 'current', ...PUDDING },
  ...o,
});

describe('M11D.8: who enters directly, and where', () => {
  it('1. a first-time visitor (no account, no island): the title, as always', () => {
    expect(decideEntry(facts({ account: null, islands: [], mine: new Set(), current: { status: 'unavailable' } }))).toEqual({ kind: 'title', why: 'guest' });
  });

  it('2. a returning connected player with their island: straight in', () => {
    expect(decideEntry(facts())).toEqual({ kind: 'enter', island: 'turtle:island-1' });
  });

  it('3. connected, no island on this device: welcome back with the current Blobbi (an egg or nothing: the title)', () => {
    expect(decideEntry(facts({ islands: [] }))).toEqual({ kind: 'welcome', d: PUDDING.d, name: 'Pudding' });
    expect(decideEntry(facts({ islands: [], current: { status: 'current', ...PUDDING, walkable: false } }))).toEqual({ kind: 'title', why: 'nothing-to-bring' });
    for (const status of ['missing', 'no-selection', 'unavailable'] as const) expect(decideEntry(facts({ islands: [], current: { status } }))).toEqual({ kind: 'title', why: 'nothing-to-bring' });
  });

  it('4. offline (or the relays failed): straight in with the Blobbi of this device, never replaced', () => {
    for (const status of ['unavailable', 'missing', 'no-selection'] as const) expect(decideEntry(facts({ current: { status } }))).toEqual({ kind: 'enter', island: 'turtle:island-1' });
  });

  it('5. several islands are theirs: the islands page (the player chooses)', () => {
    const d = decideEntry(facts({ islands: [{ identity: 'a', lastSeed: 'seed-pudding' }, { identity: 'b', lastSeed: 'seed-mochi' }, { identity: 'c', lastSeed: 'someone-else' }] }));
    expect(d).toEqual({ kind: 'choose-island', islands: ['a', 'b'] });
  });

  it('6. explicitly disconnected (no account record) or the identity not really here: the title', () => {
    expect(decideEntry(facts({ account: null }))).toEqual({ kind: 'title', why: 'guest' });
    expect(decideEntry(facts({ account: { pubkey: ME, present: false } }))).toEqual({ kind: 'title', why: 'not-present' });
  });

  it('7. another current Blobbi: asked once; "stay" is remembered for that island and that Blobbi', () => {
    expect(decideEntry(facts({ current: { status: 'current', ...MOCHI } }))).toEqual({ kind: 'offer-switch', island: 'turtle:island-1', d: MOCHI.d, name: 'Mochi' });
    const store = memoryStore();
    rememberStay(store, 'turtle:island-1', ME, MOCHI.d, 1);
    const stayed = (island: string, d: string) => stayedWith(store, island, ME, d);
    expect(decideEntry(facts({ current: { status: 'current', ...MOCHI }, stayed }))).toEqual({ kind: 'enter', island: 'turtle:island-1' });
    // The current Blobbi changes again: asked again. Another identity's "stay" never counts.
    const BEAN = { d: 'blobbi-aaaaaaaaaaaa-c1b2c3d4e5', name: 'Bean', seed: 'seed-bean', walkable: true };
    expect(decideEntry(facts({ current: { status: 'current', ...BEAN }, stayed }))).toMatchObject({ kind: 'offer-switch', name: 'Bean' });
    expect(stayedWith(store, 'turtle:island-1', 'b'.repeat(64), MOCHI.d)).toBe(false);
    // A current Blobbi that cannot walk (an egg, a V1/V2 without colours) is never offered.
    expect(decideEntry(facts({ current: { status: 'current', ...MOCHI, walkable: false } }))).toEqual({ kind: 'enter', island: 'turtle:island-1' });
  });

  it('8. islands another identity (or a guest) played last are never entered for this one', () => {
    expect(decideEntry(facts({ islands: [{ identity: 'x', lastSeed: 'kiwi-guest' }] }))).toEqual({ kind: 'title', why: 'not-mine' });
    expect(decideEntry(facts({ islands: [{ identity: 'x', lastSeed: null }] }))).toEqual({ kind: 'title', why: 'not-mine' });
    // Their island, but the Blobbi that would walk now is not theirs (the default visitor, another account's).
    expect(decideEntry(facts({ walkingSeed: 'blobbi-9' }))).toEqual({ kind: 'title', why: 'walking-not-mine' });
  });

  it('9. a link, #menu, a lab mode, or a title already touched: the title, untouched', () => {
    expect(decideEntry(facts({ allowed: false }))).toEqual({ kind: 'title', why: 'not-allowed' });
  });

  it('the decision has no way to make an identity, a Blobbi or an island, or to publish', () => {
    const src = readFileSync('src/game/world-entry.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Companion sync: the shared ordering rules (pure: no network, no storage) and the selection record's stamp types
    expect(src.match(/^import .*$/gm)).toEqual(["import type { KeyValueStore } from './persistence';", "import { globalChoiceAt, orderChoices, type ChoiceOrder, type LocalChoiceFacts } from './companion-order';", "import type { ProfileStamp, SeenProfile } from './blobbi-selection';"]);
    const order = readFileSync('src/game/companion-order.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(order.match(/^import .*$/gm)).toBeNull();
    expect(src).not.toMatch(/reserve|create|publish|sign|fetch|WebSocket|vault/i);
  });

  it('the stay memory is public data, survives damage as "not stayed"', () => {
    const store = memoryStore();
    store.set(ENTRY_CHOICE_KEY, '{nonsense');
    expect(stayedWith(store, 'x', ME, MOCHI.d)).toBe(false);
    rememberStay(store, 'x', ME, MOCHI.d, 5);
    expect(JSON.parse(store.get(ENTRY_CHOICE_KEY)!)).toEqual({ version: 1, islands: { x: { pubkey: ME, d: MOCHI.d, at: 5 } } });
  });
});

/** The title as main.ts gives it (one island, or none), connected or not. */
function title(o: { islands?: number; connected?: boolean; current?: () => { name: string } | null; mine?: () => void } = {}) {
  const worlds = Array.from({ length: o.islands ?? 0 }, (_, i) => ({ identity: `w${i}`, name: `Island ${i}`, kind: 'turtle', day: 1, lastPlayed: 0, params: {} })) as never[];
  return new TitleScreen({
    worlds: () => worlds,
    current: () => ({ identity: 'none', name: '', saved: false }),
    continueGame: () => {},
    openWorld: () => {},
    settings: () => {},
    account: (): TitleAccount => ({ status: o.connected === false ? 'disconnected' : 'connected', name: null, signerAvailable: true, method: 'vault' }),
    currentBlobbi: o.current ?? (() => null),
    myBlobbis: o.mine,
  });
}

describe('M11D.8: the title pages of a seamless entry', () => {
  it('welcome back (no island here): a new adventure WITH the current Blobbi, offered first; no new egg', () => {
    setLocale('en');
    const tt = title({ current: () => ({ name: 'Pudding' }) });
    tt.arrived('Pudding');
    expect(tt.page).toBe('arrived');
    tt.key('Enter'); // NEW ADVENTURE WITH PUDDING
    expect(tt.page).toBe('carrier');
    tt.chooseCarrier(0);
    tt.key('Enter'); // CREATE ISLAND
    expect(tt.page).toBe('companion');
    tt.key('Enter'); // the first row: CONTINUE WITH PUDDING
    expect(tt.takeCreate()).toMatchObject({ companion: 'current' });
  });

  it('welcome back offers MY BLOBBIS and a way back to the main menu', () => {
    let opened = 0;
    const tt = title({ current: () => ({ name: 'Pudding' }), mine: () => opened++ });
    tt.arrived('Pudding');
    tt.key('ArrowDown');
    tt.key('Enter');
    expect(opened).toBe(1);
    tt.key('ArrowDown');
    tt.key('Enter'); // BACK
    expect(['main', 'welcome']).toContain(tt.page);
  });

  it('who comes along: BRING runs the switch, CONTINUE keeps; BACK forgets the question', () => {
    const calls: string[] = [];
    const tt = title({ islands: 1 });
    const offer = () => tt.offerSwitch({ current: 'Mochi', walking: 'Pudding', island: 'Sunny Shell', bring: () => calls.push('bring'), keep: () => calls.push('keep') });
    offer();
    expect(tt.page).toBe('switch');
    tt.key('Enter');
    offer();
    tt.key('ArrowDown');
    tt.key('Enter');
    expect(calls).toEqual(['bring', 'keep']);
    offer();
    tt.key('Escape');
    expect(tt.page).toBe('main');
    expect(calls.length).toBe(2);
  });

  it('a key or a touch on the title marks it touched (an automatic entry then never takes over)', () => {
    const tt = title({ islands: 1 });
    expect(tt.touched).toBe(false);
    tt.key('ArrowDown');
    expect(tt.touched).toBe(true);
    const t2 = title({ islands: 1 });
    t2.pointer(0, 0);
    expect(t2.touched).toBe(true);
  });

  it('the new words exist in three languages, with no em dash and no protocol words', () => {
    const keys = Object.keys(en).filter((k) => k.startsWith('title.arrived.') || k.startsWith('title.switch.'));
    // M11D.8.2 added `title.arrived.bodyIslands` (a chosen Blobbi with islands saved here).
    expect(keys.length).toBe(11);
    for (const cat of [en, ptBR, es] as Record<string, string>[])
      for (const k of keys) {
        expect(cat[k], k).toBeTruthy();
        expect(cat[k], k).not.toMatch(/\u2014/);
        expect(cat[k], k).not.toMatch(/nostr|relay|nsec|npub|11125|31124/i);
      }
    expect(upper(en['title.switch.bring'].replace('{name}', 'Mochi'))).toBe('BRING MOCHI');
  });
});

describe('M11D.8: disconnect and reconnect', () => {
  it('after DISCONNECT there is no account (no entry); restoring the backup again reconnects the same identity, nothing new', async () => {
    const p = ownedBaby();
    const b = browser({ reader: fakeRelays([p.event]).reader });
    expect((await b.svc.restoreBackup(p.nsec, '')).ok).toBe(true);
    expect(b.account.snapshot()).toMatchObject({ status: 'connected', pubkey: p.owner, method: 'vault' });
    b.account.disconnect();
    expect(b.account.snapshot().status).toBe('guest');
    expect(await b.svc.keeps(p.owner)).toBe(true); // the vault keeps the key: backups still restore
    const again = await b.svc.restoreBackup(p.nsec, '');
    expect(again).toMatchObject({ ok: true, value: { pubkey: p.owner, alreadyHere: true } });
    expect(b.account.snapshot()).toMatchObject({ status: 'connected', pubkey: p.owner, method: 'vault' });
    expect((await b.vault.list()).length).toBe(1);
    expect(b.sent()).toBe(0);
  });
});
