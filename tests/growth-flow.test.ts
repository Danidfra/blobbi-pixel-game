/**
 * THE GROWTH BUTTON, END TO END. The procedural growth functions are tested elsewhere (growth.test.ts,
 * whale-world.test.ts); this file presses the real growth panel button with the pointer, the way a player does,
 * and follows it all the way to the world on screen: the stage is saved, the world is rebuilt from the save, new
 * land is painted by the renderer, it is walkable and reachable, nothing that existed moves, the reveal plays,
 * and a reload comes back grown. For the turtle, the manta and the whale, through all three stages.
 *
 * Regression: a press on the muted NOT READY YET button (or anywhere in a panel that missed a control) used to
 * close the panel silently, so "pressing Growth" appeared to do nothing at all.
 */
import { DAY_SECONDS } from '../src/game/daylight';
import { describe, expect, it } from 'vitest';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { growLiveIsland, rebuildFromSave } from '../src/sim/regrow';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { memoryStore, type KeyValueStore } from '../src/game/persistence';
import { QUESTS } from '../src/game/objectives';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { GameUI, PANEL_W } from '../src/ui/game-ui';
import { GrowthScreen, notReadyMessage } from '../src/ui/screens/growth';
import { devGrowthAllowed } from '../src/dev/dev-tools';
import { WALKABLE, isLandClass, type WorldDescription } from '../src/world/types';
import { hash32 } from '../src/core/rng';
import { ITEMS } from '../src/game/items';
import { findBuildSpot } from '../src/dev/scripted-play';

const palette = paletteFor('cozy');
const sig = (x: ArrayLike<number>) => hash32(Array.from(x).join(','));
const landOf = (w: WorldDescription) => w.terrain.cls.reduce((n, c) => n + (isLandClass(c) ? 1 : 0), 0);
const centre = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2] as const;

const WORLDS: [string, () => WorldDescription][] = [
  ['turtle', () => generateTurtleWorld('flow-test-turtle', { turtleSeed: 'turtle-5' })],
  ['manta', () => generateMantaWorld('flow-test-manta', { carrierSeed: 'manta-test' })],
  ['whale', () => generateWhaleWorld('flow-test-whale', { carrierSeed: 'whale-test' })],
];

/** The playground's wiring, without the DOM: one current world, the panel, and onGrow → growLiveIsland. */
function harness(base: WorldDescription, store: KeyValueStore) {
  const h = { live: new LiveWorld(base, 'blobbi-9', 16, { store }) };
  h.live.brain.enabled = false;
  const ui = new GameUI(() => h.live, () => palette);
  const growth = new GrowthScreen();
  ui.register(growth);
  growth.onGrow = () => {
    const r = growLiveIsland(h.live, { base: h.live.baseWorld, blobbi: 'blobbi-9', blobbiSize: 16, store });
    if (!r.grown) {
      ui.say(r.reason, false);
      return false;
    }
    h.live = r.live;
    h.live.brain.enabled = false;
    return true;
  };
  const screen = new PixelBuffer(960, 540);
  const draw = () => ui.render(screen, 0);
  /** The growth button: the one hit region as wide as the panel's left column (150 panel pixels). */
  const button = () => {
    draw();
    const b = ui.regions.find((r) => r.w === 150 * ui.scale && r.h === 11 * ui.scale);
    return b ?? null;
  };
  return { h, ui, growth, draw, button, screen };
}

/** Everything the next stage asks, as a player would have earned it (lifetime counts, quests, finds, bond). */
function meetRequirements(live: LiveWorld): void {
  Object.assign(live.tally, { fed: 70, harvested: 45, built: 15, decorations: 5, crafted: 30, cooked: 20, talked: 12 });
  for (const q of QUESTS) live.objectives.completed[q.id] ??= live.worldTime;
  live.carrier.bond = Math.max(live.carrier.bond, 400);
  for (const d of live.discoveries.slice(0, 9)) live.found.add(d.id);
  for (const p of live.places) live.visited.add(p.id);
  live.timeOffset += 13 * DAY_SECONDS;
}

