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
}

export interface CareState extends Needs {
  /** World time of the last petting that counted (attention has a short cooldown). */
  lastPet: number;
}

export const NEW_CARE: Readonly<CareState> = { hunger: 100, energy: 100, happiness: 70, lastPet: -Infinity };

/** Per simulated second. */
export const RATES = {
  hunger: 0.06, // full to empty in about 28 minutes of play
  energyAwake: 0.08, // full to empty in about 21 minutes standing about
  energyWalking: 0.11,
  energyResting: 1.5,
  energyInShelter: 3,
  happinessDrift: 0.02,
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

/** Happiness gained from positive moments. */
export const JOY = { feed: 10, hungryFeed: 5, pet: 6, rested: 5, explore: 2, harvest: 3, decoration: 3, built: 5, objective: 4, favourite: 10 } as const;

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
  else c.energy = clamp(c.energy - (ctx.moving ? RATES.energyWalking : RATES.energyAwake) * dt);
  const floor = c.hunger < HUNGRY || c.energy < TIRED ? LOW_FLOOR : HAPPY_FLOOR;
  if (c.happiness > floor) c.happiness = Math.max(floor, c.happiness - RATES.happinessDrift * dt);
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
  c.lastPet = num(r.lastPet) ?? c.lastPet;
  return c;
}

/** The record written to the save (lastPet only when it was ever set: JSON has no -Infinity). */
export function careToSave(c: CareState): { hunger: number; energy: number; happiness: number; lastPet: number | null } {
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { hunger: round(c.hunger), energy: round(c.energy), happiness: round(c.happiness), lastPet: Number.isFinite(c.lastPet) ? c.lastPet : null };
}
