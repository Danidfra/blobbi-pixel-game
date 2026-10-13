/**
 * THE SCRIPT of the intro cinematic: one framework, three species. This file holds everything that differs by
 * species (and by reduced motion) as data and pure functions, so the cinematic itself (`intro.ts`) is one timeline:
 *
 *   - the TIMING of the five scenes (ocean, carrier, island, Blobbi, beginning);
 *   - which way the Carrier travels (the ocean scene pans against it, so the shape glides into view head first);
 *   - the ORDER in which its pixels break the surface (a turtle's dome first, then the rim, head and flippers; a
 *     manta's disc, then out along the wings; a whale's snout, then back along the spine to the flukes);
 *   - the Carrier's own moment after surfacing (a turtle's blink and glance; the manta's wing beat and the whale's
 *     spout and blink come from their existing animations);
 *   - the Blobbi's performance, as cues on the existing animator (occupied, notices, looks at you, happy);
 *   - the sound cues, by name, from the existing effects.
 *
 * Nothing here draws or mutates anything.
 */
import type { EggPhases } from '../blobbi/egg';
import type { CarrierSpecies } from '../game/archipelago';
import type { WorldBounds } from '../render/view-camera';
import type { WorldDescription } from '../world/types';
import { CARRIER_VOICES } from '../audio/director';

export type IntroSceneId = 'ocean' | 'carrier' | 'island' | 'blobbi' | 'beginning';

/** The scene boundaries (seconds from the start) and the moments inside them. */
export interface IntroTiming {
  /** Scene starts, in order; `end` is the handoff. */
  ocean: number;
  carrier: number;
  island: number;
  blobbi: number;
  beginning: number;
  end: number;
  /** The shape under the water fades in between these two moments. */
  shadowIn: [number, number];
  /** The surfacing front runs from 0 to `FULLY_SURFACED` between these two moments: the bare animal comes up. */
  surfacing: [number, number];
  /** The Carrier's own moment after surfacing (a turtle's blink and glance). */
  carrierBeat: number;
  /** The island forms on its back between these two moments (the land, then its soil greens). */
  landForming: [number, number];
  /** Life (plants, rocks, houses) appears between these two moments. */
  lifeForming: [number, number];
  /** The camera leaves the whole-Carrier framing for the island (a zoom; a cut with reduced motion). */
  islandZoom: [number, number];
  /** The Blobbi's teleport arrival begins (its own length: 3.6 s, 2.16 s with reduced motion). */
  arrival: number;
  /** The close-up zoom on the Blobbi (none with reduced motion). */
  closeUp: [number, number];
  /** The performance: looks one way, the other way, notices you, says hello. */
  looks: [number, number];
  notices: number;
  happy: number;
  /** The last zoom back to the gameplay framing. */
  settle: [number, number];
  /** The two lines of the message start typing at these moments. */
  line1: number;
  line2: number;
  /** M11D.3, a first birth: the egg's phases (it arrives at `arrival`, rocks, cracks and hatches), else absent. */
  egg?: EggPhases;
}

/**
 * M11D.3, THE FIRST BIRTH: the same presentation, with an egg in the Blobbi's place. It materialises by the arrival's
 * own particles at `arrival`, rocks gently, then harder with its first crack, cracks twice more and hatches; the Baby
 * is out, and the performance (a look one way, the other, you, hello) follows, later by the birth's length.
 * Reduced motion: no rocking (the cracks and the hatch only), a shorter wait.
 */
export function birthTiming(base: IntroTiming, reduced: boolean): IntroTiming {
  const A = base.arrival;
  const egg: EggPhases = reduced ? { rock: A + 2.2, strong: A + 2.4, cracks: [A + 2.4, A + 2.9, A + 3.4], hatch: A + 3.9 } : { rock: A + 3.4, strong: A + 5.4, cracks: [A + 5.4, A + 6.4, A + 7.2], hatch: A + 8.0 };
  // The performance starts after the hatch as it started after the arrival: everything from the first look shifts.
  const shift = egg.hatch + (reduced ? 0.5 : 1.2) - base.looks[0];
  const sh = (v: number) => v + shift;
  return {
    ...base,
    looks: [sh(base.looks[0]), sh(base.looks[1])],
    notices: sh(base.notices),
    happy: sh(base.happy),
    beginning: sh(base.beginning),
    end: sh(base.end),
    settle: [sh(base.settle[0]), sh(base.settle[1])],
    line1: sh(base.line1),
    line2: sh(base.line2),
    // The full close-up comes in on the egg (unchanged); the reduced cut to the gameplay framing moves with the rest.
    closeUp: reduced ? [sh(base.closeUp[0]), sh(base.closeUp[1])] : base.closeUp,
    egg,
  };
}

/** The full presentation, about 32 s. The ocean scene is a little longer for the whale: it is long. */
export function fullTiming(species: CarrierSpecies): IntroTiming {
  const ocean = species === 'whale' ? 6 : 5;
  const carrier = ocean;
  const island = carrier + 6;
  const blobbi = island + 7.8;
  const beginning = blobbi + 8.2;
  return {
    ocean: 0,
    carrier,
    island,
    blobbi,
    beginning,
    end: beginning + 5,
    shadowIn: [0.8, 3.2],
    surfacing: [carrier + 0.6, carrier + 4.6],
    carrierBeat: carrier + 4.9,
    landForming: [island + 0.3, island + 4.3],
    lifeForming: [island + 3.8, island + 7.4],
    islandZoom: [island + 4.0, island + 5.2],
    arrival: blobbi,
    closeUp: [blobbi + 3.8, blobbi + 4.8],
    looks: [blobbi + 4.0, blobbi + 5.0],
    notices: blobbi + 6.0,
    happy: blobbi + 7.0,
    settle: [beginning, beginning + 1.2],
    line1: beginning + 0.6,
    line2: beginning + 2.3,
  };
}

