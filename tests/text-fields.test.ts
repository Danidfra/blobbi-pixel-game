/**
 * Text fields: typed straight into (a click or a tap on the field; no button first), a clear ring and a blinking
 * caret while a field has the keyboard, editing and selection kept from the page's input, secrets drawn as stars,
 * kept exactly as pasted and never written anywhere else, and the game's keys never moving the Blobbi while typing.
 * The page's inputs themselves (playground/text-inputs.ts) are checked in a browser: scripts/text-input-browser.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Gfx, UI } from '../src/ui/gfx';
import { GameUI } from '../src/ui/game-ui';
import { PixelBuffer } from '../src/core/pixel';
import { paletteFor } from '../src/world/generate';
import { LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { NamingScreen } from '../src/ui/screens/naming';
import { IdentityScreen } from '../src/ui/screens/identity';
import { isTypingTarget } from '../src/ui/hotbar';
import {
  applyEdit,
  caretIndexAt,
  caretOffsets,
  caretShown,
  displayText,
  drawTextField,
  fieldFocus,
  inputAttributes,
  oneLine,
  pasteInto,
  scrollToShow,
  wordAt,
  type TextFieldSpec,
} from '../src/ui/text-field';

const spec = (over: Partial<TextFieldSpec> = {}): TextFieldSpec => ({ id: 'test.field', kind: 'text', value: 'Moon', maxLength: 24, label: 'Name', onInput: () => {}, ...over });

afterEach(() => {
  fieldFocus.id = null;
  fieldFocus.start = fieldFocus.end = 0;
  fieldFocus.changedAt = 0;
  fieldFocus.request = null;
  vi.restoreAllMocks();
});

describe('the field model', () => {
  it('places the caret between characters as the game draws them, and finds the index under a point', () => {
    const g = new Gfx(100, 20, 2);
    const offsets = caretOffsets('Moon', (s) => g.measure(s));
    expect(offsets).toHaveLength(5);
    expect(offsets[0]).toBe(0);
    for (let i = 1; i < offsets.length; i++) expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
    expect(offsets[4]).toBe(g.measure('Moon'));
    expect(caretIndexAt(offsets, -5)).toBe(0);
    expect(caretIndexAt(offsets, offsets[2] + 0.4)).toBe(2);
    expect(caretIndexAt(offsets, 999)).toBe(4);
    // Stars (a secret) measure alike, however many.
    const stars = caretOffsets('*'.repeat(500), (s) => g.measure(s));
    expect(stars[500]).toBe(g.measure('*'.repeat(500)));
  });

  it('selects a word on a double click', () => {
    expect(wordAt('Isle of Moon', 9)).toEqual([8, 12]);
    expect(wordAt('Isle of Moon', 4)).toEqual([0, 4]); // right after a word: that word
    expect(wordAt('Isle  of', 5)).toEqual([5, 6]); // between words: the one character
    expect(wordAt('', 0)).toEqual([0, 0]);
  });

  it('scrolls a long text so the caret stays in the box', () => {
    const offsets = Array.from({ length: 41 }, (_, i) => i * 4);
    expect(scrollToShow(offsets, 0, 60, 0)).toBe(0);
    expect(scrollToShow(offsets, 40, 60, 0)).toBe(160 - 59);
    expect(scrollToShow(offsets, 5, 60, 101)).toBe(20);
    expect(scrollToShow(offsets.slice(0, 5), 4, 60, 30)).toBe(0); // a short text never scrolls
  });

  it('shows secrets as stars, a name as written (capitals on the title)', () => {
    expect(displayText({ kind: 'password', value: 'hunter22' })).toBe('********');
    expect(displayText({ kind: 'secret', value: 'nsec1abc\nmore' })).toBe('*************');
    expect(displayText({ kind: 'text', value: 'Moon', upper: true })).toBe('MOON');
    expect(displayText({ kind: 'text', value: 'Moon' })).toBe('Moon');
  });

  it('keeps a pasted backup exactly, line breaks included, though its input is one line', () => {
    const file = 'Your Blobbi\n\nnsec1qqq\n\n#blobbi {"pubkey":"x"}\n';
    expect(oneLine(file)).toHaveLength(file.length);
    expect(oneLine(file)).not.toMatch(/[\r\n]/);
    const pasted = pasteInto('', 0, 0, file, 16_384);
    expect(pasted).toEqual({ value: file, caret: file.length });
    // Typing or deleting in the input changes the exact text the same way; the other line breaks stay.
    const shown = oneLine(pasted.value);
    expect(applyEdit(pasted.value, shown, shown + 'x')).toBe(file + 'x');
    expect(applyEdit(pasted.value, shown, shown.slice(1))).toBe(file.slice(1));
    const at = shown.indexOf('nsec1');
    expect(applyEdit(pasted.value, shown, shown.slice(0, at) + shown.slice(at + 5))).toBe(file.replace('nsec1', ''));
    // A paste over a selection replaces it; too long is cut.
    expect(pasteInto('abcdef', 1, 3, 'XY', 100)).toEqual({ value: 'aXYdef', caret: 3 });
    expect(pasteInto('abc', 3, 3, 'defgh', 5).value).toBe('abcde');
  });

  it('gives secrets password inputs with no spelling help, and names the phone hints they need', () => {
    for (const kind of ['password', 'secret'] as const) {
      const a = inputAttributes(spec({ kind, label: 'Password' }));
      expect(a.type).toBe('password');
      expect(a.autocapitalize).toBe('none');
      expect(a.autocorrect).toBe('off');
      expect(a.spellcheck).toBe('false');
    }
    expect(inputAttributes(spec({ kind: 'password', autocomplete: 'new-password' })).autocomplete).toBe('new-password');
    expect(inputAttributes(spec({ kind: 'secret' })).autocomplete).toBe('off');
    expect(inputAttributes(spec({ kind: 'secret', maxLength: 16_384 })).maxlength).toBe('16384');
    const name = inputAttributes(spec({ autocapitalize: 'words', enterKeyHint: 'go' }));
    expect(name).toMatchObject({ type: 'text', autocapitalize: 'words', enterkeyhint: 'go', 'aria-label': 'Name', maxlength: '24' });
  });

  it('shows the caret steadily after a change, then blinks; steadily with reduced motion', () => {
    expect(caretShown(10.2, 10, false)).toBe(true);
    const seen = new Set<boolean>();
    for (let t = 10.5; t < 13; t += 0.1) seen.add(caretShown(t, 10, false));
    expect(seen).toEqual(new Set([true, false]));
    for (let t = 10; t < 13; t += 0.1) expect(caretShown(t, 10, true)).toBe(true);
  });
});

describe('drawing a field', () => {
  /** Accent pixels in a rectangle (screen pixels of a scale-1 drawing). */
  const count = (g: Gfx, x: number, y: number, w: number, h: number, c: number) => {
    let n = 0;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g.out.get(i, j) === c) n++;
    return n;
  };

  it('a ring and a caret where the input has it while it has the keyboard; neither without', () => {
    const idle = new Gfx(120, 30, 1);
    drawTextField(idle, spec(), 10, 10, 80, 11, 0);
    // No ring outside the box, no caret.
    expect(count(idle, 9, 9, 82, 1, UI.accent)).toBe(0);
    expect(count(idle, 11, 11, 78, 9, UI.accent)).toBe(0);
    fieldFocus.id = 'test.field';
    fieldFocus.start = fieldFocus.end = 2;
    fieldFocus.changedAt = 0;
    const g = new Gfx(120, 30, 1);
    drawTextField(g, spec(), 10, 10, 80, 11, 0.1);
    expect(count(g, 9, 9, 82, 1, UI.accent)).toBe(82); // the ring's top line, just outside the box
    expect(count(g, 10, 10, 80, 1, UI.accent)).toBe(80); // and the box's own border
    const caretX = 10 + 3 + g.measure('Mo');
    expect(count(g, caretX, 11, 1, 7, UI.accent)).toBe(7);
    // Its box comes back for the page, with the caret offsets from the box's left.
    expect(g.fields).toHaveLength(1);
    expect(g.fields[0]).toMatchObject({ x: 10, y: 10, w: 80, h: 11 });
    expect(g.fields[0].carets[2]).toBe(3 + g.measure('Mo'));
    // In screen pixels at scale 3, the same box three times as large.
    const big = new Gfx(120, 30, 3);
    drawTextField(big, spec(), 10, 10, 80, 11, 0.1);
    const [box] = big.screenFields(5, 7);
    expect(box).toMatchObject({ x: 35, y: 37, w: 240, h: 33 });
    expect(box.carets[2]).toBe((3 + big.measure('Mo')) * 3);
  });

  it('a selection behind the text instead of a caret', () => {
    fieldFocus.id = 'test.field';
    fieldFocus.start = 1;
    fieldFocus.end = 3;
    const g = new Gfx(120, 30, 1);
    drawTextField(g, spec(), 10, 10, 80, 11, 0.1);
    expect(count(g, 13, 11, 78, 7, UI.slotHi)).toBeGreaterThan(0);
  });

  it('a press on the drawn box asks for the keyboard (where no input lies over it)', () => {
    const asked: string[] = [];
    fieldFocus.request = (id) => asked.push(id);
    const g = new Gfx(120, 30, 1);
    drawTextField(g, spec(), 10, 10, 80, 11, 0);
    g.hits.find((h) => h.x === 10 && h.y === 10)!.action(0, 0);
    expect(asked).toEqual(['test.field']);
  });

  it('never draws a secret: only stars, and the placeholder while empty', () => {
    const drawn: string[] = [];
    const text = Gfx.prototype.text;
    vi.spyOn(Gfx.prototype, 'text').mockImplementation(function (this: Gfx, s, ...rest) {
      drawn.push(s);
      return text.call(this, s, ...rest);
    });
    const secret = 'nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5';
    for (const kind of ['password', 'secret'] as const) {
      fieldFocus.id = 'test.field';
      fieldFocus.start = fieldFocus.end = 5;
      drawTextField(new Gfx(200, 30, 2), spec({ kind, value: secret, maxLength: 16_384 }), 4, 4, 120, 11, 1);
    }
    expect(drawn.length).toBeGreaterThan(0);
    for (const s of drawn) expect(s).toMatch(/^\**$/);
    fieldFocus.id = null;
    drawTextField(new Gfx(200, 30, 2), spec({ kind: 'secret', value: '', placeholder: 'Paste the backup text' }), 4, 4, 120, 11, 1);
    expect(drawn.at(-1)).toMatch(/^Paste/);
  });
});

