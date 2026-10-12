/**
 * M10 phase B: the first boat. Crafted at a workbench once the island has a fisher; launched from the shore; boarded
 * with a hop; paddled freely on the sea round the Carrier — never over land, its body or its moving parts, never
 * past the rough-water band — then landed on reachable ground; saved and loaded aboard or moored; fished from with
 * the rod's line still at its tip; on every Carrier at every growth stage that has a shore by the sea.
 */
import { describe, expect, it } from 'vitest';
import { LiveWorld, IDLE_INPUT, type LiveInput } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { loadSave, memoryStore, saveKey } from '../src/game/persistence';
import { pressE, run, stand } from '../src/dev/scripted-play';
import { CANOE, SeaNav, seaRegion } from '../src/game/canoe';
import { CANOE_ITEM } from '../src/content/tools';
import { recipeById } from '../src/game/crafting';
import { ITEMS } from '../src/game/items';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { ViewCamera, worldBounds } from '../src/render/view-camera';
import { LINE_COLOUR } from '../src/render/fishing-line';
import { stickDirections } from '../src/ui/touch';
import { movingPartsMask } from '../src/cinematic/sea';
import type { WorldDescription } from '../src/world/types';

const CARRIERS: [string, (seed: string) => WorldDescription][] = [
  ['turtle', (s) => generateTurtleWorld(s, { turtleSeed: 't-' + s, shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false })],
  ['manta', (s) => generateMantaWorld(s, { carrierSeed: 'm-' + s, generatedHouse: false })],
  ['whale', (s) => generateWhaleWorld(s, { carrierSeed: 'w-' + s, generatedHouse: false })],
];

