/**
 * M3.3 follow-up evidence: native Blobbi renders at 12, 14, 16, 24, 32, 48 and 64 px of the same seed, genome,
 * expression and walk phase; walk cycles at 12, 14 and 16 px before (raw raster) and after (whole-pixel rig
 * motion), as a still filmstrip and as animated GIFs; the overview by the shelter door at 16 px (before) and
 * 12 px (after).
 *   npx tsx scripts/walk-compare.ts [outDir=examples/camera/walk]
 * Every enlargement here is for inspection only (nearest-neighbour, labelled); the game never enlarges a sprite.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer, type Sprite } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { toGif } from '../src/node/gif';
import { buildCanonicalSprite } from '../src/blobbi/canonical';
import { REST_POSE, type BlobbiPose } from '../src/blobbi/sprite';
import { blobbiIdentity } from '../src/blobbi/identity';
import { WALK_CYCLE_HZ } from '../src/blobbi/animation';
import { drawTinyText, LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewCamera, worldBounds } from '../src/render/view-camera';
import { ViewRenderer } from '../src/render/view-renderer';
import { cameraScene } from './camera-scene';

const outDir = process.argv[2] ?? 'examples/camera/walk';
mkdirSync(outDir, { recursive: true });
const SEED = 'blobbi-9';
const genome = blobbiIdentity(SEED).genome;
const INK = hex('#f4efe4');
const BG = hex('#141821');
const GROUND = hex('#6fbf4a');

/** Draw `s` with its anchor at (x, y), each pixel a k×k block (inspection only). */
function blitZoom(dst: PixelBuffer, s: Sprite, x: number, y: number, k: number): void {
  for (let j = 0; j < s.buffer.height; j++)
    for (let i = 0; i < s.buffer.width; i++) {
      const c = s.buffer.get(i, j);
      if (!(c >>> 24)) continue;
      dst.fillRect(x + (i - s.anchorX) * k, y + (j - s.anchorY) * k, k, k, c);
    }
}

// ── 1. Native renders at five sizes: walk phase 1, front and side, the same genome and expression ──────────
{
  const sizes = [12, 14, 16, 24, 32, 48, 64];
  const poses: [string, BlobbiPose][] = [
    ['FRONT, WALK 1', { ...REST_POSE, walk: 1 }],
    ['SIDE, WALK 1', { ...REST_POSE, view: 'side', walk: 1 }],
    ['FRONT, HAPPY', { ...REST_POSE, expression: 'happy' }],
  ];
  const cellW = 90;
  const rowH = 96;
  const sheet = new PixelBuffer(16 + sizes.length * cellW, 20 + poses.length * (rowH + 112) + 8);
  sheet.fill(BG);
  drawTinyText(sheet, `NATIVE RENDERS 1-1, SEED ${SEED.toUpperCase()} - TOP ROW OF EACH PAIR ACTUAL PIXELS, BELOW SCALED TO 64 FOR INSPECTION`, 8, 6, INK);
  poses.forEach(([label, pose], r) => {
    const y0 = 20 + r * (rowH + 112);
    drawTinyText(sheet, label, 8, y0, INK);
    sizes.forEach((size, i) => {
      const s = buildCanonicalSprite(genome, pose, size);
      const x = 8 + i * cellW + cellW / 2;
      drawTinyText(sheet, `${size} PX`, x - 12, y0 + 10, INK);
      sheet.fillRect(x - 40, y0 + 18 + 72, 80, 1, GROUND);
      blitZoom(sheet, s, x, y0 + 18 + 71, 1);
      // Inspection: each to 64 px tall by a whole factor (64 shown as is).
      const k = Math.max(1, Math.floor(64 / size));
      sheet.fillRect(x - 44, y0 + rowH + 100, 88, 1, GROUND);
      blitZoom(sheet, s, x, y0 + rowH + 99, k);
      drawTinyText(sheet, k > 1 ? `X${k}` : 'NATIVE', x - 10, y0 + rowH + 104, hex('#9aa3b5'));
    });
  });
  writeFileSync(join(outDir, 'native-sizes.png'), toPng(sheet));
}

