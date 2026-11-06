/**
 * INTERIOR SHOTS: the Cozy Shelter (level 1 room) rendered headless at fixed times of day, for before/after
 * comparisons of interior atmosphere work, plus a sheet of the indoor furniture sprites. Deterministic: the same
 * world seed, the same furniture, the same Blobbi spot, the same clock, so two runs differ only by code changes.
 *
 *   npx tsx scripts/interior-shots.ts <label> [--level 1]
 *
 * Writes out/interior/<label>/ (ignored by git):
 *   room-<time>.png       the room at world pixels (1:1), lit for the time of day
 *   room-<time>-x4.png    the same, 4 screen pixels per world pixel (what a desktop shows)
 *   phone-<time>.png      a phone viewport (844×390) in exploration mode, HUD off
 *   furniture.png         bed, chest, workbench, table, chair at 1× and 6×, every colourway
 *   hashes.json           a hash per image and the size and anchor of each furniture sprite
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer, type ViewUiOptions } from '../src/render/view-renderer';
import { ViewCamera, worldBounds, type ViewRect } from '../src/render/view-camera';
import { paletteFor } from '../src/world/generate';
import { memoryStore } from '../src/game/persistence';
import { DAY_SECONDS, START_HOUR, rainAt } from '../src/game/daylight';
import { findBuildSpot, pressE, run, stand } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import { buildingSprite } from '../src/game/buildings';
import { PLACEABLE_CONTENT } from '../src/content/placeables';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { hash32 } from '../src/core/rng';
import { toPng } from '../src/node/png';

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) ?? 'run';
const level = Number(args[args.indexOf('--level') + 1]) || 1;
const dir = `out/interior/${label}`;
mkdirSync(dir, { recursive: true });

const TIMES: { name: string; hour: number; rain: boolean }[] = [
  { name: '0615-dawn', hour: 6.25, rain: false },
  { name: '0700-morning', hour: 7, rain: false },
  { name: '1200-noon', hour: 12, rain: false },
  { name: '1430-rain', hour: 14.5, rain: true },
  { name: '1900-dusk', hour: 19, rain: false },
  { name: '2300-night', hour: 23, rain: false },
];

/** World time at `hour` on day `day` (day 0 starts at START_HOUR). */
const at = (day: number, hour: number) => day * DAY_SECONDS + (((hour - START_HOUR + 24) % 24) / 24) * DAY_SECONDS;

const world = generateWhaleWorld('shots-island', { carrierSeed: 'shots-whale', generatedHouse: false });
const live = new LiveWorld(world, 'blobbi-9', 16, { store: memoryStore() });
live.brain.enabled = false;
live.inventory.add(ITEMS.wood.id, 6);
live.inventory.add(ITEMS.stone.id, 3);
live.objectives.completed.materials = 0;
findBuildSpot(live, 'shelter');
live.setBuildMode('shelter');
pressE(live);
run(live, 60 * 26);
if (!live.enterInterior(live.home()!)) throw new Error('could not enter the shelter');
live.brain.enabled = false;
run(live, 120); // the "home!" bubble passes
stand(live, 84, 74, 'left');
live.bubble = null;
live.particles.particles.length = 0; // the comparable frames hold no drifting particles
if (level !== 1) console.warn('only level 1 is set up here; higher levels need an upgraded home');

const hashes: Record<string, unknown> = {};
const frameHash = (b: PixelBuffer) => hash32(Array.from(b.data, (c) => c.toString(36)).join(','));
const save = (name: string, b: PixelBuffer) => {
  writeFileSync(`${dir}/${name}.png`, toPng(b));
  hashes[name] = frameHash(b);
};
const crop = (b: PixelBuffer, x0: number, y0: number, w: number, h: number): PixelBuffer => {
  const o = new PixelBuffer(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.set(x, y, b.get(x0 + x, y0 + y));
  return o;
};
const scaled = (b: PixelBuffer, k: number): PixelBuffer => {
  const o = new PixelBuffer(b.width * k, b.height * k);
  for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) o.set(x, y, b.get(Math.floor(x / k), Math.floor(y / k)));
  return o;
};

const lr = new LiveRenderer(live);
const view = new ViewRenderer(live, lr);
const quiet: ViewUiOptions = { hud: false, indicator: false, goals: false, prompt: false, lighting: true, uiScale: 2 };
const bounds = live.sceneBounds() ?? worldBounds(live.world);
const roomRect = (scale: number): ViewRect => ({ mode: 'exploration', scale, originX: 0, originY: 0, screenW: bounds.width * scale, screenH: bounds.height * scale, transitioning: false });

