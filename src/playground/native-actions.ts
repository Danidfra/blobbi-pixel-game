/**
 * THE PAGE'S NATIVE BUTTONS (P1.2A, see `NativeBox` in `ui/gfx.ts`): one real, transparent element of the page over
 * each such button the canvas drew this frame, the same size, in the same place, like the text inputs
 * (`text-inputs.ts`). A tap or a click on the button lands on the element, so what the browser grants only inside
 * the player's own activation works on every phone: the canvas acts on pointerdown, which on a touch screen is no
 * user activation, and iOS then ignores a file chooser or a clipboard read.
 *
 *  - 'press': a `<button>` whose click runs the button's action at once.
 *  - 'file': an `<input type="file">` the tap opens directly (the most widely supported way on iOS, the installed
 *    app included); the chosen file goes to `readFile`, then its text to the button.
 * The elements are out of the keyboard's order (the game's own selection and Enter still run the action), and an
 * element goes the moment its button is no longer drawn. Nothing here reads, keeps or logs a file's text.
 */
import type { NativeBox } from '../ui/gfx';

const CSS = `
.blobbi-native{position:fixed;margin:0;padding:0;border:0;border-radius:0;outline:none;box-shadow:none;background:transparent;
color:transparent;opacity:0;z-index:20;box-sizing:border-box;appearance:none;-webkit-appearance:none;cursor:pointer;
touch-action:manipulation;-webkit-tap-highlight-color:transparent;font-size:16px;overflow:hidden}
`;

export class NativeActions {
  private readonly els = new Map<string, HTMLElement>();
  private readonly boxes = new Map<string, NativeBox>();

  /**
   * @param canvas the game's canvas (the boxes are in its pixels)
   * @param readFile reads a chosen file's text (the page's limits apply) and hands it on
   */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly readFile: (file: File, done: (text: string) => void) => void,
  ) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
  }

  /** Lay one element over each native button drawn this frame (none: all of them go). */
  sync(boxes: readonly NativeBox[]): void {
    const ids = new Set(boxes.map((b) => b.id));
    for (const [id, el] of this.els) if (!ids.has(id)) this.drop(id, el);
    if (!boxes.length) return;
    const rect = this.canvas.getBoundingClientRect();
    const k = rect.width / Math.max(1, this.canvas.width);
    for (const b of boxes) {
      this.boxes.set(b.id, b);
      let el = this.els.get(b.id);
      if (el && el.dataset.kind !== b.kind) {
        this.drop(b.id, el);
        el = undefined;
      }
      el ??= this.make(b);
      if (el.getAttribute('aria-label') !== b.label) el.setAttribute('aria-label', b.label);
      const place = `${rect.left + b.x * k}|${rect.top + b.y * k}|${b.w * k}|${b.h * k}`;
      if (el.dataset.place !== place) {
        el.dataset.place = place;
        Object.assign(el.style, { left: `${rect.left + b.x * k}px`, top: `${rect.top + b.y * k}px`, width: `${b.w * k}px`, height: `${b.h * k}px` });
      }
    }
  }

  private make(b: NativeBox): HTMLElement {
    const id = b.id;
    let el: HTMLElement;
    if (b.kind === 'file') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,text/plain';
      input.addEventListener('change', () => {
        const f = input.files?.[0];
        input.value = '';
        const box = this.boxes.get(id);
        if (f && box?.onFileText) this.readFile(f, (text) => this.boxes.get(id)?.onFileText?.(text));
      });
      el = input;
    } else {
      const button = document.createElement('button');
      button.type = 'button';
      button.addEventListener('click', (e) => {
        e.preventDefault();
        this.boxes.get(id)?.run();
      });
      el = button;
    }
    el.className = 'blobbi-native';
    el.dataset.native = id;
    el.dataset.kind = b.kind;
    el.tabIndex = -1;
    document.body.append(el);
    this.els.set(id, el);
    return el;
  }

  private drop(id: string, el: HTMLElement): void {
    if (el instanceof HTMLInputElement) el.value = '';
    el.remove();
    this.els.delete(id);
    this.boxes.delete(id);
  }
}
