/**
 * HOME CUSTOMISATION (M8): the LOOK (roof colour, walls, door, windows) and ROOMS (floor, wall colour, wall finish)
 * tabs of the HOME panel. Choices are a DRAFT shown in a live preview; APPLY saves them, REVERT forgets the draft.
 * Locked options are listed with what unlocks them (they cannot be applied), so the player sees what is still to
 * earn. ROOMS also starts furniture arranging (the move mode) when the player is inside.
 *
 * Keyboard: UP/DOWN choose a part, LEFT/RIGHT the option, ENTER applies, BACKSPACE reverts. Mouse and touch: the
 * arrows beside each part and the buttons.
 */
import { Gfx, UI, textWidth } from '../gfx';
import type { GameUI } from '../game-ui';
import type { HomeScreen } from './home';
import { houseSprite } from '../../game/buildings';
import { resolveLook, type HouseLook } from '../../game/house-art';
import { layoutFor, roomSprite } from '../../game/interior';
import { STYLE_OPTIONS, isUnlocked, unlockHint, type StylePart } from '../../content/home-styles';
import { PixelBuffer } from '../../core/pixel';
import { card, DESIGN } from '../hud';
import { hex } from '../../core/color';

type Draft = Record<StylePart, number>;

const LOOK_PARTS: readonly [StylePart, string][] = [
  ['roof', 'ROOF'],
  ['wall', 'WALLS'],
  ['door', 'DOOR'],
  ['window', 'WINDOWS'],
];
const ROOM_PARTS: readonly [StylePart, string][] = [
  ['floor', 'FLOOR'],
  ['wallColour', 'WALL COLOUR'],
  ['finish', 'WALL FINISH'],
];

/** The draft from what the home has now. */
function current(ui: GameUI): Draft {
  const live = ui.live!;
  const house = live.home();
  const level = house ? (house.level ?? 1) : 1;
  const look = resolveLook(level, house?.look);
  const st = house ? live.interiors.get(house.id)?.style : undefined;
  return { roof: look.roof, wall: look.wall, door: look.door, window: look.window, floor: st?.floor ?? 0, wallColour: st?.wall ?? 0, finish: st?.finish ?? 0 };
}

class StyleTab {
  row = 0;
  draft: Draft | null = null;

  constructor(
    readonly parts: readonly [StylePart, string][],
    readonly kind: 'look' | 'rooms',
  ) {}

  opened(ui: GameUI): void {
    this.draft = ui.live?.home() ? current(ui) : null;
    this.row = 0;
  }

  private ensure(ui: GameUI): Draft | null {
    if (!this.draft && ui.live?.home()) this.draft = current(ui);
    return this.draft;
  }

  private cycle(part: StylePart, d: number): void {
    if (!this.draft) return;
    const n = STYLE_OPTIONS[part].length;
    this.draft[part] = (this.draft[part] + d + n) % n;
  }

  /**
   * The parts of the draft that are locked (APPLY refuses them). A part left as the home has it is never "locked":
   * a style applied before M9's unlocks stays the player's.
   */
  private locked(ui: GameUI): string[] {
    const ctx = ui.live!.styleContext();
    const now = current(ui);
    return this.parts.filter(([p]) => this.draft![p] !== now[p] && !isUnlocked(STYLE_OPTIONS[p][this.draft![p]].unlock, ctx)).map(([, label]) => label.toLowerCase());
  }

  apply(ui: GameUI): void {
    const live = ui.live!;
    const d = this.ensure(ui);
    if (!d) return ui.say('build a shelter first (B)', false);
    const locked = this.locked(ui);
    if (locked.length) return ui.say(`still locked: ${locked.join(', ')}`, false);
    const house = live.home()!;
    const r =
      this.kind === 'look'
        ? live.setHouseLook(lookFromDraft(d, house.level ?? 1))
        : live.setRoomStyle({ floor: d.floor, wall: d.wallColour, ...(d.finish ? { finish: d.finish } : {}) });
    ui.say(r.ok ? (this.kind === 'look' ? 'your house has a new look' : 'the rooms are restyled') : (r.reason ?? 'not now'), r.ok);
  }

  revert(ui: GameUI): void {
    this.draft = current(ui);
    ui.say('back as it was');
  }

  key(code: string, ui: GameUI): boolean {
    if (!this.ensure(ui)) return false;
    const part = this.parts[this.row][0];
    if (code === 'ArrowUp' || code === 'KeyW') this.row = (this.row + this.parts.length - 1) % this.parts.length;
    else if (code === 'ArrowDown' || code === 'KeyS') this.row = (this.row + 1) % this.parts.length;
    else if (code === 'ArrowLeft' || code === 'KeyA') this.cycle(part, -1);
    else if (code === 'ArrowRight' || code === 'KeyD') this.cycle(part, 1);
    else if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter' || code === 'KeyE') this.apply(ui);
    else if (code === 'Backspace') this.revert(ui);
    else if (code === 'KeyM' && this.kind === 'rooms') this.arrange(ui);
    else return false;
    return true;
  }

