/**
 * M5 LIVING WORLD images: the content catalogues (placeables, crops, item icons), a furnished house, the game's
 * screens, and the island through a day, all through the game's own renderers.
 *   npx tsx scripts/living-world.ts [outDir=examples/living-world]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { paletteFor } from '../src/world/generate';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS, drawTinyText } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { ViewCamera, worldBounds, type CameraModeId } from '../src/render/view-camera';
import { ALL_PLACEABLE_KINDS, BUILDINGS, buildingSprite } from '../src/game/buildings';
import { ALL_ITEMS, MENU_CATEGORIES, menuCategory } from '../src/game/items';
import { CROP_KINDS, cropSprite, plotSprite, type CropStage } from '../src/game/farming';
import { QUESTS } from '../src/game/objectives';
import { DAY_SECONDS } from '../src/game/daylight';
import { itemIcon } from '../src/ui/icons';
import { GameUI } from '../src/ui/game-ui';
import { InventoryScreen } from '../src/ui/screens/inventory';
import { CraftingScreen } from '../src/ui/screens/crafting';
import { JournalScreen } from '../src/ui/screens/journal';
import { CareScreen } from '../src/ui/screens/care';
import { StorageScreen } from '../src/ui/screens/storage';
import { SettingsScreen } from '../src/ui/screens/settings';
import { findBuildSpot, playLoop, pressE, run, stand } from '../src/dev/scripted-play';

const outDir = process.argv[2] ?? 'examples/living-world';
mkdirSync(outDir, { recursive: true });
const palette = paletteFor('cozy');
const ink = hex('#1b1f2a');
const grass = hex('#78d04c');
const floor = hex('#c08a50');
const write = (name: string, buf: PixelBuffer) => writeFileSync(join(outDir, name), toPng(buf));

// ─── 1. Placeables ───────────────────────────────────────────────────────────
{
  const kinds = ALL_PLACEABLE_KINDS.filter((k) => k !== 'shelter');
  const cols = 9;
  const cw = 46;
  const ch = 40;
  const sheet = new PixelBuffer(cols * cw, Math.ceil(kinds.length / cols) * ch);
  kinds.forEach((k, i) => {
    const x = (i % cols) * cw;
    const y = Math.floor(i / cols) * ch;
    sheet.fillRect(x, y, cw, ch, BUILDINGS[k].where === 'indoor' ? floor : grass);
    const s = buildingSprite({ id: k, kind: k, x: 0, y: 0, placedAt: -1e9, seed: k, variant: i % 3 }, palette, 1);
    sheet.blit(s.buffer, x + Math.floor(cw / 2) - s.anchorX, y + 28 - s.anchorY);
    drawTinyText(sheet, k.replace(/-/g, ' ').slice(0, 11).toUpperCase(), x + 1, y + 33, ink);
  });
  write('catalogue-placeables.png', sheet.scaled(3));
}

// ─── 2. Crops ────────────────────────────────────────────────────────────────
{
  const sheet = new PixelBuffer(6 * 14 + 56, CROP_KINDS.length * 16 + 2);
  sheet.fill(hex('#2b3046'));
  CROP_KINDS.forEach((kind, row) => {
    const y = 1 + row * 16;
    drawTinyText(sheet, kind.toUpperCase(), 2, y + 5, hex('#f4efe4'));
    for (let stage = 0; stage < 5; stage++) {
      const x = 52 + stage * 14;
      sheet.fillRect(x - 1, y, 13, 15, grass);
      sheet.blit(plotSprite(stage > 0 && stage < 4, 0), x + 2, y + 6);
      const s = cropSprite(kind, stage as CropStage, 'sheet');
      sheet.blit(s.buffer, x + 6 - s.anchorX, y + 12 - s.anchorY);
    }
  });
  write('catalogue-crops.png', sheet.scaled(4));
}

// ─── 3. Item icons, by category ─────────────────────────────────────────────
{
  const cols = 16;
  const rows = MENU_CATEGORIES.map((c) => ALL_ITEMS.filter((d) => menuCategory(d.id) === c));
  const lines = rows.reduce((n, r) => n + Math.ceil(r.length / cols), 0);
  const sheet = new PixelBuffer(cols * 18 + 60, lines * 18 + MENU_CATEGORIES.length * 2);
  sheet.fill(hex('#232838'));
  let y = 1;
  MENU_CATEGORIES.forEach((c, i) => {
    drawTinyText(sheet, c.toUpperCase(), 2, y + 6, hex('#ffe07a'));
    rows[i].forEach((d, j) => sheet.blit(itemIcon(d.id, palette), 60 + (j % cols) * 18 + 1, y + Math.floor(j / cols) * 18 + 1));
    y += Math.ceil(rows[i].length / cols) * 18 + 2;
  });
  write('catalogue-items.png', sheet.scaled(3));
  console.log(`items ${ALL_ITEMS.length}: ${MENU_CATEGORIES.map((c, i) => `${c} ${rows[i].length}`).join(', ')}`);
}

// ─── 4. A furnished home, the screens ───────────────────────────────────────
const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
playLoop(live);
for (const q of QUESTS) live.objectives.completed[q.id] ??= live.worldTime;
const view = new ViewRenderer(live, new LiveRenderer(live));
const shot = (mode: CameraModeId, w = 960, h = 540) => {
  const cam = new ViewCamera(mode);
  const b = live.sceneBounds() ?? worldBounds(live.world);
  const v = cam.update(0, { x: live.blobbi.x, y: live.blobbi.y, size: 16 }, w, h, b, true);
  return view.render(v, cam.restScale(mode, w, h, b), live.clock.time, DEFAULT_LIVE_OPTIONS, DEFAULT_VIEW_UI).clone();
};
// Furnish the house: enter, place pieces from the bag.
const shelter = live.buildings.find((b) => b.kind === 'shelter')!;
stand(live, shelter.x, shelter.y + BUILDINGS.shelter.footRy + live.blobbi.footRy + 3, 'up');
pressE(live);
const furnish: [string, number, number, 'up' | 'down', number][] = [
  ['bookshelf', 36, 32, 'up', 0],
  ['armchair', 44, 62, 'down', 1],
  ['potted-plant', 112, 74, 'down', 0],
  ['pet-bed', 90, 66, 'down', 3],
  ['painting', 70, 40, 'up', 0],
  ['floor-lamp', 22, 70, 'down', 0],
  ['wall-clock', 60, 40, 'up', 0],
];
for (const [kind, x, y, dir, variant] of furnish) {
  live.inventory.add(BUILDINGS[kind].item!, 1);
  stand(live, x, y, dir);
  live.startPlacing(BUILDINGS[kind].item!);
  live.placingVariant = variant;
  pressE(live);
  live.stopPlacing();
}
stand(live, 64, 70, 'down');
run(live, 30);
write('home-closeup.png', shot('closeup'));
// The screens, over the room.
const ui = new GameUI(() => live, () => palette);
const screens = { inventory: new InventoryScreen(), crafting: new CraftingScreen(), journal: new JournalScreen(), care: new CareScreen(), storage: new StorageScreen(), settings: new SettingsScreen() };
for (const s of Object.values(screens)) ui.register(s);
const chest = live.interior!.state.furniture.find((f) => f.kind === 'chest')!;
live.inventory.add('blobbi-pixel:resource:shell', 6);
live.moveItems(chest, 'blobbi-pixel:resource:shell', 4, true);
live.moveItems(chest, 'blobbi-pixel:material:wood', 2, true);
screens.storage.target = chest;
const panels: PixelBuffer[] = [];
for (const id of ['inventory', 'crafting', 'journal', 'care', 'storage', 'settings'] as const) {
  ui.open(id);
  if (id === 'crafting') screens.crafting.tab = 'furniture';
  const f = shot('closeup', 960, 540);
  ui.render(f, 0);
  panels.push(f);
  ui.close();
}
const sheet = new PixelBuffer(960 * 2, 540 * 3);
panels.forEach((p, i) => sheet.blit(p, (i % 2) * 960, Math.floor(i / 2) * 540));
write('screens.png', sheet);

// ─── 5. The island through a day ─────────────────────────────────────────────
live.exitInterior();
for (const kind of ['lantern', 'flower-arch', 'bird-bath'])
  if (findBuildSpot(live, kind, { x: shelter.x, y: shelter.y + 20 }, 90)) {
    live.inventory.add(BUILDINGS[kind].item!, 1);
    live.startPlacing(BUILDINGS[kind].item!);
    pressE(live);
    live.stopPlacing();
  }
stand(live, shelter.x + 24, shelter.y + 30, 'down');
run(live, 200);
const day: PixelBuffer[] = [];
for (const hour of [9, 14.5, 18.8, 22.5]) {
  let t = live.worldTime - (live.worldTime % DAY_SECONDS) + (((hour - 7 + 24) % 24) / 24) * DAY_SECONDS;
  if (hour === 14.5) while (true) {
    // A rainy afternoon, for the record.
    const { rainAt } = await import('../src/game/daylight');
    if (rainAt(live.world.seed, t) > 0.6) break;
    t += DAY_SECONDS;
  }
  live.timeOffset = t - live.clock.time;
  run(live, 90);
  day.push(shot('exploration', 640, 360));
}
const daySheet = new PixelBuffer(1280, 720);
day.forEach((p, i) => daySheet.blit(p, (i % 2) * 640, Math.floor(i / 2) * 360));
write('island-day-rain-dusk-night.png', daySheet);
console.log(`wrote ${outDir}: catalogue-placeables, catalogue-crops, catalogue-items, home-closeup, screens, island-day-rain-dusk-night`);
