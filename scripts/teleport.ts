/**
 * M6 TELEPORT frames: departure and arrival, through the game's own renderer and camera, in a few camera modes.
 *   npx tsx scripts/teleport.ts [outDir=examples/living-archipelago] [mode=closeup] [reduced=0]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS, drawTinyText } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { ViewCamera, worldBounds, type CameraModeId } from '../src/render/view-camera';
import { run } from '../src/dev/scripted-play';

const outDir = process.argv[2] ?? 'examples/living-archipelago';
const modes = (process.argv[3] ?? 'closeup,exploration').split(',') as CameraModeId[];
const reduced = process.argv[4] === '1';
mkdirSync(outDir, { recursive: true });

const W = 480;
const H = 270;
for (const mode of modes) {
  const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
  live.teleport.reducedMotion = reduced;
  run(live, 60);
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const cam = new ViewCamera(mode);
  const bounds = live.sceneBounds() ?? worldBounds(live.world);
  const rest = cam.restScale(mode, W, H, bounds);
  cam.update(0, live.cameraTarget(H / rest), W, H, bounds, true);
  const frames: { label: string; buf: PixelBuffer }[] = [];
  const crops: PixelBuffer[] = [];
  const shoot = (label: string) => {
    const v = cam.update(0, live.cameraTarget(H / rest), W, H, bounds, false, 0);
    const buf = view.render(v, rest, live.clock.time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, hud: false }).clone();
    frames.push({ label, buf });
    // A close crop around the Blobbi's spot (the face, the cut line, the shadow).
    const at = view.lastBlobbi!;
    const crop = new PixelBuffer(96, 120);
    crop.blit(buf, 48 - at.x, 100 - at.y);
    crops.push(crop);
  };
  // Advance in small steps so the camera follows as it would at 60 fps.
  const advance = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      run(live, 1);
      cam.update(1 / 60, live.cameraTarget(H / rest), W, H, bounds, false, 1 / 60);
    }
  };
  shoot('present');
  live.leaveBlobbi();
  const k = reduced ? 0.6 : 1;
  let last = 0;
  for (const t of [0.4, 0.9, 1.15, 1.4, 1.7, 2.1, 2.7]) {
    advance((t - last) * k);
    last = t;
    shoot(`depart ${t}`);
  }
  shoot(`state ${live.getPresenceState()}`);
  advance(0.5);
  live.enterBlobbi();
  last = 0;
  for (const t of [0.2, 0.7, 1.2, 1.7, 2.1, 2.4, 2.7, 3.2, 3.5, 3.8]) {
    advance((t - last) * k);
    last = t;
    shoot(`arrive ${t}`);
  }
  shoot(`state ${live.getPresenceState()}`);
  const cols = 4;
  const sheet = new PixelBuffer(cols * W, Math.ceil(frames.length / cols) * H);
  frames.forEach((f, i) => {
    sheet.blit(f.buf, (i % cols) * W, Math.floor(i / cols) * H);
    drawTinyText(sheet, f.label.toUpperCase(), (i % cols) * W + 4, Math.floor(i / cols) * H + 4, hex('#ffffff'));
  });
  const name = `teleport-${mode}${reduced ? '-reduced' : ''}.png`;
  const strip = new PixelBuffer(crops.length * 96, 120);
  crops.forEach((c, i) => strip.blit(c, i * 96, 0));
  writeFileSync(join(outDir, name.replace('.png', '-crop.png')), toPng(strip.scaled(2)));
  writeFileSync(join(outDir, name), toPng(sheet));
  console.log('wrote', join(outDir, name), frames.length, 'frames');
}
