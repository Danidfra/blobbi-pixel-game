import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { ALL_ITEMS, ITEMS, MENU_CATEGORIES, menuCategory } from '../src/game/items';
import { GameUI, PANEL_H, PANEL_W } from '../src/ui/game-ui';
import { InventoryScreen, bagEntries, primaryAction } from '../src/ui/screens/inventory';
import { itemIcon } from '../src/ui/icons';

const palette = paletteFor('cozy');
function setup() {
  const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
  live.brain.enabled = false;
  const ui = new GameUI(() => live, () => palette);
  const inv = new InventoryScreen();
  ui.register(inv);
  const screen = new PixelBuffer(960, 540);
  const draw = () => ui.render(screen, 0);
  return { live, ui, inv, screen, draw };
}
const centre = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2] as const;

describe('item icons', () => {
  it('every registered item has its own icon (never the unknown tile)', () => {
    const unknown = itemIcon('nope:nope', palette).data.join();
    for (const d of ALL_ITEMS) {
      const icon = itemIcon(d.id, palette);
      expect(icon.data.join(), d.id).not.toBe(unknown);
      expect(icon.width).toBeLessThanOrEqual(16);
      expect(icon.height).toBeLessThanOrEqual(16);
    }
  });
  it('every item has a description and a menu category', () => {
    for (const d of ALL_ITEMS) {
      expect(d.description.length, d.id).toBeGreaterThan(10);
      expect(MENU_CATEGORIES).toContain(menuCategory(d.id));
    }
  });
});

