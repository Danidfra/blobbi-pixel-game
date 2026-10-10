/**
 * LOCAL PERSISTENCE of what the player did to a world: which resource nodes were collected and what the
 * inventory holds. One versioned record per world identity, in any key-value store (the browser's
 * localStorage in the playground, a Map in tests). A record whose version this code does not know is
 * ignored, never half-read. Nothing here talks to Nostr; the record is the local state a future Nostr
 * layer would publish from.
 */
import type { InventorySnapshot } from './inventory';
import type { WorldDescription } from '../world/types';

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const SAVE_VERSION = 1;
const PREFIX = 'blobbi-pixel-lab:save';

export interface WorldSave {
  version: typeof SAVE_VERSION;
  /** The world identity the record belongs to (also part of the key, repeated here as a guard). */
  world: string;
  /** Ids of the resource nodes the player collected. */
  collected: string[];
  inventory: InventorySnapshot;
}

/** Everything that decides which world this is: seed, kind, turtle, shell variant, canvas and scale. */
export function worldIdentity(world: WorldDescription): string {
  const o = world.options;
  const turtle = o.kind === 'turtle' ? `|turtle=${world.carrier?.seed ?? o.turtleSeed ?? world.seed}|variant=${world.carrier?.variant ?? o.shellVariant ?? 0}` : '';
  return `seed=${world.seed}|kind=${o.kind}${turtle}|${o.width}x${o.height}|scale=${o.scale}|palette=${o.palette}|density=${o.density}|islands=${o.islands}`;
}

export function saveKey(identity: string): string {
  return `${PREFIX}:v${SAVE_VERSION}:${identity}`;
}

export function loadSave(store: KeyValueStore, identity: string): WorldSave | null {
  const raw = store.get(saveKey(identity));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WorldSave>;
    if (parsed.version !== SAVE_VERSION || parsed.world !== identity) return null;
    if (!Array.isArray(parsed.collected) || !parsed.inventory || parsed.inventory.version !== 1) return null;
    return { version: SAVE_VERSION, world: identity, collected: parsed.collected.filter((id) => typeof id === 'string'), inventory: parsed.inventory };
  } catch {
    return null;
  }
}

export function storeSave(store: KeyValueStore, save: WorldSave): void {
  store.set(saveKey(save.world), JSON.stringify(save));
}

export function clearSave(store: KeyValueStore, identity: string): void {
  store.remove(saveKey(identity));
}

/** An in-memory store (tests, headless scripts). */
export function memoryStore(initial?: Record<string, string>): KeyValueStore & { readonly data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k) };
}

/** The browser's localStorage, or null where it is unavailable (private mode, headless). */
export function localStore(): KeyValueStore | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    return { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v), remove: (k) => ls.removeItem(k) };
  } catch {
    return null;
  }
}
