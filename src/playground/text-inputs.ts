/**
 * THE PAGE'S TEXT INPUTS (see `ui/text-field.ts`): one real input of the page over each text field the canvas drew
 * this frame, the same size, in the same place. A tap or a click on a field lands on its input, so the phone's
 * keyboard opens as for any web form, and everything a text input does is the browser's own: the caret and the
 * selection, copy, cut, paste (a long press on a phone), undo, word jumps, accents and input methods, password
 * fields that are never copied out nor learnt by a keyboard. The input is transparent: the canvas draws the field
 * from `fieldFocus` (the caret, the selection, the ring), in the game's look.
 *
 * What it adds to the browser's own:
 *  - a click places the caret where it falls among the characters as the canvas draws them (and a drag selects,
 *    a double click selects a word, a triple click everything), since the page's font is not the game's;
 *  - Enter does the field's job, Tab and Shift+Tab move between fields (and back to the game past the last), Escape
 *    and the up and down arrows give the keys back to the game's menu;
 *  - a secret (a key or a backup pasted back) keeps exactly what was pasted, line breaks included, though its
 *    input is one line;
 *  - a field's input and its text are gone the moment the field is no longer drawn.
 * Keys typed in an input never reach the game: the game listens on the canvas only. Nothing here logs a value.
 */
import { applyEdit, caretIndexAt, fieldFocus, inputAttributes, oneLine, pasteInto, wordAt, type FieldBox } from '../ui/text-field';

// (A doubled class: above the page's own input[type='text'] rule, which paints a background and sets a smaller font.)
const CSS = `
input.blobbi-field.blobbi-field{position:fixed;margin:0;padding:0;border:0;border-radius:0;outline:none;box-shadow:none;background:transparent;
color:transparent;-webkit-text-fill-color:transparent;caret-color:transparent;font:16px/1 ui-monospace,Menlo,Consolas,monospace;
z-index:20;box-sizing:border-box;appearance:none;-webkit-appearance:none;cursor:text;-webkit-tap-highlight-color:transparent}
input.blobbi-field.blobbi-field::selection{background:transparent;color:transparent}
input.blobbi-field::-ms-reveal,input.blobbi-field::-ms-clear{display:none}
`;

export class TextInputs {
  private readonly inputs = new Map<string, HTMLInputElement>();
  private readonly boxes = new Map<string, FieldBox>();
  /** Each field's exact text as last known (a secret's input holds it on one line). */
  private readonly values = new Map<string, string>();
  /** Fields already shown (each takes the keyboard by itself at most once while it stays on screen). */
  private readonly seen = new Set<string>();
  private order: string[] = [];
  private drag: { id: string; anchor: number } | null = null;
  private touchDown: { id: string; at: number; x: number; y: number } | null = null;

