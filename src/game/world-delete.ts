/**
 * DELETING A WORLD, safely. Deleting is the one action in the game that cannot be undone, so it always goes
 * through a confirmation that names the world, and the confirming press is refused for a moment after the
 * question appears (`ConfirmGate`): a double click, a repeated tap or a held Enter that opened the question can
 * never also answer it.
 *
 * `deleteWorld` removes exactly one world's records: its save, its entry in the last-played index and its entry
 * in the local owners list. Other worlds' records are never read or written beyond those two small indexes.
 */
import { saveKey } from './persistence';
import { WORLD_INDEX_KEY } from './worlds';
import { OWNERS_KEY } from './visiting';

export interface WorldDeleteStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** Seconds after a confirmation appears before its DELETE answer is accepted. */
export const CONFIRM_ARM_SECONDS = 0.6;

/** Remove one world's save and its index entries. Returns whether a save was there to delete. */
export function deleteWorld(store: WorldDeleteStore, identity: string): boolean {
  const had = store.get(saveKey(identity)) !== null;
  store.remove(saveKey(identity));
  for (const key of [WORLD_INDEX_KEY, OWNERS_KEY]) {
    try {
      const raw = JSON.parse(store.get(key) ?? 'null');
      if (raw && typeof raw === 'object' && identity in raw) {
        delete (raw as Record<string, unknown>)[identity];
        store.set(key, JSON.stringify(raw));
      }
    } catch {
      // A malformed index is left as it is: it only orders or labels worlds.
    }
  }
  return had;
}

/**
 * A pending "are you sure?": what it is about, when it opened, and whether its confirming press is armed yet.
 * Times are real seconds from any monotonic clock the caller uses.
 */
export class ConfirmGate<T = string> {
  subject: T | null = null;
  private openedAt = 0;

  constructor(private readonly armSeconds = CONFIRM_ARM_SECONDS) {}

  open(subject: T, now: number): void {
    this.subject = subject;
    this.openedAt = now;
  }

  cancel(): void {
    this.subject = null;
  }

  get pending(): boolean {
    return this.subject !== null;
  }

  /** Whether a confirming press now would be accepted. */
  armed(now: number): boolean {
    return this.subject !== null && now - this.openedAt >= this.armSeconds - 1e-9;
  }

  /** The confirming press: the subject when armed (and the gate closes), else null and nothing happens. */
  confirm(now: number): T | null {
    if (!this.armed(now)) return null;
    const s = this.subject;
    this.subject = null;
    return s;
  }
}
