// M11D.8, PART A: while a restored identity's Blobbis are looked for, the page says so (its own title and words,
// lights travelling between little worlds; resting lights with reduced motion), CONTINUE cannot be pressed, nothing
// celebrates yet; a find leads to "PUDDING IS BACK!", a timeout to the honest offline page, LOOK AGAIN to the
// loading page again. Every language fits. Nothing is ever sent.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdentityScreen } from '../src/ui/screens/identity';
import { GameUI } from '../src/ui/game-ui';
import { Gfx } from '../src/ui/gfx';
import { LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { loadLocale, setLocale, upper, type Locale } from '../src/i18n';
import { en } from '../src/i18n/messages/en';
import { ptBR } from '../src/i18n/messages/pt-BR';
import { es } from '../src/i18n/messages/es';
import { browser, fakeRelays, ownedBaby } from './helpers/restore-fixtures';

const CATALOGS = { en, 'pt-BR': ptBR, es } as unknown as Record<Locale, Record<string, string>>;

afterEach(() => {
  vi.restoreAllMocks();
  setLocale('en');
});

let world: LiveWorld | null = null;
const islandBehind = () => (world ??= new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16));
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 300 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
};

/** Restore from the raw key through the screen and stop while the look is under way (the relays are gated). */
async function restoring(locale: Locale = 'en', o: { gate?: boolean; hang?: boolean } = { gate: true }) {
  await loadLocale(locale);
  setLocale(locale);
  const p = ownedBaby();
  const relays = fakeRelays([p.event], o);
  const b = browser({ reader: relays.reader, findTimeoutMs: o.hang ? 2000 : 60_000 });
  const ui = new GameUI(islandBehind, () => paletteFor('cozy'));
  const sc = new IdentityScreen();
  const continued: (string | null)[] = [];
  sc.identity = b.svc;
  sc.host = { editText: () => {}, pickFile: () => {}, pasteText: () => {}, download: () => {}, copy: async () => false, walking: () => ({ reserved: null, legacyLocal: false }), bring: () => {}, continueAfterRestore: (d) => continued.push(d), portraitOf: () => null };
  ui.register(sc);
  sc.start('restore');
  ui.open('identity');
  sc.setLoaded(p.nsec);
  sc.index = 2; // LOOK INSIDE
  ui.handleKey('Enter');
  await until(() => sc.page === 'restorePreview');
  ui.handleKey('Enter'); // RESTORE
  await until(() => sc.page === 'restoreDone' && !!sc.search);
  return { p, relays, b, ui, sc, continued, cat: CATALOGS[locale] };
}

/** One drawing of the page: its paragraphs (with where they end) and its buttons (with where they start). */
function drawn(ui: GameUI, now = 0) {
  const paras: { text: string; bottom: number; cut: boolean }[] = [];
  const buttons: { label: string; y: number; enabled: boolean }[] = [];
  const para = Gfx.prototype.para;
  const button = Gfx.prototype.button;
  vi.spyOn(Gfx.prototype, 'para').mockImplementation(function (this: Gfx, text, x, y, maxW, ...rest) {
    const used = para.call(this, text, x, y, maxW, ...rest);
    if (x > 0) paras.push({ text, bottom: y + used, cut: this.lines(text, maxW).length * 7 > used });
    return used;
  });
  vi.spyOn(Gfx.prototype, 'button').mockImplementation(function (this: Gfx, label, x, y, action, opts) {
    if (x > 0 && label !== 'X') buttons.push({ label, y, enabled: opts?.enabled ?? true });
    return button.call(this, label, x, y, action, opts);
  });
  const buf = new PixelBuffer(960, 540);
  ui.render(buf, now);
  vi.restoreAllMocks();
  return { paras, buttons, buf };
}
const texts = (d: ReturnType<typeof drawn>) => d.paras.map((p) => p.text);

