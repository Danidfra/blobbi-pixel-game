import { describe, expect, it } from 'vitest';
import { generateWhaleWorld, whaleCore } from '../src/carriers/whale-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateWhaleGenome, whaleAnatomy, whalePose, type WhaleAnatomy } from '../src/carriers/whale';
import { creatureParts } from '../src/carriers/creature-render';
import { CARRIER_VOICES } from '../src/audio/director';
import { SFX } from '../src/audio/sfx';
import { growWorld } from '../src/world/growth';
import { T, WALKABLE, isLandClass, type WorldDescription } from '../src/world/types';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer } from '../src/render/view-renderer';
import { ViewCamera, CAMERA_CYCLE, worldBounds } from '../src/render/view-camera';
import { loadSave, memoryStore, saveKey, worldIdentity } from '../src/game/persistence';
import { parseIdentity } from '../src/game/worlds';
import { WHALE_OBSERVATIONS, carrierFromSave } from '../src/game/carrier';
import { ITEMS } from '../src/game/items';
import { PLOT_GRID } from '../src/game/farming';
import { hash32 } from '../src/core/rng';
import { findBuildSpot, run, stand } from '../src/dev/scripted-play';
import { TitleScreen, type TitleActions } from '../src/ui/title';

const world = generateWhaleWorld('whale-world-0');
const anatomy = (w: WorldDescription): WhaleAnatomy => {
  const c = w.creature!;
  if (c.species !== 'whale') throw new Error('not a whale');
  return c.anatomy;
};
const a = anatomy(world);
const sig = (x: ArrayLike<number>) => hash32(Array.from(x).join(','));
const landBounds = (w: WorldDescription) => {
  const { width, cls } = w.terrain;
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, n = 0;
  for (let i = 0; i < cls.length; i++)
    if (isLandClass(cls[i])) {
      const x = i % width, y = (i / width) | 0;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); n++;
    }
  return { x0, x1, y0, y1, n };
};
/** Reachability from the hub on the live world's own navigation (what the game itself uses). */
const reachOf = (live: LiveWorld) => (live as unknown as { reachability: (n: unknown, h: { x: number; y: number }) => (x: number, y: number) => boolean }).reachability(live.islandNav, live.world.hubs[0]);

