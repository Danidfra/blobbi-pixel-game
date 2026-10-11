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
 */
import { resolveBlobbi, type BlobbiSource } from '../blobbi/source';
import type { KeyValueStore } from './persistence';

export const SELECTION_VERSION = 1;
export const SELECTION_KEY = 'blobbi-pixel-lab:selected-blobbi';

export interface BlobbiSelection {
  version: typeof SELECTION_VERSION;
  source: BlobbiSource;
}

export function loadSelection(store: KeyValueStore): BlobbiSource | null {
  const raw = store.get(SELECTION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; source?: Partial<Record<'kind' | 'seed' | 'pubkey' | 'd', unknown>> };
    if (parsed.version !== SELECTION_VERSION || !parsed.source || typeof parsed.source !== 'object') return null;
    const s = parsed.source;
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    const resolved =
      s.kind === 'v3-address' ? resolveBlobbi({ pubkey: str(s.pubkey) ?? '', d: str(s.d) ?? '' }) : s.kind === 'v3-seed' || s.kind === 'demo' ? resolveBlobbi({ seed: str(s.seed) ?? '' }) : null;
    if (!resolved?.ok || resolved.source.kind !== s.kind || resolved.source.seed !== s.seed) return null;
    return resolved.source;
  } catch {
    return null;
  }
}

export function storeSelection(store: KeyValueStore, source: BlobbiSource): void {
  const record: BlobbiSelection = { version: SELECTION_VERSION, source };
  store.set(SELECTION_KEY, JSON.stringify(record));
}
