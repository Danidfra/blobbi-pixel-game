/**
 * M11D.6, THE RELAYS (one place): which relays Blobbi Pixel reads public data from and publishes a Blobbi's canonical
 * events to, the confirmation policy, and how a build decides between REHEARSAL and LIVE publishing. Types and
 * constants only: importing this file never loads a network library.
 *
 * WHY THESE RELAYS: a Blobbi born here must be found by the other Blobbi apps, so Pixel uses the relays the ecosystem
 * already uses, never a Pixel-only set (docs/milestones/M11D6.md, "Relay choices", has the evidence per app):
 *   relay.blobbi.pet    THE PRIMARY: the Blobbi ecosystem's own relay, asked and written to first
 *   relay.ditto.pub     read by Blobbi Standalone, Blobbi Island and Ditto: the one relay every app shares
 *   relay.primal.net    read by Standalone and Island
 *   relay.dreamith.to   read by Ditto (for an identity with no relay list of its own, as a Pixel guest)
 * relay.nostr.band (still in Standalone's list) did not answer on 2026-10-13 and is left out.
 *
 * THE PRIMARY IS NEVER A GATE. relay.blobbi.pet is young (it may hold nothing of a player yet) and its writes may be
 * limited to a list of authors (`blocked:`). So: its silence, its emptiness or its refusal never holds a registration,
 * a companion choice or a read back; "this account has nothing" is concluded only when every SECONDARY relay answered
 * (`emptyIsKnown`), never from the primary alone; and the profile census keeps asking the two relays every Blobbi app
 * writes profiles to (`PROFILE_REQUIRED_RELAYS`, which the primary is deliberately not part of). An event the
 * secondaries hold and the primary lacks is owed to the primary like to any other relay (`spread`, `relay-sync.ts`).
 *
 * CONFIRMATION POLICY: an event counts as shared (DELIVERED) once ONE of these relays READS IT BACK (a fresh query
 * returns the very event, or a newer one by the same owner that still says the same). A relay's `OK` alone is recorded
 * but is not enough, and a WebSocket send with no `OK` counts for nothing. One relay is enough because one relay down
 * (relay.ditto.pub answered 502 on 2026-10-17) must never hold a player back: until then a share needed two relays,
 * relay.ditto.pub among them, and stayed PARTIAL for as long as it was down. Every other relay is still OWED the
 * event: the signed event is kept, and the relays still missing it are sent that very event later (`spread`), never
 * a new signature, until each holds it or refuses it for good. Nothing read back anywhere is a failure (nothing lost).
 *
 * LIVE OR REHEARSAL: REHEARSAL (an in-browser relay, nothing leaves the device) unless the BUILD says live
 * (`VITE_BLOBBI_PUBLISH=live`, the owner's release decision) or, in a DEVELOPMENT server only, the page is opened with
 * `#publish=live`. A production build ignores the page flag, so no link can switch a player to real relays.
 */

import { BLOBBI_RELAY_URL, classifyRejection, summarizeDelivery, withPrimaryRelay } from './relay-routing';

/** The Blobbi ecosystem's own relay: first in every list here, and never the only word on what a player has. */
export const PRIMARY_RELAY: string = BLOBBI_RELAY_URL;

/** The relays Pixel used before the primary existed, kept as they were: every event still goes to each of them. */
export const SECONDARY_RELAYS: readonly string[] = ['wss://relay.ditto.pub', 'wss://relay.primal.net', 'wss://relay.dreamith.to'];

/** Where canonical Blobbi events are published (and read back from): the primary first, then the secondaries. */
export const PUBLISH_RELAYS: readonly string[] = withPrimaryRelay(SECONDARY_RELAYS, PRIMARY_RELAY);

/** Where public profiles and a player's Blobbis are read from (the same set: what is published can be found). */
export const READ_RELAYS: readonly string[] = PUBLISH_RELAYS;

/**
 * Companion sync: the player's profile (kind 11125) is replaceable, so a new current Blobbi is written only over a
 * profile read from EACH of these relays (every Blobbi app, this game, Blobbi Standalone and Ditto, writes profiles to
 * both: the newest profile is on one of them). The same set as Blobbi Standalone's `PROFILE_REQUIRED_RELAYS`.
 */
export const PROFILE_REQUIRED_RELAYS: readonly string[] = ['wss://relay.ditto.pub', 'wss://relay.primal.net'];

/** Whether an event is delivered: at least one of these relays read it back. */
export const policyMet = (relays: readonly string[], holders: readonly string[]): boolean => holders.some((h) => relays.includes(h));

/** The relays of this set still owed an event (not read back there yet). */
export const missingFrom = (relays: readonly string[], holders: readonly string[]): string[] => relays.filter((r) => !holders.includes(r));

/**
 * A relay's refusal that will not change by sending again (NIP-01 prefixes; the shared `classifyRejection`): it is no
 * longer owed the event. The primary's write list answers `blocked`: that ends the deliveries to it, and only to it.
 */
export const permanentRefusal = (reason: string): boolean => classifyRejection(reason) === 'rejected';

/** The relays of a set whose answer is needed before "nothing there" is believed: every one but the primary. */
export const secondariesOf = (relays: readonly string[]): string[] => relays.filter((r) => r !== PRIMARY_RELAY);

/**
 * Whether "the relays returned nothing" is a FACT about the player, or only silence. A fact once every secondary
 * relay answered: the primary's own answer is neither needed (it may be down) nor enough (it may be empty of a player
 * the other relays know). A set with no secondary at all needs every relay. A reader that cannot tell which relays
 * answered (`answered` absent) is believed only when all of them did.
 */
export function emptyIsKnown(relays: readonly string[], read: { reachable: number; answered?: readonly string[] }): boolean {
  if (!read.answered) return read.reachable >= relays.length;
  const must = secondariesOf(relays);
  return (must.length ? must : relays).every((r) => read.answered!.includes(r));
}

/** Where the primary stands for something the relays were sent: it holds it, is still owed it, or refused it for good. */
export type PrimaryStanding = 'held' | 'pending' | 'refused';

/**
 * The primary's standing for an event that IS delivered (some relay of the set holds it): `pending` and `refused` are
 * states of a share that went through, never failures. Undefined when nothing is delivered yet, or for a set without
 * the primary (the shared `summarizeDelivery` over each relay's verdict).
 */
export function primaryStanding(relays: readonly string[], holders: readonly string[], refused: readonly string[]): PrimaryStanding | undefined {
  const s = summarizeDelivery(
    relays.map((relay) => ({ relay, verdict: holders.includes(relay) ? ('accepted' as const) : refused.includes(relay) ? ('rejected' as const) : ('retry' as const) })),
    PRIMARY_RELAY,
  );
  return s.primaryDelivered ? 'held' : s.primaryRejected ? 'refused' : s.primaryPending ? 'pending' : undefined;
}

/** The publishing mode of this page: the build's decision; the page flag only on a development server. */
export function publishModeFor(o: { buildMode?: string; dev: boolean; hash: URLSearchParams }): 'live' | 'rehearsal' {
  if (o.buildMode === 'live') return 'live';
  return o.dev && o.hash.get('publish') === 'live' ? 'live' : 'rehearsal';
}
