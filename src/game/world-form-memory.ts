/**
 * M11D.2: the world forms a player has already been shown and accepted on this device (by Blobbi address
 * `31124:pubkey:d`), so the "Your Blobbi discovered a new form!" explanation appears when it is new, not on every
 * choice. Public, tiny, per browser, never part of a save; a damaged record reads as empty (the explanation shows
 * again, nothing worse).
 */
import type { KeyValueStore } from './persistence';

export const WORLD_FORMS_KEY = 'blobbi-pixel-lab:world-forms';
const MAX = 120;

function read(store: KeyValueStore): string[] {
  try {
    const raw = store.get(WORLD_FORMS_KEY);
    const parsed = raw ? (JSON.parse(raw) as { version?: unknown; accepted?: unknown }) : null;
    if (parsed?.version !== 1 || !Array.isArray(parsed.accepted)) return [];
    return parsed.accepted.filter((a): a is string => typeof a === 'string' && a.length <= 200);
  } catch {
    return [];
  }
}

export function worldFormSeen(store: KeyValueStore, address: string): boolean {
  return read(store).includes(address);
}

export function acceptWorldForm(store: KeyValueStore, address: string): void {
  const list = read(store).filter((a) => a !== address);
  list.push(address);
  try {
    store.set(WORLD_FORMS_KEY, JSON.stringify({ version: 1, accepted: list.slice(-MAX) }));
  } catch {
    /* not stored: the explanation simply shows again */
  }
}
