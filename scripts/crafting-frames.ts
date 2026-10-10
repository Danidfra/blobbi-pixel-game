/**
 * Headless frames of the M2.2 loop: gather, craft the axe, chop a tree three times, the stump, the
 * regrowth stages, and the same tree after a reload mid-regrowth.
 *   npx tsx scripts/crafting-frames.ts [worldSeed=turtle-0] [outDir=examples/crafting]
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
import { ITEMS } from '../src/game/items';
import { RECIPES } from '../src/game/crafting';
import { REGROW_SECONDS, STUMP_SECONDS } from '../src/game/trees';

const seed = process.argv[2] ?? 'turtle-0';
const outDir = process.argv[3] ?? 'examples/crafting';
mkdirSync(outDir, { recursive: true });
const store = memoryStore();
const W = 176;
const H = 120;
const GAP = 6;
const LABEL = 10;
const panels: { label: string; frame: PixelBuffer }[] = [];
const shoot = (live: LiveWorld, renderer: LiveRenderer, label: string) => {
  const camera = new Camera();
  camera.follow(live.blobbi.x, live.blobbi.y - 10, W, H, live.world.options.width, live.world.options.height, 0, true);
  panels.push({ label, frame: renderer.render(W, H, camera.x, camera.y, live.clock.time, DEFAULT_LIVE_OPTIONS).clone() });
};
const steps = (live: LiveWorld, n: number, input = IDLE_INPUT) => {
  for (let i = 0; i < n; i++) live.update(1 / 60, input);
};
const press = (live: LiveWorld) => live.update(1 / 60, { ...IDLE_INPUT, interact: true });
function faceTree(live: LiveWorld): number {
  for (let i = 0; i < live.world.objects.length; i++) {
    const o = live.world.objects[i];
    if (o.kind !== 'tree' || live.treeAt(i).phase !== 'grown' || o.size < 28) continue;
    const s = live.spriteOf(o);
    const x = o.x;
    const y = o.y + s.footRy + 5;
    if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
    live.blobbi.x = x;
    live.blobbi.y = y;
    live.update(1 / 60, { ...IDLE_INPUT, up: true });
    live.blobbi.x = x;
    live.blobbi.y = y;
    if (live.facingObject()?.index === i) {
      live.resources = live.resources.filter((n) => Math.hypot(n.x - x, (n.y - y) * 1.25) > REACH + 2);
      return i;
    }
  }
  throw new Error('no tree');
}

let live = new LiveWorld(generateTurtleWorld(seed), 'blobbi-9', 16, { store });
live.brain.enabled = false;
let renderer = new LiveRenderer(live);
steps(live, 20);
// Gather: three sticks and two stones, by walking up to them.
for (const kind of ['stick', 'stick', 'stick', 'stone', 'stone'] as const) {
  // Walk up to a node of this kind such that it is the one in reach, then press E.
  let done = false;
  for (const node of live.resources.filter((n) => n.kind === kind)) {
    for (let k = 0; k < 16 && !done; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = node.x + Math.cos(a) * (REACH - 4);
      const y = node.y + (Math.sin(a) * (REACH - 4)) / 1.25;
      if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
      live.blobbi.x = x;
      live.blobbi.y = y;
      if (live.nearestResource() !== node) continue;
      press(live);
      steps(live, 5);
      done = true;
    }
    if (done) break;
  }
  if (!done) throw new Error(`could not gather a ${kind}`);
}
shoot(live, renderer, 'GATHERED 3 STICKS 2 STONES');
live.craftRecipe(RECIPES[0]);
steps(live, 6);
shoot(live, renderer, 'C: CRAFTED THE AXE');
live.equip(ITEMS.axe.id);
const index = faceTree(live);
steps(live, 2);
shoot(live, renderer, 'Q: AXE EQUIPPED, FACING A TREE');
press(live);
steps(live, 4);
shoot(live, renderer, 'E: CHOP 1-3');
press(live);
steps(live, 30);
press(live);
steps(live, 8);
shoot(live, renderer, 'FELLED: WOOD, LEAVES, A STUMP');
steps(live, 90);
shoot(live, renderer, `STUMP (${STUMP_SECONDS} S)`);
steps(live, Math.round((STUMP_SECONDS + 10) * 60));
shoot(live, renderer, 'REGROWING: SEEDLING');
steps(live, Math.round(REGROW_SECONDS * 60 * 0.45));
shoot(live, renderer, 'REGROWING: SAPLING');
live.save();
const t = live.worldTime;
live = new LiveWorld(generateTurtleWorld(seed), 'blobbi-9', 16, { store });
live.brain.enabled = false;
renderer = new LiveRenderer(live);
faceTree(live); // another tree, we only need the camera near the first
live.blobbi.x = live.world.objects[index].x;
live.blobbi.y = live.world.objects[index].y + 14;
steps(live, 1);
shoot(live, renderer, `RELOAD AT ${t.toFixed(0)} S: STILL A SAPLING`);
steps(live, Math.round(REGROW_SECONDS * 60 * 0.6));
shoot(live, renderer, 'GROWN AGAIN');
console.log(`tree ${index}: ${live.treeAt(index).phase}; wood ${live.inventory.count(ITEMS.wood.id)}; equipped ${live.equipped}`);

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
writeFileSync(join(outDir, `${seed}-crafting.png`), toPng(sheet.scaled(3)));
console.log(`wrote ${join(outDir, `${seed}-crafting.png`)}`);
