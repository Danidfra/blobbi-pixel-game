/**
 * Walk-cycle stability per size: pixels that change above the legs between consecutive walk frames, and the
 * drift of the dark facial pixels, for the raw raster ("now") and with whole-pixel rig motion ("snap").
 *   npx tsx scripts/walk-metrics.ts [seeds=blobbi-9]   (comma-separated)
 */
import { buildCanonicalSprite } from '../src/blobbi/canonical';
import { REST_POSE, type BlobbiPose } from '../src/blobbi/sprite';
import { blobbiIdentity } from '../src/blobbi/identity';
const seeds = (process.argv[2] ?? 'blobbi-9').split(',');
const lum = (c: number) => (c & 255) * 0.3 + ((c >>> 8) & 255) * 0.59 + ((c >>> 16) & 255) * 0.11;
for (const seed of seeds) {
const g = blobbiIdentity(seed).genome;
for (const view of ['front', 'side', 'back'] as const) for (const size of [12, 14, 16, 32, 64]) {
  const out: string[] = [];
  for (const snap of [false, true]) {
    const frames = [0, 1, 2, 3, 4, 5].map((w) => buildCanonicalSprite(g, { ...REST_POSE, view, walk: w as BlobbiPose['walk'] }, size, { snapRig: snap }));
    let upper = 0, total = 0, eyeJumps = 0;
    const eye = (s: typeof frames[0]) => { let x = 0, y = 0, n = 0; const b = s.buffer; for (let j = 0; j < b.height; j++) for (let i = 0; i < b.width; i++) { const c = b.get(i, j); if ((c >>> 24) && lum(c) < 60) { x += i; y += j; n++; } } return n ? [x / n, y / n] : [0, 0]; };
    for (let i = 0; i < 6; i++) {
      const a = frames[i], b = frames[(i + 1) % 6];
      for (let y = 0; y < a.buffer.height; y++) for (let x = 0; x < a.buffer.width; x++) {
        if (a.buffer.get(x, y) === b.buffer.get(x, y)) continue;
        total++; if (y - a.anchorY < -size * 0.35) upper++;
      }
      const ea = eye(a), eb = eye(b); eyeJumps += Math.hypot(ea[0] - eb[0], ea[1] - eb[1]);
    }
    out.push(`${snap ? 'whole-pixel rig' : 'raw raster'}: upper ${String(upper).padStart(4)} all ${String(total).padStart(4)} dark-drift ${eyeJumps.toFixed(2)}`);
  }
  console.log(`${seed} ${view.padEnd(5)} ${String(size).padStart(2)}px  ${out.join('   |   ')}`);
}
}
