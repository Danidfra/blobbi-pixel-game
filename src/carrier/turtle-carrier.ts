/**
 * THE TURTLE CARRIER. Builds the carrier record for a turtle seed and a shell variant, and embeds a world
 * generated in the island frame into the carrier's canvas.
 *
 *   Variant 0: the M1 turtle. The canvas is the island frame, the anatomy the M1 anatomy, nothing moves.
 *   Variants 1-3: the shell grows around the same island until the island covers ≈60/70/80% of it. The
 *   canvas grows (downward and upward) so the bigger shell, the head and the flippers fit; the island frame
 *   is translated by `origin` (x always 0, y a multiple of the nav cell), and nothing on the island changes.
 */
import { generateTurtleGenome, shellRadius, turtleAnatomy, turtleBodyDistance, turtlePartAt, type TurtleAnatomy, type TurtleGenome } from '../turtle/turtle';
import { islandDistance, bandsFor } from '../world/terrain';
import { islandRadius } from '../world/layout';
import { T, type Island, type TerrainMap, type WorldDescription } from '../world/types';
import { TAU } from '../core/math';
import { SHELL_VARIANTS, type ShellVariant, type WorldCarrier } from './types';

/** The nav grid's cell: the island frame moves by whole cells so navigation is identical in every variant. */
const CELL = 4;

/** The growth factor k such that (rx·k + rim)(ry·k + rim) = rx·ry / coverage: the shell's area over the island's. */
export function shellGrowth(rx: number, ry: number, rim: number, coverage: number): number {
  const A = rx * ry;
  const B = rim * (rx + ry);
  const C = rim * rim - A / coverage;
  return (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
}

/** Island area over shell area, by integrating the two radius functions. */
export function measureCoverage(a: TurtleAnatomy, island: Island): number {
  let islandArea = 0;
  let shellArea = 0;
  const n = 720;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU;
    islandArea += islandRadius(island, ang) ** 2;
    shellArea += (shellRadius(a, ang) + a.rimWidth) ** 2;
  }
  return islandArea / shellArea;
}

/** The largest turtle the species allows: the canvas of a variant is sized for it, so every seed shares one canvas. */
function largestGenome(): TurtleGenome {
  return { ...generateTurtleGenome('species-largest'), shellRx: 0.285, shellRy: 0.345, facets: 0.03, squareness: 0.035, headSize: 0.22, headLength: 1.1, neck: 0.85, flipperLength: 0.44, flipperWidth: 0.21, rearScale: 0.82, tailSize: 0.13 };
}

/** Canvas size and the island frame's vertical offset for a variant (the same for every seed). */
export function variantCanvas(variant: ShellVariant, frame: { width: number; height: number }, scale: number): { width: number; height: number; originY: number } {
  const coverage = SHELL_VARIANTS[variant].coverage;
  if (coverage === null) return { width: frame.width, height: frame.height, originY: 0 };
  const genome = largestGenome();
  const ref = turtleAnatomy(genome, frame.width, frame.height, scale);
  const k = shellGrowth(ref.rx, ref.ry, ref.rimWidth, coverage);
  const above = ref.ry * k * (1 + genome.facets + genome.squareness) + ref.rimWidth + ref.tail.length + 6;
  const originY = Math.max(0, Math.ceil((above - ref.cy) / CELL) * CELL);
  const grown = turtleAnatomy(genome, frame.width, frame.height, scale, { cx: ref.cx, cy: ref.cy + originY, rx: ref.rx * k, ry: ref.ry * k, ref });
  const bottom = grown.head.cy + grown.head.ry + 6;
  return { width: frame.width, height: Math.ceil(bottom / 16) * 16, originY };
}

export function buildTurtleCarrier(turtleSeed: string, variant: ShellVariant, frame: { width: number; height: number }, scale: number, island: Island): WorldCarrier {
  const genome = generateTurtleGenome(turtleSeed);
  const ref = turtleAnatomy(genome, frame.width, frame.height, scale);
  const coverage = SHELL_VARIANTS[variant].coverage;
  if (coverage === null) {
    return { species: 'turtle', seed: turtleSeed, variant, coverage: { target: null, measured: measureCoverage(ref, island) }, origin: { x: 0, y: 0 }, frame: { ...frame }, canvas: { ...frame }, growth: 1, turtle: ref };
  }
  const k = shellGrowth(ref.rx, ref.ry, ref.rimWidth, coverage);
  const canvas = variantCanvas(variant, frame, scale);
  const turtle = turtleAnatomy(genome, canvas.width, canvas.height, scale, { cx: ref.cx, cy: ref.cy + canvas.originY, rx: ref.rx * k, ry: ref.ry * k, ref });
  const moved: Island = { ...island, cy: island.cy + canvas.originY };
  return {
    species: 'turtle',
    seed: turtleSeed,
    variant,
    coverage: { target: coverage, measured: measureCoverage(turtle, moved) },
    origin: { x: 0, y: canvas.originY },
    frame: { ...frame },
    canvas: { width: canvas.width, height: canvas.height },
    growth: k,
    turtle,
  };
}

