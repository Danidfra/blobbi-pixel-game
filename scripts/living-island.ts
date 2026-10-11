/**
 * M4 LIVING ISLAND images: the new sprites, the whole gameplay loop played by a script through the player's own
 * actions (see `src/dev/scripted-play.ts`), and the furnished island in every camera mode, all through the game's
 * real view renderer (HUD, needs bars, goal box and prompt included).
 *   npx tsx scripts/living-island.ts [worldSeed=turtle-0] [outDir=examples/living-island]
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
import { paletteFor } from '../src/world/generate';
import { CROP_KINDS, cropSprite, plotSprite, waterDropSprite, type CropStage } from '../src/game/farming';
import { BUILDING_KINDS, buildingSprite } from '../src/game/buildings';
import { toolSprite, type ToolOrientation } from '../src/game/equipment';
import { ITEMS } from '../src/game/items';
import { playLoop, run, standAbove } from '../src/dev/scripted-play';

const seed = process.argv[2] ?? 'turtle-0';
const outDir = process.argv[3] ?? 'examples/living-island';
mkdirSync(outDir, { recursive: true });
const palette = paletteFor('cozy');
const ink = hex('#f4efe4');
const bg = hex('#1b1f2a');

// ─── 1. Sprites ─────────────────────────────────────────────────────────────
{
  const grass = hex('#78d04c');
  const sheet = new PixelBuffer(170, 108);
  sheet.fill(bg);
  drawTinyText(sheet, 'SOIL DRY / WET', 2, 2, ink);
  sheet.fillRect(2, 9, 36, 12, grass);
  sheet.blit(plotSprite(false, 0), 4, 11);
  sheet.blit(plotSprite(false, 1), 12, 11);
  sheet.blit(plotSprite(true, 0), 22, 11);
  sheet.blit(plotSprite(true, 1), 30, 11);
  sheet.blit(waterDropSprite(), 42, 12);
  CROP_KINDS.forEach((kind, row) => {
    const y = 26 + row * 16;
    drawTinyText(sheet, kind.toUpperCase(), 2, y + 4, ink);
    for (let stage = 0; stage < 5; stage++) {
      const x = 34 + stage * 12;
      sheet.fillRect(x - 1, y, 11, 14, grass);
      sheet.blit(plotSprite(stage > 0 && stage < 4, 0), x + 1, y + 5);
      const s = cropSprite(kind, stage as CropStage, 'sheet');
      sheet.blit(s.buffer, x + 5 - s.anchorX, y + 11 - s.anchorY);
    }
  });
  drawTinyText(sheet, 'DECORATIONS (AND HALF BUILT)', 2, 76, ink);
  let x = 2;
  for (const kind of BUILDING_KINDS) {
    if (kind === 'shelter') continue;
    const b = { id: kind, kind, x: 0, y: 0, placedAt: 0, seed: `sheet/${kind}` };
    const full = buildingSprite(b, palette, 1);
    const half = buildingSprite(b, palette, 0.5);
    sheet.fillRect(x, 83, full.buffer.width * 2 + 6, 22, grass);
    sheet.blit(full.buffer, x + 2, 103 - full.anchorY);
    sheet.blit(half.buffer, x + full.buffer.width + 4, 103 - half.anchorY);
    x += full.buffer.width * 2 + 8;
  }
  drawTinyText(sheet, 'HOE', 112, 2, ink);
  (['rest', 'carry', 'raised', 'strike', 'strike-down', 'strike-up'] as ToolOrientation[]).forEach((o, i) => {
    const t = toolSprite(ITEMS.hoe.id, o, palette);
    sheet.fillRect(110 + (i % 3) * 19, 9 + Math.floor(i / 3) * 15, 17, 13, grass);
    sheet.blit(t.buffer, 112 + (i % 3) * 19, 10 + Math.floor(i / 3) * 15);
  });
  writeFileSync(join(outDir, 'sprites.png'), toPng(sheet.scaled(5)));
}

// ─── 2. The loop, played ────────────────────────────────────────────────────
const W = 384;
const H = 216;
const live = new LiveWorld(generateTurtleWorld(seed), 'blobbi-9', 16, { store: memoryStore() });
const view = new ViewRenderer(live, new LiveRenderer(live));
const bounds = worldBounds(live.world);
const frame = (mode: CameraModeId, w = W, h = H, at?: { x: number; y: number }) => {
  const camera = new ViewCamera(mode);
  const target = at ?? { x: live.blobbi.x, y: live.blobbi.y };
  const v = camera.update(0, { ...target, size: live.blobbi.size }, w, h, bounds, true);
  return view.render(v, camera.restScale(mode, w, h, bounds), live.clock.time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, uiScale: 1 }).clone();
};
const panels: { label: string; frame: PixelBuffer }[] = [];
const shot = (label: string) => {
  run(live, 8);
  panels.push({ label, frame: frame('closeup') });
};
const { field } = playLoop(live, shot);
// A few extra moments: a dry crop's drop, the Blobbi asleep in the shelter's doorway.
standAbove(live, field[1]);
run(live, 4);
panels.push({ label: 'FACING THE CARROT (PROMPT, BOTTOM)', frame: frame('closeup') });
live.care.energy = 20; // scripted: a tired Blobbi
live.rest();
run(live, 60 * 8);
panels.push({ label: 'TIRED: ASLEEP IN THE DOORWAY', frame: frame('closeup') });
const cols = 4;
const LABEL = 10;
const GAP = 4;
const rows = Math.ceil(panels.length / cols);
const sheet = new PixelBuffer(cols * (W + GAP) + GAP, rows * (H + LABEL + GAP) + GAP);
sheet.fill(bg);
panels.forEach((p, i) => {
  const x = GAP + (i % cols) * (W + GAP);
  const y = GAP + Math.floor(i / cols) * (H + LABEL + GAP);
  drawTinyText(sheet, `${i + 1}. ${p.label}`, x, y + 1, ink);
  sheet.blit(p.frame, x, y + LABEL);
});
writeFileSync(join(outDir, `${seed}-loop.png`), toPng(sheet.scaled(2)));

// ─── 3. The furnished island in every camera mode ──────────────────────────
live.rest(); // wake
run(live, 30);
const home = live.buildings[0];
const modes = (['overview', 'exploration', 'closeup'] as CameraModeId[]).map((m) => frame(m, 640, 360, { x: home.x, y: home.y + 10 }));
const strip = new PixelBuffer(640, 3 * 360 + 2 * GAP);
strip.fill(bg);
modes.forEach((m, i) => strip.blit(m, 0, i * (360 + GAP)));
writeFileSync(join(outDir, `${seed}-camera-modes.png`), toPng(strip));

console.log(`goals ${Object.keys(live.objectives.completed).length}/10, plots ${live.plots.length}, buildings ${live.buildings.map((b) => b.kind).join(', ')}`);
console.log(`needs: fed ${live.care.hunger.toFixed(0)}, energy ${live.care.energy.toFixed(0)}, joy ${live.care.happiness.toFixed(0)}`);
console.log(`wrote ${outDir}/sprites.png, ${seed}-loop.png, ${seed}-camera-modes.png`);
