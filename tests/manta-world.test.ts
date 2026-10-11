import { describe, expect, it } from 'vitest';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { growWorld } from '../src/world/growth';
import { T, WALKABLE, isLandClass } from '../src/world/types';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer } from '../src/render/view-renderer';
import { ViewCamera, CAMERA_CYCLE, worldBounds } from '../src/render/view-camera';
import { memoryStore, saveKey, worldIdentity } from '../src/game/persistence';
import { parseIdentity } from '../src/game/worlds';
import { MANTA_OBSERVATIONS } from '../src/game/carrier';
import { ITEMS } from '../src/game/items';
import { PLOT_GRID } from '../src/game/farming';
import { hash32 } from '../src/core/rng';
import { findBuildSpot, stand } from '../src/dev/scripted-play';

const world = generateMantaWorld('manta-world-0');
const sig = (a: ArrayLike<number>) => hash32(Array.from(a).join(','));

describe('the manta world: generation', () => {
  it('is deterministic, has its own identity, and parses back', () => {
    const again = generateMantaWorld('manta-world-0');
    expect(sig(again.terrain.cls)).toBe(sig(world.terrain.cls));
    expect(JSON.stringify(again.objects)).toBe(JSON.stringify(world.objects));
    const id = worldIdentity(world);
    expect(id).toMatch(/kind=manta\|carrier=manta-world-0\|1024x768/);
    const p = parseIdentity(id)!;
    expect(p.kind).toBe('manta');
    expect(p.carrierSeed).toBe('manta-world-0');
    expect(generateMantaWorld('manta-world-1', { carrierSeed: 'other' }).creature!.seed).toBe('other');
  });

  it('has real land with a beach, a body that is not walkable, and the sea round it', () => {
    const { cls } = world.terrain;
    let land = 0;
    let sand = 0;
    let skin = 0;
    for (const c of cls) {
      if (isLandClass(c) && c !== T.SKIN) land++;
      if (c === T.SAND) sand++;
      if (c === T.SKIN) skin++;
    }
    expect(land).toBeGreaterThan(45000);
    expect(sand).toBeGreaterThan(500);
    expect(skin).toBeGreaterThan(30000);
    expect(WALKABLE.has(T.SKIN)).toBe(false);
    expect(world.turtle).toBeUndefined();
    expect(world.creature!.species).toBe('manta');
  });

  it('turtle worlds are untouched by it', () => {
    expect(worldIdentity(generateTurtleWorld('turtle-0'))).toBe('seed=turtle-0|kind=turtle|turtle=turtle-0|variant=2|704x576|scale=1.6|palette=cozy|density=1|islands=1');
  });
});

