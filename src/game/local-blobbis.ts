/**
 * M11D.3, LOCAL BLOBBIS: Blobbis met in Blobbi Pixel itself ("Meet a new Blobbi"), before guest identities exist.
 *
 * A local Blobbi is a seed string `local-blobbi-<16 hex>` drawn with the kit's procedural genome (a `demo`-kind source:
 * the string is the seed), born as a Baby from an egg on the island it was met on. It is PURELY LOCAL: no key, no
 * address, no event; it lives in this browser only, and its look is NOT a canonical V3 look (a canonical look comes
 * from an owner key and a d tag). The 64-bit id is a name, not a secret: it is made with `crypto.getRandomValues` only
 * so two local Blobbis never share a look by chance. When reserved guest identities arrive (see
 * docs/architecture/GUEST-IDENTITY-PLAN.md), a local Blobbi cannot be registered with the same look; the player is told
 * so before anything is promised.
 *
 * Record `blobbi-pixel-lab:local-blobbis`: `{ version: 1, blobbis: [{ id, createdAt, island, born, bornAt }] }`, public,
 * per browser, never part of an island save. `born` turns true when its birth has been seen (or skipped): the egg
 * cinematic plays exactly once for it, and a reload during the birth plays it again rather than losing it.
 */
import type { KeyValueStore } from './persistence';

export const LOCAL_BLOBBIS_KEY = 'blobbi-pixel-lab:local-blobbis';
export const LOCAL_PREFIX = 'local-blobbi-';
const ID = /^local-blobbi-[0-9a-f]{16}$/;

export interface LocalBlobbi {
  id: string;
  createdAt: number;
  /** The island (world identity) it was met on. */
  island: string | null;
  born: boolean;
  bornAt: number | null;
}

export const isLocalBlobbiSeed = (seed: string): boolean => ID.test(seed);

export function readLocalBlobbis(store: KeyValueStore): LocalBlobbi[] {
  try {
    const raw = store.get(LOCAL_BLOBBIS_KEY);
    const parsed = raw ? (JSON.parse(raw) as { version?: unknown; blobbis?: unknown }) : null;
    if (parsed?.version !== 1 || !Array.isArray(parsed.blobbis)) return [];
    return parsed.blobbis
      .filter((b): b is LocalBlobbi => !!b && typeof b === 'object' && typeof (b as LocalBlobbi).id === 'string' && ID.test((b as LocalBlobbi).id))
      .map((b) => ({ id: b.id, createdAt: Number(b.createdAt) || 0, island: typeof b.island === 'string' ? b.island : null, born: b.born === true, bornAt: typeof b.bornAt === 'number' ? b.bornAt : null }));
  } catch {
    return [];
  }
}

function write(store: KeyValueStore, list: LocalBlobbi[]): void {
  store.set(LOCAL_BLOBBIS_KEY, JSON.stringify({ version: 1, blobbis: list }));
}

/** A new local Blobbi (an egg yet to hatch). `random` gives 8 random bytes (tests inject it). */
export function createLocalBlobbi(store: KeyValueStore, island: string | null, now: number, random: () => Uint8Array = () => crypto.getRandomValues(new Uint8Array(8))): LocalBlobbi {
  const list = readLocalBlobbis(store);
  let id = '';
  for (let i = 0; i < 20 && (!id || list.some((b) => b.id === id)); i++) id = LOCAL_PREFIX + Array.from(random(), (v) => v.toString(16).padStart(2, '0')).join('').slice(0, 16);
  const b: LocalBlobbi = { id, createdAt: now, island, born: false, bornAt: null };
  write(store, [...list, b]);
  return b;
}

export function localBlobbi(store: KeyValueStore, id: string): LocalBlobbi | null {
  return readLocalBlobbis(store).find((b) => b.id === id) ?? null;
}

/** Its birth was seen (or skipped): never shown again. */
export function markBorn(store: KeyValueStore, id: string, now: number): void {
  const list = readLocalBlobbis(store);
  const b = list.find((x) => x.id === id);
  if (!b || b.born) return;
  b.born = true;
  b.bornAt = now;
  write(store, list);
}

/** An unborn local Blobbi whose island could not be made: forgotten (nothing refers to it). Born ones are never removed. */
export function forgetLocalBlobbi(store: KeyValueStore, id: string): void {
  const list = readLocalBlobbis(store);
  if (!list.some((b) => b.id === id && !b.born)) return;
  write(store, list.filter((b) => b.id !== id));
}
