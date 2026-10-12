/**
 * M10 phase B screenshots: cleared land, building on it, regrowth, upgrade obstructions; the canoe, the sea.
 *   npx tsx scripts/m10b-coast.ts [outDir=examples/m10b] [section]
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
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS, drawTinyText } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { ViewCamera, worldBounds, type CameraModeId } from '../src/render/view-camera';
import { memoryStore } from '../src/game/persistence';
import { findBuildSpot, pressE, run, stand } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import { STUMP_SECONDS, TREE_RETURN_SECONDS } from '../src/game/trees';
import type { CarrierKind } from '../src/game/carrier';

const outDir = process.argv[2] ?? 'examples/m10b';
const only = process.argv[3] ?? '';
const main = /m10b-coast\.ts$/.test(process.argv[1] ?? '');
const section = (name: string) => main && (!only || only === name);
if (main) mkdirSync(outDir, { recursive: true });
export const write = (name: string, buf: PixelBuffer) => writeFileSync(join(outDir, name), toPng(buf));
export const island = (kind: CarrierKind, seed = 'island-m10b') =>
  kind === 'manta' ? generateMantaWorld(seed, { carrierSeed: 'manta-m10b', generatedHouse: false }) : kind === 'whale' ? generateWhaleWorld(seed, { carrierSeed: 'whale-m10b', generatedHouse: false }) : generateTurtleWorld(seed, { turtleSeed: 'turtle-m10b', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });
export function atStage(kind: CarrierKind, stage: number, seed?: string): LiveWorld {
  const store = memoryStore();
  if (stage) {
    const probe = new LiveWorld(island(kind, seed), 'blobbi-9', 16, { store });
    probe.growth = { stage, version: 3, history: [], regions: [] };
    probe.save();
  }
  const live = new LiveWorld(island(kind, seed), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  return live;
}
export const shot = (live: LiveWorld, view: ViewRenderer, mode: CameraModeId, W = 960, H = 540, ui = { ...DEFAULT_VIEW_UI, lighting: false, indicator: false }) => {
  const cam = new ViewCamera(mode);
  const b = live.sceneBounds() ?? worldBounds(live.world);
  const v = cam.update(0, live.cameraTarget(), W, H, b, true);
  return view.render(v, cam.restScale(mode, W, H, b), live.clock.time, DEFAULT_LIVE_OPTIONS, ui).clone();
};
export const crop = (src: PixelBuffer, cx: number, cy: number, w: number, h: number) => {
  const out = new PixelBuffer(w, h);
  out.blit(src, -Math.round(cx - w / 2), -Math.round(cy - h / 2));
  return out;
};
export const sheet = (title: string, cells: PixelBuffer[], labels: string[], cols = cells.length) => {
  const cw = cells[0].width;
  const ch = cells[0].height;
  const rows = Math.ceil(cells.length / cols);
  const out = new PixelBuffer(cols * (cw + 4) + 4, 24 + rows * (ch + 14));
  out.fill(hex('#1b1f2a'));
  drawTinyText(out, title, 4, 4, hex('#f4efe4'));
  cells.forEach((c, i) => {
    const x = 4 + (i % cols) * (cw + 4);
    const y = 24 + Math.floor(i / cols) * (ch + 14);
    drawTinyText(out, labels[i] ?? '', x, y - 8, hex('#c8d0e0'));
    out.blit(c, x, y);
  });
  return out;
};

if (section('clearing')) {
  const live = atStage('turtle', 0);
  const view = new ViewRenderer(live, new LiveRenderer(live));
  // A tree near the hub with room in front.
  const hub = live.world.hubs[0];
  const trees = live.world.objects.map((o, i) => ({ o, i })).filter(({ o }) => o.kind === 'tree').sort((a, b) => Math.hypot(a.o.x - hub.x, a.o.y - hub.y) - Math.hypot(b.o.x - hub.x, b.o.y - hub.y));
  let index = -1;
  for (const { o, i } of trees) {
    const s = live.spriteOf(o);
    if (!live.collision.canStand(o.x, o.y + s.footRy + 6, 3, 2)) continue;
    stand(live, o.x, o.y + s.footRy + 6, 'up');
    live.resources = live.resources.filter((n) => Math.hypot(n.x - live.blobbi.x, n.y - live.blobbi.y) > 16);
    if (live.facingObject()?.index === i) {
      index = i;
      break;
    }
  }
  const t = live.world.objects[index];
  const cells: PixelBuffer[] = [];
  const labels: string[] = [];
  const at = () => crop(shot(live, view, 'closeup'), 480, 270, 360, 240);
  cells.push(at());
  labels.push('A TREE');
  live.inventory.add(ITEMS.axe.id, 1);
  live.equip(ITEMS.axe.id);
  for (let i = 0; i < 3; i++) pressE(live);
  run(live, 30);
  cells.push(at());
  labels.push('FELLED: A STUMP');
  run(live, (STUMP_SECONDS + 2) * 60);
  cells.push(at());
  labels.push('CLEAR GROUND (FREE TO BUILD)');
  // A bench on the very spot.
  live.inventory.add('blobbi-pixel:furniture:bench', 1);
  for (let r = 0, done = false; r < 30 && !done; r += 2)
    for (let k = 0; k < 16 && !done; k++) {
      const x = Math.round(t.x + Math.cos((k / 16) * Math.PI * 2) * r);
      const y = Math.round(t.y + 14 + Math.sin((k / 16) * Math.PI * 2) * r);
      if (!live.collision.canStand(x, y, 3, 2)) continue;
      stand(live, x, y, 'up');
      const c = live.placementCheck('bench') as { ok: boolean; x0: number; y0: number; x1: number; y1: number };
      if (!c.ok || t.x < c.x0 || t.x > c.x1 || t.y < c.y0 || t.y > c.y1) continue;
      live.startPlacing('blobbi-pixel:furniture:bench');
      done = !!live.placeFromBag();
    }
  run(live, 60 * 6);
  cells.push(at());
  labels.push('A BENCH WHERE THE TREE STOOD');
  write('clearing-tree-to-bench.png', sheet('TERRAIN STAYS, RESOURCES COME AND GO (CLOSE-UP)', cells, labels, 2));
  // Regrowth on a free spot: another tree, felled, the Blobbi away; the seedling.
  const other = trees.find(({ i }) => i !== index && Math.hypot(live.world.objects[i].x - t.x, live.world.objects[i].y - t.y) > 40)!.i;
  const o2 = live.world.objects[other];
  live.trees.set(other, { hits: 0, harvestedAt: live.worldTime - STUMP_SECONDS - TREE_RETURN_SECONDS - 1, regrowAt: null });
  live.blobbi.x = hub.x;
  live.blobbi.y = hub.y;
  run(live, 60 * 8);
  const r1 = crop(new LiveRenderer(live).render(120, 80, o2.x - 60, o2.y - 50, live.clock.time, { ...DEFAULT_LIVE_OPTIONS, hud: false }).clone().scaled(3), 180, 120, 360, 240);
  run(live, 60 * 130);
  const r2 = crop(new LiveRenderer(live).render(120, 80, o2.x - 60, o2.y - 50, live.clock.time, { ...DEFAULT_LIVE_OPTIONS, hud: false }).clone().scaled(3), 180, 120, 360, 240);
  write('clearing-regrowth.png', sheet('A TREE COMES BACK ON ITS FREE SPOT: SEEDLING, THEN SAPLING (3X)', [r1, r2], ['SEEDLING', 'HALF GROWN']));
}

if (section('upgrade')) {
  // A first house whose Cottage is blocked by natural things: the HOME panel's words and the marks in the world.
  const { GameUI } = await import('../src/ui/game-ui');
  const { paletteFor } = await import('../src/world/generate');
  const { HomeScreen } = await import('../src/ui/screens/home');
  const { installCustomisation } = await import('../src/ui/screens/home-style');
  for (let k = 0; k < 12; k++) {
    const live = new LiveWorld(generateTurtleWorld(`up-${k}`, { turtleSeed: 't' + k, shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false }), 'blobbi-9', 16, { store: memoryStore() });
    live.brain.enabled = false;
    live.inventory.add(ITEMS.wood.id, 6);
    live.inventory.add(ITEMS.stone.id, 3);
    live.objectives.completed.materials = 0;
    if (!findBuildSpot(live, 'shelter')) continue;
    live.setBuildMode('shelter');
    pressE(live);
    run(live, 60 * 26);
    for (const id of ['home', 'harvest']) live.objectives.completed[id] = 0;
    live.inventory.add(ITEMS.wood.id, 10);
    live.inventory.add(ITEMS.stone.id, 6);
    live.inventory.add('blobbi-pixel:material:cloth', 2);
    const check = live.houseUpgrade();
    if (!check.blocked?.startsWith('Clear ')) continue;
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const ui = new GameUI(() => live, () => paletteFor(live.world.options.palette));
    const home = new HomeScreen();
    installCustomisation(home);
    ui.register(home);
    // The world up close round the house, with the marks (the Blobbi stands aside).
    const h = live.home()!;
    live.blobbi.x = h.x + 40;
    live.blobbi.y = h.y + 26;
    const world = shot(live, view, 'closeup', 960, 540, { ...DEFAULT_VIEW_UI, lighting: false, indicator: false, hud: false });
    ui.open('home');
    const panel = shot(live, view, 'exploration', 960, 540);
    ui.render(panel, live.clock.time);
    write('upgrade-obstruction.png', sheet(`UPGRADE BLOCKED: "${check.blocked.toUpperCase()}"`, [world, panel], ['THE WORLD MARKS WHAT IS IN THE WAY', 'THE HOME PANEL SAYS WHAT TO DO']));
    console.log('upgrade:', check.blocked);
    break;
  }
}

/** Stand where the canoe can be launched; the seal stays under for the pictures. */
function toLaunch(live: LiveWorld): boolean {
  const { CANOE_ITEM } = { CANOE_ITEM: { id: 'blobbi-pixel:vehicle:canoe' } };
  if (!live.inventory.count(CANOE_ITEM.id)) live.inventory.add(CANOE_ITEM.id, 1);
  (live as unknown as { nearbyMarine: () => null }).nearbyMarine = () => null;
  const hub = live.world.hubs[0];
  const tries: { x: number; y: number; d: 'down' | 'right' | 'left' | 'up'; dist: number }[] = [];
  const { width, height } = live.world.terrain;
  for (let y = 6; y < height - 6; y += 3)
    for (let x = 6; x < width - 6; x += 3) {
      if (!live.collision.canStand(x, y, 3, 2)) continue;
      for (const d of ['down', 'right', 'left', 'up'] as const) {
        stand(live, x, y, d);
        if (live.launchSpot()) tries.push({ x, y, d, dist: Math.hypot(x - hub.x, y - hub.y) });
      }
    }
  if (!tries.length) return false;
  // The launch nearest the hub (a natural first trip).
  tries.sort((a, b) => a.dist - b.dist);
  stand(live, tries[0].x, tries[0].y, tries[0].d);
  live.resources = live.resources.filter((n) => Math.hypot(n.x - live.blobbi.x, n.y - live.blobbi.y) > 20);
  for (const d of live.discoveries) if (Math.hypot(d.x - live.blobbi.x, d.y - live.blobbi.y) < 30) live.found.add(d.id);
  return true;
}

