/**
 * M7 ISLAND GROWTH images: the island at each stage (whole world), the growth reveal as it plays, and close-ups of
 * each new region, through the game's own live renderer.
 *   npx tsx scripts/growth.ts [outDir=examples/living-worlds] [turtleSeed=turtle-0]
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
import { memoryStore } from '../src/game/persistence';
import { BIOMES } from '../src/world/growth';
import { run } from '../src/dev/scripted-play';

const outDir = process.argv[2] ?? 'examples/living-worlds';
const seed = process.argv[3] ?? 'turtle-0';
mkdirSync(outDir, { recursive: true });
const write = (name: string, buf: PixelBuffer) => writeFileSync(join(outDir, name), toPng(buf));
const label = (buf: PixelBuffer, text: string, x = 4, y = 4) => {
  buf.fillRect(x, y, text.length * 4 + 3, 9, hex('#1b1f2a'));
  drawTinyText(buf, text.toUpperCase(), x + 2, y + 2, hex('#f4efe4'));
};
const base = generateTurtleWorld(seed);
const store = memoryStore();
const shot = (live: LiveWorld, view: ViewRenderer, mode: CameraModeId, w: number, h: number, at?: { x: number; y: number }) => {
  const cam = new ViewCamera(mode);
  const b = worldBounds(live.world);
  const v = cam.update(0, at ? { ...at, size: 16 } : live.cameraTarget(), w, h, b, true);
  return view.render(v, cam.restScale(mode, w, h, b), live.clock.time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, hud: false, indicator: false, goals: false, prompt: false, lighting: false }).clone();
};

// 1. The four stages, whole island.
const W = base.options.width;
const H = base.options.height;
const stagesSheet = new PixelBuffer(W * 2, H * 2);
for (let s = 0; s <= 3; s++) {
  const first = new LiveWorld(base, 'blobbi-9', 16, { store });
  first.devSetGrowthStage(s);
  const live = new LiveWorld(base, 'blobbi-9', 16, { store });
  run(live, 30);
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const f = shot(live, view, 'overview', W, H, { x: W / 2, y: H / 2 });
  label(f, s ? `stage ${s}: ${live.world.growth!.regions.filter((r) => r.stage === s).map((r) => BIOMES[r.biome].name).join(' + ')}` : 'stage 0 (as generated)');
  stagesSheet.blit(f, (s % 2) * W, Math.floor(s / 2) * H);
}
write('growth-stages.png', stagesSheet);

// 2. The reveal of stage 2, frame by frame (exploration camera on a new region).
{
  const first = new LiveWorld(base, 'blobbi-9', 16, { store });
  first.devSetGrowthStage(2);
  const live = new LiveWorld(base, 'blobbi-9', 16, { store });
  live.startReveal();
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const region = live.places.find((p) => p.id.startsWith('region:s2'))!;
  const frames: PixelBuffer[] = [];
  for (const t of [0, 1.2, 2, 2.8, 3.6, 4.4, 5.2, 6]) {
    run(live, Math.round((t - (frames.length ? [0, 1.2, 2, 2.8, 3.6, 4.4, 5.2, 6][frames.length - 1] : 0)) * 60));
    const f = shot(live, view, 'exploration', 480, 270, region);
    label(f, `reveal t ${t.toFixed(1)}  ${(live.revealProgress() * 100).toFixed(0)}%`);
    frames.push(f);
  }
  const sheet = new PixelBuffer(480 * 4, 270 * 2);
  frames.forEach((f, i) => sheet.blit(f, (i % 4) * 480, Math.floor(i / 4) * 270));
  write('growth-reveal.png', sheet);
}

// 3. Each region up close (stage 3).
{
  const first = new LiveWorld(base, 'blobbi-9', 16, { store });
  first.devSetGrowthStage(3);
  const live = new LiveWorld(base, 'blobbi-9', 16, { store });
  run(live, 30);
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const regions = live.places.filter((p) => p.id.startsWith('region:'));
  const sheet = new PixelBuffer(480 * 3, 270 * Math.ceil(regions.length / 3));
  regions.forEach((p, i) => {
    const f = shot(live, view, 'closeup', 480, 270, p);
    label(f, p.name);
    sheet.blit(f, (i % 3) * 480, Math.floor(i / 3) * 270);
  });
  write('growth-regions.png', sheet);
}
console.log(`wrote ${outDir}: growth-stages, growth-reveal, growth-regions`);
