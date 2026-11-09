/**
 * BLOBBI CARE: three needs, each 0..100 where 100 is good.
 *
 *   hunger     how full the Blobbi is (100 = full, 0 = very hungry). Falls slowly; food restores it.
 *   energy     falls while awake (a little faster walking); resting restores it, twice as fast in a shelter.
 *   happiness  drifts slowly down to a resting floor; feeding, resting, exploring and attention raise it.
 *
 * Cozy, never harsh: nothing dies, breaks or is lost. Low needs only change behaviour a little (a hungry or
 * exhausted Blobbi walks a bit slower, a tired one goes to rest on its own, a hungry one says so now and then)
 * and show in the face (`mood`). Needs advance in simulated time steps (the live world's fixed `dt`), so a
 * replay is the same and a closed tab costs nothing: world time does not pass while the game is not running.
 *
 * Needs belong to the WORLD's save next to the inventory: they describe how the Blobbi on this island is doing.
 * They are not part of the Blobbi's identity, which stays the canonical V3 seed (see `blobbi/source.ts`).
 */
import type { Expression } from '../blobbi/pose';

export interface Needs {
  hunger: number;
  energy: number;
  happiness: number;
  /** Clean (100) to grubby (0): work dirties it, a wash restores it (Living World, phase 2; island-local). */
  hygiene: number;
}

export interface CareState extends Needs {
  /** World time of the last petting that counted (attention has a short cooldown). */
  lastPet: number;
}

export const NEW_CARE: Readonly<CareState> = { hunger: 100, energy: 100, happiness: 70, hygiene: 100, lastPet: -Infinity };

/** Per simulated second. */
export const RATES = {
  hunger: 0.06, // full to empty in about 28 minutes of play
  energyAwake: 0.08, // full to empty in about 21 minutes standing about
  energyWalking: 0.11,
  energyResting: 1.5,
  energyInShelter: 3,
  happinessDrift: 0.02,
  hygieneDrift: 0.012, // clean to the floor in about 80 minutes of play, if it never works
} as const;

/** Thresholds where behaviour changes. */
export const HUNGRY = 30;
export const TIRED = 25;
export const SLOW = 15;
/** Rest ends on its own here (when the rest was for recovery). */
export const RESTED = 95;
/** Happiness never drifts below this on its own; a hungry or tired Blobbi's floor is lower. */
export const HAPPY_FLOOR = 40;
export const LOW_FLOOR = 20;
/** Food is refused at or above this hunger (no wasted food). */
export const FULL = 95;

export const PET_COOLDOWN = 8;

/**
 * EXPLORATION STAMINA (Living World, phase 2): what the Blobbi DOES costs a little of its energy, on top of the gentle
 * drift it always had: a landed axe or pickaxe hit, a tilled cell, a watering, a cast. Walking, talking, picking up,
 * feeding and petting stay free. Below `EXHAUSTED` the heavy work (the axe, the pickaxe, the hoe) politely waits for a
 * rest or a bite to eat; the lighter chores and everything else go on. Nothing is lost and nothing punished, and a
 * save from before knows nothing new: the costs come out of the energy it already had, and rest restores it as ever.
 */
export const STAMINA = { chop: 0.5, mine: 0.5, till: 0.5, water: 0.25, cast: 0.25 } as const;
export const EXHAUSTED = 8;
/** The passive drift of an awake Blobbi stops here: standing about or exploring never exhausts it, only work can. */
export const DRIFT_FLOOR = 20;
export const isExhausted = (c: Needs): boolean => c.energy < EXHAUSTED;

/** Spend energy on work. Returns whether this is the moment it became tired (for one word about it). */
export function spendEnergy(c: CareState, amount: number): boolean {
  const was = isTired(c);
  c.energy = clamp(c.energy - amount);
  return !was && isTired(c);
}

/** Happiness gained from positive moments. */
export const JOY = { feed: 10, hungryFeed: 5, pet: 6, rested: 5, explore: 2, harvest: 3, decoration: 3, built: 5, objective: 4, favourite: 10, wash: 4, bunny: 3, song: 2, music: 2 } as const;
/** Seconds between two gains from the same living-world source (the music box, the wind chime); creatures count once per appearance. */
export const JOY_SOURCE_COOLDOWN = 20;
/** Condition shows (Living World, phase 2): tired idling runs slower; a glad Blobbi smiles on its own above this joy. */
export const TIRED_TEMPO = 0.6;
export const GLAD = 85;

/**
 * HYGIENE (Living World, phase 2): an island-local need like the others, never the canonical one. Work dirties the
 * Blobbi a little (the axe, the pickaxe, the soil); a gentle drift stops at a floor, so time alone never makes it
 * grubby; a wash in a tub makes it clean again, and glad. Nothing is refused for being grubby: it only shows.
 */
export const DIRT = { chop: 0.5, mine: 1, till: 1 } as const;
export const HYGIENE_FLOOR = 40;
export const GRUBBY = 30;
export const CLEAN = 95;
export const isGrubby = (c: Needs): boolean => c.hygiene < GRUBBY;

