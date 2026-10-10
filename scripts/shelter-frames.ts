/**
 * Headless frames of the first building loop: the placement preview (valid, then invalid against a tree), the
 * placement, construction stages, the finished shelter, and the shelter after a reload.
 *   npx tsx scripts/shelter-frames.ts [worldSeed=turtle-0] [outDir=examples/building]
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
import { ITEMS } from '../src/game/items';
import { BUILDINGS } from '../src/game/buildings';

const seed = process.argv[2] ?? 'turtle-0';
const outDir = process.argv[3] ?? 'examples/building';
mkdirSync(outDir, { recursive: true });
const store = memoryStore();
const W = 160;
const H = 110;
const GAP = 6;
const LABEL = 10;
const panels: { label: string; frame: PixelBuffer }[] = [];
const shoot = (live: LiveWorld, renderer: LiveRenderer, label: string, at?: { x: number; y: number }) => {
  const camera = new Camera();
  const c = at ?? { x: live.blobbi.x, y: live.blobbi.y - 6 };
  camera.follow(c.x, c.y, W, H, live.world.options.width, live.world.options.height, 0, true);
  panels.push({ label, frame: renderer.render(W, H, camera.x, camera.y, live.clock.time, DEFAULT_LIVE_OPTIONS).clone() });
};
const steps = (live: LiveWorld, n: number) => {
  for (let i = 0; i < n; i++) live.update(1 / 60, IDLE_INPUT);
};
function findSpot(live: LiveWorld): boolean {
  const hub = live.world.hubs[0];
  for (let r = 0; r < 80; r += 4)
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = Math.round(hub.x + Math.cos(a) * r);
      const y = Math.round(hub.y + Math.sin(a) * r * 0.7);
      if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
      live.blobbi.x = x;
      live.blobbi.y = y;
      live.update(1 / 60, { ...IDLE_INPUT, down: true });
      live.blobbi.x = x;
      live.blobbi.y = y;
      if (live.placementCheck('shelter').ok) return true;
    }
  return false;
}

let live = new LiveWorld(generateTurtleWorld(seed), 'blobbi-9', 16, { store });
live.brain.enabled = false;
let renderer = new LiveRenderer(live);
steps(live, 10);
live.inventory.add(ITEMS.wood.id, 6);
live.inventory.add(ITEMS.stone.id, 3);
if (!findSpot(live)) throw new Error('no spot');
const spot = { ...live.blobbi };
live.setBuildMode('shelter');
steps(live, 1);
shoot(live, renderer, 'B: PREVIEW, FITS (GREEN)');
// Invalid: facing a tree.
const tree = live.world.objects.find((o) => o.kind === 'tree' && Math.hypot(o.x - spot.x, o.y - spot.y) < 120)!;
live.blobbi.x = tree.x;
live.blobbi.y = tree.y + live.spriteOf(tree).footRy + 8;
live.update(1 / 60, { ...IDLE_INPUT, up: true });
live.blobbi.x = tree.x;
live.blobbi.y = tree.y + live.spriteOf(tree).footRy + 8;
shoot(live, renderer, 'PREVIEW ON A TREE (RED)');
// Back to the spot, place.
live.blobbi.x = spot.x;
live.blobbi.y = spot.y;
live.update(1 / 60, { ...IDLE_INPUT, down: true });
live.blobbi.x = spot.x;
live.blobbi.y = spot.y;
live.update(1 / 60, { ...IDLE_INPUT, interact: true });
const b = live.buildings[0];
steps(live, 6);
shoot(live, renderer, 'E: PLACED, 6 WOOD 3 STONE PAID');
const secs = BUILDINGS.shelter.buildSeconds;
steps(live, Math.round(secs * 60 * 0.3));
shoot(live, renderer, `BUILDING ${Math.round(live.buildingAt(b) * 100)}%`);
steps(live, Math.round(secs * 60 * 0.3));
shoot(live, renderer, `BUILDING ${Math.round(live.buildingAt(b) * 100)}%`);
steps(live, Math.round(secs * 60 * 0.25));
shoot(live, renderer, `BUILDING ${Math.round(live.buildingAt(b) * 100)}%`);
steps(live, Math.round(secs * 60 * 0.2));
shoot(live, renderer, 'FINISHED SHELTER');
// Walk up and greet it.
live.blobbi.x = b.x;
live.blobbi.y = b.y + BUILDINGS.shelter.footRy + 6;
live.update(1 / 60, { ...IDLE_INPUT, up: true });
live.update(1 / 60, { ...IDLE_INPUT, interact: true });
steps(live, 12);
shoot(live, renderer, 'E AT THE DOOR');
live.save();
live = new LiveWorld(generateTurtleWorld(seed), 'blobbi-9', 16, { store });
live.brain.enabled = false;
renderer = new LiveRenderer(live);
steps(live, 2);
shoot(live, renderer, 'RELOAD: STILL THERE, STILL BLOCKING', { x: b.x, y: b.y - 6 });
console.log(`building at ${b.x},${b.y}; after reload ${live.buildings.length} building(s), blocked ${live.collision.isBlocked(b.x, b.y)}`);

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
writeFileSync(join(outDir, `${seed}-shelter.png`), toPng(sheet.scaled(3)));
console.log(`wrote ${join(outDir, `${seed}-shelter.png`)}`);
