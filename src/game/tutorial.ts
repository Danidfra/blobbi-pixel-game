/**
 * THE CONTEXTUAL TUTORIAL (M8): short tips that teach the game by doing it, one at a time, never blocking play.
 *
 * Each step says one thing ("walk", "pick something up", "open the bag"...) in words for the keyboard or for touch,
 * shows only when it makes sense (`when`: the step's quest is open, a shelter exists...), and is DONE the moment the
 * player has done it — including before the tip ever showed (a player who already crafted an axe never sees the
 * crafting tip). Done steps and "tips off" are saved with the island (`TutorialSave`).
 *
 * Steps are checked in order; the first one that is not done and whose `when` holds is the tip on screen. After a
 * step completes the next tip waits a few seconds, so tips never pile up.
 */
import type { Tally } from './objectives';
import type { TutorialSave } from './persistence';

export interface TutorialContext {
  tally: Tally;
  /** Completed quest ids. */
  completed: Readonly<Record<string, number>>;
  /** Active quest ids (open, not done). */
  active: ReadonlySet<string>;
  /** UI and play events seen this session (`open:inventory`, `walked`...). */
  events: ReadonlySet<string>;
  hasShelter: boolean;
  inside: boolean;
}

export interface TutorialStep {
  id: string;
  /** What the tip says with a keyboard. */
  keys: string;
  /** What it says on a touch screen. */
  touch: string;
  when(c: TutorialContext): boolean;
  done(c: TutorialContext): boolean;
}

const quest = (id: string) => (c: TutorialContext) => c.active.has(id) || id in c.completed;

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'move', keys: 'Walk with WASD or the arrow keys (or click where to go).', touch: 'Drag anywhere on the island to walk. A tap walks there.', when: () => true, done: (c) => c.events.has('walked') || c.tally.collected > 0 || c.tally.looked > 0 },
  { id: 'blobbi', keys: 'Say hello to your Blobbi: press H (or BLOBBI, then PET).', touch: 'Say hello to your Blobbi: tap BLOBBI, then PET.', when: () => true, done: (c) => c.tally.petted > 0 },
  { id: 'gather', keys: 'Sticks and stones lie about. Walk up and press E to pick one up.', touch: 'Sticks and stones lie about. Walk up and tap USE to pick one up.', when: () => true, done: (c) => c.tally.collected > 0 },
  { id: 'bag', keys: 'Press I (or BAG) to see what you carry.', touch: 'Tap BAG to see what you carry.', when: (c) => c.tally.collected > 0, done: (c) => c.events.has('open:inventory') },
  { id: 'craft', keys: 'Press K (or CRAFT) and make a simple axe: 3 sticks and 2 stones.', touch: 'Tap CRAFT and make a simple axe: 3 sticks and 2 stones.', when: quest('axe'), done: (c) => c.tally.crafted > 0 || c.tally.axesCrafted > 0 },
  { id: 'tool', keys: 'Hold the axe (Q, or EQUIP in the bag), face a tree and press E three times.', touch: 'Hold the axe (EQUIP in the bag), face a tree and tap USE three times.', when: (c) => c.tally.axesCrafted > 0 || c.tally.crafted > 0, done: (c) => c.tally.felled > 0 },
  { id: 'build', keys: 'With 6 wood and 3 stones: press B (or CRAFT, then BUILD). Green fits: E builds your shelter.', touch: 'With 6 wood and 3 stones: CRAFT, then BUILD. Green fits: USE builds your shelter.', when: quest('shelter'), done: (c) => c.hasShelter },
  { id: 'enter', keys: 'Your first home! Walk to its door and press E to go inside.', touch: 'Your first home! Walk to its door and tap USE to go inside.', when: (c) => c.hasShelter, done: (c) => c.tally.entered > 0 },
  { id: 'furnish', keys: 'Inside: open the bag (I), choose the potted plant, PLACE, then E where it fits.', touch: 'Inside: open the BAG, choose the potted plant, PLACE, then USE where it fits.', when: (c) => c.tally.entered > 0, done: (c) => c.tally.furnished > 0 },
  { id: 'farm', keys: 'Make a hoe (CRAFT), hold it and press E on grass to till a plot; then plant a seed.', touch: 'Make a hoe (CRAFT), hold it and tap USE on grass to till a plot; then plant a seed.', when: quest('plot'), done: (c) => c.tally.planted > 0 },
  { id: 'grow', keys: 'Your island can grow. Press L (GROWTH) to see what it needs.', touch: 'Your island can grow. Open ... then GROWTH to see what it needs.', when: (c) => 'home' in c.completed || 'harvest' in c.completed, done: (c) => c.events.has('open:growth') },
  { id: 'cook', keys: 'Craft a cooking station, place it, and press E at it to cook a meal.', touch: 'Craft a cooking station, place it, and tap USE at it to cook a meal.', when: quest('cook'), done: (c) => c.tally.cooked > 0 },
  { id: 'carrier', keys: 'Your island rides a living Carrier. At its head, press E to listen.', touch: 'Your island rides a living Carrier. At its head, tap USE to listen.', when: quest('carrier'), done: (c) => c.tally.talked > 0 },
  { id: 'home', keys: 'Press 0 (HOME) to see your house: upgrades, colours and rooms.', touch: 'Tap HOME to see your house: upgrades, colours and rooms.', when: (c) => 'home' in c.completed, done: (c) => c.events.has('open:home') },
];

/** Seconds a finished step waits before the next tip shows. */
export const TIP_PAUSE = 2.5;

/** Mark every step that is done now (in any order). Returns the ids newly done. */
export function updateTutorial(state: TutorialSave, c: TutorialContext): string[] {
  const fresh: string[] = [];
  for (const s of TUTORIAL_STEPS) {
    if (state.done.includes(s.id) || !s.done(c)) continue;
    state.done.push(s.id);
    fresh.push(s.id);
  }
  return fresh;
}

/** The tip to show now, or null (tips off, everything done, or nothing relevant yet). */
export function currentTip(state: TutorialSave, c: TutorialContext): TutorialStep | null {
  if (state.skipped) return null;
  return TUTORIAL_STEPS.find((s) => !state.done.includes(s.id) && s.when(c)) ?? null;
}

/** How far the tips have come (for the guide). */
export const tutorialProgress = (state: TutorialSave): { done: number; total: number } => ({ done: TUTORIAL_STEPS.filter((s) => state.done.includes(s.id)).length, total: TUTORIAL_STEPS.length });
