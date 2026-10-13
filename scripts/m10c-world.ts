/**
 * M10 phase C screenshots (headless, the game's own renderers): the landing on each Carrier, the "path to the sea"
 * notice, the growth tutorial, clearing young resources, prepared land, the locked canoe recipe, a pinned side quest
 * (desktop and phone), the canoe in its four headings, the rough-water edge, the fish icons.
 *   npx tsx scripts/m10c-world.ts [outDir=examples/m10c] [section]
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
import { LiveWorld, IDLE_INPUT, SWING } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS, drawTinyText } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { ViewCamera, worldBounds, type CameraModeId } from '../src/render/view-camera';
import { memoryStore } from '../src/game/persistence';
import { pressE, run, stand } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import { CANOE_ITEM, FISH_CONTENT } from '../src/content/tools';
import { KEEP_CLEAR_KIND } from '../src/game/clearing';
import { HITS_TO_FELL, REGROW_SECONDS, STUMP_SECONDS, TREE_RETURN_SECONDS } from '../src/game/trees';
import { HITS_TO_MINE, ROCK_RETURN_SECONDS, isLargeRock } from '../src/game/rocks';
import { GROWTH_VERSION } from '../src/world/growth';
import { GameUI } from '../src/ui/game-ui';
import { CraftingScreen } from '../src/ui/screens/crafting';
import { JournalScreen } from '../src/ui/screens/journal';
import { GrowthScreen } from '../src/ui/screens/growth';
import { itemIcon } from '../src/ui/icons';
import { paletteFor } from '../src/world/generate';
import { REACH } from '../src/game/resources';
import type { CarrierKind } from '../src/game/carrier';
import type { Placement } from '../src/world/types';

const outDir = process.argv[2] ?? 'examples/m10c';
const only = process.argv[3] ?? '';
const section = (name: string) => !only || only === name;
mkdirSync(outDir, { recursive: true });
const write = (name: string, buf: PixelBuffer) => writeFileSync(join(outDir, name), toPng(buf));
const palette = paletteFor('cozy');

const island = (kind: CarrierKind, seed = 'island-m10c') =>
  kind === 'manta' ? generateMantaWorld(seed, { carrierSeed: 'manta-m10c', generatedHouse: false }) : kind === 'whale' ? generateWhaleWorld(seed, { carrierSeed: 'whale-m10c', generatedHouse: false }) : generateTurtleWorld(seed, { turtleSeed: 'turtle-m10c', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });

function atStage(kind: CarrierKind, stage: number, seed?: string): LiveWorld {
  const store = memoryStore();
  if (stage) {
    const probe = new LiveWorld(island(kind, seed), 'blobbi-9', 16, { store });
    probe.growth = { stage, version: GROWTH_VERSION, history: [], regions: [] };
    probe.save();
  }
  const live = new LiveWorld(island(kind, seed), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  (live as unknown as { nearbyMarine: () => null }).nearbyMarine = () => null;
  return live;
}

const shot = (live: LiveWorld, mode: CameraModeId, W = 960, H = 540, ui = { ...DEFAULT_VIEW_UI, lighting: false, indicator: false }, view = new ViewRenderer(live, new LiveRenderer(live))) => {
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

/** Cells side by side under a title, each with a label. */
function sheet(title: string, cells: PixelBuffer[], labels: string[], cols = cells.length): PixelBuffer {
  const cw = Math.max(...cells.map((c) => c.width));
  const ch = Math.max(...cells.map((c) => c.height));
  const rows = Math.ceil(cells.length / cols);
  const out = new PixelBuffer(cols * (cw + 4) + 4, 24 + rows * (ch + 14));
  out.fill(hex('#1b1f2a'));
  drawTinyText(out, title.toUpperCase(), 4, 4, hex('#f4efe4'));
  cells.forEach((c, i) => {
    const x = 4 + (i % cols) * (cw + 4);
    const y = 24 + Math.floor(i / cols) * (ch + 14);
    drawTinyText(out, labels[i].toUpperCase(), x, y, hex('#ffe07a'));
    out.blit(c, x, y + 10);
  });
  return out;
}

