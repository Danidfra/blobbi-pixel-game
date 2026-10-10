/**
 * Headless smoke test of the living world: run a scripted input sequence
 * through the simulation and write a few frames to PNG.
 *   npx tsx scripts/live-frames.ts [worldSeed] [blobbiSeed] [outDir]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toPng } from '../src/node/png';
import { generateWorld } from '../src/world/generate';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT, type LiveInput } from '../src/sim/live-world';
import { LiveRenderer, Camera, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';

const worldSeed = process.argv[2] ?? 'blobbi';
const blobbiSeed = process.argv[3] ?? 'abc123';
const outDir = process.argv[4] ?? 'out/live';
mkdirSync(outDir, { recursive: true });
const kind = process.argv[8] ?? 'island';
const world = kind === 'turtle' ? generateTurtleWorld(worldSeed) : generateWorld(worldSeed);
const live = new LiveWorld(world, blobbiSeed, Number(process.argv[5] ?? 16));
const renderer = new LiveRenderer(live);
const camera = new Camera();
const viewW = Number(process.argv[6] ?? 352);
const viewH = Number(process.argv[7] ?? 224);
const script: { input: Partial<LiveInput>; seconds: number }[] = [
  { input: {}, seconds: 1 },
  { input: { right: true }, seconds: 1.5 },
  { input: { down: true }, seconds: 0.8 },
  { input: { left: true }, seconds: 0.6 },
  { input: { up: true }, seconds: 0.5 },
  { input: { interact: true }, seconds: 0.05 },
  { input: {}, seconds: 0.6 },
  { input: { plant: true }, seconds: 0.05 },
  { input: {}, seconds: 3 },
];
let frameNo = 0;
let total = 0;
const t0 = performance.now();
for (const part of script) {
  const steps = Math.round(part.seconds * 60);
  for (let i = 0; i < steps; i++) {
    const input: LiveInput = { ...IDLE_INPUT, ...part.input, interact: i === 0 && !!part.input.interact, plant: i === 0 && !!part.input.plant };
    live.update(1 / 60, input);
    camera.follow(live.blobbi.x, live.blobbi.y, viewW, viewH, world.options.width, world.options.height, 1 / 60, total === 0);
    const frame = renderer.render(viewW, viewH, camera.x, camera.y, live.clock.time, DEFAULT_LIVE_OPTIONS);
    total++;
    if (total % 30 === 0 || i === 0) writeFileSync(join(outDir, `frame-${String(frameNo++).padStart(3, '0')}.png`), toPng(frame.scaled(3)));
  }
}
const ms = performance.now() - t0;
live.growDuration = 1;
console.log(`${total} frames in ${ms.toFixed(0)} ms (${(ms / total).toFixed(2)} ms/frame); blobbi at ${live.blobbi.x.toFixed(1)},${live.blobbi.y.toFixed(1)}; particles ${live.particles.particles.length}; planted ${live.planted.length}; last timings ${JSON.stringify(renderer.timings)}`);
