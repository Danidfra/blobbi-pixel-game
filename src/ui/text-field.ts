/**
 * TEXT FIELDS: what the player types (an island's name, a Blobbi's name, a password, a backup or key pasted back)
 * is edited by a real text input of the page, laid exactly over the field drawn on the canvas (see
 * `playground/text-inputs.ts`). A tap or a click on the field lands on that input, so the browser does what it
 * does best: focus, the phone's keyboard, the caret and selection, copy, cut, paste, undo, word jumps, accents and
 * input methods, password manners. The input itself is invisible; the canvas draws the field in the game's pixel
 * look from its state: the text (stars for a secret), the selection, a blinking caret where the input's caret is,
 * and a clear ring while it has the keyboard.
 *
 * Screens draw fields like buttons, every frame (`drawTextField`); the boxes come back with the hit regions
 * (`Gfx.fields`) and the page keeps one input per field on screen. A field that is no longer drawn loses its input
 * and the input's text with it, so a secret lives in the page only while its page shows it.
 *
 * Never logged: no value of a field goes to the console, an error message or anywhere but its screen.
 */
import { UI, type Gfx } from './gfx';
import { upper } from '../i18n';

/** 'text' (names), 'password' (a password: never shown, the browser's password manners), 'secret' (a key or a
 * backup pasted back: never shown, kept exactly as pasted, line breaks included). */
export type FieldKind = 'text' | 'password' | 'secret';

export interface TextFieldSpec {
  /** Unique on screen and stable from frame to frame ('naming.name', 'identity.password'...). */
  id: string;
  kind: FieldKind;
  /** The text now (the screen owns it; the page's input mirrors it). */
  value: string;
  maxLength: number;
  /** What the field is, for screen readers (the label beside it). */
  label: string;
  /** Shown, muted, while the field is empty and does not have the keyboard. */
  placeholder?: string;
  /** Drawn in capitals (the title's island name); the value keeps its case. */
  upper?: boolean;
  /** The browser's autocomplete hint ('off', 'new-password', 'current-password', 'nickname'...). */
  autocomplete?: string;
  autocapitalize?: 'none' | 'words' | 'sentences';
  /** The label of the phone keyboard's enter key. */
  enterKeyHint?: 'done' | 'next' | 'go';
  /** Take the keyboard when the field first shows (never on a touch screen: no keyboard pops up by itself). */
  autofocus?: boolean;
  /** Select the whole text when it takes the keyboard by itself (a suggested name: typing replaces it). */
  selectOnFocus?: boolean;
  /** Keep only what the field can hold (the title's island names keep to what its font can draw). */
  clean?: (value: string) => string;
  /** Every change, already cleaned and cut to `maxLength`. */
  onInput(value: string): void;
  /** Enter. */
  onEnter?(): void;
}

/** A field as drawn this frame: its box and text layout in the drawing's pixels (UI pixels in `Gfx.fields`, screen
 * pixels after `Gfx.screenFields`). `carets[i]` is where the caret before character i sits, from the box's left. */
export interface FieldBox {
  spec: TextFieldSpec;
  x: number;
  y: number;
  w: number;
  h: number;
  carets: number[];
}

/**
 * The keyboard's field and its caret: set by the page from its input (focus, selection), read by the drawing. A
 * test (or any host without inputs) may set it directly. `request` asks the page to give a field the keyboard.
 */
export const fieldFocus: {
  id: string | null;
  start: number;
  end: number;
  /** When the text or the caret last changed (seconds, the drawing's clock): the caret shows steadily for a moment. */
  changedAt: number;
  request: ((id: string) => void) | null;
} = { id: null, start: 0, end: 0, changedAt: 0, request: null };

/** How far each field's text is scrolled (UI pixels), so the caret stays in view in a long text. */
const scrolls = new Map<string, number>();

