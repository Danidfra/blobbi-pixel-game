/**
 * P1.2A phase 3: the HUD inside the safe area, two overlaps fixed, and a finger's reach.
 *  - Notch, rounded corners and home indicator (insets): the status card, the chips, the goal, notices, the prompt,
 *    the camera indicator, the menu bar and the mode bar stay inside them; panels and title pages centre inside them.
 *  - The camera indicator moves above the menu bar where a narrow screen's bar reaches it; the tutorial tip keeps clear
 *    of the touch USE button (and of the hotbar, as before).
 *  - `hitAt`: a finger's press that misses (or lands on a background) takes the nearest control within FINGER_SLOP;
 *    exact hits win, a pinned bar keeps what scrolled under it, a press as near to two controls does nothing, and a
 *    mouse (no slop) is exactly as before.
 * The page's side (CSS env(safe-area-inset-*), real taps) is checked in the browser.
 */
import { describe, expect, it } from 'vitest';
import { AMBIGUOUS_PX, FINGER_SLOP, hitAt, type Hit } from '../src/ui/gfx';
import { GameUI, PANEL_W } from '../src/ui/game-ui';
import { TitleScreen } from '../src/ui/title';
import { PixelBuffer } from '../src/core/pixel';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { paletteFor } from '../src/world/generate';
import { SettingsScreen } from '../src/ui/screens/settings';
import { InventoryScreen } from '../src/ui/screens/inventory';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewCamera, worldBounds } from '../src/render/view-camera';
import '../src/content/text';

type Box = { x: number; y: number; w: number; h: number };
const NOTCH = { top: 0, right: 47, bottom: 21, left: 47 };
const inside = (b: Box, w: number, h: number, ins = NOTCH) => b.x >= ins.left && b.y >= ins.top && b.x + b.w <= w - ins.right && b.y + b.h <= h - ins.bottom;
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('a finger reaches the nearest control (hitAt)', () => {
  const act = () => {};
  const bg: Hit = { x: 0, y: 0, w: 300, h: 200, action: act, inert: true };
  const a: Hit = { x: 10, y: 10, w: 40, h: 22, action: act };
  const b: Hit = { x: 10, y: 40, w: 40, h: 22, action: act };
  const x: Hit = { x: 270, y: 2, w: 24, h: 22, action: act };

  it('an exact hit always wins, with or without slop', () => {
    expect(hitAt([bg, a, b, x], 20, 15)).toBe(a);
    expect(hitAt([bg, a, b, x], 20, 15, FINGER_SLOP)).toBe(a);
  });

  it('a mouse (no slop) behaves exactly as before: a gap is the background', () => {
    expect(hitAt([bg, a, b, x], 60, 15)).toBe(bg);
    expect(hitAt([bg, a, b, x], 400, 400)).toBeNull();
  });

  it('a finger near a control takes it: beside a button, under the X', () => {
    expect(hitAt([bg, a, b, x], 56, 15, FINGER_SLOP)).toBe(a);
    expect(hitAt([bg, a, b, x], 280, 30, FINGER_SLOP)).toBe(x);
    // Outside any background too (just outside a panel's edge).
    expect(hitAt([a], 5, 15, FINGER_SLOP)).toBe(a);
  });

  it('too far stays the background', () => {
    expect(hitAt([bg, a, b, x], 60 + FINGER_SLOP, 15, FINGER_SLOP)).toBe(bg);
  });

  it('a press about as near to two controls does nothing (no guessing)', () => {
    // Between a (ends at y 31) and b (starts at y 40): y 35/36 are 4 from both.
    expect(hitAt([bg, a, b], 20, 35, FINGER_SLOP)).toBe(bg);
    expect(hitAt([bg, a, b], 20, 33, FINGER_SLOP)).toBe(a);
    expect(hitAt([bg, a, b], 20, 38, FINGER_SLOP)).toBe(b);
    expect(AMBIGUOUS_PX).toBeGreaterThan(0);
  });

  it('a pinned bar (an inert region drawn later) keeps what scrolled under it unreachable', () => {
    const under: Hit = { x: 10, y: 0, w: 40, h: 20, action: act };
    const bar: Hit = { x: 0, y: 0, w: 300, h: 26, action: act, inert: true };
    const close: Hit = { x: 270, y: 2, w: 24, h: 22, action: act };
    expect(hitAt([bg, under, bar, close], 20, 10, FINGER_SLOP)).toBe(bar);
    expect(hitAt([bg, under, bar, close], 266, 10, FINGER_SLOP)).toBe(close);
  });
});

function setup() {
  const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
  live.brain.enabled = false;
  const ui = new GameUI(() => live, () => paletteFor('cozy'));
  for (const s of [new SettingsScreen(), new InventoryScreen()]) ui.register(s);
  return { live, ui };
}
const frame = (ui: GameUI, w: number, h: number) => {
  const screen = new PixelBuffer(w, h);
  ui.render(screen, 0);
  ui.render(screen, 10);
  return screen;
};

describe('GameUI with a finger', () => {
  it('a finger just under X closes the menu; a mouse there does not', () => {
    const { ui } = setup();
    ui.open('settings');
    frame(ui, 1280, 720);
    const xb = ui.regions.filter((h) => !h.inert && h.w < 60 && h.y < 200).sort((p, q) => q.x - p.x)[0];
    const below = { x: xb.x + xb.w / 2, y: xb.y + xb.h + 3 };
    expect(ui.handlePointer(below.x, below.y)).toBe(true); // the panel's background takes it
    expect(ui.capturing).toBe(true);
    expect(ui.handlePointer(below.x, below.y, FINGER_SLOP)).toBe(true);
    expect(ui.capturing).toBe(false);
  });

  it('a finger outside the panel but far from it still closes it', () => {
    const { ui } = setup();
    ui.open('settings');
    frame(ui, 1280, 720);
    ui.handlePointer(5, 5, FINGER_SLOP);
    expect(ui.capturing).toBe(false);
  });
});

