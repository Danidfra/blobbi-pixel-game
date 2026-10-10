/**
 * GROUND TRUTH: the canonical Adult V3 render (the kit's `renderBlobbiSvg`,
 * rasterized by resvg) for several seeds, views and expressions, as PNGs
 * at an inspection size, plus the pixel version beside it.
 *   npx tsx scripts/references.ts examples/fidelity
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { generateGenome, renderBlobbiSvg } from '@blobbi-kit/renderer/procedural';
import { toPng } from '../src/node/png';
import { buildCanonicalSprite, stateForPose } from '../src/blobbi/canonical';
import { REST_POSE, type BlobbiPose } from '../src/blobbi/pose';

const outDir = process.argv[2] ?? 'examples/fidelity';
mkdirSync(outDir, { recursive: true });
const seeds = ['abc123', 'pattern-0', 'horns-1', 'tail-3'];
const poses: [string, BlobbiPose][] = [
  ['front', REST_POSE],
  ['happy', { ...REST_POSE, expression: 'happy' }],
  ['sad', { ...REST_POSE, expression: 'sad' }],
  ['side', { ...REST_POSE, view: 'side', facing: 1 }],
  ['back', { ...REST_POSE, view: 'back' }],
  ['walk', { ...REST_POSE, view: 'side', facing: 1, walk: 1 }],
];
for (const seed of seeds) {
  const genome = generateGenome(seed);
  for (const [label, pose] of poses) {
    const svg = renderBlobbiSvg(genome, stateForPose(pose), { idPrefix: 'r' });
    writeFileSync(join(outDir, `canonical-${seed}-${label}.png`), new Resvg(svg, { fitTo: { mode: 'height', value: 240 } }).render().asPng());
    writeFileSync(join(outDir, `pixel-${seed}-${label}-24px.png`), toPng(buildCanonicalSprite(genome, pose, 24).buffer.scaled(8)));
    writeFileSync(join(outDir, `pixel-${seed}-${label}-16px.png`), toPng(buildCanonicalSprite(genome, pose, 16).buffer.scaled(12)));
  }
}
console.log(`wrote references to ${outDir}`);
