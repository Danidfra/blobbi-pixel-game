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
import { addPetToHas, buildBlobbonautTags, buildEggTags, classifyBlobbiEvent, deriveBlobbiV3Seed, getCanonicalBlobbiD, KIND_BLOBBI_STATE, KIND_BLOBBONAUT_PROFILE, updateBlobbiTags, updateBlobbonautTags } from '@blobbi-kit/core';

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

/** The 31124 state of a Blobbi hatched in this game, ready to sign (at `now`, seconds). */
export function babyStateTemplate(f: BirthFacts, now: number): EventTemplate {
  const egg = buildEggTags(f.owner, f.petId, f.bornAt, f.name, { visualGeneration: 'v3' });
  const tags = updateBlobbiTags(egg, { stage: 'baby', state: 'active', progression_state: 'none' });
  return { kind: KIND_BLOBBI_STATE, created_at: now, tags, content: '' };
}

/** The owner's 11125 profile listing the Blobbi (merged over an existing one, never dropping a Blobbi). */
export function profileTemplate(owner: string, d: string, now: number, existing: { tags: string[][]; content: string } | null): EventTemplate {
  const base = existing ? existing.tags.map((t) => [...t]) : buildBlobbonautTags(owner);
  const has = base.filter((t) => t[0] === 'has' && t[1]).map((t) => t[1]);
  const tags = updateBlobbonautTags(base, { has: addPetToHas(has, d), current_companion: d });
  return { kind: KIND_BLOBBONAUT_PROFILE, created_at: now, tags, content: existing?.content ?? '' };
}

/** Whether a signed 31124 is a modern canonical Blobbi by the kit's own reading (checked before publishing). */
export const isCanonicalBlobbi = (event: { kind: number; pubkey: string; tags: string[][]; content: string; created_at: number; id: string; sig: string }): boolean => classifyBlobbiEvent(event as never) === 'modern';