describe('screens type in their fields directly', () => {
  const ui = () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    return new GameUI(() => live, () => paletteFor('cozy'));
  };

  it('naming: the name is a field (no TYPE A NAME button), selected to be replaced, Enter keeps it', () => {
    const u = ui();
    const sc = new NamingScreen();
    const chosen: string[] = [];
    sc.host = { subject: () => ({ d: 'd1', name: 'Pip' }), choose: (_d, n) => (chosen.push(n), true), later: () => {}, celebrate: () => {} };
    u.register(sc);
    sc.start();
    u.open('naming');
    const labels: string[] = [];
    const button = Gfx.prototype.button;
    vi.spyOn(Gfx.prototype, 'button').mockImplementation(function (this: Gfx, label, ...rest) {
      labels.push(label);
      return button.call(this, label, ...rest);
    });
    u.render(new PixelBuffer(960, 540), 1);
    expect(labels.map((l) => l.toLowerCase())).not.toContain('type a name');
    const [f] = u.fields;
    expect(f.spec).toMatchObject({ id: 'naming.name', kind: 'text', value: 'Pip', autofocus: true, selectOnFocus: true });
    f.spec.onInput('Momo');
    f.spec.onEnter!();
    expect(chosen).toEqual(['Momo']);
  });

  it('account: name, two new passwords, and a backup that is pasted or typed (stars), its password when it needs one', async () => {
    const u = ui();
    const sc = new IdentityScreen();
    sc.host = { pickFile: () => {}, download: () => {}, copy: async () => false, walking: () => ({ reserved: null, legacyLocal: false }), bring: () => {} };
    sc.identity = { backupKind: (t: string) => (/ncryptsec1/.test(t) ? 'ncryptsec' : /nsec1/.test(t) ? 'nsec' : null), registration: () => ({ stage: 'none', owed: 0 }), reserved: () => [], publishMode: 'rehearsal' } as never;
    u.register(sc);
    const asked: string[] = [];
    fieldFocus.request = (id) => asked.push(id);
    const fieldsOn = (page: Parameters<IdentityScreen['go']>[0]) => {
      sc.go(page);
      u.open('identity');
      u.render(new PixelBuffer(960, 540), 1);
      return u.fields.map((f) => f.spec);
    };
    expect(fieldsOn('name').map((s) => [s.id, s.kind])).toEqual([['identity.name', 'text']]);
    const pw = fieldsOn('password');
    expect(pw.map((s) => [s.id, s.kind, s.autocomplete])).toEqual([
      ['identity.password', 'password', 'new-password'],
      ['identity.password2', 'password', 'new-password'],
    ]);
    // Enter in the first password moves on to the second.
    pw[0].onEnter!();
    expect(asked).toEqual(['identity.password2']);
    // Shift+Tab from the buttons goes back up into the last field.
    u.handleKey('Tab', true);
    expect(asked.at(-1)).toBe('identity.password2');
    // The backup: one secret field; a Recovery Key needs no password, a Protected Key adds its password field.
    let restore = fieldsOn('restore');
    expect(restore.map((s) => [s.id, s.kind])).toEqual([['identity.backup', 'secret']]);
    const file = 'Blobbi backup\n\nncryptsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\n\n#meta {"a":1}\n';
    restore[0].onInput(file);
    u.render(new PixelBuffer(960, 540), 1.1);
    restore = u.fields.map((f) => f.spec);
    expect(restore.map((s) => s.id)).toEqual(['identity.backup', 'identity.backupPassword']);
    expect(restore[0].value).toBe(file); // exactly as pasted
    expect(restore[1]).toMatchObject({ kind: 'password', autocomplete: 'current-password' });
    // No "corrupt" warning while a key is still being typed.
    restore[0].onInput('nsec1abc');
    u.render(new PixelBuffer(960, 540), 1.2);
    expect(u.message).toBe(null);
    // Leaving the page clears every secret from the screen (and so from the page's inputs).
    sc.go('intro');
    expect(sc.fields.password).toBe('');
    expect(sc.loadedKind()).toBe(null);
  });
});

describe('typing never moves the Blobbi', () => {
  it('the game listens for its keys on the canvas only; a focused input is a typing target', () => {
    const main = readFileSync(new URL('../src/playground/main.ts', import.meta.url), 'utf8');
    expect(main).toMatch(/view\.addEventListener\('keydown'/);
    // Window-wide key listeners: only the one that unlocks audio (it never reads the key).
    const windowKeys = [...main.matchAll(/(window|document)\.addEventListener\('key(down|up)'[^\n]*/g)].map((m) => m[0]);
    expect(windowKeys).toEqual(["window.addEventListener('keydown', unlockAudio, { capture: true });"]);
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
  });

  it('no field value is ever written to the console', () => {
    for (const file of ['../src/ui/text-field.ts', '../src/playground/text-inputs.ts', '../src/ui/screens/identity.ts', '../src/ui/screens/naming.ts']) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(src, file).not.toMatch(/console\.|alert\(|localStorage|sessionStorage/);
    }
  });
});