  /**
   * @param canvas the game's canvas (the fields' boxes are in its pixels; the keys go back to it)
   * @param now the drawing's clock in seconds (the caret shows steadily for a moment after a change)
   * @param arrow the up or down arrow pressed in a field: the field has given the keys back to the game
   */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly now: () => number,
    private readonly arrow: (box: FieldBox, code: string) => void,
  ) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    fieldFocus.request = (id) => this.focus(id, false);
    document.addEventListener('selectionchange', () => this.readSelection());
    window.addEventListener('mousemove', (e) => {
      const d = this.drag;
      const el = d && this.inputs.get(d.id);
      if (!d || !el) return;
      const i = this.indexAt(d.id, e.clientX);
      el.setSelectionRange(Math.min(d.anchor, i), Math.max(d.anchor, i), i < d.anchor ? 'backward' : 'forward');
      this.readSelection();
    });
    window.addEventListener('mouseup', () => (this.drag = null));
  }

  /** The field that has the keyboard, if any. */
  get focused(): string | null {
    const el = document.activeElement;
    for (const [id, input] of this.inputs) if (input === el) return id;
    return null;
  }

  /**
   * Lay one input over each field drawn this frame (none: all of them go, with their text). `touch`: a touch
   * screen, where no field takes the keyboard by itself (that would pop the keyboard up unasked).
   */
  sync(fields: readonly FieldBox[], touch: boolean): void {
    const ids = new Set(fields.map((f) => f.spec.id));
    for (const [id, el] of this.inputs) if (!ids.has(id)) this.drop(id, el);
    for (const id of this.seen) if (!ids.has(id)) this.seen.delete(id);
    this.order = fields.map((f) => f.spec.id);
    if (!fields.length) return;
    const rect = this.canvas.getBoundingClientRect();
    const k = rect.width / Math.max(1, this.canvas.width);
    for (const f of fields) {
      const id = f.spec.id;
      this.boxes.set(id, f);
      const el = this.inputs.get(id) ?? this.make(id);
      for (const [name, v] of Object.entries(inputAttributes(f.spec))) if (el.getAttribute(name) !== v) el.setAttribute(name, v);
      // The page's text starts where the canvas draws it, about as wide a character (for a phone's own handles).
      const n = Math.max(1, f.carets.length - 1);
      const advance = f.carets.length > 1 ? ((f.carets[n] - f.carets[0]) / n) * k : 8;
      const place = `${rect.left + f.x * k}|${rect.top + f.y * k}|${f.w * k}|${f.h * k}|${(f.carets[0] ?? 0) * k}|${advance}`;
      if (el.dataset.place !== place) {
        el.dataset.place = place;
        Object.assign(el.style, { left: `${rect.left + f.x * k}px`, top: `${rect.top + f.y * k}px`, width: `${f.w * k}px`, height: `${f.h * k}px`, lineHeight: `${f.h * k}px`, paddingLeft: `${Math.max(0, (f.carets[0] ?? 0) * k)}px`, letterSpacing: `${(advance - 9.6).toFixed(2)}px` });
      }
      // The input holds what the screen holds (the screen may change it: a file loaded, a page cleared).
      if (this.values.get(id) !== f.spec.value) {
        this.values.set(id, f.spec.value);
        this.setValue(el, f.spec.kind === 'secret' ? oneLine(f.spec.value) : f.spec.value);
      }
    }
    // A field shown for the first time may take the keyboard (only from the game, never from another field).
    const free = document.activeElement === this.canvas || document.activeElement === document.body || !document.activeElement;
    for (const f of fields) {
      if (this.seen.has(f.spec.id)) continue;
      this.seen.add(f.spec.id);
      if (f.spec.autofocus && !touch && free && !this.focused) this.focus(f.spec.id, !!f.spec.selectOnFocus);
    }
  }

  /** Give a field the keyboard: the whole text selected, or the caret at its end. */
  focus(id: string, select: boolean): void {
    const el = this.inputs.get(id);
    if (!el) return;
    el.focus({ preventScroll: true });
    if (select) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
    this.readSelection(true);
  }

  private make(id: string): HTMLInputElement {
    const el = document.createElement('input');
    el.className = 'blobbi-field';
    el.dataset.field = id;
    el.addEventListener('focus', () => this.readSelection(true));
    el.addEventListener('blur', () => {
      if (fieldFocus.id === id) fieldFocus.id = null;
    });
    el.addEventListener('input', () => this.edited(id, el));
    el.addEventListener('paste', (e) => this.pasted(id, el, e));
    el.addEventListener('keydown', (e) => this.key(id, e));
    el.addEventListener('keyup', () => this.readSelection());
    el.addEventListener('mousedown', (e) => this.mouseDown(id, el, e));
    // A short tap on a phone: the keyboard opens as usual, then the caret goes where the tap fell among the
    // characters as drawn (a long press is left alone: it brings the phone's own paste and selection).
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') this.touchDown = { id, at: performance.now(), x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerup', (e) => {
      const t = this.touchDown;
      this.touchDown = null;
      if (!t || t.id !== id || e.pointerType === 'mouse' || performance.now() - t.at > 350 || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) return;
      requestAnimationFrame(() => {
        if (document.activeElement !== el) return;
        const i = this.indexAt(id, e.clientX);
        el.setSelectionRange(i, i);
        this.readSelection(true);
      });
    });
    document.body.append(el);
    this.inputs.set(id, el);
    return el;
  }

  /** A field no longer drawn: its input goes, its text with it; the keys go back to the game if it had them. */
  private drop(id: string, el: HTMLInputElement): void {
    const had = document.activeElement === el;
    el.value = '';
    el.remove();
    this.inputs.delete(id);
    this.boxes.delete(id);
    this.values.delete(id);
    if (fieldFocus.id === id) fieldFocus.id = null;
    if (this.drag?.id === id) this.drag = null;
    if (had) this.canvas.focus({ preventScroll: true });
  }

  private setValue(el: HTMLInputElement, v: string): void {
    if (el.value === v) return;
    if (document.activeElement !== el) {
      el.value = v;
      return;
    }
    const a = el.selectionStart ?? v.length;
    const b = el.selectionEnd ?? v.length;
    el.value = v;
    el.setSelectionRange(Math.min(a, v.length), Math.min(b, v.length));
  }

  /** The input changed (typing, deleting, the browser's own paste or undo): the screen hears the new text. */
  private edited(id: string, el: HTMLInputElement): void {
    const box = this.boxes.get(id);
    if (!box) return;
    const spec = box.spec;
    const before = this.values.get(id) ?? '';
    let value: string;
    if (spec.kind === 'secret') value = applyEdit(before, oneLine(before), el.value).slice(0, spec.maxLength);
    else {
      value = (spec.clean ? spec.clean(el.value) : el.value).slice(0, spec.maxLength);
      if (value !== el.value) {
        // Cleaned (a character the field cannot hold): the caret stays after what was typed.
        const caret = Math.max(0, Math.min(value.length, (el.selectionEnd ?? el.value.length) - (el.value.length - value.length)));
        el.value = value;
        el.setSelectionRange(caret, caret);
      }
    }
    this.values.set(id, value);
    spec.onInput(value);
    this.readSelection(true);
  }

  /** A paste into a secret keeps the pasted text exactly (a backup file's lines); other fields paste as usual. */
  private pasted(id: string, el: HTMLInputElement, e: ClipboardEvent): void {
    const box = this.boxes.get(id);
    if (!box || box.spec.kind !== 'secret') return;
    const text = e.clipboardData?.getData('text/plain');
    if (text === undefined) return;
    e.preventDefault();
    const at = pasteInto(this.values.get(id) ?? '', el.selectionStart ?? 0, el.selectionEnd ?? 0, text, box.spec.maxLength);
    this.values.set(id, at.value);
    el.value = oneLine(at.value);
    el.setSelectionRange(at.caret, at.caret);
    box.spec.onInput(at.value);
    this.readSelection(true);
  }

  private key(id: string, e: KeyboardEvent): void {
    const box = this.boxes.get(id);
    if (!box || e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      box.spec.onEnter?.();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.canvas.focus({ preventScroll: true });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const next = this.order[this.order.indexOf(id) + (e.shiftKey ? -1 : 1)];
      if (next) this.focus(next, true);
      else this.canvas.focus({ preventScroll: true });
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) {
      e.preventDefault();
      this.canvas.focus({ preventScroll: true });
      this.arrow(box, e.code);
    } else requestAnimationFrame(() => this.readSelection());
  }

  /** A mouse press: the caret where it falls among the characters as drawn; double: a word; triple: everything. */
  private mouseDown(id: string, el: HTMLInputElement, e: MouseEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    el.focus({ preventScroll: true });
    const i = this.indexAt(id, e.clientX);
    const secret = this.boxes.get(id)?.spec.kind !== 'text';
    if (e.detail >= 3 || (e.detail === 2 && secret)) el.select();
    else if (e.detail === 2) el.setSelectionRange(...wordAt(el.value, i));
    else if (e.shiftKey) {
      const anchor = el.selectionDirection === 'backward' ? (el.selectionEnd ?? i) : (el.selectionStart ?? i);
      el.setSelectionRange(Math.min(anchor, i), Math.max(anchor, i), i < anchor ? 'backward' : 'forward');
      this.drag = { id, anchor };
    } else {
      el.setSelectionRange(i, i);
      this.drag = { id, anchor: i };
    }
    this.readSelection(true);
  }

  /** The caret index under a client x, among the characters as the canvas drew them. */
  private indexAt(id: string, clientX: number): number {
    const box = this.boxes.get(id);
    if (!box) return 0;
    const rect = this.canvas.getBoundingClientRect();
    const k = rect.width / Math.max(1, this.canvas.width);
    return caretIndexAt(box.carets, (clientX - rect.left) / k - box.x);
  }

  /** The field with the keyboard and its selection, for the drawing (the caret is where the selection's end is). */
  private readSelection(changed = false): void {
    const id = this.focused;
    if (!id) return;
    const el = this.inputs.get(id)!;
    const a = el.selectionStart ?? 0;
    const b = el.selectionEnd ?? a;
    const backward = el.selectionDirection === 'backward';
    const start = backward ? b : a;
    const end = backward ? a : b;
    if (changed || fieldFocus.id !== id || fieldFocus.start !== start || fieldFocus.end !== end) fieldFocus.changedAt = this.now();
    fieldFocus.id = id;
    fieldFocus.start = start;
    fieldFocus.end = end;
  }
}
