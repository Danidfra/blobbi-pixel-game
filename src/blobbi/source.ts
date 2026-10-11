/**
 * WHERE A BLOBBI COMES FROM. The pixel Blobbi is drawn from one seed string (`generateGenome(seed)` in the
 * kit); this module decides which seed, from what the player gave, with the kit's own V3 rules
 * (`@blobbi-kit/core`):
 *
 *   v3-address  an owner pubkey and a Blobbi `d` tag   seed = deriveBlobbiV3Seed(pubkey, d)
 *   v3-seed     a V3 seed: 64 hexadecimal digits      seed = canonicalBlobbiV3Seed(value) (lower case)
 *   demo        any other development string          seed = the string itself (`blobbi-9`)
 *
 * The first two are real V3 identities: the same address or seed is the same Blobbi as in the Standalone,
 * gene for gene. A demo seed is a lab Blobbi that exists nowhere else (no V3 address derives it), kept for
 * development. Nothing here derives a seed any other way, and no input is repaired into shape: a value that
 * is not one of the three is refused with a reason.
 */
import { canonicalBlobbiV3Seed, deriveBlobbiV3Seed, isCanonicalBlobbiD } from '@blobbi-kit/core';

export type BlobbiSource =
  | { kind: 'v3-address'; pubkey: string; d: string; seed: string }
  | { kind: 'v3-seed'; seed: string }
  | { kind: 'demo'; seed: string };

/** What a player types: a seed (V3 or demo) in one field, or an owner pubkey and a `d` tag. */
export interface BlobbiInput {
  seed?: string;
  pubkey?: string;
  d?: string;
}

export type ResolvedBlobbi = { ok: true; source: BlobbiSource; notes: string[] } | { ok: false; error: string };

/** The development Blobbi used when nothing else is chosen. */
export const DEMO_BLOBBI_SEED = 'blobbi-9';

const HEX = /^[0-9a-fA-F]+$/;

/** Resolve a player's input into a Blobbi source, or a readable reason it is not one. Pure. */
export function resolveBlobbi(input: BlobbiInput): ResolvedBlobbi {
  const { pubkey, d, seed } = input;
  if (pubkey !== undefined || d !== undefined) {
    if (seed !== undefined && seed !== '') return { ok: false, error: 'Give either a seed, or an owner pubkey and a d tag, not both.' };
    return resolveAddress(pubkey ?? '', d ?? '');
  }
  return resolveSeed(seed ?? '');
}

function resolveAddress(pubkey: string, d: string): ResolvedBlobbi {
  if (pubkey === '') return { ok: false, error: 'The owner pubkey is missing.' };
  if (/^npub1/i.test(pubkey)) return { ok: false, error: 'The owner pubkey must be hexadecimal (64 digits), not an npub.' };
  if (pubkey.trim() !== pubkey) return { ok: false, error: 'The owner pubkey has spaces around it.' };
  if (!HEX.test(pubkey)) return { ok: false, error: 'The owner pubkey must be 64 hexadecimal digits (0-9, a-f).' };
  if (pubkey.length !== 64) return { ok: false, error: `The owner pubkey must be 64 hexadecimal digits; this one has ${pubkey.length}.` };
  if (pubkey !== pubkey.toLowerCase()) return { ok: false, error: 'The owner pubkey must be lower case, as Nostr writes it (NIP-01).' };
  if (d === '') return { ok: false, error: 'The d tag is missing.' };
  let seed: string;
  try {
    // The kit's derivation, byte for byte: the d tag exactly as given (no trimming or case folding).
    seed = deriveBlobbiV3Seed(pubkey, d);
  } catch (e) {
    return { ok: false, error: `The d tag cannot be used: ${(e as Error).message.replace(/^\[blobbi-kit\]\s*/, '')}` };
  }
  const notes: string[] = [];
  if (!isCanonicalBlobbiD(d)) notes.push('The d tag is not in the canonical form blobbi-<12 hex>-<10 hex>; the seed is derived from it exactly as written.');
  else if (d.slice(7, 19) !== pubkey.slice(0, 12)) notes.push('The d tag names a different owner prefix than this pubkey; the seed is derived from the pair exactly as given.');
  return { ok: true, source: { kind: 'v3-address', pubkey, d, seed }, notes };
}

function resolveSeed(value: string): ResolvedBlobbi {
  if (value === '') return { ok: false, error: 'The Blobbi seed is empty.' };
  const v3 = canonicalBlobbiV3Seed(value);
  if (v3) return { ok: true, source: { kind: 'v3-seed', seed: v3 }, notes: v3 !== value ? ['Read in lower case: a V3 seed has one spelling.'] : [] };
  // Values that are almost a V3 seed are refused rather than drawn as a different (demo) Blobbi.
  const bare = value.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(bare)) return { ok: false, error: 'A V3 seed is 64 hexadecimal digits without a 0x prefix.' };
  if (HEX.test(bare) && bare.length === 64) return { ok: false, error: 'The V3 seed has spaces around it.' };
  if (HEX.test(bare) && bare.length >= 48) return { ok: false, error: `A V3 seed is exactly 64 hexadecimal digits; this one has ${bare.length}.` };
  if (value !== bare) return { ok: false, error: 'The Blobbi seed has spaces around it.' };
  return { ok: true, source: { kind: 'demo', seed: value }, notes: [] };
}

/** The source of a plain seed string (scripts, tests, old links): a V3 seed if it is one, else a demo seed. */
export function sourceFromSeed(seed: string): BlobbiSource {
  const v3 = canonicalBlobbiV3Seed(seed);
  return v3 ? { kind: 'v3-seed', seed: v3 } : { kind: 'demo', seed };
}

/** Two sources are the same Blobbi when they draw from the same seed (an address and its derived seed are one Blobbi). */
export function sameBlobbi(a: BlobbiSource, b: BlobbiSource): boolean {
  return a.seed === b.seed;
}

/** A short human label. */
export function describeSource(s: BlobbiSource): string {
  if (s.kind === 'v3-address') return `V3 ${s.d} (seed ${s.seed.slice(0, 8)}…)`;
  if (s.kind === 'v3-seed') return `V3 seed ${s.seed.slice(0, 8)}…${s.seed.slice(-4)}`;
  return `demo ${s.seed}`;
}