describe('M11D.8: the loading page while its Blobbis are looked for', () => {
  it('says what is happening, CONTINUE cannot be pressed, nothing celebrates; a find leads to PUDDING IS BACK', async () => {
    const { ui, sc, relays, continued, b } = await restoring();
    expect(sc.search?.status).toBe('looking');
    expect(sc.searching()).toBe(true);
    const page = drawn(ui);
    expect(texts(page)).toEqual([upper(en['identity.restore.searchTitle']), en['identity.restore.searchBody']]);
    expect(texts(page).join(' ')).not.toMatch(/relay|nostr|nsec|npub/i);
    expect(page.buttons.map((x) => [x.label.toUpperCase(), x.enabled])).toEqual([
      [upper(en['identity.restore.continue']), false],
      [upper(en['identity.restore.later']), true],
    ]);
    expect((sc as unknown as { mood: (ui: GameUI) => { party: boolean } }).mood(ui).party).toBe(false);
    // ENTER while looking presses the only enabled action (NOT NOW): nothing continues, nothing is made.
    sc.index = 0;
    const keys = (sc as unknown as { actions: (ui: GameUI) => { label: string; enabled?: boolean }[] }).actions(ui).filter((a) => a.enabled !== false);
    expect(keys.map((a) => a.label)).toEqual([en['identity.restore.later']]);
    // The relays answer: PUDDING IS BACK!
    await until(() => relays.asked.length === 1);
    relays.release();
    await until(() => sc.search?.status !== 'looking');
    expect(sc.search?.status).toBe('found');
    const done = drawn(ui);
    expect(texts(done)[0]).toBe(upper(en['identity.restore.doneTitle'].replace('{name}', 'Pudding')));
    expect(done.buttons[0]).toMatchObject({ enabled: true });
    expect(done.buttons[0].label.toUpperCase()).toBe(upper(en['identity.restore.continueWith'].replace('{name}', 'Pudding')));
    expect((sc as unknown as { mood: (ui: GameUI) => { party: boolean } }).mood(ui).party).toBe(true);
    ui.handleKey('Enter');
    expect(continued).toEqual([sc['preview']!.blobbis[0].d]);
    expect(b.svc.reserved().length).toBe(1);
    expect(b.sent()).toBe(0);
  }, 30_000);

  it('a timeout leads to the offline page; LOOK AGAIN shows the loading page again, then the find', async () => {
    const { ui, sc, relays, b } = await restoring('en', { hang: true });
    await until(() => sc.search?.status !== 'looking');
    expect(sc.search?.status).toBe('unavailable');
    expect(texts(drawn(ui))).toContain(en['identity.restore.offline']);
    // The relays come back but answer only when released: LOOK AGAIN shows the loading page meanwhile.
    relays.state.hang = false;
    relays.state.gate = true;
    ui.handleKey('Enter'); // LOOK AGAIN
    expect(sc.searching()).toBe(true);
    expect(texts(drawn(ui))).toContain(en['identity.restore.searchBody']);
    await until(() => relays.asked.length === 2); // the second look has asked the relays
    relays.release();
    await until(() => sc.search?.status !== 'looking');
    expect(sc.search?.status).toBe('found');
    expect(b.svc.reserved().map((r) => r.name)).toEqual(['Pudding']);
    expect(relays.asked.length).toBe(2);
    expect(b.sent()).toBe(0);
  }, 30_000);

  it('the lights travel while looking, and rest with reduced motion', async () => {
    const { ui } = await restoring();
    const moving = [drawn(ui, 0).buf, drawn(ui, 1.3).buf];
    expect(Buffer.compare(Buffer.from(moving[0].data.buffer), Buffer.from(moving[1].data.buffer))).not.toBe(0);
    ui.settings.reducedMotion = true;
    const still = [drawn(ui, 0).buf, drawn(ui, 1.3).buf];
    expect(Buffer.compare(Buffer.from(still[0].data.buffer), Buffer.from(still[1].data.buffer))).toBe(0);
  }, 30_000);

  for (const locale of ['en', 'pt-BR', 'es'] as Locale[])
    it(`every word fits, at every text size (${locale})`, async () => {
      const { ui, cat, relays } = await restoring(locale);
      for (const size of ['small', 'normal', 'large'] as const) {
        ui.settings.textSize = size;
        const page = drawn(ui);
        expect(texts(page), size).toEqual([upper(cat['identity.restore.searchTitle']), cat['identity.restore.searchBody']]);
        expect(page.paras.filter((x) => x.cut).map((x) => x.text), size).toEqual([]);
        expect(Math.max(...page.paras.map((x) => x.bottom)), size).toBeLessThanOrEqual(Math.min(...page.buttons.map((x) => x.y)));
      }
      relays.release();
    }, 30_000);

  it('the loading words exist in three languages, with no em dash and no protocol words', () => {
    for (const cat of Object.values(CATALOGS))
      for (const k of ['identity.restore.searchTitle', 'identity.restore.searchBody']) {
        expect(cat[k], k).toBeTruthy();
        expect(cat[k], k).not.toMatch(/\u2014/);
        expect(cat[k], k).not.toMatch(/relay|nostr|nsec|npub|31124|11125/i);
      }
    expect(en['identity.restore.searchTitle']).toBe('Looking for your Blobbi...');
  });
});
