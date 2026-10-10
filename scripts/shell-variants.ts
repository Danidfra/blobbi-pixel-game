/**
 * Side-by-side shell variants: the same seeds and camera for Variant 0 (the M1 shell) and the three
 * enlarged shells. One sheet per seed with the island at the same place in every panel, plus each panel
 * on its own, and a contact sheet of all seeds.
 *   npx tsx scripts/shell-variants.ts [seeds=turtle-0,turtle-1,turtle-2,turtle-3] [outDir=out/variants] [scale=1]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { renderWorld } from '../src/render/compose';
import { drawTinyText } from '../src/render/live-render';
import { SHELL_VARIANTS, type ShellVariant } from '../src/carrier/types';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { LiveRenderer, Camera, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';

const seeds = (process.argv[2] ?? 'turtle-0,turtle-1,turtle-2,turtle-3').split(',');
const outDir = process.argv[3] ?? 'out/variants';
const scale = Number(process.argv[4] ?? 1);
mkdirSync(outDir, { recursive: true });
const bg = hex('#1b1f2a');
const ink = hex('#f4efe4');
const GAP = 6;
const LABEL = 10;

const sheets: PixelBuffer[] = [];
for (const seed of seeds) {
  const worlds = SHELL_VARIANTS.map((v) => generateTurtleWorld(seed, { shellVariant: v.id as ShellVariant }));
  const images = worlds.map((w) => renderWorld(w));
  // Common frame: the island's centre at the same pixel in every panel.
  const cxs = worlds.map((w) => w.islands[0].cx);
  const cys = worlds.map((w) => w.islands[0].cy);
  const left = Math.max(...cxs);
  const top = Math.max(...cys);
  const panelW = left + Math.max(...images.map((img, i) => img.width - cxs[i]));
  const panelH = top + Math.max(...images.map((img, i) => img.height - cys[i]));
  const sheet = new PixelBuffer(SHELL_VARIANTS.length * (panelW + GAP) + GAP, panelH + LABEL + GAP * 2);
  sheet.fill(bg);
  images.forEach((img, i) => {
    const x = GAP + i * (panelW + GAP);
    const y = GAP + LABEL;
    sheet.blit(img, x + left - cxs[i], y + top - cys[i]);
    const c = worlds[i].carrier!;
    const label = `V${c.variant} ${c.coverage.target === null ? 'M1' : Math.round(c.coverage.target * 100) + '%'} MEASURED ${Math.round(c.coverage.measured * 100)}% CANVAS ${c.canvas.width}X${c.canvas.height} ORIGIN ${c.origin.x},${c.origin.y}`;
    drawTinyText(sheet, label, x, GAP, ink);
    writeFileSync(join(outDir, `${seed}-variant${c.variant}.png`), toPng(img.scaled(scale)));
    console.log(`${seed} variant ${c.variant}: coverage ${c.coverage.measured.toFixed(3)} (target ${c.coverage.target ?? '-'}), growth ${c.growth.toFixed(3)}, canvas ${c.canvas.width}x${c.canvas.height}, origin ${c.origin.x},${c.origin.y}, ${worlds[i].objects.length} objects, ${worlds[i].stats.generationMs.toFixed(0)} ms`);
  });
  drawTinyText(sheet, seed.toUpperCase(), GAP, sheet.height - GAP - 5, ink);
  writeFileSync(join(outDir, `${seed}-variants.png`), toPng(sheet.scaled(scale)));
  sheets.push(sheet);

  // Play view: the same camera (centred on the Blobbi after the same 6 s of autonomy) in every variant, at 3×.
  const viewW = 352;
  const viewH = 224;
  const play = new PixelBuffer(SHELL_VARIANTS.length * (viewW + GAP) + GAP, viewH + LABEL + GAP * 2);
  play.fill(bg);
  worlds.forEach((w, i) => {
    const live = new LiveWorld(w, 'blobbi-9', 16);
    const renderer = new LiveRenderer(live);
    const camera = new Camera();
    for (let s = 0; s < 60 * 6; s++) live.update(1 / 60, IDLE_INPUT);
    // Camera on the shell's south edge below the hub, so the frame shows land, the ring and the head.
    const a = w.turtle!;
    camera.follow(w.hubs[0].x, a.cy + a.ry * 0.8, viewW, viewH, w.options.width, w.options.height, 0, true);
    const frame = renderer.render(viewW, viewH, camera.x, camera.y, live.clock.time, DEFAULT_LIVE_OPTIONS);
    play.blit(frame, GAP + i * (viewW + GAP), GAP + LABEL);
    drawTinyText(play, `V${w.carrier!.variant} PLAY VIEW ${viewW}X${viewH} AT HUB`, GAP + i * (viewW + GAP), GAP, ink);
  });
  writeFileSync(join(outDir, `${seed}-play.png`), toPng(play.scaled(Math.max(2, scale))));
}
const all = new PixelBuffer(Math.max(...sheets.map((s) => s.width)), sheets.reduce((h, s) => h + s.height, 0));
all.fill(bg);
let y = 0;
for (const s of sheets) {
  all.blit(s, 0, y);
  y += s.height;
}
writeFileSync(join(outDir, 'all-variants.png'), toPng(all));
console.log(`wrote ${seeds.length} sheets to ${outDir}`);
