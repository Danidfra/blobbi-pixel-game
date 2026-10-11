/**
 * WORLD CARRIER SPECIES: what each kind of Carrier is, beyond its pixels. The turtle (M1) and the manta (M7,
 * `carriers/manta-world.ts`) are playable; the whale is a PROTOTYPE (deterministic generation and an animated
 * preview, not a playable world: see docs/architecture/WORLD-CARRIERS.md).
 */
import type { PixelBuffer } from '../core/pixel';
import type { WorldPalette } from '../core/palette';
import type { CarrierSpecies } from '../game/archipelago';
import { generateWhaleGenome, renderWhale, whaleAnatomy, whaleIslandAt } from './whale';
import { generateMantaGenome, mantaAnatomy, mantaIslandAt, renderManta } from './manta';

export interface SpeciesDef {
  id: CarrierSpecies;
  name: string;
  status: 'playable' | 'prototype';
  personality: string;
  movement: string;
  environment: string;
  /** The shape of the land it carries and how that land grows (see the *IslandAt functions). */
  island: string;
  growth: string;
  /** Sound effect names (audio/sfx.ts). */
  sounds: { call: string; ambient: string };
  lore: string[];
}

export const SPECIES: Record<CarrierSpecies, SpeciesDef> = {
  turtle: {
    id: 'turtle',
    name: 'Shell Carrier (sea turtle)',
    status: 'playable',
    personality: 'Patient and steady; content; hums.',
    movement: 'Four paddles in a slow rhythm, the head bobbing, blinking and glancing.',
    environment: 'Warm, calm open sea; follows warm currents.',
    island: 'A round oval island on the dome of the shell, ringed by the rim.',
    growth: 'The shell widens (the shell variants): the land grows evenly outward.',
    sounds: { call: 'carrier-call', ambient: 'carrier-breath' },
    lore: ['The oldest turtles carry the oldest islands.', 'A turtle never hurries, and never stops.'],
  },
  whale: {
    id: 'whale',
    name: 'Ridge Carrier (whale)',
    status: 'prototype',
    personality: 'Gentle, deep-voiced, sings; travels far and straight.',
    movement: 'A slow wave through the body to the flukes; the long fins sway; it spouts every few breaths.',
    environment: 'Cool deep water and long migrations; surfaces to breathe.',
    island: 'A long, narrow ridge meadow along the spine, a path down its length; the spout is a landmark in front of it.',
    growth: 'The island lengthens toward the tail (about +12% length per stage), never toward the blowholes.',
    sounds: { call: 'whale-song', ambient: 'whale-blow' },
    lore: ['On a whale, everything is a long walk, and every walk ends at the sea.', 'When it sings, the whole ridge hums underfoot.'],
  },
  manta: {
    id: 'manta',
    name: 'Wing Carrier (manta)',
    status: 'playable',
    personality: 'Curious, playful and quiet; drifts in wide circles; loves the shallows.',
    movement: 'A wave travelling out along the wings: the tips rise and fall, the middle stays level; the tail whip sways.',
    environment: 'Sunlit shallows and reefs; glides close to the surface.',
    island: 'A wide, flat island across the central disc, with tide pools where it meets the wings.',
    growth: 'The island widens toward the wings: grown regions are lobes east and west of the island (world/growth.ts), about +51% land at stage 3.',
    sounds: { call: 'manta-call', ambient: 'manta-glide' },
    lore: ['No two mantas wear the same spots; this one is known by its own.', 'Where a manta glides, the water is always clear.'],
  },
};

/** A prototype species' preview frame: the creature, its island (at a growth stage) and the sea, at time `t`. */
export function renderSpeciesPreview(species: 'whale' | 'manta', seed: string, w: number, h: number, t: number, palette: WorldPalette, stage = 0): PixelBuffer {
  if (species === 'whale') return renderWhale(whaleAnatomy(generateWhaleGenome(seed), w, h), t, palette, stage).buffer;
  return renderManta(mantaAnatomy(generateMantaGenome(seed), w, h), t, palette, stage).buffer;
}

/** The island's ellipse at each growth stage, for docs and tests. */
export function islandGrowth(species: 'whale' | 'manta', seed: string, w: number, h: number): { cx: number; cy: number; rx: number; ry: number }[] {
  if (species === 'whale') {
    const a = whaleAnatomy(generateWhaleGenome(seed), w, h);
    return [0, 1, 2, 3].map((s) => whaleIslandAt(a, s));
  }
  const a = mantaAnatomy(generateMantaGenome(seed), w, h);
  return [0, 1, 2, 3].map((s) => mantaIslandAt(a, s));
}
