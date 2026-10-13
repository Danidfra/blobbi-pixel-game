/**
 * PERFORMANCE SCENES (M10): the game's real frame path — simulation step, camera, `ViewRenderer` (world, native
 * Blobbi, HUD) and the menu bar — timed headless over fixed scenes, so before/after comparisons use the same work.
 * The browser's own costs (canvas upload, compositing, GC pauses, long tasks) are measured separately with Chrome
 * (`scripts/perf-browser.mjs`); this harness isolates the CPU work of a frame.
 *
 *   node --expose-gc --import tsx scripts/perf-scenes.ts [label] [--frames 600] [--only name]
 *
 * Scenes: turtle stage 0 and 4, manta 4, whale 4, the house interior, rain, active fishing, Carrier animation at
 * overview, the minimum and maximum zoom (close-up, and up close since M10), the canoe paddling and fishing (M10 B), the
 * canoe by the rough edge of its sea (M10 C); each at desktop 1280×720, desktop 1920×1080 and a phone 844×390.
 * Output: a table, and JSON in docs/testing/perf/<label>.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { growWorld } from '../src/world/growth';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { LiveWorld, IDLE_INPUT, type LiveInput } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { ViewCamera, worldBounds, type CameraModeId } from '../src/render/view-camera';
import { GameUI } from '../src/ui/game-ui';
import { paletteFor } from '../src/world/generate';
import { memoryStore } from '../src/game/persistence';
import { rainAt } from '../src/game/daylight';
import { findBuildSpot, pressE, run, stand } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import type { WorldDescription } from '../src/world/types';

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) ?? 'run';
const frames = Number(args[args.indexOf('--frames') + 1]) || 600;
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const gc = (globalThis as { gc?: () => void }).gc;

const VIEWPORTS: [string, number, number][] = [
  ['1280x720', 1280, 720],
  ['1920x1080', 1920, 1080],
  ['phone-844x390', 844, 390],
];

const turtle = () => generateTurtleWorld('perf-island', { turtleSeed: 'perf-turtle', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });
const manta = () => generateMantaWorld('perf-island', { carrierSeed: 'perf-manta', generatedHouse: false });
const whale = () => generateWhaleWorld('perf-island', { carrierSeed: 'perf-whale', generatedHouse: false });

/** A live world at a growth stage, as a save would make it. */
function liveAt(make: () => WorldDescription, stage: number): LiveWorld {
  const base = make();
  const store = memoryStore();
  if (stage) {
    const probe = new LiveWorld(base, 'blobbi-9', 16, { store });
    probe.growth = { stage, version: 3, history: [], regions: [] };
    probe.save();
  }
  const live = new LiveWorld(base, 'blobbi-9', 16, { store });
  live.brain.enabled = true;
  return live;
}

interface Scene {
  name: string;
  mode: CameraModeId;
  make: () => LiveWorld;
  /** Player input per frame (walking keeps the camera and the native Blobbi busy). */
  input?: (i: number) => Partial<LiveInput>;
}

const walk = (i: number): Partial<LiveInput> => ({ right: i % 240 < 60, down: i % 240 >= 60 && i % 240 < 120, left: i % 240 >= 120 && i % 240 < 180, up: i % 240 >= 180 });