if (section('canoe')) {
  const ui = { ...DEFAULT_VIEW_UI, lighting: false, indicator: false };
  for (const [kind, stage] of [['turtle', 2], ['manta', 3], ['whale', 3]] as const) {
    const live = atStage(kind, stage);
    if (!toLaunch(live)) {
      console.log('no launch', kind);
      continue;
    }
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const cells: PixelBuffer[] = [];
    const labels: string[] = [];
    const grab = (mode: CameraModeId, label: string) => {
      const full = shot(live, view, mode, 960, 540, ui);
      cells.push(crop(full, Math.min(720, Math.max(240, view.lastBlobbi!.x)), Math.min(380, Math.max(160, view.lastBlobbi!.y - 30)), 480, 320));
      labels.push(label);
    };
    grab('closeup', 'AT THE SHORE: E LAUNCH');
    pressE(live);
    grab('closeup', 'MOORED: E GET IN');
    live.update(1 / 60, { up: false, down: false, left: false, right: false, interact: true, plant: false });
    run(live, 11);
    grab('closeup', 'THE HOP IN');
    run(live, 40);
    grab('closeup', 'ABOARD');
    // Out and round: away from the island.
    const boat = live.boat!;
    const away = { x: Math.sign(boat.x - live.world.hubs[0].x) || 1, y: Math.sign(boat.y - live.world.hubs[0].y) || 1 };
    for (let i = 0; i < 60 * 5; i++) live.update(1 / 60, { up: away.y < 0, down: away.y > 0, left: away.x < 0, right: away.x > 0, interact: false, plant: false });
    grab('exploration', 'PADDLING ROUND THE CARRIER');
    // Fishing from the canoe.
    live.inventory.add('blobbi-pixel:tool:fishing-rod', 1);
    live.equip('blobbi-pixel:tool:fishing-rod');
    for (let i = 0; i < 90; i++) live.update(1 / 60, { up: false, down: false, left: false, right: false, interact: false, plant: false });
    for (const dir of ['down', 'right', 'left', 'up'] as const) {
      live.boat!.heading = dir;
      live.blobbi.animator.state.direction = dir;
      if (live.fishTarget()) break;
    }
    if (live.fish()) {
      (live.clock as { time: number }).time = live.fishing!.start + 1.4;
      live.bubble = null;
      grab('closeup', 'FISHING FROM THE CANOE');
      live.fishing = null;
    }
    write(`canoe-${kind}.png`, sheet(`THE CANOE: ${kind.toUpperCase()} (STAGE ${stage})`, cells, labels, 3));
  }
  // Ocean features up close from the canoe, and the rough water at the edge (turtle).
  const live = atStage('turtle', 2);
  (live as unknown as { nearbyMarine: () => null }).nearbyMarine = () => null;
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const cells: PixelBuffer[] = [];
  const labels: string[] = [];
  for (const kind of ['bottle', 'kelp', 'shoal'] as const) {
    // Dawn for the shoal.
    if (kind === 'shoal') live.timeOffset += 1200 * (22 / 24) - (live.worldTime % 1200);
    const f = live.oceanNow().find((x) => x.kind === kind);
    if (!f) continue;
    live.boat = { x: f.x - 16, y: f.y + 2, heading: 'right', vx: 0, vy: 0, aboard: true };
    live.blobbi.x = live.boat.x;
    live.blobbi.y = live.boat.y + 4;
    live.bubble = null;
    cells.push(crop(shot(live, view, 'closeup', 960, 540, ui), 480, 280, 480, 320));
    labels.push(`${kind.toUpperCase()}: ${live.prompt()?.toUpperCase() ?? ''}`);
  }
  const r = live.seaNav().region;
  live.boat = { x: (r.x0 + r.x1) / 2, y: r.y0 + 20, heading: 'up', vx: 0, vy: 0, aboard: true };
  live.blobbi.x = live.boat.x;
  live.blobbi.y = live.boat.y + 4;
  live.bubble = { text: 'the current pulls back toward the Carrier', until: live.clock.time + 2, x: live.blobbi.x, y: live.blobbi.y - 18, head: 16 };
  const edge = shot(live, view, 'exploration', 960, 540, ui);
  cells.push(crop(edge, view.lastBlobbi!.x, Math.max(160, view.lastBlobbi!.y), 480, 320));
  labels.push('THE EDGE OF THE CANOE\'S SEA');
  write('canoe-sea-features.png', sheet('FROM THE CANOE: A BOTTLE ADRIFT, THE KELP GARDEN, THE SILVER SHOAL, THE ROUGH WATER', cells, labels, 2));
}