describe('the growth button grows the island on screen (button → save → rebuild → render)', () => {
  for (const [species, make] of WORLDS) {
    it(`${species}: all four stages from the panel, with the pointer, then a reload`, () => {
      const base = make();
      const store = memoryStore();
      const { h, ui, button } = harness(base, store);
      const firstObjects = JSON.stringify(base.objects);
      const spot = { x: h.live.blobbi.x, y: h.live.blobbi.y };
      meetRequirements(h.live);
      h.live.save();
      let prev = h.live.world;
      for (let stage = 1; stage <= 4; stage++) {
        meetRequirements(h.live); // the new land's places explored too
        expect(h.live.growthReadiness().ready, `stage ${stage} ready`).toBe(true);
        const old = h.live;
        const before = new LiveRenderer(old).staticLayer.data.slice();
        expect(ui.handleKey('KeyL')).toBe(true);
        expect(ui.screen?.id).toBe('growth');
        // First press asks, second press grows (the button reads SURE? ENTER TO GROW in between).
        const b1 = button();
        expect(b1, 'the growth button is pressable').not.toBeNull();
        ui.handlePointer(...centre(b1!));
        expect(old.growth.stage).toBe(stage - 1);
        expect(ui.screen?.id).toBe('growth');
        ui.handlePointer(...centre(button()!));
        // The world was replaced by one rebuilt from the save, at the new stage; the panel closed.
        expect(h.live).not.toBe(old);
        expect(ui.screen).toBeNull();
        expect(h.live.growth.stage).toBe(stage);
        expect(h.live.world.growth!.stage).toBe(stage);
        // New land: more land pixels, and the renderer paints the new stage's pixels differently.
        expect(landOf(h.live.world)).toBeGreaterThan(landOf(prev));
        const born = h.live.world.growth!.bornAt;
        const after = new LiveRenderer(h.live);
        let changed = 0, bornHere = 0;
        for (let i = 0; i < born.length; i++)
          if (born[i] === stage) {
            bornHere++;
            if (after.staticLayer.data[i] !== before[i]) changed++;
          }
        expect(bornHere).toBeGreaterThan(1000);
        expect(changed / bornHere).toBeGreaterThan(0.95);
        // The reveal plays from the stage that was on screen, over exactly this stage's land.
        expect(h.live.reveal).not.toBeNull();
        expect(h.live.reveal!.fromStage).toBe(stage - 1);
        expect(h.live.reveal!.pixels.length).toBe(bornHere);
        // When the reveal has spread, the new land is lit (and the renderer paints it lighter), then it fades.
        const shown = new LiveRenderer(h.live);
        h.live.clock.time = h.live.reveal!.start + 0.6 + h.live.reveal!.duration + 0.01;
        (h.live as unknown as { stepReveal: () => void }).stepReveal();
        expect(h.live.reveal).toBeNull();
        expect(h.live.revealGlowLevel()).toBeGreaterThan(0.9);
        shown.render(64, 64, 0, 0, h.live.clock.time, DEFAULT_LIVE_OPTIONS);
        const k0 = h.live.revealGlow!.pixels[0];
        expect(shown.staticLayer.data[k0]).not.toBe(after.staticLayer.data[k0]);
        h.live.clock.time += 10;
        expect(h.live.revealGlowLevel()).toBe(0);
        shown.render(64, 64, 0, 0, h.live.clock.time, DEFAULT_LIVE_OPTIONS);
        expect(shown.staticLayer.data[k0]).toBe(after.staticLayer.data[k0]);
        // Nothing moved: base objects, the Blobbi's spot, the base land.
        expect(JSON.stringify(h.live.world.objects.slice(0, base.objects.length))).toBe(firstObjects);
        expect([h.live.blobbi.x, h.live.blobbi.y]).toEqual([spot.x, spot.y]);
        for (let i = 0; i < prev.terrain.cls.length; i++) if (isLandClass(prev.terrain.cls[i])) expect(isLandClass(h.live.world.terrain.cls[i])).toBe(true);
        // The new land is walkable and reachable from the hub on the game's own navigation.
        const reach = (h.live as unknown as { reachability: (n: unknown, at: { x: number; y: number }) => (x: number, y: number) => boolean }).reachability(h.live.islandNav, h.live.world.hubs[0]);
        const W = h.live.world.terrain.width;
        let cells = 0, reached = 0;
        for (let i = 0; i < born.length; i += 37) {
          if (born[i] !== stage || !WALKABLE.has(h.live.world.terrain.cls[i])) continue;
          const x = i % W, y = (i / W) | 0;
          if (!h.live.collision.canStand(x, y, h.live.blobbi.footRx, h.live.blobbi.footRy)) continue;
          cells++;
          if (reach(x, y)) reached++;
        }
        expect(cells).toBeGreaterThan(10);
        expect(reached / cells, `stage ${stage} new land reachable`).toBeGreaterThan(0.97);
        // A reload (a fresh LiveWorld on the same store) stands on the same grown world.
        const reloaded = new LiveWorld(base, 'blobbi-9', 16, { store });
        expect(reloaded.growth.stage).toBe(stage);
        expect(sig(reloaded.world.terrain.cls)).toBe(sig(h.live.world.terrain.cls));
        expect(reloaded.world.objects.length).toBe(h.live.world.objects.length);
        prev = h.live.world;
      }
      // At stage 3 the panel says so and offers no growth button.
      ui.handleKey('KeyL');
      expect(button()).toBeNull();
    });
  }
});

