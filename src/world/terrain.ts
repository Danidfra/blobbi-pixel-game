/**
 * TERRAIN: the island layout rasterized into per-pixel classes through a
 * signed distance field. Band widths are art-directed (a beach is wider on
 * the sunny south side; the foam line is one pixel), and the only noise is a
 * small, low-frequency wobble on the boundary.
 */
import { createNoise } from '../core/noise';
import { clamp01 } from '../core/math';
import { islandRadius, plateauRadius } from './layout';
import { T, type Bridge, type Island, type Path, type Plateau, type TerrainMap, type WorldOptions } from './types';

export interface TerrainBands {
  grassEdge: number;
  sandNorth: number;
  sandSouth: number;
  foam: number;
  shallow: number;
  deep: number;
}

/** Band widths at world scale 1 (foam stays one pixel at any scale). */
export const BANDS: TerrainBands = { grassEdge: 3, sandNorth: 3, sandSouth: 6, foam: 1, shallow: 7, deep: 22 };
export const bandsFor = (scale: number): TerrainBands => ({ grassEdge: Math.round(BANDS.grassEdge * scale), sandNorth: BANDS.sandNorth * scale, sandSouth: BANDS.sandSouth * scale, foam: 1, shallow: BANDS.shallow * scale, deep: BANDS.deep * scale });
/** Height of a cliff face in pixels at scale 1. */
export const CLIFF_HEIGHT = 5;
export const cliffHeight = (scale: number) => Math.round(CLIFF_HEIGHT * scale);

export function plateauDistance(p: Plateau, x: number, y: number): number {
  const dx = x - p.cx;
  const dy = y - p.cy;
  return Math.hypot(dx, dy) - plateauRadius(p, Math.atan2(dy, dx));
}

/** Signed distance from a point to one island's boundary, with its noise wobble. */
export function islandDistance(island: Island, x: number, y: number, wobble: number): number {
  const dx = x - island.cx;
  const dy = y - island.cy;
  const d = Math.hypot(dx, dy);
  const a = Math.atan2(dy, dx);
  const r = islandRadius(island, a) * (1 + wobble);
  return d - r;
}

