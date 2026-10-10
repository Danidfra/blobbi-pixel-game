/**
 * M3.2 frames: the pickaxe (icon, four directions), mining a large rock (rest, raise, strike, rubble with the
 * stones), the rock whole again, and a stick growing back.
 *   npx tsx scripts/mining-frames.ts [worldSeed=turtle-0] [outDir=examples/mining]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT, SWING } from '../src/sim/live-world';
import { LiveRenderer, Camera, DEFAULT_LIVE_OPTIONS, drawTinyText } from '../src/render/live-render';
import { ITEMS } from '../src/game/items';
import { toolIcon } from '../src/game/equipment';
import { HITS_TO_MINE, LARGE_ROCK_SIZE, RUBBLE_SECONDS } from '../src/game/rocks';
import { RESPAWN_SECONDS } from '../src/game/resources';
import { paletteFor } from '../src/world/generate';

const seed = process.argv[2] ?? 'turtle-0';
const outDir = process.argv[3] ?? 'examples/mining';
mkdirSync(outDir, { recursive: true });
const W = 120;
const H = 84;
const LABEL = 10;
const GAP = 6;
const panels: { label: string; frame: PixelBuffer }[] = [];
const live = new LiveWorld(generateTurtleWorld(seed), 'blobbi-9', 16);
live.brain.enabled = false;
const renderer = new LiveRenderer(live);
const steps = (n: number, input = IDLE_INPUT) => {
  for (let i = 0; i < n; i++) live.update(1 / 60, input);
};
const shoot = (label: string, at = { x: live.blobbi.x, y: live.blobbi.y - 8 }) => {
  const camera = new Camera();
  camera.follow(at.x, at.y, W, H, live.world.options.width, live.world.options.height, 0, true);
  panels.push({ label, frame: renderer.render(W, H, camera.x, camera.y, live.clock.time, DEFAULT_LIVE_OPTIONS).clone() });
};
// The icon panel.
{
  const f = new PixelBuffer(W, H);
  f.fill(hex('#3b6f3a'));
  const palette = paletteFor('cozy');
  [1, 2, 3, 4].forEach((k, i) => {
    const icon = toolIcon(ITEMS.pickaxe.id, palette, k);
    f.blit(icon.buffer, 6 + i * 26 + Math.round((24 - icon.buffer.width) / 2), Math.round((H - icon.buffer.height) / 2));
  });
  panels.push({ label: 'PICKAXE ICON 1X-4X', frame: f });
}
live.inventory.add(ITEMS.pickaxe.id, 1);
live.equip(ITEMS.pickaxe.id);
for (const dir of ['down', 'up', 'left', 'right'] as const) {
  steps(1, { ...IDLE_INPUT, [dir]: true });
  steps(10);
  shoot(`FACING ${dir === 'down' ? 'FRONT' : dir === 'up' ? 'BACK' : dir.toUpperCase()}${dir === 'right' ? ' (HIDDEN)' : ''}`);
}
// Face a large rock from below.
let index = -1;
for (let i = 0; i < live.world.objects.length && index < 0; i++) {
  const o = live.world.objects[i];
  if (o.kind !== 'rock' || o.size < LARGE_ROCK_SIZE) continue;
  const s = live.spriteOf(o);
  const x = o.x;
  const y = o.y + s.footRy + 5;
  if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
  live.blobbi.x = x;
  live.blobbi.y = y;
  steps(1, { ...IDLE_INPUT, up: true });
  live.blobbi.x = x;
  live.blobbi.y = y;
  if (live.facingObject()?.index === i) index = i;
}
if (index < 0) throw new Error('no large rock');
live.resources = live.resources.filter((n) => Math.hypot(n.x - live.blobbi.x, n.y - live.blobbi.y) > 14);
shoot('A LARGE ROCK');
live.update(1 / 60, { ...IDLE_INPUT, interact: true });
steps(Math.round(SWING.raise * 60) - 1);
shoot('RAISE');
steps(Math.round((SWING.hit - SWING.raise) * 60) + 1);
shoot('STRIKE: MINE 1/4');
steps(20);
for (let i = 1; i < HITS_TO_MINE; i++) {
  live.update(1 / 60, { ...IDLE_INPUT, interact: true });
  steps(Math.round(SWING.end * 60) + 4);
}
steps(6);
shoot(`RUBBLE: +${live.inventory.count(ITEMS.stone.id)} STONE`);
steps(RUBBLE_SECONDS * 60 + 30);
shoot(`${RUBBLE_SECONDS} S LATER: WHOLE AGAIN`);
// A stick grows back.
const stick = live.resources.find((n) => n.kind === 'stick' && live.resources.every((m) => m === n || Math.hypot(m.x - n.x, m.y - n.y) > 24))!;
live.blobbi.x = stick.x + 5;
live.blobbi.y = stick.y + 4;
steps(1, { ...IDLE_INPUT, left: true });
live.blobbi.x = stick.x + 5;
live.blobbi.y = stick.y + 4;
shoot('A STICK');
live.collect();
steps(40);
shoot('PICKED UP');
live.blobbi.x = stick.x + 40;
steps((RESPAWN_SECONDS.stick + 2) * 60);
shoot(`${RESPAWN_SECONDS.stick} S LATER: GROWN BACK`, { x: stick.x, y: stick.y - 8 });

const cols = 4;
const rows = Math.ceil(panels.length / cols);
const sheet = new PixelBuffer(cols * (W + GAP) + GAP, rows * (H + LABEL + GAP) + GAP);
sheet.fill(hex('#1b1f2a'));
panels.forEach((p, i) => {
  const x = GAP + (i % cols) * (W + GAP);
  const y = GAP + Math.floor(i / cols) * (H + LABEL + GAP);
  drawTinyText(sheet, p.label, x, y, hex('#f4efe4'));
  sheet.blit(p.frame, x, y + LABEL);
});
writeFileSync(join(outDir, `${seed}-mining.png`), toPng(sheet.scaled(3)));
console.log(`wrote ${join(outDir, `${seed}-mining.png`)}; rock ${index}, stones ${live.inventory.count(ITEMS.stone.id)}`);
