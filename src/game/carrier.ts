/**
 * THE WORLD CARRIER AS A COMPANION: the Blobbi's bond with the great turtle, the island's harmony, and a data model
 * for the Carrier's future growth.
 *
 * Interactions (all subtle; the turtle answers only with its existing blink and glance animations, the island's
 * hum and the Blobbi's own reactions; its anatomy, face and placement never change):
 *   listen   at the shore by the head (the M5 interaction)
 *   greet    once a day counts: the turtle blinks back
 *   observe  notice one thing about the Carrier; each new observation is kept in the journal
 *   offer    give a food or a flower; once a day counts, a favourite counts more
 *   rest     nap on the shore by the head; once a day counts
 *   breathe  stand still by the head for a few seconds and feel the island rise and fall (found, not pressed)
 *
 * Harmony is NON-PUNITIVE: it is derived only from things that never go down (bond, lifetime tallies, discoveries
 * found, days lived), so nothing the player does or neglects can lower it. It changes flavour (the hum's words,
 * ambient life, the music's warmth), never rules.
 *
 * The Carrier "age" model below (young, grown, great, ancient; M6) is a DESIGN-ONLY data model kept for the
 * archipelago's records. The island's real growth is M7's `world/growth.ts` (stages 1-3, applied and saved); see
 * docs/architecture/WORLD-CARRIERS.md.
 */
import { hash32 } from '../core/rng';
import type { Tally } from './objectives';

export interface CarrierState {
  /** Bond points: they only ever grow. */
  bond: number;
  /** World days (see `dayAt`) on which each daily interaction last counted. */
  greetedDay: number;
  offeredDay: number;
  restedDay: number;
  breathDay: number;
  /** Observation ids noticed, in order. */
  observations: string[];
  /** The Carrier's favourites the player has found by offering them. */
  likesFound: string[];
  /** Times each interaction was used (for the journal and tests). */
  counts: { greet: number; observe: number; offer: number; rest: number; breathe: number };
}

export const newCarrier = (): CarrierState => ({ bond: 0, greetedDay: 0, offeredDay: 0, restedDay: 0, breathDay: 0, observations: [], likesFound: [], counts: { greet: 0, observe: 0, offer: 0, rest: 0, breathe: 0 } });

/** Bond earned per interaction (once a day each, except observations, which count once each). */
export const BOND = { listen: 1, greet: 2, observe: 3, offer: 3, favourite: 6, rest: 2, breathe: 3 } as const;

/** Read a saved carrier record (schema 8); anything missing or malformed falls back to a fresh record. */
export function carrierFromSave(raw: unknown): CarrierState {
  const c = newCarrier();
  if (!raw || typeof raw !== 'object') return c;
  const r = raw as Partial<Record<keyof CarrierState, unknown>>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  c.bond = n(r.bond);
  c.greetedDay = n(r.greetedDay);
  c.offeredDay = n(r.offeredDay);
  c.restedDay = n(r.restedDay);
  c.breathDay = n(r.breathDay);
  c.observations = Array.isArray(r.observations) ? r.observations.filter((x): x is string => typeof x === 'string' && [...OBSERVATIONS, ...MANTA_OBSERVATIONS].some((o) => o.id === x)) : [];
  c.likesFound = Array.isArray(r.likesFound) ? r.likesFound.filter((x): x is string => typeof x === 'string') : [];
  if (r.counts && typeof r.counts === 'object') for (const k of Object.keys(c.counts) as (keyof CarrierState['counts'])[]) c.counts[k] = n((r.counts as Record<string, unknown>)[k]);
  return c;
}

export const carrierToSave = (c: CarrierState): CarrierState => ({ ...c, observations: [...c.observations], likesFound: [...c.likesFound], counts: { ...c.counts } });

// ─── Observations ──────────────────────────────────────────────────────────

export interface Observation {
  id: string;
  /** What the Blobbi notices (the bubble). */
  text: string;
  /** The journal line. */
  note: string;
  /** Only at night, only by day, or any time. */
  when?: 'night' | 'day';
}