/** Work dirties. Returns whether this is the moment it became grubby (for one word about it). */
export function getDirty(c: CareState, amount: number): boolean {
  const was = isGrubby(c);
  c.hygiene = clamp(c.hygiene - amount);
  return !was && isGrubby(c);
}

/** A wash: clean again, and glad of it. False when it is clean enough already (no wasted splash). */
export function wash(c: CareState): boolean {
  if (c.hygiene >= CLEAN) return false;
  c.hygiene = 100;
  addHappiness(c, JOY.wash);
  return true;
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function newCare(): CareState {
  return { ...NEW_CARE };
}

export interface CareContext {
  resting: boolean;
  /** Resting in (in front of the door of) a finished shelter. */
  sheltered: boolean;
  moving: boolean;
}

/** One simulation step. Mutates and returns the state. */
export function stepCare(c: CareState, dt: number, ctx: CareContext): CareState {
  c.hunger = clamp(c.hunger - RATES.hunger * dt);
  if (ctx.resting) c.energy = clamp(c.energy + (ctx.sheltered ? RATES.energyInShelter : RATES.energyResting) * dt);
  else if (c.energy > DRIFT_FLOOR) c.energy = Math.max(DRIFT_FLOOR, c.energy - (ctx.moving ? RATES.energyWalking : RATES.energyAwake) * dt);
  const floor = c.hunger < HUNGRY || c.energy < TIRED ? LOW_FLOOR : HAPPY_FLOOR;
  if (c.happiness > floor) c.happiness = Math.max(floor, c.happiness - RATES.happinessDrift * dt);
  if (c.hygiene > HYGIENE_FLOOR) c.hygiene = Math.max(HYGIENE_FLOOR, c.hygiene - RATES.hygieneDrift * dt);
  return c;
}

export const isHungry = (c: Needs): boolean => c.hunger < HUNGRY;
export const isTired = (c: Needs): boolean => c.energy < TIRED;
export const isRested = (c: Needs): boolean => c.energy >= RESTED;

/** Walking speed factor: a little slower when very hungry or exhausted. */
export const speedFactor = (c: Needs): number => (c.hunger < SLOW || c.energy < SLOW ? 0.85 : 1);

export function addHappiness(c: CareState, amount: number): void {
  c.happiness = clamp(c.happiness + amount);
}

/**
 * Eat one food: hunger up by its value (and energy and joy when the food gives them), happiness up (more when it
 * was hungry). False when too full to eat: a full Blobbi only accepts something that is mostly not about hunger
 * (a cup of tea when tired), never wasting food.
 */
export function eat(c: CareState, food: number | { restores: number; energy?: number; joy?: number }): boolean {
  const f = typeof food === 'number' ? { restores: food } : food;
  const mostlyTreat = (f.energy ?? 0) + (f.joy ?? 0) > f.restores;
  if (c.hunger >= FULL && !(mostlyTreat && c.energy < FULL)) return false;
  const wasHungry = isHungry(c);
  c.hunger = clamp(c.hunger + f.restores);
  c.energy = clamp(c.energy + (f.energy ?? 0));
  addHappiness(c, JOY.feed + (wasHungry ? JOY.hungryFeed : 0) + (f.joy ?? 0));
  return true;
}

/** Attention: counts once per cooldown. Returns whether it raised happiness. */
export function pet(c: CareState, worldTime: number): boolean {
  if (worldTime - c.lastPet < PET_COOLDOWN) return false;
  c.lastPet = worldTime;
  addHappiness(c, JOY.pet);
  return true;
}

/**
 * The face the needs suggest when nothing else is going on (a reaction or sleep wins). Neutral covers the wide
 * comfortable middle, so the approved default look is what a cared-for Blobbi shows most of the time.
 */
export function mood(c: Needs): Expression | null {
  if (c.energy < 15) return 'sleepy';
  if (c.hunger < 15 || c.happiness < 25) return 'sad';
  if (c.happiness >= 85 && c.hunger >= 50 && c.energy >= 40) return 'happy';
  return null;
}

/** Read a saved care record; anything missing or malformed falls back to a fresh, comfortable Blobbi. */
export function careFromSave(raw: unknown): CareState {
  const c = newCare();
  if (!raw || typeof raw !== 'object') return c;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  c.hunger = clamp(num(r.hunger) ?? c.hunger);
  c.energy = clamp(num(r.energy) ?? c.energy);
  c.happiness = clamp(num(r.happiness) ?? c.happiness);
  c.hygiene = clamp(num(r.hygiene) ?? c.hygiene); // a save from before hygiene: clean
  c.lastPet = num(r.lastPet) ?? c.lastPet;
  return c;
}

/** The record written to the save (lastPet only when it was ever set: JSON has no -Infinity). */
export function careToSave(c: CareState): { hunger: number; energy: number; happiness: number; hygiene: number; lastPet: number | null } {
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { hunger: round(c.hunger), energy: round(c.energy), happiness: round(c.happiness), hygiene: round(c.hygiene), lastPet: Number.isFinite(c.lastPet) ? c.lastPet : null };
}
