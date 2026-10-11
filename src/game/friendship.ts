/**
 * FRIENDSHIP AND TASTES: how close the player and this Blobbi are, and what this Blobbi likes.
 *
 * Friendship only grows: attention, food (especially favourites), meals, rest, completed quests. It never decays,
 * so taking a break costs nothing. Levels unlock a few small things (a side quest, the statue plans) and change
 * how warmly the Blobbi reacts.
 *
 * Tastes are this Blobbi's own, from its canonical seed: two favourite foods and one favourite kind of thing to
 * look at. They are discovered by trying (each food fed is remembered as tasted); a favourite is a bigger treat.
 * Friendship and tastes are BLOBBI-SPECIFIC state: kept per Blobbi seed in the world record, never part of the
 * Blobbi's identity.
 */
import { stream } from '../core/rng';

export const FRIEND_LEVELS = [0, 15, 45, 100, 180, 300] as const;
export const FRIEND_TITLES = ['new friends', 'friends', 'good friends', 'close friends', 'best friends', 'inseparable'] as const;

/** Level 1..6 for a number of friendship points. */
export function friendLevel(points: number): number {
  let level = 1;
  for (let i = 0; i < FRIEND_LEVELS.length; i++) if (points >= FRIEND_LEVELS[i]) level = i + 1;
  return level;
}

/** Points to the next level (0 at the top). */
export function toNextLevel(points: number): number {
  const next = FRIEND_LEVELS.find((t) => t > points);
  return next === undefined ? 0 : next - points;
}

/** Friendship points per kind of moment. */
export const FRIEND = { pet: 1, feed: 2, favourite: 5, meal: 3, rest: 2, quest: 3, play: 2 } as const;

export interface Tastes {
  /** Favourite food item ids. */
  foods: readonly string[];
  /** A favourite kind of placeable to visit. */
  thing: string;
}

/** This Blobbi's tastes, from its seed (the same Blobbi always likes the same things). */
export function tastesFor(blobbiSeed: string, foods: readonly string[], things: readonly string[]): Tastes {
  const rng = stream(blobbiSeed, 'tastes');
  const pool = [...foods];
  const a = pool.splice(rng.int(0, pool.length - 1), 1)[0];
  const b = pool.splice(rng.int(0, pool.length - 1), 1)[0];
  return { foods: [a, b], thing: rng.pick(things) };
}