export const OBSERVATIONS: readonly Observation[] = [
  { id: 'eye', text: 'one great eye, slow and kind', note: 'The Carrier\'s eye opens slowly, looks, and closes. It seems to know Blobbi is there.' },
  { id: 'flippers', text: 'the flippers paddle, slow and steady', note: 'Four flippers paddle in a slow rhythm, never in a hurry. The island never rocks.' },
  { id: 'shell', text: 'the shell rim is warm from the sun', note: 'The rim of the shell is warm, worn smooth like a river stone, with moss in its seams.', when: 'day' },
  { id: 'breath', text: 'the island rises... and falls', note: 'Every few breaths of Blobbi\'s, the whole island rises a little and settles. The Carrier is breathing.' },
  { id: 'hum', text: 'a hum you feel in your feet', note: 'The hum is too low to hear properly. Blobbi feels it through the ground instead.' },
  { id: 'sleep', text: 'the Carrier sleeps; its breath slows', note: 'At night the hum fades and the breaths come slower. The Carrier sleeps, still swimming.', when: 'night' },
  { id: 'currents', text: 'it follows a warm current', note: 'The water around the head is warmer than the sea elsewhere. The Carrier steers by warm currents.' },
  { id: 'tail', text: 'a little tail, steering', note: 'The small tail at the back moves now and then: the Carrier is steering, gently, somewhere.' },
];

/** What one notices about a manta Carrier (M7): its own body, its own habits. */
export const MANTA_OBSERVATIONS: readonly Observation[] = [
  { id: 'manta-wings', text: 'the wing tips rise and fall', note: 'Far out at the edges, the wings rise and fall like slow breathing. The middle, where the island is, never tips at all.' },
  { id: 'manta-horns', text: 'two horns curl by its mouth', note: 'By the head two soft horns curl and uncurl. Blobbi thinks they are for tasting the water.' },
  { id: 'manta-spots', text: 'spots, like no other manta', note: 'There are spots on the Carrier\'s back that no other manta has. You would know it anywhere.' },
  { id: 'manta-shallows', text: 'it glides where the water is bright', note: 'The Carrier keeps to sunlit water. Through its wings you can sometimes see the sea floor glitter.', when: 'day' },
  { id: 'manta-tail', text: 'a thin tail, steering', note: 'Behind, a long thin tail sways like a ribbon, steering the whole island, gently.' },
  { id: 'manta-circles', text: 'it drifts in wide circles', note: 'The stars move in a slow circle overhead: the Carrier swims in rounds while it rests.', when: 'night' },
];

/** The observations for a Carrier's species. */
export const observationsFor = (species: 'turtle' | 'manta' = 'turtle'): readonly Observation[] => (species === 'manta' ? MANTA_OBSERVATIONS : OBSERVATIONS);

/** The next observation to make now (in order, skipping ones for another time of day), or null when all are made. */
export function nextObservation(c: CarrierState, night: boolean, species: 'turtle' | 'manta' = 'turtle'): Observation | null {
  return observationsFor(species).find((o) => !c.observations.includes(o.id) && (!o.when || (o.when === 'night') === night)) ?? null;
}

// ─── Offerings ────────────────────────────────────────────────────────────

/** The Carrier's two favourite offerings: from the turtle's seed, among the given candidates (stable). */
export function carrierFavourites(turtleSeed: string, candidates: readonly string[]): string[] {
  if (!candidates.length) return [];
  const sorted = [...candidates].sort();
  const h = hash32(`carrier-tastes|${turtleSeed}`);
  const a = sorted[h % sorted.length];
  const b = sorted[(h >>> 10) % sorted.length];
  return a === b ? [a] : [a, b];
}

// ─── Harmony ──────────────────────────────────────────────────────────────

export interface HarmonyInput {
  bond: number;
  tally: Pick<Tally, 'decorations' | 'flowers' | 'planted' | 'harvested' | 'built'>;
  found: number;
  days: number;
}

export const HARMONY_LEVELS = [
  { at: 0, name: 'quiet' },
  { at: 15, name: 'settling' },
  { at: 35, name: 'content' },
  { at: 60, name: 'thriving' },
  { at: 85, name: 'in harmony' },
] as const;

