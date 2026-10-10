/**
 * The four-direction equipment comparison: the Blobbi with the axe facing front, back, left and right, standing
 * and walking, at 6×; plus live frames of a swing while facing right (the axe in the far hand, behind the body).
 *   npx tsx scripts/four-directions.ts [blobbiSeed=blobbi-9] [outDir=examples/equipment]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { blobbiIdentity } from '../src/blobbi/identity';
import { buildBlobbiSprite, REST_POSE, type BlobbiPose } from '../src/blobbi/sprite';
import { paletteFor } from '../src/world/generate';
import { attachTool, EquipmentRig, type EquipmentAnimation } from '../src/game/equipment';
import { ITEMS } from '../src/game/items';
import { drawTinyText, LiveRenderer, Camera, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT, SWING } from '../src/sim/live-world';
import { REACH } from '../src/game/resources';

const seed = process.argv[2] ?? 'blobbi-9';
const outDir = process.argv[3] ?? 'examples/equipment';
mkdirSync(outDir, { recursive: true });
const palette = paletteFor('cozy');
const identity = blobbiIdentity(seed);
const bg = hex('#3b6f3a');
const ink = hex('#f4efe4');
const CELL = 36;
const LABEL = 8;

function cell(size: number, pose: BlobbiPose, animation: EquipmentAnimation): PixelBuffer {
  const buf = new PixelBuffer(CELL, CELL);
  buf.fill(bg);
  const rig = new EquipmentRig(identity, size);
  const spriteOf = (p: BlobbiPose) => buildBlobbiSprite(identity, p, size);
  const sprite = spriteOf(pose);
  const gx = CELL / 2;
  const gy = CELL - 6;
  const at = attachTool(ITEMS.axe.id, pose, animation, rig, spriteOf, palette);
  const drawTool = () => at.visible && buf.blit(at.sprite.buffer, Math.round(gx + at.dx) - at.sprite.anchorX, gy + at.dy - at.sprite.anchorY);
  if (at.behind) drawTool();
  buf.blit(sprite.buffer, gx - sprite.anchorX, gy - sprite.anchorY);
  if (!at.behind) drawTool();
  return buf;
}

const views: { name: string; pose: Partial<BlobbiPose>; rule: string }[] = [
  { name: 'FRONT', pose: { view: 'front' }, rule: 'VISIBLE, VIEWERS RIGHT' },
  { name: 'BACK', pose: { view: 'back' }, rule: 'VISIBLE, VIEWERS LEFT' },
  { name: 'LEFT', pose: { view: 'side', facing: -1 }, rule: 'VISIBLE, NEAR HAND' },
  { name: 'RIGHT', pose: { view: 'side', facing: 1 }, rule: 'HIDDEN, FAR HAND' },
];
const rows: { label: string; cells: PixelBuffer[] }[] = [];
rows.push({ label: 'STANDING: FRONT (VISIBLE, VIEWERS RIGHT)  BACK (VISIBLE, VIEWERS LEFT)  LEFT (VISIBLE)  RIGHT (HIDDEN)', cells: views.map((v) => cell(16, { ...REST_POSE, ...v.pose }, 'idle')) });
for (const v of views) rows.push({ label: `WALKING ${v.name}: ${v.rule}, FRAMES 0-5`, cells: Array.from({ length: 6 }, (_, w) => cell(16, { ...REST_POSE, ...v.pose, walk: w as BlobbiPose['walk'] }, 'idle')) });
rows.push({ label: 'SWING RAISE / STRIKE / RECOVER: FRONT  BACK  LEFT  RIGHT (BEHIND THE BODY)', cells: views.flatMap((v) => (['raise', 'strike', 'recover'] as EquipmentAnimation[]).map((a) => cell(16, { ...REST_POSE, ...v.pose }, a))) });

const cols = Math.max(...rows.map((r) => r.cells.length));
const sheet = new PixelBuffer(cols * (CELL + 2) + 2, rows.length * (CELL + LABEL + 4) + 2);
sheet.fill(hex('#1b1f2a'));
rows.forEach((r, j) => {
  const y = 2 + j * (CELL + LABEL + 4);
  drawTinyText(sheet, r.label, 2, y, ink);
  r.cells.forEach((c, i) => sheet.blit(c, 2 + i * (CELL + 2), y + LABEL));
});
writeFileSync(join(outDir, 'four-directions.png'), toPng(sheet.scaled(6)));

// Live: chopping while facing right, then facing up.
const live = new LiveWorld(generateTurtleWorld('turtle-0'), seed, 16);
live.brain.enabled = false;
live.inventory.add(ITEMS.axe.id, 1);
live.equip(ITEMS.axe.id);
const renderer = new LiveRenderer(live);
const frames: PixelBuffer[] = [];
const shoot = (label: string) => {
  const camera = new Camera();
  camera.follow(live.blobbi.x, live.blobbi.y - 8, 80, 60, live.world.options.width, live.world.options.height, 0, true);
  const f = renderer.render(80, 60, camera.x, camera.y, live.clock.time, { ...DEFAULT_LIVE_OPTIONS, hud: false }).clone();
  const c = new PixelBuffer(80, 60 + LABEL);
  c.fill(hex('#1b1f2a'));
  drawTinyText(c, label, 0, 1, ink);
  c.blit(f, 0, LABEL);
  frames.push(c);
};
const stand = (dir: 'up' | 'right') => {
  for (let i = 0; i < live.world.objects.length; i++) {
    const o = live.world.objects[i];
    if (o.kind !== 'tree' || live.treeAt(i).phase !== 'grown' || o.size < 26) continue;
    const s = live.spriteOf(o);
    const x = dir === 'right' ? o.x - s.footRx - 5 : o.x;
    const y = dir === 'right' ? o.y : o.y + s.footRy + 5;
    if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
    live.blobbi.x = x;
    live.blobbi.y = y;
    live.update(1 / 60, { ...IDLE_INPUT, [dir]: true });
    live.blobbi.x = x;
    live.blobbi.y = y;
    if (live.facingObject()?.index === i) {
      live.resources = live.resources.filter((n) => Math.hypot(n.x - x, (n.y - y) * 1.25) > REACH + 2);
      return true;
    }
  }
  return false;
};
for (const dir of ['right', 'up'] as const) {
  if (!stand(dir)) continue;
  for (let i = 0; i < 6; i++) live.update(1 / 60, IDLE_INPUT);
  shoot(`${dir.toUpperCase()}: REST`);
  live.update(1 / 60, { ...IDLE_INPUT, interact: true });
  for (let i = 0; i < Math.round(SWING.raise * 60) - 1; i++) live.update(1 / 60, IDLE_INPUT);
  shoot('RAISE');
  for (let i = 0; i < Math.round((SWING.hit - SWING.raise) * 60) + 1; i++) live.update(1 / 60, IDLE_INPUT);
  shoot('STRIKE, IMPACT');
  for (let i = 0; i < Math.round((SWING.end - SWING.hit) * 60) + 2; i++) live.update(1 / 60, IDLE_INPUT);
  shoot('RECOVERED');
}
const liveSheet = new PixelBuffer(frames.length * 84, 60 + LABEL + 4);
liveSheet.fill(hex('#1b1f2a'));
frames.forEach((f, i) => liveSheet.blit(f, i * 84 + 2, 2));
writeFileSync(join(outDir, 'four-directions-chop-live.png'), toPng(liveSheet.scaled(5)));
console.log(`wrote ${join(outDir, 'four-directions.png')} and four-directions-chop-live.png`);
