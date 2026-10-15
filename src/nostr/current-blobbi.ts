/**
 * M11D.8, THE CURRENT BLOBBI (read only): which Blobbi the player has chosen as their companion across the Blobbi
 * apps, so the player can step into Blobbi Pixel with it. Nothing here signs, publishes or changes anything.
 *
 * THE CANONICAL SOURCE (audit: docs/architecture/CURRENT-BLOBBI.md). The owner's Blobbonaut profile, kind 11125 (a
 * replaceable event: one per author, the newest wins), carries `current_companion`: the BARE d of one of the owner's
 * kind 31124 Blobbis (the owner is the profile's author; never a full address). Blobbi Standalone republishes it
 * when the player switches Blobbi (`useSetCurrentCompanion`: a fresh profile read, then `updateBlobbonautTags`) and
 * when an egg is adopted. The legacy kind 31125 profile is still read, as the kit does: any 11125 wins over any
 * 31125, even a newer one (kit README). Standalone also keeps a per-device pick (`blobbi:selected:d:<pubkey>` in its
 * own origin's storage), which this game cannot and does not read: across apps, 11125 is what is shared.
 *
 * TRUST: relays are untrusted. Every event used here is checked again: well formed, by the owner, its signature
 * verified (`verifyEvent`, the same check the relay client makes); the profile must be a valid Blobbonaut event (the
 * kit), the reference a canonical d whose 12-hex prefix is the owner's, and the Blobbi itself the newest modern
 * 31124 for that d by its owner (`pickBlobbis`, the kit's rules). Ties between profiles: the lower id (NIP-01).
 *
 * WHAT COMES BACK: the current Blobbi (with its stage, generation and whether it can walk: eggs cannot, V1/V2 only in
 * their world form, as `pickBlobbis` says), or why not: no profile, no `current_companion`, a reference that is not
 * the owner's, a Blobbi no relay returned, or no relay answered at all. A failure never becomes "make another one".
 */
import { isCanonicalBlobbiD, isValidBlobbonautEvent, parseBlobbonautEvent } from '@blobbi-kit/core';
import { verifyEvent, type NostrEvent } from 'nostr-tools/pure';
import { pickBlobbis } from './blobbis';
import { isWellFormedEvent } from './profile';
import type { OwnedBlobbi } from './port';
import type { BlobbiReader, BlobbonautReader, ProfileReadResult } from './relays';

export type CurrentBlobbiResult =
  /** The profile names this Blobbi and a relay returned it (it may still be an egg, or a V1/V2 without colours). */
  | { status: 'current'; blobbi: OwnedBlobbi; items: OwnedBlobbi[]; partial: boolean; profileAt: number }
  /** The profile names a Blobbi of the owner that no relay returned (deleted, not there yet, or a relay missing). */
  | { status: 'missing'; d: string; items: OwnedBlobbi[]; partial: boolean; profileAt: number }
  /** Nothing chosen: no profile, a profile without `current_companion`, or one naming something not the owner's. */
  | { status: 'no-selection'; reason: 'no-profile' | 'no-companion' | 'invalid-reference'; items: OwnedBlobbi[]; partial: boolean }
  /** No relay answered (offline, or too slow): nothing is known, nothing is decided. */
  | { status: 'unavailable' };

export interface CurrentBlobbiDeps {
  profiles: BlobbonautReader;
  blobbis: BlobbiReader;
  relays: readonly string[];
  /** How long the relays get to answer (ms). */
  timeoutMs?: number;
  /** The signature check (tests may pass their own; the default is nostr-tools' `verifyEvent`). */
  verify?: (e: NostrEvent) => boolean;
}

const HEX64 = /^[0-9a-f]{64}$/;

/** The owner's profile among what the relays sent: a valid 11125 before any 31125, then the newest, then the lower id. */
export function pickBlobbonautProfile(events: readonly NostrEvent[], owner: string): NostrEvent | null {
  const valid = events.filter((e) => e.pubkey === owner && (e.kind === 11125 || e.kind === 31125) && isValidBlobbonautEvent(e));
  const order = (a: NostrEvent, b: NostrEvent) => (a.kind === b.kind ? 0 : a.kind === 11125 ? -1 : 1) || b.created_at - a.created_at || (a.id < b.id ? -1 : 1);
  return [...valid].sort(order)[0] ?? null;
}

/** Whether a `current_companion` value can name one of this owner's Blobbis (a canonical d with the owner's prefix). */
export const ownersReference = (d: string, owner: string): boolean => isCanonicalBlobbiD(d) && d.startsWith(`blobbi-${owner.slice(0, 12)}-`);

export async function resolveCurrentBlobbi(owner: string, deps: CurrentBlobbiDeps): Promise<CurrentBlobbiResult> {
  if (!HEX64.test(owner) || !deps.relays.length) return { status: 'unavailable' };
  const verify = deps.verify ?? verifyEvent;
  const abort = new AbortController();
  const timeoutMs = deps.timeoutMs ?? 6000;
  // M11D.8.4: at the deadline the reads are ABORTED and then give back what the answering relays sent (the readers
  // settle on abort). Before, the deadline itself answered "nothing" in the same tick, so one slow relay erased the
  // others' answers and the entry went in as if offline. A reader that ignores the abort gets a short backstop.
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  let backstop: ReturnType<typeof setTimeout> | undefined;
  const never = new Promise<null>((resolve) => (backstop = setTimeout(() => resolve(null), timeoutMs + 1000)));
  const read = (p: Promise<ProfileReadResult>) => Promise.race([p.catch(() => null), never]);
  let profileRes: ProfileReadResult | null;
  let blobbiRes: ProfileReadResult | null;
  try {
    [profileRes, blobbiRes] = await Promise.all([read(deps.profiles.readBlobbonaut(owner, deps.relays, abort.signal)), read(deps.blobbis.readBlobbis(owner, deps.relays, abort.signal))]);
  } finally {
    clearTimeout(timer);
    clearTimeout(backstop);
    abort.abort();
  }
  // Without the profile nothing about the choice is known: never guess one from the Blobbis alone.
  if (!profileRes || profileRes.reachable === 0) return { status: 'unavailable' };
  const authentic = (events: readonly unknown[]) =>
    events.filter((e): e is NostrEvent => {
      if (!isWellFormedEvent(e) || e.pubkey !== owner) return false;
      try {
        return verify(e as NostrEvent);
      } catch {
        return false;
      }
    });
  const partial = profileRes.reachable < deps.relays.length || !blobbiRes || blobbiRes.reachable < deps.relays.length;
  const items = blobbiRes && blobbiRes.reachable > 0 ? pickBlobbis(authentic(blobbiRes.events), owner).items : [];
  const profile = pickBlobbonautProfile(authentic(profileRes.events), owner);
  if (!profile) return { status: 'no-selection', reason: 'no-profile', items, partial };
  const d = parseBlobbonautEvent(profile)?.currentCompanion?.trim();
  if (!d) return { status: 'no-selection', reason: 'no-companion', items, partial };
  if (!ownersReference(d, owner)) return { status: 'no-selection', reason: 'invalid-reference', items, partial };
  const blobbi = items.find((b) => b.d === d);
  if (!blobbi) return { status: 'missing', d, items, partial, profileAt: profile.created_at };
  return { status: 'current', blobbi, items, partial, profileAt: profile.created_at };
}