// ── 2. Walk cycles before/after at 12, 14, 16 px: filmstrip and GIF ──────────────────────────────────────────
const K = 6; // inspection zoom
const sizes = [12, 14, 16];
const views: [BlobbiPose['view'], string][] = [['front', 'FRONT'], ['side', 'SIDE']];
for (const [view, vlabel] of views) {
  const cell = 26 * K;
  const frames: PixelBuffer[] = [];
  for (let w = 0; w < 6; w++) {
    const f = new PixelBuffer(16 + sizes.length * cell, 24 + 2 * (cell + 14));
    f.fill(BG);
    drawTinyText(f, `${vlabel} WALK PHASE ${w}  (X${K} INSPECTION)`, 8, 6, INK);
    for (const [r, snap] of [[0, false], [1, true]] as const) {
      const y = 24 + r * (cell + 14);
      drawTinyText(f, snap ? 'AFTER' : 'BEFORE', 8, y, INK);
      sizes.forEach((size, i) => {
        const s = buildCanonicalSprite(genome, { ...REST_POSE, view, walk: w as BlobbiPose['walk'] }, size, { snapRig: snap });
        const x = 8 + i * cell + cell / 2;
        drawTinyText(f, `${size} PX`, x - 12, y + 8, INK);
        f.fillRect(x - cell / 2 + 6, y + cell + 2, cell - 12, 2, GROUND);
        // A fixed crosshair at the ground point, to judge drift against.
        blitZoom(f, s, x, y + cell, K);
        f.fillRect(x - 1, y + cell + 4, 2, 6, hex('#ff5a5a'));
      });
    }
    frames.push(f);
  }
  writeFileSync(join(outDir, `walk-${view}-before-after.gif`), toGif(frames, Math.round(1000 / WALK_CYCLE_HZ / 6)));
  const strip = new PixelBuffer(frames[0].width, frames.length * frames[0].height);
  frames.forEach((f, i) => strip.blit(f, 0, i * f.height));
  writeFileSync(join(outDir, `walk-${view}-before-after-filmstrip.png`), toPng(strip));
}

// ── 3. In the world: the overview by the shelter door, 16 px (classic) and 12 px (now), 1:1 and ×4 ───────────
{
  const live = cameraScene('turtle-0');
  live.bubble = null;
  const world = new LiveRenderer(live);
  const view = new ViewRenderer(live, world);
  const camera = new ViewCamera('overview');
  const bounds = worldBounds(live.world);
  const v = camera.update(0, { x: live.blobbi.x, y: live.blobbi.y, size: 16 }, 960, 540, bounds, true);
  const after = view.render(v, camera.restScale('overview', 960, 540, bounds), live.clock.time, DEFAULT_LIVE_OPTIONS, { hud: false, indicator: false, uiScale: 2 }).clone();
  const before = world.render(960, 540, v.originX, v.originY, live.clock.time, { ...DEFAULT_LIVE_OPTIONS, hud: false });
  const shelter = live.buildings[0];
  const cx = Math.round((live.blobbi.x + shelter.x) / 2) - v.originX;
  const cy = Math.round(Math.max(live.blobbi.y, shelter.y)) - 20 - v.originY;
  const CW = 80;
  const CH = 48;
  const Z = 4;
  const sheet = new PixelBuffer(16 + 2 * (CW * Z + 8), 24 + CH * Z + 8 + CH + 12);
  sheet.fill(BG);
  [['BEFORE  16 PX BLOBBI, OVERVIEW 1X', before], ['AFTER  12 PX BLOBBI, OVERVIEW 1X', after]].forEach(([label, frame], i) => {
    const x0 = 8 + i * (CW * Z + 8);
    drawTinyText(sheet, `${label}  (X${Z} INSPECTION, 1-1 BELOW)`, x0, 6, INK);
    for (let y = 0; y < CH; y++)
      for (let x = 0; x < CW; x++) {
        const c = (frame as PixelBuffer).get(cx - CW / 2 + x, cy - CH / 2 + y);
        sheet.fillRect(x0 + x * Z, 20 + y * Z, Z, Z, c);
        sheet.set(x0 + x, 24 + CH * Z + 4 + y, c);
      }
  });
  writeFileSync(join(outDir, 'overview-door-before-after.png'), toPng(sheet));
}

