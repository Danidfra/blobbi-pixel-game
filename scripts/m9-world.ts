/**
 * M9 images through the game's own renderers: the Blobbi resting in bed (and going home to bed), locked home
 * styles, growth stages 0–4 for every Carrier, the turtle's flippers under its shell, stage 4 at the camera scales.
 *   npx tsx scripts/m9-world.ts [outDir=examples/m9-world] [only]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { toPng } from '../src/node/png';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { ViewCamera, worldBounds, type CameraModeId } from '../src/render/view-camera';
import { findBuildSpot, pressE, run } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import { doorSpot } from '../src/game/buildings';
import { memoryStore } from '../src/game/persistence';
import type { CarrierKind } from '../src/game/carrier';

const outDir = process.argv[2] ?? 'examples/m9-world';
const only = process.argv[3] ?? '';
mkdirSync(outDir, { recursive: true });
const write = (name: string, buf: PixelBuffer) => writeFileSync(join(outDir, name), toPng(buf));
const W = 960;
const H = 540;
export const island = (kind: CarrierKind, seed = 'island-m9') =>
  kind === 'manta' ? generateMantaWorld(seed, { carrierSeed: 'manta-m9', generatedHouse: false }) : kind === 'whale' ? generateWhaleWorld(seed, { carrierSeed: 'whale-m9', generatedHouse: false }) : generateTurtleWorld(seed, { turtleSeed: 'turtle-m9', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });
const shot = (live: LiveWorld, view: ViewRenderer, mode: CameraModeId, ui = { ...DEFAULT_VIEW_UI, lighting: false }) => {
  const cam = new ViewCamera(mode);
  const b = live.sceneBounds() ?? worldBounds(live.world);
  const v = cam.update(0, live.cameraTarget(), W, H, b, true);
  return view.render(v, cam.restScale(mode, W, H, b), live.clock.time, DEFAULT_LIVE_OPTIONS, ui).clone();
};

if (!only || only === 'rest') {
  const live = new LiveWorld(island('whale'), 'blobbi-9', 16, { store: memoryStore() });
  live.brain.enabled = false;
  live.inventory.add(ITEMS.wood.id, 6);
  live.inventory.add(ITEMS.stone.id, 3);
  live.objectives.completed.materials = 0;
  findBuildSpot(live, 'shelter');
  live.setBuildMode('shelter');
  pressE(live);
  run(live, 60 * 26);
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const home = live.home()!;
  const d = doorSpot(home, live.blobbi.footRy);
  live.blobbi.x = d.x;
  live.blobbi.y = d.y + 30;
  live.care.energy = 30;
  live.rest();
  run(live, 20);
  write('rest-01-going-home.png', shot(live, view, 'exploration'));
  for (let i = 0; i < 60 * 30 && live.restPlan?.phase !== 'climb-in'; i++) run(live, 1);
  run(live, 12);
  write('rest-02-climbing-in.png', shot(live, view, 'closeup'));
  for (let i = 0; i < 120 && live.restPlan?.phase !== 'in-bed'; i++) run(live, 1);
  run(live, 70);
  write('rest-03-in-bed-closeup.png', shot(live, view, 'closeup'));
  write('rest-04-in-bed-room.png', shot(live, view, 'exploration'));
}
console.log(`wrote ${outDir}`);
