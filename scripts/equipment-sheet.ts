/**
 * The equipment layer on a sheet: the axe icon, the Blobbi holding the axe in every view (standing and
 * walking), the swing phases, and a live frame mid-swing at a tree.
 *   npx tsx scripts/equipment-sheet.ts [blobbiSeed=blobbi-9] [outDir=examples/equipment] [zoom=4]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { blobbiIdentity } from '../src/blobbi/identity';
import { buildBlobbiSprite, REST_POSE, type BlobbiPose } from '../src/blobbi/sprite';
import { paletteFor } from '../src/world/generate';
import { attachTool, EquipmentRig, toolIcon, toolSprite, type EquipmentAnimation, type ToolOrientation } from '../src/game/equipment';
import { ITEMS } from '../src/game/items';
import { drawTinyText, LiveRenderer, Camera, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT, SWING } from '../src/sim/live-world';
import { REACH } from '../src/game/resources';

const seed = process.argv[2] ?? 'blobbi-9';
const outDir = process.argv[3] ?? 'examples/equipment';
const zoom = Number(process.argv[4] ?? 4);
mkdirSync(outDir, { recursive: true });
const palette = paletteFor('cozy');
const bg = hex('#3b6f3a');
const ink = hex('#f4efe4');
const CELL = 40;
const LABEL = 8;

/** Draw a Blobbi with the axe into a cell: the tool behind or in front as the attachment says. */
function cell(identity: ReturnType<typeof blobbiIdentity>, size: number, pose: BlobbiPose, animation: EquipmentAnimation, equipped: boolean): PixelBuffer {
  const buf = new PixelBuffer(CELL, CELL);
  buf.fill(bg);
  const rig = new EquipmentRig(identity, size);
  const spriteOf = (p: BlobbiPose) => buildBlobbiSprite(identity, p, size);
  const sprite = spriteOf(pose);
  const gx = CELL / 2;
  const gy = CELL - 6;
  const at = equipped ? attachTool(ITEMS.axe.id, pose, animation, rig, spriteOf, palette) : null;
  const drawTool = () => at && buf.blit(at.sprite.buffer, Math.round(gx + at.dx) - at.sprite.anchorX, gy + at.dy - at.sprite.anchorY);
  if (at?.behind) drawTool();
  buf.blit(sprite.buffer, gx - sprite.anchorX, gy - sprite.anchorY);
  if (at && !at.behind) drawTool();
  return buf;
}