describe('the safe area (a notched phone held sideways)', () => {
  it('the menu bar, and a panel, sit inside it', () => {
    const { ui } = setup();
    ui.touchMode = true;
    ui.insets = NOTCH;
    frame(ui, 844, 390);
    expect(inside(ui.menuBarBox!, 844, 390)).toBe(true);
    ui.open('inventory');
    frame(ui, 844, 390);
    const ox = Math.min(...ui.regions.map((h) => h.x));
    expect(ox).toBeGreaterThanOrEqual(NOTCH.left);
    expect(ox + PANEL_W * 2).toBeLessThanOrEqual(844 - NOTCH.right);
  });

  it('a panel too wide for the safe area keeps its scale and centres on the screen', () => {
    const { ui } = setup();
    ui.insets = { top: 0, right: 47, bottom: 21, left: 47 };
    ui.open('inventory');
    frame(ui, 667, 375);
    expect(ui.scale).toBe(2);
  });

  it('no insets: the menu bar is where it always was (desktop unchanged)', () => {
    const { ui } = setup();
    const s = frame(ui, 1280, 720);
    const m = ui.menuBarBox!;
    expect(m.x + m.w).toBe(s.width - 2 * 2);
    expect(m.y + m.h).toBe(s.height - 2 * 2);
  });

  it('title pages centre inside the safe area', () => {
    const t = new TitleScreen({ worlds: () => [], current: () => ({ identity: 'id', name: 'Mossy Cove', saved: false }), continueGame: () => {}, openWorld: () => {}, settings: () => {} } as never);
    t.insets = { top: 0, right: 0, bottom: 0, left: 120 };
    t.render(new PixelBuffer(844, 390), 0);
    expect(Math.min(...t.regions.map((h) => h.x))).toBeGreaterThanOrEqual(120);
  });
});

describe('the HUD drawn by the view renderer', () => {
  const draw = (w: number, h: number, extra: Partial<typeof DEFAULT_VIEW_UI>) => {
    const { live } = setup();
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const cam = new ViewCamera('exploration');
    const v = cam.update(0, live.cameraTarget(), w, h, worldBounds(live.world), true);
    view.render(v, 2, live.clock.time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, identity: 'guest', ...extra });
    return view;
  };

  it('the status card, the identity chip and the camera indicator stay inside the insets', () => {
    const view = draw(844, 390, { insets: NOTCH });
    expect(view.identityBox!.x).toBeGreaterThanOrEqual(NOTCH.left);
    expect(inside(view.indicatorBox!, 844, 390)).toBe(true);
    expect(view.hudBottom).toBeGreaterThan(0);
  });

  it('without insets they are where they always were', () => {
    const view = draw(1280, 720, {});
    expect(view.indicatorBox!.x).toBe(4);
    expect(view.indicatorBox!.y + view.indicatorBox!.h).toBe(720 - 4);
  });

  it('the camera indicator moves above a menu bar that reaches its corner', () => {
    const menu = { x: 100, y: 330, w: 700, h: 56 };
    const view = draw(844, 390, { indicatorAvoid: [menu] });
    expect(overlap(view.indicatorBox!, menu)).toBe(false);
    expect(view.indicatorBox!.y + view.indicatorBox!.h).toBeLessThanOrEqual(menu.y);
    // A menu bar that stays right of it changes nothing.
    const right = draw(844, 390, { indicatorAvoid: [{ x: 600, y: 330, w: 240, h: 56 }] });
    expect(right.indicatorBox!.y + right.indicatorBox!.h).toBe(390 - 4);
    // A two-row bar whose short lower row stays right of it: the indicator keeps its corner (and the joystick hint its
    // room above it); a lower row that reaches it lifts it above both rows.
    const twoRows = [{ x: 182, y: 242, w: 380, h: 22 }, { x: 232, y: 288, w: 330, h: 22 }];
    expect(draw(568, 320, { indicatorAvoid: twoRows }).indicatorBox!.y).toBe(320 - 4 - 18);
    const reaches = [{ x: 182, y: 242, w: 380, h: 22 }, { x: 100, y: 288, w: 460, h: 22 }];
    const lifted = draw(568, 320, { indicatorAvoid: reaches }).indicatorBox!;
    expect(lifted.y).toBeLessThan(320 - 4 - 18);
    for (const r of reaches) expect(overlap(lifted, r)).toBe(false);
  });
});

describe('the tutorial tip and the touch USE button', () => {
  it('the tip never covers the USE button, at small and large phone sizes', () => {
    for (const [w, h] of [[568, 320], [640, 360], [844, 390]]) {
      const { ui, live } = setup();
      ui.touchMode = true;
      expect(live.tutorialTip()).toBeTruthy();
      frame(ui, w, h);
      const tip0 = ui.tipBox!;
      // The USE button where touch.ts draws it: bottom right, above the menu bar, radius 30 at 2×.
      const r = 30;
      const use = { x: w - r - 12 - r, y: h - ui.menuBarHeight - r - 16 - r, w: 2 * r, h: 2 * r };
      ui.useButtonBox = use;
      frame(ui, w, h);
      expect(overlap(ui.tipBox!, use), `${w}×${h}`).toBe(false);
      expect(ui.tipBox!.y).toBeGreaterThanOrEqual(0);
      if (!overlap(tip0, use)) expect(ui.tipBox).toEqual(tip0); // nothing to avoid: unchanged
    }
  });
});
