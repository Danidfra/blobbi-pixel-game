/**
 * HOME STYLES (M8) as data: which roof colours, wall materials, doors, windows, floors, wall colours and wall finishes
 * the player can choose, and what unlocks each one. The first option of every part is always open; the rest come
 * from playing: quests, discoveries, mining, the island's growth and the house's own level. Nothing is bought.
 *
 * Unlocks are DERIVED from the save (completed quests, finds, the tally, the growth stage, the house level), so
 * nothing extra is stored and an older save shows every option it has already earned.
 */
import { ROOF_COLOURS, WALL_MATERIALS, DOOR_STYLES, WINDOW_STYLES } from '../game/house-art';
import { FLOOR_NAMES, WALL_NAMES, FINISH_NAMES } from '../game/interior';

export type StylePart = 'roof' | 'wall' | 'door' | 'window' | 'floor' | 'wallColour' | 'finish';

export type Unlock =
  | { always: true }
  | { quest: string; label: string }
  | { finds: number }
  | { tally: 'mined' | 'flowers' | 'cooked' | 'crafted' | 'collected' | 'felled' | 'harvested' | 'foraged'; n: number; label: string }
  | { houseLevel: number }
  | { growth: number };

export interface UnlockContext {
  completed: Readonly<Record<string, number>>;
  found: number;
  tally: Readonly<Record<string, number>>;
  growthStage: number;
  houseLevel: number;
}

const always: Unlock = { always: true };
const quest = (id: string, label: string): Unlock => ({ quest: id, label });
const did = (tally: 'mined' | 'flowers' | 'cooked' | 'crafted' | 'collected' | 'felled' | 'harvested' | 'foraged', n: number, label: string): Unlock => ({ tally, n, label });

/**
 * Every option of every part, in order, with what unlocks it. Index 0 is the default and always open; everything
 * else is earned (M9: a small start, then quests, discoveries, crafting, gathering, farming, growth and the house).
 */
export const STYLE_OPTIONS: Readonly<Record<StylePart, readonly { name: string; unlock: Unlock }[]>> = {
  roof: ROOF_COLOURS.map((r, i) => ({ name: r.name, unlock: [always, quest('shelter', 'Build your first home'), { houseLevel: 2 }, { finds: 2 }, { growth: 2 }, did('collected', 40, 'pick up 40 things')][i] as Unlock })),
  wall: WALL_MATERIALS.map((r, i) => ({ name: r.name, unlock: [always, did('crafted', 5, 'craft 5 things'), did('felled', 10, 'fell 10 trees'), did('mined', 3, 'break 3 large rocks'), quest('side-flowers', 'Flower friend'), { growth: 1 }][i] as Unlock })),
  door: DOOR_STYLES.map((name, i) => ({ name, unlock: [always, quest('enter-home', 'Step inside'), { houseLevel: 2 }, { houseLevel: 3 }][i] as Unlock })),
  window: WINDOW_STYLES.map((name, i) => ({ name, unlock: [always, quest('mystery', 'Something that hums'), quest('home', 'Make it home'), did('flowers', 3, 'grow 3 flowers')][i] as Unlock })),
  floor: FLOOR_NAMES.map((name, i) => ({ name, unlock: [always, quest('first-furniture', 'Make it yours'), did('crafted', 10, 'craft 10 things'), did('mined', 1, 'break a large rock'), quest('cook', 'A warm meal'), quest('side-cozy', 'Cozy corner')][i] as Unlock })),
  wallColour: WALL_NAMES.map((name, i) => ({ name, unlock: [always, quest('home', 'Make it home'), did('harvested', 3, 'harvest 3 crops'), did('flowers', 3, 'grow 3 flowers'), { finds: 3 }, quest('restore', 'Begin restoring the island')][i] as Unlock })),
  finish: FINISH_NAMES.map((name, i) => ({ name, unlock: [always, { houseLevel: 2 }, did('crafted', 15, 'craft 15 things'), quest('restore', 'Begin restoring the island'), { houseLevel: 3 }][i] as Unlock })),
};

export function isUnlocked(u: Unlock, ctx: UnlockContext): boolean {
  if ('always' in u) return true;
  if ('quest' in u) return u.quest in ctx.completed;
  if ('finds' in u) return ctx.found >= u.finds;
  if ('tally' in u) return (ctx.tally[u.tally] ?? 0) >= u.n;
  if ('houseLevel' in u) return ctx.houseLevel >= u.houseLevel;
  return ctx.growthStage >= u.growth;
}

/** How to unlock an option, in a few words ("quest: A bigger home"). */
export function unlockHint(u: Unlock): string {
  if ('always' in u) return '';
  if ('quest' in u) return `quest: ${u.label}`;
  if ('finds' in u) return `find ${u.finds} discoveries`;
  if ('tally' in u) return u.label;
  if ('houseLevel' in u) return u.houseLevel === 3 ? 'upgrade to a Dream Home' : 'upgrade to a Cottage';
  return `grow the island to stage ${u.growth}`;
}

export const optionUnlocked = (part: StylePart, index: number, ctx: UnlockContext): boolean => {
  const o = STYLE_OPTIONS[part][index];
  return !!o && isUnlocked(o.unlock, ctx);
};

/** How many options of all parts are open (the HOME panel shows it). */
export function unlockedCount(ctx: UnlockContext): { open: number; total: number } {
  let open = 0;
  let total = 0;
  for (const part of Object.keys(STYLE_OPTIONS) as StylePart[])
    for (const o of STYLE_OPTIONS[part]) {
      total++;
      if (isUnlocked(o.unlock, ctx)) open++;
    }
  return { open, total };
}

/** Every option open in a context, as `part:index` keys (to notice new ones). */
export function unlockedKeys(ctx: UnlockContext): Set<string> {
  const out = new Set<string>();
  for (const part of Object.keys(STYLE_OPTIONS) as StylePart[]) STYLE_OPTIONS[part].forEach((o, i) => isUnlocked(o.unlock, ctx) && out.add(`${part}:${i}`));
  return out;
}

/** What a part is called on screen. */
export const PART_NAMES: Readonly<Record<StylePart, string>> = { roof: 'roof', wall: 'walls', door: 'door', window: 'windows', floor: 'floor', wallColour: 'wall colour', finish: 'wall finish' };
