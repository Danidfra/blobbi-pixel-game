/**
 * PIXEL BLOBBI IDENTITY: what the pixel renderer needs to know about one
 * individual, read from the kit's V3 genome. The kit is the single source of
 * identity (seed → genes, trait kinds, colours), so the same seed is the same
 * Blobbi whether the kit draws it as SVG or this lab draws it in pixels.
 * Nothing of the kit's geometry is copied; only its genes are read.
 */
import { generateGenome, type BlobbiGenome } from '@blobbi-kit/renderer/procedural';
import { hex, type Color } from '../core/color';
import { ramp, type Ramp } from '../core/palette';
import { clamp } from '../core/math';
import type { BlobbiStage } from './canonical';

export type AntennaCount = 0 | 1 | 2;
export type HornKind = 'none' | 'forehead' | 'top' | 'side';
export type EarKind = 'none' | 'round' | 'pointed';
export type TailKind = 'none' | 'nub' | 'curl' | 'leaf';
export type PatternKind = 'solid' | 'spotted' | 'striped' | 'gradient';
export type MarkKind = 'none' | 'star' | 'heart' | 'sparkle' | 'moon';

export interface PixelBlobbiIdentity {
  seed: string;
  /** M11D.1: the life stage drawn (the same genome is a baby or an adult; identity never changes with it). */
  stage: BlobbiStage;
  /** The kit's genome, the source of everything below and of the canonical drawing. */
  genome: BlobbiGenome;
  /** Body ramp derived from the base colour; markings, eye and accent as single colours. */
  body: Ramp;
  secondary: Color;
  eye: Color;
  accent: Color;
  cheek: Color;
  horn: Ramp;
  /** Continuous genes in [-1, 1], 0 is the canonical Blobbi. */
  genes: {
    bodyWidth: number;
    bodyHeight: number;
    topWidth: number;
    roundness: number;
    eyeSize: number;
    eyeSpacing: number;
    eyeHeight: number;
    mouthWidth: number;
    mouthCurve: number;
    cheekSize: number;
    footSize: number;
    footSpacing: number;
    armSize: number;
    tuftSize: number;
    tuftTilt: number;
  };
  antenna: { count: AntennaCount; side: -1 | 1; length: number; tilt: number; curvature: number; position: number };
  horns: { kind: HornKind; length: number; position: number };
  ears: { kind: EarKind; size: number };
  tail: { kind: TailKind; size: number };
  pattern: { kind: PatternKind; stripes: number; spots: number; gradientStrength: number };
  mark: { kind: MarkKind; side: -1 | 1 };
  belly: boolean;
  freckles: boolean;
}

const g = (v: number | undefined) => clamp(Number.isFinite(v as number) ? (v as number) : 0, -1, 1);

/** A cheek pink that reads on any body: warmer and lighter than the body, never the same hue. */
function cheekFor(bodyMid: Color): Color {
  const pink = hex('#ff7ab7');
  // Mix lightly toward the body so pale bodies keep a soft cheek and dark bodies a visible one.
  return mixColor(pink, bodyMid, 0.2);
}

function mixColor(a: Color, b: Color, t: number): Color {
  const r = Math.round((a & 0xff) * (1 - t) + (b & 0xff) * t);
  const gg = Math.round(((a >>> 8) & 0xff) * (1 - t) + ((b >>> 8) & 0xff) * t);
  const bb = Math.round(((a >>> 16) & 0xff) * (1 - t) + ((b >>> 16) & 0xff) * t);
  return ((0xff << 24) | (bb << 16) | (gg << 8) | r) >>> 0;
}

export function identityFromGenome(genome: BlobbiGenome, stage: BlobbiStage = 'adult'): PixelBlobbiIdentity {
  const base = genome.colors.base ?? '#8749ef';
  const secondary = genome.colors.secondary ?? '#481696';
  const eye = genome.colors.eye ?? '#201538';
  const accent = genome.colors.accent;
  const body = ramp(hex(base), { step: 0.085, hueShift: 7 });
  const m = genome.morphology;
  const t = genome.traits;
  return {
    seed: genome.seed,
    stage,
    genome,
    body,
    secondary: hex(secondary),
    eye: hex(eye),
    accent: accent ? hex(accent) : body.highlight,
    cheek: cheekFor(body.mid),
    horn: ramp(hex('#f2d9a6'), { step: 0.08, hueShift: 6 }),
    genes: {
      bodyWidth: g(m.bodyWidth),
      bodyHeight: g(m.bodyHeight),
      topWidth: g(m.topWidth),
      roundness: g(m.roundness),
      eyeSize: g(m.eyeSize),
      eyeSpacing: g(m.eyeSpacing),
      eyeHeight: g(m.eyeHeight),
      mouthWidth: g(m.mouthWidth),
      mouthCurve: g(m.mouthCurve),
      cheekSize: g(m.cheekSize),
      footSize: g(m.footSize),
      footSpacing: g(m.footSpacing),
      armSize: g(m.armSize),
      tuftSize: g(m.tuftSize),
      tuftTilt: g(m.tuftTilt),
    },
    antenna: { count: t.antenna.count, side: t.antenna.side, length: g(t.antenna.length), tilt: g(t.antenna.tilt), curvature: g(t.antenna.curvature), position: g(t.antenna.position) },
    horns: { kind: t.horns.kind, length: g(t.horns.length), position: g(t.horns.position) },
    ears: { kind: t.ears.kind, size: g(t.ears.size) },
    tail: { kind: t.tail.kind, size: g(t.tail.size) },
    pattern: { kind: t.pattern.kind, stripes: t.pattern.stripes.count, spots: t.pattern.spots.count, gradientStrength: g(t.pattern.gradient.strength) },
    mark: { kind: t.mark.kind, side: t.mark.side },
    belly: t.belly.enabled,
    freckles: t.freckles.enabled,
  };
}

/** The identity of a seed: the kit's genome, read into pixel terms. */
export function blobbiIdentity(seed: string): PixelBlobbiIdentity {
  return identityFromGenome(generateGenome(seed));
}

/** M11D.1: the identity of a seed drawn at a life stage (the same genes; only the drawing's stage differs). */
export function stagedIdentity(seed: string, stage: BlobbiStage): PixelBlobbiIdentity {
  return identityFromGenome(generateGenome(seed), stage);
}