/** Island harmony 0..100 and its parts. Monotonic: every input only grows, so harmony never falls. */
export function harmony(h: HarmonyInput): { value: number; level: number; name: string; parts: Record<'bond' | 'care' | 'wonder' | 'time', number> } {
  const parts = {
    bond: Math.min(40, h.bond * 0.8),
    care: Math.min(25, h.tally.decorations * 2 + h.tally.flowers + h.tally.planted * 0.5 + h.tally.harvested * 0.25 + h.tally.built),
    wonder: Math.min(20, h.found * 2.5),
    time: Math.min(15, Math.max(0, h.days - 1) * 1.5),
  };
  const value = Math.min(100, Math.round(parts.bond + parts.care + parts.wonder + parts.time));
  let level = 0;
  HARMONY_LEVELS.forEach((l, i) => value >= l.at && (level = i));
  return { value, level, name: HARMONY_LEVELS[level].name, parts };
}

/** The hum's words by harmony level (the listen bubble draws from these). */
export const HUM_LINES: readonly (readonly string[])[] = [
  ['...a deep, slow hum...', 'the island rises and falls, like breathing'],
  ['one great eye opens, and closes, content', 'warm water, far away... the Carrier knows the way'],
  ['the hum sounds happy today', 'the Carrier hums along with the birds'],
  ['the hum is bright, like sunlight on water', 'the whole shell seems to smile'],
  ['the island and the Carrier hum as one', 'a long, glad hum. you belong here.'],
];

// ─── Carrier age (M6 design-only model; the island's real growth is world/growth.ts) ───

export type GrowthStage = 'young' | 'grown' | 'great' | 'ancient';

export interface GrowthStageDef {
  stage: GrowthStage;
  /** Requirements: harmony and days lived. */
  harmony: number;
  days: number;
  /** What growing into it would mean (design notes, shown in the journal). */
  note: string;
}

export const GROWTH_STAGES: readonly GrowthStageDef[] = [
  { stage: 'young', harmony: 0, days: 0, note: 'A young Carrier: one island, one home.' },
  { stage: 'grown', harmony: 35, days: 5, note: 'The shell would widen a little: a new meadow at its rim.' },
  { stage: 'great', harmony: 60, days: 15, note: 'A great Carrier: room for a grove and a tide pool biome.' },
  { stage: 'ancient', harmony: 85, days: 40, note: 'An ancient Carrier: a second terrace, and visitors from other islands.' },
];

/** A planned island expansion: where and what, by stage. Data only; nothing is added to the world. */
export interface IslandExpansion {
  id: string;
  stage: GrowthStage;
  biome: 'meadow' | 'grove' | 'tidepool' | 'terrace';
  /** Where on the shell, as a bearing from the island's centre (degrees, 0 = east, clockwise on screen). */
  bearing: number;
  /** How much the land would grow (fraction of the island's radius). */
  reach: number;
}

export const ISLAND_EXPANSIONS: readonly IslandExpansion[] = [
  { id: 'rim-meadow', stage: 'grown', biome: 'meadow', bearing: 300, reach: 0.12 },
  { id: 'old-grove', stage: 'great', biome: 'grove', bearing: 200, reach: 0.15 },
  { id: 'tide-pools', stage: 'great', biome: 'tidepool', bearing: 30, reach: 0.1 },
  { id: 'upper-terrace', stage: 'ancient', biome: 'terrace', bearing: 120, reach: 0.18 },
];

export interface GrowthView {
  stage: GrowthStageDef;
  next: GrowthStageDef | null;
  /** Expansions the stage would bring: designed, never applied in this version. */
  planned: IslandExpansion[];
  applied: false;
}

/** The Carrier's growth stage for a harmony and an age (both monotonic, so a stage is never lost). */
export function growthStage(harmonyValue: number, days: number): GrowthView {
  let i = 0;
  GROWTH_STAGES.forEach((g, k) => harmonyValue >= g.harmony && days >= g.days && (i = k));
  const stage = GROWTH_STAGES[i];
  const reached = new Set(GROWTH_STAGES.slice(0, i + 1).map((g) => g.stage));
  return { stage, next: GROWTH_STAGES[i + 1] ?? null, planned: ISLAND_EXPANSIONS.filter((e) => reached.has(e.stage)), applied: false };
}