/** Stand below object `index`, facing it, nodes in reach removed. */
function face(live: LiveWorld, index: number): boolean {
  const o = live.world.objects[index];
  const s = live.spriteOf(o);
  for (const dy of [s.footRy + 4, s.footRy + 6, s.footRy + 8]) {
    if (!live.collision.canStand(o.x, o.y + dy, live.blobbi.footRx, live.blobbi.footRy)) continue;
    live.blobbi.x = o.x;
    live.blobbi.y = o.y + dy;
    run(live, 1, { up: true });
    live.blobbi.x = o.x;
    live.blobbi.y = o.y + dy;
    live.resources = live.resources.filter((n) => Math.hypot(n.x - o.x, (n.y - o.y - dy) * 1.25) > REACH + 2);
    if (live.facingObject()?.index === index) return true;
  }
  return false;
}
const faceFirst = (live: LiveWorld, pick: (p: Placement) => boolean): number => {
  for (let i = 0; i < live.world.objects.length; i++) if (pick(live.world.objects[i]) && face(live, i)) return i;
  throw new Error('nothing to face');
};
const swing = (live: LiveWorld) => {
  pressE(live);
  run(live, Math.ceil(SWING.end * 60) + 4);
};
const away = (live: LiveWorld) => {
  live.blobbi.x = live.world.hubs[0].x;
  live.blobbi.y = live.world.hubs[0].y;
};

if (section('landing')) {
  // Each Carrier at stage 1: its landing in the overview, and close, the Blobbi on it with the canoe ready to launch.
  for (const kind of ['turtle', 'manta', 'whale'] as CarrierKind[]) {
    const live = atStage(kind, 1);
    const at = live.landingStand()!;
    live.inventory.add(CANOE_ITEM.id, 1);
    stand(live, at.x, at.y, at.heading);
    live.resources = live.resources.filter((n) => Math.hypot(n.x - at.x, n.y - at.y) > 24);
    for (const d of live.discoveries) if (Math.hypot(d.x - at.x, d.y - at.y) < 30) live.found.add(d.id);
    const over = shot(live, 'overview', 960, 540);
    const close = shot(live, 'closeup', 960, 540, { ...DEFAULT_VIEW_UI, lighting: false, indicator: false, hud: false, goals: false });
    write(`landing-${kind}.png`, sheet(`${kind}: the landing (stage 1)`, [over, close], ['the whole island', `close: ${live.prompt() ?? ''}`], 1));
    if (kind === 'manta') {
      // The moment the island first reaches the sea.
      live.announceSeaPath();
      write('sea-path-notice.png', shot(live, 'exploration', 960, 540));
    }
  }
}

if (section('tutorial')) {
  // "Help your island grow": the goal box, then the growth panel.
  const live = atStage('turtle', 0);
  for (const id of ['meet', 'arrive', 'gather', 'axe', 'wood', 'materials', 'shelter', 'enter-home', 'first-furniture', 'plot', 'plant', 'water', 'harvest', 'feed', 'home', 'cook', 'mystery']) live.objectives.completed[id] = 0;
  Object.assign(live.tally, { fed: 5, harvested: 3, crafted: 6 });
  live.update(1 / 60, IDLE_INPUT);
  const hud = shot(live, 'exploration', 960, 540);
  const ui = new GameUI(() => live, () => palette);
  ui.register(new GrowthScreen());
  ui.open('growth');
  const panel = hud.clone();
  ui.render(panel, live.clock.time);
  write('growth-tutorial.png', sheet('help your island grow', [hud, panel], ['the goal box', 'growth (L): what the island needs'], 1));
}

