/**
 * PATHS: each island has a hub; from it a gently curved sand path runs to
 * every bridge landing and every house door on that island. A path that
 * would leave the interior falls back to a straight line, so no path ever
 * touches the shore band or the water.
 */
import { stream } from '../core/rng';
import { T, type Bridge, type Island, type Path, type TerrainMap } from './types';

export interface Hub {
  island: number;
  x: number;
  y: number;
}

const interiorAt = (terrain: TerrainMap, x: number, y: number, depth: number): boolean => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= terrain.width || yi >= terrain.height) return false;
  const i = yi * terrain.width + xi;
  const c = terrain.cls[i];
  return terrain.dist[i] <= -depth && (c === T.GRASS || c === T.GRASS_PATCH || c === T.GRASS_DARK || c === T.MEADOW || c === T.PATH);
};

export function chooseHubs(seed: string, terrain: TerrainMap, islands: Island[], scale = 1): Hub[] {
  const rng = stream(seed, 'paths', 'hubs');
  return islands.map((isl) => {
    // A little off centre, so the island does not look like a target.
    for (let tries = 0; tries < 12; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const r = isl.radius * rng.range(0.05, 0.22);
      const x = Math.round(isl.cx + Math.cos(a) * r);
      const y = Math.round(isl.cy + Math.sin(a) * r);
      if (interiorAt(terrain, x, y, 8 * scale)) return { island: isl.id, x, y };
    }
    return { island: isl.id, x: Math.round(isl.cx), y: Math.round(isl.cy) };
  });
}

/** The land pixel just inside each end of a bridge. */
export function bridgeLandings(bridge: Bridge): { from: { x: number; y: number }; to: { x: number; y: number } } {
  if (bridge.axis === 'h') return { from: { x: bridge.x0 + 2, y: bridge.y0 + 0.5 }, to: { x: bridge.x1 - 2, y: bridge.y1 + 0.5 } };
  return { from: { x: bridge.x0 + 0.5, y: bridge.y0 + 2 }, to: { x: bridge.x1 + 0.5, y: bridge.y1 - 2 } };
}

/** Chaikin corner cutting: a polyline with a bend becomes a smooth curve. */
function smooth(points: { x: number; y: number }[], passes = 2): { x: number; y: number }[] {
  let pts = points;
  for (let p = 0; p < passes; p++) {
    const out = [pts[0]];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

export function buildPath(seed: string, key: string, terrain: TerrainMap, island: number, from: { x: number; y: number }, to: { x: number; y: number }, width: number): Path {
  const rng = stream(seed, 'paths', key);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular displacement of the midpoint: a curve, not a ruler line.
  const bend = rng.centered() * Math.min(len * 0.22, 14 * Math.max(1, width / 4));
  const mx = (from.x + to.x) / 2 - (dy / len) * bend;
  const my = (from.y + to.y) / 2 + (dx / len) * bend;
  const curved = interiorAt(terrain, mx, my, width / 2 + 2) ? smooth([from, { x: mx, y: my }, to]) : [from, to];
  // The last stretch to a bridge landing must be straight along the bridge axis so the deck meets the path squarely.
  return { island, points: curved, width };
}
