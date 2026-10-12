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
// Sections run only when this script is run (other scripts import its helpers).
const main = /m10-ocean-life\.ts$/.test(process.argv[1] ?? '');
const section = (name: string) => main && (!only || only === name);
if (main) mkdirSync(outDir, { recursive: true });
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

if (section('fishing')) {
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

if (section('ocean')) {
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

if (section('cams')) {
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

if (section('wildlife')) {
  const { lightAt } = await import('../src/game/daylight');
  const { stand, run } = await import('../src/dev/scripted-play');
  const live = atStage('turtle', 2);
  const lr = new LiveRenderer(live);
  /** The first world time from `from` when a creature of `kind` shows (and satisfies `ok`). */
  const when = (kind: string, from = 0, ok = (_: { age: number }) => true) => {
    for (let t = from; t < from + 6000; t += 0.5) {
      const s = live.marine.at(t).find((x) => x.kind === kind && ok(x));
      if (s) return { t, s };
    }
    throw new Error(`no ${kind}`);
  };
  const still = (t: number, cx: number, cy: number, w = 120, h = 80) => {
    live.timeOffset += t - live.worldTime;
    return lr.render(w, h, Math.round(cx - w / 2), Math.round(cy - h / 2), live.clock.time, { ...DEFAULT_LIVE_OPTIONS, hud: false }).clone().scaled(4);
  };
  const cells: PixelBuffer[] = [];
  const labels: string[] = [];
  for (const [kind, label, ok] of [
    ['school', 'FISH SCHOOL', (s: { age: number }) => s.age > 3],
    ['jelly', 'JELLYFISH (DAY)', (s: { age: number }) => s.age > 3],
    ['dolphin', 'DOLPHIN LEAPING', (s: { age: number }) => s.age % 2.2 > 0.35 && s.age % 2.2 < 0.5],
    ['dolphin', 'DOLPHIN FIN', (s: { age: number }) => s.age % 2.2 > 1.2],
  ] as const) {
    const { t, s } = when(kind, 100, ok);
    cells.push(still(t, s.x, s.y));
    labels.push(label);
  }
  // Night: jellyfish glowing and the rare glowing ray.
  const nightFrom = (from: number) => {
    let t = from;
    while (!lightAt(t).night) t += 10;
    return t;
  };
  {
    const { t, s } = when('jelly', nightFrom(0), (s) => s.age > 3 && lightAt(s.age).night !== undefined);
    if (lightAt(t).night) {
      cells.push(still(t, s.x, s.y));
      labels.push('JELLYFISH (NIGHT)');
    }
    const r = when('glowray', 0, (s) => s.age > 4);
    cells.push(still(r.t, r.s.x, r.s.y));
    labels.push('GLOWING RAY (NIGHT, RARE)');
  }
  write('wildlife-species.png', sheet('MARINE LIFE (WORLD PIXELS, 4X)', [{ label: '', cells: cells.slice(0, 3) }, { label: '', cells: cells.slice(3) }], labels.slice(0, 3)));
  // The curious seal in play: up close, the Blobbi at the shore, before and while it waves.
  const { t, s } = when('seal', 200, (s) => s.age > 3 && s.age < 10);
  live.timeOffset += t - live.worldTime;
  stand(live, s.shore!.x, s.shore!.y, 'down');
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const seal: PixelBuffer[] = [];
  seal.push(crop(shot(live, view, 'closeup', 960, 540, { ...DEFAULT_VIEW_UI, lighting: false, indicator: false }), 480, 300, 480, 300));
  live.greetMarine();
  run(live, 8);
  seal.push(crop(shot(live, view, 'closeup', 960, 540, { ...DEFAULT_VIEW_UI, lighting: false, indicator: false }), 480, 300, 480, 300));
  write('wildlife-seal.png', sheet('THE CURIOUS SEAL: IT WATCHES, E WAVES, IT ROLLS OVER (CLOSE-UP)', [{ label: '', cells: seal }], ['BEFORE', 'AFTER E']));
}
