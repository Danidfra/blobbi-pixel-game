/**
 * FURNITURE SHOTS (Living Home): the Blobbi using seats and the washing tub, indoors and out, rendered headless at
 * fixed moments: facing the piece (the prompt), the hop in, settled, a bath mid-splash, the hop out. Deterministic:
 * the same world seed, the same pieces, the same clock, so two runs differ only by code changes.
 *
 *   npx tsx scripts/furniture-shots.ts <label>
 *
 * Writes out/furniture/<label>/ (ignored by git):
 *   indoor-<kind>-<moment>-x6.png    the room round the piece, 6 screen pixels per world pixel
 *   outdoor-<kind>-<moment>-x6.png   the island round the piece, the same
 *   desktop-<scene>-<kind>.png       a 1280×720 exploration view with the HUD and the prompt
 *   phone-<scene>-<kind>.png         an 844×390 view, the same
 *   hashes.json                      a hash per image
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { IDLE_INPUT, LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI, type ViewUiOptions } from '../src/render/view-renderer';
import { ViewCamera, worldBounds, type ViewRect } from '../src/render/view-camera';
import { memoryStore } from '../src/game/persistence';
import { DAY_SECONDS, START_HOUR } from '../src/game/daylight';
import { findBuildSpot, pressE, run, stand } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import { BUILDINGS, type Building } from '../src/game/buildings';
import { PixelBuffer } from '../src/core/pixel';
import { hash32 } from '../src/core/rng';
import { toPng } from '../src/node/png';

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) ?? 'run';
const dir = `out/furniture/${label}`;
mkdirSync(dir, { recursive: true });
const at = (day: number, hour: number) => day * DAY_SECONDS + (((hour - START_HOUR + 24) % 24) / 24) * DAY_SECONDS;

const world = generateWhaleWorld('shots-island', { carrierSeed: 'shots-whale', generatedHouse: false });
const live = new LiveWorld(world, 'blobbi-9', 16, { store: memoryStore() });
live.brain.enabled = false;
live.weather = 'dry';
live.resources = []; // nothing on the ground to pick up before a seat
live.timeOffset = at(0, 12);
live.inventory.add(ITEMS.wood.id, 6);
live.inventory.add(ITEMS.stone.id, 3);
live.objectives.completed.materials = 0;
if (!findBuildSpot(live, 'shelter')) throw new Error('no spot for the shelter');
live.setBuildMode('shelter');
pressE(live);
run(live, 60 * 26);

const hashes: Record<string, unknown> = {};
const frameHash = (b: PixelBuffer) => hash32(Array.from(b.data, (c) => c.toString(36)).join(','));
const save = (name: string, b: PixelBuffer) => {
  writeFileSync(`${dir}/${name}.png`, toPng(b));
  hashes[name] = frameHash(b);
};
const scaled = (b: PixelBuffer, k: number): PixelBuffer => {
  const o = new PixelBuffer(b.width * k, b.height * k);
  for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) o.set(x, y, b.get(Math.floor(x / k), Math.floor(y / k)));
  return o;
};
const lr = new LiveRenderer(live);
const view = new ViewRenderer(live, lr);
const quiet: ViewUiOptions = { hud: false, indicator: false, goals: false, prompt: false, lighting: true, uiScale: 2 };
/** A 1× window of the scene round a point, as the view draws it (lighting on, no HUD), scaled up. */
function around(x: number, y: number, w: number, h: number, k: number): PixelBuffer {
  const rect: ViewRect = { mode: 'exploration', scale: 1, originX: Math.round(x - w / 2), originY: Math.round(y - h / 2), screenW: w, screenH: h, transitioning: false };
  return scaled(view.render(rect, 1, live.clock.time, DEFAULT_LIVE_OPTIONS, quiet).clone(), k);
}
function screen(w: number, h: number, name: string): void {
  const bounds = live.sceneBounds() ?? worldBounds(live.world);
  const cam = new ViewCamera('exploration');
  const rest = cam.restScale('exploration', w, h, bounds);
  const v = cam.update(1 / 60, live.cameraTarget(h / rest), w, h, bounds, true, 1 / 60);
  save(name, view.render(v, rest, live.clock.time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, bottom: 40 }).clone());
}
const step = (n: number) => {
  for (let i = 0; i < n; i++) live.update(1 / 60, IDLE_INPUT);
};
const E = () => live.update(1 / 60, { ...IDLE_INPUT, interact: true });

