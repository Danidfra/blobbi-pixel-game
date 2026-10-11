/**
 * THE SHELL SURFACE. The visible shell between the island's edge and the water, for the enlarged shell
 * variants. Drawn once into the body buffer, under the terrain, as the turtle's own skin of plates:
 *
 *   island edge ─► soil band (earth under the land, an earth face and its shadow on the sunlit south side,
 *   crumbs thinning outward) ─► plates (marginal scutes in one or two rows with jittered, wobbling seams and
 *   rounded junctions, each plate its own shade with a faint growth ring, a one-pixel bevel against the
 *   light, moss in the crevices and near the soil) ─► lip (the shell's lighter edge) ─► outline ─► water.
 *
 * Everything is a function of the turtle seed, the anatomy and the island outline: deterministic, never
 * animated, and never consulted by collision or navigation (those read terrain classes, where all of this is RIM).
 */
import { stream } from '../core/rng';
import { createNoise } from '../core/noise';
import { mix } from '../core/color';
import { ramp, type Ramp, type WorldPalette } from '../core/palette';
import { Mask, PixelBuffer } from '../core/pixel';
import { blobScore } from '../core/shade';
import { clamp, TAU } from '../core/math';
import { islandDistance } from '../world/terrain';
import { islandRadius } from '../world/layout';
import type { Island } from '../world/types';
import { shellRadius, type TurtleAnatomy } from '../turtle/turtle';

export interface ShellSurfaceContext {
  /** The island's outline in canvas coordinates: where the land rests on the shell (and the plate layout). */
  island: Island;
  /** A grown island's coastline (M7): what the land covers now. The plate layout still follows `island`, so the
   * visible plates keep their exact place; only the covered part and the soil band follow the new coast. */
  land?: Island;
  palette: WorldPalette;
  /** The turtle seed: plate layout, soil and moss come from it. */
  seed: string;
  scale: number;
}

/** Plate layout and the few measurements the tests check. */
export interface ShellPlates {
  rows: 1 | 2;
  /** Plates per row. */
  count: number;
  /** Mean width of the visible shell ring (island edge to shell edge), in pixels. */
  marginMean: number;
  lipWidth: number;
}

/** Region codes of the shell surface, per pixel (exported for the tests). */
export const SHELL_REGION = { OUT: 0, HIDDEN: 1, SOIL: 2, PLATE: 3, SEAM: 4, LIP: 5 } as const;

const SHADES: (keyof Ramp)[] = ['dark', 'mid', 'light', 'highlight'];
const shadeIndex = (score: number, hi: number, li: number, dk: number) => (score > hi ? 3 : score > li ? 2 : score > dk ? 1 : 0);
const at = (r: Ramp, i: number) => r[SHADES[clamp(i, 0, 3)]];

/** A small integer hash for per-pixel dithering (no strings, no draw-order dependence). */
export function pixelHash(x: number, y: number, salt: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + salt) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Plate layout for an anatomy: deterministic from the genome and the ring's width. */
export function shellPlates(a: TurtleAnatomy, island: Island, scale: number): ShellPlates {
  let marginSum = 0;
  for (let i = 0; i < 64; i++) {
    const ang = (i / 64) * TAU;
    marginSum += shellRadius(a, ang) + a.rimWidth - islandRadius(island, ang);
  }
  const marginMean = marginSum / 64;
  const lipWidth = Math.max(2, Math.round(1.6 * scale));
  const count = clamp(Math.round(24 * a.genome.markingDensity), 16, 32);
  return { rows: marginMean > 17 * scale ? 2 : 1, count, marginMean, lipWidth };
}

/** The region map of a painted surface, for tests: same inputs, same geometry. */
export interface ShellSurfaceResult {
  dome: Mask;
  layout: ShellPlates;
  /** Region code per canvas pixel (0 outside the dome). */
  region: Uint8Array;
  /** Moss (1 = edge, 2 = full) per canvas pixel. */
  moss: Uint8Array;
}

/**
 * Paint the shell (the whole dome; the terrain will cover its top) into `buf`. Returns the dome's mask and
 * the region map.
 */
