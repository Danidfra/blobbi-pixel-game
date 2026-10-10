/**
 * Headless frames of the gathering loop: a resource in reach with its marker, the pickup, the counter,
 * then a "reload" on the same store showing the node gone and the inventory kept.
 *   npx tsx scripts/gathering-frames.ts [worldSeed=turtle-0] [outDir=examples/gathering]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { LiveRenderer, Camera, DEFAULT_LIVE_OPTIONS, drawTinyText } from '../src/render/live-render';
import { memoryStore } from '../src/game/persistence';
import { REACH } from '../src/game/resources';

const seed = process.argv[2] ?? 'turtle-0';
const outDir = process.argv[3] ?? 'examples/gathering';
mkdirSync(outDir, { recursive: true });
const store = memoryStore();
const W = 176;
const H = 120;
const GAP = 6;
const LABEL = 10;
const panels: { label: string; frame: PixelBuffer }[] = [];

const shoot = (live: LiveWorld, renderer: LiveRenderer, label: string) => {
  const camera = new Camera();
  camera.follow(live.blobbi.x, live.blobbi.y - 6, W, H, live.world.options.width, live.world.options.height, 0, true);
  panels.push({ label, frame: renderer.render(W, H, camera.x, camera.y, live.clock.time, DEFAULT_LIVE_OPTIONS).clone() });
};
const standNear = (live: LiveWorld, node: { x: number; y: number }, d: number) => {
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + Math.PI;
    const x = node.x + Math.cos(a) * d;
    const y = node.y + (Math.sin(a) * d) / 1.25;
    if (live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) {
      live.blobbi.x = x;
      live.blobbi.y = y;
      return true;
    }
  }
  return false;
};

let live = new LiveWorld(generateTurtleWorld(seed), 'blobbi-9', 16, { store });
let renderer = new LiveRenderer(live);
for (let i = 0; i < 30; i++) live.update(1 / 60, IDLE_INPUT);
const kinds = ['stick', 'stone', 'seed'] as const;
for (const kind of kinds) {
  const node = live.resources.find((n) => n.kind === kind)!;
  standNear(live, node, REACH - 4);
  live.update(1 / 60, { ...IDLE_INPUT, down: true });
  shoot(live, renderer, `${kind.toUpperCase()} IN REACH`);
  live.update(1 / 60, { ...IDLE_INPUT, interact: true });
  for (let i = 0; i < 8; i++) live.update(1 / 60, IDLE_INPUT);
  shoot(live, renderer, `E: PICKUP`);
  for (let i = 0; i < 40; i++) live.update(1 / 60, IDLE_INPUT);
  shoot(live, renderer, `COLLECTED ${live.inventory.total()}`);
}
const collected = [...live.collected];
console.log(`collected ${collected.join(', ')}; inventory ${JSON.stringify(live.inventory.entries())}; ${live.resources.length}/${live.allResources.length} nodes left`);
// Reload on the same store.
live = new LiveWorld(generateTurtleWorld(seed), 'blobbi-9', 16, { store });
renderer = new LiveRenderer(live);
const first = live.allResources.find((n) => n.id === collected[0])!;
standNear(live, first, REACH - 4);
live.update(1 / 60, { ...IDLE_INPUT, down: true });
shoot(live, renderer, `RELOAD: NODE GONE, BAG KEPT`);
console.log(`after reload: ${live.resources.length}/${live.allResources.length} nodes, inventory ${JSON.stringify(live.inventory.entries())}`);

const cols = 5;
const rows = Math.ceil(panels.length / cols);
const sheet = new PixelBuffer(cols * (W + GAP) + GAP, rows * (H + LABEL + GAP) + GAP);
sheet.fill(hex('#1b1f2a'));
panels.forEach((p, i) => {
  const x = GAP + (i % cols) * (W + GAP);
  const y = GAP + Math.floor(i / cols) * (H + LABEL + GAP);
  drawTinyText(sheet, p.label, x, y, hex('#f4efe4'));
  sheet.blit(p.frame, x, y + LABEL);
});
writeFileSync(join(outDir, `${seed}-gathering.png`), toPng(sheet.scaled(3)));
console.log(`wrote ${join(outDir, `${seed}-gathering.png`)}`);
