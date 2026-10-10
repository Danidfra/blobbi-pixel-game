/**
 * THE 32 PX SCALE LAB. An isolated comparison of ways to turn the kit's canonical Blobbi into 32 px pixel art,
 * scored against the kit's own anti-aliased render. Nothing in gameplay imports this module: it exists to
 * decide, with numbers and pictures, whether a different rasterization would be more faithful at 32 px
 * before anything in the game changes.
 *
 * Every strategy returns a sprite on the SAME canvas as the gameplay sprite at that size (same width, height,
 * margin and ground anchor), so pixels can be compared one to one.
 */
import { derivePalette, renderBlobbiSvg, type BlobbiGenome } from '@blobbi-kit/renderer/procedural';
import { alpha, hex, shift, type Color } from '../core/color';
import { Mask, PixelBuffer } from '../core/pixel';
import { buildCanonicalSprite, CANONICAL_STANDING_HEIGHT, gazeShiftFor, stateForPose, VIEWBOX_H, VIEWBOX_W } from './canonical';
import { rasterizeSvg } from './svg-raster';
import type { BlobbiPose } from './pose';

export type ScaleStrategy = 'direct' | 'bands6' | 'no-outline' | 'supersample' | 'nearest16x2';

export const SCALE_STRATEGIES: readonly { id: ScaleStrategy; label: string; note: string }[] = [
  { id: 'direct', label: 'GAME', note: 'the gameplay sprite: rasterized at the target size, 4 gradient bands, feature-aware face, outline' },
  { id: 'bands6', label: 'BANDS 6', note: 'the same raster with 6 gradient bands instead of 4' },
  { id: 'no-outline', label: 'NO LINE', note: 'the gameplay raster without the outside outline' },
  { id: 'supersample', label: 'SUPER 2X', note: 'rasterized at twice the size with the feature-aware face, reduced by the most frequent colour per 2x2 block, then outlined' },
  { id: 'nearest16x2', label: '16PX X2', note: 'the 16 px gameplay sprite scaled 2x nearest-neighbour (what a 16 px Blobbi at zoom 2 shows)' },
];

const SKIP = ['body-shadow', 'left-foot-shadow', 'right-foot-shadow', 'near-foot-shadow', 'far-foot-shadow', 'ground-shadow'];
const MIN_OPACITY = { pattern: 0.8, 'special-mark': 1, freckle: 1 };

export interface LabSprite {
  buffer: PixelBuffer;
  anchorX: number;
  anchorY: number;
}

/** The canvas the gameplay sprite uses at `size` (so references and strategies line up). */
export function canvasFor(size: number): { scale: number; margin: number; width: number; height: number } {
  const scale = size / CANONICAL_STANDING_HEIGHT;
  const margin = 2;
  return { scale, margin, width: Math.ceil(VIEWBOX_W * scale) + margin * 2, height: Math.ceil(VIEWBOX_H * scale) + margin * 2 };
}

/** Reduce a buffer 2x: a block is opaque when at least two of its four pixels are, coloured by its most frequent opaque colour (ties: the darkest). */
export function downsampleMode2x(src: PixelBuffer, width: number, height: number): PixelBuffer {
  const out = new PixelBuffer(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const counts = new Map<Color, number>();
      let opaque = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const c = src.get(x * 2 + dx, y * 2 + dy);
          if (!alpha(c)) continue;
          opaque++;
          counts.set(c, (counts.get(c) ?? 0) + 1);
        }
      if (opaque < 2) continue;
      let best: Color = 0;
      let bestN = -1;
      for (const [c, n] of counts) {
        const lum = (c & 0xff) + ((c >>> 8) & 0xff) + ((c >>> 16) & 0xff);
        const bestLum = (best & 0xff) + ((best >>> 8) & 0xff) + ((best >>> 16) & 0xff);
        if (n > bestN || (n === bestN && lum < bestLum)) {
          best = c;
          bestN = n;
        }
      }
      out.set(x, y, best);
    }
  return out;
}

/** A one-pixel outline outside the silhouette (as the rasterizer paints it). */
export function outlineOutside(buf: PixelBuffer, colour: Color): void {
  const mask = buf.opaqueMask();
  const grown: Mask = mask.dilate();
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (grown.get(x, y) && !mask.get(x, y)) buf.set(x, y, colour);
}

