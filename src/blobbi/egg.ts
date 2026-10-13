/**
 * M11D.3, THE PIXEL EGG: the kit's own V3 egg of a genome (`renderBlobbiSvg(genome, { stage: 'egg', eggCrack })`,
 * drawn from the genome's egg genes: shell shape, lean, spots, accent spot, highlight, patch, the shell colours),
 * rasterized with the same pixel rules as the Baby and the Adult. Nothing is invented: no face, no limbs, the kit's
 * shell, spots and cracks. Two presentation touches, both pixel-only:
 *
 *   - ROCKING: the egg never turns left or right; it rocks on its base. The drawing is rotated about its ground point
 *     before rasterizing (whole-degree angles, cached), so every rocking frame is a crisp native raster, never a
 *     resampled image.
 *   - THE BABY'S GLOW IN THE CRACKS: on the heavier cracks, a pixel of the Baby's own body colour shows just inside
 *     each crack line (the kit's cracks are a dark line only), as if the colour inside were showing through.
 *
 * The egg is drawn at its adult self's pixels per kit unit (the kit's proportions: about 0.56 of the adult's height),
 * never shorter than `EGG_MIN_HEIGHT`. Deterministic: the same genome, crack, angle and size give the same pixels.
 *
 * Canonical lifecycle: this is a DRAWING. Drawing an egg, rocking it or hatching it in a cinematic never states,
 * changes or publishes a Blobbi's canonical stage.
 */
import { DOCUMENT_TRANSFORM, derivePalette, renderBlobbiSvg, type BlobbiGenome } from '@blobbi-kit/renderer/procedural';
import type { Sprite } from '../core/pixel';
import { hex, mix, shift, type Color } from '../core/color';
import { rasterizeSvg } from './svg-raster';
import { CANONICAL_STANDING_HEIGHT, VIEWBOX_H, VIEWBOX_W } from './canonical';

/** The kit's crack levels, in order. */
export const EGG_CRACK_LEVELS = ['none', 'light', 'medium', 'heavy'] as const;
export type EggCrackLevel = (typeof EGG_CRACK_LEVELS)[number];

/** The kit egg's ground line and crown (document units, measured on the kit's shell path). */
const EGG_GROUND = 801;
const EGG_TOP = 433.5;
const EGG_CX = 408.657;
/** The egg's height against its adult self's standing height. */
export const EGG_HEIGHT_RATIO = ((EGG_GROUND - EGG_TOP) * DOCUMENT_TRANSFORM.scale) / CANONICAL_STANDING_HEIGHT;
export const EGG_MIN_HEIGHT = 9;

export function eggHeightFor(size: number): number {
  return Math.max(EGG_MIN_HEIGHT, Math.round(size * EGG_HEIGHT_RATIO));
}

export interface EggPose {
  crack: EggCrackLevel;
  /** Rocking angle in whole degrees (positive leans right); clamped to ±12. */
  angle: number;
}

export const EGG_REST: EggPose = { crack: 'none', angle: 0 };

/** The kit's egg SVG for a genome and crack, rewritten into the rasterizer's dialect and rotated by `angle`. */
export function eggSvg(genome: BlobbiGenome, pose: EggPose): string {
  let svg = renderBlobbiSvg(genome, { stage: 'egg', eggCrack: pose.crack }, { idPrefix: 'egg' });
  // The crack group's stroke opacity is the group's opacity (it holds strokes only); caps and joins are not drawn.
  svg = svg.replace(/(<g data-part="egg-cracks"[^>]*?) stroke-opacity="([\d.]+)"/, '$1 opacity="$2"').replace(/(<g data-part="egg-cracks"[^>]*?) stroke-linecap="[^"]*"/, '$1').replace(/(<g data-part="egg-cracks"[^>]*?) stroke-linejoin="[^"]*"/, '$1');
  const angle = Math.max(-12, Math.min(12, Math.round(pose.angle)));
  if (angle !== 0) svg = svg.replace(/<g data-part="character"/, `<g transform="rotate(${angle} ${EGG_CX} ${EGG_GROUND})"><g data-part="character"`).replace(/<\/svg>\s*$/, '</g></svg>');
  return svg;
}

