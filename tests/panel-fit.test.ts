/**
 * P1.2A phase 2: menus and title pages on short screens (`src/ui/panel-fit.ts`). Where 2× fits the width but not the
 * height (a 640×360 phone, an iPhone with Safari's bars, an iPhone SE in Safari) the layout stays at 2× and scrolls,
 * instead of dropping to 1× (5-pixel capitals, 10-pixel buttons). A scrolling menu keeps its title bar and X pinned
 * and shows a scroll bar; nothing else changes size, and Large keeps the HUD at 2× on a phone held sideways.
 * The page's side (dragging, the wheel, a tap on release) is checked in the browser.
 */
import { describe, expect, it } from 'vitest';
import { MIN_VISIBLE, PanelScroll, fitPanel, newlyMarked } from '../src/ui/panel-fit';
import { GameUI, LARGE_HUD_MIN_SIDE, MENU_SCALE_CAP, PANEL_H, PANEL_W, hudScale, type TextSize } from '../src/ui/game-ui';
import { TitleScreen } from '../src/ui/title';
import { PixelBuffer } from '../src/core/pixel';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { paletteFor } from '../src/world/generate';
import { SettingsScreen } from '../src/ui/screens/settings';
import { InventoryScreen } from '../src/ui/screens/inventory';
import { JournalScreen } from '../src/ui/screens/journal';
import { GuideScreen } from '../src/ui/screens/guide';
import '../src/content/text';

const menu = (w: number, h: number, size: TextSize = 'normal') => fitPanel(w, h, PANEL_W, PANEL_H, MENU_SCALE_CAP[size], 2);
const title = (w: number, h: number) => fitPanel(w, h, 320, 180, 6);

describe('fitting a menu panel', () => {
  it('keeps 2× and scrolls where only the height is short', () => {
    expect(menu(640, 360)).toEqual({ scale: 2, overflow: 368 - 356 });
    expect(menu(844, 340)).toEqual({ scale: 2, overflow: 368 - 336 });
    expect(menu(667, 325)).toEqual({ scale: 2, overflow: 368 - 321 });
    expect(menu(932, 300)).toEqual({ scale: 2, overflow: 368 - 296 });
  });

  it('fits exactly as before everywhere else', () => {
    for (const [w, h] of [[667, 375], [844, 390], [915, 412], [932, 430], [1024, 768], [1280, 720], [1920, 1080], [800, 500]]) {
      const before = Math.max(1, Math.min(3, Math.floor(Math.min((w - 4) / PANEL_W, (h - 4) / PANEL_H))));
      expect(menu(w, h), `${w}×${h}`).toEqual({ scale: before, overflow: 0 });
    }
    expect(menu(1920, 1080, 'large').scale).toBe(4);
    expect(menu(1920, 1080, 'small').scale).toBe(2);
  });

  it('still uses 1× where 2× is too narrow, or too little of it would show', () => {
    expect(menu(568, 320)).toEqual({ scale: 1, overflow: 0 });
    expect(menu(611, 360)).toEqual({ scale: 1, overflow: 0 });
    const tooShort = Math.ceil(MIN_VISIBLE * 2 * PANEL_H) + 4 - 1;
    expect(menu(844, tooShort)).toEqual({ scale: 1, overflow: 0 });
    expect(menu(844, tooShort + 1).scale).toBe(2);
    // Portrait phones (the rotate overlay) are unchanged.
    expect(menu(390, 844)).toEqual({ scale: 1, overflow: 0 });
  });

  it('never goes past 2× by scrolling (3× and up only when they fit)', () => {
    // 3× would need 556 + 4 pixels: at 520 the panel is 2× and fits, it does not scroll at 3×.
    expect(menu(1300, 520)).toEqual({ scale: 2, overflow: 0 });
    // Any layout: 2× scrolls with three quarters of it visible, not with less.
    expect(fitPanel(400, 300, 100, 200, 6, 0)).toEqual({ scale: 2, overflow: 100 });
    expect(fitPanel(400, 299, 100, 200, 6, 0)).toEqual({ scale: 1, overflow: 0 });
  });

  it('title pages: 2× scrolling with Safari bars, as before elsewhere', () => {
    expect(title(844, 340)).toEqual({ scale: 2, overflow: 20 });
    expect(title(667, 325)).toEqual({ scale: 2, overflow: 35 });
    expect(title(640, 360)).toEqual({ scale: 2, overflow: 0 });
    expect(title(568, 320)).toEqual({ scale: 1, overflow: 0 });
    for (const [w, h] of [[844, 390], [1024, 768], [1920, 1080], [960, 540]]) expect(title(w, h)).toEqual({ scale: TitleScreen.scaleFor(w, h), overflow: 0 });
  });
});

