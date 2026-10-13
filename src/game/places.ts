/**
 * PLACES: the island's named spots, found from the generated world alone (the same every time for a world): the
 * Carrier's head, the pond, the old grove, the flower meadow, the little cliff, the tail end. Walking near one
 * adds it to the journal's places and to the map; nothing about the world changes.
 */
import { T, type WorldDescription } from '../world/types';

export interface Place {
  id: string;
  name: string;
  /** A journal line, written as the Blobbi would put it. */
  note: string;
  x: number;
  y: number;
  /** How close counts as visiting (world px). */
  radius: number;
  /** A grown region's place (M7): its biome and stage, so its name can be told in any language (M11B). */
  biome?: string;
  stage?: number;
}

export const PLACE_NAMES: Record<string, { name: string; note: string }> = {
  head: { name: 'The Carrier\'s head', note: 'Where the shell meets the sea, right by the great head. The best place to listen.' },
  pond: { name: 'The still pond', note: 'A freshwater pond in the middle of the sea. Fish live in it, somehow.' },
  grove: { name: 'The old grove', note: 'The trees grow close here and the light is green. It smells of moss.' },
  meadow: { name: 'The flower meadow', note: 'More flowers than anywhere else. Butterflies agree.' },
  cliff: { name: 'The little cliff', note: 'A step of earth in the island: high ground, with a view.' },
  tail: { name: 'The tail end', note: 'The far end of the shell, above the Carrier\'s tail. Quiet, and a little windy.' },
};

/** The densest cell of a grid over points: its points' centre, or null. */
function densest(points: readonly { x: number; y: number }[], cell: number, min: number): { x: number; y: number } | null {
  const cells = new Map<string, { x: number; y: number }[]>();
  for (const p of points) {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(p);
  }
  let best: { x: number; y: number }[] | null = null;
  for (const [, list] of [...cells.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) if (!best || list.length > best.length) best = list;
  if (!best || best.length < min) return null;
  return { x: best.reduce((s, p) => s + p.x, 0) / best.length, y: best.reduce((s, p) => s + p.y, 0) / best.length };
}

/**
 * The places of a world. `snap` moves a point onto standable, reachable ground (or returns null), so every place
 * can actually be visited; `listen` is the shore spot by the head (the head place), when there is one.
 */
export function findPlaces(world: WorldDescription, snap: (x: number, y: number) => { x: number; y: number } | null, listen: { x: number; y: number } | null): Place[] {
  const out: Place[] = [];
  const add = (id: string, at: { x: number; y: number } | null, radius = 22) => {
    if (!at) return;
    const p = snap(Math.round(at.x), Math.round(at.y));
    if (!p || out.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 30)) return;
    out.push({ id, ...PLACE_NAMES[id], x: p.x, y: p.y, radius });
  };
  add('head', listen, 26);
  const { width, height, cls } = world.terrain;
  const of = (kind: number, step = 2) => {
    const pts: { x: number; y: number }[] = [];
    for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) if (cls[y * width + x] === kind) pts.push({ x, y });
    return pts;
  };
  const pond = of(T.POND);
  if (pond.length > 10) add('pond', { x: pond.reduce((s, p) => s + p.x, 0) / pond.length, y: pond.reduce((s, p) => s + p.y, 0) / pond.length + 10 });
  add('grove', densest(world.objects.filter((o) => o.kind === 'tree'), 80, 3));
  add('meadow', densest(world.objects.filter((o) => o.kind === 'flower'), 40, 3));
  const cliff = of(T.CLIFF_FACE);
  const face = cliff.length > 6 ? densest(cliff, 40, 3) : null;
  // Stand below the face (on the low ground in front of it).
  if (face) add('cliff', { x: face.x, y: face.y + 8 });
  const t = world.turtle;
  if (t) add('tail', { x: t.tail.cx + (t.cx - t.tail.cx) * 0.25, y: t.tail.cy + (t.cy - t.tail.cy) * 0.25 }, 26);
  return out;
}
