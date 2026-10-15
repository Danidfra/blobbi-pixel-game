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
 *
 * M11D.1, BABIES. A canonical Baby chosen from MY BLOBBIS adds one more optional, presentational field to the same
 * version-1 record: `stage: 'baby'` (the stage its event stated when it was chosen; absent means the adult). It is
 * kept only beside an account, like `name`. Older code ignores it and draws the adult of the same genome (the same
 * Blobbi, grown up): never another creature. The stage is a drawing choice, never identity: the seed, the address and
 * every island save are unchanged by it, and MY BLOBBIS refreshes it when the Blobbi has grown up in another app.
 *
 * M11D.2, WORLD FORMS. A V1/V2 Blobbi chosen from MY BLOBBIS is stored as a `world-form` source in the same version-1
 * record: its address (pubkey, d), its generation, the look its event states (colours, pattern, mark) and the
 * address-derived world-form seed, always beside `account`. On load it is rebuilt and refused whole unless the seed is
 * the one its address derives and the account owns it. Code before M11D.2 does not know the kind and ignores the
 * record (the visiting Blobbi walks): never another Blobbi.
 *
 * M11D.8.3, WHEN AND BY WHOM. Two more optional fields in the same version-1 record say when the choice was made and
 * by whom: `selectedAt` (ms since 1970, this device's clock) and `selectedBy` ('player': a real choice in this game,
 * MY BLOBBIS, BRING, CONTINUE WITH, a newborn, a restore; 'remote': the game adopted the player's current Blobbi from
 * the other worlds, stamped with THAT selection's own time, kind 11125 `created_at`). They are written only by such an
 * act: a reload, an automatic entry, a resume, a newer kind 31124 or a screen never touch them. A record without them
 * (made before M11D.8.3) says "unknown", never "old": the entry then asks "who comes along?" as before, and the answer
 * stamps it. Older code ignores both fields.
 */
import type { BlobbiStage } from '../blobbi/canonical';
import { resolveBlobbi, worldFormSource, type BlobbiSource } from '../blobbi/source';
import type { WorldFormTraits } from '../blobbi/world-form';
import { isLocalBlobbiSeed } from './local-blobbis';
import { guestBlobbi } from './guest-blobbis';

/** Sources that belong to an owner's address: a V3 address, or (M11D.2) a V1/V2 Blobbi's world form. */
function ownedKind(s: BlobbiSource): s is Extract<BlobbiSource, { kind: 'v3-address' | 'world-form' }> {
  return s.kind === 'v3-address' || s.kind === 'world-form';
}
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
  /** M11D.1: `baby` for a canonical Baby (absent: the adult). Only beside `account`. */
  stage?: 'baby';
  /** M11D.8.3: when this choice was made (ms), and by whom. */
  selectedAt?: number;
  selectedBy?: SelectionOrigin;
}

/** M11D.8.3: who made the stored choice: the player, in this game; or the game, adopting the current Blobbi of the other worlds. */
export type SelectionOrigin = 'player' | 'remote';
/** M11D.8.3: the moment and the origin of a choice, for the record. */
export interface SelectionWhen {
  at: number;
  by: SelectionOrigin;
}

/** A stored selection, checked: the source re-validated, the name cleaned, the account a well-formed key or absent. */
export interface SelectionRecord {
  source: BlobbiSource;
  name: string | null;
  account: string | null;
  /** M11D.1: the stage to draw ('adult' unless an account's Baby was chosen; always set by `loadSelectionRecord`). */
  stage?: BlobbiStage;
  /** M11D.4: a Blobbi met in this game with a reserved owner (it walks with or without a connected account). */
  guest?: boolean;
  /** M11D.8.3: when the choice was made (ms) and by whom; null or absent when the record does not say (made before M11D.8.3). */
  selectedAt?: number | null;
  selectedBy?: SelectionOrigin | null;
}

