/**
 * M10 screenshots: fishing in every direction and cast phase, the open ocean, the close-up camera, marine life.
 *   npx tsx scripts/m10-ocean-life.ts [outDir=examples/m10] [section]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { LiveWorld, CAST } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS, drawTinyText } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { ViewCamera, worldBounds, type CameraModeId } from '../src/render/view-camera';
import { memoryStore } from '../src/game/persistence';
import { stand } from '../src/dev/scripted-play';
import type { CarrierKind } from '../src/game/carrier';

const outDir = process.argv[2] ?? 'examples/m10';
const only = process.argv[3] ?? '';
mkdirSync(outDir, { recursive: true });
const write = (name: string, buf: PixelBuffer) => writeFileSync(join(outDir, name), toPng(buf));
export const island = (kind: CarrierKind, seed = 'island-m10') =>
  kind === 'manta' ? generateMantaWorld(seed, { carrierSeed: 'manta-m10', generatedHouse: false }) : kind === 'whale' ? generateWhaleWorld(seed, { carrierSeed: 'whale-m10', generatedHouse: false }) : generateTurtleWorld(seed, { turtleSeed: 'turtle-m10', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });
export const shot = (live: LiveWorld, view: ViewRenderer, mode: CameraModeId, W = 960, H = 540, ui = { ...DEFAULT_VIEW_UI, lighting: false, hud: false, indicator: false }) => {
  const cam = new ViewCamera(mode);
  const b = live.sceneBounds() ?? worldBounds(live.world);
  const v = cam.update(0, live.cameraTarget(), W, H, b, true);
  return view.render(v, cam.restScale(mode, W, H, b), live.clock.time, DEFAULT_LIVE_OPTIONS, ui).clone();
};
const crop = (src: PixelBuffer, cx: number, cy: number, w: number, h: number) => {
  const out = new PixelBuffer(w, h);
  out.blit(src, -Math.round(cx - w / 2), -Math.round(cy - h / 2));
  return out;
};
/** A labelled grid of equal cells. */
const sheet = (title: string, rows: { label: string; cells: PixelBuffer[] }[], colLabels: string[]) => {
  const cw = rows[0].cells[0].width;
  const ch = rows[0].cells[0].height;
  const left = 70;
  const out = new PixelBuffer(left + rows[0].cells.length * (cw + 4), 24 + rows.length * (ch + 4));
  out.fill(hex('#1b1f2a'));
  drawTinyText(out, title, 4, 4, hex('#f4efe4'));
  colLabels.forEach((l, i) => drawTinyText(out, l, left + i * (cw + 4), 14, hex('#c8d0e0')));
  rows.forEach((r, j) => {
    drawTinyText(out, r.label, 4, 24 + j * (ch + 4) + ch / 2, hex('#c8d0e0'));
    r.cells.forEach((c, i) => out.blit(c, left + i * (cw + 4), 24 + j * (ch + 4)));
  });
  return out;
};

/** A standable spot from which the Blobbi, facing `dir`, can cast into the sea (the rod's reach at its middle). */
function castingSpot(live: LiveWorld, dir: 'up' | 'down' | 'left' | 'right'): { x: number; y: number } | null {
  const { width, height } = live.world.terrain;
  let best: { x: number; y: number; d: number } | null = null;
  const hub = live.world.hubs[0];
  for (let y = 10; y < height - 10; y += 3)
    for (let x = 10; x < width - 10; x += 3) {
      if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
      stand(live, x, y, dir);
      const t = live.fishTarget();
      if (!t) continue;
      // The sea when there is one in reach; a pond otherwise.
      const reach = Math.hypot(t.x - x, t.y - y) + (t.water === 'sea' ? 0 : 1000);
      const d = Math.hypot(x - hub.x, y - hub.y) * 0.01 + Math.abs(reach - 22);
      if (!best || d < best.d) best = { x, y, d };
    }
  return best;
}

