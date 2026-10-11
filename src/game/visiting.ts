/**
 * VISITING ANOTHER WORLD (M7, local prototype): a Blobbi leaves its home island, travels, and arrives on another
 * island as a visitor, then comes home. No networking: the other worlds are this browser's own saved worlds, read
 * through a transport interface a future network layer can implement the same way.
 *
 * The pieces are kept apart on purpose (docs/architecture/NOSTR-MULTIPLAYER.md):
 *   WorldRef        which world: its identity (the generation inputs) — never who is in it
 *   PlayerId        who is playing: a local id today, a Nostr pubkey later
 *   Blobbi          the visitor's Blobbi identity (BlobbiSource): travels unchanged
 *   ownership       a world's owner: the player whose save it is
 *   VisitorPermissions what a visitor may do there (read-only by default)
 *   VisitTransport  how worlds are found and read (local storage today)
 *   persistence     the host's save is read, never written; the visitor's home save is written only at home
 *
 * The session is a small state machine with the teleport as its handoff: the world switches only while the Blobbi
 * is absent, so it is never seen in two places, and a reload at any point comes back home (the visit is never saved).
 */
import { parseIdentity, worldName, type WorldParams } from './worlds';
import type { KeyValueStore } from './persistence';

export type PlayerId = string;

export interface WorldRef {
  identity: string;
  params: WorldParams;
  name: string;
  /** The world's owner (a player id); `null` when unknown. */
  owner: PlayerId | null;
}

/** What a visitor may do on someone else's island. Read-only by default: look, walk, listen, read. */
export interface VisitorPermissions {
  gather: boolean;
  farm: boolean;
  build: boolean;
  /** Use or change the host's bag, chests, kitchen and workbench. */
  inventory: boolean;
  /** Feed the host's Blobbi or change the host's world state in any lasting way. */
  care: boolean;
}

export const READ_ONLY: VisitorPermissions = { gather: false, farm: false, build: false, inventory: false, care: false };
export const OWNER: VisitorPermissions = { gather: true, farm: true, build: true, inventory: true, care: true };

/** Reads worlds for visiting. A network transport would implement the same two calls. */
export interface VisitTransport {
  /** Worlds that can be visited (not including the one the player is on). */
  list(): WorldRef[];
  /** A read-only store holding the world's save (or nothing): the visitor's LiveWorld reads it and cannot write it. */
  open(ref: WorldRef): KeyValueStore;
}

/** A store that can be read but never written: every write or removal is ignored (and counted, for tests). */
export function readOnlyStore(inner: { get(k: string): string | null }): KeyValueStore & { attemptedWrites: number } {
  const s = {
    attemptedWrites: 0,
    get: (k: string) => inner.get(k),
    set: () => {
      s.attemptedWrites++;
    },
    remove: () => {
      s.attemptedWrites++;
    },
  };
  return s;
}

export const SAVE_PREFIX = 'blobbi-pixel-lab:save:v1:';
export const PLAYER_KEY = 'blobbi-pixel-lab:player';
export const OWNERS_KEY = 'blobbi-pixel-lab:owners';

/** The local player's id: made once per browser (`local:<random>`), never derived from a Blobbi. */
export function localPlayerId(get: (k: string) => string | null, set: (k: string, v: string) => void, random: () => string): PlayerId {
  const have = get(PLAYER_KEY);
  if (have && /^local:[\w-]+$/.test(have)) return have;
  const id = `local:${random()}`;
  set(PLAYER_KEY, id);
  return id;
}

/** Saved worlds in a browser's storage, as visitable refs (owners from the owners index; unknown ones are null). */
export class LocalVisitTransport implements VisitTransport {
  constructor(
    private readonly keys: () => readonly string[],
    private readonly get: (k: string) => string | null,
    private readonly exclude: () => string | null,
  ) {}

  list(): WorldRef[] {
    let owners: Record<string, string> = {};
    try {
      owners = JSON.parse(this.get(OWNERS_KEY) ?? '{}') ?? {};
    } catch {
      owners = {};
    }
    const out: WorldRef[] = [];
    for (const k of this.keys()) {
      if (!k.startsWith(SAVE_PREFIX)) continue;
      const identity = k.slice(SAVE_PREFIX.length);
      if (identity === this.exclude()) continue;
      const params = parseIdentity(identity);
      if (!params || params.kind === 'island') continue;
      out.push({ identity, params, name: worldName(identity), owner: owners[identity] ?? null });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name) || (a.identity < b.identity ? -1 : 1));
  }

  open(_ref: WorldRef): KeyValueStore {
    return readOnlyStore({ get: this.get });
  }
}

export type VisitPhase = 'home' | 'departing' | 'visiting' | 'returning';

/**
 * The visit, step by step. The playground drives it: `go` starts the departure at home; when the Blobbi is gone
 * (`absent`), `arrive` switches to the host world (built read-only) and the Blobbi teleports in; `goHome` starts the
 * departure from the host; when gone, `arriveHome` switches back. Each step checks the previous one, so no switch can
 * happen while the Blobbi is still visible or half way.
 */
export class VisitSession {
  phase: VisitPhase = 'home';
  target: WorldRef | null = null;
  /** Where the Blobbi stood at home when it left (it comes back to the same spot). */
  homeSpot: { x: number; y: number } | null = null;

  go(target: WorldRef, homeSpot: { x: number; y: number }): boolean {
    if (this.phase !== 'home') return false;
    this.phase = 'departing';
    this.target = target;
    this.homeSpot = homeSpot;
    return true;
  }

  /** The Blobbi has left home: the world may switch to the host (as a visitor). */
  arrive(presence: string): boolean {
    if (this.phase !== 'departing' || presence !== 'absent') return false;
    this.phase = 'visiting';
    return true;
  }

  goHome(): boolean {
    if (this.phase !== 'visiting') return false;
    this.phase = 'returning';
    return true;
  }

  /** The Blobbi has left the host: switch home. */
  arriveHome(presence: string): boolean {
    if (this.phase !== 'returning' || presence !== 'absent') return false;
    this.phase = 'home';
    this.target = null;
    return true;
  }

  /** Recovery: whatever happened, be home (used if the departure is cancelled before leaving). */
  abort(): void {
    if (this.phase === 'departing') {
      this.phase = 'home';
      this.target = null;
    }
  }

  get visiting(): boolean {
    return this.phase === 'visiting' || this.phase === 'returning';
  }
}