describe('the game UI and input', () => {
  it("I opens the bag; while open every key is the menu's, movement moves the selection, Esc closes", () => {
    const { ui, inv, live } = setup();
    live.inventory.add(ITEMS.stick.id, 3);
    live.inventory.add(ITEMS.stone.id, 2);
    expect(ui.handleKey('KeyW')).toBe(false); // play: movement is the game's
    expect(ui.handleKey('KeyI')).toBe(true);
    expect(ui.capturing).toBe(true);
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'Space', 'KeyB', 'KeyF', 'KeyR', 'KeyP', 'KeyC']) expect(ui.handleKey(k)).toBe(true);
    // KeyE switched tabs (it is the menu's key here), so go back to All and move.
    inv.tab = 'all';
    inv.index = 0;
    ui.handleKey('ArrowRight');
    expect(inv.index).toBe(1);
    ui.handleKey('ArrowLeft');
    expect(inv.index).toBe(0);
    expect(live.inventory.count(ITEMS.stick.id)).toBe(3); // nothing was crafted, eaten or built
    expect(live.buildMode).toBeNull();
    ui.handleKey('Escape');
    expect(ui.capturing).toBe(false);
    ui.handleKey('KeyI');
    ui.handleKey('KeyI'); // I again closes
    expect(ui.capturing).toBe(false);
  });

  it('Enter equips a tool, feeds a food (one item, only when hungry), chooses a seed', () => {
    const { ui, inv, live } = setup();
    live.inventory.add(ITEMS.hoe.id, 1);
    live.inventory.add(ITEMS.turnip.id, 2);
    live.inventory.add(ITEMS.carrotSeed.id, 2);
    ui.handleKey('KeyI');
    inv.tab = 'tools';
    ui.handleKey('Enter');
    expect(live.equipped).toBe(ITEMS.hoe.id);
    ui.handleKey('Enter');
    expect(live.equipped).toBeNull();
    inv.tab = 'food';
    live.care.hunger = 50;
    ui.handleKey('Enter');
    expect(live.inventory.count(ITEMS.turnip.id)).toBe(1);
    expect(live.care.hunger).toBe(75);
    inv.tab = 'seeds';
    ui.handleKey('Enter');
    expect(live.selectedCrop).toBe('carrot');
    expect(ui.capturing).toBe(false); // choosing a seed returns to play
  });

  it('pointer: a slot selects, pressing it again acts, X closes, the menu bar opens the bag, a press outside closes', () => {
    const { ui, inv, live, draw } = setup();
    live.inventory.add(ITEMS.stick.id, 1);
    live.inventory.add(ITEMS.axe.id, 1);
    draw();
    const bagButton = ui.regions[1]; // after USE
    expect(ui.handlePointer(...centre(bagButton))).toBe(true);
    expect(ui.capturing).toBe(true);
    draw();
    // Slots are the hit regions of SLOT size after the tabs; find the axe's.
    const list = bagEntries(ui, 'all');
    const axeIndex = list.findIndex((e) => e.item === ITEMS.axe.id);
    const slots = ui.regions.filter((r) => r.w === r.h && r.w === 18 * ui.scale);
    expect(slots.length).toBe(list.length);
    ui.handlePointer(...centre(slots[axeIndex]));
    expect(inv.index).toBe(axeIndex);
    expect(live.equipped).toBeNull();
    draw();
    ui.handlePointer(...centre(ui.regions.filter((r) => r.w === r.h && r.w === 18 * ui.scale)[axeIndex]));
    expect(live.equipped).toBe(ITEMS.axe.id);
    draw();
    const close = ui.regions.find((r) => r.w === 12 * ui.scale)!;
    ui.handlePointer(...centre(close));
    expect(ui.capturing).toBe(false);
    ui.handleKey('KeyI');
    draw();
    expect(ui.handlePointer(1, 1)).toBe(true);
    expect(ui.capturing).toBe(false);
  });

  it('the panel fits the view at a whole scale, from phone to desktop', () => {
    const { ui } = setup();
    for (const [w, h] of [[360, 640], [691, 773], [960, 540], [1920, 1080]]) {
      const s = ui.scaleFor(w, h);
      expect(Number.isInteger(s)).toBe(true);
      expect(PANEL_W * s).toBeLessThanOrEqual(Math.max(w, PANEL_W));
      expect(PANEL_H * s).toBeLessThanOrEqual(Math.max(h, PANEL_H));
    }
  });

  it('the bag shows each stack once, by category, and actions match the item', () => {
    const { ui, live } = setup();
    for (const d of ALL_ITEMS) live.inventory.add(d.id, 2);
    const all = bagEntries(ui, 'all');
    expect(all.length).toBe(live.inventory.entries().length);
    expect(new Set(all.map((e) => e.item)).size).toBe(all.length);
    const byTab = MENU_CATEGORIES.reduce((n, c) => n + bagEntries(ui, c).length, 0);
    expect(byTab).toBe(all.length);
    expect(primaryAction(ui, ITEMS.axe.id)?.label).toBe('Equip');
    expect(primaryAction(ui, ITEMS.turnip.id)?.label).toBe('Feed Blobbi');
    expect(primaryAction(ui, ITEMS.seed.id)?.label).toBe('Plant these');
    expect(primaryAction(ui, ITEMS.wood.id)).toBeNull();
  });
});

describe('touch: tap to walk and the USE button', () => {
  it('a tapped point is walked to along a path (autonomy off too); movement keys still take over', () => {
    const { live, ui, draw } = setup();
    const start = { x: live.blobbi.x, y: live.blobbi.y };
    // A reachable point a little way off.
    const target = live.collision.nearestFree(start.x + 40, start.y + 20, live.blobbi.footRx, live.blobbi.footRy)!;
    expect(live.walkTo(target.x, target.y)).toBe(true);
    for (let i = 0; i < 60 * 6 && live.brain.state === 'goto'; i++) live.update(1 / 60, { up: false, down: false, left: false, right: false, interact: false, plant: false });
    expect(Math.hypot(live.blobbi.x - target.x, live.blobbi.y - target.y)).toBeLessThan(6);
    expect(live.brain.state).toBe('manual'); // arrived: autonomy waits a moment
    live.walkTo(start.x, start.y);
    live.update(1 / 60, { up: false, down: false, left: true, right: false, interact: false, plant: false });
    expect(live.brain.state).toBe('manual');
    // The USE button calls the hook (the playground presses E with it).
    let used = 0;
    ui.onUse = () => used++;
    draw();
    const use = ui.regions[0];
    ui.handlePointer(use.x + 1, use.y + 1);
    expect(used).toBe(1);
  });
});
