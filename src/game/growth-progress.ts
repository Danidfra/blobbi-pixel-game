/**
 * GROWTH PROGRESSION (M7): what the island needs before it can grow to its next stage. Every requirement is a
 * lifetime count or a completed quest, so progress never goes backwards and nothing is lost by waiting; there is
 * no timer and no decay. Reaching the requirements makes the island READY: it grows only when the player chooses
 * (at the Carrier), never by itself and never because of a save migration.
 */
import { GROWTH_STAGES, BIOMES } from '../world/growth';
import type { Tally } from './objectives';

export interface Requirement {
  id: string;
  label: string;
  have: number;
  need: number;
}

export interface GrowthInput {
  stage: number;
  harmony: number;
  tally: Tally;
  completed: Record<string, number>;
  found: number;
  days: number;
  /** Whether this world can grow at all (a turtle on an enlarged shell). */
  possible: boolean;
}

/** What each next stage asks: kept modest (a few play sessions each), drawn from every part of island life. */
const NEEDS: Record<1 | 2 | 3, (t: Tally) => [string, string, number, number][]> = {
  1: (t) => [
    ['care', 'Care for Blobbi (feed or pet)', t.fed + t.petted, 6],
    ['farm', 'Harvest crops', t.harvested, 3],
    ['build', 'Build or decorate', t.built + t.decorations, 3],
  ],
  2: (t) => [
    ['care', 'Care for Blobbi (feed or pet)', t.fed + t.petted, 15],
    ['farm', 'Harvest crops', t.harvested, 10],
    ['build', 'Build or decorate', t.built + t.decorations, 7],
  ],
  3: (t) => [
    ['care', 'Care for Blobbi (feed or pet)', t.fed + t.petted, 30],
    ['farm', 'Harvest crops', t.harvested, 20],
    ['build', 'Build or decorate', t.built + t.decorations, 12],
  ],
};
const HARMONY: Record<1 | 2 | 3, number> = { 1: 15, 2: 35, 3: 55 };
const FINDS: Record<1 | 2 | 3, number> = { 1: 1, 2: 3, 3: 5 };
const QUEST: Record<1 | 2 | 3, [string, string]> = { 1: ['shelter', 'Build a shelter (quest)'], 2: ['home', 'Make it home (quest)'], 3: ['carrier', 'Listen to the Carrier (quest)'] };

export interface GrowthReadiness {
  stage: number;
  /** The next stage, or null at the last. */
  next: 1 | 2 | 3 | null;
  name: string | null;
  requirements: Requirement[];
  /** 0..1 over all requirements (each capped at 1). */
  progress: number;
  ready: boolean;
  /** What the next stage would add. */
  unlocks: string[];
  /** When growth is impossible here, why. */
  blocked: string | null;
}

export function growthReadiness(i: GrowthInput): GrowthReadiness {
  if (!i.possible) return { stage: i.stage, next: null, name: null, requirements: [], progress: 0, ready: false, unlocks: [], blocked: 'This island cannot grow (it has no free shell to grow over).' };
  if (i.stage >= 3) return { stage: i.stage, next: null, name: null, requirements: [], progress: 1, ready: false, unlocks: [], blocked: null };
  const next = (i.stage + 1) as 1 | 2 | 3;
  const [quest, questLabel] = QUEST[next];
  const reqs: Requirement[] = [
    { id: 'harmony', label: 'Island harmony', have: Math.round(i.harmony), need: HARMONY[next] },
    { id: 'quest', label: questLabel, have: quest in i.completed ? 1 : 0, need: 1 },
    ...NEEDS[next](i.tally).map(([id, label, have, need]) => ({ id, label, have, need })),
    { id: 'finds', label: 'Discoveries found', have: i.found, need: FINDS[next] },
  ];
  const progress = reqs.reduce((s, r) => s + Math.min(1, r.have / r.need), 0) / reqs.length;
  const def = GROWTH_STAGES[next - 1];
  return { stage: i.stage, next, name: def.name, requirements: reqs, progress, ready: reqs.every((r) => r.have >= r.need), unlocks: def.regions.map((b) => BIOMES[b].name), blocked: null };
}
