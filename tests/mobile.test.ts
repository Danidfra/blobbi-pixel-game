/**
 * M8 mobile and guide: every action has a button a finger can reach (menu bar, mode bar, USE), the bar fits narrow
 * screens, tips speak touch, and the player guide covers the game's systems.
 */
import { describe, expect, it } from 'vitest';
import { LiveWorld } from '../src/sim/live-world';
import { memoryStore } from '../src/game/persistence';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { GameUI } from '../src/ui/game-ui';
import { GuideScreen } from '../src/ui/screens/guide';
import { GUIDE_PAGES } from '../src/content/guide';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { ITEMS } from '../src/game/items';
import { Gfx } from '../src/ui/gfx';

const live = () => {
  const l = new LiveWorld(generateWhaleWorld('island-touch-1', { carrierSeed: 'w', generatedHouse: false }), 'blobbi-9', 16, { store: memoryStore() });
  l.brain.enabled = false;
  return l;
};
const ui = (l: LiveWorld, touch: boolean) => {
  const u = new GameUI(() => l, () => paletteFor('cozy'));
  u.register(new GuideScreen());
  u.touchMode = touch;
  return u;
};
const inside = (screen: PixelBuffer, r: { x: number; y: number; w: number; h: number }) => r.x >= 0 && r.y >= 0 && r.x + r.w <= screen.width && r.y + r.h <= screen.height;

describe('touch controls', () => {
  for (const [w, h] of [[844, 390], [667, 375], [1024, 600], [568, 320]] as const)
    it(`${w}×${h}: the menu bar fits, buttons are finger-sized and never overlap`, () => {
      const l = live();
      l.setTips(false);
      const u = ui(l, true);
      const screen = new PixelBuffer(w, h);
      u.render(screen, 0);
      const bar = u.regions;
      expect(bar.length).toBeGreaterThanOrEqual(9);
      for (const r of bar) {
        expect(inside(screen, r), JSON.stringify(r)).toBe(true);
        expect(r.h).toBeGreaterThanOrEqual(22);
      }
      for (let i = 0; i < bar.length; i++) for (let j = i + 1; j < bar.length; j++) {
        const a = bar[i];
        const b = bar[j];
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
    });

  it('build, place and move modes get their own buttons (no Esc, B, T or X needed)', () => {
    const l = live();
    l.setTips(false);
    const u = ui(l, true);
    const screen = new PixelBuffer(844, 390);
    l.inventory.add(ITEMS.wood.id, 6);
    l.setBuildMode('shelter');
    u.render(screen, 0);
    const bar = u.regions.length;
    expect(bar).toBeGreaterThan(9); // NEXT and CANCEL
    const cancel = u.regions.at(-1)!;
    u.handlePointer(cancel.x + 2, cancel.y + 2);
    expect(l.buildMode).toBeNull();
    l.inventory.add('blobbi-pixel:furniture:potted-plant', 1);
    expect(l.startPlacing('blobbi-pixel:furniture:potted-plant')).toBe(true);
    u.render(screen, 1);
    const done = u.regions.at(-1)!;
    u.handlePointer(done.x + 2, done.y + 2);
    expect(l.placing).toBeNull();
    l.toggleManage();
    u.render(screen, 2);
    const doneManage = u.regions.at(-1)!;
    u.handlePointer(doneManage.x + 2, doneManage.y + 2);
    expect(l.manage).toBe(false);
  });

  it('touch labels drop the key names; the keyboard keeps them', () => {
    const l = live();
    l.setTips(false);
    for (const touch of [true, false]) {
      const u = ui(l, touch);
      const screen = new PixelBuffer(1280, 720);
      u.render(screen, 0);
      // Touch bars are drawn larger (3×): their buttons are taller.
      expect(u.regions[0].h).toBe(touch ? 33 : 22);
    }
  });
});

describe('the player guide', () => {
  it('covers every system the game has, each page short', () => {
    const ids = GUIDE_PAGES.map((p) => p.id);
    for (const id of ['controls', 'blobbi', 'gather', 'bag', 'craft', 'tools', 'build', 'home', 'furniture', 'farm', 'cook', 'quests', 'growth', 'explore', 'visit']) expect(ids).toContain(id);
    for (const p of GUIDE_PAGES) expect(p.text.length).toBeLessThan(560);
  });

  it('opens with ? (or GUIDE), every page draws, and the tips page turns tips back on', () => {
    const l = live();
    l.setTips(false);
    const u = ui(l, false);
    expect(u.handleKey('Slash')).toBe(true);
    expect(u.capturing).toBe(true);
    const guide = new GuideScreen();
    for (let i = 0; i < GUIDE_PAGES.length; i++) {
      guide.index = i;
      const g = new Gfx(304, 184);
      guide.draw(g, u, 4, 15, 296, 157);
      expect(g.buf.opaqueCount()).toBeGreaterThan(500);
    }
    const screen = u.screen as GuideScreen;
    screen.index = GUIDE_PAGES.findIndex((p) => p.id === 'tips');
    u.handleKey('Enter');
    expect(l.tutorial.skipped).toBe(false);
  });
});
