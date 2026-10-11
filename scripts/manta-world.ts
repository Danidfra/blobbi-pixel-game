/**
 * M7 MANTA WORLD images: the playable Wing Carrier world through the game's renderers (overview, exploration with the
 * HUD, close-up at the head), and a wing-beat.
 *   npx tsx scripts/manta-world.ts [outDir=examples/living-worlds] [seed=manta-world-0]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { toPng } from '../src/node/png';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { ViewCamera, worldBounds, type CameraModeId } from '../src/render/view-camera';
import { run, stand } from '../src/dev/scripted-play';

const outDir = process.argv[2] ?? 'examples/living-worlds';
mkdirSync(outDir, { recursive: true });
const world = generateMantaWorld(process.argv[3] ?? 'manta-world-0');
const live = new LiveWorld(world, 'blobbi-9', 16);
run(live, 60);
const view = new ViewRenderer(live, new LiveRenderer(live));
const shot = (mode: CameraModeId, w: number, h: number, ui = DEFAULT_VIEW_UI, at?: { x: number; y: number }) => {
  const cam = new ViewCamera(mode);
  const b = worldBounds(world);
  const v = cam.update(0, at ? { ...at, size: 16 } : live.cameraTarget(), w, h, b, true);
  return view.render(v, cam.restScale(mode, w, h, b), live.clock.time, DEFAULT_LIVE_OPTIONS, ui).clone();
};
writeFileSync(join(outDir, 'manta-overview.png'), toPng(shot('overview', 1024, 768, { ...DEFAULT_VIEW_UI, hud: false, indicator: false, goals: false, prompt: false }, { x: 512, y: 384 })));
writeFileSync(join(outDir, 'manta-exploration.png'), toPng(shot('exploration', 960, 540)));
stand(live, live.listenSpot!.x, live.listenSpot!.y, 'down');
run(live, 20);
writeFileSync(join(outDir, 'manta-closeup-head.png'), toPng(shot('closeup', 960, 540)));
// A wing-beat: eight frames of the west wing.
const beat = new PixelBuffer(240 * 4, 200 * 2);
for (let k = 0; k < 8; k++) {
  live.update(0.45, { up: false, down: false, left: false, right: false, interact: false, plant: false });
  const f = shot('overview', 1024, 768, { ...DEFAULT_VIEW_UI, hud: false, indicator: false, goals: false, prompt: false }, { x: 512, y: 384 });
  const c = new PixelBuffer(240, 200);
  c.blit(f, -20, -180);
  beat.blit(c, (k % 4) * 240, Math.floor(k / 4) * 200);
}
writeFileSync(join(outDir, 'manta-wingbeat.png'), toPng(beat));
console.log(`wrote ${outDir}: manta-overview, manta-exploration, manta-closeup-head, manta-wingbeat`);