const identity = blobbiIdentity(seed);
const rows: { label: string; cells: PixelBuffer[] }[] = [];
// Row 1: icon at 1×, 2×, 3× and the five orientations (right-handed and mirrored).
{
  const cells: PixelBuffer[] = [];
  for (const k of [1, 2, 3]) {
    const icon = toolIcon(ITEMS.axe.id, palette, k);
    const c = new PixelBuffer(CELL, CELL);
    c.fill(bg);
    c.blit(icon.buffer, Math.round((CELL - icon.buffer.width) / 2), Math.round((CELL - icon.buffer.height) / 2));
    cells.push(c);
  }
  for (const o of ['rest', 'lowered', 'raised', 'strike', 'strike-down', 'strike-up'] as ToolOrientation[])
    for (const m of [false, true]) {
      const s = toolSprite(ITEMS.axe.id, o, palette, m, 2);
      const c = new PixelBuffer(CELL, CELL);
      c.fill(bg);
      c.blit(s.buffer, Math.round((CELL - s.buffer.width) / 2), Math.round((CELL - s.buffer.height) / 2));
      cells.push(c);
    }
  rows.push({ label: 'ICON 1X 2X 3X; REST LOWERED RAISED STRIKE STRIKE-DOWN STRIKE-UP (EACH AND MIRRORED) AT 2X', cells });
}
const views: { name: string; pose: Partial<BlobbiPose> }[] = [
  { name: 'FRONT', pose: { view: 'front' } },
  { name: 'BACK', pose: { view: 'back' } },
  { name: 'LEFT', pose: { view: 'side', facing: -1 } },
  { name: 'RIGHT', pose: { view: 'side', facing: 1 } },
];
for (const size of [16, 24]) {
  // Standing: without and with the axe, each view.
  const standing: PixelBuffer[] = [];
  for (const v of views) {
    standing.push(cell(identity, size, { ...REST_POSE, ...v.pose }, 'idle', false));
    standing.push(cell(identity, size, { ...REST_POSE, ...v.pose }, 'idle', true));
  }
  rows.push({ label: `${size} PX STANDING: FRONT BACK LEFT RIGHT, EACH WITHOUT THEN WITH THE AXE`, cells: standing });
  // Walking frames with the axe, each view.
  for (const v of views) {
    const walking: PixelBuffer[] = [];
    for (let w = 0; w < 6; w++) walking.push(cell(identity, size, { ...REST_POSE, ...v.pose, walk: w as BlobbiPose['walk'] }, 'idle', true));
    rows.push({ label: `${size} PX WALKING ${v.name} WITH THE AXE, FRAMES 0-5`, cells: walking });
  }
  // Swing phases, each view.
  const swing: PixelBuffer[] = [];
  for (const v of views) for (const a of ['idle', 'raise', 'strike', 'recover'] as EquipmentAnimation[]) swing.push(cell(identity, size, { ...REST_POSE, ...v.pose }, a, true));
  rows.push({ label: `${size} PX SWING: IDLE RAISE STRIKE RECOVER, FRONT BACK LEFT RIGHT`, cells: swing });
}
// Live frames: a swing at a tree, side and front.
{
  const frames: PixelBuffer[] = [];
  const live = new LiveWorld(generateTurtleWorld('turtle-0'), seed, 16);
  live.brain.enabled = false;
  live.inventory.add(ITEMS.axe.id, 1);
  live.equip(ITEMS.axe.id);
  const renderer = new LiveRenderer(live);
  // Face a tree from below (front... no: facing up = back view) and from the left (facing right).
  const trees = live.world.objects.map((o, i) => ({ o, i })).filter(({ o, i }) => o.kind === 'tree' && live.treeAt(i).phase === 'grown' && o.size >= 26);
  const stand = (dx: number, dy: number, dir: 'up' | 'down' | 'left' | 'right') => {
    for (const { o, i } of trees) {
      const s = live.spriteOf(o);
      const x = o.x + dx * (s.footRx + 4);
      const y = o.y + dy * (s.footRy + 5);
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
  const shoot = (label: string) => {
    const camera = new Camera();
    camera.follow(live.blobbi.x, live.blobbi.y - 8, 96, 72, live.world.options.width, live.world.options.height, 0, true);
    const f = renderer.render(96, 72, camera.x, camera.y, live.clock.time, { ...DEFAULT_LIVE_OPTIONS, hud: false }).clone();
    const c = new PixelBuffer(96, 72 + LABEL);
    c.fill(hex('#1b1f2a'));
    drawTinyText(c, label, 0, 1, ink);
    c.blit(f, 0, LABEL);
    frames.push(c);
  };
  for (const [dx, dy, dir] of [[-1, 0, 'right'], [0, 1, 'up']] as const) {
    if (!stand(dx, dy, dir)) continue;
    shoot(`${dir.toUpperCase()}: REST`);
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    for (let i = 0; i < Math.round(SWING.raise * 60) - 1; i++) live.update(1 / 60, IDLE_INPUT);
    shoot('RAISE');
    for (let i = 0; i < Math.round((SWING.hit - SWING.raise) * 60) + 1; i++) live.update(1 / 60, IDLE_INPUT);
    shoot('STRIKE, IMPACT');
    for (let i = 0; i < Math.round((SWING.end - SWING.hit) * 60) + 2; i++) live.update(1 / 60, IDLE_INPUT);
    shoot('RECOVERED');
  }
  const live2 = new PixelBuffer(frames.length * 100, 72 + LABEL + 4);
  live2.fill(hex('#1b1f2a'));
  frames.forEach((f, i) => live2.blit(f, i * 100, 2));
  writeFileSync(join(outDir, 'axe-swing-live.png'), toPng(live2.scaled(zoom)));
}

const cols = Math.max(...rows.map((r) => r.cells.length));
const sheet = new PixelBuffer(cols * (CELL + 2) + 2, rows.length * (CELL + LABEL + 4) + 2);
sheet.fill(hex('#1b1f2a'));
rows.forEach((r, j) => {
  const y = 2 + j * (CELL + LABEL + 4);
  drawTinyText(sheet, r.label, 2, y, ink);
  r.cells.forEach((c, i) => sheet.blit(c, 2 + i * (CELL + 2), y + LABEL));
});
writeFileSync(join(outDir, `axe-${seed}.png`), toPng(sheet.scaled(zoom)));
console.log(`wrote ${join(outDir, `axe-${seed}.png`)} and axe-swing-live.png`);