describe('the whale world: generation', () => {
  it('is deterministic, has its own identity, and parses back', () => {
    const again = generateWhaleWorld('whale-world-0');
    expect(sig(again.terrain.cls)).toBe(sig(world.terrain.cls));
    expect(JSON.stringify(again.objects)).toBe(JSON.stringify(world.objects));
    const id = worldIdentity(world);
    expect(id).toMatch(/kind=whale\|carrier=whale-world-0\|1280x768/);
    const p = parseIdentity(id)!;
    expect(p.kind).toBe('whale');
    expect(p.carrierSeed).toBe('whale-world-0');
    const other = generateWhaleWorld('whale-world-1', { carrierSeed: 'other' });
    expect(other.creature!.seed).toBe('other');
    expect(sig(other.terrain.cls)).not.toBe(sig(world.terrain.cls));
  });

  it('a whale: long and lying east-west, head east, fins at the shoulders, flukes beyond the tail', () => {
    expect(a.xSnout).toBeGreaterThan(a.xTail);
    const core = whaleCore(a).bounds()!;
    expect(core.w / core.h).toBeGreaterThan(2.5);
    expect(a.blowhole.x).toBeGreaterThan(world.islands[0].cx);
    for (const f of a.fins) expect(f.base.x).toBeGreaterThan(world.islands[0].cx);
    expect(a.fluke.cx).toBeLessThan(a.xTail);
    // Individuals differ in shape and look; the same seed is the same whale.
    const g = Array.from({ length: 12 }, (_, i) => generateWhaleGenome(`w${i}`));
    expect(new Set(g.map((x) => x.knuckles)).size).toBeGreaterThan(1);
    expect(new Set(g.map((x) => x.finPale)).size).toBe(2);
    expect(JSON.stringify(generateWhaleGenome('w3'))).toBe(JSON.stringify(generateWhaleGenome('w3')));
  });

  it('has real land on its back with a mossy fringe; the body is not walkable; the sea is round it', () => {
    const { width, cls } = world.terrain;
    const core = whaleCore(a);
    let land = 0, moss = 0, skin = 0, sand = 0;
    for (let i = 0; i < cls.length; i++) {
      const c = cls[i];
      if (isLandClass(c)) {
        land++;
        // All land sits on the trunk.
        if (!core.get(i % width, (i / width) | 0)) throw new Error(`land off the whale at ${i % width},${(i / width) | 0}`);
      }
      if (c === T.MOSS) moss++;
      if (c === T.SKIN) skin++;
      if (c === T.SAND || c === T.SAND_WET) sand++;
    }
    expect(land).toBeGreaterThan(35000);
    expect(moss).toBeGreaterThan(400);
    expect(sand).toBe(0); // a whale's back has no beach
    expect(skin).toBeGreaterThan(60000);
    expect(WALKABLE.has(T.SKIN)).toBe(false);
    expect(world.turtle).toBeUndefined();
    expect(world.creature!.species).toBe('whale');
    // The land lies between the blowholes and the knuckles.
    const b = landBounds(world);
    const range = world.creature!.species === 'whale' ? world.creature!.growRange : null!;
    expect(b.x0).toBeGreaterThanOrEqual(range.x0);
    expect(b.x1).toBeLessThanOrEqual(range.x1);
  });

  it('turtle and manta worlds are exactly as before (terrain, growth, resources, finds, places)', () => {
    // Pinned from the M7 checkpoint: the whale changes nothing for the other Carriers.
    const pinned: [string, WorldDescription, Record<string, number>][] = [
      ['manta', generateMantaWorld('manta-world-0'), { cls: 1106405713, obj: 487216122, g1: 1997320382, g2: 2092834270, g3: 1231291045, res: 131415956, disc: 1355341650, places: 2704039179 }],
      ['turtle', generateTurtleWorld('turtle-0'), { cls: 2744171581, obj: 2560567079, g1: -2041226977, g2: 480415723, g3: -1387412580, res: 2204241086, disc: 4074114020, places: 2605003052 }],
    ];
    for (const [, w, p] of pinned) {
      expect(sig(w.terrain.cls)).toBe(p.cls);
      expect(hash32(JSON.stringify(w.objects))).toBe(p.obj);
      for (const s of [1, 2, 3]) {
        const g = growWorld(w, s, 3);
        expect(sig(g.terrain.cls) ^ hash32(JSON.stringify(g.objects))).toBe(p[`g${s}`]);
      }
      const l = new LiveWorld(w, 'blobbi-9', 16);
      expect(hash32(JSON.stringify(l.allResources.map((n) => [n.id, n.x, n.y])))).toBe(p.res);
      expect(hash32(JSON.stringify(l.discoveries.map((d) => [d.id, d.x, d.y])))).toBe(p.disc);
      expect(hash32(JSON.stringify(l.places))).toBe(p.places);
    }
    expect(worldIdentity(generateTurtleWorld('turtle-0'))).toBe('seed=turtle-0|kind=turtle|turtle=turtle-0|variant=2|704x576|scale=1.6|palette=cozy|density=1|islands=1');
  });
});