/** Place a piece from the bag just ahead of a spot, and return it. */
function place(kind: string, x: number, y: number): Building {
  const def = BUILDINGS[kind];
  live.inventory.add(def.item!, 1);
  stand(live, x, y, 'up');
  if (!live.startPlacing(def.item!)) throw new Error(`cannot place ${kind}`);
  E();
  run(live, 60 * (def.buildSeconds + 1));
  const placed = live.placedHere.filter((b) => b.kind === kind).pop();
  if (!placed) throw new Error(`${kind} not placed`);
  live.bubble = null;
  return placed;
}

/** The moments of using a piece: facing it, the hop in, settled, (a bath mid-soak), the hop out. */
function moments(scene: string, f: Building, w: number, h: number): void {
  const def = BUILDINGS[f.kind];
  const approach = { x: f.x, y: f.y + def.footRy + live.blobbi.footRy + 2 };
  stand(live, approach.x, approach.y, 'up');
  live.bubble = null;
  live.particles.particles.length = 0;
  const shot = (moment: string) => save(`${scene}-${f.kind}-${moment}-x6`, around(f.x, f.y - 6, w, h, 6));
  shot('0-facing');
  if (scene === 'indoor' || f.kind === 'washing-tub') screen(1280, 720, `desktop-${scene}-${f.kind}-prompt`);
  if (f.kind === 'washing-tub') live.care.hygiene = 20;
  E();
  step(13);
  shot('1-hop-in');
  step(20);
  shot('2-settled');
  if (f.kind === 'washing-tub') {
    step(50);
    shot('3-soak');
    screen(1280, 720, `desktop-${scene}-${f.kind}-soak`);
    screen(844, 390, `phone-${scene}-${f.kind}-soak`);
    for (let i = 0; i < 60 * 5 && live.occupation?.phase !== 'leave'; i++) step(1);
    step(8);
    shot('4-hop-out');
  } else {
    step(60);
    screen(1280, 720, `desktop-${scene}-${f.kind}-seated`);
    screen(844, 390, `phone-${scene}-${f.kind}-seated`);
    E();
    step(12);
    shot('3-hop-out');
  }
  for (let i = 0; i < 60 * 3 && live.occupation; i++) step(1);
  step(30);
  shot('5-up');
  const ok = live.collision.canStand(live.blobbi.x, live.blobbi.y, live.blobbi.footRx, live.blobbi.footRy);
  console.log(`${scene.padEnd(8)} ${f.kind.padEnd(12)} up at ${live.blobbi.x.toFixed(1)},${live.blobbi.y.toFixed(1)} standable ${ok} prompt "${live.prompt()}"`);
}

// ── Outdoors: the bench, a log seat, a hay bale and the tub by the house ──────────────────────────────────────
const home = live.home()!;
const outdoorKinds = ['bench', 'log-seat', 'hay-bale', 'washing-tub'];
const outdoor: Building[] = [];
for (const kind of outdoorKinds) {
  live.inventory.add(BUILDINGS[kind].item!, 1);
  if (!findBuildSpot(live, kind, { x: home.x, y: home.y + 30 }, 160)) throw new Error(`no spot for ${kind}`);
  if (!live.startPlacing(BUILDINGS[kind].item!)) throw new Error(`cannot place ${kind}`);
  E();
  run(live, 60 * (BUILDINGS[kind].buildSeconds + 1));
  const placed = live.buildings.filter((b) => b.kind === kind).pop();
  if (!placed) throw new Error(`${kind} not placed`);
  outdoor.push(placed);
}
live.bubble = null;
for (const f of outdoor) moments('outdoor', f, 56, 44);

// ── Indoors: a chair, the armchair, a stool and the tub in the Cozy Shelter ────────────────────────────────────
if (!live.enterInterior(home)) throw new Error('could not enter');
live.brain.enabled = false;
run(live, 120);
live.bubble = null;
const indoor = [place('chair', 30, 72), place('armchair', 56, 72), place('stool', 82, 72), place('washing-tub', 106, 72)];
for (const f of indoor) moments('indoor', f, 56, 44);

writeFileSync(`${dir}/hashes.json`, JSON.stringify(hashes, null, 2));
console.log(`wrote ${Object.keys(hashes).length} images to ${dir}/`);