describe('the scroll offset', () => {
  it('stays in range, pages by half the visible height, and resets', () => {
    const s = new PanelScroll();
    s.range(40, 300);
    expect(s.by(100)).toBe(true);
    expect(s.y).toBe(40);
    expect(s.key('PageUp', s.page)).toBe(true);
    expect(s.y).toBe(0);
    expect(s.key('PageDown', s.page)).toBe(true);
    expect(s.y).toBe(40);
    expect(s.key('Home', s.page)).toBe(false); // Home opens the HOME menu
    s.range(10, 300);
    expect(s.y).toBe(10);
    s.reset();
    expect(s.y).toBe(0);
    s.range(0, 300);
    expect(s.by(5)).toBe(false);
    expect(s.key('PageDown', 1)).toBe(false);
  });
});

function setup(size: TextSize = 'normal') {
  const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
  live.brain.enabled = false;
  const ui = new GameUI(() => live, () => paletteFor('cozy'));
  ui.settings.textSize = size;
  for (const s of [new SettingsScreen(), new InventoryScreen(), new JournalScreen(), new GuideScreen()]) ui.register(s);
  return { live, ui };
}
const after = (ui: GameUI, w: number, h: number) => {
  const screen = new PixelBuffer(w, h);
  ui.render(screen, 0);
  ui.render(screen, 10); // past the opening slide
  return screen;
};

describe('a scrolling menu', () => {
  it('opens at 2× at the top on a 640×360 phone, with every control reachable by scrolling', () => {
    const { ui } = setup();
    ui.open('settings');
    after(ui, 640, 360);
    expect(ui.scale).toBe(2);
    expect(ui.scroll.max).toBe(12);
    // Every control is on screen at the top or at the end of the scroll.
    const label = (h: { x: number; y: number }) => `${h.x}`;
    const seenTop = ui.regions.filter((h) => !h.inert && h.y >= 0 && h.y + h.h <= 360).length;
    const all = ui.regions.filter((h) => !h.inert).length;
    ui.scroll.to(ui.scroll.max);
    after(ui, 640, 360);
    expect(ui.regions.filter((h) => !h.inert && (h.y < 0 || h.y + h.h > 360)).map(label)).toEqual([]);
    expect(ui.regions.filter((h) => !h.inert).length).toBe(all);
    expect(seenTop).toBeGreaterThan(0);
  });

  it('keeps the title bar and X pinned at the top while the body scrolls under it', () => {
    const { ui } = setup();
    ui.open('inventory');
    after(ui, 667, 325);
    ui.scroll.to(ui.scroll.max);
    after(ui, 667, 325);
    const ox = Math.floor((667 - PANEL_W * 2) / 2);
    const xButton = ui.regions.filter((h) => !h.inert && h.x >= ox + (PANEL_W - 13) * 2 && h.y < 2 + 13 * 2);
    expect(xButton.length).toBe(1);
    // A press on X still closes the panel.
    ui.handlePointer(xButton[0].x + 2, xButton[0].y + 2);
    expect(ui.capturing).toBe(false);
  });

  it('a press on the pinned bar never reaches what scrolled under it', () => {
    const { ui } = setup();
    ui.open('settings');
    after(ui, 844, 300);
    ui.scroll.to(ui.scroll.max);
    after(ui, 844, 300);
    const ox = Math.floor((844 - PANEL_W * 2) / 2);
    // Middle of the title bar: inert (taken, nothing happens, the panel stays open).
    expect(ui.handlePointer(ox + 100, 2 + 10)).toBe(true);
    expect(ui.capturing).toBe(true);
  });

  it('Page Down and Page Up scroll; other keys still reach the screen', () => {
    const { ui } = setup();
    ui.open('journal');
    after(ui, 844, 340);
    expect(ui.handleKey('PageDown')).toBe(true);
    expect(ui.scroll.y).toBe(ui.scroll.max);
    expect(ui.handleKey('PageUp')).toBe(true);
    expect(ui.scroll.y).toBe(0);
    expect(ui.handleKey('Escape')).toBe(true);
    expect(ui.capturing).toBe(false);
  });

  it('starts at the top again when another menu opens', () => {
    const { ui } = setup();
    ui.open('settings');
    after(ui, 640, 360);
    ui.scroll.to(ui.scroll.max);
    ui.open('inventory');
    expect(ui.scroll.y).toBe(0);
  });

  it('a menu that fits does not scroll and keeps its place', () => {
    const { ui } = setup();
    ui.open('settings');
    after(ui, 844, 390);
    expect(ui.scroll.max).toBe(0);
    ui.handleKey('PageDown');
    expect(ui.scroll.y).toBe(0);
    expect(ui.scale).toBe(2);
  });
});

