/**
 * SETTINGS AND HELP: presentation preferences (day and night lighting, the goal box, sound, motion, UI scale) and
 * the audio mix, kept per browser by the playground, and the controls. Nothing here touches the world or the save.
 * Two pages, GAME and SOUND (Tab or the buttons switch); on a volume row LEFT and RIGHT change the level.
 */
import { Gfx, UI } from '../gfx';
import { isConfirm, moveSelection, type GameUI, type Screen } from '../game-ui';
import type { AudioSettings } from '../../audio/engine';

const CONTROLS = [
  'WASD / ARROWS  MOVE',
  'E / SPACE  PICK UP, FARM, USE',
  'I BAG  K CRAFT  J JOURNAL',
  'U BLOBBI  N MAP  L GROWTH',
  'F FEED  H PET  R REST',
  'T SEED OR STYLE  Q TOOL',
  'B BUILD  M MOVE MODE',
  'MOVE MODE: E MOVE  X TO BAG',
  'C V G  AXE PICKAXE HOE',
  'Z CAMERA  O GOAL BOX  Y WORLDS',
];

type Row = { label: string; run: () => void; adjust?: (d: number) => void };
const pct = (v: number) => (v <= 0 ? 'OFF' : `${Math.round(v * 100)}%`);
const VOLUME_STEP = 0.1;

export class SettingsScreen implements Screen {
  readonly id = 'settings' as const;
  index = 0;
  page: 'game' | 'sound' = 'game';
  /** Called after a change (the playground stores the settings). */
  onChange: (() => void) | null = null;
  /** The audio mix to edit (the playground's engine settings); without it the SOUND page says so. */
  audio: AudioSettings | null = null;

  title(): string {
    return 'Settings and controls';
  }

  rows(ui: GameUI): Row[] {
    const s = ui.settings;
    const change = (f: () => void) => () => {
      f();
      this.onChange?.();
    };
    if (this.page === 'game')
      return [
        { label: `DAY AND NIGHT LIGHT: ${s.daylight ? 'ON' : 'OFF'}`, run: change(() => (s.daylight = !s.daylight)) },
        { label: `GOAL BOX: ${s.goals ? 'ON' : 'OFF'}`, run: change(() => (s.goals = !s.goals)) },
        { label: `SOUND: ${s.sound ? 'ON' : 'OFF'}`, run: change(() => (s.sound = !s.sound)) },
        { label: `REDUCED MOTION: ${s.reducedMotion ? 'ON' : 'OFF'}`, run: change(() => (s.reducedMotion = !s.reducedMotion)) },
        { label: `LARGE HUD TEXT: ${s.largeText ? 'ON' : 'OFF'}`, run: change(() => (s.largeText = !s.largeText)) },
        { label: `MENU SCALE: ${s.scale ? `${s.scale}X` : 'AUTO'}`, run: change(() => (s.scale = (s.scale + 1) % 4)) },
      ];
    const a = this.audio;
    if (!a) return [];
    const volume = (name: string, key: 'master' | 'music' | 'sfx' | 'ambient'): Row => {
      const adjust = (d: number) => change(() => (a[key] = Math.round(Math.max(0, Math.min(1, a[key] + d)) * 10) / 10))();
      // A click steps up and wraps to off, so the row works with a pointer alone.
      return { label: `${name}: ${pct(a[key])}`, run: () => (a[key] >= 1 ? change(() => (a[key] = 0))() : adjust(VOLUME_STEP * 2)), adjust };
    };
    return [
      volume('VOLUME', 'master'),
      volume('MUSIC', 'music'),
      volume('EFFECTS', 'sfx'),
      volume('AMBIENCE', 'ambient'),
      { label: `MUSIC: ${a.musicOn ? 'ON' : 'OFF'}`, run: change(() => (a.musicOn = !a.musicOn)) },
      { label: `SOFTER SOUND: ${a.reduced ? 'ON' : 'OFF'}`, run: change(() => (a.reduced = !a.reduced)) },
      { label: `MUTE ALL: ${a.muted ? 'ON' : 'OFF'}`, run: change(() => (a.muted = !a.muted)) },
    ];
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    if (code === 'Tab') {
      this.page = this.page === 'game' ? 'sound' : 'game';
      this.index = 0;
      return true;
    }
    const rows = this.rows(ui);
    const row = rows[this.index];
    if (row?.adjust && (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowRight' || code === 'KeyD')) {
      row.adjust(code === 'ArrowLeft' || code === 'KeyA' ? -VOLUME_STEP : VOLUME_STEP);
      return true;
    }
    const moved = moveSelection(code, this.index, rows.length, 1);
    if (moved !== null) {
      this.index = moved;
      return true;
    }
    if (isConfirm(code)) {
      row?.run();
      return true;
    }
    return false;
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number): void {
    const tab = (label: string, page: 'game' | 'sound', tx: number) =>
      g.button(label, tx, y + 1, () => ((this.page = page), (this.index = 0)), { w: 72, primary: this.page === page });
    tab('GAME', 'game', x);
    tab('SOUND', 'sound', x + 78);
    let cy = y + 16;
    this.rows(ui).forEach((it, i) => {
      g.button(it.label, x, cy, () => ((this.index = i), it.run()), { w: 150, primary: i === this.index });
      cy += 13;
    });
    const note =
      this.page === 'game'
        ? 'Lighting, sound and motion are presentation only: the island, its time and your progress are the same either way. TAB: SOUND.'
        : this.audio
          ? 'LEFT and RIGHT change a volume. Music and effects are separate. Softer sound calms the island. TAB: GAME.'
          : 'Audio is not available in this browser.';
    g.para(note, x, cy + 3, 150, UI.muted, 6);
    const cx = x + 160;
    g.text('CONTROLS', cx, y + 2, UI.accent);
    CONTROLS.forEach((line, i) => g.text(line, cx, y + 14 + i * 9, UI.ink));
    g.para('Menus pause the island. Click or tap slots and buttons; outside a menu closes it.', cx, y + 14 + CONTROLS.length * 9 + 6, w - 162, UI.muted, 4);
  }
}
