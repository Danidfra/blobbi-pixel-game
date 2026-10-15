// M11D.8.2, ISSUE 2: a NIP-07 player who connects on the title and chooses one of their Blobbis (MY BLOBBIS) was left
// on the list (and, after closing it, on the menu with the previous adventure). Now the choice goes on at once: the
// Blobbi's island when exactly one here is theirs, the islands page when several, else WELCOME BACK with a new
// adventure for it (the Carrier choice). Nothing is made, nothing is overwritten; the islands of others stay listed.
// Also here: the title's and the account page's plain words when the extension holds another account.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { decideChosen } from '../src/game/world-entry';
import { TitleScreen, type TitleAccount } from '../src/ui/title';
import { BlobbisScreen } from '../src/ui/screens/blobbis';
import { SettingsScreen } from '../src/ui/screens/settings';
import { GameUI } from '../src/ui/game-ui';
import { Gfx } from '../src/ui/gfx';
import { LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { paletteFor } from '../src/world/generate';
import { setLocale, t, upper } from '../src/i18n';
import { en } from '../src/i18n/messages/en';
import { ptBR } from '../src/i18n/messages/pt-BR';
import { es } from '../src/i18n/messages/es';
import type { WorldEntry } from '../src/game/worlds';
import type { AccountPort, AccountSnapshot, OwnedBlobbi } from '../src/nostr/port';

const ME = 'a'.repeat(64);
const BOCA = { d: 'blobbi-aaaaaaaaaaaa-b0cab0cab0', name: 'Boca rosa', seed: 'seed-boca' };
const PUDDING_SEED = 'seed-pudding';

describe('M11D.8.2: where a Blobbi chosen on the title goes', () => {
  const base = { account: { pubkey: ME, present: true }, mine: new Set([PUDDING_SEED]), chosen: BOCA };
  it('no island here: a new adventure with it (welcome back), never a new egg', () => {
    expect(decideChosen({ ...base, islands: [] })).toEqual({ kind: 'welcome', d: BOCA.d, name: BOCA.name });
  });
  it('exactly one island of this identity: straight in with it (no "who comes along": it is the one chosen)', () => {
    expect(decideChosen({ ...base, islands: [{ identity: 'isle', lastSeed: PUDDING_SEED }] })).toEqual({ kind: 'enter', island: 'isle' });
    expect(decideChosen({ ...base, islands: [{ identity: 'isle', lastSeed: BOCA.seed }] })).toEqual({ kind: 'enter', island: 'isle' });
  });
  it('several islands of this identity: the islands page; islands of others or guests: a new adventure (they stay listed)', () => {
    expect(decideChosen({ ...base, islands: [{ identity: 'a', lastSeed: PUDDING_SEED }, { identity: 'b', lastSeed: BOCA.seed }] })).toEqual({ kind: 'choose-island', islands: ['a', 'b'] });
    expect(decideChosen({ ...base, islands: [{ identity: 'a', lastSeed: 'stranger' }, { identity: 'b', lastSeed: null }] })).toEqual({ kind: 'welcome', d: BOCA.d, name: BOCA.name });
    // One of this identity's among strangers': that one.
    expect(decideChosen({ ...base, islands: [{ identity: 'a', lastSeed: 'stranger' }, { identity: 'b', lastSeed: PUDDING_SEED }] })).toEqual({ kind: 'enter', island: 'b' });
  });
  it('the chosen Blobbi counts as the identity\'s even before the list knows it', () => {
    expect(decideChosen({ account: { pubkey: ME, present: true }, mine: new Set(), chosen: BOCA, islands: [{ identity: 'isle', lastSeed: BOCA.seed }] })).toEqual({ kind: 'enter', island: 'isle' });
  });
});

const world = (identity: string): WorldEntry => ({ identity, params: { seed: identity, kind: 'turtle', turtleSeed: 't', shellVariant: 0 } as unknown as WorldEntry['params'], name: identity, day: 1, quests: 0 } as WorldEntry);
function title(o: { worlds?: WorldEntry[]; account?: Partial<TitleAccount> } = {}) {
  const worlds = o.worlds ?? [];
  const opened: string[] = [];
  const tt = new TitleScreen({
    worlds: () => worlds,
    current: () => ({ identity: 'none', name: '', saved: false }),
    continueGame: () => opened.push('continue'),
    openWorld: (w) => opened.push(w.identity),
    settings: () => {},
    account: (): TitleAccount => ({ status: 'connected', name: 'Ana', signerAvailable: true, method: 'nip07', ...o.account }),
    myBlobbis: () => opened.push('mine'),
  });
  return { tt, opened };
}
/** The title's paragraphs and item labels as drawn. */
function drawnTitle(tt: TitleScreen) {
  const paras: string[] = [];
  const texts: string[] = [];
  const para = Gfx.prototype.para;
  const text = Gfx.prototype.text;
  vi.spyOn(Gfx.prototype, 'para').mockImplementation(function (this: Gfx, s, ...rest) {
    paras.push(s);
    return para.call(this, s, ...rest);
  });
  vi.spyOn(Gfx.prototype, 'text').mockImplementation(function (this: Gfx, s, ...rest) {
    texts.push(s);
    return text.call(this, s, ...rest);
  });
  tt.draw(new Gfx(320, 180, 1), 0);
  vi.restoreAllMocks();
  return { paras, texts };
}

describe('M11D.8.2: the welcome back page with islands saved here', () => {
  it('says the islands are one row away, lists them as a row, and still offers the new adventure first', () => {
    setLocale('en');
    const { tt, opened } = title({ worlds: [world('a'), world('b')] });
    tt.arrived('Boca rosa');
    expect(tt.page).toBe('arrived');
    const d = drawnTitle(tt);
    expect(d.paras).toContain(en['title.arrived.bodyIslands'].replaceAll('{name}', 'Boca rosa'));
    expect(d.texts).toContain(upper(en['title.arrived.go'].replace('{name}', 'Boca rosa')));
    expect(d.texts).toContain(upper(t('title.islandsCount', { count: 2 })));
    tt.key('ArrowDown'); // ISLANDS
    tt.key('Enter');
    expect(tt.page).toBe('islands');
    expect(opened).toEqual([]);
    // Without islands: the old body, no islands row.
    const none = title();
    none.tt.arrived('Boca rosa');
    const d2 = drawnTitle(none.tt);
    expect(d2.paras).toContain(en['title.arrived.body'].replaceAll('{name}', 'Boca rosa'));
    expect(d2.texts).not.toContain(upper(en['title.islands']));
  });
  it('the words exist in three languages, with no em dash and no protocol words', () => {
    for (const cat of [en, ptBR, es] as Record<string, string>[])
      for (const k of ['title.arrived.bodyIslands', 'title.login.connectedOther', 'title.login.mismatch', 'title.login.unconfirmed', 'account.extension.mismatch', 'account.extension.unconfirmed']) {
        expect(cat[k], k).toBeTruthy();
        expect(cat[k], k).not.toMatch(/—/);
        expect(cat[k], k).not.toMatch(/relay|nostr|nsec|npub|31124|11125/i);
      }
  });
});

describe('M11D.8.2: the extension holds another account', () => {
  it('the title says so on the connected row and the login page; CONNECT stays the explicit way to switch', () => {
    setLocale('en');
    const { tt } = title({ account: { extension: 'mismatch' } });
    const main = drawnTitle(tt);
    expect(main.texts).toContain(upper(en['title.login.connectedOther']));
    expect(main.texts).not.toContain(upper(en['title.login.connectedAs'].replace('{name}', 'Ana')));
    (tt as unknown as { go: (p: string) => void }).go('login');
    const login = drawnTitle(tt);
    expect(login.paras).toContain(en['title.login.mismatch']);
    const unconfirmed = title({ account: { extension: 'unconfirmed' } });
    (unconfirmed.tt as unknown as { go: (p: string) => void }).go('login');
    expect(drawnTitle(unconfirmed.tt).paras).toContain(en['title.login.unconfirmed']);
    const fine = title({ account: { extension: 'verified' } });
    (fine.tt as unknown as { go: (p: string) => void }).go('login');
    const p = drawnTitle(fine.tt).paras;
    expect(p).not.toContain(en['title.login.mismatch']);
    expect(p).not.toContain(en['title.login.unconfirmed']);
  });

  it('the ACCOUNT page says so too, for a NIP-07 account only', () => {
    setLocale('en');
    const snap = (o: Partial<AccountSnapshot>): AccountSnapshot => ({ status: 'connected', pubkey: ME, npub: 'npub1x', npubShort: 'npub1x', method: 'nip07', displayName: 'Ana', profile: 'found', profileAt: 1, problem: null, signerAvailable: true, extension: 'unchecked', relays: [], ...o });
    let s = snap({ extension: 'mismatch' });
    const port: AccountPort = { snapshot: () => s, connect: async () => {}, disconnect: () => {}, refreshProfile: async () => {} };
    const ui = new GameUI(() => new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16), () => paletteFor('cozy'));
    const settings = new SettingsScreen();
    settings.account = port;
    ui.register(settings);
    const texts: string[] = [];
    const g = { text: (x: string) => (texts.push(x), 0), heading: (x: string) => (texts.push(x), 40), para: (x: string) => (texts.push(x), 8), measure: (x: string) => x.length * 4, button: (x: string) => (texts.push(x), 40) };
    const draw = () => ((texts.length = 0), (settings as unknown as { drawAccount: (g: unknown, ui: GameUI, x: number, y: number, w: number) => void }).drawAccount(g, ui, 0, 0, 290), texts.join('|'));
    settings.showPage('account');
    expect(draw()).toContain(t('account.extension.mismatch'));
    s = snap({ extension: 'unconfirmed' });
    expect(draw()).toContain(t('account.extension.unconfirmed'));
    s = snap({ extension: 'verified' });
    expect(draw()).not.toMatch(/extension is signed in|did not confirm/);
    s = snap({ method: 'vault', extension: 'mismatch' });
    expect(draw()).not.toContain(t('account.extension.mismatch'));
  });
});

