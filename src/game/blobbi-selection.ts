/**
 * THE SELECTED BLOBBI, persisted. One record per browser: which Blobbi the player chose (a V3 address, a V3
 * seed or a demo seed), so it is the same Blobbi after a reload.
 *
 * OWNERSHIP. The selection is the PLAYER's, not a world's, and it owns nothing. Islands, their inventory,
 * equipment, buildings and resource states belong to the local world (`WorldSave.owner = 'local-world'`,
 * keyed by the world identity and never by a Blobbi): choosing another Blobbi changes who walks the island,
 * never which inventory is shown, and no record ties an inventory to a Blobbi. A per-Blobbi inventory would
 * be a new, separately keyed record, never a reinterpretation of this one or of a world save.
 *
 * The record keeps the source as given (an address stays an address), and is re-validated with the kit's
 * rules on every load: a seed stored for an address must still be the one the address derives. A record
 * that fails is ignored whole.
 *
 * M11C, CANONICAL BLOBBIS FROM AN ACCOUNT. Choosing one of the player's own Blobbis (MY BLOBBIS) stores its address
 * (a `v3-address` source, as before) plus two optional, purely presentational fields in the SAME version-1 record:
 * `name` (its canonical name, for the HUD) and `account` (the public key it was chosen with). Older code reads only
 * `version` and `source`, so the record stays readable both ways; no island save changes (saves never name a Blobbi).
 * A Blobbi chosen with an account walks only while that account is connected on this device: otherwise the visiting
 * Blobbi does (`effectiveSelection`), and the choice comes back when the same account connects again.
 */
import { resolveBlobbi, type BlobbiSource } from '../blobbi/source';
import type { KeyValueStore } from './persistence';

export const SELECTION_VERSION = 1;
export const SELECTION_KEY = 'blobbi-pixel-lab:selected-blobbi';

export interface BlobbiSelection {
  version: typeof SELECTION_VERSION;
  source: BlobbiSource;
  /** M11C: the Blobbi's own name (presentation only), for one chosen from an account. */
  name?: string;
  /** M11C: the public key of the account it was chosen with (64 hex). */
  account?: string;
}

/** A stored selection, checked: the source re-validated, the name cleaned, the account a well-formed key or absent. */
export interface SelectionRecord {
  source: BlobbiSource;
  name: string | null;
  account: string | null;
}

export function loadSelection(store: KeyValueStore): BlobbiSource | null {
  return loadSelectionRecord(store)?.source ?? null;
}

const KEY_HEX = /^[0-9a-f]{64}$/;
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g;

/** A stored name made safe to show: one line, no invisible or direction characters, at most 24 characters. */
export function cleanSelectionName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const flat = raw.normalize('NFC').replace(UNSAFE, '').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  return [...flat].slice(0, 24).join('');
}

export function loadSelectionRecord(store: KeyValueStore): SelectionRecord | null {
  let raw: string | null;
  try {
    raw = store.get(SELECTION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; source?: Partial<Record<'kind' | 'seed' | 'pubkey' | 'd', unknown>>; name?: unknown; account?: unknown };
    if (parsed.version !== SELECTION_VERSION || !parsed.source || typeof parsed.source !== 'object') return null;
    const s = parsed.source;
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    const resolved =
      s.kind === 'v3-address' ? resolveBlobbi({ pubkey: str(s.pubkey) ?? '', d: str(s.d) ?? '' }) : s.kind === 'v3-seed' || s.kind === 'demo' ? resolveBlobbi({ seed: str(s.seed) ?? '' }) : null;
    if (!resolved?.ok || resolved.source.kind !== s.kind || resolved.source.seed !== s.seed) return null;
    const account = typeof parsed.account === 'string' && KEY_HEX.test(parsed.account) ? parsed.account : null;
    // An account marker only makes sense on that account's own Blobbi (an address with the same owner).
    if (account && (resolved.source.kind !== 'v3-address' || resolved.source.pubkey !== account)) return null;
    return { source: resolved.source, name: account ? cleanSelectionName(parsed.name) : null, account };
  } catch {
    return null;
  }
}

export function storeSelection(store: KeyValueStore, source: BlobbiSource, from?: { name: string; account: string }): void {
  const record: BlobbiSelection = { version: SELECTION_VERSION, source };
  if (from && source.kind === 'v3-address' && source.pubkey === from.account && KEY_HEX.test(from.account)) {
    record.name = cleanSelectionName(from.name) ?? 'Blobbi';
    record.account = from.account;
  }
  store.set(SELECTION_KEY, JSON.stringify(record));
}

/**
 * Which stored choice walks the island now: a Blobbi chosen with an account only while that same account is
 * connected (null: the caller uses the visiting Blobbi); any other choice (the lab, a link) always.
 */
export function effectiveSelection(record: SelectionRecord | null, connectedPubkey: string | null): SelectionRecord | null {
  if (!record) return null;
  if (record.account && record.account !== connectedPubkey) return null;
  return record;
}