const SCENES: Scene[] = [
  { name: 'turtle-stage0', mode: 'exploration', make: () => liveAt(turtle, 0), input: walk },
  { name: 'turtle-stage4', mode: 'exploration', make: () => liveAt(turtle, 4), input: walk },
  { name: 'manta-stage4', mode: 'exploration', make: () => liveAt(manta, 4), input: walk },
  { name: 'whale-stage4', mode: 'exploration', make: () => liveAt(whale, 4), input: walk },
  {
    name: 'interior',
    mode: 'exploration',
    make: () => {
      const live = liveAt(whale, 0);
      live.inventory.add(ITEMS.wood.id, 6);
      live.inventory.add(ITEMS.stone.id, 3);
      live.objectives.completed.materials = 0;
      findBuildSpot(live, 'shelter');
      live.setBuildMode('shelter');
      pressE(live);
      run(live, 60 * 26);
      live.enterInterior(live.home()!);
      return live;
    },
    input: walk,
  },
  {
    name: 'rain',
    mode: 'exploration',
    make: () => {
      const live = liveAt(turtle, 2);
      // The first rainy moment of this world.
      for (let t = 0; t < 1200 * 20; t += 30) if (rainAt(live.world.seed, t) > 0.6) return ((live.timeOffset = t), live);
      return live;
    },
    input: walk,
  },
  {
    name: 'fishing',
    mode: 'exploration',
    make: () => {
      const live = liveAt(turtle, 0);
      live.inventory.add('blobbi-pixel:tool:fishing-rod', 1);
      live.equip('blobbi-pixel:tool:fishing-rod');
      live.fishing = { start: 0, biteAt: 1e9, x: Math.round(live.blobbi.x), y: Math.round(live.blobbi.y + 30), water: 'sea' };
      return live;
    },
  },
  { name: 'carrier-anim-overview', mode: 'overview', make: () => liveAt(whale, 4) },
  { name: 'min-zoom-overview', mode: 'overview', make: () => liveAt(turtle, 4), input: walk },
  { name: 'max-zoom-closeup', mode: 'closeup', make: () => liveAt(turtle, 4), input: walk },
  // M10: the fourth mode, now the maximum zoom.
  { name: 'max-zoom-upclose', mode: 'upclose', make: () => liveAt(turtle, 4), input: walk },
  // M10 phase B: paddling the canoe round the Carrier, and fishing from it (stage 2: the shore reaches the sea).
  { name: 'canoe-navigation', mode: 'exploration', make: () => afloat(liveAt(turtle, 2)), input: walk },
  { name: 'canoe-fishing', mode: 'closeup', make: () => afloat(liveAt(turtle, 2), true) },
  // M10 phase C: aboard by a corner of the canoe's sea, where the rough water is drawn (the worst case for its cost).
  { name: 'canoe-edge-overview', mode: 'overview', make: () => atEdge(afloat(liveAt(turtle, 2))) },
  { name: 'canoe-edge-exploration', mode: 'exploration', make: () => atEdge(afloat(liveAt(turtle, 2))) },
];

/** Launch the canoe from the shore nearest the hub and step in (and, if asked, cast a line from it). */
function afloat(live: LiveWorld, fishing = false): LiveWorld {
  live.inventory.add('blobbi-pixel:vehicle:canoe', 1);
  (live as unknown as { nearbyMarine: () => null }).nearbyMarine = () => null;
  const { width, height } = live.world.terrain;
  search: for (let y = 6; y < height - 6; y += 3)
    for (let x = 6; x < width - 6; x += 3) {
      if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
      for (const d of ['down', 'right', 'left', 'up'] as const) {
        stand(live, x, y, d);
        if (live.launchSpot()) break search;
      }
    }
  live.resources = [];
  live.launchCanoe();
  live.boardCanoe();
  run(live, 40);
  // Out into open water.
  for (let i = 0; i < 240; i++) live.update(1 / 60, { ...IDLE_INPUT, up: true });
  for (let i = 0; i < 120; i++) live.update(1 / 60, IDLE_INPUT);
  if (fishing) {
    live.inventory.add('blobbi-pixel:tool:fishing-rod', 1);
    live.equip('blobbi-pixel:tool:fishing-rod');
    live.fish();
    if (live.fishing) live.fishing.biteAt = 1e9;
  }
  return live;
}

/** Put the canoe (aboard) by the north-west corner of its sea, inside the rough band. */
function atEdge(live: LiveWorld): LiveWorld {
  const r = live.seaNav().region;
  if (live.boat) {
    live.boat.x = r.x0 + 60;
    live.boat.y = r.y0 + 60;
    live.boat.vx = live.boat.vy = 0;
    live.blobbi.x = live.boat.x;
    live.blobbi.y = live.boat.y + 4;
  }
  return live;
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];

interface Result {
  scene: string;
  viewport: string;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  sim: number;
  render: number;
  over16: number;
  over33: number;
  heapGrowthMB: number;
  /** Mean ms per frame in each phase: the world frame, magnify and overlay, the native Blobbi, HUD text, the menu bar. */
  phases: Record<string, number>;
}

const results: Result[] = [];
const gen: Record<string, number> = {};
for (const [name, make] of [['turtle', turtle], ['manta', manta], ['whale', whale]] as const) {
  const t0 = performance.now();
  const base = make();
  const t1 = performance.now();
  growWorld(base, 4);
  gen[name] = t1 - t0;
  gen[`${name}-grow4`] = performance.now() - t1;
}