if (section('clearing')) {
  // A felled tree comes back as a seedling, then a young tree; a broken rock forms as a deposit: each can be cleared.
  const live = atStage('turtle', 0, 'island-m10c-clear');
  live.inventory.add(ITEMS.axe.id, 1);
  live.equip(ITEMS.axe.id);
  const t = faceFirst(live, (p) => p.kind === 'tree');
  for (let i = 0; i < HITS_TO_FELL; i++) swing(live);
  away(live);
  run(live, (STUMP_SECONDS + TREE_RETURN_SECONDS + 10) * 60);
  face(live, t);
  const tree = live.world.objects[t];
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const cellAt = (x: number, y: number) => crop(shot(live, 'closeup', 960, 540, { ...DEFAULT_VIEW_UI, lighting: false, indicator: false }, view), 480 + (x - live.blobbi.x) * 4, 270 + (y - live.blobbi.y) * 4 - 40, 400, 300);
  const seedling = cellAt(tree.x, tree.y);
  const p1 = live.prompt() ?? '';
  away(live);
  run(live, Math.ceil(REGROW_SECONDS * 0.5) * 60);
  face(live, t);
  const young = cellAt(tree.x, tree.y);
  const p2 = live.prompt() ?? '';
  live.inventory.add(ITEMS.pickaxe.id, 1);
  live.equip(ITEMS.pickaxe.id);
  const r = faceFirst(live, (p) => p.kind === 'rock' && isLargeRock(p.size));
  const rock = live.world.objects[r];
  for (let i = 0; i < HITS_TO_MINE; i++) swing(live);
  swing(live); // the rubble cleared away
  away(live);
  run(live, (ROCK_RETURN_SECONDS + 10) * 60);
  face(live, r);
  const deposit = cellAt(rock.x, rock.y);
  const p3 = live.prompt() ?? '';
  write('clearing-young.png', sheet('clearing at every stage', [seedling, young, deposit], [p1, p2, p3]));
}

if (section('prepared')) {
  // A clearing flag keeps its circle clear: the felled tree's spot stays free; the circle shows nearby.
  const live = atStage('turtle', 0, 'island-m10c-flag');
  live.inventory.add(ITEMS.axe.id, 1);
  live.equip(ITEMS.axe.id);
  const t = faceFirst(live, (p) => p.kind === 'tree');
  const tree = live.world.objects[t];
  for (let i = 0; i < HITS_TO_FELL; i++) swing(live);
  run(live, (STUMP_SECONDS + 2) * 60);
  live.buildings.push({ id: 'flag:shot', kind: KEEP_CLEAR_KIND, x: tree.x + 8, y: tree.y + 4, placedAt: live.worldTime, seed: 'f', variant: 1 });
  away(live);
  run(live, (TREE_RETURN_SECONDS + 30) * 60);
  live.blobbi.x = tree.x - 14;
  live.blobbi.y = tree.y + 16;
  live.update(1 / 60, IDLE_INPUT);
  write('prepared-land.png', crop(shot(live, 'closeup', 960, 540), 480, 250, 640, 400));
}

if (section('ui')) {
  // The locked canoe recipe, and a pinned side quest under the main goal, on desktop and phone.
  const live = atStage('whale', 1);
  for (const id of ['meet', 'arrive', 'gather', 'axe', 'wood', 'materials', 'shelter', 'enter-home', 'first-furniture', 'plot', 'plant', 'water', 'harvest', 'feed', 'home', 'cook', 'mystery', 'grow', 'carrier']) live.objectives.completed[id] = 0;
  live.inventory.add(ITEMS.wood.id, 6);
  live.inventory.add(ITEMS.stick.id, 4);
  live.update(1 / 60, IDLE_INPUT);
  for (const [vp, W, H] of [['desktop', 960, 540], ['phone', 390, 844]] as const) {
    const ui = new GameUI(() => live, () => palette);
    const crafting = new CraftingScreen();
    ui.register(crafting);
    ui.open('crafting');
    crafting.tab = 'tools';
    crafting.index = Math.max(0, crafting.entries(ui).findIndex((e) => e.recipe?.output.item === CANOE_ITEM.id));
    const frame = shot(live, 'exploration', W, H);
    ui.render(frame, live.clock.time);
    write(`locked-canoe-recipe-${vp}.png`, frame);
    live.pinQuest('side-angler');
    for (const mode of ['exploration', 'upclose'] as CameraModeId[]) write(`pinned-quest-${vp}-${mode}.png`, shot(live, mode, W, H));
    const journal = new JournalScreen();
    ui.register(journal);
    ui.open('journal');
    journal.index = Math.max(0, journal.rows(ui).findIndex((r) => r.quest?.id === 'side-angler'));
    const j = shot(live, 'exploration', W, H);
    ui.render(j, live.clock.time);
    write(`pinned-quest-${vp}-journal.png`, j);
  }
}