export function paintShellSurface(buf: PixelBuffer, a: TurtleAnatomy, ctx: ShellSurfaceContext): ShellSurfaceResult {
  const g = a.genome;
  const { island, palette, seed, scale } = ctx;
  const rim = a.rimWidth;
  const layout = shellPlates(a, island, scale);
  const rng = stream(seed, 'carrier', 'shell', 'plates');
  const N = layout.count;
  // Jittered seam angles per row; the second row is offset by half a plate (brickwork), as marginal scutes are.
  const seams: number[][] = [];
  for (let r = 0; r < layout.rows; r++) {
    const row: number[] = [];
    for (let i = 0; i < N; i++) row.push(((i + 0.5 * r + 0.3 * rng.range(-1, 1)) / N) * TAU);
    seams.push(row);
  }
  const wobble = seams.map((row) => row.map(() => rng.range(0, TAU)));
  const lean = seams.map((row) => row.map(() => rng.range(-0.02, 0.02)));
  const splitPhase = rng.range(0, TAU);
  const splitAmp = rng.range(0.03, 0.06);
  const ringWobble = rng.range(0, TAU);
  const uSplit = (ang: number) => 0.5 + splitAmp * Math.sin(2 * ang + splitPhase) + 0.02 * Math.sin(7 * ang + ringWobble) + 0.015 * Math.sin(13 * ang - ringWobble);
  // Per-plate tint: most plates plain, some a shade lighter or darker.
  const tints = new Int8Array(layout.rows * N);
  for (let i = 0; i < tints.length; i++) tints[i] = rng.weighted([-1, 0, 1] as const, [2, 6, 3]);
  const soilNoise = createNoise(`${seed}/shell/soil`, 10 * scale);
  const mossNoise = createNoise(`${seed}/shell/moss`, 4.5 * scale);
  const salt = rng.int(0, 0x7fffffff);
  const ringInset = 2.2 * scale;

  // Colours. Plates use the shell ramp inside and a lighter mix toward the lip outside; the lip the rim ramp.
  const innerRamp = g.shell;
  const outerRamp = ramp(mix(g.shell.mid, g.rim.mid, 0.45), { step: 0.085, hueShift: 8 });
  const seamColor = mix(g.shell.dark, g.shell.outline, 0.5);
  const seamOuter = mix(outerRamp.dark, g.shell.outline, 0.5);
  const earth = ramp(mix(palette.path.dark, g.shell.dark, 0.35), { step: 0.09, hueShift: 6 });
  const earthShadow = mix(earth.dark, palette.shadowOnSand, 0.6);
  const moss = ramp(mix(palette.grass.dark, g.shell.dark, 0.45), { step: 0.08, hueShift: 8 });
  const faceH = Math.round(2 * scale) + 1;

  // Pass 1: geometry and regions over the dome's bounding box.
  const reach = Math.max(a.rx, a.ry) * 1.12 + rim + 2;
  const x0 = Math.max(0, Math.floor(a.cx - reach));
  const y0 = Math.max(0, Math.floor(a.cy - reach));
  const x1 = Math.min(buf.width - 1, Math.ceil(a.cx + reach));
  const y1 = Math.min(buf.height - 1, Math.ceil(a.cy + reach));
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const region = new Uint8Array(bw * bh);
  const uArr = new Float32Array(bw * bh);
  const dArr = new Float32Array(bw * bh);
  const nyArr = new Float32Array(bw * bh);
  const edgeArr = new Float32Array(bw * bh);
  const shade = new Int8Array(bw * bh);
  const plate = new Int16Array(bw * bh).fill(-1);
  const dome = new Mask(buf.width, buf.height);
  const soilAt = new Float32Array(bw * bh);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const k = (y - y0) * bw + (x - x0);
      const px = x + 0.5;
      const py = y + 0.5;
      const dx = px - a.cx;
      const dy = py - a.cy;
      const r = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const outer = shellRadius(a, ang) + rim;
      if (r > outer) continue;
      dome.set(x, y);
      // Dome lighting, kept mostly mid and light: the ring should read warm, not as a dark rind.
      shade[k] = shadeIndex(blobScore(dx / (a.rx + rim), dy / (a.ry + rim), 0.9), 0.95, 0.3, -0.28);
      const d = islandDistance(island, px, py, 0);
      const dLand = ctx.land ? islandDistance(ctx.land, px, py, 0) : d;
      if (dLand <= 0) {
        region[k] = SHELL_REGION.HIDDEN;
        continue;
      }
      const margin = d + (outer - r);
      const u = d / Math.max(1e-3, margin);
      uArr[k] = u;
      dArr[k] = dLand;
      const ny = Math.sin(ang);
      nyArr[k] = ny;
      const toLip = outer - r - layout.lipWidth;
      if (toLip < 0) {
        region[k] = SHELL_REGION.LIP;
        continue;
      }
      // Soil: a band whose width breathes with noise and thickens on the south side, with a dithered fringe.
      const soilW = 0.9 * scale * (0.5 + 0.7 * soilNoise.at(px, py)) + 1.7 * scale * Math.max(0, ny) * (0.8 + 0.4 * soilNoise.at(px + 37, py));
      soilAt[k] = soilW;
      if (dLand < soilW || (dLand < soilW * 1.8 && (pixelHash(x, y, salt) & 0xff) / 256 < (1 - (dLand - soilW) / (soilW * 0.8)) * 0.6)) {
        region[k] = SHELL_REGION.SOIL;
        continue;
      }
      const toSoil = dLand - soilW * 1.1;
      // Plates: which row, which plate, and whether this pixel is on a seam.
      const split = uSplit(ang);
      const row = layout.rows === 2 && u < split ? 0 : layout.rows === 2 ? 1 : 0;
      const toRing = layout.rows === 2 ? Math.abs(u - split) * margin : Infinity;
      const rowSeams = seams[row];
      let best = Infinity;
      let index = 0;
      for (let i = 0; i < N; i++) {
        // Seams wobble along their length and lean a little, so no two are parallel.
        const sa = rowSeams[i] + lean[row][i] * (u - 0.5) + 0.007 * Math.sin(u * 11 + wobble[row][i]) + 0.004 * Math.sin(u * 23 - wobble[row][i]);
        let da = ang - sa;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < Math.abs(best)) {
          best = da;
          index = i;
        }
      }
      const toSeam = Math.abs(best) * r;
      const radial = Math.min(toRing, toLip, toSoil);
      // Seams are one pixel; junctions (seam meets ring, lip or soil) round off into a small dark corner.
      if (toSeam < 0.7 || toRing < 0.7 || toLip < 0.7 || (toSeam < 1.5 && radial < 1.5 && toSeam + radial < 2.1)) {
        region[k] = SHELL_REGION.SEAM;
        continue;
      }
      region[k] = SHELL_REGION.PLATE;
      edgeArr[k] = Math.min(toSeam, radial);
      // The plate is the one after the nearest seam when we are past it, else the one before.
      plate[k] = row * N + (best >= 0 ? index : (index + N - 1) % N);
    }

  // Pass 2: moss. Fine patches on plates near the soil, dust along seams, never on the lip.
  const mossMask = new Uint8Array(bw * bh);
  for (let k = 0; k < bw * bh; k++) {
    const reg = region[k];
    if (reg !== SHELL_REGION.PLATE && reg !== SHELL_REGION.SEAM) continue;
    const u = uArr[k];
    if (u > 0.72) continue;
    const x = x0 + (k % bw);
    const y = y0 + Math.floor(k / bw);
    const m = mossNoise.fbm(x + 0.5, y + 0.5, 2) + 0.22 * (1 - u) + (reg === SHELL_REGION.SEAM ? 0.16 : 0) - 0.86;
    if (m > 0) mossMask[k] = m > 0.07 ? 2 : 1;
    else if (reg === SHELL_REGION.SEAM && u < 0.6 && (pixelHash(x, y, salt ^ 0x11) & 7) === 0) mossMask[k] = 1;
  }

  // Pass 3: colours.
  const regionAt = (x: number, y: number) => (x < x0 || y < y0 || x > x1 || y > y1 ? SHELL_REGION.OUT : region[(y - y0) * bw + (x - x0)]);
  const mossAt = (x: number, y: number) => (x < x0 || y < y0 || x > x1 || y > y1 ? 0 : mossMask[(y - y0) * bw + (x - x0)]);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const k = (y - y0) * bw + (x - x0);
      const reg = region[k];
      if (reg === SHELL_REGION.OUT) continue;
      const idx = shade[k];
      if (reg === SHELL_REGION.HIDDEN) {
        buf.set(x, y, g.shell.mid);
        continue;
      }
      const d = dArr[k];
      const ny = nyArr[k];
      const u = uArr[k];
      // The island's shadow on the shell: on the south side, a band under the earth face.
      const faceHere = faceH * Math.max(0, ny - 0.1);
      const inShadow = ny > 0.2 && d > faceHere && d < faceHere + soilAt[k] * 0.5 + 1.6 * scale * ny;
      if (reg === SHELL_REGION.LIP) {
        buf.set(x, y, at(g.rim, idx));
        continue;
      }
      if (reg === SHELL_REGION.SOIL) {
        let c: number;
        if (d < 1) c = ny > 0.35 ? earth.light : earth.outline; // lit top edge of the earth face, or the occlusion line
        else if (d < 1 + faceHere) c = d + 1 >= 1 + faceHere ? earth.outline : (pixelHash(x, 0, salt) & 3) === 0 ? earth.dark : earth.mid;
        else if (inShadow) c = (pixelHash(x, y, salt ^ 0x55) & 7) === 0 ? earth.dark : earthShadow;
        else c = (pixelHash(x, y, salt ^ 0x99) & 15) === 0 ? earth.dark : (pixelHash(x, y, salt ^ 0x33) & 15) === 0 ? earth.light : earth.mid;
        buf.set(x, y, c);
        continue;
      }
      const mossHere = mossMask[k];
      if (mossHere) {
        const lit = !mossAt(x, y - 1) || !mossAt(x - 1, y);
        buf.set(x, y, mossHere === 2 && lit ? moss.light : mossHere === 2 ? moss.mid : moss.dark);
        continue;
      }
      const outerRow = layout.rows === 2 ? u >= uSplit(Math.atan2(y + 0.5 - a.cy, x + 0.5 - a.cx)) : u >= 0.62;
      const rampHere = outerRow ? outerRamp : innerRamp;
      if (reg === SHELL_REGION.SEAM) {
        buf.set(x, y, outerRow ? seamOuter : seamColor);
        continue;
      }
      // A plate: dome shade, the plate's own tint, a bevel beside the seams (lit wall below/right of a seam,
      // rolled edge above/left of one), a faint growth ring inset from the edge, the island's shadow, a freckle.
      let level = idx + tints[plate[k]];
      const lit = regionAt(x, y - 1) === SHELL_REGION.SEAM || regionAt(x - 1, y) === SHELL_REGION.SEAM;
      const rolled = regionAt(x, y + 1) === SHELL_REGION.SEAM || regionAt(x + 1, y) === SHELL_REGION.SEAM;
      if (lit && !rolled) level += 1;
      else if (rolled && !lit) level -= 1;
      const edge = edgeArr[k];
      if (edge >= ringInset && edge < ringInset + 1 && g.markings === 'rings') level -= 1;
      if (g.markings === 'spots' && edge > ringInset + 1 && (pixelHash(x >> 1, y >> 1, salt ^ 0x44) % 37) === 0) level -= 1;
      if (inShadow) level -= 1;
      if ((pixelHash(x, y, salt ^ 0x77) % 31) === 0) level -= 1;
      buf.set(x, y, at(rampHere, level));
    }
  buf.paintMask(dome.edge(), g.shell.outline);
  // Region and moss maps in canvas coordinates, for the tests.
  const regionOut = new Uint8Array(buf.width * buf.height);
  const mossOut = new Uint8Array(buf.width * buf.height);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      regionOut[y * buf.width + x] = region[(y - y0) * bw + (x - x0)];
      mossOut[y * buf.width + x] = mossMask[(y - y0) * bw + (x - x0)];
    }
  return { dome, layout, region: regionOut, moss: mossOut };
}
