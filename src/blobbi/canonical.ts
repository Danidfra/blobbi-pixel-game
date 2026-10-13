/**
 * THE CANONICAL PIXEL BLOBBI: the kit's own V3 drawing, rasterized with
 * pixel-art rules (`svg-raster.ts`). There is no second morphology: the
 * silhouette, face, limbs, traits, patterns, expressions and the walk cycle
 * are the kit's, drawn by `renderBlobbiSvg` with a baked motion phase, and
 * only the pixels are this lab's.
 *
 * A pose from `sprite.ts` (view, facing, breath, lid, expression, walk,
 * gaze) is mapped onto the kit's `BlobbiState`, so every animation frame
 * is a frame the canonical renderer itself would draw.
 */
import { DOCUMENT_TRANSFORM, buildBlobbiGeometry, canonicalGenome, deriveMorphology, derivePalette, generateGenome, renderBlobbiSvg, type BlobbiGenome, type BlobbiState } from '@blobbi-kit/renderer/procedural';
import type { Sprite } from '../core/pixel';
import { hex, shift, type Color } from '../core/color';
import { rasterizeSvg } from './svg-raster';
import type { BlobbiPose } from './pose';

/** The canonical adult stands this many viewBox units tall (ground line to crown apex, tuft and antennae excluded). */
export const CANONICAL_STANDING_HEIGHT = (() => {
  const geo = buildBlobbiGeometry(deriveMorphology(canonicalGenome(), 'adult'), { view: 'front' });
  return (geo.ground.y - geo.body.top) * DOCUMENT_TRANSFORM.scale;
})();

/** How tall the canonical baby stands against its adult self (the kit's baby plan, measured on the canonical genome). */
export const BABY_HEIGHT_RATIO = (() => {
  const g = canonicalGenome();
  const adult = buildBlobbiGeometry(deriveMorphology(g, 'adult'), { view: 'front' });
  const baby = buildBlobbiGeometry(deriveMorphology(g, 'baby'), { view: 'front', stage: 'baby' });
  return (baby.ground.y - baby.body.top) / (adult.ground.y - adult.body.top);
})();

export const VIEWBOX_W = 211.66666;
export const VIEWBOX_H = 238.125;

/** Walking phases per cycle and idle phases per breath: the animation's frame budget. */
export const WALK_FRAMES = 6;
export const IDLE_FRAMES = 4;

export interface CanonicalOptions {
  /** Paint a one-pixel outline outside the silhouette (default true). */
  outline?: boolean;
  /** Gradient bands (default 4). */
  bands?: number;
  /** Extra `data-part` prefixes to leave out (the equipment layer finds a hand by drawing the sprite without its arm). */
  skipParts?: readonly string[];
  /**
   * Whole-pixel rig motion (see `RasterOptions.snapRig`). Default: on for walking poses. The kit's walk moves the
   * body by fractions of a pixel at gameplay sizes (a 0.95° sway is 0.2 px at the crown of a 12 px Blobbi); drawn
   * as is, that only flips eyes and outline pixels independently from frame to frame and the Blobbi shakes. Off
   * reproduces the raw raster (for comparison).
   */
  snapRig?: boolean;
  /**
   * M11D.1: the life stage to draw (default the adult). A baby is the kit's own baby of the same genome: its droplet
   * body, simple eyes, budding traits, no arms or feet, and the hop gait; drawn at the same pixels per kit unit as
   * its adult self, so it stands about two thirds as tall (`BABY_HEIGHT_RATIO`).
   */
  stage?: BlobbiStage;
}

/** The life stages the pixel game draws. Eggs are not drawn (an egg cannot walk; see BABY-BLOBBI.md). */
export type BlobbiStage = 'adult' | 'baby';

/** Map a lab pose onto the kit's state. */
export function stateForPose(pose: BlobbiPose, stage: BlobbiStage = 'adult'): Partial<BlobbiState> {
  const state: Partial<BlobbiState> = {
    stage,
    view: pose.view,
    direction: pose.facing < 0 ? 'left' : 'right',
    // Gaze is NOT handed to the kit: moved by sub-pixel amounts and snapped per eye, the irises drift apart
    // (one eye steps a pixel, the other does not: cross-eyed). The kit draws the resting gaze; the raster shifts
    // both irises by the same whole pixels (`gazeShiftFor`).
    gaze: { x: 0, y: 0 },
    expression: pose.expression === 'neutral' ? {} : { [pose.expression]: 1 },
  };
  if (pose.lid === 2) state.sleeping = true;
  else if (pose.lid === 1) state.face = { eyes: 'half' };
  if (pose.walk >= 0) {
    state.motion = 'walking';
    state.phase = pose.walk / WALK_FRAMES;
  } else if (pose.breath > 0) {
    state.motion = 'idle';
    // Breath is stated as a phase of the kit's idle cycle: 0 rest, 1 is a full inhale (phase 0.5).
    state.phase = (0.5 * pose.breath) / 1;
  } else state.motion = 'still';
  return state;
}

