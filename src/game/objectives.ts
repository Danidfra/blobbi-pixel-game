/**
 * QUESTS (grown from the M4 objectives): the island's main story, side quests, discoveries and repeatable island
 * requests, all defined as data in `content/quests.ts` and evaluated here.
 *
 * Progress is DERIVED FROM PLAY: a tally of what the player actually did (collected, crafted, felled, tilled,
 * planted, watered, harvested, fed, cooked, found...) plus the world itself (an axe in the bag, a finished
 * shelter, decorations placed, the Blobbi's friendship). Looking at the journal never counts.
 *
 * A quest is ACTIVE once every quest it requires is done; it COMPLETES the first time its goal holds while active
 * (so things done early count: a quest whose goal already holds completes the moment it becomes active). Several
 * quests can be active at once, so the player is never forced down one line. A completed quest is stored with
 * its world time in the same save record as the inventory its reward went into: a reward is granted exactly once.
 *
 * ISLAND REQUESTS: once the shelter stands, one small repeatable request at a time; its progress counts from when
 * it began; the next one comes at the following dawn of world time (which only passes while playing). They never
 * expire and missing one costs nothing.
 */
import type { Inventory } from './inventory';
import { BUILDINGS, buildingProgress, houseLevel, type Building, type BuildingKind } from './buildings';
import { QUEST_CONTENT, REQUEST_POOL, type Goal, type QuestContent, type QuestReward, type RequestContent, type TallyKey } from '../content/quests';

/** What the player has done on this island (only the player's own actions count; autonomy never adds here). */
export type Tally = Record<TallyKey, number>;

const TALLY_KEYS: readonly TallyKey[] = ['collected', 'crafted', 'axesCrafted', 'felled', 'mined', 'plots', 'planted', 'watered', 'harvested', 'fed', 'petted', 'built', 'decorations', 'entered', 'furnished', 'stored', 'cooked', 'mealsFed', 'discoveries', 'looked', 'sat', 'played', 'talked', 'flowers', 'shells', 'foraged', 'favourites', 'fished', 'waved'];

export const newTally = (): Tally => Object.fromEntries(TALLY_KEYS.map((k) => [k, 0])) as Tally;

export interface ObjectiveContext {
  tally: Tally;
  inventory: Inventory;
  buildings: readonly Building[];
  worldTime: number;
  /** Discoveries found (ids). */
  found?: ReadonlySet<string>;
  /** The Blobbi's friendship level. */
  friendship?: number;
}

export type Reward = Required<Pick<QuestReward, 'text'>> & { items: NonNullable<QuestReward['items']>; unlocks: NonNullable<QuestReward['unlocks']>; lore: NonNullable<QuestReward['lore']>; friendship: number };

export interface Objective extends Omit<QuestContent, 'reward'> {
  reward: Reward;
  done(ctx: ObjectiveContext): boolean;
  /** "2/5" style progress, when the goal is a count. */
  progress?(ctx: ObjectiveContext): string;
}

const decorationsPlaced = (ctx: ObjectiveContext) => ctx.buildings.filter((b) => BUILDINGS[b.kind]?.category === 'decoration').length;

/** Have / need for a goal (sums the parts of `all`, the best part of `any`). */
export function goalProgress(goal: Goal, ctx: ObjectiveContext): { have: number; need: number } {
  if ('tally' in goal) return { have: Math.min(goal.n, ctx.tally[goal.tally] ?? 0), need: goal.n };
  if ('have' in goal) return { have: Math.min(goal.n ?? 1, ctx.inventory.count(goal.have)), need: goal.n ?? 1 };
  if ('finished' in goal) return { have: Math.min(goal.n ?? 1, ctx.buildings.filter((b) => b.kind === goal.finished && buildingProgress(b, ctx.worldTime) >= 1).length), need: goal.n ?? 1 };
  if ('decorations' in goal) return { have: Math.min(goal.decorations, decorationsPlaced(ctx)), need: goal.decorations };
  if ('found' in goal) return { have: ctx.found?.has(goal.found) ? 1 : 0, need: 1 };
  if ('house' in goal) return { have: Math.min(goal.house, Math.max(0, ...ctx.buildings.filter((b) => b.kind === 'shelter' && buildingProgress(b, ctx.worldTime) >= 1).map((b) => houseLevel(b)))), need: goal.house };
  if ('friendship' in goal) return { have: Math.min(goal.friendship, ctx.friendship ?? 1), need: goal.friendship };
  const list: readonly Goal[] = 'all' in goal ? goal.all : goal.any;
  const parts = list.map((g) => goalProgress(g, ctx));
  if ('all' in goal) return parts.reduce((a, p) => ({ have: a.have + p.have, need: a.need + p.need }), { have: 0, need: 0 });
  return parts.reduce((best, p) => (p.have / p.need > best.have / best.need ? p : best), parts[0]);
}

