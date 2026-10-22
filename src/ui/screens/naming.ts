/**
 * M11D.5, NAMING A NEW BLOBBI: right after a Blobbi hatches, the game's first little quest asks "What should we call
 * our new friend?". The Blobbi stands big beside the question, looking at the player; the player types a name and
 * confirms it, and the Blobbi hops for joy. No account, no identity, nothing published: the name is kept on this
 * device with the Blobbi's public record (and travels in its backups). Its owner, its d tag and so its look never
 * change with a name.
 *
 *   ask     the question, the name in a text field (the suggested one at first, selected so typing replaces it; a
 *           click or a tap on the field types there), THAT'S THE NAME! (or Enter in the field), LATER
 *   happy   "<name>!": the Blobbi celebrates; LET'S PLAY
 *
 * LATER keeps the suggested name and says where to choose one any time (SETTINGS > ACCOUNT); the question comes back
 * once in a later session, never twice in one, and never for a Blobbi whose name was already chosen.
 */
import { Gfx, UI } from '../gfx';
import { isConfirm, type GameUI, type Screen } from '../game-ui';
import { t, upper, type MessageKey } from '../../i18n';
import { drawPortrait, drawTwinkles } from '../portrait';
import { drawTextField, type TextFieldSpec } from '../text-field';

/** What the host (the playground) does for the naming screen. */
export interface NamingHost {
  /** The Blobbi being named: its d and its name now; null when there is none to name. */
  subject(): { d: string; name: string } | null;
  /** Keep the chosen name (cleaned). False when it could not be kept (empty, or the Blobbi is registered). */
  choose(d: string, name: string): boolean;
  /** The player said "later". */
  later(d: string): void;
  /** The chosen name was kept: the Blobbi in the world reacts (a happy hop, a sound). */
  celebrate(): void;
}

export class NamingScreen implements Screen {
  readonly id = 'naming' as const;
  page: 'ask' | 'happy' = 'ask';
  host: NamingHost | null = null;
  /** The name being typed. */
  name = '';
  index = 0;
  private message: MessageKey | null = null;

  title(): string {
    return t('naming.title');
  }

  /** Open on the question for the Blobbi the host names. */
  start(): void {
    this.page = 'ask';
    this.name = this.host?.subject()?.name ?? '';
    this.message = null;
    this.index = 0;
  }

  opened(): void {
    this.index = 0;
  }

  setName(value: string): void {
    this.name = value.slice(0, 24);
    this.message = null;
  }

  private actions(ui: GameUI): { label: string; run: () => void; primary?: boolean }[] {
    const subject = this.host?.subject() ?? null;
    if (this.page === 'happy') return [{ label: t('naming.play'), primary: true, run: () => ui.close() }];
    return [
      {
        label: t('naming.confirm'),
        primary: true,
        run: () => {
          if (!subject || !this.name.trim()) return void (this.message = 'naming.empty');
          if (!this.host?.choose(subject.d, this.name)) return void (this.message = 'naming.empty');
          this.name = this.host.subject()?.name ?? this.name.trim();
          this.page = 'happy';
          this.index = 0;
          this.host.celebrate();
        },
      },
      {
        label: t('naming.later'),
        run: () => {
          if (subject) this.host?.later(subject.d);
          ui.close();
          ui.say(t('naming.laterNote'), true);
        },
      },
    ];
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    const acts = this.actions(ui);
    if (code === 'ArrowDown' || code === 'KeyS' || code === 'Tab') this.index = (this.index + 1) % acts.length;
    else if (code === 'ArrowUp' || code === 'KeyW') this.index = (this.index + acts.length - 1) % acts.length;
    else if (isConfirm(code) || code === 'KeyE') acts[Math.min(this.index, acts.length - 1)]?.run();
    return true;
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    // The Blobbi on the left, big on its little island and looking at the player; the words and buttons on the right.
    const left = Math.min(92, Math.floor(w * 0.34));
    const cx = x + Math.floor(left / 2);
    const k = h >= 130 ? 3 : 2;
    const ground = y + Math.floor(h / 2) + 10 * k - 8;
    const happy = this.page === 'happy';
    g.box(x, y, left, h, UI.slot, UI.line);
    if (happy) drawTwinkles(g, ui, cx, ground - 12 * k, 12 * k, 11);
    drawPortrait(g, ui, cx, ground, { scale: k, expression: happy ? 'excited' : 'happy', hop: happy, island: true, islandMax: Math.floor(left / 2) - 6 });
    const shown = this.name || '...';
    g.text(shown, cx - Math.floor(g.measure(shown) / 2), ground + 12, happy ? UI.accent : UI.ink);
    const tx = x + left + 8;
    const tw = w - left - 8;
    const acts = this.actions(ui);
    // The words and the buttons as one block, centred in the column.
    const textH = this.drawText(new Gfx(w, h, 1), ui, 0, tw, 0);
    const top = y + Math.max(1, Math.floor((h - textH - 6 - acts.length * 14) / 2));
    let by = this.drawText(g, ui, tx, tw, top) + 6;
    const bw = Math.min(tw, 150);
    acts.forEach((a, i) => {
      g.button(a.label, tx, by, () => {
        this.index = i;
        a.run();
      }, { w: bw, primary: a.primary || i === this.index });
      by += 14;
    });
  }

  /** The name's field: Enter keeps the name (THAT'S THE NAME!). */
  private field(ui: GameUI): TextFieldSpec {
    return {
      id: 'naming.name',
      kind: 'text',
      value: this.name,
      maxLength: 24,
      label: t('naming.label'),
      autocomplete: 'off',
      autocapitalize: 'words',
      enterKeyHint: 'done',
      autofocus: true,
      selectOnFocus: true,
      onInput: (v) => this.setName(v),
      onEnter: () => this.actions(ui)[0]?.run(),
    };
  }

  private drawText(g: Gfx, ui: GameUI, tx: number, tw: number, top: number): number {
    let cy = top;
    if (this.page === 'happy') {
      cy += g.para(upper(t('naming.happyTitle', { name: this.name })), tx, cy, tw, UI.accent, 2) + 4;
      cy += g.para(t('naming.happyBody', { name: this.name }), tx, cy, tw, UI.ink, 4) + 4;
      cy += g.para(t('naming.kept'), tx, cy, tw, UI.muted, 3) + 4;
      return cy;
    }
    cy += g.para(upper(t('naming.question')), tx, cy, tw, UI.accent, 3) + 4;
    cy += g.para(t('naming.body'), tx, cy, tw, UI.ink, 4) + 6;
    g.text(t('naming.label'), tx, cy, UI.muted);
    const fx = tx + g.measure(t('naming.label')) + 4;
    drawTextField(g, this.field(ui), fx, cy - 2, Math.min(110, tw - (fx - tx)), 11, ui.now, ui.settings.reducedMotion);
    cy += 14;
    if (this.message) cy += g.para(t(this.message), tx, cy, tw, UI.bad, 2) + 2;
    return cy;
  }
}
