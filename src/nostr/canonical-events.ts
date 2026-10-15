/**
 * M11D.4, THE CANONICAL EVENTS FOR A BLOBBI BORN IN BLOBBI PIXEL, built only with `@blobbi-kit/core` (no new kinds,
 * no new tags, no explicit seed): its kind 31124 state and its owner's kind 11125 profile listing it.
 *
 *   31124  `buildEggTags(owner, petId, bornAt, name, { visualGeneration: 'v3' })` (the kit's canonical d, the
 *          ecosystem marker, the stats at their maximum, `visual_generation=v3`, no seed and no trait tags: a V3 look
 *          comes from (owner, d) alone), then `updateBlobbiTags(…, { stage: 'baby', state: 'active',
 *          progression_state: 'none' })`. The Blobbi hatched in this game, so it is published as a Baby. It is NOT
 *          given the kit's evolve missions: those live in `@blobbi-kit/react` (not part of this game), and inventing
 *          them would be a protocol change; `none` lets its home apps start its growth their own way.
 *   11125  the owner's profile: `buildBlobbonautTags(owner)` with `has` = the Blobbis already listed plus this one
 *          (`addPetToHas`) and `current_companion` = this one, merged over the newest existing profile if the relays
 *          have one (never dropping a Blobbi it already lists).
 *
 * Templates only: signing is the vault's (a reserved identity) or the browser extension's (an existing account).
 */
import { addPetToHas, buildBlobbonautTags, buildEggTags, classifyBlobbiEvent, deriveBlobbiV3Seed, getBlobbonautQueryDValues, getCanonicalBlobbiD, getCanonicalBlobbonautD, isValidBlobbonautEvent, KIND_BLOBBI_STATE, KIND_BLOBBONAUT_PROFILE, KIND_BLOBBONAUT_PROFILE_LEGACY, updateBlobbiTags, updateBlobbonautTags } from '@blobbi-kit/core';