export function goalDone(goal: Goal, ctx: ObjectiveContext): boolean {
  if ('all' in goal) return goal.all.every((g) => goalDone(g, ctx));
  if ('any' in goal) return goal.any.some((g) => goalDone(g, ctx));
  const p = goalProgress(goal, ctx);
  return p.have >= p.need;
}

const isCount = (goal: Goal) => goalProgress(goal, { tally: newTally(), inventory: { count: () => 0 } as unknown as Inventory, buildings: [], worldTime: 0 }).need > 1;

function toObjective(q: QuestContent): Objective {
  return {
    ...q,
    reward: { items: q.reward.items ?? [], unlocks: q.reward.unlocks ?? [], lore: q.reward.lore ?? [], friendship: q.reward.friendship ?? 0, text: q.reward.text },
    done: (ctx) => goalDone(q.goal, ctx),
    progress: isCount(q.goal)
      ? (ctx) => {
          const p = goalProgress(q.goal, ctx);
          return `${p.have}/${p.need}`;
        }
      : undefined,
  };
}

/** Every quest, in catalogue order (main chapters, then side quests, then discoveries). */
export const QUESTS: readonly Objective[] = QUEST_CONTENT.map(toObjective);
/** The main story, in order (what the goal box follows). */
export const MAIN_QUESTS: readonly Objective[] = QUESTS.filter((q) => q.type === 'main');
/** The ten M4 objectives (kept by id; their rewards are never granted twice). */
export const M4_OBJECTIVE_IDS = ['gather', 'axe', 'wood', 'shelter', 'plot', 'plant', 'water', 'harvest', 'feed', 'improve'] as const;
/** Kept name: the quests the goal box steps through. */
export const OBJECTIVES = MAIN_QUESTS;

export const objectiveById = (id: string): Objective | undefined => QUESTS.find((o) => o.id === id);

export interface ActiveRequest {
  id: string;
  /** The tally value its goal counts from. */
  baseline: number;
  startedAt: number;
}

export interface ObjectiveState {
  /** Completed quest ids, with the world time each was completed. */
  completed: Record<string, number>;
  /** The island request in progress, or null. */
  request?: ActiveRequest | null;
  /** Requests completed so far (picks the next one). */
  requestsDone?: number;
  /** World time from which the next request may start. */
  nextRequestAt?: number;
  /** Journal notes found (in the order they were found). */
  lore?: string[];
}

export const newObjectives = (): ObjectiveState => ({ completed: {}, request: null, requestsDone: 0, nextRequestAt: 0, lore: [] });

const requiresMet = (q: Objective, state: ObjectiveState) => (q.requires ?? []).every((r) => r in state.completed);

/** Quests available now: not done, every prerequisite done. */
export function activeQuests(state: ObjectiveState): Objective[] {
  return QUESTS.filter((q) => !(q.id in state.completed) && requiresMet(q, state));
}

/** The main quest the goal box shows: the first active one in story order, or null when the story is done. */
export function currentObjective(state: ObjectiveState): Objective | null {
  return MAIN_QUESTS.find((q) => !(q.id in state.completed) && requiresMet(q, state)) ?? null;
}

/**
 * Complete what can be completed now: every active quest whose goal holds, repeatedly (a completion can make
 * another quest active). Returns the newly completed quests in order; never returns a quest twice.
 */