/** Reduced motion: shorter, cuts instead of pans and zooms, no hops, the teleport's own short form; about 19.5 s. */
export function reducedTiming(): IntroTiming {
  return {
    ocean: 0,
    carrier: 2,
    island: 4.5,
    blobbi: 9.6,
    beginning: 15,
    end: 19.5,
    shadowIn: [0, 0.01],
    surfacing: [2.2, 3.2],
    carrierBeat: 3.6,
    landForming: [4.6, 7.0],
    lifeForming: [7.0, 9.2],
    islandZoom: [7.0, 7.0],
    arrival: 9.6,
    closeUp: [15, 15],
    looks: [12.0, 12.7],
    notices: 13.4,
    happy: 14.2,
    settle: [15, 15],
    line1: 15.2,
    line2: 16.8,
  };
}

/** The scene a moment belongs to. */
export function sceneAt(t: number, timing: IntroTiming): IntroSceneId {
  if (t < timing.carrier) return 'ocean';
  if (t < timing.island) return 'carrier';
  if (t < timing.blobbi) return 'island';
  if (t < timing.beginning) return 'blobbi';
  return 'beginning';
}

/** The direction the Carrier travels (unit vector, world axes): the turtle and the manta swim south, the whale east. */
export function travelDirection(species: CarrierSpecies): { x: number; y: number } {
  return species === 'whale' ? { x: 1, y: 0 } : { x: 0, y: 1 };
}

/** The subject rectangle (the Carrier with its foam) and its centre. */
export function subjectOf(bounds: WorldBounds): { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number } {
  const s = bounds.subject ?? { x0: 0, y0: 0, x1: bounds.width, y1: bounds.height };
  return { ...s, cx: (s.x0 + s.x1) / 2, cy: (s.y0 + s.y1) / 2 };
}

/**
 * The surfacing order, per world pixel, 0 (first) .. 1 (last) over the subject; open water keeps 0. Pure geometry
 * from the species' anatomy: no renderer is touched.
 */
export function surfacingOrder(world: WorldDescription, species: CarrierSpecies, bounds: WorldBounds): Float32Array {
  const { width, height } = world.terrain;
  const sub = subjectOf(bounds);
  const out = new Float32Array(width * height);
  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  let rank: (x: number, y: number) => number;
  if (species === 'turtle' && world.turtle) {
    // From the dome's centre outward, in the shell's own proportions; the head and the flipper tips come last.
    const a = world.turtle;
    const corners = [
      [sub.x0, sub.y0],
      [sub.x1, sub.y0],
      [sub.x0, sub.y1],
      [sub.x1, sub.y1],
    ];
    const far = Math.max(...corners.map(([x, y]) => Math.hypot((x - a.cx) / a.rx, (y - a.cy) / a.ry)));
    rank = (x, y) => Math.hypot((x + 0.5 - a.cx) / a.rx, (y + 0.5 - a.cy) / a.ry) / far;
  } else if (species === 'whale' && world.creature?.species === 'whale') {
    // Snout first (east), then back along the spine to the flukes; the spine a little before the flanks.
    const a = world.creature.anatomy;
    const span = Math.max(1, sub.x1 - sub.x0);
    const halfH = Math.max(1, (sub.y1 - sub.y0) / 2);
    rank = (x, y) => {
      const v = (y + 0.5 - a.cy) / halfH;
      return 0.9 * ((sub.x1 - (x + 0.5)) / span) + 0.1 * v * v;
    };
  } else if (species === 'manta' && world.creature?.species === 'manta') {
    // The disc first, then out along the wings, the tips and the whip last.
    const a = world.creature.anatomy;
    const halfW = Math.max(1, (sub.x1 - sub.x0) / 2);
    const halfH = Math.max(1, (sub.y1 - sub.y0) / 2);
    rank = (x, y) => {
      const u = (x + 0.5 - a.cx) / halfW;
      const v = (y + 0.5 - a.cy) / halfH;
      return Math.sqrt(u * u + 0.3 * v * v);
    };
  } else {
    // Any other world: from the subject's centre outward.
    const halfW = Math.max(1, (sub.x1 - sub.x0) / 2);
    const halfH = Math.max(1, (sub.y1 - sub.y0) / 2);
    rank = (x, y) => Math.hypot((x + 0.5 - sub.cx) / halfW, (y + 0.5 - sub.cy) / halfH) / Math.SQRT2;
  }
  // Every pixel gets a rank (open water too: a moving fin may be drawn over it).
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[y * width + x] = clamp01(rank(x, y));
  return out;
}

/** The island's centre and a radius, for the island glide (the first island record; the subject when absent). */
export function islandOf(world: WorldDescription, bounds: WorldBounds): { x: number; y: number; r: number } {
  const isl = world.islands[0];
  if (isl) return { x: isl.cx, y: isl.cy, r: isl.radius };
  const sub = subjectOf(bounds);
  return { x: sub.cx, y: sub.cy, r: Math.min(sub.x1 - sub.x0, sub.y1 - sub.y0) / 4 };
}

/** The Carrier's own sounds for the cinematic (its existing voice: a call from beneath, a breath on surfacing). */
export function carrierSounds(species: CarrierSpecies): { call: string; breath: string } {
  return CARRIER_VOICES[species] ?? CARRIER_VOICES.turtle;
}

/** The message of the last scene. */
export const INTRO_MESSAGE: readonly [string, string] = ['Every little world has a story.', 'This one begins with you.'];

/** The hint that any key or tap skips. */
export const SKIP_HINT = 'ANY KEY OR TAP  SKIP';
