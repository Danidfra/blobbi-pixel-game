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
