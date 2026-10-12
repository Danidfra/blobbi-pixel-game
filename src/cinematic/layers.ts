/**
 * THE LAYERS OF THE BIRTH OF AN ISLAND, for the intro cinematic. Cinematic-only pictures of the real world, so the
 * Carrier can be seen without its island and the island can form on its back; the world itself (terrain, objects,
 * growth, saves) is never touched, and at the end every pixel is the game's own.
 *
 *   bare    the Carrier as if it carried nothing: the terrain painter's own water bands round the animal, and the
 *           animal's body where the land will be (a whale's or manta's drawn core; a turtle's shell painted with
 *           its real plate layout and only a seed-sized patch of soil at the island's centre)
 *   land    the real terrain without objects or their shadows (the terrain painter alone)
 *   order   per world pixel, 0..1: when it turns from bare to land, from a first patch outward along the land's
 *           own shape, with two later patches joining and a noisy, organic edge; the same order gates the moment
 *           each plant, rock and house shows
 *   set     1 where bare and land differ (what the formation has to change)
 */
import { PixelBuffer } from '../core/pixel';
import { stream } from '../core/rng';
import { paletteFor } from '../world/generate';
import { paintTerrain } from '../render/paint-terrain';
import { turtleBodyFor } from '../render/compose';
import { creatureUnderlay } from '../carriers/creature-render';
import { renderTurtleBody } from '../turtle/turtle';
import { paintShellSurface } from '../carrier/shell-surface';
import { valueNoise } from '../carriers/common';
import { T, type Island, type TerrainMap, type WorldDescription } from '../world/types';
import type { WorldBounds } from '../render/view-camera';

/** Land: everything the Carrier carries (not water, not its own rim or skin). */
export const isLand = (c: number): boolean => c >= T.SAND_WET && c !== T.RIM && c !== T.SKIN;

/** The Carrier's body where the island will lie: a world-sized buffer, transparent elsewhere. */
export function bareCarrierUnderlay(world: WorldDescription): PixelBuffer | undefined {
  if (!world.turtle) return creatureUnderlay(world);
  const a = world.turtle;
  const carrier = world.carrier;
  const { width, height } = world.options;
  // The M1 shell draws its whole dome; the enlarged shells paint plates everywhere but under the land (flat there),
  // so they are painted again as if the land were a seed-sized patch at the island's centre: the same seeded
  // seams in two rows over the whole dome, a little moss and soil round the patch. The ring just outside the real
  // island differs a little from the final shell (its outer row sits further out), and forms with the land.
  if (!carrier || carrier.variant === 0) return turtleBodyFor(a, width, height).buffer;
  const island = world.islands[0];
  const seedPatch: Island = { ...island, radius: 2.5, harmonics: [], roughness: 0, coast: [], plateau: null };
  const ctx = { island: seedPatch, palette: paletteFor(world.options.palette), seed: carrier.seed, scale: world.options.scale };
  return renderTurtleBody(a, (buf, anatomy) => paintShellSurface(buf, anatomy, ctx).dome).buffer;
}

/** The terrain with every land pixel turned into Carrier skin (and no plateaus), for the bare picture. */
function bareTerrain(terrain: TerrainMap): TerrainMap {
  const cls = new Uint8Array(terrain.cls);
  for (let i = 0; i < cls.length; i++) if (isLand(cls[i])) cls[i] = T.SKIN;
  return { ...terrain, cls, elevation: new Uint8Array(terrain.cls.length) };
}

/** The world as the Carrier alone: water, wake, and the animal's body where the island will be. */
export function bareCarrierLayer(world: WorldDescription): PixelBuffer {
  const { width, height } = world.options;
  const buf = new PixelBuffer(width, height);
  paintTerrain(buf, bareTerrain(world.terrain), paletteFor(world.options.palette), world.seed, { animatedWater: true, underlay: bareCarrierUnderlay(world) });
  return buf;
}

/** The real terrain without objects, their shadows, bridges or piers. */
export function terrainOnlyLayer(world: WorldDescription, underlay: PixelBuffer | undefined): PixelBuffer {
  const { width, height } = world.options;
  const buf = new PixelBuffer(width, height);
  paintTerrain(buf, world.terrain, paletteFor(world.options.palette), world.seed, { animatedWater: true, underlay });
  return buf;
}