export interface EventTemplate {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

export interface BirthFacts {
  owner: string;
  petId: string;
  name: string;
  /** When it was born in this game (seconds). */
  bornAt: number;
}

/** The canonical d of a Blobbi born here (the kit's). */
export const canonicalD = (owner: string, petId: string): string => getCanonicalBlobbiD(owner, petId);

/** Its V3 visual seed: the kit's derivation from (owner, d). The look is fixed the moment both exist. */
export const canonicalSeed = (owner: string, petId: string): string => deriveBlobbiV3Seed(owner, canonicalD(owner, petId));

/**
 * The 31124 state of a Blobbi hatched in this game, ready to sign (at `now`, seconds). M11D.6: the kit's care clock
 * (`last_interaction`, `last_decay_at`, `care_streak_last_at`) starts at `now`, the moment it is shared, not at the
 * reservation: a Blobbi shared days after it hatched must not open in its home apps as if nobody had cared for it
 * since (Standalone projects decay from `last_decay_at`). Its look depends only on (owner, d), never on a time.
 */
export function babyStateTemplate(f: BirthFacts, now: number): EventTemplate {
  const egg = buildEggTags(f.owner, f.petId, now, f.name, { visualGeneration: 'v3' });
  const tags = updateBlobbiTags(egg, { stage: 'baby', state: 'active', progression_state: 'none' });
  return { kind: KIND_BLOBBI_STATE, created_at: now, tags, content: '' };
}

/**
 * M11D.6: how the owner's profile is asked for, as the kit's own reader does (`fetchFreshBlobbonautProfile`): both the
 * 11125 and the legacy 31125 kind, by the kit's d values.
 */
export const profileFilter = (owner: string) => ({ kinds: [KIND_BLOBBONAUT_PROFILE, KIND_BLOBBONAUT_PROFILE_LEGACY], authors: [owner], '#d': getBlobbonautQueryDValues(owner), limit: 10 });

/** Whether an event is a usable profile by the kit's reading (the ecosystem marker, a d). */
export const isProfile = (e: { kind: number; tags: string[][] }): boolean => isValidBlobbonautEvent(e as never);

/**
 * The owner's 11125 profile listing the Blobbi (merged over an existing one, never dropping a Blobbi or a tag). A
 * legacy 31125 profile is carried over into the 11125 with the kit's canonical d.
 */
export function profileTemplate(owner: string, d: string, now: number, existing: { kind?: number; tags: string[][]; content: string } | null): EventTemplate {
  const base = existing ? existing.tags.map((t) => (t[0] === 'd' && existing.kind === KIND_BLOBBONAUT_PROFILE_LEGACY ? ['d', getCanonicalBlobbonautD(owner)] : [...t])) : buildBlobbonautTags(owner);
  const has = base.filter((t) => t[0] === 'has' && t[1]).map((t) => t[1]);
  const tags = updateBlobbonautTags(base, { has: addPetToHas(has, d), current_companion: d });
  return { kind: KIND_BLOBBONAUT_PROFILE, created_at: now, tags, content: existing?.content ?? '' };
}

/** Whether a signed 31124 is a modern canonical Blobbi by the kit's own reading (checked before publishing). */
export const isCanonicalBlobbi = (event: { kind: number; pubkey: string; tags: string[][]; content: string; created_at: number; id: string; sig: string }): boolean => classifyBlobbiEvent(event as never) === 'modern';

/**
 * Companion sync: the owner's profile with `current_companion` = `d`, built over the newest profile (`base`): every
 * other tag kept (the kit's `updateBlobbonautTags`), `d` added to `has` when missing (never one removed), the content
 * as it is, a legacy 31125 carried over with the kit's canonical d, and `created_at` after the base's (a device whose
 * clock is behind must still replace it). The same template as Blobbi Standalone's `buildCompanionProfile`.
 */
export function companionProfileTemplate(owner: string, d: string, now: number, base: { kind: number; created_at: number; tags: string[][]; content: string }): EventTemplate {
  const tags = base.tags.filter((t) => t[0] !== 'current_companion').map((t) => (t[0] === 'd' && base.kind === KIND_BLOBBONAUT_PROFILE_LEGACY ? ['d', getCanonicalBlobbonautD(owner)] : [...t]));
  const has = tags.filter((t) => t[0] === 'has' && t[1]).map((t) => t[1]);
  const updates: Record<string, string | string[]> = { current_companion: d };
  if (!has.includes(d)) updates.has = addPetToHas(has, d);
  return { kind: KIND_BLOBBONAUT_PROFILE, created_at: Math.max(now, base.created_at + 1), tags: updateBlobbonautTags(tags, updates), content: base.content };
}

/** Whether `next` keeps everything of `base` but the companion (every tag as a multiset, every `has`, the content). */
export function preservesProfile(base: { kind: number; tags: string[][]; content: string }, next: EventTemplate, d: string): boolean {
  if (next.content !== base.content) return false;
  if (next.tags.filter((t) => t[0] === 'current_companion').length !== 1 || !next.tags.some((t) => t[0] === 'current_companion' && t[1] === d)) return false;
  const ignored = new Set(['current_companion', 'client', 'published_at', ...(base.kind === KIND_BLOBBONAUT_PROFILE_LEGACY ? ['d'] : [])]);
  const count = (tags: readonly string[][]) => {
    const m = new Map<string, number>();
    for (const t of tags) if (!ignored.has(t[0]) && !(t[0] === 'has' && t[1] === d)) m.set(JSON.stringify(t), (m.get(JSON.stringify(t)) ?? 0) + 1);
    return m;
  };
  const after = count(next.tags);
  // A repeated `has` is one Blobbi (the kit de-duplicates it); every other tag keeps its count
  for (const [t, n] of count(base.tags)) if ((after.get(t) ?? 0) < (JSON.parse(t)[0] === 'has' ? 1 : n)) return false;
  return true;
}

