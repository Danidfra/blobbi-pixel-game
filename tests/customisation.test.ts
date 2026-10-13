/**
 * M8 home customisation: options unlock through play, locked ones cannot be applied, the preview is only a draft
 * until APPLY, choices are saved, and they survive an upgrade.
 */
import { describe, expect, it } from 'vitest';
import { STYLE_OPTIONS, isUnlocked, optionUnlocked, unlockedCount, type StylePart, type UnlockContext } from '../src/content/home-styles';
import { LiveWorld } from '../src/sim/live-world';
import { loadSave, memoryStore } from '../src/game/persistence';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { findBuildSpot, pressE, run } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import { GameUI } from '../src/ui/game-ui';
import { HomeScreen } from '../src/ui/screens/home';
import { installCustomisation } from '../src/ui/screens/home-style';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { houseLevel } from '../src/game/buildings';

const empty: UnlockContext = { completed: {}, found: 0, tally: {}, growthStage: 0, houseLevel: 1 };

describe('style unlocks', () => {
  it('only the defaults are open at the start; every option has a way to unlock it', () => {
    for (const part of Object.keys(STYLE_OPTIONS) as StylePart[]) {
      expect(optionUnlocked(part, 0, empty)).toBe(true);
      const opts = STYLE_OPTIONS[part];
      expect(opts.length).toBeGreaterThanOrEqual(4);
      for (const o of opts) expect(o.name.length).toBeGreaterThan(0);
    }
    const start = unlockedCount(empty);
    expect(start.open).toBeLessThan(start.total / 2);
  });

  it('quests, finds, mining, growth and the house level open more', () => {
    const late: UnlockContext = { completed: Object.fromEntries(['shelter', 'home', 'enter-home', 'first-furniture', 'mystery', 'cook', 'side-cozy', 'restore', 'side-flowers'].map((q) => [q, 1])), found: 5, tally: { mined: 3, flowers: 3, crafted: 15, collected: 40, felled: 10, harvested: 3 }, growthStage: 2, houseLevel: 3 };
    const all = unlockedCount(late);
    expect(all.open).toBe(all.total);
    expect(unlockedCount({ ...empty, completed: { home: 1 } }).open).toBeGreaterThan(unlockedCount(empty).open);
    // M9: a small start: one style of every part.
    expect(unlockedCount(empty).open).toBe(Object.keys(STYLE_OPTIONS).length);
    expect(isUnlocked({ houseLevel: 3 }, { ...empty, houseLevel: 2 })).toBe(false);
  });
});