// ── 4. In motion in the overview: 1.5 s walking past the shelter at 12 px, 1:1 and ×4 (GIF) ─────────────────
{
  const live = cameraScene('turtle-0');
  live.bubble = null;
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const camera = new ViewCamera('overview');
  const bounds = worldBounds(live.world);
  const v0 = camera.update(0, { x: live.blobbi.x, y: live.blobbi.y, size: 16 }, 960, 540, bounds, true);
  const cx = Math.round(live.blobbi.x) - v0.originX;
  const cy = Math.round(live.blobbi.y) - 6 - v0.originY;
  const frames: PixelBuffer[] = [];
  for (let i = 0; i < 90; i++) {
    live.update(1 / 60, { up: false, down: i >= 45, left: i < 45, right: false, interact: false, plant: false });
    if (i % 2) continue;
    const v = camera.update(1 / 30, { x: live.blobbi.x, y: live.blobbi.y, size: 16 }, 960, 540, bounds);
    const screen = view.render(v, 1, live.clock.time, DEFAULT_LIVE_OPTIONS, { hud: false, indicator: false, uiScale: 2 });
    const f = new PixelBuffer(64 * 4, 40 * 4);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 64; x++) f.fillRect(x * 4, y * 4, 4, 4, screen.get(cx - 40 + x, cy - 20 + y));
    frames.push(f);
  }
  writeFileSync(join(outDir, 'overview-walk-12px-x4.gif'), toGif(frames, 33));
}
// ── 5. The three camera modes over the same scene: the Blobbi beside the shelter door at 12, 24 and 48 px, 1:1 ──
{
  const live = cameraScene('turtle-0');
  live.bubble = { text: 'hi', until: live.clock.time + 10, x: live.blobbi.x, y: live.blobbi.y - live.blobbi.size - 2, head: live.blobbi.size };
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const bounds = worldBounds(live.world);
  const shelter = live.buildings[0];
  const crops: PixelBuffer[] = [];
  for (const mode of ['overview', 'exploration', 'closeup'] as const) {
    const camera = new ViewCamera(mode);
    const v = camera.update(0, { x: live.blobbi.x, y: live.blobbi.y, size: 16 }, 960, 540, bounds, true);
    const screen = view.render(v, camera.restScale(mode, 960, 540, bounds), live.clock.time, DEFAULT_LIVE_OPTIONS, { hud: false, indicator: false, uiScale: 2 });
    // The same world rectangle (the Blobbi and the shelter door, 72×44 world px) in every mode, at the mode's scale.
    const wx = Math.round((live.blobbi.x + shelter.x) / 2) - 36;
    const wy = Math.round(Math.max(live.blobbi.y, shelter.y)) - 36;
    const s = v.scale;
    const c = new PixelBuffer(72 * s, 44 * s);
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) c.set(x, y, screen.get(Math.round((wx - v.originX) * s) + x, Math.round((wy - v.originY) * s) + y));
    drawTinyText(c, `${mode.toUpperCase()} ${s}X  BLOBBI ${view.lastBlobbi!.size} PX`, 3, 3, INK);
    crops.push(c);
  }
  const sheet = new PixelBuffer(crops.reduce((w, c) => w + c.width + 8, 8), crops[2].height + 16);
  sheet.fill(BG);
  let x = 8;
  for (const c of crops) {
    sheet.blit(c, x, 8);
    x += c.width + 8;
  }
  writeFileSync(join(outDir, 'modes-12-24-48.png'), toPng(sheet));
}
console.log(`wrote ${outDir}/native-sizes.png, modes-12-24-48.png, walk-front/side-before-after.gif + filmstrips, overview-door-before-after.png, overview-walk-12px-x4.gif`);
