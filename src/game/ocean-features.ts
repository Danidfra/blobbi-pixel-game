/**
 * OCEAN FEATURES (M10 phase B): a few light things to find with the canoe, out on the sea round the Carrier.
 *
 *   bottle  a message bottle adrift somewhere in open water — a new spot each world day — until it is fished out
 *   kelp    a kelp garden at one fixed spot in deeper water; its seaweed can be gathered, and grows back in a day
 *   shoal   a silver shoal that gathers at dawn and at dusk, at a spot that changes every day
 *
 * Like marine life they are a pure function of the world's seed and world time (nothing simulated); what the player
 * did (found a thing, gathered the seaweed) is saved through the existing discoveries and collected records. They
 * lie only on water the canoe can float on, away from the island and inside the rough-water band, and none can be
 * missed for good: the bottle drifts every day until found, the shoal returns twice a day, the kelp never leaves.
 */
import { hash32 } from '../core/rng';
import { hourAt, DAY_SECONDS } from './daylight';
import type { SeaNav } from './canoe';
import { CANOE } from './canoe';

export type OceanFeatureKind = 'bottle' | 'kelp' | 'shoal';

export interface OceanFeature {
  kind: OceanFeatureKind;
  x: number;
  y: number;
  /** Which day's bottle or shoal (the kelp: 0). */
  day: number;
}

/** How near (world px) the Blobbi in the canoe must be to reach one. */
export const FEATURE_REACH = 22;

/** Seconds of world time before gathered seaweed is back (a day). */
export const KELP_REGROW_SECONDS = DAY_SECONDS;

export class OceanFeatures {
  private readonly spots: { x: number; y: number }[] = [];
  private readonly salt: number;

  constructor(
    readonly seed: string,
    readonly nav: SeaNav,
    /** The Carrier's bounding box (the island and the animal). */
    readonly subject: { x0: number; y0: number; x1: number; y1: number },
  ) {
    this.salt = hash32(`${seed}/ocean-features`);
    // Candidate spots: open water a canoe can float on, between 30 px off the Carrier and the rough band.
    const r = nav.region;
    const inner = 30;
    for (let y = r.y0 + CANOE.band + 8; y < r.y1 - CANOE.band - 8; y += 12)
      for (let x = r.x0 + CANOE.band + 8; x < r.x1 - CANOE.band - 8; x += 12) {
        const outside = x < subject.x0 - inner || x > subject.x1 + inner || y < subject.y0 - inner || y > subject.y1 + inner;
        if (outside && nav.canFloat(x, y, 'right') && nav.canFloat(x, y, 'down')) this.spots.push({ x, y });
      }
  }

  get candidates(): number {
    return this.spots.length;
  }

  private spot(key: string): { x: number; y: number } | null {
    if (!this.spots.length) return null;
    return this.spots[hash32(`${this.salt}:${key}`) % this.spots.length];
  }

  /** What is out on the sea at world time `t` (`bottleFound`: the bottle has been found, so it is gone). */
  at(t: number, bottleFound: boolean): OceanFeature[] {
    const out: OceanFeature[] = [];
    const day = Math.floor(t / DAY_SECONDS);
    const kelp = this.spot('kelp');
    if (kelp) out.push({ kind: 'kelp', ...kelp, day: 0 });
    if (!bottleFound) {
      const b = this.spot(`bottle:${day}`);
      // Adrift: it wanders a little over the day.
      if (b) out.push({ kind: 'bottle', x: Math.round(b.x + Math.sin(t / 90) * 6), y: Math.round(b.y + Math.cos(t / 120) * 4), day });
    }
    const h = hourAt(t);
    if ((h >= 5 && h < 7.5) || (h >= 17.5 && h < 20)) {
      const s = this.spot(`shoal:${day}:${h < 12 ? 'dawn' : 'dusk'}`);
      if (s) out.push({ kind: 'shoal', ...s, day });
    }
    // Only where the canoe can float right now (a bottle never drifts onto land).
    return out.filter((f) => this.nav.water(f.x, f.y));
  }
}
