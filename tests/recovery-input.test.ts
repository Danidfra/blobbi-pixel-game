// P1.2A (iPhone feedback): the recovery field stays visible above the keyboard, PASTE reads the clipboard only in the
// player's own tap, and "Choose the backup file" opens the chooser from a real element.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { GameUI } from '../src/ui/game-ui';
import { PixelBuffer } from '../src/core/pixel';
import { paletteFor } from '../src/world/generate';
import { LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { IdentityScreen, type ClipboardRead, type IdentityHost } from '../src/ui/screens/identity';
import { keyboardLift, visibleBand } from '../src/playground/keyboard-lift';

const KEY = 'ncryptsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

afterEach(() => vi.restoreAllMocks());

const setup = (read?: () => Promise<ClipboardRead>) => {
  const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
  const u = new GameUI(() => live, () => paletteFor('cozy'));
  const sc = new IdentityScreen();
  const picked: string[] = [];
  const host: IdentityHost = { pickFile: () => picked.push('keys'), download: () => {}, copy: async () => false, walking: () => ({ reserved: null, legacyLocal: false }), bring: () => {} };
  if (read) host.readClipboard = read;
  sc.host = host;
  sc.identity = { backupKind: (t: string) => (/ncryptsec1/.test(t) ? 'ncryptsec' : /nsec1/.test(t) ? 'nsec' : null), registration: () => ({ stage: 'none', owed: 0 }), reserved: () => [], publishMode: 'rehearsal' } as never;
  u.register(sc);
  const show = (page: Parameters<IdentityScreen['go']>[0]) => {
    sc.go(page);
    u.open('identity');
    u.render(new PixelBuffer(960, 540), 1);
  };
  const message = () => (sc as unknown as { message: { key: string; good: boolean } | null }).message;
  return { u, sc, show, picked, message };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('recovery: native buttons for PASTE and the backup file', () => {
  it('restore and verify lay a real element over PASTE and over the file button, on their drawn buttons', () => {
    for (const page of ['restore', 'verify'] as const) {
      const { u, show } = setup(async () => ({ ok: false, reason: 'empty' }));
      show(page);
      const natives = u.natives.map((n) => [n.id, n.kind]);
      expect(natives).toEqual([
        ['identity.paste', 'press'],
        ['identity.file', 'file'],
      ]);
      for (const n of u.natives) {
        expect(n.w).toBeGreaterThan(20);
        expect(n.h).toBeGreaterThan(5);
        // The element sits exactly over the canvas button (whose hit still serves the keyboard and the mouse).
        expect((u as unknown as { hits: { x: number; y: number; w: number; h: number }[] }).hits.some((h) => h.x === n.x && h.y === n.y && h.w === n.w && h.h === n.h)).toBe(true);
      }
    }
  });

  it('pages without a backup to load have none', () => {
    const { u, show } = setup();
    for (const page of ['intro', 'choose', 'password', 'consent'] as const) {
      show(page);
      expect(u.natives).toEqual([]);
    }
  });

  it('PASTE reads the clipboard synchronously inside the tap, and the text goes to the field only', async () => {
    const read = vi.fn(async (): Promise<ClipboardRead> => ({ ok: true, text: KEY }));
    const { u, sc, show, message } = setup(read);
    show('restore');
    const paste = u.natives.find((n) => n.id === 'identity.paste')!;
    paste.run();
    // Before any await: the browser sees the read inside the player's activation.
    expect(read).toHaveBeenCalledTimes(1);
    await flush();
    expect(sc.loadedKind()).toBe('ncryptsec');
    u.render(new PixelBuffer(960, 540), 1.1);
    expect(u.fields.find((f) => f.spec.id === 'identity.backup')!.spec.value).toBe(KEY);
    expect(message()).toEqual({ key: 'identity.loaded', good: true });
  });

  it('a refused, unavailable or empty clipboard says how to paste by hand, and loads nothing', async () => {
    const cases: [((() => Promise<ClipboardRead>) | undefined), string][] = [
      [undefined, 'identity.paste.unavailable'],
      [async () => ({ ok: false, reason: 'unavailable' }), 'identity.paste.unavailable'],
      [async () => ({ ok: false, reason: 'denied' }), 'identity.paste.denied'],
      [async () => ({ ok: false, reason: 'empty' }), 'identity.paste.empty'],
    ];
    for (const [read, key] of cases) {
      const { u, sc, show, message } = setup(read);
      show('restore');
      u.natives.find((n) => n.id === 'identity.paste')!.run();
      await flush();
      expect(message()).toEqual({ key, good: false });
      expect(sc.loadedKind()).toBe(null);
    }
  });

  it('a clipboard answer arriving after the page changed is dropped', async () => {
    let answer: (r: ClipboardRead) => void = () => {};
    const { u, sc, show } = setup(() => new Promise((r) => (answer = r)));
    show('restore');
    u.natives.find((n) => n.id === 'identity.paste')!.run();
    sc.go('intro');
    answer({ ok: true, text: KEY });
    await flush();
    sc.go('restore');
    expect(sc.loadedKind()).toBe(null);
  });

  it('the chosen file loads like before; the keyboard (Enter) still opens the page chooser', () => {
    const { u, sc, show, picked } = setup();
    show('restore');
    const file = u.natives.find((n) => n.id === 'identity.file')!;
    file.onFileText!(`Blobbi backup\n\n${KEY}\n`);
    expect(sc.loadedKind()).toBe('ncryptsec');
    file.run();
    expect(picked).toEqual(['keys']);
  });

  it('the page wires the elements, reads the clipboard only from PASTE, and never hides the chooser with display:none', () => {
    const main = readFileSync(new URL('../src/playground/main.ts', import.meta.url), 'utf8');
    const natives = readFileSync(new URL('../src/playground/native-actions.ts', import.meta.url), 'utf8');
    expect(main).toMatch(/nativeActions\.sync\(/);
    expect(main.match(/clipboard\.readText\(/g)?.length).toBe(1);
    expect(main).not.toMatch(/filePicker\.style\.cssText = 'display:none'/);
    // The button's action runs in the click itself; nothing is logged.
    expect(natives).toMatch(/addEventListener\('click'[\s\S]*?\.run\(\)/);
    expect(natives + main.slice(main.indexOf('readClipboard'), main.indexOf('readClipboard') + 400)).not.toMatch(/console\./);
  });
});

describe('the keyboard lift', () => {
  it('centres the field in what the keyboard leaves visible (measured: installed app, iPhone held sideways)', () => {
    // 390 px page, keyboard up: 98 px visible; a 22 px field at 300 goes to 38 (centred: (98 - 22) / 2).
    const lift = keyboardLift({ top: 300, bottom: 322 }, { top: 0, bottom: 98 }, 390);
    expect(300 - lift).toBe(38);
    // Safari (668 → 468 visible): centred too.
    expect(500 - keyboardLift({ top: 500, bottom: 522 }, { top: 0, bottom: 468 }, 668)).toBe(223);
    // Not hardcoded: another keyboard, another field.
    expect(200 - keyboardLift({ top: 200, bottom: 230 }, { top: 0, bottom: 150 }, 390)).toBe(60);
  });

  it('keeps clear of the safe area at the top and counts from a page Safari already panned', () => {
    // A 20 px inset at the top: centred in 20..98.
    expect(300 - keyboardLift({ top: 300, bottom: 322 }, { top: 0, bottom: 98 }, 390, 20)).toBe(48);
    // Panned 100 px: the visible band is 100..198, centred there.
    expect(300 - keyboardLift({ top: 300, bottom: 322 }, { top: 100, bottom: 198 }, 390)).toBe(138);
  });

  it('keeps the field in view with less room than it needs (its top at the top of what shows)', () => {
    expect(300 - keyboardLift({ top: 300, bottom: 340 }, { top: 0, bottom: 30 }, 390)).toBe(0);
  });

  it('moves nothing without a keyboard when the field is in view, and never pushes a field down', () => {
    expect(keyboardLift({ top: 200, bottom: 222 }, { top: 0, bottom: 390 }, 390)).toBe(0);
    expect(keyboardLift({ top: 200, bottom: 222 }, { top: 0, bottom: 360 }, 390)).toBe(0);
    // A keyboard up, the field above the centre already: left where it is.
    expect(keyboardLift({ top: 10, bottom: 32 }, { top: 0, bottom: 98 }, 390)).toBe(0);
    // No keyboard reported but the field is covered anyway (a browser bar): centred.
    expect(keyboardLift({ top: 370, bottom: 392 }, { top: 0, bottom: 380 }, 390)).toBeGreaterThan(0);
  });

  it('reads the visual viewport when there is one, else the window', () => {
    expect(visibleBand({ innerHeight: 668, visualViewport: { offsetTop: 0, height: 468 } })).toEqual({ top: 0, bottom: 468 });
    expect(visibleBand({ innerHeight: 390, visualViewport: null })).toEqual({ top: 0, bottom: 390 });
  });

  it('is applied only on a touch screen, to the canvas, and undone when no field has the keyboard', () => {
    const main = readFileSync(new URL('../src/playground/main.ts', import.meta.url), 'utf8');
    expect(main).toMatch(/const focused = shown && touchNow && fieldFocus\.id/);
    expect(main).toMatch(/view\.style\.transform = lift \? `translateY\(\$\{-lift\}px\)` : ''/);
    // The lift is held while a press on the canvas is down (it must not slide away under the finger).
    expect(main).toMatch(/else if \(canvasPresses\.size\) lift = liftedBy;/);
    expect(main).toMatch(/keyboardLift\(field, visibleBand\(window\), window\.innerHeight, touch\.insets\.top \* k, touch\.insets\.bottom \* k\)/);
  });
});
