// M11D.8.2, ISSUE 1: the world-entry loading screen. While an automatic entry is decided the page says "Your Blobbi
// is on the way!" over the dimmed island (never the menu), with the connected worlds animation and the walking
// Blobbi arriving; MAIN MENU appears after a moment and ESC always works; after a while it says other worlds are slow;
// after longer it gives the title back by itself. No minimum time: a quick entry ends it at once. Reduced motion
// keeps everything still. Every language fits. The transitions are replayed with the real `runEntry`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { EntryScreen, ENTRY_GIVE_UP, ENTRY_MENU_AFTER, ENTRY_SLOW_AFTER } from '../src/ui/entry-screen';
import { GameUI } from '../src/ui/game-ui';
import { Gfx } from '../src/ui/gfx';
import { PixelBuffer } from '../src/core/pixel';
import { LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { paletteFor } from '../src/world/generate';
import { loadLocale, setLocale, upper, type Locale } from '../src/i18n';
import { en } from '../src/i18n/messages/en';
import { ptBR } from '../src/i18n/messages/pt-BR';
import { es } from '../src/i18n/messages/es';
import { textPreference } from '../src/ui/surface';
import { decideEntry, entryAddress, runEntry, type EntryDecision, type EntryFacts } from '../src/game/world-entry';
import type { ExtensionCheck } from '../src/nostr/port';

const CATALOGS = { en, 'pt-BR': ptBR, es } as unknown as Record<Locale, Record<string, string>>;

afterEach(() => {
  vi.restoreAllMocks();
  setLocale('en');
  textPreference.smaller = false;
});

let world: LiveWorld | null = null;
const islandBehind = () => (world ??= new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16));
const sprite = (): PixelBuffer => {
  // A little creature-shaped picture (opaque where it stands).
  const p = new PixelBuffer(9, 11);
  for (let y = 0; y < 11; y++) for (let x = 0; x < 9; x++) if (Math.abs(x - 4) + Math.max(0, y - 6) <= 4) p.set(x, y, 0xff88ccff);
  return p;
};

function page(o: { portrait?: boolean } = {}) {
  const ui = new GameUI(islandBehind, () => paletteFor('cozy'));
  const cancelled: number[] = [];
  const entry: EntryScreen = new EntryScreen({ portrait: o.portrait === false ? undefined : sprite, cancel: () => (cancelled.push(1), entry.end()) }, ui);
  return { ui, entry, cancelled };
}

/** One drawing: its headings and paragraphs (where they end, whether cut) and its buttons, plus the frame. */
function drawn(entry: EntryScreen, now: number) {
  const paras: { text: string; bottom: number; cut: boolean }[] = [];
  const buttons: { label: string; y: number }[] = [];
  const headings: string[] = [];
  const para = Gfx.prototype.para;
  const button = Gfx.prototype.button;
  const heading = Gfx.prototype.heading;
  vi.spyOn(Gfx.prototype, 'para').mockImplementation(function (this: Gfx, text, x, y, maxW, ...rest) {
    const used = para.call(this, text, x, y, maxW, ...rest);
    paras.push({ text, bottom: y + used, cut: this.lines(text, maxW).length * 7 > used });
    return used;
  });
  vi.spyOn(Gfx.prototype, 'heading').mockImplementation(function (this: Gfx, text, ...rest) {
    headings.push(text);
    return heading.call(this, text, ...rest);
  });
  vi.spyOn(Gfx.prototype, 'button').mockImplementation(function (this: Gfx, label, x, y, action, opts) {
    buttons.push({ label, y });
    return button.call(this, label, x, y, action, opts);
  });
  const buf = new PixelBuffer(960, 540);
  entry.render(buf, now);
  vi.restoreAllMocks();
  return { paras, buttons, headings, buf };
}
const same = (a: PixelBuffer, b: PixelBuffer) => Buffer.compare(Buffer.from(a.data.buffer), Buffer.from(b.data.buffer)) === 0;