export function advanceObjectives(state: ObjectiveState, ctx: ObjectiveContext): Objective[] {
  const done: Objective[] = [];
  for (let changed = true; changed; ) {
    changed = false;
    for (const q of QUESTS) {
      if (q.id in state.completed || !requiresMet(q, state) || !q.done(ctx)) continue;
      state.completed[q.id] = ctx.worldTime;
      done.push(q);
      changed = true;
    }
  }
  return done;
}

/** Building kinds B may build: the shelter always, the M4 decorations once a quest's reward unlocked them. */
export function unlockedKinds(state: ObjectiveState): Set<BuildingKind> {
  const kinds = new Set<BuildingKind>(['shelter']);
  for (const o of QUESTS) if (o.id in state.completed) for (const k of o.reward.unlocks) kinds.add(k);
  return kinds;
}

// ─── Island requests ─────────────────────────────────────────────────────────

export const requestById = (id: string): RequestContent | undefined => REQUEST_POOL.find((r) => r.id === id);

/** Start the next request when it is due (after the shelter, from `nextRequestAt`). Returns it when one started. */
export function startRequest(state: ObjectiveState, tally: Tally, worldTime: number): RequestContent | null {
  if (state.request || !('shelter' in state.completed) || worldTime < (state.nextRequestAt ?? 0)) return null;
  const n = state.requestsDone ?? 0;
  // A stable walk through the pool that does not repeat the same request twice in a row.
  const r = REQUEST_POOL[(n * 3 + 1) % REQUEST_POOL.length];
  state.request = { id: r.id, baseline: tally[r.goal.tally] ?? 0, startedAt: worldTime };
  return r;
}

/** Progress of the active request. */
export function requestProgress(state: ObjectiveState, tally: Tally): { request: RequestContent; have: number; need: number } | null {
  const a = state.request;
  const r = a ? requestById(a.id) : null;
  if (!a || !r) return null;
  return { request: r, have: Math.min(r.goal.n, (tally[r.goal.tally] ?? 0) - a.baseline), need: r.goal.n };
}

/** Finish the active request if its goal is met; `nextDawn` is when the next one may begin. Returns it once. */
export function finishRequest(state: ObjectiveState, tally: Tally, nextDawn: number): RequestContent | null {
  const p = requestProgress(state, tally);
  if (!p || p.have < p.need) return null;
  state.request = null;
  state.requestsDone = (state.requestsDone ?? 0) + 1;
  state.nextRequestAt = nextDawn;
  return p.request;
}

// ─── Saved state ─────────────────────────────────────────────────────────────

/** Read saved quests: only known ids with finite times; a request only if it is known. */
export function objectivesFromSave(raw: unknown): ObjectiveState {
  const state = newObjectives();
  if (!raw || typeof raw !== 'object') return state;
  const r = raw as { completed?: unknown; request?: unknown; requestsDone?: unknown; nextRequestAt?: unknown; lore?: unknown };
  if (r.completed && typeof r.completed === 'object') for (const [id, t] of Object.entries(r.completed)) if (objectiveById(id) && typeof t === 'number' && Number.isFinite(t)) state.completed[id] = t;
  const req = r.request as Partial<ActiveRequest> | null | undefined;
  if (req && typeof req.id === 'string' && requestById(req.id) && Number.isFinite(req.baseline) && Number.isFinite(req.startedAt)) state.request = { id: req.id, baseline: req.baseline!, startedAt: req.startedAt! };
  if (Number.isInteger(r.requestsDone) && (r.requestsDone as number) >= 0) state.requestsDone = r.requestsDone as number;
  if (typeof r.nextRequestAt === 'number' && Number.isFinite(r.nextRequestAt)) state.nextRequestAt = r.nextRequestAt;
  if (Array.isArray(r.lore)) state.lore = [...new Set(r.lore.filter((x): x is string => typeof x === 'string'))];
  return state;
}

/** Read a saved tally: known counters, non-negative integers; the rest zero. */
export function tallyFromSave(raw: unknown): Tally {
  const t = newTally();
  if (!raw || typeof raw !== 'object') return t;
  for (const k of TALLY_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) t[k] = v;
  }
  return t;
}
