/**
 * THE PLAYER'S CANONICAL BLOBBIS (M11C), read-only. A Blobbi's state lives in its owner's kind 31124 event,
 * addressable as `31124:<owner pubkey>:<d>`; this module reads those events and decides, with the kit's own rules
 * (`@blobbi-kit/core`), which Blobbis to show and which may visit the island. It never writes one.
 *
 * Checks, in order, for every event a relay returned (relays are untrusted):
 * 1. well formed (NIP-01 shape; the signature itself is verified by the relay client, `NRelay1`);
 * 2. kind 31124 and **by the owner** (a relay that ignores the `authors` filter cannot slip in someone else's);
 * 3. a `d` tag;
 * then per `d` the NEWEST event wins (created_at, ties to the lower id, NIP-01), whichever relay sent it, so relays
 * that disagree settle on the latest state; and that newest event must be **modern** by the kit
 * (`classifyBlobbiEvent`: the ecosystem marker, a known stage and state, a canonical d, a name, a seed). Legacy and
 * invalid ones are counted, never shown, never "repaired" (the kit's collection does the same).
 *
 * What may visit: a V3 adult or (M11D.1) a V3 baby (Blobbi Pixel draws the kit's V3 forms gene for gene). V1 and V2
 * Blobbis use other artwork and no V3 seed, and eggs cannot walk: they are listed with the reason, never drawn as an
 * unrelated V3 creature. An unknown future `visual_generation` is "unknown", not V1 (the kit would fall back to V1).
 */
import { classifyBlobbiEvent, deriveBlobbiV3Seed, isCanonicalBlobbiD, isValidBlobbiEvent, KIND_BLOBBI_STATE, parseBlobbiEvent } from '@blobbi-kit/core';
import { cleanName, isWellFormedEvent, type NostrEventLike } from './profile';
import type { BlobbiGeneration, OwnedBlobbi } from './port';

/** More than this many Blobbis (after de-duplication) are not shown; the newest are kept. */
export const MAX_BLOBBIS = 60;

export interface BlobbiPick {
  items: OwnedBlobbi[];
  /** Events that could not be used: malformed, another author, another kind, no d, legacy or invalid. */
  skipped: number;
}

/** The generation an event names, without the kit's V1 fallback for values it does not know. */
export function generationOf(tags: readonly (readonly string[])[]): BlobbiGeneration {
  const tag = tags.find((t) => t[0] === 'visual_generation');
  if (!tag) return 'v1';
  return tag[1] === 'v1' || tag[1] === 'v2' || tag[1] === 'v3' ? tag[1] : 'unknown';
}

export function pickBlobbis(events: readonly unknown[], owner: string): BlobbiPick {
  let skipped = 0;
  const newest = new Map<string, NostrEventLike>();
  for (const e of events) {
    if (!isWellFormedEvent(e) || e.kind !== KIND_BLOBBI_STATE || e.pubkey !== owner) {
      skipped++;
      continue;
    }
    const d = e.tags.find((t) => t[0] === 'd')?.[1];
    if (!d) {
      skipped++;
      continue;
    }
    const known = newest.get(d);
    if (known && known.id === e.id) continue; // the same event from another relay
    if (!known || e.created_at > known.created_at || (e.created_at === known.created_at && e.id < known.id)) {
      if (known) skipped++; // an older version of the same Blobbi
      newest.set(d, e);
    } else skipped++;
  }
  const items: OwnedBlobbi[] = [];
  for (const [d, e] of newest) {
    const item = readBlobbi(e, owner, d);
    if (item) items.push(item);
    else skipped++;
  }
  items.sort((a, b) => b.updatedAt - a.updatedAt || (a.d < b.d ? -1 : 1));
  return { items: items.slice(0, MAX_BLOBBIS), skipped };
}

function readBlobbi(e: NostrEventLike, owner: string, d: string): OwnedBlobbi | null {
  const generation = generationOf(e.tags);
  let blobbi: ReturnType<typeof parseBlobbiEvent>;
  try {
    // A generation this game does not know: the kit would read it as V1 and call it legacy (no V1 seed), and the
    // Blobbi would vanish. Listed instead (never drawn) when the event is otherwise schema-valid and canonical.
    if (generation === 'unknown') {
      if (!isValidBlobbiEvent(e) || !isCanonicalBlobbiD(d) || !e.tags.some((t) => t[0] === 'name' && t[1])) return null;
    } else if (classifyBlobbiEvent(e) !== 'modern') return null;
    blobbi = parseBlobbiEvent(e);
  } catch {
    return null;
  }
  if (!blobbi || (blobbi.isLegacy && generation !== 'unknown') || blobbi.d !== d) return null;
  let seed: string | null = null;
  if (generation === 'v3') {
    try {
      seed = deriveBlobbiV3Seed(owner, d);
    } catch {
      return null;
    }
    // The kit's own reading of the event must agree with the address (it derives the same seed).
    if (blobbi.v3Identity && blobbi.v3Identity.seed !== seed) return null;
  }
  const stage = blobbi.stage;
  // M11D.1: a V3 baby visits too (the kit's own baby of the same genome, drawn in pixels); eggs do not walk.
  const availability = generation === 'unknown' ? 'unknown-generation' : generation !== 'v3' ? 'older-generation' : stage === 'egg' ? 'egg' : 'available';
  const traits = blobbi.visualTraits;
  const hex = (c: unknown) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : null);
  const colors = generation === 'v1' || generation === 'v2' ? { base: hex(traits.baseColor), secondary: hex(traits.secondaryColor), eye: hex(traits.eyeColor) } : null;
  return {
    address: `${KIND_BLOBBI_STATE}:${owner}:${d}`,
    pubkey: owner,
    d,
    name: cleanName(blobbi.name) ?? 'Blobbi',
    stage,
    generation,
    availability,
    seed,
    colors: colors && colors.base && colors.secondary && colors.eye ? (colors as { base: string; secondary: string; eye: string }) : null,
    updatedAt: e.created_at,
  };
}