describe('M11D.8.2: the world-entry loading screen', () => {
  it('says that the Blobbi is on the way, over the dimmed island, with no menu and no button at first', () => {
    const { entry } = page();
    entry.begin();
    expect(entry.active).toBe(true);
    expect(entry.waiting()).toBe(true);
    const d = drawn(entry, 10);
    expect(d.headings).toEqual([en['entry.title']]);
    expect(d.paras.map((p) => p.text)).toEqual([en['entry.body']]);
    expect(d.buttons).toEqual([]);
    expect(entry.menuOffered()).toBe(false);
    // Nothing of the menu: no CONTINUE, no NEW ADVENTURE, no SETTINGS.
    const all = [...d.headings, ...d.paras.map((p) => p.text), ...d.buttons.map((b) => b.label)].join(' ');
    expect(all).not.toMatch(/continue|new adventure|settings|nostr|relay/i);
  });

  it('MAIN MENU appears after a moment, the slow line after a while; both give the title back', () => {
    const { entry, cancelled } = page();
    entry.begin();
    drawn(entry, 100);
    const early = drawn(entry, 100 + ENTRY_MENU_AFTER - 0.1);
    expect(early.buttons).toEqual([]);
    const offered = drawn(entry, 100 + ENTRY_MENU_AFTER);
    expect(offered.buttons.map((b) => b.label)).toEqual([en['entry.menu']]);
    expect(offered.paras.map((p) => p.text)).toEqual([en['entry.body']]);
    const slow = drawn(entry, 100 + ENTRY_SLOW_AFTER);
    expect(slow.paras.map((p) => p.text)).toEqual([en['entry.body'], en['entry.slow']]);
    // The button (pressed where it was drawn) gives the title back; the run then changes nothing.
    const hit = entry.regions[0];
    expect(hit).toBeTruthy();
    expect(entry.pointer(hit.x + 1, hit.y + 1)).toBe(true);
    expect(cancelled).toEqual([1]);
    expect(entry.active).toBe(false);
    expect(entry.waiting()).toBe(false);
    expect(entry.cancelled).toBe(true);
  });

  it('ESC gives the title back at any time; ENTER only once MAIN MENU is offered; other keys never leak', () => {
    const a = page();
    a.entry.begin();
    drawn(a.entry, 0);
    expect(a.entry.key('ArrowDown')).toBe(true);
    expect(a.entry.key('Enter')).toBe(true);
    expect(a.cancelled).toEqual([]);
    expect(a.entry.key('Escape')).toBe(true);
    expect(a.cancelled).toEqual([1]);
    const b = page();
    b.entry.begin();
    drawn(b.entry, 0);
    drawn(b.entry, ENTRY_MENU_AFTER + 0.5);
    b.entry.key('Enter');
    expect(b.cancelled).toEqual([1]);
    // Inactive: nothing is taken.
    expect(b.entry.key('Escape')).toBe(false);
    expect(b.entry.pointer(1, 1)).toBe(false);
  });

  it('gives up by itself after a long wait: the title comes back, nothing blocks for good', () => {
    const { entry, cancelled } = page();
    entry.begin();
    drawn(entry, 0);
    drawn(entry, ENTRY_GIVE_UP - 0.1);
    expect(cancelled).toEqual([]);
    drawn(entry, ENTRY_GIVE_UP);
    expect(cancelled).toEqual([1]);
    expect(entry.active).toBe(false);
  });

  it('the lights travel and the Blobbi arrives, then breathes; with reduced motion everything is still', () => {
    const { entry, ui } = page();
    entry.begin();
    const arriving = drawn(entry, 0).buf;
    const arrived = drawn(entry, 1.2).buf;
    const later = drawn(entry, 1.45).buf;
    expect(same(arriving, arrived)).toBe(false);
    expect(same(arrived, later)).toBe(false);
    ui.settings.reducedMotion = true;
    const still = page();
    still.ui.settings.reducedMotion = true;
    still.entry.begin();
    const s0 = drawn(still.entry, 0).buf;
    const s1 = drawn(still.entry, 1.3).buf;
    expect(same(s0, s1)).toBe(true);
    // The silhouette is drawn (the frame differs from one without a portrait).
    const none = page({ portrait: false });
    none.ui.settings.reducedMotion = true;
    none.entry.begin();
    expect(same(s0, drawn(none.entry, 0).buf)).toBe(false);
  });

  it('the extension line shows only in the signer phase, before the slow line takes over', () => {
    const { entry } = page();
    entry.begin();
    entry.phase = 'signer';
    expect(drawn(entry, 0).paras.map((p) => p.text)).toEqual([en['entry.body'], en['entry.signer']]);
    entry.phase = 'worlds';
    expect(drawn(entry, 1).paras.map((p) => p.text)).toEqual([en['entry.body']]);
    entry.phase = 'signer';
    expect(drawn(entry, ENTRY_SLOW_AFTER + 1).paras.map((p) => p.text)).toEqual([en['entry.body'], en['entry.slow']]);
  });

  it('end() takes the page away at once (no minimum time) and a new begin() starts afresh', () => {
    const { entry } = page();
    entry.begin();
    drawn(entry, 0);
    drawn(entry, 5);
    entry.end();
    expect(entry.active).toBe(false);
    expect(entry.elapsed()).toBe(5);
    entry.begin();
    expect(entry.elapsed()).toBe(0);
    expect(entry.cancelled).toBe(false);
    expect(entry.phase).toBe('account');
  });

  for (const locale of ['en', 'pt-BR', 'es'] as Locale[])
    it(`every word fits, at every text size, with the slow line and the button (${locale})`, async () => {
      await loadLocale(locale);
      setLocale(locale);
      const cat = CATALOGS[locale];
      for (const smaller of [false, true]) {
        textPreference.smaller = smaller;
        const { entry } = page();
        entry.begin();
        entry.phase = 'signer';
        drawn(entry, 0);
        const d = drawn(entry, ENTRY_SLOW_AFTER + 1);
        expect(d.headings, String(smaller)).toEqual([cat['entry.title']]);
        expect(d.paras.map((p) => p.text), String(smaller)).toEqual([cat['entry.body'], cat['entry.slow']]);
        expect(d.paras.filter((p) => p.cut), String(smaller)).toEqual([]);
        expect(Math.max(...d.paras.map((p) => p.bottom)), String(smaller)).toBeLessThanOrEqual(d.buttons[0].y);
        expect(d.buttons.map((b) => upper(b.label))).toEqual([upper(cat['entry.menu'])]);
      }
    });

  it('the words exist in three languages, with no em dash and no protocol words; the English copy is the brief\'s', () => {
    for (const cat of Object.values(CATALOGS))
      for (const k of ['entry.title', 'entry.body', 'entry.signer', 'entry.slow', 'entry.menu']) {
        expect(cat[k], k).toBeTruthy();
        expect(cat[k], k).not.toMatch(/—/);
        expect(cat[k], k).not.toMatch(/relay|nostr|nsec|npub|31124|11125|nip/i);
      }
    expect(en['entry.title']).toBe('Your Blobbi is on the way!');
    expect(en['entry.body']).toBe('Checking your adventures and looking for your Blobbi across connected worlds...');
  });
});

