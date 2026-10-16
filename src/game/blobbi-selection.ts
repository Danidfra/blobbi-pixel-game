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
 *
 * COMPANION SYNC, WHAT THE NETWORK KNOWS OF THE CHOICE. Two more optional fields in the same version-1 record:
 * `synced` (the kind 11125 profile event that carries this choice across the Blobbi apps: the one this game published
 * for it, or the one it was adopted from: its id and `created_at` in seconds) and `over` (for a choice made here: the
 * profile the player had been shown when they made it, and the Blobbi it named). They order the choice against the
 * player's current Blobbi (`companion-order.ts`); a new choice clears `synced`. Older code ignores both.
 *
 * M11D.8.4, AN UPPER BOUND FOR AN UNSTAMPED CHOICE. When this code first meets a record WITHOUT a stamp it writes
 * `existedBy` (ms): "this choice already existed at this moment". It is not when the choice was made and is never
 * read as such; it only lets a choice made LATER in another app (clearly after that moment) be ordered after it. It
 * is written once, never moved forward by later loads, and dropped when the record is next written with a stamp.
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
  /** M11D.8.4: an unstamped choice already existed at this moment (ms). An upper bound, never the choice's time. */
  existedBy?: number;
  /** Companion sync: the profile event carrying this choice across the apps (published here, or adopted). */
  synced?: ProfileStamp;
  /** Companion sync: the profile the player had been shown when they made this choice here. */
  over?: SeenProfile;
}

/** A kind 11125 profile event, as far as ordering goes (`created_at` in seconds). */
export interface ProfileStamp {
  id: string;
  createdAt: number;
}
/** The profile a choice was made over, and the Blobbi (bare d) it named then. */
export interface SeenProfile extends ProfileStamp {
  d?: string | null;
}

/** M11D.8.3: who made the stored choice: the player, in this game; or the game, adopting the current Blobbi of the other worlds. */
export type SelectionOrigin = 'player' | 'remote';
/** M11D.8.3: the moment and the origin of a choice, for the record. */
export interface SelectionWhen {
  at: number;
  by: SelectionOrigin;
  /** Companion sync: the profile event this choice was adopted from (a remote choice). */
  synced?: ProfileStamp | null;
  /** Companion sync: the profile the player had been shown (a choice made here). */
  over?: SeenProfile | null;
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
  /** M11D.8.4: for an unstamped choice, the moment it was first seen to exist (ms); absent otherwise. */
  existedBy?: number;
  /** Companion sync (see the header). */
  synced?: ProfileStamp;
  over?: SeenProfile;
}

const ID_HEX = /^[0-9a-f]{64}$/;
function stampOf(v: unknown): ProfileStamp | null {
  const s = v as { id?: unknown; createdAt?: unknown } | null;
  return s && typeof s === 'object' && typeof s.id === 'string' && ID_HEX.test(s.id) && typeof s.createdAt === 'number' && Number.isFinite(s.createdAt) && s.createdAt >= 0 ? { id: s.id, createdAt: s.createdAt } : null;
}
function seenOf(v: unknown): SeenProfile | null {
  const s = stampOf(v);
  const d = (v as { d?: unknown } | null)?.d;
  return s ? { ...s, d: typeof d === 'string' && d ? d : null } : null;
}

/** M11D.8.3: the stored time and origin of a choice, checked: a finite positive time, a known origin; else nothing. */
function readWhen(parsed: { selectedAt?: unknown; selectedBy?: unknown; existedBy?: unknown; synced?: unknown; over?: unknown }): { selectedAt?: number; selectedBy?: SelectionOrigin; existedBy?: number; synced?: ProfileStamp; over?: SeenProfile } {
  const at = typeof parsed.selectedAt === 'number' && Number.isFinite(parsed.selectedAt) && parsed.selectedAt > 0 ? parsed.selectedAt : null;
  const by = parsed.selectedBy === 'player' || parsed.selectedBy === 'remote' ? parsed.selectedBy : null;
  if (at !== null && by !== null) {
    const synced = stampOf(parsed.synced);
    const over = seenOf(parsed.over);
    return { selectedAt: at, selectedBy: by, ...(synced ? { synced } : {}), ...(over ? { over } : {}) };
  }
  const bound = typeof parsed.existedBy === 'number' && Number.isFinite(parsed.existedBy) && parsed.existedBy > 0 ? parsed.existedBy : null;
  return bound !== null ? { existedBy: bound } : {};
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
    const parsed = JSON.parse(raw) as { version?: unknown; source?: Partial<Record<'kind' | 'seed' | 'pubkey' | 'd' | 'generation' | 'traits', unknown>>; name?: unknown; account?: unknown; stage?: unknown; guest?: unknown; selectedAt?: unknown; selectedBy?: unknown; existedBy?: unknown; synced?: unknown; over?: unknown };
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
  const synced = stampOf(when.synced);
  const over = seenOf(when.over);
  if (synced) record.synced = synced;
  else delete record.synced;
  if (over) record.over = over;
  else delete record.over;
}

