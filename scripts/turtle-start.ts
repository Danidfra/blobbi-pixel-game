/**
 * The turtle's starting island, before and after Variant S, against the manta and the whale: stage 0 to 3 of
 * every Carrier at the same scale, and the numbers (land pixels, the island's share of the shell, growth per
 * stage). Writes `examples/turtle-start/`.
 *
 *   npx tsx scripts/turtle-start.ts [--seed turtle-intro]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { PixelBuffer } from '../src/core/pixel';
import { toPng } from '../src/node/png';
import { renderWorld } from '../src/render/compose';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { growWorld } from '../src/world/growth';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { drawTinyText } from '../src/render/live-render';
import { hex } from '../src/core/color';
import { isLand } from '../src/cinematic/layers';
import { T, type WorldDescription } from '../src/world/types';

const args = process.argv.slice(2);
const seed = args[args.indexOf('--seed') + 1] && args.includes('--seed') ? args[args.indexOf('--seed') + 1] : 'intro-preview';
const OUT = 'examples/turtle-start';
mkdirSync(OUT, { recursive: true });

const landPixels = (w: WorldDescription) => w.terrain.cls.reduce((n, c) => n + (isLand(c) ? 1 : 0), 0);
/** The Carrier's carrying surface: the shell top (land + rim) for a turtle, land + still skin for a creature. */
const surfacePixels = (w: WorldDescription) => w.terrain.cls.reduce((n, c) => n + (isLand(c) || c === T.RIM || c === T.SKIN ? 1 : 0), 0);

function half(buf: PixelBuffer): PixelBuffer {
  const out = new PixelBuffer(Math.floor(buf.width / 2), Math.floor(buf.height / 2));
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) out.data[y * out.width + x] = buf.data[y * 2 * buf.width + x * 2];
  return out;
}

const rows: { label: string; worlds: WorldDescription[] }[] = [];
const report: string[] = [];
const series = (label: string, base: WorldDescription) => {
  const worlds = [0, 1, 2, 3].map((s) => (s ? growWorld(base, s) : base));
  rows.push({ label, worlds });
  const l0 = landPixels(worlds[0]);
  const surface = surfacePixels(worlds[0]);
  const line = `${label.padEnd(18)} canvas ${base.options.width}x${base.options.height}  land by stage: ${worlds.map((w) => landPixels(w)).join(' / ')}  (+${worlds.map((w) => Math.round(((landPixels(w) - l0) / l0) * 100)).slice(1).join('% / +')}%)  island share of the carrying surface: ${worlds.map((w) => `${Math.round((landPixels(w) / surface) * 100)}%`).join(' → ')}  objects: ${worlds.map((w) => w.objects.length).join(' / ')}`;
  report.push(line);
  console.log(line);
  return worlds;
};

const turtleSeed = 'turtle-intro';
series('turtle B (before)', generateTurtleWorld(seed, { turtleSeed, shellVariant: 2 }));
const sWorlds = series('turtle S (after)', generateTurtleWorld(seed, { turtleSeed, shellVariant: NEW_WORLD_SHELL_VARIANT }));
series('manta', generateMantaWorld(seed, { carrierSeed: 'manta-intro' }));
series('whale', generateWhaleWorld(seed, { carrierSeed: 'whale-intro' }));
console.log(`turtle S coverage target ${sWorlds[0].carrier?.coverage.target}, measured ${sWorlds[0].carrier?.coverage.measured.toFixed(3)}; origin ${JSON.stringify(sWorlds[0].carrier?.origin)}`);

// Single frames at 1×.
for (const { label, worlds } of rows) {
  const slug = label.split(' ')[0] + (label.includes('(before)') ? '-B' : label.includes('(after)') ? '-S' : '');
  worlds.forEach((w, s) => {
    if (label.includes('(before)') && s > 0) return;
    writeFileSync(`${OUT}/${slug}-stage${s}.png`, toPng(renderWorld(w)));
  });
}
// The comparison sheet: one row per Carrier, stages 0..3 at half size, each panel the Carrier's own canvas.
const panelW = Math.max(...rows.map((r) => Math.floor(r.worlds[0].options.width / 2)));
const panelH = Math.max(...rows.map((r) => Math.floor(r.worlds[0].options.height / 2)));
const LABEL = 10;
const sheet = new PixelBuffer(4 * (panelW + 4) + 4, rows.length * (panelH + LABEL + 4) + 4);
sheet.fill(hex('#1b1f2a'));
rows.forEach((row, r) => {
  row.worlds.forEach((w, s) => {
    const img = half(renderWorld(w));
    const x = 4 + s * (panelW + 4) + Math.floor((panelW - img.width) / 2);
    const y = 4 + r * (panelH + LABEL + 4) + LABEL;
    sheet.blit(img, x, y);
    const text = `${row.label.toUpperCase()} STAGE ${s}  LAND ${landPixels(w)}`;
    drawTinyText(sheet, text, 4 + s * (panelW + 4) + 2, y - LABEL + 2, hex('#f4efe4'));
  });
});
writeFileSync(`${OUT}/comparison-sheet.png`, toPng(sheet));
writeFileSync(`${OUT}/README.md`, `# The turtle's starting island\n\nSeed \`${seed}\`, turtle \`${turtleSeed}\` (\`npx tsx scripts/turtle-start.ts\`).\n\n\`\`\`\n${report.join('\n')}\n\`\`\`\n\n- \`turtle-B-stage0.png\`: before (Variant B, what existing worlds keep).\n- \`turtle-S-stage0..3.png\`: after (Variant S, new worlds), stage 0 to 3.\n- \`manta-stage0..3.png\`, \`whale-stage0..3.png\`: the other Carriers for comparison.\n- \`comparison-sheet.png\`: all of them at half size.\n`);
console.log(`wrote ${OUT}/`);