export interface Formation {
  /** 0..1 over the pixels that form; geometric beyond them (a canopy over the rim follows the land near it). */
  order: Float32Array;
  /** 1 where the bare picture and the land differ. */
  set: Uint8Array;
  /** The land's centre and half extents (world px), measured from the terrain. */
  land: { cx: number; cy: number; rx: number; ry: number };
  /** Where the first patch and the later patches start (world px), and the later patches' delays in order units. */
  patches: { x: number; y: number; delay: number }[];
}

/**
 * The formation: a first patch at the land's centre spreading outward in the land's own proportions, two more
 * patches joining later, the edge wandering with noise. Deterministic from the world seed.
 */
export function formation(world: WorldDescription, bare: PixelBuffer, land: PixelBuffer): Formation {
  const { width, height, cls } = world.terrain;
  const set = new Uint8Array(width * height);
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (bare.data[i] !== land.data[i]) set[i] = 1;
      if (!isLand(cls[i])) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  if (x1 < x0) {
    x0 = 0;
    y0 = 0;
    x1 = width - 1;
    y1 = height - 1;
  }
  const landBox = { cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2, rx: Math.max(8, (x1 - x0 + 1) / 2), ry: Math.max(8, (y1 - y0 + 1) / 2) };
  // The first patch: the land pixel nearest the land's centre (a pond or a path is fine: it is where it begins).
  const rng = stream(world.seed, 'intro', 'formation');
  const nearestLand = (px: number, py: number): { x: number; y: number } => {
    let best = { x: Math.round(px), y: Math.round(py) };
    let bestD = Infinity;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (!isLand(cls[y * width + x])) continue;
        const d = (x - px) ** 2 + (y - py) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    return best;
  };
  const first = nearestLand(landBox.cx, landBox.cy);
  const patches: Formation['patches'] = [{ ...first, delay: 0 }];
  for (let k = 0; k < 2; k++) {
    // A later patch: at a seeded bearing, well out from the centre, on land.
    const ang = rng.range(0, Math.PI * 2);
    const r = rng.range(0.45, 0.75);
    patches.push({ ...nearestLand(landBox.cx + Math.cos(ang) * landBox.rx * r, landBox.cy + Math.sin(ang) * landBox.ry * r), delay: 0.28 + k * 0.17 });
  }
  const order = new Float32Array(width * height);
  const dist = (p: { x: number; y: number }, x: number, y: number) => Math.hypot((x + 0.5 - p.x) / landBox.rx, (y + 0.5 - p.y) / landBox.ry);
  let max = 1e-6;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let o = Infinity;
      for (const p of patches) o = Math.min(o, dist(p, x, y) * (p.delay ? 1.4 : 1) + p.delay);
      o += (valueNoise(`${world.seed}|intro-form`, x, y, 14) - 0.5) * 0.16;
      order[i] = o;
      if (set[i] && o > max) max = o;
    }
  for (let i = 0; i < order.length; i++) order[i] = Math.max(0, order[i] / max);
  return { order, set, land: landBox, patches };
}

/** The whole animal, moving parts included, with a little water round it: what the reveal frames. */
export function revealSubject(world: WorldDescription, bounds: WorldBounds, parts: Uint8Array): { x0: number; y0: number; x1: number; y1: number } {
  const { width, height } = world.options;
  const s = bounds.subject ?? { x0: 0, y0: 0, x1: width, y1: height };
  let x0 = s.x0;
  let y0 = s.y0;
  let x1 = s.x1;
  let y1 = s.y1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!parts[y * width + x]) continue;
      if (x < x0) x0 = x;
      if (x + 1 > x1) x1 = x + 1;
      if (y < y0) y0 = y;
      if (y + 1 > y1) y1 = y + 1;
    }
  const m = 6;
  return { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
}

/**
 * The scale that shows the whole subject: 1 when it fits, else quarter steps down to a half (the cinematic may go
 * below the game's overview floor of 0.75 so that a wide animal is never cut; every screen pixel is still one
 * world pixel).
 */
export function revealScale(W: number, H: number, subject: { x0: number; y0: number; x1: number; y1: number }): number {
  const fit = Math.min(W / Math.max(1, subject.x1 - subject.x0), H / Math.max(1, subject.y1 - subject.y0));
  if (fit >= 1) return 1;
  return Math.max(0.5, Math.floor(fit * 4) / 4);
}