describe('the whale world: playable', () => {
  const live = new LiveWorld(world, 'blobbi-9', 16, { store: memoryStore() });
  live.brain.enabled = false;

  it('the Blobbi stands on land, walks, and can reach most ground and every resource', () => {
    expect(live.collision.canStand(live.blobbi.x, live.blobbi.y, live.blobbi.footRx, live.blobbi.footRy)).toBe(true);
    const { width, cls } = world.terrain;
    const reach = reachOf(live);
    let walkable = 0, reached = 0;
    for (let i = 0; i < cls.length; i += 37) {
      if (!WALKABLE.has(cls[i])) continue;
      const x = i % width, y = (i / width) | 0;
      if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
      walkable++;
      if (reach(x, y)) reached++;
    }
    expect(reached / walkable).toBeGreaterThan(0.9);
    // Every resource node and every find is somewhere the Blobbi can get to.
    for (const n of live.allResources) expect(reach(n.x, n.y) || reach(n.x, n.y + 4) || reach(n.x + 4, n.y) || reach(n.x - 4, n.y)).toBe(true);
    for (const d of live.discoveries) expect(reach(d.x, d.y)).toBe(true);
    const x0 = live.blobbi.x;
    for (let i = 0; i < 60; i++) live.update(1 / 60, { ...IDLE_INPUT, left: true });
    expect(live.blobbi.x).not.toBe(x0);
  });

  it('autonomy: the Blobbi lives there on its own and never leaves the land', () => {
    const l = new LiveWorld(world, 'blobbi-9', 16);
    run(l, 60 * 40); // forty seconds of its own life
    expect(l.collision.canStand(l.blobbi.x, l.blobbi.y, l.blobbi.footRx, l.blobbi.footRy)).toBe(true);
    expect(isLandClass(world.terrain.cls[Math.round(l.blobbi.y) * world.terrain.width + Math.round(l.blobbi.x)])).toBe(true);
  });

  it('has resources (shells on its mossy shore too), discoveries, places and a spot to listen by the head', () => {
    expect(live.allResources.length).toBeGreaterThan(20);
    expect(live.allResources.filter((n) => n.kind === 'shell').length).toBeGreaterThanOrEqual(3);
    expect(live.discoveries.length).toBeGreaterThanOrEqual(5);
    expect(live.places.some((p) => p.id === 'head')).toBe(true);
    expect(live.listenSpot).not.toBeNull();
    // The listening spot is the island's front, toward the head.
    expect(live.listenSpot!.x).toBeGreaterThan(world.islands[0].cx);
    stand(live, live.listenSpot!.x, live.listenSpot!.y, 'right');
    live.resources = live.resources.filter((n) => Math.hypot(n.x - live.listenSpot!.x, n.y - live.listenSpot!.y) > 20);
    expect(live.nearCarrier()).toBe(true);
    expect(live.species).toBe('whale');
    expect(live.observeCarrier()).toBe(WHALE_OBSERVATIONS[0].id);
    // Whale observations survive a save (they are known ids).
    expect(carrierFromSave({ ...live.carrier }).observations).toContain(WHALE_OBSERVATIONS[0].id);
  });

  it('gathering, crafting, building, housing, furniture, storage and farming work', () => {
    const l = new LiveWorld(world, 'blobbi-9', 16, { store: memoryStore() });
    l.brain.enabled = false;
    // Gather: walk to a stick and pick it up.
    const stick = l.resources.find((n) => n.kind === 'stick')!;
    stand(l, stick.x, stick.y + 6, 'up');
    const before = l.inventory.count(ITEMS.stick.id);
    for (let i = 0; i < 30 && l.inventory.count(ITEMS.stick.id) === before; i++) l.update(1 / 60, { ...IDLE_INPUT, interact: i % 2 === 0 });
    expect(l.inventory.count(ITEMS.stick.id)).toBeGreaterThan(before);
    for (const it of [ITEMS.wood.id, ITEMS.stone.id, ITEMS.stick.id]) l.inventory.add(it, 60);
    for (const q of ['arrive', 'meet', 'gather', 'axe', 'wood']) l.objectives.completed[q] = 0;
    expect(findBuildSpot(l, 'shelter')).toBe(true);
    l.setBuildMode('shelter');
    const shelter = l.placeBuilding();
    expect(shelter).not.toBeNull();
    shelter!.placedAt -= 1e6; // finished
    expect(l.enterInterior(shelter!)).toBe(true);
    l.exitInterior();
    // A tillable cell on the island.
    const { width, cls } = world.terrain;
    let ok = 0;
    for (let i = 0; i < cls.length && !ok; i += 211) {
      if (cls[i] !== T.GRASS) continue;
      const x = i % width, y = (i / width) | 0;
      if (l.plotCheck({ gx: Math.floor(x / PLOT_GRID), gy: Math.floor(y / PLOT_GRID) }).ok) ok++;
    }
    expect(ok).toBeGreaterThan(0);
  });

  it('teleports away and back on the whale', () => {
    const l = new LiveWorld(world, 'blobbi-9', 16);
    l.brain.enabled = false;
    expect(l.leaveBlobbi()).toBe(true);
    run(l, 60 * 3); // frames
    expect(l.getPresenceState()).toBe('absent');
    expect(l.enterBlobbi(l.listenSpot!)).toBe(true);
    run(l, 60 * 4);
    expect(l.getPresenceState()).toBe('present');
    expect(l.collision.canStand(l.blobbi.x, l.blobbi.y, l.blobbi.footRx, l.blobbi.footRy)).toBe(true);
  });

  it('saves and reloads as a whale world', () => {
    const store = memoryStore();
    const x = new LiveWorld(world, 'blobbi-9', 16, { store });
    x.inventory.add(ITEMS.wood.id, 3);
    x.save();
    const raw = JSON.parse(store.get(saveKey(x.identity))!);
    expect(raw.species).toBe('whale');
    expect(loadSave(store, x.identity)!.species).toBe('whale');
    const y = new LiveWorld(generateWhaleWorld('whale-world-0'), 'blobbi-9', 16, { store });
    expect(y.inventory.count(ITEMS.wood.id)).toBe(3);
    // A turtle and a manta world of the same seed are other worlds, with their own saves.
    expect(worldIdentity(generateMantaWorld('whale-world-0'))).not.toBe(x.identity);
  });

  it('renders in every camera mode; fins and flukes move; it spouts and blinks', () => {
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const bounds = worldBounds(world);
    for (const mode of CAMERA_CYCLE) {
      const cam = new ViewCamera(mode);
      const v = cam.update(0, live.cameraTarget(), 480, 270, bounds, true);
      const f1 = view.render(v, cam.restScale(mode, 480, 270, bounds), 1.3, DEFAULT_LIVE_OPTIONS, { hud: false, indicator: false, uiScale: 2 }).clone();
      const f2 = view.render(v, cam.restScale(mode, 480, 270, bounds), 1.3, DEFAULT_LIVE_OPTIONS, { hud: false, indicator: false, uiScale: 2 }).clone();
      expect(f1.width).toBe(480);
      expect(sig(f1.data)).toBe(sig(f2.data)); // deterministic
    }
    const lr = new LiveRenderer(live);
    const W = world.options.width;
    const H = world.options.height;
    const frame = (t: number) => lr.render(W, H, 0, 0, t, DEFAULT_LIVE_OPTIONS).clone();
    const diff = (p: ReturnType<typeof frame>, q: ReturnType<typeof frame>, x0: number, x1: number, y0: number, y1: number) => {
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (p.get(x, y) !== q.get(x, y)) n++;
      return n;
    };
    const f0 = frame(0);
    const f1 = frame(1.6);
    // The north fin sways and the flukes rise: pixels change over the sea there.
    const fin = a.fins[0];
    expect(diff(f0, f1, Math.round(fin.base.x - fin.length), Math.round(fin.base.x + 10), 0, Math.round(a.cy - a.half(0.27)))).toBeGreaterThan(30);
    expect(diff(f0, f1, 0, Math.round(a.xTail), 0, H)).toBeGreaterThan(30);
    // A spout: find a moment mid-breath and see white above the blowholes.
    let t = 0;
    while (whalePose(a, t).spout < 0.25 && t < 12) t += 0.05;
    const fs = frame(t);
    const quiet = frame(t + 4);
    expect(diff(fs, quiet, Math.round(a.blowhole.x - 40), Math.round(a.blowhole.x + 40), Math.round(a.blowhole.y - 90), Math.round(a.blowhole.y))).toBeGreaterThan(40);
    // The moving parts are small sprites (a long whale costs no more memory than a wide manta).
    for (const f of creatureParts(world)) for (const s of f) expect(s.buffer.width * s.buffer.height).toBeLessThan((W * H) / 6);
  });

  it('has its own voice: a song, and a blow with each spout', () => {
    expect(SFX[CARRIER_VOICES.whale.call]).toBeDefined();
    expect(SFX[CARRIER_VOICES.whale.breath]).toBeDefined();
    expect(CARRIER_VOICES.whale.call).not.toBe(CARRIER_VOICES.turtle.call);
  });

  it('the title offers the whale as a third Carrier, with a picture', () => {
    const calls: string[] = [];
    const actions: TitleActions = {
      worlds: () => [],
      current: () => ({ identity: 'id', name: 'x', saved: false }),
      continueGame: () => {},
      openWorld: () => {},
      settings: () => {},
      preview: () => null,
    };
    const title = new TitleScreen(actions);
    expect(title.page).toBe('welcome'); // no saved island yet
    title.key('Enter'); // BEGIN
    expect(title.page).toBe('carrier');
    title.key('ArrowRight');
    title.key('ArrowRight');
    title.key('Enter'); // the whale card
    title.key('Enter'); // CREATE ISLAND
    calls.push(title.takeCreate()!.kind);
    expect(calls).toEqual(['whale']);
  });
});