export function rasterizeTerrain(seed: string, options: WorldOptions, islands: Island[], bridges: Bridge[], paths: Path[]): TerrainMap {
  const { width, height, scale } = options;
  const B = bandsFor(scale);
  const CLIFF = cliffHeight(scale);
  const cls = new Uint8Array(width * height);
  const dist = new Float32Array(width * height);
  const owner = new Int8Array(width * height).fill(-1);
  const elevation = new Uint8Array(width * height);
  const wobbleNoise = createNoise(`${seed}/terrain/wobble`, 28 * scale);
  const patchNoise = createNoise(`${seed}/terrain/patch`, 34 * scale);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const px = x + 0.5;
      const py = y + 0.5;
      let best = Infinity;
      let who = -1;
      for (const isl of islands) {
        const w = (wobbleNoise.fbm(px, py, 2) - 0.5) * 2 * isl.roughness;
        const d = islandDistance(isl, px, py, w);
        if (d < best) {
          best = d;
          who = isl.id;
        }
      }
      dist[i] = best;
      const isl = islands[who];
      // South-facing shores get a wider beach.
      const south = isl ? clamp01((py - isl.cy) / Math.max(1, isl.radius)) : 0;
      const sand = B.sandNorth + (B.sandSouth - B.sandNorth) * south;
      let c: number;
      if (best <= -B.grassEdge) {
        c = T.GRASS;
        // Soft lighter patches, blobby and large: low-frequency noise thresholded.
        const n = patchNoise.fbm(px, py, 2);
        if (n > 0.58 && best < -B.grassEdge - 2) c = T.GRASS_PATCH;
      } else if (best <= 0) c = T.GRASS_EDGE;
      else if (best <= sand) c = T.SAND;
      else if (best <= sand + 1) c = T.SAND_WET;
      else if (best <= sand + 1 + B.foam) c = T.FOAM;
      else if (best <= sand + 1 + B.foam + B.shallow) c = T.SHALLOW;
      else if (best <= B.deep) c = T.WATER;
      else c = T.DEEP;
      cls[i] = c;
      if (best <= 0) owner[i] = who;
      // Plateau: raised ground well inside the island, never reaching the shore band.
      if (isl?.plateau && c >= T.GRASS && best <= -B.grassEdge - 4 * scale && plateauDistance(isl.plateau, px, py) <= 0) elevation[i] = 1;
    }
  }
  // Cliff faces: the rows just below a plateau's southern edge become an earth wall.
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (elevation[i] || !(cls[i] === T.GRASS || cls[i] === T.GRASS_PATCH || cls[i] === T.GRASS_DARK || cls[i] === T.MEADOW)) continue;
      for (let k = 1; k <= CLIFF; k++) {
        const j = (y - k) * width + x;
        if (y - k >= 0 && elevation[j]) {
          cls[i] = T.CLIFF_FACE;
          break;
        }
      }
    }

  // Where a path climbs a plateau it becomes a RAMP: twice as wide for a few pixels either side of the rim, so
  // a character's foot (10 px) fits through the crossing. Pixels near an elevation boundary are marked first.
  const nearRim = new Uint8Array(width * height);
  {
    const reach = Math.round(7 * scale);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const e = elevation[i];
        const edge = (x > 0 && elevation[i - 1] !== e) || (x < width - 1 && elevation[i + 1] !== e) || (y > 0 && elevation[i - width] !== e) || (y < height - 1 && elevation[i + width] !== e);
        if (!edge) continue;
        for (let dy = -reach; dy <= reach; dy++)
          for (let dx = -reach; dx <= reach; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < width && yy < height && dx * dx + dy * dy <= reach * reach) nearRim[yy * width + xx] = 1;
          }
      }
  }

  // Paths: carved into grass only (never into the edge band, never into water).
  for (const path of paths) {
    const halfNormal = path.width / 2;
    const half = halfNormal * 2.2; // the widest a ramp gets; the loop narrows it away from rims
    for (let s = 0; s + 1 < path.points.length; s++) {
      const a = path.points[s];
      const b = path.points[s + 1];
      const minX = Math.max(0, Math.floor(Math.min(a.x, b.x) - half - 1));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x) + half + 1));
      const minY = Math.max(0, Math.floor(Math.min(a.y, b.y) - half - 1));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y) + half + 1));
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const len2 = abx * abx + aby * aby || 1;
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          const i = y * width + x;
          if (cls[i] !== T.GRASS && cls[i] !== T.GRASS_PATCH && cls[i] !== T.PATH && cls[i] !== T.CLIFF_FACE && cls[i] !== T.GRASS_DARK && cls[i] !== T.MEADOW) continue;
          const px = x + 0.5;
          const py = y + 0.5;
          const t = clamp01(((px - a.x) * abx + (py - a.y) * aby) / len2);
          const qx = a.x + abx * t;
          const qy = a.y + aby * t;
          const h = nearRim[i] ? half : halfNormal;
          if (Math.hypot(px - qx, py - qy) <= h) cls[i] = T.PATH;
        }
    }
  }

  // Bridge landings: a small path pad on the grass at each end.
  for (const b of bridges) {
    for (const end of [
      { x: b.x0, y: b.y0 },
      { x: b.x1, y: b.y1 },
    ]) {
      const r = b.width * 0.9;
      for (let y = Math.floor(end.y - r); y <= Math.ceil(end.y + r); y++)
        for (let x = Math.floor(end.x - r); x <= Math.ceil(end.x + r); x++) {
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const i = y * width + x;
          if ((cls[i] === T.GRASS || cls[i] === T.GRASS_PATCH || cls[i] === T.GRASS_EDGE) && Math.hypot(x + 0.5 - end.x, y + 0.5 - end.y) <= r) cls[i] = T.PATH;
        }
    }
  }

  return { width, height, cls, dist, owner, elevation };
}

/** Find where a ray from an island's centre leaves the island (its boundary), along an axis. */
export function boundaryAlong(island: Island, axis: 'h' | 'v', dir: 1 | -1, perpOffset: number, wobble = 0): { x: number; y: number } {
  // March outward in 0.5px steps until the distance becomes positive.
  let t = island.radius * 0.5;
  for (let i = 0; i < 400; i++) {
    const x = axis === 'h' ? island.cx + dir * t : island.cx + perpOffset;
    const y = axis === 'v' ? island.cy + dir * t : island.cy + perpOffset;
    if (islandDistance(island, x, y, wobble) > 0) {
      return { x, y };
    }
    t += 0.5;
  }
  return { x: axis === 'h' ? island.cx + dir * island.radius : island.cx + perpOffset, y: axis === 'v' ? island.cy + dir * island.radius : island.cy + perpOffset };
}