describe('customising the home in play', () => {
  function withHouse(store = memoryStore()) {
    const world = generateWhaleWorld('island-style-1', { carrierSeed: 'whale-s', generatedHouse: false });
    const live = new LiveWorld(world, 'blobbi-9', 16, { store });
    live.brain.enabled = false;
    live.inventory.add(ITEMS.wood.id, 30);
    live.inventory.add(ITEMS.stone.id, 20);
    live.inventory.add('blobbi-pixel:material:cloth', 4);
    live.objectives.completed.materials = 0;
    findBuildSpot(live, 'shelter', live.world.hubs[0], 160, 3);
    live.setBuildMode('shelter');
    pressE(live);
    run(live, 60 * 26);
    return { live, world, store };
  }

  it('refuses a locked option and changes nothing; applies an unlocked one and saves it', () => {
    const { live, world, store } = withHouse();
    const house = live.home()!;
    expect(live.setHouseLook({ roof: 2 }).ok).toBe(false); // slate blue needs a Cottage
    expect(house.look).toBeUndefined();
    // The shelter quest is done by now: terracotta is open.
    expect(live.setHouseLook({ roof: 1 })).toEqual({ ok: true, reason: null });
    expect(live.setRoomStyle({ floor: 4, wall: 0 }).ok).toBe(false); // tiles need a cooked meal
    live.objectives.completed['first-furniture'] = 1;
    live.objectives.completed.home = 1;
    expect(live.setRoomStyle({ floor: 1, wall: 1 }).ok).toBe(true);
    const again = new LiveWorld(world, 'blobbi-9', 16, { store });
    expect(again.home()!.look).toEqual({ roof: 1 });
    expect(again.interiors.get(house.id)!.style).toEqual({ floor: 1, wall: 1 });
    expect(loadSave(store, live.identity)!.buildings.find((b) => b.kind === 'shelter')!.look).toEqual({ roof: 1 });
  });

  it('the LOOK tab previews a draft: nothing changes until APPLY; REVERT forgets it', () => {
    const { live } = withHouse();
    const ui = new GameUI(() => live, () => paletteFor('cozy'));
    const home = new HomeScreen();
    installCustomisation(home);
    ui.register(home);
    ui.handleKey('Digit0');
    ui.handleKey('Tab'); // LOOK
    expect(home.tab).toBe('look');
    const screen = new PixelBuffer(960, 540);
    ui.render(screen, 1);
    ui.handleKey('ArrowRight'); // roof → terracotta (draft)
    ui.render(screen, 1.1);
    expect(live.home()!.look).toBeUndefined();
    ui.handleKey('Backspace'); // revert
    ui.handleKey('ArrowRight');
    ui.handleKey('Enter'); // apply
    expect(live.home()!.look).toEqual({ roof: 1 });
    ui.handleKey('ArrowRight'); // slate: locked
    ui.handleKey('Enter');
    expect(live.home()!.look).toEqual({ roof: 1 });
    expect(ui.message?.good).toBe(false);
  });

  it('a look survives an upgrade (default parts follow the new level)', () => {
    const { live } = withHouse();
    live.setHouseLook({ roof: 1 });
    for (const id of ['home', 'harvest']) live.objectives.completed[id] = 1;
    expect(live.upgradeHouse().ok).toBe(true);
    run(live, 60 * 22);
    expect(houseLevel(live.home()!)).toBe(2);
    expect(live.home()!.look).toEqual({ roof: 1 });
  });

  it('a style applied before (now locked) is kept and does not block changing another part', () => {
    const { live } = withHouse();
    const house = live.home()!;
    house.look = { wall: 3 }; // fieldstone, chosen in an M8 save (not unlocked under M9 rules here)
    live.interiorOf(house).style = { floor: 2, wall: 2 }; // pale planks and sage, free in M8
    expect(live.setHouseLook({ wall: 3, roof: 1 })).toEqual({ ok: true, reason: null });
    expect(house.look).toEqual({ wall: 3, roof: 1 });
    expect(live.setRoomStyle({ floor: 2, wall: 2 }).ok).toBe(true);
    expect(live.setHouseLook({ wall: 4 }).ok).toBe(false); // a new locked choice is still refused
  });

  it('T in move mode cycles only unlocked floors and walls', () => {
    const { live } = withHouse();
    const house = live.home()!;
    live.enterInterior(house);
    live.toggleManage();
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      live.restyleSelected();
      const st = live.interior!.state.style;
      seen.add(`${st.floor},${st.wall}`);
    }
    expect([...seen]).toEqual(['0,0']); // nothing else is earned yet
    live.objectives.completed['first-furniture'] = 1;
    live.objectives.completed.home = 1;
    for (let i = 0; i < 12; i++) {
      live.restyleSelected();
      const st = live.interior!.state.style;
      seen.add(`${st.floor},${st.wall}`);
    }
    expect(seen).toEqual(new Set(['0,0', '0,1', '1,0', '1,1']));
  });

  it('earning a style says so', () => {
    const { live } = withHouse();
    run(live, 25);
    live.notices.length = 0;
    live.objectives.completed['enter-home'] = live.worldTime; // the plank door
    run(live, 25);
    expect(live.notices.some((n) => n.heading === 'New home style' && /plank door/.test(n.title))).toBe(true);
  });

  it('a locked choice is previewed under a padlock and cannot be applied', () => {
    const { live } = withHouse();
    const ui = new GameUI(() => live, () => paletteFor('cozy'));
    const home = new HomeScreen();
    installCustomisation(home);
    ui.register(home);
    ui.handleKey('Digit0');
    ui.handleKey('Tab');
    ui.handleKey('ArrowDown'); // walls
    ui.handleKey('ArrowRight'); // whitewash: locked
    const screen = new PixelBuffer(960, 540);
    ui.render(screen, 1);
    const apply = ui.regions.find((r) => r.w === 60 * ui.scale)!;
    ui.handlePointer(apply.x + 2, apply.y + 2); // greyed APPLY: it only says why
    expect(ui.message?.good).toBe(false);
    expect(ui.message?.text).toMatch(/locked/);
    ui.handleKey('Enter');
    expect(live.home()!.look).toBeUndefined();
  });
});
