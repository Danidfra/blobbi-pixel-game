/**
 * M11D.4, BLOBBIS WITH A RESERVED IDENTITY: the public record of every Blobbi met in this game since M11D.4. Each one
 * has a real Nostr owner from its first moment: a guest identity made on this device (its secret sealed in the key
 * vault, never here), or the player's existing account. Its canonical d is the kit's `blobbi-<owner12>-<petId>`, so
 * its V3 look is fixed by (owner, d) from birth and stays the same when it is registered.
 *
 * Record `blobbi-pixel-lab:guest-blobbis`: `{ version: 1, blobbis: [{ owner, ownerKind, petId, d, name, createdAt,
 * bornAt, island, born, activatedAt }] }`. PUBLIC data only (public keys, d tags, names, times): no secret, ever.
 * Never part of an island save; an island never belongs to a Blobbi. Records are never deleted by the game: an
 * activated Blobbi keeps its record (marked `activatedAt`), so nothing is lost if an activation is undone or retried.
 */
import type { KeyValueStore } from './persistence';

export const GUEST_BLOBBIS_KEY = 'blobbi-pixel-lab:guest-blobbis';
const KEY_HEX = /^[0-9a-f]{64}$/;
const PET = /^[0-9a-f]{10}$/;

export interface GuestBlobbi {
  /** The owner's public key: a reserved guest identity, or an existing account. */
  owner: string;
  ownerKind: 'guest' | 'account';
  petId: string;
  /** The kit's canonical d: `blobbi-<owner12>-<petId>`. */
  d: string;
  name: string;
  createdAt: number;
  /** When it was born (seconds; the 31124 egg time). */
  bornAt: number;
  /** The island it was met on (world identity). */
  island: string | null;
  /** Its birth (the egg cinematic) has been seen. */
  born: boolean;
  /** When it was registered (its canonical events published and confirmed), or null. */
  activatedAt: number | null;
}

/** Friendly first names for a new Blobbi (the player may rename it before registering). Deterministic per petId. */
const NAMES = ['Pip', 'Mochi', 'Bean', 'Puff', 'Nori', 'Sprout', 'Biscuit', 'Pebble', 'Luma', 'Kiwi', 'Bubble', 'Tofu', 'Momo', 'Pudding', 'Clover', 'Dot'];
export const suggestedName = (petId: string): string => NAMES[parseInt(petId.slice(0, 4), 16) % NAMES.length];

export function readGuestBlobbis(store: KeyValueStore): GuestBlobbi[] {
  try {
    const raw = store.get(GUEST_BLOBBIS_KEY);
    const parsed = raw ? (JSON.parse(raw) as { version?: unknown; blobbis?: unknown }) : null;
    if (parsed?.version !== 1 || !Array.isArray(parsed.blobbis)) return [];
    return parsed.blobbis.filter((b): b is GuestBlobbi => {
      const g = b as GuestBlobbi;
      return !!g && KEY_HEX.test(g.owner) && PET.test(g.petId) && g.d === `blobbi-${g.owner.slice(0, 12)}-${g.petId}` && (g.ownerKind === 'guest' || g.ownerKind === 'account') && typeof g.name === 'string';
    }).map((g) => ({ owner: g.owner, ownerKind: g.ownerKind, petId: g.petId, d: g.d, name: g.name.slice(0, 24) || suggestedName(g.petId), createdAt: Number(g.createdAt) || 0, bornAt: Number(g.bornAt) || 0, island: typeof g.island === 'string' ? g.island : null, born: g.born === true, activatedAt: typeof g.activatedAt === 'number' ? g.activatedAt : null }));
  } catch {
    return [];
  }
}

function write(store: KeyValueStore, list: GuestBlobbi[]): void {
  store.set(GUEST_BLOBBIS_KEY, JSON.stringify({ version: 1, blobbis: list }));
}

/** Add a Blobbi (never replacing one with the same d: an existing record wins). Returns the stored record. */
export function addGuestBlobbi(store: KeyValueStore, b: GuestBlobbi): GuestBlobbi {
  const list = readGuestBlobbis(store);
  const known = list.find((x) => x.d === b.d);
  if (known) return known;
  write(store, [...list, b]);
  return b;
}

export function guestBlobbi(store: KeyValueStore, d: string): GuestBlobbi | null {
  return readGuestBlobbis(store).find((b) => b.d === d) ?? null;
}

export function updateGuestBlobbi(store: KeyValueStore, d: string, change: Partial<Pick<GuestBlobbi, 'name' | 'born' | 'activatedAt' | 'island'>>): GuestBlobbi | null {
  const list = readGuestBlobbis(store);
  const b = list.find((x) => x.d === d);
  if (!b) return null;
  if (change.name !== undefined) b.name = change.name.slice(0, 24) || b.name;
  if (change.born !== undefined) b.born = b.born || change.born;
  if (change.activatedAt !== undefined) b.activatedAt = change.activatedAt;
  if (change.island !== undefined && !b.island) b.island = change.island;
  write(store, list);
  return b;
}

/** An unborn Blobbi whose island could not be made: forgotten (its reserved key stays in the vault, unused). */
export function forgetUnbornGuestBlobbi(store: KeyValueStore, d: string): void {
  const list = readGuestBlobbis(store);
  if (!list.some((b) => b.d === d && !b.born && !b.activatedAt)) return;
  write(store, list.filter((b) => b.d !== d));
}
