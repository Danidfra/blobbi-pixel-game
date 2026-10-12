/**
 * THE PREVIEW WORLDS of the intro cinematic: one fixed world per species, so the cinematic can be watched and
 * screenshotted without making a new world each time and without touching any save (the preview's live world is
 * made with no store). The dev tools, the `#intro=` link and `scripts/intro-cinematic.ts` all use these.
 */
import type { CarrierSpecies } from '../game/archipelago';
import type { WorldDescription } from '../world/types';
import { generateTurtleWorld } from '../world/turtle-world';
import { generateMantaWorld } from '../carriers/manta-world';
import { generateWhaleWorld } from '../carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../carrier/types';

export const INTRO_PREVIEW_SEED = 'intro-preview';

export function introPreviewWorld(kind: CarrierSpecies): WorldDescription {
  // A new world's start: no generated cottage (M8), and for the turtle the small shell (Variant S).
  if (kind === 'manta') return generateMantaWorld(INTRO_PREVIEW_SEED, { carrierSeed: 'manta-intro', generatedHouse: false });
  if (kind === 'whale') return generateWhaleWorld(INTRO_PREVIEW_SEED, { carrierSeed: 'whale-intro', generatedHouse: false });
  return generateTurtleWorld(INTRO_PREVIEW_SEED, { turtleSeed: 'turtle-intro', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });
}

export const isIntroSpecies = (v: unknown): v is CarrierSpecies => v === 'turtle' || v === 'manta' || v === 'whale';
