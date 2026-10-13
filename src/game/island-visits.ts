/**
 * M11D.3, VISITS: which Blobbis have already come to which island on this device, and who came last. A first visit
 * of a Blobbi to an island plays the full arrival (about 6 seconds); later visits a shorter one (about 3 seconds).
 * The last visitor names the island's card on the title ("Associated Blobbi"). Purely local presentation memory:
 * never published, never part of an island save; an island is never "owned" by a Blobbi, and a Blobbi may visit any
 * number of islands. A damaged record reads as empty (a visit then just counts as a first one again).
 *
 * Record `blobbi-pixel-lab:island-visits`: `{ version: 1, islands: { <world identity>: { seen: [<Blobbi seed>],
 * last: { seed, name, stage } } } }`.
 */
import type { KeyValueStore } from './persistence';

export const ISLAND_VISITS_KEY = 'blobbi-pixel-lab:island-visits';
const MAX_SEEN = 40;

export interface IslandVisitor {
  seed: string;
  name: string | null;
  stage: 'adult' | 'baby';
}

interface Visits {
  seen: string[];
  last: IslandVisitor | null;
}

function readAll(store: KeyValueStore): Record<string, Visits> {
  try {
    const raw = store.get(ISLAND_VISITS_KEY);
    const parsed = raw ? (JSON.parse(raw) as { version?: unknown; islands?: unknown }) : null;
    if (parsed?.version !== 1 || !parsed.islands || typeof parsed.islands !== 'object') return {};
    const out: Record<string, Visits> = {};
    for (const [k, v] of Object.entries(parsed.islands as Record<string, Partial<Visits>>)) {
      const seen = Array.isArray(v?.seen) ? v.seen.filter((s): s is string => typeof s === 'string') : [];
      const l = v?.last as Partial<IslandVisitor> | null | undefined;
      const last = l && typeof l.seed === 'string' ? { seed: l.seed, name: typeof l.name === 'string' ? l.name.slice(0, 24) : null, stage: l.stage === 'baby' ? ('baby' as const) : ('adult' as const) } : null;
      out[k] = { seen, last };
    }
    return out;
  } catch {
    return {};
  }
}

/** Whether this Blobbi has come to this island before (on this device). */
export function visitedBefore(store: KeyValueStore, island: string, seed: string): boolean {
  return readAll(store)[island]?.seen.includes(seed) ?? false;
}

/** Remember a visit (idempotent for the seen list; the last visitor updated). */
export function recordVisit(store: KeyValueStore, island: string, visitor: IslandVisitor): void {
  const all = readAll(store);
  const v = all[island] ?? { seen: [], last: null };
  v.seen = [...v.seen.filter((s) => s !== visitor.seed), visitor.seed].slice(-MAX_SEEN);
  v.last = visitor;
  all[island] = v;
  try {
    store.set(ISLAND_VISITS_KEY, JSON.stringify({ version: 1, islands: all }));
  } catch {
    /* not stored: the next visit is simply a first one again */
  }
}

/** The last Blobbi seen on an island (for its card), or null. */
export function lastVisitor(store: KeyValueStore, island: string): IslandVisitor | null {
  return readAll(store)[island]?.last ?? null;
}
