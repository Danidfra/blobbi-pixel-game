/**
 * M3.3 screenshots: the SAME world, Blobbi, building and tool in the three camera modes, at the same viewport
 * size, plus a strip of the Blobbi as each mode draws it (native rasters, shown 1:1).
 *   npx tsx scripts/camera-modes.ts [worldSeed=turtle-0] [outDir=examples/camera] [width=960] [height=540]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { cameraScene } from './camera-scene';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS, drawTinyText } from '../src/render/live-render';
import { ViewCamera, CAMERA_CYCLE, CAMERA_MODES, worldBounds } from '../src/render/view-camera';
import { ViewRenderer } from '../src/render/view-renderer';

const seed = process.argv[2] ?? 'turtle-0';
const outDir = process.argv[3] ?? 'examples/camera';
const W = Number(process.argv[4] ?? 960);
const H = Number(process.argv[5] ?? 540);
mkdirSync(outDir, { recursive: true });

const live = cameraScene(seed);
const renderer = new ViewRenderer(live, new LiveRenderer(live));
const time = live.clock.time;
const bounds = worldBounds(live.world);
const shots: { label: string; frame: PixelBuffer; size: number }[] = [];
for (const mode of CAMERA_CYCLE) {
  const camera = new ViewCamera(mode);
  const world = bounds;
  const view = camera.update(0, { x: live.blobbi.x, y: live.blobbi.y, size: live.blobbi.size }, W, H, world, true);
  const frame = renderer.render(view, camera.restScale(mode, W, H, world), time, DEFAULT_LIVE_OPTIONS).clone();
  const size = renderer.lastBlobbi!.size;
  writeFileSync(join(outDir, `${seed}-${mode}.png`), toPng(frame));
  shots.push({ label: `${CAMERA_MODES[mode].label.toUpperCase()}  ${view.scale}X  BLOBBI ${size} PX NATIVE  VIEWPORT ${W}X${H}`, frame, size });
  console.log(`${mode}: scale ${view.scale}, blobbi ${size} px, origin ${view.originX},${view.originY}, world px rendered ${renderer.timings.worldPixels}`);
}

// One sheet: the three shots stacked, labelled.
const LABEL = 14;
const GAP = 8;
const sheet = new PixelBuffer(W + GAP * 2, (H + LABEL + GAP) * shots.length + GAP);
sheet.fill(hex('#141821'));
shots.forEach((s, i) => {
  const y = GAP + i * (H + LABEL + GAP);
  drawTinyText(sheet, s.label, GAP, y + 3, hex('#f4efe4'));
  sheet.blit(s.frame, GAP, y + LABEL);
});
writeFileSync(join(outDir, `${seed}-camera-modes.png`), toPng(sheet));

// The Blobbi crops: the same 160×160 screen region around the Blobbi in each mode, side by side (1:1 pixels).
const C = 160;
const crops = new PixelBuffer((C + GAP) * shots.length + GAP, C + LABEL + GAP * 2);
crops.fill(hex('#141821'));
shots.forEach((s, i) => {
  const camera = new ViewCamera(CAMERA_CYCLE[i]);
  const world = bounds;
  const view = camera.update(0, { x: live.blobbi.x, y: live.blobbi.y, size: live.blobbi.size }, W, H, world, true);
  const scale = view.scale;
  const cx = Math.round((live.blobbi.x - view.originX) * scale);
  const cy = Math.round((live.blobbi.y - live.blobbi.size / 2 - view.originY) * scale);
  const x = GAP + i * (C + GAP);
  drawTinyText(crops, `${CAMERA_MODES[CAMERA_CYCLE[i]].label.toUpperCase()} ${s.size} PX`, x, GAP + 2, hex('#f4efe4'));
  for (let j = 0; j < C; j++)
    for (let k = 0; k < C; k++) {
      const sx = cx - C / 2 + k;
      const sy = cy - C / 2 + j;
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      crops.set(x + k, GAP + LABEL + j, s.frame.get(sx, sy));
    }
});
writeFileSync(join(outDir, `${seed}-blobbi-crops.png`), toPng(crops));
console.log(`wrote ${outDir}/${seed}-camera-modes.png, ${seed}-blobbi-crops.png and one image per mode`);

// The transition exploration → close-up: the centre 320×180 of the screen every 0.1 s (nearest-neighbour throughout).
{
  const camera = new ViewCamera('exploration');
  const target = { x: live.blobbi.x, y: live.blobbi.y, size: live.blobbi.size };
  camera.update(0, target, W, H, bounds, true);
  camera.setMode('closeup');
  const CW = 320;
  const CH = 180;
  const steps = [0, 0.1, 0.2, 0.3, 0.4];
  const strip = new PixelBuffer((CW + GAP) * steps.length + GAP, CH + LABEL + GAP * 2);
  strip.fill(hex('#141821'));
  let t = 0;
  steps.forEach((at, i) => {
    while (t < at - 1e-9) {
      camera.update(1 / 60, target, W, H, bounds);
      t += 1 / 60;
    }
    const view = camera.view(W, H, bounds);
    const frame = renderer.render(view, camera.restScale('closeup', W, H, bounds), time, DEFAULT_LIVE_OPTIONS, { hud: false, indicator: false, uiScale: 2 });
    const x = GAP + i * (CW + GAP);
    drawTinyText(strip, `${at.toFixed(1)} S  ${view.scale.toFixed(2)}X`, x, GAP + 2, hex('#f4efe4'));
    for (let j = 0; j < CH; j++) for (let k = 0; k < CW; k++) strip.set(x + k, GAP + LABEL + j, frame.get((W - CW) / 2 + k, (H - CH) / 2 + j));
  });
  writeFileSync(join(outDir, `${seed}-transition.png`), toPng(strip));
}