describe('Large on a small screen', () => {
  it('keeps the HUD at 2× on a phone held sideways, 3× where there is room', () => {
    const large = { textSize: 'large' as TextSize };
    for (const [w, h] of [[568, 320], [640, 360], [667, 375], [844, 390], [915, 412], [932, 430]]) expect(hudScale(large, { width: w, height: h }), `${w}×${h}`).toBe(2);
    for (const [w, h] of [[1024, 768], [768, 1024], [1280, 720], [800, 500], [1920, 1080]]) expect(hudScale(large, { width: w, height: h }), `${w}×${h}`).toBe(3);
    expect(hudScale(large, { width: 900, height: LARGE_HUD_MIN_SIDE })).toBe(3);
    expect(hudScale(large, { width: 900, height: LARGE_HUD_MIN_SIDE - 1 })).toBe(2);
    // Small and Normal are 2× everywhere, as before.
    for (const size of ['small', 'normal'] as TextSize[]) expect(hudScale({ textSize: size }, { width: 1920, height: 1080 })).toBe(2);
  });

  it('the menu bar, hotbar and tip use it', () => {
    const { ui } = setup('large');
    after(ui, 844, 390);
    const phone = ui.occupied.map((b) => b.h);
    after(ui, 1280, 720);
    const desk = ui.occupied.map((b) => b.h);
    expect(Math.max(...phone)).toBeLessThan(Math.max(...desk));
  });
});

