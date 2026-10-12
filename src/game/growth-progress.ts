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
  /** Named places visited. */
  places?: number;
  /** Whether this world can grow at all (a turtle on an enlarged shell). */
  possible: boolean;
}

/**
 * What each next stage asks (M9 rebalance): a combination drawn from every part of island life, growing with each
 * stage — an easy first expansion, a second that needs real progress (the Carrier listened to, some cooking), a third
 * that needs a developed island, and the Sanctuary as a long-term goal (the Dream Home, a deep bond with the
 * Carrier). Every count is a lifetime count: breaks never lose progress, nothing decays.
 */
interface StageNeeds {
  quest: [string, string];
  harmony: number;
  finds: number;
  /** World days the island has lived (they pass only while playing). */
  days: number;
  counts: (t: Tally, places: number) => [string, string, number, number][];
}

const NEEDS: Record<1 | 2 | 3 | 4, StageNeeds> = {
  1: {
    quest: ['home', 'Make it home (quest)'],
    harmony: 15,
    finds: 1,
    days: 2,
    counts: (t) => [
      ['care', 'Care for Blobbi (feed or pet)', t.fed + t.petted, 8],
      ['farm', 'Harvest crops', t.harvested, 4],
      ['craft', 'Craft things', t.crafted, 8],
    ],
  },
  2: {
    quest: ['carrier', 'Listen to the Carrier (quest)'],
    harmony: 30,
    finds: 3,
    days: 4,
    counts: (t) => [
      ['care', 'Care for Blobbi (feed or pet)', t.fed + t.petted, 20],
      ['farm', 'Harvest crops', t.harvested, 12],
      ['cook', 'Cook meals', t.cooked, 3],
      ['build', 'Build or decorate', t.built + t.decorations, 6],
    ],
  },
  3: {
    quest: ['restore', 'Begin restoring the island (quest)'],
    harmony: 45,
    finds: 5,
    days: 7,
    counts: (t, places) => [
      ['care', 'Care for Blobbi (feed or pet)', t.fed + t.petted, 40],
      ['farm', 'Harvest crops', t.harvested, 25],
      ['cook', 'Cook meals', t.cooked, 8],
      ['build', 'Build or decorate', t.built + t.decorations, 12],
      ['explore', 'Places explored', places, 6],
    ],
  },
  4: {
    quest: ['dream-home', 'The dream home (quest)'],
    harmony: 60,
    finds: 8,
    days: 12,
    counts: (t, places) => [
      ['care', 'Care for Blobbi (feed or pet)', t.fed + t.petted, 60],
      ['farm', 'Harvest crops', t.harvested, 40],
      ['cook', 'Cook meals', t.cooked, 15],
      ['carrier', 'Time with the Carrier (listen)', t.talked, 10],
      ['explore', 'Places explored', places, 8],
    ],
  },
};

export interface GrowthReadiness {
  stage: number;
  /** The next stage, or null at the last. */
  next: 1 | 2 | 3 | 4 | null;
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
  if (i.stage >= 4) return { stage: i.stage, next: null, name: null, requirements: [], progress: 1, ready: false, unlocks: [], blocked: null };
  const next = (i.stage + 1) as 1 | 2 | 3 | 4;
  const n = NEEDS[next];
  const reqs: Requirement[] = [
    { id: 'quest', label: n.quest[1], have: n.quest[0] in i.completed ? 1 : 0, need: 1 },
    { id: 'harmony', label: 'Island harmony', have: Math.round(i.harmony), need: n.harmony },
    ...n.counts(i.tally, i.places ?? 0).map(([id, label, have, need]) => ({ id, label, have, need })),
    { id: 'finds', label: 'Discoveries found', have: i.found, need: n.finds },
    { id: 'days', label: 'Days on the island', have: i.days, need: n.days },
  ];
  const progress = reqs.reduce((s, r) => s + Math.min(1, r.have / r.need), 0) / reqs.length;
  const def = GROWTH_STAGES[next - 1];
  return { stage: i.stage, next, name: def.name, requirements: reqs, progress, ready: reqs.every((r) => r.have >= r.need), unlocks: def.regions.map((b) => BIOMES[b].name), blocked: null };
}
