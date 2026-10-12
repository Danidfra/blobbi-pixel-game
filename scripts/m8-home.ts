/**
 * M8 HOME images, through the game's own renderers and UI: a new island without a house, the three house levels on
 * the island and inside, the HOME panel (upgrade and confirmation), on a whale island and a turtle island.
 *   npx tsx scripts/m8-home.ts [outDir=examples/m8-home]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { toPng } from '../src/node/png';
import { paletteFor } from '../src/world/generate';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { ViewCamera, worldBounds, type CameraModeId } from '../src/render/view-camera';
import { GameUI } from '../src/ui/game-ui';
import { HomeScreen } from '../src/ui/screens/home';
import { installCustomisation } from '../src/ui/screens/home-style';
import { ITEMS } from '../src/game/items';
import { findBuildSpot, pressE, pressUntil, run, stand } from '../src/dev/scripted-play';
import { footOf, doorSpot } from '../src/game/buildings';

const outDir = process.argv[2] ?? 'examples/m8-home';
mkdirSync(outDir, { recursive: true });
const write = (name: string, buf: PixelBuffer) => writeFileSync(join(outDir, name), toPng(buf));
const W = 960;
const H = 540;

function scene(kind: 'turtle' | 'whale') {
  const world = kind === 'whale' ? generateWhaleWorld('island-m8-home', { carrierSeed: 'whale-m8', generatedHouse: false }) : generateTurtleWorld('island-m8-home', { turtleSeed: 'turtle-m8', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });
  const live = new LiveWorld(world, 'blobbi-9', 16);
  live.brain.enabled = false;
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const ui = new GameUI(() => live, () => paletteFor('cozy'));
  const home = new HomeScreen();
  installCustomisation(home);
  ui.register(home);
  const shot = (mode: CameraModeId, opts: { ui?: boolean; target?: { x: number; y: number; size: number } } = {}) => {
    const cam = new ViewCamera(mode);
    const b = live.sceneBounds() ?? worldBounds(live.world);
    const v = cam.update(0, opts.target ?? live.cameraTarget(), W, H, b, true);
    const frame = view.render(v, cam.restScale(mode, W, H, b), live.clock.time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, lighting: false }).clone();
    if (opts.ui) ui.render(frame, 100);
    return frame;
  };
  return { live, ui, home, shot };
}

for (const kind of ['whale', 'turtle'] as const) {
  const { live, ui, home, shot } = scene(kind);
  write(`${kind}-start-no-house.png`, shot('overview'));
  live.inventory.add(ITEMS.wood.id, 60);
  live.inventory.add(ITEMS.stone.id, 40);
  live.inventory.add('blobbi-pixel:material:cloth', 10);
  live.objectives.completed.materials = 0;
  findBuildSpot(live, 'shelter', live.world.hubs[0], 160, 3);
  live.setBuildMode('shelter');
  pressE(live);
  run(live, 60 * 26);
  const house = live.home()!;
  const front = () => {
    const d = doorSpot(house, live.blobbi.footRy);
    stand(live, d.x, d.y + 10, 'up');
  };
  const inside = (name: string) => {
    const d = doorSpot(house, live.blobbi.footRy);
    stand(live, d.x, d.y, 'up');
    pressUntil(live, () => live.inside);
    run(live, 2);
    write(name, shot('exploration'));
    live.exitInterior();
    run(live, 2);
  };
  front();
  write(`${kind}-level1-exterior.png`, shot('closeup'));
  inside(`${kind}-level1-interior.png`);
  for (const id of ['home', 'harvest']) live.objectives.completed[id] = 1;
  front();
  ui.open('home');
  write(`${kind}-home-panel.png`, shot('exploration', { ui: true }));
  home.askUpgrade(ui);
  write(`${kind}-home-confirm.png`, shot('exploration', { ui: true }));
  ui.close();
  live.upgradeHouse();
  run(live, 60 * 8);
  front();
  write(`${kind}-level2-building.png`, shot('closeup'));
  run(live, 60 * 16);
  front();
  write(`${kind}-level2-exterior.png`, shot('closeup'));
  inside(`${kind}-level2-interior.png`);
  for (const id of ['cottage', 'carrier']) live.objectives.completed[id] = 1;
  for (const d of live.discoveries.slice(0, 3)) live.found.add(d.id);
  live.carrier.bond = 1000;
  const r = live.upgradeHouse();
  if (!r.ok) console.log(kind, 'dream home refused:', r.reason);
  run(live, 60 * 32);
  front();
  write(`${kind}-level3-exterior.png`, shot('closeup'));
  write(`${kind}-level3-overview.png`, shot('exploration'));
  inside(`${kind}-level3-interior.png`);
  front();
  ui.open('home');
  for (const tab of ['look', 'rooms'] as const) {
    home.tab = tab;
    write(`${kind}-home-${tab}.png`, shot('exploration', { ui: true }));
  }
  void footOf;
}
console.log(`wrote ${outDir}`);