export interface CanonicalResult extends Sprite {
  /** The SVG the sprite was made from (for the comparison lab). */
  svg: string;
}

/** The whole-pixel iris shift for a gaze at a size: one pixel sideways from 16 px, one pixel down/up from 24 px, two from 40 px. */
export function gazeShiftFor(pose: BlobbiPose, size: number): { dx: number; dy: number } {
  const step = size >= 40 ? 2 : 1;
  return { dx: pose.gazeX * step, dy: size >= 24 ? pose.gazeY * step : 0 };
}

/** Build the canonical pixel Blobbi of a genome, `size` pixels tall (standing height). */
/** A baby is never drawn shorter than this many pixels (its face needs them); above it, the kit's own proportion. */
export const BABY_MIN_HEIGHT = 10;

/** The standing height in pixels of a baby whose adult self stands `size` pixels tall. */
export function babyHeightFor(size: number): number {
  return Math.max(BABY_MIN_HEIGHT, Math.round(size * BABY_HEIGHT_RATIO));
}

/**
 * THE BABY HOP, in whole pixels, for a walk frame. The kit's hop gait lifts the body by 9.6 kit units on four of
 * its six walk frames and lands (squashed) on the other two (`procedural/motion.ts`): under one pixel at play sizes,
 * so drawn as is the baby would glide. The pixel baby keeps the kit's rhythm and makes the lift readable: about a
 * twelfth of its height, at least one pixel.
 */
export function babyHopFor(walk: number, babyHeight: number): number {
  if (walk < 0 || walk % 3 === 0) return 0;
  return Math.max(1, Math.round(babyHeight / 12));
}

export function buildCanonicalSprite(genome: BlobbiGenome, pose: BlobbiPose, size: number, options: CanonicalOptions = {}): CanonicalResult {
  const baby = options.stage === 'baby';
  // A baby is drawn at its adult self's pixels per kit unit (so it is the kit's own two thirds), up to the floor.
  const scale = baby ? babyHeightFor(size) / BABY_HEIGHT_RATIO / CANONICAL_STANDING_HEIGHT : size / CANONICAL_STANDING_HEIGHT;
  const margin = 2;
  const width = Math.ceil(VIEWBOX_W * scale) + margin * 2;
  const height = Math.ceil(VIEWBOX_H * scale) + margin * 2;
  const stage = options.stage ?? 'adult';
  const state = stateForPose(pose, stage);
  const svg = renderBlobbiSvg(genome, state, { idPrefix: 'p' });
  const palette = derivePalette(genome.colors);
  const outline: Color | null = options.outline === false ? null : shift(hex(palette.bodyDark), -0.16, 1.05, 6);
  const buffer = rasterizeSvg(svg, {
    scale,
    offsetX: margin,
    offsetY: margin,
    width,
    height,
    bands: options.bands ?? 4,
    outline,
    skipParts: ['body-shadow', 'left-foot-shadow', 'right-foot-shadow', 'near-foot-shadow', 'far-foot-shadow', 'ground-shadow', ...(options.skipParts ?? [])],
    // The kit paints markings at half opacity over a gradient; at pixel scale that contrast is lost, so markings
    // are given a floor. The colour and the shape are still the kit's.
    minOpacity: { pattern: 0.8, 'special-mark': 1, freckle: 1 },
    // The kit's freckles are three dots under each eye, under a fifth of a pixel each until 48 px: each trio is read
    // as one freckle mark when its dots cannot be drawn one by one.
    clusters: ['freckles'],
    // A baby's cheeks reach past its narrow body: kept to the body, so no nub reads as an arm (svg-raster).
    insideBody: stage === 'baby' ? ['left-cheek', 'right-cheek', 'cheek'] : undefined,
    gazeShift: gazeShiftFor(pose, size),
    snapRig: options.snapRig ?? pose.walk >= 0,
  });
  // The ground point of this very drawing, so the sprite stands where the kit says it stands.
  const geo = buildBlobbiGeometry(deriveMorphology(genome, stage), state);
  const gx = geo.ground.x * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.tx;
  const gy = geo.ground.y * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.ty;
  const anchorX = Math.round(gx * scale + margin);
  // A hopping baby is drawn higher above the same ground point (the world's shadow stays on the ground).
  const anchorY = Math.round(gy * scale + margin) + (baby ? babyHopFor(pose.walk, babyHeightFor(size)) : 0);
  const halfW = ((geo.body.right - geo.body.left) * DOCUMENT_TRANSFORM.scale * scale) / 2;
  return { buffer, anchorX, anchorY, footRx: Math.max(2, Math.round(halfW * 0.7)), footRy: 2, svg };
}

/** Convenience: from a seed. */
export function canonicalSprite(seed: string, pose: BlobbiPose, size: number, options?: CanonicalOptions): CanonicalResult {
  return buildCanonicalSprite(generateGenome(seed), pose, size, options);
}