// ─── The transitions, with the real entry run ────────────────────────────────────────────────────────────────────

const ME = 'a'.repeat(64);
type Answer = { status: 'current'; d: string; name: string; seed: string } | { status: 'unavailable' | 'no-selection' };
const hash = (h: string) => new URLSearchParams(h.replace(/^#/, ''));

/**
 * The start of play as `main.ts` runs it: the loading page only while a connected account is really looked at, the
 * entry run with the page's `waiting()`, the page ended the moment the run settles.
 */
function startOfPlay(o: { address?: string; account: { pubkey: string; method: 'vault' | 'nip07' } | null; verify?: () => Promise<ExtensionCheck>; current: () => Promise<Answer>; islands?: { identity: string; lastSeed: string | null }[] }) {
  const { entry, ui, cancelled } = page();
  const address = entryAddress(hash(o.address ?? '#mode=play'));
  const calls: string[] = [];
  const run = async (): Promise<{ decision: EntryDecision } | null> => {
    if (!address.allowed || !o.account) return null;
    entry.begin();
    const r = await runEntry<Answer>({
      account: () => o.account,
      present: () => {
        if (o.account!.method === 'vault') return Promise.resolve(true);
        entry.phase = 'signer';
        calls.push('verify');
        return o.verify!().then((v) => v === 'verified');
      },
      current: () => ((entry.phase = 'worlds'), calls.push('current'), o.current()),
      waiting: () => entry.waiting(),
      facts: (pubkey, present, a): EntryFacts => ({
        allowed: true,
        account: { pubkey, present },
        islands: o.islands ?? [{ identity: 'isle', lastSeed: 'seed-p' }],
        mine: new Set(['seed-p']),
        walkingSeed: 'seed-p',
        current: a.status === 'current' ? { status: 'current', d: a.d, name: a.name, seed: a.seed, walkable: true } : { status: a.status },
      }),
    });
    entry.end();
    return r ? { decision: r.decision } : null;
  };
  return { entry, ui, cancelled, calls, run };
}
const ENTER = { kind: 'enter', island: 'isle' };
const gate = <T,>() => {
  let release!: (v: T) => void;
  const promise = new Promise<T>((r) => (release = r));
  return { promise, release: (v: T) => release(v) };
};

describe('M11D.8.2: the transitions', () => {
  it('a fast resolution: the page shows while the run is pending and is gone the moment it settles (no minimum time)', async () => {
    const s = startOfPlay({ account: { pubkey: ME, method: 'vault' }, current: async () => ({ status: 'unavailable' }) });
    const p = s.run();
    expect(s.entry.active).toBe(true);
    expect(drawn(s.entry, 0).buttons).toEqual([]);
    expect((await p)?.decision).toEqual(ENTER);
    expect(s.entry.active).toBe(false);
    expect(s.cancelled).toEqual([]);
  });

  it('a slow resolution: the page stays, offers MAIN MENU, then the island opens when the worlds answer', async () => {
    const g = gate<Answer>();
    const s = startOfPlay({ account: { pubkey: ME, method: 'vault' }, current: () => g.promise });
    const p = s.run();
    await Promise.resolve();
    drawn(s.entry, 0);
    expect(drawn(s.entry, 1).buttons).toEqual([]);
    expect(drawn(s.entry, 3).buttons.map((b) => b.label)).toEqual([en['entry.menu']]);
    expect(s.entry.active).toBe(true);
    g.release({ status: 'current', d: 'd-p', name: 'Pudding', seed: 'seed-p' });
    expect((await p)?.decision).toEqual(ENTER);
    expect(s.entry.active).toBe(false);
  });

  it('MAIN MENU while waiting: the title is the player\'s; the late answer changes nothing', async () => {
    const g = gate<Answer>();
    const s = startOfPlay({ account: { pubkey: ME, method: 'vault' }, current: () => g.promise });
    const p = s.run();
    await Promise.resolve();
    drawn(s.entry, 0);
    s.entry.key('Escape');
    expect(s.cancelled).toEqual([1]);
    g.release({ status: 'current', d: 'd-p', name: 'Pudding', seed: 'seed-p' });
    expect(await p).toBeNull();
    expect(s.entry.active).toBe(false);
  });

  it('#menu, a guest, SETTINGS > MAIN MENU: the title at once, the page never begins, nothing is read', async () => {
    const menu = startOfPlay({ address: '#menu', account: { pubkey: ME, method: 'vault' }, current: async () => ({ status: 'unavailable' }) });
    expect(await menu.run()).toBeNull();
    expect(menu.entry.active).toBe(false);
    expect(menu.calls).toEqual([]);
    const guest = startOfPlay({ account: null, current: async () => ({ status: 'unavailable' }) });
    expect(await guest.run()).toBeNull();
    expect(guest.entry.active).toBe(false);
    expect(guest.calls).toEqual([]);
  });

  it('offline (the worlds do not answer): straight in with the Blobbi of this device, after the wait, no retry loop', async () => {
    const s = startOfPlay({ account: { pubkey: ME, method: 'vault' }, current: async () => ({ status: 'unavailable' }) });
    expect((await s.run())?.decision).toEqual(ENTER);
    expect(s.calls).toEqual(['current']);
  });

  it('a browser extension: verified enters; another account, no answer or no extension keeps the title (never that island)', async () => {
    for (const [answer, expected] of [
      ['verified', ENTER],
      ['mismatch', { kind: 'title', why: 'not-present' }],
      ['unconfirmed', { kind: 'title', why: 'not-present' }],
      ['absent', { kind: 'title', why: 'not-present' }],
    ] as [ExtensionCheck, EntryDecision][]) {
      const s = startOfPlay({ account: { pubkey: ME, method: 'nip07' }, verify: async () => answer, current: async () => ({ status: 'unavailable' }) });
      const p = s.run();
      await Promise.resolve();
      expect(s.entry.phase, answer).toBe('signer');
      expect((await p)?.decision, answer).toEqual(expected);
      expect(s.calls, answer).toEqual(answer === 'verified' ? ['verify', 'current'] : ['verify']);
      expect(s.entry.active).toBe(false);
    }
  });

  it('the decision itself never makes anything: a stranger\'s island or a stranger\'s Blobbi keeps the title', () => {
    const base: EntryFacts = { allowed: true, account: { pubkey: ME, present: true }, islands: [{ identity: 'isle', lastSeed: 'other' }], mine: new Set(['seed-p']), walkingSeed: 'seed-p', current: { status: 'unavailable' } };
    expect(decideEntry(base)).toEqual({ kind: 'title', why: 'not-mine' });
    expect(decideEntry({ ...base, account: { pubkey: ME, present: false } })).toEqual({ kind: 'title', why: 'not-present' });
  });
});

describe('M11D.8.2: the page wiring in main.ts', () => {
  const src = readFileSync('src/playground/main.ts', 'utf8');
  it('the title frame draws the loading page instead of the menu while it is up, and gives up to the title', () => {
    const frame = src.slice(src.indexOf('function titleFrame'), src.indexOf('function playFrame'));
    expect(frame).toMatch(/if \(entry\.active\) entry\.render\(frame, t\);/);
    expect(frame).toMatch(/if \(!entry\.active\) title\.render\(frame, t\);/);
  });
  it('the keyboard and the pointer reach the loading page first while it is up', () => {
    expect(src).toMatch(/if \(entry\.active\) \{\s*if \(!e\.repeat\) entry\.key\(e\.code\);/);
    expect(src).toMatch(/if \(entry\.active\) entry\.pointer\(sx, sy\);\s*else title\.pointer\(sx, sy\);/);
  });
  it('the automatic entry shows the page only for a connected account, ends it when settled, and checks the extension', () => {
    const body = src.slice(src.indexOf('async function autoEnter'), src.indexOf('Make a new island'));
    expect(body).toMatch(/if \(snap\.status !== 'connected' \|\| !snap\.pubkey\) return;[\s\S]*entry\.begin\(\);/);
    expect(body).toMatch(/entry\.end\(\);\s*const store = localStore\(\);/);
    expect(body).toMatch(/account\.verifyExtension\(6000\)\.then\(\(r\) => r === 'verified'\)/);
    expect(body).toMatch(/waiting: \(\) => .*entry\.waiting\(\)/);
    expect(body).not.toMatch(/Promise\.resolve\(snap\.signerAvailable\)/);
  });
});