describe('the manta world: playable', () => {
  const live = new LiveWorld(world, 'blobbi-9', 16, { store: memoryStore() });
  live.brain.enabled = false;

  it('the Blobbi stands on land and can walk to most of it', () => {
    expect(live.collision.canStand(live.blobbi.x, live.blobbi.y, live.blobbi.footRx, live.blobbi.footRy)).toBe(true);
    // Most walkable ground is reachable on foot from the hub.
    const { width, cls } = world.terrain;
    let walkable = 0;
    let reached = 0;
    const reach = (live as unknown as { reachability: (n: unknown, h: { x: number; y: number }) => (x: number, y: number) => boolean }).reachability(live.islandNav, world.hubs[0]);
    for (let i = 0; i < cls.length; i += 37) {
      if (!WALKABLE.has(cls[i])) continue;
      const x = i % width;
      const y = (i / width) | 0;
      if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
      walkable++;
      if (reach(x, y)) reached++;
    }
    expect(reached / walkable).toBeGreaterThan(0.9);
    const x0 = live.blobbi.x;
    for (let i = 0; i < 60; i++) live.update(1 / 60, { ...IDLE_INPUT, right: true });
    expect(live.blobbi.x).not.toBe(x0);
  });

  it('has resources, discoveries, places and a spot to listen to the Carrier (with manta observations)', () => {
    expect(live.allResources.length).toBeGreaterThan(20);
    expect(live.discoveries.length).toBeGreaterThanOrEqual(5);
    expect(live.places.some((p) => p.id === 'head')).toBe(true);
    expect(live.listenSpot).not.toBeNull();
    stand(live, live.listenSpot!.x, live.listenSpot!.y, 'down');
    live.resources = live.resources.filter((n) => Math.hypot(n.x - live.listenSpot!.x, n.y - live.listenSpot!.y) > 20);
    expect(live.nearCarrier()).toBe(true);
    expect(live.species).toBe('manta');
    expect(live.observeCarrier()).toBe(MANTA_OBSERVATIONS[0].id);
  });

  it('building, housing and farming work', () => {
    const l = new LiveWorld(world, 'blobbi-9', 16, { store: memoryStore() });
    l.brain.enabled = false;
    for (const it of [ITEMS.wood.id, ITEMS.stone.id, ITEMS.stick.id]) l.inventory.add(it, 60);
    for (const q of ['arrive', 'meet', 'gather', 'axe', 'wood']) l.objectives.completed[q] = 0;
    expect(findBuildSpot(l, 'shelter')).toBe(true);
    l.setBuildMode('shelter');
    const shelter = l.placeBuilding();
    expect(shelter).not.toBeNull();
    shelter!.placedAt -= 1e6; // finished
    expect(l.enterInterior(shelter!)).toBe(true);
    l.exitInterior();
    // A tillable cell somewhere on the island.
    const { width, cls } = world.terrain;
    let ok = 0;
    for (let i = 0; i < cls.length && !ok; i += 211) {
      if (cls[i] !== T.GRASS) continue;
      const x = i % width;
      const y = (i / width) | 0;
      if (l.plotCheck({ gx: Math.floor(x / PLOT_GRID), gy: Math.floor(y / PLOT_GRID) }).ok) ok++;
    }
    expect(ok).toBeGreaterThan(0);
  });

  it('saves and reloads as a manta world', () => {
    const store = memoryStore();
    const a = new LiveWorld(world, 'blobbi-9', 16, { store });
    a.inventory.add(ITEMS.wood.id, 3);
    a.save();
    const raw = JSON.parse(store.get(saveKey(a.identity))!);
    expect(raw.species).toBe('manta');
    const b = new LiveWorld(generateMantaWorld('manta-world-0'), 'blobbi-9', 16, { store });
    expect(b.inventory.count(ITEMS.wood.id)).toBe(3);
  });

  it('renders in every camera mode, wings and all', () => {
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const bounds = worldBounds(world);
    for (const mode of CAMERA_CYCLE) {
      const cam = new ViewCamera(mode);
      const v = cam.update(0, live.cameraTarget(), 480, 270, bounds, true);
      const f = view.render(v, cam.restScale(mode, 480, 270, bounds), 1.3, DEFAULT_LIVE_OPTIONS, { hud: false, indicator: false, uiScale: 2 });
      expect(f.width).toBe(480);
    }
    // The wing tips move between frames.
    const lr = new LiveRenderer(live);
    const a = lr.render(1024, 768, 0, 0, 0, DEFAULT_LIVE_OPTIONS).clone();
    const b = lr.render(1024, 768, 0, 0, 0.9, DEFAULT_LIVE_OPTIONS).clone();
    let changed = 0;
    for (let x = 0; x < 120; x++) for (let y = 200; y < 500; y++) if (a.get(x, y) !== b.get(x, y)) changed++;
    expect(changed).toBeGreaterThan(50);
  });
});

describe('the manta world: growth (its own geometry)', () => {
  it('grows out along the wings, and only over its back', () => {
    const grown = growWorld(world, 3);
    expect(grown.stats.landPixels).toBeGreaterThan(world.stats.landPixels * 1.2);
    for (let i = 0; i < world.terrain.cls.length; i++) {
      const b = world.terrain.cls[i];
      const c = grown.terrain.cls[i];
      if (b === c) continue;
      expect([T.SKIN, T.GRASS_EDGE, T.SAND, T.SAND_WET]).toContain(b);
      expect(isLandClass(c) || c === T.SAND).toBe(true);
    }
    // Wider, not taller: the new land's horizontal reach grows more than its vertical.
    const bounds = (w: typeof world) => {
      const { width, cls } = w.terrain;
      let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
      for (let i = 0; i < cls.length; i++) if (isLandClass(cls[i]) && cls[i] !== T.SKIN) {
        const x = i % width, y = (i / width) | 0;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      return { w: x1 - x0, h: y1 - y0 };
    };
    const b0 = bounds(world);
    const b3 = bounds(grown);
    expect(b3.w - b0.w).toBeGreaterThan((b3.h - b0.h) * 2);
  });
});
