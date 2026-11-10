/**
 * SHARED BLOBBI CARE, READ ONLY (canonical care integration, phase 6): the five care stats the Blobbi apps share
 * through the Blobbi's canonical state event (kind 31124: hunger, happiness, health, hygiene, energy), as read from
 * the relays for the Blobbi walking here, kept for the Blobbi panel. This game never publishes or changes them
 * (see docs/architecture/CANONICAL-CARE.md); its own needs (`care.ts`) are the island's and stay what they were.
 *
 * This module knows nothing of relays or of the kit: it keeps the last answer per Blobbi address, asks the reader
 * it was given (`src/nostr/canonical-care.ts`, loaded by the host only when needed), drops an answer that comes
 * back for a Blobbi the player has since switched away from, and never invents a value: a demo or seed-only
 * Blobbi has no shared stats ("none"), a Blobbi no relay answered for is "unavailable", one the relays do not hold
 * is "missing".
 */
import type { BlobbiSource } from '../blobbi/source';

export interface SharedStats {
  hunger: number;
  happiness: number;
  health: number;
  hygiene: number;
  energy: number;
}

/** The shared care as read: the event's own values, and the kit's decay projection of them at a moment. */
export interface SharedCare {
  pubkey: string;
  d: string;
  name: string;
  stage: 'egg' | 'baby' | 'adult';
  /** The activity state the apps keep (sleeping decays slower). */
  state: 'active' | 'sleeping' | 'hibernating';
  /** The stats as the event states them (1..100; a missing one is null, never guessed). */
  stats: Partial<SharedStats>;
  /** The decay checkpoint (unix seconds), or null when the event has none. */
  lastDecayAt: number | null;
  lastInteraction: number;
  /** The event's created_at (seconds) and id. */
  createdAt: number;
  eventId: string;
  /** The stats as they stand at `nowSec` by the kit's own decay (what Home shows; nothing is written). */
  project(nowSec: number): SharedStats;
}

export type SharedCareRead =
  | { status: 'ready'; care: SharedCare; /** Some relays did not answer: a newer state may exist. */ partial: boolean }
  /** Relays answered and none holds a state for this Blobbi. */
  | { status: 'missing'; partial: boolean }
  /** No relay answered (offline, or too slow). */
  | { status: 'unavailable' };

export type SharedCareStatus = 'none' | 'loading' | 'ready' | 'missing' | 'unavailable';

export interface SharedCareSnapshot {
  status: SharedCareStatus;
  /** `31124:<pubkey>:<d>` of the Blobbi the snapshot is about, or null for one with no shared state. */
  address: string | null;
  /** The last state read (kept while a new read is under way, and when the relays stop answering). */
  care: SharedCare | null;
  partial: boolean;
  /** When `care` was read (ms), or null. */
  fetchedAt: number | null;
}

export interface SharedCareDeps {
  read: (pubkey: string, d: string) => Promise<SharedCareRead>;
  /** Milliseconds now (tests pass their own). */
  now?: () => number;
  /** A state read within this long is not read again unless forced (ms). */
  maxAgeMs?: number;
}

/** The Blobbi's canonical address, when it has one: a V3 by address, or a V1/V2 in its world form. */
export function sharedAddressOf(source: BlobbiSource): { pubkey: string; d: string } | null {
  return source.kind === 'v3-address' || source.kind === 'world-form' ? { pubkey: source.pubkey, d: source.d } : null;
}

export class SharedCareService {
  private state: SharedCareSnapshot = { status: 'none', address: null, care: null, partial: false, fetchedAt: null };
  private seq = 0;
  private readonly now: () => number;
  private readonly maxAgeMs: number;

  constructor(private readonly deps: SharedCareDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.maxAgeMs = deps.maxAgeMs ?? 120_000;
  }

  snapshot(): SharedCareSnapshot {
    return this.state;
  }

  /** Seconds now, for projecting the stats as they stand (the same clock the service reads by). */
  nowSec(): number {
    return this.now() / 1000;
  }

  /**
   * Read (or re-read, when the last read is old or `force`) the shared care of the Blobbi `source` names. Another
   * Blobbi than before starts afresh; an answer for a Blobbi switched away from is dropped. Never throws.
   */
  async refresh(source: BlobbiSource, force = false): Promise<void> {
    const at = sharedAddressOf(source);
    if (!at) {
      this.seq++;
      this.state = { status: 'none', address: null, care: null, partial: false, fetchedAt: null };
      return;
    }
    const address = `31124:${at.pubkey}:${at.d}`;
    const same = this.state.address === address;
    if (same && !force && this.state.status === 'ready' && this.state.fetchedAt !== null && this.now() - this.state.fetchedAt < this.maxAgeMs) return;
    if (same && this.state.status === 'loading') return;
    const token = ++this.seq;
    this.state = { status: 'loading', address, care: same ? this.state.care : null, partial: same ? this.state.partial : false, fetchedAt: same ? this.state.fetchedAt : null };
    let res: SharedCareRead;
    try {
      res = await this.deps.read(at.pubkey, at.d);
    } catch {
      res = { status: 'unavailable' };
    }
    if (token !== this.seq) return; // switched away, or asked again since
    if (res.status === 'ready') this.state = { status: 'ready', address, care: res.care, partial: res.partial, fetchedAt: this.now() };
    else if (res.status === 'missing') this.state = { status: 'missing', address, care: null, partial: res.partial, fetchedAt: this.now() };
    else this.state = { ...this.state, status: 'unavailable' }; // what was read before stays on show, marked
  }
}