/** Build the pixel egg of a genome: `size` is its ADULT self's standing height in pixels. */
export function buildEggSprite(genome: BlobbiGenome, pose: EggPose, size: number): Sprite & { svg: string } {
  const height = eggHeightFor(size);
  const scale = height / ((EGG_GROUND - EGG_TOP) * DOCUMENT_TRANSFORM.scale);
  const margin = 2;
  const width = Math.ceil(VIEWBOX_W * scale) + margin * 2;
  const h = Math.ceil(VIEWBOX_H * scale) + margin * 2;
  const svg = eggSvg(genome, pose);
  const palette = derivePalette(genome.colors);
  // The outline: a darker step of the shell's own colour (as the Blobbi's outline is of its body).
  const shellBase = (svg.match(/id="egg-shell"[\s\S]*?stop-color="(#[0-9a-fA-F]{6})"/)?.[1] ?? palette.bodyDark) as string;
  const outline: Color = shift(hex(shellBase), -0.3, 1.05, 6);
  const buffer = rasterizeSvg(svg, { scale, offsetX: margin, offsetY: margin, width, height: h, bands: 4, outline, skipParts: ['ground-shadow', 'egg-shadow'], snapRig: false });
  // The Baby's colour showing in the heavier cracks: a light pixel of the body colour beside each crack pixel.
  if (pose.crack === 'medium' || pose.crack === 'heavy') {
    const glow = mix(hex(palette.bodyMid), hex('#ffffff'), 0.35);
    const ink = hex('#1f2937');
    const near = (c: number) => {
      const r = c & 0xff;
      const g = (c >>> 8) & 0xff;
      const b = (c >>> 16) & 0xff;
      return c >>> 24 && Math.abs(r - (ink & 0xff)) + Math.abs(g - ((ink >>> 8) & 0xff)) + Math.abs(b - ((ink >>> 16) & 0xff)) < 160;
    };
    const cracks: [number, number][] = [];
    for (let y = 1; y < buffer.height - 1; y++)
      for (let x = 1; x < buffer.width - 1; x++) if (near(buffer.get(x, y)) && buffer.get(x, y - 1) >>> 24 && buffer.get(x, y + 1) >>> 24 && buffer.get(x - 1, y) >>> 24 && buffer.get(x + 1, y) >>> 24) cracks.push([x, y]);
    for (const [x, y] of cracks) {
      const below = buffer.get(x, y + 1);
      if (below >>> 24 && !near(below)) buffer.set(x, y + 1, glow);
    }
  }
  const gx = EGG_CX * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.tx;
  const gy = EGG_GROUND * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.ty;
  // A rocking egg rolls a little on its round base (whole pixels): the lean reads as a rock, not a tilt in place.
  const roll = Math.round((Math.max(-12, Math.min(12, Math.round(pose.angle))) * height) / 220);
  const anchorX = Math.round(gx * scale + margin) - roll;
  const anchorY = Math.round(gy * scale + margin);
  return { buffer, anchorX, anchorY, footRx: Math.max(2, Math.round(height * 0.32)), footRy: 2, svg };
}

/**
 * THE EGG'S MOTION in a birth (pure function of time since it appeared, seconds): still, gentle rocking, stronger
 * rocking with pauses, the cracks one by one, then the hatch. `phases` are the cue times (from the cinematic script).
 */
export interface EggPhases {
  /** Gentle rocking from here. */
  rock: number;
  /** Stronger rocking from here (with the first crack). */
  strong: number;
  /** Crack levels light, medium, heavy appear at these times. */
  cracks: readonly [number, number, number];
  /** The shell opens: the egg is gone, the Baby is out. */
  hatch: number;
}

export function eggPoseAt(t: number, p: EggPhases, reduced = false): EggPose | null {
  if (t >= p.hatch) return null;
  const crack: EggCrackLevel = t >= p.cracks[2] ? 'heavy' : t >= p.cracks[1] ? 'medium' : t >= p.cracks[0] ? 'light' : 'none';
  if (reduced || t < p.rock) return { crack, angle: 0 };
  if (t < p.strong) return { crack, angle: Math.round(4 * Math.sin((t - p.rock) * Math.PI * 2 * 0.9)) };
  // Stronger: wobbles in bursts (a little pause between them), growing toward the hatch.
  const u = t - p.strong;
  const burst = Math.sin(u * Math.PI * 2 * 1.6);
  const envelope = 0.55 + 0.45 * Math.min(1, u / Math.max(0.1, p.hatch - p.strong));
  const pause = Math.sin(u * Math.PI * 0.9) > -0.2 ? 1 : 0.2;
  return { crack, angle: Math.round(11 * burst * envelope * pause) };
}