describe('the whale world: growth (its own geometry)', () => {
  const stages = [0, 1, 2, 3].map((s) => growWorld(world, s));

  it('grows in three meaningful stages, over its back only, never toward the head or past the knuckles', () => {
    const range = world.creature!.species === 'whale' ? world.creature!.growRange : null!;
    for (let s = 1; s <= 3; s++) expect(stages[s].stats.landPixels).toBeGreaterThan(stages[s - 1].stats.landPixels);
    expect(stages[3].stats.landPixels).toBeGreaterThan(world.stats.landPixels * 1.5);
    const grown = stages[3];
    const { width } = world.terrain;
    for (let i = 0; i < world.terrain.cls.length; i++) {
      const b = world.terrain.cls[i];
      const c = grown.terrain.cls[i];
      if (b === c) continue;
      expect([T.SKIN, T.GRASS_EDGE, T.MOSS]).toContain(b);
      expect(isLandClass(c)).toBe(true);
      const x = i % width;
      expect(x).toBeGreaterThanOrEqual(range.x0);
      expect(x).toBeLessThanOrEqual(range.x1);
    }
    // It lengthens toward the tail (west) far more than it widens.
    const b0 = landBounds(world);
    const b3 = landBounds(grown);
    expect(b0.x0 - b3.x0).toBeGreaterThan(((b3.y1 - b3.y0) - (b0.y1 - b0.y0)) * 2);
    expect(b3.x1 - b0.x1).toBeLessThan((b0.x0 - b3.x0) / 8); // the front (toward the head) barely moves
    // Every grown region is real land.
    for (let i = 0; i < grown.growth!.area.length; i++) expect(grown.growth!.area[i]).toBeGreaterThan(100);
  });

  it('existing objects, buildings and the bag stay exactly where they were; grown land is walkable, reachable and farmable', () => {
    for (let s = 1; s <= 3; s++) expect(JSON.stringify(stages[s].objects.slice(0, world.objects.length))).toBe(JSON.stringify(world.objects));
    const store = memoryStore();
    const live = new LiveWorld(world, 'blobbi-9', 16, { store });
    live.brain.enabled = false;
    for (const it of [ITEMS.wood.id, ITEMS.stone.id, ITEMS.stick.id]) live.inventory.add(it, 40);
    for (const q of ['arrive', 'meet', 'gather', 'axe', 'wood']) live.objectives.completed[q] = 0;
    expect(findBuildSpot(live, 'shelter')).toBe(true);
    live.setBuildMode('shelter');
    const built = live.placeBuilding()!;
    live.save();
    live.devSetGrowthStage(3);
    const after = new LiveWorld(world, 'blobbi-9', 16, { store });
    after.brain.enabled = false;
    expect(after.world.growth!.stage).toBe(3);
    expect(after.buildings.find((b) => b.id === built.id)).toMatchObject({ x: built.x, y: built.y });
    expect(JSON.stringify(after.inventory.entries())).toBe(JSON.stringify(live.inventory.entries()));
    // Grown ground: reachable from the hub, and some of it tillable.
    const reach = reachOf(after);
    const { width } = world.terrain;
    const region = after.world.growth!.region;
    let cells = 0, reached = 0, tillable = 0;
    for (let i = 0; i < region.length; i += 53) {
      if (!region[i]) continue;
      const x = i % width, y = (i / width) | 0;
      if (!after.collision.canStand(x, y, after.blobbi.footRx, after.blobbi.footRy)) continue;
      cells++;
      if (reach(x, y)) reached++;
      if (after.world.terrain.cls[i] === T.GRASS || after.world.terrain.cls[i] === T.CLOVER) if (after.plotCheck({ gx: Math.floor(x / PLOT_GRID), gy: Math.floor(y / PLOT_GRID) }).ok) tillable++;
    }
    expect(reached / cells).toBeGreaterThan(0.9);
    expect(tillable).toBeGreaterThan(0);
    // Grown-land resources are all reachable; the grown regions have their finds and places.
    for (const n of after.allResources.filter((r) => r.id.startsWith('g:'))) expect(reach(n.x, n.y) || reach(n.x, n.y + 4) || reach(n.x + 4, n.y) || reach(n.x - 4, n.y)).toBe(true);
    expect(after.places.filter((p) => p.id.startsWith('region:')).length).toBeGreaterThanOrEqual(4);
  });

  it('several whales: every seed makes a playable, growable world', () => {
    for (const seed of ['w-a', 'w-b']) {
      const w = generateWhaleWorld(seed);
      const l = new LiveWorld(w, 'blobbi-9', 16);
      expect(l.collision.canStand(l.blobbi.x, l.blobbi.y, l.blobbi.footRx, l.blobbi.footRy)).toBe(true);
      expect(l.listenSpot).not.toBeNull();
      expect(l.allResources.filter((n) => n.kind === 'shell').length).toBeGreaterThan(0);
      expect(growWorld(w, 3).stats.landPixels).toBeGreaterThan(w.stats.landPixels * 1.4);
    }
    // And the anatomy fits any canvas it is given (a preview, or a world).
    const small = whaleAnatomy(generateWhaleGenome('w'), 320, 240);
    expect(small.xSnout).toBeLessThan(320);
    expect(small.fluke.cx - small.fluke.span * 0).toBeGreaterThan(0);
  });
});