  /** ARRANGE FURNITURE: the move mode, inside the house. */
  arrange(ui: GameUI): void {
    const live = ui.live!;
    if (!live.inside) return ui.say('step inside your house to arrange its furniture', false);
    ui.close();
    if (!live.manage) live.toggleManage();
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const live = ui.live!;
    const d = this.ensure(ui);
    if (!d) {
      g.para('Build your first home to make it yours: B (or CRAFT, then BUILD).', x, y + 4, w, UI.ink);
      return;
    }
    const ctx = live.styleContext();
    const house = live.home()!;
    const level = house.level ?? 1;
    // The preview: the draft, not yet applied.
    const pw = 120;
    const ph = 74;
    g.buf.blit(card(pw + 4, ph + 4, DESIGN.accent), x, y);
    const pv = new PixelBuffer(pw, ph);
    if (this.kind === 'look') {
      pv.fill(ui.palette().grass.mid);
      const s = houseSprite({ ...house, look: lookFromDraft(d, level), upgradedAt: undefined }, ui.palette(), 1, live.world.options.scale);
      const k = s.buffer.width * 2 <= pw && s.buffer.height * 2 <= ph - 4 ? 2 : 1;
      const big = s.buffer.scaled(k);
      pv.blit(big, Math.floor(pw / 2 - s.anchorX * k), ph - 4 - s.anchorY * k);
    } else {
      const layout = layoutFor(live.interiors.get(house.id)?.level ?? level);
      const room = roomSprite({ floor: d.floor, wall: d.wallColour, finish: d.finish }, ui.palette(), hex('#9ad0f0'), layout);
      // The back wall and the floor below it (a corner of the room, at its own scale).
      pv.blit(room, -4, -2);
    }
    // A locked choice is previewed dimmed under a padlock: something to earn, not something to use.
    const lockedNow = this.locked(ui);
    if (lockedNow.length) {
      const d0 = pv.data;
      for (let i = 0; i < d0.length; i++) {
        const c = d0[i];
        const grey = (((c & 0xff) + ((c >>> 8) & 0xff) + ((c >>> 16) & 0xff)) / 3) * 0.55 + 20;
        d0[i] = 0xff000000 | ((grey | 0) << 16) | ((grey | 0) << 8) | (grey | 0);
      }
      padlock(pv, Math.floor(pw / 2) - 9, Math.floor(ph / 2) - 12, 2);
    }
    g.buf.blit(pv, x + 2, y + 2);
    g.text(lockedNow.length ? `LOCKED: ${lockedNow.join(', ').toUpperCase()}`.slice(0, 30) : 'PREVIEW', x + 2, y + ph + 7, lockedNow.length ? UI.bad : UI.muted);
    // The parts, each with its option and arrows.
    const cx = x + pw + 10;
    let cy = y + 2;
    this.parts.forEach(([part, label], i) => {
      const opt = STYLE_OPTIONS[part][d[part]];
      const open = isUnlocked(opt.unlock, ctx) || d[part] === current(ui)[part];
      const total = STYLE_OPTIONS[part].length;
      const openCount = STYLE_OPTIONS[part].filter((o) => isUnlocked(o.unlock, ctx)).length;
      const selected = i === this.row;
      const rw = w - pw - 10;
      g.box(cx, cy, rw, 22, selected ? UI.slotHi : UI.slot, selected ? UI.accent : UI.line);
      g.text(label, cx + 4, cy + 3, selected ? UI.accent : UI.muted);
      g.button('<', cx + rw - 98, cy + 2, () => ((this.row = i), this.cycle(part, -1)), { w: 10 });
      g.button('>', cx + rw - 12, cy + 2, () => ((this.row = i), this.cycle(part, 1)), { w: 10 });
      const name = opt.name.toUpperCase();
      g.text(name.slice(0, 18), cx + rw - 86, cy + 5, open ? UI.ink : UI.line);
      g.text(open ? `${openCount} OF ${total} OPEN` : `LOCKED: ${unlockHint(opt.unlock)}`.toUpperCase().slice(0, 52), cx + 4, cy + 13, open ? UI.muted : UI.bad);
      if (!open) padlock(g.buf, cx + rw - 110, cy + 1);
      g.hit(cx, cy, rw - 100, 22, () => (this.row = i));
      cy += 25;
    });
    const by = y + h - 13;
    const anyLocked = this.locked(ui).length > 0;
    g.button('APPLY', cx, by, () => this.apply(ui), { w: 60, primary: !anyLocked, enabled: !anyLocked, whyNot: () => this.apply(ui) });
    g.button('REVERT', cx + 64, by, () => this.revert(ui), { w: 48 });
    if (this.kind === 'rooms') g.button('ARRANGE', cx + 116, by, () => this.arrange(ui), { w: 50, enabled: live.inside, whyNot: () => this.arrange(ui) });
    const tip = this.kind === 'look' ? 'LEFT/RIGHT CHANGE. ENTER APPLIES.' : 'INSIDE: ARRANGE MOVES FURNITURE.';
    g.text(tip, x, by + 3, UI.muted);
    void textWidth;
  }
}

/** A look record from the draft, leaving out parts that are the level's own default (so they follow upgrades). */
function lookFromDraft(d: Draft, level: number): HouseLook {
  const def = resolveLook(level, undefined);
  const look: HouseLook = {};
  for (const part of ['roof', 'wall', 'door', 'window'] as const) if (d[part] !== def[part]) look[part] = d[part];
  return look;
}

/** Give the HOME panel its LOOK and ROOMS tabs. */
export function installCustomisation(home: HomeScreen): void {
  home.tabs.look = new StyleTab(LOOK_PARTS, 'look');
  home.tabs.rooms = new StyleTab(ROOM_PARTS, 'rooms');
}

/** A padlock in the UI's colours (7×8 pixels, times `k`). */
function padlock(buf: PixelBuffer, x: number, y: number, k = 1): void {
  const rows = ['..###..', '.#...#.', '.#...#.', '#######', '#######', '###.###', '###.###', '#######'];
  rows.forEach((row, j) => [...row].forEach((ch, i) => ch === '#' && buf.fillRect(x + (i + 1) * k, y + (j + 2) * k, k, k, j < 3 ? UI.muted : UI.accent)));
}