/** M11D.8.3: the stored time and origin of a choice, checked: a finite positive time, a known origin; else nothing. */
function readWhen(parsed: { selectedAt?: unknown; selectedBy?: unknown }): { selectedAt?: number; selectedBy?: SelectionOrigin } {
  const at = typeof parsed.selectedAt === 'number' && Number.isFinite(parsed.selectedAt) && parsed.selectedAt > 0 ? parsed.selectedAt : null;
  const by = parsed.selectedBy === 'player' || parsed.selectedBy === 'remote' ? parsed.selectedBy : null;
  return at !== null && by !== null ? { selectedAt: at, selectedBy: by } : {};
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
    const parsed = JSON.parse(raw) as { version?: unknown; source?: Partial<Record<'kind' | 'seed' | 'pubkey' | 'd' | 'generation' | 'traits', unknown>>; name?: unknown; account?: unknown; stage?: unknown; guest?: unknown; selectedAt?: unknown; selectedBy?: unknown };
    if (parsed.version !== SELECTION_VERSION || !parsed.source || typeof parsed.source !== 'object') return null;
    const s = parsed.source;
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    // M11D.2: a world form is rebuilt from its stored parts and must derive the stored seed from its address.
    const form = s.kind === 'world-form' && (s.generation === 'v1' || s.generation === 'v2') && s.traits && typeof s.traits === 'object' ? worldFormSource(str(s.pubkey) ?? '', str(s.d) ?? '', s.generation, s.traits as WorldFormTraits) : null;
    const resolved: ReturnType<typeof resolveBlobbi> | null =
      s.kind === 'world-form' ? (form ? { ok: true, source: form, notes: [] } : null) : s.kind === 'v3-address' ? resolveBlobbi({ pubkey: str(s.pubkey) ?? '', d: str(s.d) ?? '' }) : s.kind === 'v3-seed' || s.kind === 'demo' ? resolveBlobbi({ seed: str(s.seed) ?? '' }) : null;
    if (!resolved?.ok || resolved.source.kind !== s.kind || resolved.source.seed !== s.seed) return null;
    const account = typeof parsed.account === 'string' && KEY_HEX.test(parsed.account) ? parsed.account : null;
    // An account marker only makes sense on that account's own Blobbi (an address with the same owner).
    if (account && (!ownedKind(resolved.source) || resolved.source.pubkey !== account)) return null;
    // A world form is only ever chosen from the player's own Blobbis: never without its account.
    if (resolved.source.kind === 'world-form' && !account) return null;
    // An unknown stage value reads as the adult (the same Blobbi), never as a refusal of the whole record.
    // M11D.3: a local Blobbi (met in this game, born from an egg) is a Baby without any account.
    const stage: BlobbiStage = (account || isLocalBlobbiSeed(resolved.source.seed)) && parsed.stage === 'baby' ? 'baby' : 'adult';
    // M11D.4: a reserved Blobbi met here, only while its public record still names this very owner and d.
    if (parsed.guest === true) {
      const src = resolved.source;
      const known = src.kind === 'v3-address' ? guestBlobbi(store, src.d) : null;
      if (!known || src.kind !== 'v3-address' || known.owner !== src.pubkey || account) return null;
      return { source: src, name: known.name, account: null, stage: parsed.stage === 'baby' ? 'baby' : 'adult', guest: true, ...readWhen(parsed) };
    }
    return { source: resolved.source, name: account ? cleanSelectionName(parsed.name) : null, account, stage, ...readWhen(parsed) };
  } catch {
    return null;
  }
}

export function storeSelection(store: KeyValueStore, source: BlobbiSource, from?: { name: string; account: string; stage?: BlobbiStage }, when?: SelectionWhen): void {
  const record: BlobbiSelection = { version: SELECTION_VERSION, source };
  if (from && ownedKind(source) && source.pubkey === from.account && KEY_HEX.test(from.account)) {
    record.name = cleanSelectionName(from.name) ?? 'Blobbi';
    record.account = from.account;
    if (from.stage === 'baby') record.stage = 'baby';
  }
  stamp(record, when);
  store.set(SELECTION_KEY, JSON.stringify(record));
}

/** M11D.8.3: write the moment and origin of a choice into a record (nothing when not given or not sound). */
function stamp(record: BlobbiSelection, when?: SelectionWhen): void {
  if (!when || !Number.isFinite(when.at) || when.at <= 0 || (when.by !== 'player' && when.by !== 'remote')) return;
  record.selectedAt = Math.floor(when.at);
  record.selectedBy = when.by;
}

/**
 * M11D.8.3: the player confirmed the stored choice (CONTINUE WITH <name> on "who comes along?"): the record is
 * stamped as the player's, now, and nothing else about it changes. A record that cannot be read is left alone.
 */
export function markSelectionChosen(store: KeyValueStore, at: number): void {
  try {
    const raw = store.get(SELECTION_KEY);
    const parsed = raw ? (JSON.parse(raw) as BlobbiSelection) : null;
    if (!parsed || parsed.version !== SELECTION_VERSION || !parsed.source) return;
    stamp(parsed, { at, by: 'player' });
    store.set(SELECTION_KEY, JSON.stringify(parsed));
  } catch {
    // Not stamped: the question is simply asked again next time.
  }
}

/**
 * Which stored choice walks the island now: a Blobbi chosen with an account only while that same account is
 * connected (null: the caller uses the visiting Blobbi); any other choice (the lab, a link) always.
 */
export function effectiveSelection(record: SelectionRecord | null, connectedPubkey: string | null): SelectionRecord | null {
  if (!record) return null;
  if (record.guest) return record; // a Blobbi met here walks with or without an account (M11D.4)
  if (record.account && record.account !== connectedPubkey) return null;
  return record;
}

/** M11D.4: choose a Blobbi met in this game (its owner reserved here or the player's account), at its stage. */
export function storeGuestSelection(store: KeyValueStore, source: BlobbiSource, stage: BlobbiStage, when?: SelectionWhen): void {
  if (source.kind !== 'v3-address' || !guestBlobbi(store, source.d)) return;
  const record: BlobbiSelection & { guest: true } = { version: SELECTION_VERSION, source, guest: true };
  if (stage === 'baby') record.stage = 'baby';
  stamp(record, when);
  store.set(SELECTION_KEY, JSON.stringify(record));
}

/** M11D.3: choose a local Blobbi (met in this game) at its stage; no account, no name, no address. */
export function storeLocalSelection(store: KeyValueStore, source: BlobbiSource, stage: BlobbiStage, when?: SelectionWhen): void {
  if (!isLocalBlobbiSeed(source.seed) || source.kind !== 'demo') return;
  const record: BlobbiSelection = { version: SELECTION_VERSION, source };
  if (stage === 'baby') record.stage = 'baby';
  stamp(record, when);
  store.set(SELECTION_KEY, JSON.stringify(record));
}
