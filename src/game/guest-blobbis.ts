/**
 * M11D.4, BLOBBIS WITH A RESERVED IDENTITY: the public record of every Blobbi met in this game since M11D.4. Each one
 * has a real Nostr owner from its first moment: a guest identity made on this device (its secret sealed in the key
 * vault, never here), or the player's existing account. Its canonical d is the kit's `blobbi-<owner12>-<petId>`, so
 * its V3 look is fixed by (owner, d) from birth and stays the same when it is registered.
 *
 * Record `blobbi-pixel-lab:guest-blobbis`: `{ version: 1, blobbis: [{ owner, ownerKind, petId, d, name, createdAt,
 * bornAt, island, born, activatedAt, named, namingLaterAt }] }` (the last two since M11D.5; older readers ignore them). PUBLIC data only (public keys, d tags, names, times): no secret, ever.
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
  /**
   * M11D.5: the player chose its name (after its birth, or while saving it for other worlds). A record from before
   * M11D.5 counts as named when it was registered or its name is not the suggested one (the player renamed it): an
   * existing name is never asked again.
   */
  named: boolean;
  /** M11D.5: when the player last said "later" to the naming question (ms), or null. */
  namingLaterAt: number | null;
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
    }).map((g) => ({ owner: g.owner, ownerKind: g.ownerKind, petId: g.petId, d: g.d, name: g.name.slice(0, 24) || suggestedName(g.petId), createdAt: Number(g.createdAt) || 0, bornAt: Number(g.bornAt) || 0, island: typeof g.island === 'string' ? g.island : null, born: g.born === true, activatedAt: typeof g.activatedAt === 'number' ? g.activatedAt : null, named: wasNamed(g), namingLaterAt: typeof g.namingLaterAt === 'number' ? g.namingLaterAt : null }));
  } catch {
    return [];
  }
}

function wasNamed(g: GuestBlobbi): boolean {
  if (typeof g.named === 'boolean') return g.named || typeof g.activatedAt === 'number';
  return typeof g.activatedAt === 'number' || (!!g.name && g.name !== suggestedName(g.petId));
}

/** M11D.5: a born Blobbi whose name the player has not chosen yet (and can still change: not registered). */
export const awaitsName = (b: GuestBlobbi): boolean => b.born && !b.named && !b.activatedAt;

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

export function updateGuestBlobbi(store: KeyValueStore, d: string, change: Partial<Pick<GuestBlobbi, 'name' | 'born' | 'activatedAt' | 'island' | 'named' | 'namingLaterAt'>>): GuestBlobbi | null {
  const list = readGuestBlobbis(store);
  const b = list.find((x) => x.d === d);
  if (!b) return null;
  if (change.name !== undefined) b.name = change.name.slice(0, 24) || b.name;
  if (change.born !== undefined) b.born = b.born || change.born;
  if (change.activatedAt !== undefined) b.activatedAt = change.activatedAt;
  if (change.island !== undefined && !b.island) b.island = change.island;
  if (change.named !== undefined) b.named = b.named || change.named;
  if (change.namingLaterAt !== undefined) b.namingLaterAt = change.namingLaterAt;
  write(store, list);
  return b;
}

/** A name as the player typed it, made safe to keep and show: no control or invisible characters, one line, 24 max. */
export function cleanBlobbiName(name: string): string {
  return name.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
}

/**
 * M11D.5: the player chose a name for a Blobbi met here (after its birth, or in the account flow). Marks it named.
 * Only until it is registered: then its name is part of its canonical state, changed only in its home apps. The
 * identity, the d tag and the look never change with a name. Returns the record, or null when nothing changed.
 */
export function chooseGuestName(store: KeyValueStore, d: string, name: string): GuestBlobbi | null {
  const clean = cleanBlobbiName(name);
  const b = guestBlobbi(store, d);
  if (!clean || !b || b.activatedAt) return null;
  return updateGuestBlobbi(store, d, { name: clean, named: true });
}

/** An unborn Blobbi whose island could not be made: forgotten (its reserved key stays in the vault, unused). */
export function forgetUnbornGuestBlobbi(store: KeyValueStore, d: string): void {
  const list = readGuestBlobbis(store);
  if (!list.some((b) => b.d === d && !b.born && !b.activatedAt)) return;
  write(store, list.filter((b) => b.d !== d));
}