// A clear day and a rainy day, from the world's own weather.
let clearDay = 0;
while (TIMES.some((t) => !t.rain && rainAt(world.seed, at(clearDay, t.hour)) > 0)) clearDay++;
let rainyDay = 0;
while (rainAt(world.seed, at(rainyDay, 14.5)) < 0.9) rainyDay++;

for (const t of TIMES) {
  live.timeOffset = at(t.rain ? rainyDay : clearDay, t.hour);
  const r1 = view.render(roomRect(1), 1, live.clock.time, DEFAULT_LIVE_OPTIONS, quiet);
  save(`room-${t.name}`, r1.clone());
  const r4 = view.render(roomRect(4), 4, live.clock.time, DEFAULT_LIVE_OPTIONS, quiet);
  save(`room-${t.name}-x4`, r4.clone());
  const cam = new ViewCamera('exploration');
  const rest = cam.restScale('exploration', 844, 390, bounds);
  const v = cam.update(1 / 60, live.cameraTarget(390 / rest), 844, 390, bounds, true, 1 / 60);
  const p = view.render(v, rest, live.clock.time, DEFAULT_LIVE_OPTIONS, quiet);
  save(`phone-${t.name}`, p.clone());
  console.log(`${t.name.padEnd(14)} rain ${rainAt(world.seed, live.timeOffset).toFixed(2)}  room ${hashes[`room-${t.name}`]}`);
}

// Settled shots: the room after eight simulated seconds at noon and at 07:00 (dust motes need time to drift in).
// Captured last, since running the clock moves the Blobbi's animation and the hour a little.
for (const t of TIMES.filter((x) => x.name === '1200-noon' || x.name === '0700-morning')) {
  live.timeOffset = at(clearDay, t.hour);
  run(live, 60 * 8);
  stand(live, 84, 74, 'left');
  live.bubble = null;
  const r4 = view.render(roomRect(4), 4, live.clock.time, DEFAULT_LIVE_OPTIONS, quiet);
  save(`settled-${t.name}-x4`, r4.clone());
  const r1 = view.render(roomRect(1), 1, live.clock.time, DEFAULT_LIVE_OPTIONS, quiet);
  save(`settled-${t.name}-shaft-x8`, scaled(crop(r1, 76, 0, 52, 64), 8));
  console.log(`settled ${t.name.padEnd(12)} motes ${live.particles.count('mote')}`);
}

// The furniture sheet: the pieces at 1× then 6×, every colourway, on a neutral ground.
const palette = paletteFor(world.options.palette);
const KINDS = ['bed', 'chest', 'workbench', 'table', 'chair'];
const sprites = KINDS.flatMap((kind) => {
  const variants = PLACEABLE_CONTENT.find((p) => p.kind === kind)?.variants ?? 1;
  return Array.from({ length: variants }, (_, variant) => ({ kind, variant, sprite: buildingSprite({ id: `${kind}:0`, kind, x: 0, y: 0, placedAt: 0, seed: `shots/${kind}`, ...(variant ? { variant } : {}) }, palette, 1, world.options.scale) }));
});
const gap = 3;
const k = 6;
const sheetW = sprites.reduce((w, s) => w + s.sprite.buffer.width + gap, gap);
const rowH = Math.max(...sprites.map((s) => s.sprite.buffer.height));
const sheet = new PixelBuffer(sheetW * k, (rowH + gap) * (1 + k) + gap * k);
sheet.fill(hex('#3a4050'));
let x = gap;
for (const s of sprites) {
  sheet.blit(s.sprite.buffer, x, gap + rowH - s.sprite.buffer.height);
  sheet.blit(scaled(s.sprite.buffer, k), x * k, (rowH + 2 * gap) * 1 + (rowH - s.sprite.buffer.height) * k + gap);
  hashes[`sprite-${s.kind}-${s.variant}`] = { w: s.sprite.buffer.width, h: s.sprite.buffer.height, anchorX: s.sprite.anchorX, anchorY: s.sprite.anchorY, footRx: s.sprite.footRx, footRy: s.sprite.footRy, hash: frameHash(s.sprite.buffer) };
  x += s.sprite.buffer.width + gap;
}
save('furniture', sheet);
writeFileSync(`${dir}/hashes.json`, JSON.stringify(hashes, null, 2));
console.log(`wrote ${dir}/ (clear day ${clearDay}, rainy day ${rainyDay})`);
