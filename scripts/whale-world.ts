/**
 * M8 PHASE 0 WHALE WORLD images: the playable Ridge Carrier world through the game's own renderers. The whole
 * whale, the whale with its island, the Blobbi on the whale, the three camera modes, the growth stages, a fluke
 * beat with a spout, and the turtle, manta and whale side by side.
 *   npx tsx scripts/whale-world.ts [outDir=examples/whale-world] [seed=whale-world-0]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { WHALE_BREATH, whalePose } from '../src/carriers/whale';
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS, drawTinyText } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI, type ViewUiOptions } from '../src/render/view-renderer';
import { ViewCamera, worldBounds, type CameraModeId } from '../src/render/view-camera';
import { memoryStore } from '../src/game/persistence';
import { BIOMES } from '../src/world/growth';
import { run, stand } from '../src/dev/scripted-play';
import type { WorldDescription } from '../src/world/types';

const outDir = process.argv[2] ?? 'examples/whale-world';
const seed = process.argv[3] ?? 'whale-world-0';
mkdirSync(outDir, { recursive: true });
const write = (name: string, buf: PixelBuffer) => writeFileSync(join(outDir, name), toPng(buf));
const label = (buf: PixelBuffer, text: string, x = 4, y = 4) => {
  buf.fillRect(x, y, text.length * 4 + 3, 9, hex('#1b1f2a'));
  drawTinyText(buf, text.toUpperCase(), x + 2, y + 2, hex('#f4efe4'));
};
const QUIET: ViewUiOptions = { ...DEFAULT_VIEW_UI, hud: false, indicator: false, goals: false, prompt: false, lighting: false };
const shot = (live: LiveWorld, mode: CameraModeId, w: number, h: number, ui = QUIET, at?: { x: number; y: number }) => {
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const cam = new ViewCamera(mode);
  const b = worldBounds(live.world);
  const v = cam.update(0, at ? { ...at, size: 16 } : live.cameraTarget(), w, h, b, true);
  return view.render(v, cam.restScale(mode, w, h, b), live.clock.time, DEFAULT_LIVE_OPTIONS, ui).clone();
};
const middle = (w: WorldDescription) => ({ x: w.options.width / 2, y: w.options.height / 2 });

const base = generateWhaleWorld(seed);
const W = base.options.width;
const H = base.options.height;

// 1. The whole whale, with its island, at 1× (the overview frames it).
{
  const live = new LiveWorld(base, 'blobbi-9', 16);
  run(live, 40);
  write('whale-overview.png', shot(live, 'overview', W, H, QUIET, middle(base)));
  // 2. The three camera modes, with the HUD, following the Blobbi.
  const modes: CameraModeId[] = ['overview', 'exploration', 'closeup'];
  const sheet = new PixelBuffer(960, 540 * 3);
  modes.forEach((m, i) => {
    const f = shot(live, m, 960, 540, DEFAULT_VIEW_UI);
    label(f, `camera: ${m}`, 4, 30);
    sheet.blit(f, 0, i * 540);
  });
  write('whale-camera-modes.png', sheet);
  // 3. The Blobbi on the whale: at the listening spot by the head, close up (the blowholes and an eye in view).
  stand(live, live.listenSpot!.x, live.listenSpot!.y, 'right');
  run(live, 8);
  write('whale-closeup-head.png', shot(live, 'closeup', 960, 540, DEFAULT_VIEW_UI));
}

// 4. The growth stages, whole whale.
{
  const store = memoryStore();
  const sheet = new PixelBuffer(W, H * 4);
  for (let s = 0; s <= 3; s++) {
    new LiveWorld(base, 'blobbi-9', 16, { store }).devSetGrowthStage(s);
    const live = new LiveWorld(base, 'blobbi-9', 16, { store });
    run(live, 10);
    const f = shot(live, 'overview', W, H, QUIET, middle(base));
    const names = live.world.growth?.regions.filter((r) => r.stage === s).map((r) => BIOMES[r.biome].name).join(' + ');
    label(f, s ? `stage ${s}: ${names}  land ${live.world.stats.landPixels} px` : `stage 0 (as generated)  land ${base.stats.landPixels} px`, 6, 6);
    sheet.blit(f, 0, s * H);
  }
  write('whale-growth-stages.png', sheet);
}

// 5. One fluke beat and a spout: eight moments, tail and head.
{
  const live = new LiveWorld(base, 'blobbi-9', 16);
  const a = base.creature!.species === 'whale' ? base.creature!.anatomy : null!;
  // Start just before a breath, so the spout is in the strip.
  let t = 0;
  while (whalePose(a, t).spout < 0 && t < WHALE_BREATH) t += 0.1;
  live.clock.time = t - 0.4;
  const strip = new PixelBuffer(260 * 4, 200 * 2);
  for (let k = 0; k < 8; k++) {
    const f = shot(live, 'overview', W, H, QUIET, middle(base));
    const c = new PixelBuffer(260, 200);
    const tail = k % 2 === 0;
    c.blit(f, tail ? -Math.round(a.fluke.cx - 150) : -Math.round(a.blowhole.x - 150), -Math.round(a.cy - 100));
    label(c, `${tail ? 'flukes' : 'spout'} t=${live.clock.time.toFixed(1)}`);
    strip.blit(c, (k % 4) * 260, Math.floor(k / 4) * 200);
    live.clock.time += 0.4;
  }
  write('whale-motion.png', strip);
}

// 6. Turtle, manta and whale side by side (each world's overview, at the same height).
{
  const worlds = [generateTurtleWorld('turtle-0'), generateMantaWorld('manta-world-0'), base];
  const h = 384;
  const frames = worlds.map((w) => {
    const live = new LiveWorld(w, 'blobbi-9', 16);
    run(live, 5);
    return shot(live, 'overview', w.options.width, w.options.height, QUIET, middle(w)).scaled(1);
  });
  // Halve each by sampling every other pixel (nearest neighbour), so all three fit one sheet.
  const halves = frames.map((f) => {
    const out = new PixelBuffer(Math.floor(f.width / 2), Math.floor(f.height / 2));
    for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) out.data[y * out.width + x] = f.data[y * 2 * f.width + x * 2];
    return out;
  });
  const sheet = new PixelBuffer(halves.reduce((s, f) => s + f.width, 0), h);
  sheet.fill(hex('#1b1f2a'));
  let x = 0;
  halves.forEach((f, i) => {
    sheet.blit(f, x, Math.floor((h - f.height) / 2));
    label(sheet, ['turtle', 'manta', 'whale'][i], x + 4, 4);
    x += f.width;
  });
  write('carriers-compared.png', sheet);
}
console.log(`wrote ${outDir}: whale-overview, whale-camera-modes, whale-closeup-head, whale-growth-stages, whale-motion, carriers-compared`);