/** Stars for a secret (one a character), else the text (in capitals when the field says so). */
export function displayText(spec: Pick<TextFieldSpec, 'kind' | 'value' | 'upper'>): string {
  if (spec.kind !== 'text') return '*'.repeat(spec.value.length);
  return spec.upper ? upper(spec.value) : spec.value;
}

/** The caret's offset before each character of `text` (0 … its width), as `measure` draws it. */
export function caretOffsets(text: string, measure: (s: string) => number): number[] {
  const chars = [...text];
  const out = [0];
  // Stars are all alike: one width each (a pasted backup is thousands of them).
  if (chars.length > 1 && chars.every((c) => c === '*')) {
    const one = measure('**') - measure('*');
    for (let i = 1; i <= chars.length; i++) out.push(measure('*') + one * (i - 1));
    return out;
  }
  for (let i = 1; i <= chars.length; i++) out.push(measure(chars.slice(0, i).join('')));
  return out;
}

/** The caret index nearest a point `x` along the text (offsets from `caretOffsets`). */
export function caretIndexAt(offsets: readonly number[], x: number): number {
  let best = 0;
  for (let i = 1; i < offsets.length; i++) if (Math.abs(offsets[i] - x) < Math.abs(offsets[best] - x)) best = i;
  return best;
}