describe('the growth panel never silently does nothing', () => {
  it('not ready: a press on the muted button keeps the panel open and says what is missing; nothing grows', () => {
    const base = WORLDS[2][1]();
    const store = memoryStore();
    const { h, ui, button } = harness(base, store);
    ui.handleKey('KeyL');
    const b = button();
    expect(b, 'the muted button still takes a press').not.toBeNull();
    ui.handlePointer(...centre(b!));
    expect(ui.screen?.id).toBe('growth');
    expect(ui.message?.text).toMatch(/^not ready yet: \d+ still needed/);
    expect(ui.message?.text).toBe(notReadyMessage(h.live.growthReadiness()));
    expect(h.live.growth.stage).toBe(0);
    expect(h.live.world.growth).toBeUndefined();
  });

  it('a press inside any panel that misses every control keeps it open; a press outside closes it', () => {
    const { ui, draw } = harness(WORLDS[0][1](), memoryStore());
    ui.handleKey('KeyL');
    draw();
    // The panel's corner X sits at (PANEL_W - 13, 1) in panel pixels: from it, the panel's origin on screen.
    const close = ui.regions.find((r) => r.w === 12 * ui.scale)!;
    const o = { x: close.x - (PANEL_W - 13) * ui.scale, y: close.y - ui.scale, scale: ui.scale };
    // The far right of the panel's lowest row is empty in the growth panel.
    expect(ui.handlePointer(o.x + (PANEL_W - 6) * o.scale, o.y + 140 * o.scale)).toBe(true);
    expect(ui.screen?.id).toBe('growth');
    expect(ui.handlePointer(1, 1)).toBe(true);
    expect(ui.screen).toBeNull();
  });

  it('inside a building: the panel stays open with the reason, and nothing grows', () => {
    const base = WORLDS[0][1]();
    const store = memoryStore();
    const { h, ui, button } = harness(base, store);
    for (const [it, n] of [[ITEMS.wood.id, 40], [ITEMS.stone.id, 40], [ITEMS.stick.id, 40]] as const) h.live.inventory.add(it, n);
    meetRequirements(h.live);
    expect(findBuildSpot(h.live, 'shelter')).toBe(true);
    h.live.setBuildMode('shelter');
    const shelter = h.live.placeBuilding()!;
    shelter.placedAt -= 1e6;
    h.live.enterInterior(shelter);
    expect(h.live.interior).not.toBeNull();
    ui.handleKey('KeyL');
    ui.handlePointer(...centre(button()!));
    ui.handlePointer(...centre(button()!));
    expect(ui.screen?.id).toBe('growth');
    expect(ui.message?.text).toMatch(/step outside first/);
    expect(h.live.growth.stage).toBe(0);
  });
});

describe('dev stage changes are visible too', () => {
  it('a jump of several stages reveals all of the new land, from the stage that was on screen', () => {
    const base = WORLDS[2][1]();
    const store = memoryStore();
    const live = new LiveWorld(base, 'blobbi-9', 16, { store });
    live.devSetGrowthStage(3);
    const next = rebuildFromSave(live, { base, blobbi: 'blobbi-9', blobbiSize: 16, store, reveal: true });
    const g = next.world.growth!;
    expect(next.reveal!.fromStage).toBe(0);
    const grown = g.bornAt.reduce((n, b) => n + (b > 0 ? 1 : 0), 0);
    expect(next.reveal!.pixels.length).toBe(grown);
    expect(next.reveal!.from).toBe(g.objectsAt[0]);
    expect(next.reveal!.to).toBe(g.objectsAt[3]);
    // Going down (dev only) never plays a reveal.
    next.devSetGrowthStage(1);
    const down = rebuildFromSave(next, { base, blobbi: 'blobbi-9', blobbiSize: 16, store, reveal: true });
    expect(down.growth.stage).toBe(1);
    expect(down.reveal).toBeNull();
  });

  it('dev growth buttons act on test worlds only (the refusal is now shown on the game view)', () => {
    expect(devGrowthAllowed('m5-test-world')).toBe(true);
    expect(devGrowthAllowed('world-k3j9')).toBe(false);
  });
});