describe('following the keyboard on a scrolling page', () => {
  it('follow moves as little as possible, and the top wins for a span taller than the view', () => {
    const s = new PanelScroll();
    s.range(100, 200);
    s.follow(250, 270, 26, 200); // below the view: just enough to show it, plus the margin
    expect(s.y).toBe(270 - 200 + 4);
    s.follow(40, 60, 26, 200); // above: back up just enough
    expect(s.y).toBe(40 - 26 - 4);
    const y = s.y;
    s.follow(100, 120, 26, 200); // already visible: no jump
    expect(s.y).toBe(y);
    s.follow(10, 400, 26, 200); // taller than the view: its top
    expect(s.y).toBe(0);
  });

  it('newlyMarked is what a key just highlighted, never what stays highlighted', () => {
    const tab = { x: 0, y: 15, w: 72, h: 11 };
    const row1 = { x: 4, y: 40, w: 150, h: 11 };
    const row5 = { x: 4, y: 120, w: 150, h: 11 };
    expect(newlyMarked([tab, row5], [tab, row1])).toEqual({ top: 120, bottom: 131 });
    expect(newlyMarked([tab, row1], [tab, row1])).toBeNull();
    expect(newlyMarked([], [row1])).toBeNull();
    // Two new marks (a row and the action it lights up further down): only the topmost is followed.
    expect(newlyMarked([tab, row1, row5], [tab])).toEqual({ top: 40, bottom: 51 });
  });

  // The guide's selected topic (its only mark) on screen.
  const selectedOnScreen = (ui: GameUI) => {
    const m = (ui as unknown as { lastMarks: { y: number; h: number }[] }).lastMarks.at(-1)!;
    const top = 2 - ui.scroll.y + m.y * 2;
    return { top, bottom: top + m.h * 2 };
  };

  it('arrow keys keep the selected GUIDE topic in view under the pinned title bar, a step at a time', () => {
    const { ui } = setup();
    ui.open('guide');
    after(ui, 640, 280);
    expect(ui.scroll.max).toBeGreaterThan(40);
    const steps: number[] = [];
    for (let i = 0; i < 20; i++) {
      ui.handleKey('ArrowDown');
      after(ui, 640, 280);
      const r = selectedOnScreen(ui);
      expect(r.top, `down ${i}`).toBeGreaterThanOrEqual(2 + 13 * 2);
      expect(r.bottom, `down ${i}`).toBeLessThanOrEqual(278);
      steps.push(ui.scroll.y);
    }
    expect(ui.scroll.y).toBeGreaterThan(0);
    // No jumps: each key scrolls at most about one row (9 UI pixels at 2×, plus the margin).
    for (let i = 1; i < steps.length; i++) expect(steps[i] - steps[i - 1]).toBeLessThanOrEqual(9 * 2 + 4);
    // Back up to the first topic: the page follows it back.
    for (let i = 0; i < 20; i++) {
      ui.handleKey('ArrowUp');
      after(ui, 640, 280);
      expect(selectedOnScreen(ui).top, `up ${i}`).toBeGreaterThanOrEqual(2 + 13 * 2);
    }
  });

  it('the journal does not jump to the READ button its selection lights up', () => {
    const { ui } = setup();
    ui.open('journal');
    after(ui, 640, 280);
    for (let i = 0; i < 3; i++) (ui.handleKey('ArrowDown'), after(ui, 640, 280));
    // The selected entry is near the top: nothing needed to move.
    expect(ui.scroll.y).toBe(0);
  });

  it('a key that changes nothing on the page (a toggle in place) does not move it', () => {
    const { ui } = setup();
    ui.open('settings');
    after(ui, 640, 280);
    ui.scroll.to(20);
    after(ui, 640, 280);
    ui.handleKey('Enter'); // toggles the selected row (language: next); its highlight stays where it was
    after(ui, 640, 280);
    expect(ui.scroll.y).toBe(20);
  });

  it('a finger or the wheel scrolling is never pulled back to the selection', () => {
    const { ui } = setup();
    ui.open('guide');
    after(ui, 640, 280);
    for (let i = 0; i < 16; i++) (ui.handleKey('ArrowDown'), after(ui, 640, 280));
    const y = ui.scroll.y;
    expect(y).toBeGreaterThan(0);
    ui.scroll.to(0); // a drag back to the top
    after(ui, 640, 280);
    after(ui, 640, 280);
    expect(ui.scroll.y).toBe(0);
    expect(y).not.toBe(0);
  });

  it('a title page keeps the keyboard row in view at 844×340', () => {
    const t = new TitleScreen({ worlds: () => [], current: () => ({ identity: 'id', name: 'Mossy Cove', saved: false }), continueGame: () => {}, openWorld: () => {}, settings: () => {} } as never);
    const screen = new PixelBuffer(844, 300);
    t.render(screen, 0);
    expect(t.fitScroll.max).toBeGreaterThan(0);
    const marked = () => (t as unknown as { lastMarks: { y: number; h: number }[] }).lastMarks.at(-1)!;
    for (let i = 0; i < 4; i++) {
      t.key('ArrowDown');
      t.render(screen, 0);
      const m = marked();
      expect(m.y * 2 - t.fitScroll.y).toBeGreaterThanOrEqual(0);
      expect((m.y + m.h) * 2 - t.fitScroll.y).toBeLessThanOrEqual(300);
    }
  });

  it('a text field that takes the keyboard is scrolled into view; typing does not move the page', async () => {
    const { fieldFocus } = await import('../src/ui/text-field');
    const t = new TitleScreen({ worlds: () => [], current: () => ({ identity: 'id', name: 'Mossy Cove', saved: false }), continueGame: () => {}, openWorld: () => {}, settings: () => {} } as never);
    (t as unknown as { go(p: string): void }).go('name');
    const screen = new PixelBuffer(667, 290);
    t.render(screen, 0);
    expect(t.fitScroll.max).toBeGreaterThan(0);
    const field = t.fields.find((f) => f.spec.id === 'title.name')!;
    expect(field).toBeTruthy();
    t.fitScroll.to(t.fitScroll.y < t.fitScroll.max / 2 ? t.fitScroll.max : 0);
    t.render(screen, 0);
    fieldFocus.id = 'title.name';
    t.render(screen, 0);
    const f = t.fields.find((x) => x.spec.id === 'title.name')!;
    expect(f.y).toBeGreaterThanOrEqual(0);
    expect(f.y + f.h).toBeLessThanOrEqual(290);
    const y = t.fitScroll.y;
    t.render(screen, 0); // still focused, nothing new: no jump
    expect(t.fitScroll.y).toBe(y);
    fieldFocus.id = null;
  });
});