/** The word around index `i` (a double click selects it): letters, digits and the like, else the one character. */
export function wordAt(text: string, i: number): [number, number] {
  const word = /[\p{L}\p{N}_'-]/u;
  let a = Math.max(0, Math.min(i, text.length));
  let b = a;
  if (!word.test(text[a] ?? '') && a > 0 && word.test(text[a - 1])) a = b = a - 1;
  if (!word.test(text[a] ?? '')) return [a, Math.min(text.length, a + 1)];
  while (a > 0 && word.test(text[a - 1])) a--;
  while (b < text.length && word.test(text[b])) b++;
  return [a, b];
}

/** The scroll (UI pixels) that keeps the caret inside a box `inner` wide, moving as little as possible. */
export function scrollToShow(offsets: readonly number[], caret: number, inner: number, scroll: number): number {
  const at = offsets[Math.max(0, Math.min(caret, offsets.length - 1))] ?? 0;
  const end = offsets[offsets.length - 1] ?? 0;
  let s = scroll;
  if (at - s > inner - 1) s = at - inner + 1;
  if (at - s < 0) s = at;
  return Math.max(0, Math.min(s, Math.max(0, end - inner + 1)));
}

/** A secret shown in a one-line input: each line break becomes a space, so the two keep the same indices. */
export const oneLine = (s: string): string => s.replace(/[\r\n]/g, ' ');

/**
 * A secret is kept exactly (a pasted backup file keeps its line breaks), while its input holds it on one line. An
 * edit made in the input (typing, deleting, the browser's own paste) is found by comparing the input's text before
 * and after, and made to the exact text the same way, so line breaks outside the edit stay where they were.
 */
export function applyEdit(exact: string, before: string, after: string): string {
  let a = 0;
  while (a < before.length && a < after.length && before[a] === after[a]) a++;
  let b = 0;
  while (b < before.length - a && b < after.length - a && before[before.length - 1 - b] === after[after.length - 1 - b]) b++;
  return exact.slice(0, a) + after.slice(a, after.length - b) + exact.slice(before.length - b);
}

/** Pasted text into an exact secret at the input's selection (the same indices: see `oneLine`). */
export function pasteInto(exact: string, start: number, end: number, text: string, maxLength: number): { value: string; caret: number } {
  const value = (exact.slice(0, start) + text + exact.slice(end)).slice(0, maxLength);
  return { value, caret: Math.min(value.length, start + text.length) };
}

/** The page input's attributes for a field: a password type for secrets, no spelling help, the phone's hints. */
export function inputAttributes(spec: TextFieldSpec): Record<string, string> {
  const secret = spec.kind !== 'text';
  return {
    type: secret ? 'password' : 'text',
    autocomplete: spec.autocomplete ?? (secret ? 'off' : 'off'),
    autocapitalize: secret ? 'none' : (spec.autocapitalize ?? 'none'),
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: spec.enterKeyHint ?? 'done',
    'aria-label': spec.label,
    // A secret's exact text may be a pasted backup file (a few kilobytes); its input enforces nothing itself.
    maxlength: String(spec.kind === 'secret' ? 16_384 : spec.maxLength),
  };
}

/** The caret is drawn: steadily for half a second after any change, then blinking (steady with reduced motion). */
export function caretShown(now: number, changedAt: number, reducedMotion: boolean): boolean {
  if (reducedMotion) return true;
  const since = now - changedAt;
  return since < 0.5 || Math.floor((since - 0.5) / 0.53) % 2 === 1;
}

/**
 * Draw a field (a box with its text, and while it has the keyboard a ring, the selection and the caret), and leave
 * its box for the page's input. `textDy` places the text in the box (2 for an 11-pixel box). A press on the canvas
 * box (no input over it) asks for the keyboard too.
 */
export function drawTextField(g: Gfx, spec: TextFieldSpec, x: number, y: number, w: number, h: number, now: number, reducedMotion = false, textDy = 2): void {
  const focused = fieldFocus.id === spec.id;
  const hover = !focused && g.hovered(x, y, w, h);
  g.box(x, y, w, h, UI.bg, focused ? UI.accent : hover ? UI.muted : UI.line);
  // The ring: a second accent line just outside, so the field with the keyboard reads at a glance.
  if (focused) g.buf.strokeRect(x - 1, y - 1, w + 2, h + 2, UI.accent);
  const shown = displayText(spec);
  const offsets = caretOffsets(shown, (s) => g.measure(s));
  const pad = 3;
  const inner = w - pad * 2;
  const start = focused ? Math.min(fieldFocus.start, fieldFocus.end) : 0;
  const end = focused ? Math.max(fieldFocus.start, fieldFocus.end) : 0;
  const caret = focused ? fieldFocus.end : shown.length;
  const scroll = focused ? scrollToShow(offsets, caret, inner, scrolls.get(spec.id) ?? 0) : 0;
  scrolls.set(spec.id, scroll);
  const tx = x + pad;
  const ty = y + textDy;
  if (!shown && !focused && spec.placeholder) {
    const lines = g.lines(spec.placeholder, inner);
    g.text(lines.length > 1 ? `${lines[0]}…` : (lines[0] ?? ''), tx, ty, UI.line);
  }
  // The selection behind the text.
  if (focused && end > start) {
    const a = Math.max(0, offsets[start] - scroll);
    const b = Math.min(inner, offsets[Math.min(end, offsets.length - 1)] - scroll);
    if (b > a) g.buf.fillRect(tx + a, ty - 1, b - a, 7, UI.slotHi);
  }
  // Only the characters wholly inside the box (no clipping on the canvas).
  const chars = [...shown];
  let i0 = 0;
  while (i0 < chars.length && offsets[i0] < scroll) i0++;
  let i1 = i0;
  while (i1 < chars.length && offsets[i1 + 1] - scroll <= inner) i1++;
  if (i1 > i0) g.text(chars.slice(i0, i1).join(''), tx + offsets[i0] - scroll, ty, UI.ink);
  if (focused && end === start && caretShown(now, fieldFocus.changedAt, reducedMotion)) {
    const cx = Math.min(inner, Math.max(0, offsets[Math.min(caret, offsets.length - 1)] - scroll));
    g.buf.fillRect(tx + cx, ty - 1, 1, 7, UI.accent);
  }
  g.fields.push({ spec, x, y, w, h, carets: offsets.map((o) => pad + o - scroll) });
  g.hit(x, y, w, h, () => fieldFocus.request?.(spec.id));
}
