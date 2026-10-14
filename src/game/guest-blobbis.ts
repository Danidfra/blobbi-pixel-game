/**
 * M11D.4, BLOBBIS WITH A RESERVED IDENTITY: the public record of every Blobbi met in this game since M11D.4. Each one
 * has a real Nostr owner from its first moment: a guest identity made on this device (its secret sealed in the key
 * vault, never here), or the player's existing account. Its canonical d is the kit's `blobbi-<owner12>-<petId>`, so
 * its V3 look is fixed by (owner, d) from birth and stays the same when it is registered.
 *
 * Record `blobbi-pixel-lab:guest-blobbis`: `{ version: 1, blobbis: [{ owner, ownerKind, petId, d, name, createdAt,
 * bornAt, island, born, activatedAt, named, namingLaterAt, practicedAt }] }` (named and namingLaterAt since M11D.5,
 * practicedAt since M11D.6; older readers ignore them). PUBLIC data only (public keys, d tags, names, times): no
 * secret, ever.
 *
 * M11D.6, PRACTICE IS NOT SHARING: `activatedAt` means the Blobbi's events were published to real relays and read
 * back. A registration rehearsed in practice mode (nothing left the device) sets `practicedAt` instead. Builds before
 * M11D.6 set `activatedAt` after a rehearsal too: such a record is READ as practiced (its time moved to `practicedAt`)
 * unless the activation record holds a LIVE run for it. Nothing is rewritten until the record changes for another
 * reason, and nothing is lost.
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
  /** M11D.6: when its registration was rehearsed in practice mode (nothing published), or null. */
  practicedAt: number | null;
}

/** The activation record's key (`nostr/activation.ts`), read here only to tell a live registration from a rehearsal. */
const ACTIVATION_KEY = 'blobbi-pixel-lab:activation';

/** The Blobbis (d) whose activation record is a LIVE run (published to real relays). */
function liveRuns(store: KeyValueStore): Set<string> {
  try {
    const v = JSON.parse(store.get(ACTIVATION_KEY) ?? 'null') as { runs?: Record<string, { mode?: unknown }> } | null;
    return new Set(Object.entries(v?.runs ?? {}).filter(([, r]) => r?.mode === 'live').map(([d]) => d));
  } catch {
    return new Set();
  }
}

/** Friendly first names for a new Blobbi (the player may rename it before registering). Deterministic per petId. */
const NAMES = ['Pip', 'Mochi', 'Bean', 'Puff', 'Nori', 'Sprout', 'Biscuit', 'Pebble', 'Luma', 'Kiwi', 'Bubble', 'Tofu', 'Momo', 'Pudding', 'Clover', 'Dot'];
export const suggestedName = (petId: string): string => NAMES[parseInt(petId.slice(0, 4), 16) % NAMES.length];

export function readGuestBlobbis(store: KeyValueStore): GuestBlobbi[] {
  try {
    const raw = store.get(GUEST_BLOBBIS_KEY);
    const parsed = raw ? (JSON.parse(raw) as { version?: unknown; blobbis?: unknown }) : null;
    if (parsed?.version !== 1 || !Array.isArray(parsed.blobbis)) return [];
    const live = liveRuns(store);
    return parsed.blobbis.filter((b): b is GuestBlobbi => {
      const g = b as GuestBlobbi;
      return !!g && KEY_HEX.test(g.owner) && PET.test(g.petId) && g.d === `blobbi-${g.owner.slice(0, 12)}-${g.petId}` && (g.ownerKind === 'guest' || g.ownerKind === 'account') && typeof g.name === 'string';
    }).map((g) => ({ owner: g.owner, ownerKind: g.ownerKind, petId: g.petId, d: g.d, name: g.name.slice(0, 24) || suggestedName(g.petId), createdAt: Number(g.createdAt) || 0, bornAt: Number(g.bornAt) || 0, island: typeof g.island === 'string' ? g.island : null, born: g.born === true, ...registration(g, live.has(g.d)), named: wasNamed(g), namingLaterAt: typeof g.namingLaterAt === 'number' ? g.namingLaterAt : null }));
  } catch {
    return [];
  }
}

/** M11D.6: registered only with a live run behind it; a rehearsed one (before M11D.6 too) is practiced. */
function registration(g: GuestBlobbi, live: boolean): { activatedAt: number | null; practicedAt: number | null } {
  const activated = typeof g.activatedAt === 'number' ? g.activatedAt : null;
  const practiced = typeof g.practicedAt === 'number' ? g.practicedAt : null;
  if (activated !== null && !live) return { activatedAt: null, practicedAt: practiced ?? activated };
  return { activatedAt: activated, practicedAt: practiced };
}

function wasNamed(g: GuestBlobbi): boolean {
  const went = typeof g.activatedAt === 'number' || typeof g.practicedAt === 'number';
  if (typeof g.named === 'boolean') return g.named || went;
  return went || (!!g.name && g.name !== suggestedName(g.petId));
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

export function updateGuestBlobbi(store: KeyValueStore, d: string, change: Partial<Pick<GuestBlobbi, 'name' | 'born' | 'activatedAt' | 'island' | 'named' | 'namingLaterAt' | 'practicedAt'>>): GuestBlobbi | null {
  const list = readGuestBlobbis(store);
  const b = list.find((x) => x.d === d);
  if (!b) return null;
  if (change.name !== undefined) b.name = change.name.slice(0, 24) || b.name;
  if (change.born !== undefined) b.born = b.born || change.born;
  if (change.activatedAt !== undefined) b.activatedAt = change.activatedAt;
  if (change.island !== undefined && !b.island) b.island = change.island;
  if (change.named !== undefined) b.named = b.named || change.named;
  if (change.namingLaterAt !== undefined) b.namingLaterAt = change.namingLaterAt;
  if (change.practicedAt !== undefined) b.practicedAt = change.practicedAt;
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
