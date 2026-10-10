/**
 * Headless autonomy run: let the Blobbi live on a turtle world for N simulated seconds, write frames every
 * few seconds, and report the behaviours it went through and whether it ever stood on blocked ground.
 *   npx tsx scripts/autonomy-run.ts [worldSeed=turtle-0] [blobbiSeed=blobbi-9] [seconds=90] [outDir=out/autonomy]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toPng } from '../src/node/png';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { LiveRenderer, Camera, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';

const worldSeed = process.argv[2] ?? 'turtle-0';
const blobbiSeed = process.argv[3] ?? 'blobbi-9';
const seconds = Number(process.argv[4] ?? 90);
const outDir = process.argv[5] ?? 'out/autonomy';
mkdirSync(outDir, { recursive: true });
const world = generateTurtleWorld(worldSeed);
const live = new LiveWorld(world, blobbiSeed, 16);
const renderer = new LiveRenderer(live);
const camera = new Camera();
const viewW = 352;
const viewH = 240;
const states = new Map<string, number>();
const targets = new Set<string>();
let offGround = 0;
let frame = 0;
const t0 = performance.now();
for (let i = 0; i < seconds * 60; i++) {
  live.update(1 / 60, IDLE_INPUT);
  const b = live.blobbi;
  if (!live.collision.canStand(b.x, b.y, b.footRx, b.footRy)) offGround++;
  states.set(live.brain.state, (states.get(live.brain.state) ?? 0) + 1);
  if (live.brain.target) targets.add(`${Math.round(live.brain.target.x)},${Math.round(live.brain.target.y)}`);
  if (i % (60 * 6) === 0) {
    camera.follow(b.x, b.y - 6, viewW, viewH, world.options.width, world.options.height, 1, true);
    const img = renderer.render(viewW, viewH, camera.x, camera.y, live.clock.time, { ...DEFAULT_LIVE_OPTIONS, debugPath: true });
    writeFileSync(join(outDir, `t${String(Math.round(i / 60)).padStart(3, '0')}.png`), toPng(img.scaled(3)));
    frame++;
  }
}
const ms = performance.now() - t0;
console.log(`${seconds}s simulated in ${ms.toFixed(0)} ms; states: ${[...states.entries()].map(([k, v]) => `${k} ${(v / 60).toFixed(1)}s`).join(', ')}; distinct targets ${targets.size}; steps off walkable ground ${offGround}; frames ${frame}; nav free cells ${live.nav.freeCount()}`);