const outlineColour = (genome: BlobbiGenome): Color => shift(hex(derivePalette(genome.colors).bodyDark), -0.16, 1.05, 6);

/** One strategy's sprite at `size`, on the gameplay canvas. */
export function labSprite(strategy: ScaleStrategy, genome: BlobbiGenome, pose: BlobbiPose, size: number): LabSprite {
  const direct = buildCanonicalSprite(genome, pose, size);
  if (strategy === 'direct') return direct;
  if (strategy === 'bands6') return buildCanonicalSprite(genome, pose, size, { bands: 6 });
  if (strategy === 'no-outline') return buildCanonicalSprite(genome, pose, size, { outline: false });
  if (strategy === 'nearest16x2') {
    const half = buildCanonicalSprite(genome, pose, Math.round(size / 2));
    const big = half.buffer.scaled(2);
    const buf = new PixelBuffer(direct.buffer.width, direct.buffer.height);
    buf.blit(big, direct.anchorX - half.anchorX * 2, direct.anchorY - half.anchorY * 2);
    return { buffer: buf, anchorX: direct.anchorX, anchorY: direct.anchorY };
  }
  // Supersample: the same drawing at twice the scale onto a canvas exactly twice the size, then reduced.
  const c = canvasFor(size);
  const svg = renderBlobbiSvg(genome, stateForPose(pose), { idPrefix: 's' });
  const big = rasterizeSvg(svg, {
    scale: c.scale * 2,
    offsetX: c.margin * 2,
    offsetY: c.margin * 2,
    width: c.width * 2,
    height: c.height * 2,
    bands: 4,
    outline: null,
    skipParts: SKIP,
    minOpacity: MIN_OPACITY,
    gazeShift: gazeShiftFor(pose, size * 2),
  });
  const buf = downsampleMode2x(big, c.width, c.height);
  outlineOutside(buf, outlineColour(genome));
  return { buffer: buf, anchorX: direct.anchorX, anchorY: direct.anchorY };
}

export interface FidelityScore {
  /** Silhouette agreement: intersection over union of the reference's solid pixels (alpha ≥ 50%) and the sprite's. */
  silhouetteIoU: number;
  /** Mean RGB distance (0-441) where both are solid. */
  colourError: number;
  /** Agreement of the dark "ink" (eyes, mouth, brows) inside the reference's silhouette: IoU of pixels darker than the threshold. */
  inkIoU: number;
  /** Distinct colours in the sprite. */
  colours: number;
}

const lum = (c: Color) => 0.299 * (c & 0xff) + 0.587 * ((c >>> 8) & 0xff) + 0.114 * ((c >>> 16) & 0xff);

/** Score a sprite against an anti-aliased reference on the same canvas. The outline ring counts against a sprite (the reference has none), which the report states. */
export function scoreAgainst(reference: PixelBuffer, sprite: PixelBuffer, inkThreshold = 70): FidelityScore {
  let inter = 0;
  let union = 0;
  let err = 0;
  let both = 0;
  let inkInter = 0;
  let inkUnion = 0;
  const colours = new Set<Color>();
  for (let i = 0; i < reference.data.length; i++) {
    const r = reference.data[i];
    const s = sprite.data[i] ?? 0;
    const rs = alpha(r) >= 128;
    const ss = alpha(s) > 0;
    if (ss) colours.add(s);
    if (rs || ss) union++;
    if (rs && ss) {
      inter++;
      both++;
      err += Math.hypot((r & 0xff) - (s & 0xff), ((r >>> 8) & 0xff) - ((s >>> 8) & 0xff), ((r >>> 16) & 0xff) - ((s >>> 16) & 0xff));
    }
    // Ink is compared inside the reference's silhouette only (eroded by a pixel), where the face is: the
    // sprite's outline ring would otherwise dominate.
    const w = reference.width;
    const x = i % w;
    const interior = rs && [i - 1, i + 1, i - w, i + w].every((j) => x > 0 && x < w - 1 && j >= 0 && j < reference.data.length && alpha(reference.data[j]) >= 128);
    if (interior) {
      const ri = lum(r) < inkThreshold;
      const si = ss && lum(s) < inkThreshold;
      if (ri || si) inkUnion++;
      if (ri && si) inkInter++;
    }
  }
  return { silhouetteIoU: union ? inter / union : 1, colourError: both ? err / both : 0, inkIoU: inkUnion ? inkInter / inkUnion : 1, colours: colours.size };
}