if (section('canoe')) {
  // The canoe in its four headings, empty and with the Blobbi aboard.
  const live = atStage('whale', 1);
  const L = live.world.growth!.landing!;
  const cells: PixelBuffer[] = [];
  const labels: string[] = [];
  for (const h of ['left', 'right', 'up', 'down'] as const)
    for (const aboard of [false, true]) {
      live.boat = { x: L.launch.x, y: L.launch.y + 60, heading: h, vx: 0, vy: 0, aboard };
      if (aboard) {
        live.blobbi.x = live.boat.x;
        live.blobbi.y = live.boat.y + LiveWorld.SEAT;
        live.blobbi.animator.state.direction = h;
      } else away(live);
      live.update(1 / 60, IDLE_INPUT);
      const view = new ViewRenderer(live, new LiveRenderer(live));
      const cam = new ViewCamera('closeup');
      const b = worldBounds(live.world);
      const v = cam.update(0, { x: live.boat.x, y: live.boat.y, size: 16 }, 200, 200, b, true);
      cells.push(view.render(v, cam.restScale('closeup', 200, 200, b), live.clock.time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, hud: false, goals: false, prompt: false, indicator: false, lighting: false }).clone());
      labels.push(`${h}${aboard ? ' aboard' : ''}`);
    }
  write('canoe-headings.png', sheet('the canoe, each heading (closeup 4x)', cells, labels, 4));
}

if (section('edge')) {
  // The rough water at the edge of the Carrier's sea: a corner and a side.
  const live = atStage('manta', 1);
  const r = live.seaNav().region;
  const cells: PixelBuffer[] = [];
  for (const [bx, by] of [[r.x0 + 70, r.y0 + 70], [(r.x0 + r.x1) / 2, r.y0 + 60]]) {
    live.boat = { x: bx, y: by, heading: 'up', vx: 0, vy: 0, aboard: true };
    live.blobbi.x = bx;
    live.blobbi.y = by + LiveWorld.SEAT;
    live.update(1 / 60, IDLE_INPUT);
    cells.push(shot(live, 'exploration', 640, 360, { ...DEFAULT_VIEW_UI, hud: false, goals: false, prompt: false, indicator: false, lighting: false }));
  }
  write('rough-water-edge.png', sheet('the edge of the sea: rounded and breathing', cells, ['a corner', 'a side'], 1));
}

if (section('fish')) {
  // Every fish's own icon (2x), then the journal's fish log with a few caught.
  const icons = new PixelBuffer(FISH_CONTENT.length * 40 + 8, 40);
  icons.fill(hex('#2b2340'));
  FISH_CONTENT.forEach((f, i) => {
    const ic = itemIcon(f.item.id, palette).scaled(2);
    icons.blit(ic, 4 + i * 40 + Math.floor((40 - ic.width) / 2), Math.floor((40 - ic.height) / 2));
  });
  write('fish-icons.png', sheet('fish icons (2x)', [icons], [FISH_CONTENT.map((f) => f.item.label).join(', ')]));
}