/** Is the pixel on the carrier's shell (dome plus lip), by the same test the shell surface paints with? */
export function onShell(a: TurtleAnatomy, x: number, y: number): boolean {
  const dx = x + 0.5 - a.cx;
  const dy = y + 0.5 - a.cy;
  return Math.hypot(dx, dy) <= shellRadius(a, Math.atan2(dy, dx)) + a.rimWidth;
}

/**
 * Classify every non-land pixel around the carrier: shell (RIM), body (SKIN), then the sea's bands around
 * the whole animal. Land (dist ≤ 0) is never touched.
 */
export function classifyAroundCarrier(terrain: TerrainMap, a: TurtleAnatomy, scale: number): void {
  const { width, height, cls, dist } = terrain;
  const B = bandsFor(scale);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (dist[i] <= 0) continue;
      const dx = x + 0.5 - a.cx;
      const dy = y + 0.5 - a.cy;
      const r = Math.hypot(dx, dy);
      const outer = shellRadius(a, Math.atan2(dy, dx)) + a.rimWidth;
      if (r <= outer) {
        cls[i] = T.RIM;
        continue;
      }
      if (turtlePartAt(a, x, y)) {
        cls[i] = T.SKIN;
        continue;
      }
      const sea = Math.min(r - outer, turtleBodyDistance(a, x, y));
      cls[i] = sea <= B.foam + 0.5 ? T.FOAM : sea <= B.foam + B.shallow ? T.SHALLOW : sea <= B.deep ? T.WATER : T.DEEP;
    }
}

/**
 * Embed a world generated in the island frame into the carrier's canvas: one translation by `carrier.origin`
 * for terrain, islands, hubs, paths and objects; the sea reclassified around the enlarged shell. The island's
 * pixels, its walkable geometry and every object keep their island-frame relationship exactly.
 */
export function embedInCarrier(base: WorldDescription, carrier: WorldCarrier): WorldDescription {
  const { x: ox, y: oy } = carrier.origin;
  const { width, height } = carrier.canvas;
  const src = base.terrain;
  const cls = new Uint8Array(width * height);
  const dist = new Float32Array(width * height);
  const owner = new Int8Array(width * height).fill(-1);
  const elevation = new Uint8Array(width * height);
  const islands: Island[] = base.islands.map((isl) => ({ ...isl, cx: isl.cx + ox, cy: isl.cy + oy, plateau: isl.plateau ? { ...isl.plateau, cx: isl.plateau.cx + ox, cy: isl.plateau.cy + oy } : null }));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const sx = x - ox;
      const sy = y - oy;
      if (sx >= 0 && sy >= 0 && sx < src.width && sy < src.height) {
        const j = sy * src.width + sx;
        cls[i] = src.cls[j];
        dist[i] = src.dist[j];
        owner[i] = src.owner[j];
        elevation[i] = src.elevation[j];
      } else {
        cls[i] = T.DEEP;
        dist[i] = islandDistance(islands[0], x + 0.5, y + 0.5, 0);
      }
    }
  const terrain: TerrainMap = { width, height, cls, dist, owner, elevation };
  classifyAroundCarrier(terrain, carrier.turtle, base.options.scale);
  return {
    ...base,
    options: { ...base.options, width, height, shellVariant: carrier.variant },
    islands,
    bridges: base.bridges.map((b) => ({ ...b, x0: b.x0 + ox, x1: b.x1 + ox, y0: b.y0 + oy, y1: b.y1 + oy })),
    piers: base.piers.map((p) => ({ ...p, x0: p.x0 + ox, x1: p.x1 + ox, y0: p.y0 + oy, y1: p.y1 + oy })),
    paths: base.paths.map((p) => ({ ...p, points: p.points.map((q) => ({ x: q.x + ox, y: q.y + oy })) })),
    hubs: base.hubs.map((h) => ({ ...h, x: h.x + ox, y: h.y + oy })),
    terrain,
    objects: base.objects.map((o) => ({ ...o, x: o.x + ox, y: o.y + oy })),
    turtle: carrier.turtle,
    carrier,
  };
}
