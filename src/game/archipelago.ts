/**
 * THE ARCHIPELAGO (architecture only, not playable in this version): how many World Carriers relate to each other.
 * A player's home Carrier sits in a sea of other Carriers, each a seed and a species; travel, visiting and sharing
 * are designed in docs/architecture/NOSTR-MULTIPLAYER.md. This module fixes the data model and its determinism so later
 * work builds on stable ids:
 *
 *   CarrierRef      what identifies a Carrier anywhere: species, seed, generator version (enough to regenerate it)
 *   ArchipelagoEntry a Carrier this player knows: how (home, met, visited), when, and its last-seen growth stage
 *   neighbours()    the Carriers "near" a home Carrier: a pure function of the home seed, so two players with the
 *                   same home see the same neighbourhood, with no server and no coordination
 *
 * Nothing here is saved, rendered or networked yet.
 */
import { stream } from '../core/rng';

export type CarrierSpecies = 'turtle' | 'whale' | 'manta';
export const CARRIER_SPECIES: readonly CarrierSpecies[] = ['turtle', 'whale', 'manta'];

/** The generator version a CarrierRef was made with (a world regenerates identically only with the same one). */
export const GENERATOR_VERSION = 'm6.0';

export interface CarrierRef {
  species: CarrierSpecies;
  seed: string;
  generator: string;
}

export interface ArchipelagoEntry {
  carrier: CarrierRef;
  relation: 'home' | 'met' | 'visited';
  /** Real time first known (ms). */
  since: number;
  /** The growth stage when last seen (see game/carrier.ts). */
  stage: 'young' | 'grown' | 'great' | 'ancient';
}

/** A stable text key for a Carrier (a future map key, a future event tag value). */
export const carrierKey = (c: CarrierRef) => `${c.species}:${c.seed}@${c.generator}`;

export function parseCarrierKey(key: string): CarrierRef | null {
  const m = /^(turtle|whale|manta):(.+)@([\w.-]+)$/.exec(key);
  return m ? { species: m[1] as CarrierSpecies, seed: m[2], generator: m[3] } : null;
}

export interface Neighbour {
  carrier: CarrierRef;
  /** Bearing from home in degrees (0 east, clockwise) and distance in "days of swimming". */
  bearing: number;
  distance: number;
}

/**
 * The Carriers near a home Carrier: deterministic from its seed alone. Mostly turtles, with whales and mantas
 * further out, spread around the compass (never two within 30° at the same distance band).
 */
export function neighbours(home: CarrierRef, count = 6): Neighbour[] {
  const rng = stream(home.seed, 'archipelago', home.generator);
  const out: Neighbour[] = [];
  for (let i = 0; out.length < count && i < count * 20; i++) {
    const distance = 1 + Math.floor(rng.range(0, 6));
    const bearing = Math.floor(rng.range(0, 360));
    if (out.some((n) => Math.abs(n.distance - distance) <= 1 && Math.min(Math.abs(n.bearing - bearing), 360 - Math.abs(n.bearing - bearing)) < 30)) continue;
    const roll = rng.range(0, 1);
    const species: CarrierSpecies = distance >= 4 && roll < 0.35 ? 'whale' : distance >= 3 && roll < 0.6 ? 'manta' : 'turtle';
    out.push({ carrier: { species, seed: `${home.seed}~${i}`, generator: home.generator }, bearing, distance });
  }
  return out;
}
