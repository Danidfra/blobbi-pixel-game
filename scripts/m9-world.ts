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
import { turtleBodyForWorld, renderWorld } from '../src/render/compose';
import { growWorld } from '../src/world/growth';
import { GameUI } from '../src/ui/game-ui';
import { HomeScreen } from '../src/ui/screens/home';
import { installCustomisation } from '../src/ui/screens/home-style';
import { paletteFor } from '../src/world/generate';

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
if (!only || only === 'styles') {
  // Locked home styles: a fresh home (only the defaults earned), the LOOK tab on a locked wall, ROOMS on a locked floor.
  const live = new LiveWorld(island('manta'), 'blobbi-9', 16, { store: memoryStore() });
  live.brain.enabled = false;
  live.inventory.add(ITEMS.wood.id, 6);
  live.inventory.add(ITEMS.stone.id, 3);
  live.objectives.completed.materials = 0;
  findBuildSpot(live, 'shelter');
  live.setBuildMode('shelter');
  pressE(live);
  run(live, 60 * 26);
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const ui = new GameUI(() => live, () => paletteFor('cozy'));
  const home = new HomeScreen();
  installCustomisation(home);
  ui.register(home);
  ui.handleKey('Digit1');
  ui.handleKey('Tab');
  ui.handleKey('ArrowDown');
  ui.handleKey('ArrowRight');
  let f = shot(live, view, 'exploration');
  ui.render(f, 1);
  write('styles-01-look-locked-wall.png', f);
  ui.handleKey('Tab');
  ui.handleKey('ArrowRight');
  f = shot(live, view, 'exploration');
  ui.render(f, 2);
  write('styles-02-rooms-locked-floor.png', f);
}

if (!only || only === 'growth') {
  // Growth stages 0-4 for every Carrier: the whole Carrier, the stages side by side (half size), and stage 4 alone.
  for (const kind of ['turtle', 'manta', 'whale'] as const) {
    const base = island(kind);
    const pics = [0, 1, 2, 3, 4].map((stage) => renderWorld(growWorld(base, stage), { shadows: true }));
    const half = (b: PixelBuffer) => {
      const out = new PixelBuffer(Math.floor(b.width / 2), Math.floor(b.height / 2));
      for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) out.set(x, y, b.get(x * 2, y * 2));
      return out;
    };
    const small = pics.map(half);
    const sheet = new PixelBuffer(small[0].width * 3, small[0].height * 2);
    small.forEach((p, i) => sheet.blit(p, (i % 3) * p.width, Math.floor(i / 3) * p.height));
    write(`growth-${kind}-stages-0-4.png`, sheet);
    write(`growth-${kind}-stage4.png`, pics[4]);
  }
  const b = generateTurtleWorld('turtle-0');
  write('growth-turtle-variantB-stage4.png', renderWorld(growWorld(b, 4), { shadows: true }));
}

if (!only || only === 'cams') {
  // Stage 4 in play, at the three camera scales, on every Carrier.
  for (const kind of ['turtle', 'manta', 'whale'] as const) {
    const store = memoryStore();
    const probe = new LiveWorld(island(kind), 'blobbi-9', 16, { store });
    probe.growth = { stage: 4, version: 3, history: [], regions: [] };
    probe.save();
    const live = new LiveWorld(island(kind), 'blobbi-9', 16, { store });
    const view = new ViewRenderer(live, new LiveRenderer(live));
    for (const mode of ['overview', 'exploration', 'closeup'] as const) write(`stage4-${kind}-${mode}.png`, shot(live, view, mode));
  }
}

if (!only || only === 'feel') {
  // A Dream Home at night (lit windows, a smoking chimney) on a stage-4 whale island.
  const store = memoryStore();
  const live = new LiveWorld(island('whale'), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  live.inventory.add(ITEMS.wood.id, 6);
  live.inventory.add(ITEMS.stone.id, 3);
  live.objectives.completed.materials = 0;
  findBuildSpot(live, 'shelter', live.world.hubs[0], 160, 3);
  live.setBuildMode('shelter');
  pressE(live);
  run(live, 60 * 26);
  live.home()!.level = 3;
  live.timeOffset += 1200 * 0.6; // night
  run(live, 60 * 8);
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const h = live.home()!;
  live.blobbi.x = h.x + 30;
  live.blobbi.y = h.y + 20;
  write('feel-dream-home-night.png', shot(live, view, 'closeup', { ...DEFAULT_VIEW_UI, lighting: true }));
}

if (!only || only === 'flippers') {
  // The turtle's flippers where they meet the shell, Variant S (new worlds) and Variant B, at close-up, two paddle phases.
  const label = process.env.LABEL ?? 'after';
  for (const [name, world] of [
    ['S', island('turtle')],
    ['B', generateTurtleWorld('turtle-0')],
  ] as const) {
    const live = new LiveWorld(world, 'blobbi-9', 16);
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const body = turtleBodyForWorld(world);
    const sheet = new PixelBuffer(W, H);
    // A front and a rear flipper: 4 crops of 480×270 at close-up, at two paddle phases.
    // Framed on the joint: from the flipper's centre, part of the way toward the shell's centre.
    const c = world.islands[0];
    const parts = [body.flippers[0], body.flippers[3]].map((f) => {
      const fx = f.x + f.buffer.width / 2;
      const fy = f.y + f.buffer.height / 2;
      // March toward the shell until the body (shell) begins: that is the joint.
      for (let k = 0; k < 1; k += 0.01) {
        const x = Math.round(fx + (c.cx - fx) * k);
        const y = Math.round(fy + (c.cy - fy) * k);
        if (body.buffer.get(x, y) >>> 24) return { cx: x, cy: y };
      }
      return { cx: fx, cy: fy };
    });
    let k = 0;
    for (const f of parts)
      for (const time of [0.4, 3.6]) {
        live.clock.time = time;
        const cam = new ViewCamera('closeup');
        const b = worldBounds(live.world);
        const v = cam.update(0, { x: f.cx, y: f.cy, size: 16 }, W / 2, H / 2, b, true);
        const frame = view.render(v, cam.restScale('closeup', W / 2, H / 2, b), time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, hud: false, goals: false, prompt: false, indicator: false, lighting: false });
        sheet.blit(frame, (k % 2) * (W / 2), Math.floor(k / 2) * (H / 2));
        k++;
      }
    write(`flippers-variant-${name}-${label}.png`, sheet);
  }
}
console.log(`wrote ${outDir}`);