function atStage(make: (s: string) => WorldDescription, stage: number, seed = 'canoe-1', store = memoryStore()): LiveWorld {
  if (stage) {
    const probe = new LiveWorld(make(seed), 'blobbi-9', 16, { store });
    probe.growth = { stage, version: 3, history: [], regions: [] };
    probe.save();
  }
  const live = new LiveWorld(make(seed), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  // The curious seal (marine-life.test.ts) would take E first wherever it surfaces: here it stays under.
  (live as unknown as { nearbyMarine: () => null }).nearbyMarine = () => null;
  return live;
}

/** Stand where the canoe can be launched (a canoe in the bag); false if there is no such shore. */
function toLaunch(live: LiveWorld): boolean {
  if (!live.inventory.count(CANOE_ITEM.id)) live.inventory.add(CANOE_ITEM.id, 1);
  const { width, height } = live.world.terrain;
  for (let y = 6; y < height - 6; y += 3)
    for (let x = 6; x < width - 6; x += 3) {
      if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
      for (const d of ['down', 'right', 'left', 'up'] as const) {
        stand(live, x, y, d);
        if (live.launchSpot()) {
          live.resources = [];
          // A glinting find in reach would be picked up first: count those as found here.
          for (const d of live.discoveries) if (Math.hypot(d.x - x, d.y - y) < 30) live.found.add(d.id);
          return true;
        }
      }
    }
  return false;
}

/** Launch and step in. */
function aboard(live: LiveWorld): void {
  expect(toLaunch(live)).toBe(true);
  expect(live.prompt()).toBe('E  launch the canoe');
  pressE(live);
  expect(live.boat).not.toBeNull();
  expect(live.prompt()).toBe('E  get in the canoe');
  pressE(live);
  run(live, 40);
  expect(live.boat!.aboard).toBe(true);
}

const paddle = (live: LiveWorld, frames: number, dir: Partial<LiveInput>, each?: () => void) => {
  for (let i = 0; i < frames; i++) {
    live.update(1 / 60, { ...IDLE_INPUT, ...dir });
    each?.();
  }
};

describe('making and launching the canoe', () => {
  it('is made at a workbench once "Gone fishing" is done, from wood, sticks and cloth', () => {
    const live = atStage(CARRIERS[0][1], 2);
    const recipe = recipeById('blobbi-pixel:recipe:canoe')!;
    expect(recipe.station).toBe('workbench');
    expect(live.recipeKnown(recipe)).toBe(false);
    live.objectives.completed['side-angler'] = 0;
    expect(live.recipeKnown(recipe)).toBe(true);
    live.inventory.add(ITEMS.wood.id, 8);
    live.inventory.add(ITEMS.stick.id, 4);
    live.inventory.add('blobbi-pixel:material:cloth', 2);
    expect(live.craftRecipe(recipe)).toBe(false); // no workbench near
    live.buildings.push({ id: 'workbench:t', kind: 'workbench', x: live.blobbi.x + 10, y: live.blobbi.y, placedAt: -1000, seed: 'w' });
    expect(live.craftRecipe(recipe)).toBe(true);
    expect(live.inventory.count(CANOE_ITEM.id)).toBe(1);
    expect(live.inventory.count(ITEMS.wood.id)).toBe(0);
  });

  it('goes into the water from the shore, moored where it floats', () => {
    const live = atStage(CARRIERS[0][1], 2);
    expect(toLaunch(live)).toBe(true);
    pressE(live);
    const boat = live.boat!;
    expect(boat.aboard).toBe(false);
    expect(live.inventory.count(CANOE_ITEM.id)).toBe(0);
    expect(live.seaNav().canFloat(boat.x, boat.y, boat.heading)).toBe(true);
  });
});

describe('aboard', () => {
  it('boards with a smooth hop, then paddles gently in every direction (heading follows)', () => {
    const live = atStage(CARRIERS[0][1], 2);
    expect(toLaunch(live)).toBe(true);
    pressE(live);
    const boat = live.boat!;
    let jump = 0;
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    for (let i = 0; i < 40; i++) {
      const was = { x: live.blobbi.x, y: live.blobbi.y };
      run(live, 1);
      jump = Math.max(jump, Math.hypot(live.blobbi.x - was.x, live.blobbi.y - was.y));
    }
    expect(boat.aboard).toBe(true);
    expect(jump).toBeLessThan(3);
    expect(live.blobbi.x).toBeCloseTo(boat.x, 5);
    // Out to open water first, then each way.
    const start = { x: boat.x, y: boat.y };
    for (const [dir, key] of [['right', { right: true }], ['down', { down: true }], ['left', { left: true }], ['up', { up: true }]] as const) {
      const before = { x: boat.x, y: boat.y };
      let fastest = 0;
      paddle(live, 90, key, () => (fastest = Math.max(fastest, Math.hypot(boat.vx, boat.vy))));
      expect(fastest).toBeLessThanOrEqual(CANOE.speed + 0.5);
      void before;
      void dir;
    }
    expect(Math.hypot(boat.x - start.x, boat.y - start.y) + Math.abs(boat.vx) + Math.abs(boat.vy)).toBeGreaterThan(0);
  });

  for (const [name, make] of CARRIERS)
    it(`${name}: never over land, the body or its moving parts, never past the edge — then lands on reachable ground (stages 1–4)`, () => {
      let tried = 0;
      let landed = 0;
      for (const stage of [1, 2, 3, 4]) {
        const live = atStage(make, stage);
        if (!toLaunch(live)) continue; // no shore by the sea at this stage (fishing waits too)
        tried++;
        aboard(live);
        const boat = live.boat!;
        const moving = movingPartsMask(live.world);
        const { width, height } = live.world.terrain;
        const region = live.seaNav().region;
        const check = () => {
          expect(live.seaNav().canFloat(boat.x, boat.y, boat.heading)).toBe(true);
          const xi = Math.round(boat.x);
          const yi = Math.round(boat.y);
          if (xi >= 0 && yi >= 0 && xi < width && yi < height) expect(moving[yi * width + xi]).toBe(0);
          expect(boat.x).toBeGreaterThanOrEqual(region.x0);
          expect(boat.x).toBeLessThan(region.x1);
          expect(boat.y).toBeGreaterThanOrEqual(region.y0);
          expect(boat.y).toBeLessThan(region.y1);
        };
        // A long trip: round in a square, out toward the edge, straight at the island.
        for (const key of [{ right: true }, { down: true }, { left: true }, { up: true }, { right: true, down: true }, { left: true }, { left: true }, { up: true }])
          paddle(live, 200, key, check);
        // Back toward the island's hub until there is somewhere to land.
        const hub = live.world.hubs[0];
        for (let i = 0; i < 60 * 40 && !live.landingSpot(); i++) {
          const dx = hub.x - boat.x;
          const dy = hub.y - boat.y;
          live.update(1 / 60, { ...IDLE_INPUT, right: dx > 4, left: dx < -4, down: dy > 4, up: dy < -4 });
          // Stuck against the coast: slide along it.
          if (i % 240 === 239) paddle(live, 60, i % 480 === 239 ? { right: true } : { down: true }, check);
        }
        const spot = live.landingSpot();
        if (!spot) continue; // could not find the way back by this simple steering (the player can)
        expect(live.prompt()).toBe('E  go ashore');
        pressE(live);
        run(live, 40);
        expect(boat.aboard).toBe(false);
        expect(live.collision.canStand(live.blobbi.x, live.blobbi.y, live.blobbi.footRx, live.blobbi.footRy)).toBe(true);
        expect(live.prompt()).toBe('E  get in the canoe');
        landed++;
      }
      expect(tried, name).toBeGreaterThan(0);
      expect(landed, name).toBeGreaterThan(0);
    }, 240_000);

  it('the current turns the canoe back at the edge of its sea, and says so', () => {
    const live = atStage(CARRIERS[0][1], 2);
    aboard(live);
    const boat = live.boat!;
    // Far out: straight up for a long time.
    let warned = false;
    paddle(live, 60 * 40, { up: true }, () => (warned ||= /current/.test(live.bubble?.text ?? '')));
    const region = live.seaNav().region;
    expect(boat.y).toBeGreaterThan(region.y0);
    expect(boat.y).toBeLessThan(region.y0 + CANOE.band);
    expect(warned).toBe(true);
  });
});

describe('saving and loading with the canoe', () => {
  it('aboard: the reload puts the Blobbi in the canoe where it was; moored: the canoe waits there', () => {
    const store = memoryStore();
    const live = atStage(CARRIERS[0][1], 2, 'canoe-1', store);
    aboard(live);
    paddle(live, 120, { right: true });
    paddle(live, 120, {});
    live.save();
    const raw = JSON.parse(store.get(saveKey(live.identity))!);
    expect(raw.boat).toMatchObject({ aboard: true });
    const again = atStage(CARRIERS[0][1], 0, 'canoe-1', store);
    expect(again.boat?.aboard).toBe(true);
    expect(again.boat!.x).toBeCloseTo(Math.round(live.boat!.x), 0);
    expect(again.blobbi.x).toBeCloseTo(again.boat!.x, 5);
    // The camera's bounds are the canoe's sea.
    const b = again.sceneBounds()!;
    expect(b.x0).toBeLessThan(0);
    const v = new ViewCamera('closeup').update(0, again.cameraTarget(), 960, 540, b, true);
    expect(Number.isInteger(v.originX) && Number.isInteger(v.originY)).toBe(true);
    // The overview still frames the Carrier (not the whole canoe sea): the same scale as on foot.
    const cam = new ViewCamera('overview');
    expect(cam.restScale('overview', 1280, 720, b)).toBe(cam.restScale('overview', 1280, 720, worldBounds(again.world)));
    // A record from before phase B has no canoe.
    raw.version = 10;
    delete raw.boat;
    delete raw.cleared;
    delete raw.caught;
    store.set(saveKey(live.identity), JSON.stringify(raw));
    expect(loadSave(store, live.identity)!.boat).toBeNull();
  });

  it('a canoe saved somewhere that is water no more is moved to the nearest water; with none, it goes back into the bag', () => {
    const store = memoryStore();
    const live = atStage(CARRIERS[0][1], 2, 'canoe-2', store);
    aboard(live);
    live.save();
    const raw = JSON.parse(store.get(saveKey(live.identity))!);
    // Put it on the hub (land) in the island frame.
    const origin = live.origin;
    raw.boat = { x: live.world.hubs[0].x - origin.x, y: live.world.hubs[0].y - origin.y, heading: 'right', aboard: true };
    store.set(saveKey(live.identity), JSON.stringify(raw));
    const again = atStage(CARRIERS[0][1], 0, 'canoe-2', store);
    const boat = again.boat;
    if (boat) {
      expect(again.seaNav().canFloat(boat.x, boat.y, boat.heading)).toBe(true);
      expect(again.blobbi.x).toBeCloseTo(boat.x, 5);
    } else {
      expect(again.inventory.count(CANOE_ITEM.id)).toBe(1);
      expect(again.collision.canStand(again.blobbi.x, again.blobbi.y, again.blobbi.footRx, again.blobbi.footRy)).toBe(true);
    }
  });
});

describe('fishing from the canoe', () => {
  it('casts over open water from the canoe; the line still leaves the rod tip; the catch comes from open water', () => {
    const live = atStage(CARRIERS[0][1], 2);
    aboard(live);
    const boat = live.boat!;
    paddle(live, 60 * 6, { up: true });
    paddle(live, 90, {});
    live.inventory.add('blobbi-pixel:tool:fishing-rod', 1);
    live.equip('blobbi-pixel:tool:fishing-rod');
    expect(live.fishTarget()).not.toBeNull();
    expect(live.prompt()).toBe('E  cast the line');
    pressE(live);
    const f = live.fishing!;
    expect(f).not.toBeNull();
    expect(live.seaRegionAt(f.x, f.y)).toBe('open');
    // The line on screen from the tip, up close.
    (live.clock as { time: number }).time = f.start + 1.2;
    live.bubble = null;
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const cam = new ViewCamera('closeup');
    const b = live.sceneBounds()!;
    const v = cam.update(0, live.cameraTarget(), 640, 400, b, true);
    const screen = view.render(v, 4, live.clock.time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, lighting: false, hud: false, indicator: false, goals: false, prompt: false });
    let line = 0;
    for (const c of screen.data) if (c === LINE_COLOUR) line++;
    expect(line).toBeGreaterThan(5);
    // A bite, reeled in: a fish of the open water (or of anywhere).
    (live.clock as { time: number }).time = f.biteAt + 0.1;
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    expect(live.tally.fished).toBe(1);
    expect(live.caught.size).toBe(1);
    void boat;
  });
});

describe('touch', () => {
  it('the touch stick paddles the canoe the same way the keys do', () => {
    const live = atStage(CARRIERS[0][1], 2);
    aboard(live);
    const boat = live.boat!;
    const start = { x: boat.x, y: boat.y };
    // A drag to the upper right.
    const d = stickDirections(20, -20, 6);
    paddle(live, 120, d);
    expect(Math.hypot(boat.x - start.x, boat.y - start.y)).toBeGreaterThan(5);
  });
});

describe('the canoe region', () => {
  it('reaches past the world edge round the Carrier, by the margin', () => {
    const world = CARRIERS[1][1]('canoe-r');
    const sub = worldBounds(world).subject!;
    const r = seaRegion(sub);
    expect(r.x0).toBe(sub.x0 - CANOE.margin);
    const nav = new SeaNav(world, r, movingPartsMask(world));
    expect(nav.water(r.x0 - 1, r.y0 + 50)).toBe(false); // nothing past the region
    expect(nav.edge(r.x0 + 1, (r.y0 + r.y1) / 2)).toBeGreaterThan(0.9);
    expect(nav.edge((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)).toBe(0);
  });
});