/** A live world at a growth stage, as a save would make it. */
export function atStage(kind: CarrierKind, stage: number): LiveWorld {
  const store = memoryStore();
  if (stage) {
    const probe = new LiveWorld(island(kind), 'blobbi-9', 16, { store });
    probe.growth = { stage, version: 3, history: [], regions: [] };
    probe.save();
  }
  const live = new LiveWorld(island(kind), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  return live;
}

if (!only || only === 'fishing') {
  // Stage 2: at stage 0 a Variant S shell is too wide to cast across (KI: fishing needs the land to reach the rim).
  const live = atStage('turtle', 2);
  live.brain.enabled = false;
  live.inventory.add('blobbi-pixel:tool:fishing-rod', 1);
  live.equip('blobbi-pixel:tool:fishing-rod');
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const phases: [string, (start: number, bite: number) => number][] = [
    ['WIND BACK', (s) => s + CAST.back * 0.5],
    ['SWING', (s) => s + (CAST.back + CAST.release) / 2],
    ['FLIGHT', (s) => s + (CAST.release + CAST.land) / 2],
    ['WAITING', (s) => s + 1.2],
    ['BITE', (_s, b) => b + 0.2],
  ];
  for (const mode of ['exploration', 'closeup'] as const) {
    const rows: { label: string; cells: PixelBuffer[] }[] = [];
    for (const dir of ['down', 'up', 'left', 'right'] as const) {
      const spot = castingSpot(live, dir);
      if (!spot) {
        console.log('no casting spot facing', dir);
        continue;
      }
      live.fishing = null;
      stand(live, spot.x, spot.y, dir);
      if (!live.fish()) throw new Error(`no cast facing ${dir}`);
      const f = live.fishing!;
      const cells: PixelBuffer[] = [];
      for (const [, at] of phases) {
        // Put the clock where the phase is (the simulation is not stepped: the frame is a still of that moment).
        const t = at(f.start, f.biteAt);
        (live.clock as { time: number }).time = t;
        live.bubble = null; // the "cast..." bubble would hide the rod's tip above the head
        const full = shot(live, view, mode);
        const b = view.lastBlobbi!;
        cells.push(crop(full, b.x, b.y - 30, mode === 'closeup' ? 300 : 200, mode === 'closeup' ? 240 : 150));
      }
      rows.push({ label: dir.toUpperCase(), cells });
      if (mode === 'closeup') write(`fishing-closeup-${dir}-detail.png`, sheet(`${dir.toUpperCase()}: WAITING AND BITE, 2X`, [{ label: '', cells: [cells[3].scaled(2), cells[4].scaled(2)] }], ['WAITING', 'BITE']));
    }
    write(`fishing-${mode}.png`, sheet(`FISHING, ${mode.toUpperCase()}: THE LINE LEAVES THE ROD'S TIP`, rows, phases.map((p) => p[0])));
  }
}

if (!only || only === 'ocean') {
  // Zoomed all the way out on wide screens: the sea goes on past the world's edge (no rectangle), for every Carrier.
  for (const kind of ['turtle', 'manta', 'whale'] as const) {
    const live = atStage(kind, 4);
    const view = new ViewRenderer(live, new LiveRenderer(live));
    for (const [W, H] of [[1920, 1080], [2560, 1440]]) write(`ocean-${kind}-overview-${W}x${H}.png`, shot(live, view, 'overview', W, H));
  }
  // The world's corner, zoomed out on a wide screen, at four moments: waves drift across where the edge was.
  const live = atStage('whale', 0);
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const frames: PixelBuffer[] = [];
  const cam = new ViewCamera('overview');
  const b = worldBounds(live.world);
  for (let k = 0; k < 4; k++) {
    const v = cam.update(0, live.cameraTarget(), 1920, 1080, b, true);
    const full = view.render(v, cam.restScale('overview', 1920, 1080, b), live.clock.time + k * 0.4, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, lighting: false, hud: false, indicator: false, goals: false, prompt: false });
    // The world's top-left corner on screen.
    frames.push(crop(full, (0 - v.originX) * v.scale, (0 - v.originY) * v.scale, 160, 100).scaled(3));
  }
  write('ocean-edge-corner.png', sheet('THE WORLD\'S TOP-LEFT CORNER (CENTRE OF EACH CELL), FOUR MOMENTS, 3X', [{ label: '', cells: frames.slice(0, 2) }, { label: '', cells: frames.slice(2) }], ['', '']));
}

if (!only || only === 'cams') {
  // Every camera mode with the game's HUD and menu bar, outdoors and in the house, desktop and phone.
  const { GameUI } = await import('../src/ui/game-ui');
  const { paletteFor } = await import('../src/world/generate');
  const { findBuildSpot, pressE, run } = await import('../src/dev/scripted-play');
  const { ITEMS } = await import('../src/game/items');
  const live = atStage('turtle', 2);
  live.inventory.add(ITEMS.wood.id, 6);
  live.inventory.add(ITEMS.stone.id, 3);
  live.objectives.completed.materials = 0;
  findBuildSpot(live, 'shelter');
  live.setBuildMode('shelter');
  pressE(live);
  run(live, 60 * 26);
  const home = live.home()!;
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const ui = new GameUI(() => live, () => paletteFor(live.world.options.palette));
  const frame = (mode: CameraModeId, W: number, H: number) => {
    const cam = new ViewCamera(mode);
    const b = live.sceneBounds() ?? worldBounds(live.world);
    const v = cam.update(0, live.cameraTarget(), W, H, b, true);
    const screen = view.render(v, cam.restScale(mode, W, H, b), live.clock.time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, lighting: false, uiScale: 2, bottom: ui.menuBarHeight });
    ui.render(screen, live.clock.time);
    return screen.clone();
  };
  for (const [vp, W, H] of [['desktop', 1280, 720], ['phone', 844, 390]] as const) {
    for (const mode of ['overview', 'exploration', 'closeup', 'upclose'] as const) write(`camera-${mode}-outdoors-${vp}.png`, frame(mode, W, H));
    live.enterInterior(home);
    run(live, 2);
    for (const mode of ['closeup', 'upclose'] as const) write(`camera-${mode}-indoors-${vp}.png`, frame(mode, W, H));
    live.exitInterior();
  }
}
