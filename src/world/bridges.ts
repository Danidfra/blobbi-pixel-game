/**
 * BRIDGE RESOLUTION. A layout only says which islands are bridged and along
 * which axis. The deck's exact ends are read off the rasterized land, row by
 * row, so a bridge always meets real shore on both sides. Rows are scored by
 * gap length and by how flat the shore is where the deck lands.
 */
import { T, type Bridge, type Island, type TerrainMap } from './types';
import { bridgeGap } from './layout';

const isLand = (c: number) => c >= T.GRASS_EDGE;

export function resolveBridges(terrain: TerrainMap, islands: Island[], bridges: Bridge[], scale = 1): Bridge[] {
  const out: Bridge[] = [];
  for (const b of bridges) {
    // Strict first (a flat shore on both ends, a short gap), then relaxed, so a bridge is never simply dropped
    // when the coast is awkward: a long or crooked bridge beats an unreachable island.
    const resolved = resolveOne(terrain, islands, b, scale, { flatness: 0.7, extraGap: 8 * scale, reach: 14 * scale }) ?? resolveOne(terrain, islands, b, scale, { flatness: 0.45, extraGap: 26 * scale, reach: 26 * scale });
    if (resolved) out.push(resolved);
  }
  return out;
}

function resolveOne(terrain: TerrainMap, islands: Island[], b: Bridge, scale: number, rule: { flatness: number; extraGap: number; reach: number }): Bridge | null {
  const { width, height, cls, owner } = terrain;
  const gapRange = bridgeGap(scale);
  let a = islands[b.from];
  let c = islands[b.to];
  const along = b.axis === 'h' ? 'cx' : 'cy';
  const across = b.axis === 'h' ? 'cy' : 'cx';
  if (a[along] > c[along]) [a, c] = [c, a];
  const half = Math.floor(b.width / 2);
  const lo = Math.max(half + 1, Math.round(Math.min(a[across], c[across]) - rule.reach));
  const hi = Math.min((b.axis === 'h' ? height : width) - half - 2, Math.round(Math.max(a[across], c[across]) + rule.reach));
  let best: { score: number; start: number; end: number; line: number } | null = null;
  for (let line = lo; line <= hi; line++) {
    const at = (p: number) => (b.axis === 'h' ? p + line * width : line + p * width);
    const limit = b.axis === 'h' ? width : height;
    // From A's centre outward until leaving A.
    let p = Math.round(a[along]);
    if (owner[at(p)] !== a.id) continue;
    while (p + 1 < limit && owner[at(p + 1)] === a.id) p++;
    const start = p;
    // Then across water until reaching C (no third island in between).
    let q = start + 1;
    while (q < limit && !isLand(cls[at(q)])) q++;
    if (q >= limit || owner[at(q)] !== c.id) continue;
    const end = q;
    const gap = end - start - 1;
    if (gap < 6 * scale || gap > gapRange.max + rule.extraGap) continue;
    // Shore flatness: the deck's full width must land on land at both ends.
    let flat = 0;
    for (let k = -half; k <= half; k++) {
      const li = b.axis === 'h' ? start + (line + k) * width : line + k + start * width;
      const ri = b.axis === 'h' ? end + (line + k) * width : line + k + end * width;
      if (owner[li] === a.id) flat++;
      if (owner[ri] === c.id) flat++;
    }
    const flatness = flat / (2 * (half * 2 + 1));
    if (flatness < rule.flatness) continue;
    const mid = (a[across] + c[across]) / 2;
    const score = gap + Math.abs(line - mid) * 0.35 + (1 - flatness) * 40;
    if (!best || score < best.score) best = { score, start, end, line };
  }
  if (!best) return null;
  // The deck overhangs the shore by two pixels on each side.
  const s = best.start - 2;
  const e = best.end + 2;
  return {
    ...b,
    from: a.id,
    to: c.id,
    x0: b.axis === 'h' ? s : best.line,
    y0: b.axis === 'h' ? best.line : s,
    x1: b.axis === 'h' ? e : best.line,
    y1: b.axis === 'h' ? best.line : e,
  };
}