for (const scene of SCENES) {
  if (only && scene.name !== only) continue;
  for (const [vp, W, H] of VIEWPORTS) {
    const live = scene.make();
    const lr = new LiveRenderer(live);
    const view = new ViewRenderer(live, lr);
    const ui = new GameUI(() => live, () => paletteFor(live.world.options.palette));
    const cam = new ViewCamera(scene.mode);
    // As the playground does: the island's bounds once; a room's from the scene.
    const islandBounds = worldBounds(live.world);
    const bounds = () => live.sceneBounds() ?? islandBounds;
    const frame = (i: number, measure: boolean) => {
      const t0 = performance.now();
      live.update(1 / 60, { ...IDLE_INPUT, ...(scene.input?.(i) ?? {}) });
      const t1 = performance.now();
      const b = bounds();
      const rest = cam.restScale(cam.mode, W, H, b);
      const v = cam.update(1 / 60, live.cameraTarget(H / rest), W, H, b, false, 1 / 60);
      const screen = view.render(v, rest, live.clock.time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, uiScale: 2 });
      const tm = performance.now();
      ui.render(screen, live.clock.time);
      const t2 = performance.now();
      if (measure) {
        phases.world += view.timings.world;
        phases.compose += view.timings.compose;
        phases.blobbi += view.timings.blobbi;
        phases.ui += view.timings.ui;
        phases.menu += t2 - tm;
      }
      return measure ? [t2 - t0, t1 - t0, t2 - t1] : null;
    };
    for (let i = 0; i < 90; i++) frame(i, false); // warm caches
    gc?.();
    const heap0 = process.memoryUsage().heapUsed;
    const session = process.env.PROFILE ? new (await import('node:inspector')).Session() : null;
    if (session) {
      session.connect();
      await new Promise((r) => session.post('Profiler.enable', () => session.post('Profiler.start', r)));
    }
    const totals: number[] = [];
    const phases = { world: 0, compose: 0, blobbi: 0, ui: 0, menu: 0 };
    let sim = 0;
    let ren = 0;
    for (let i = 0; i < frames; i++) {
      const [t, s, r] = frame(90 + i, true)!;
      totals.push(t);
      sim += s;
      ren += r;
    }
    if (session) {
      const prof = await new Promise<{ profile: unknown }>((r) => session.post('Profiler.stop', (_e, res) => r(res as { profile: unknown })));
      mkdirSync(process.env.PROFILE!, { recursive: true });
      writeFileSync(`${process.env.PROFILE}/${scene.name}-${vp}.cpuprofile`, JSON.stringify(prof.profile));
    }
    gc?.();
    const heap1 = process.memoryUsage().heapUsed;
    const sorted = [...totals].sort((a, b) => a - b);
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    results.push({ scene: scene.name, viewport: vp, mean, p50: pct(sorted, 0.5), p95: pct(sorted, 0.95), p99: pct(sorted, 0.99), max: sorted.at(-1)!, sim: sim / frames, render: ren / frames, over16: totals.filter((t) => t > 16.7).length / frames, over33: totals.filter((t) => t > 33.3).length / frames, heapGrowthMB: (heap1 - heap0) / 1048576, phases: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, +(v / frames).toFixed(3)])) });
    const r = results.at(-1)!;
    console.log(`${r.scene.padEnd(22)} ${r.viewport.padEnd(14)} mean ${r.mean.toFixed(2).padStart(6)}  p50 ${r.p50.toFixed(2).padStart(6)}  p95 ${r.p95.toFixed(2).padStart(6)}  p99 ${r.p99.toFixed(2).padStart(6)}  max ${r.max.toFixed(1).padStart(6)}  sim ${r.sim.toFixed(2)}  render ${r.render.toFixed(2)}  >16.7ms ${(r.over16 * 100).toFixed(0)}%  heap ${r.heapGrowthMB.toFixed(1)} MB  [${Object.entries(r.phases).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' ')}]`);
  }
}
console.log('generation ms', Object.fromEntries(Object.entries(gen).map(([k, v]) => [k, Math.round(v)])));
mkdirSync('docs/testing/perf', { recursive: true });
writeFileSync(`docs/testing/perf/${label}.json`, JSON.stringify({ label, date: new Date().toISOString().slice(0, 10), node: process.version, frames, gc: !!gc, generation: gen, results }, null, 1));
