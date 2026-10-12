/**
 * SAVED WORLDS: the islands this browser has played, for the title screen's world selection. Read-only over the
 * saves: it lists save records by their keys, parses the world identity back into generation options, and
 * summarises each (day, quests done, buildings). Opening a world regenerates it from those options and loads its
 * save as always; nothing here ever writes, renames or deletes a save.
 *
 * A small separate index (`blobbi-pixel-lab:worlds`) remembers when each world was last played, so CONTINUE picks
 * the most recent one. Losing the index loses only that ordering.
 */
import { saveKey } from './persistence';
import { dayAt } from './daylight';
import { sanitizeIslandName, worldName } from './island-name';

export const SAVE_PREFIX = 'blobbi-pixel-lab:save:v1:';
export const WORLD_INDEX_KEY = 'blobbi-pixel-lab:worlds';

export interface WorldParams {
  seed: string;
  kind: 'island' | 'turtle' | 'manta' | 'whale';
  turtleSeed?: string;
  /** A creature carrier's seed (manta and whale worlds). */
  carrierSeed?: string;
  shellVariant?: number;
  width: number;
  height: number;
  scale: number;
  palette: string;
  density: number;
  islands: number | 'auto';
  /** `false` for an M8 world made without the generated cottage (identity `|house=none`); absent before. */
  generatedHouse?: false;
}

export interface WorldEntry {
  identity: string;
  params: WorldParams;
  /** A friendly, stable name made from the identity. */
  name: string;
  day: number;
  quests: number;
  buildings: number;
  /** Real time last played (ms), from the index; 0 when unknown. */
  lastPlayed: number;
}

/** Parse a world identity (see `worldIdentity`) back into options; null when it is not one. */
export function parseIdentity(identity: string): WorldParams | null {
  const fields = new Map<string, string>();
  let size: [number, number] | null = null;
  for (const part of identity.split('|')) {
    const m = /^(\d+)x(\d+)$/.exec(part);
    if (m) size = [Number(m[1]), Number(m[2])];
    const eq = part.indexOf('=');
    if (eq > 0) fields.set(part.slice(0, eq), part.slice(eq + 1));
  }
  const kind = fields.get('kind');
  const seed = fields.get('seed');
  if (!seed || (kind !== 'island' && kind !== 'turtle' && kind !== 'manta' && kind !== 'whale') || !size) return null;
  const num = (k: string) => Number(fields.get(k));
  if (![num('scale'), num('density')].every(Number.isFinite)) return null;
  const islands = fields.get('islands');
  return {
    seed,
    kind,
    ...(kind === 'turtle' ? { turtleSeed: fields.get('turtle') ?? seed, shellVariant: Number(fields.get('variant') ?? 0) } : {}),
    ...(kind === 'manta' || kind === 'whale' ? { carrierSeed: fields.get('carrier') ?? seed } : {}),
    width: size[0],
    height: size[1],
    scale: num('scale'),
    palette: fields.get('palette') ?? 'cozy',
    density: num('density'),
    islands: islands === 'auto' || islands === undefined ? 'auto' : Number(islands),
    ...(fields.get('house') === 'none' ? { generatedHouse: false as const } : {}),
  };
}

/** A stable friendly name for a world ("Mossy Cove"); kept in `island-name.ts` with the player's own names. */
export { worldName } from './island-name';

/** The last-played index (identity → ms). */
export function readIndex(get: (k: string) => string | null): Record<string, number> {
  try {
    const raw = JSON.parse(get(WORLD_INDEX_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? (raw as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** The index with `identity` played at `now` (the caller stores it). */
export function touchIndex(index: Record<string, number>, identity: string, now: number): Record<string, number> {
  return { ...index, [identity]: now };
}

/** Every saved world in the store, most recently played first. Malformed records are skipped, never touched. */
export function listWorlds(keys: readonly string[], get: (k: string) => string | null): WorldEntry[] {
  const index = readIndex(get);
  const out: WorldEntry[] = [];
  for (const key of keys) {
    if (!key.startsWith(SAVE_PREFIX)) continue;
    const identity = key.slice(SAVE_PREFIX.length);
    const params = parseIdentity(identity);
    if (!params) continue;
    let save: { worldTime?: unknown; objectives?: { completed?: Record<string, unknown> }; buildings?: unknown[]; name?: unknown } | null = null;
    try {
      save = JSON.parse(get(key) ?? 'null');
    } catch {
      continue;
    }
    if (!save || typeof save !== 'object') continue;
    const t = typeof save.worldTime === 'number' && Number.isFinite(save.worldTime) ? save.worldTime : 0;
    out.push({
      identity,
      params,
      name: sanitizeIslandName(save.name) || worldName(identity),
      day: dayAt(t),
      quests: Object.keys(save.objectives?.completed ?? {}).length,
      buildings: Array.isArray(save.buildings) ? save.buildings.length : 0,
      lastPlayed: index[identity] ?? 0,
    });
  }
  return out.sort((a, b) => b.lastPlayed - a.lastPlayed || a.name.localeCompare(b.name));
}

/** Whether a world identity has a save. */
export const hasSave = (identity: string, get: (k: string) => string | null) => get(saveKey(identity)) !== null;

/**
 * Seeds for a brand-new world that has no save yet: a new world never reuses (and so never overwrites) an existing
 * world's save. `random` gives fresh text each call; `taken` says whether an identity already has a save.
 */
export function newWorldSeeds(random: () => string, identityOf: (seed: string, turtleSeed: string) => string, taken: (identity: string) => boolean): { seed: string; turtleSeed: string } {
  for (let i = 0; i < 50; i++) {
    const seed = `island-${random()}`;
    const turtleSeed = `turtle-${random()}`;
    if (!taken(identityOf(seed, turtleSeed))) return { seed, turtleSeed };
  }
  throw new Error('could not find a free world seed');
}

/**
 * The requested frame size that reproduces a saved world exactly. An enlarged shell (variants 1-3) embeds the
 * island in a bigger frame, so the identity records the final size, not the size that was asked for; try the
 * likely requests and keep the one whose regenerated identity matches. Null when none does (the caller then
 * refuses to open it rather than starting a different world under a near-identical name).
 */
export function resolveFrame(target: string, candidates: readonly { width: number; height: number }[], identityFor: (size: { width: number; height: number }) => string): { width: number; height: number } | null {
  const seen = new Set<string>();
  for (const c of candidates) {
    const key = `${c.width}x${c.height}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (identityFor(c) === target) return c;
  }
  return null;
}