const owned = (o: Partial<OwnedBlobbi> = {}): OwnedBlobbi => ({ address: `31124:${ME}:${BOCA.d}`, pubkey: ME, d: BOCA.d, name: BOCA.name, stage: 'adult', generation: 'v3', availability: 'available', seed: BOCA.seed, colors: null, updatedAt: 1, ...o });

describe('M11D.8.2: MY BLOBBIS tells the host when a Blobbi was chosen', () => {
  function screen(items: OwnedBlobbi[], accept = true) {
    const ui = new GameUI(() => new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16), () => paletteFor('cozy'));
    const sc = new BlobbisScreen();
    const chosen: string[] = [];
    const told: string[] = [];
    sc.collection = { blobbis: () => ({ status: 'ready', owner: ME, items, partial: false, skipped: 0, fetchedAt: 1 }), loadBlobbis: async () => {} };
    sc.chooser = { selectedAddress: () => null, selectedStage: () => null, choose: (b) => (accept ? (chosen.push(b.name), true) : false), useVisitor: () => {} };
    sc.onChosen = (b) => told.push(b.name);
    ui.register(sc);
    ui.open('blobbis');
    return { ui, sc, chosen, told };
  }
  it('after a successful choice, once; never when the choice was refused or the Blobbi cannot visit', () => {
    const ok = screen([owned()]);
    ok.ui.handleKey('Enter');
    expect(ok.chosen).toEqual(['Boca rosa']);
    expect(ok.told).toEqual(['Boca rosa']);
    const refused = screen([owned()], false);
    refused.ui.handleKey('Enter');
    expect(refused.told).toEqual([]);
    const egg = screen([owned({ availability: 'egg', stage: 'egg' })]);
    egg.ui.handleKey('Enter');
    expect(egg.chosen).toEqual([]);
    expect(egg.told).toEqual([]);
  });
});

describe('M11D.8.2: the chosen flow in main.ts', () => {
  const src = readFileSync('src/playground/main.ts', 'utf8');
  it('closes MY BLOBBIS and carries the decision out, only over the title and only for the connected account\'s Blobbi', () => {
    const body = src.slice(src.indexOf('blobbisScreen.onChosen = (b) =>'), src.indexOf('Make a new island'));
    expect(body).toMatch(/if \(state\.mode !== 'play' \|\| !title\.active \|\| intro \|\| entry\.active\) return;/);
    expect(body).toMatch(/b\.pubkey !== pubkey\) return;/);
    expect(body).toMatch(/gameUI\.close\(\);/);
    expect(body).toMatch(/decideChosen\(/);
    expect(body).toMatch(/carryOut\(decision, b, pubkey, store\);/);
    // Never a new identity or Blobbi from here: no reserve, no create, no hatch.
    expect(body).not.toMatch(/reserve\(|createWorld\(|createAdventure\(/);
  });
});