/**
 * Companion sync: the walking Blobbi grew up (or the other way round) in another app: only the stage it is drawn at
 * changes in the stored record. Who was chosen, when, by whom, and the profile that carries it stay exactly as they
 * were: this is not a choice, and nothing is shared for it. A record of another Blobbi (`address`) is left alone.
 */
export function setSelectionStage(store: KeyValueStore, address: string, stage: BlobbiStage): void {
  try {
    const raw = store.get(SELECTION_KEY);
    const parsed = raw ? (JSON.parse(raw) as BlobbiSelection) : null;
    const src = parsed?.source as { pubkey?: string; d?: string } | undefined;
    if (!parsed || parsed.version !== SELECTION_VERSION || !src?.pubkey || !src.d || `31124:${src.pubkey}:${src.d}` !== address) return;
    if (stage === 'baby') parsed.stage = 'baby';
    else delete parsed.stage;
    store.set(SELECTION_KEY, JSON.stringify(parsed));
  } catch {
    /* not kept: drawn at the stage just read for this visit */
  }
}

/**
 * Companion sync: the stored choice of `d` (an owned Blobbi, by `account`) is now carried by this profile event (the
 * game published it, or found the profile already naming it). Nothing else changes; another choice is left alone.
 */
export function markSelectionSynced(store: KeyValueStore, account: string, d: string, synced: ProfileStamp): void {
  try {
    const raw = store.get(SELECTION_KEY);
    const parsed = raw ? (JSON.parse(raw) as BlobbiSelection) : null;
    const src = parsed?.source as { pubkey?: string; d?: string } | undefined;
    if (!parsed || parsed.version !== SELECTION_VERSION || parsed.account !== account || src?.pubkey !== account || src?.d !== d) return;
    const ok = stampOf(synced);
    if (!ok) return;
    parsed.synced = ok;
    store.set(SELECTION_KEY, JSON.stringify(parsed));
  } catch {
    /* not kept: ordered by its time instead */
  }
}

/**
 * M11D.8.4: note, once, that the stored choice (when it has no stamp) already exists now; returns the bound in force
 * (the earlier one when already noted), or null for a stamped, missing or unreadable record. Only `existedBy` is
 * added; nothing else in the record changes, and a stamped record is never touched.
 */
export function noteUnstampedChoice(store: KeyValueStore, now: number): number | null {
  if (!Number.isFinite(now) || now <= 0) return null;
  try {
    const raw = store.get(SELECTION_KEY);
    const parsed = raw ? (JSON.parse(raw) as BlobbiSelection) : null;
    if (!parsed || parsed.version !== SELECTION_VERSION || !parsed.source || !loadSelectionRecord(store)) return null;
    if (typeof parsed.selectedAt === 'number' && (parsed.selectedBy === 'player' || parsed.selectedBy === 'remote')) return null;
    if (typeof parsed.existedBy === 'number' && Number.isFinite(parsed.existedBy) && parsed.existedBy > 0) return parsed.existedBy;
    parsed.existedBy = Math.floor(now);
    store.set(SELECTION_KEY, JSON.stringify(parsed));
    return parsed.existedBy;
  } catch {
    return null;
  }
}

/**
 * M11D.8.3: the player confirmed the stored choice (CONTINUE WITH <name> on "who comes along?"): the record is
 * stamped as the player's, now, and nothing else about it changes. A record that cannot be read is left alone.
 */
export function markSelectionChosen(store: KeyValueStore, at: number, over?: SeenProfile | null): void {
  try {
    const raw = store.get(SELECTION_KEY);
    const parsed = raw ? (JSON.parse(raw) as BlobbiSelection) : null;
    if (!parsed || parsed.version !== SELECTION_VERSION || !parsed.source) return;
    delete parsed.existedBy;
    stamp(parsed, { at, by: 'player', over });
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
