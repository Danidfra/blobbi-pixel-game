/**
 * M11D.6, THE RELAYS (one place): which relays Blobbi Pixel reads public data from and publishes a Blobbi's canonical
 * events to, the confirmation policy, and how a build decides between REHEARSAL and LIVE publishing. Types and
 * constants only: importing this file never loads a network library.
 *
 * WHY THESE RELAYS: a Blobbi born here must be found by the other Blobbi apps, so Pixel uses the relays the ecosystem
 * already uses, never a Pixel-only set (docs/milestones/M11D6.md, "Relay choices", has the evidence per app):
 *   relay.ditto.pub     read by Blobbi Standalone, Blobbi Island and Ditto: the one relay every app shares (REQUIRED)
 *   relay.primal.net    read by Standalone and Island
 *   relay.dreamith.to   read by Ditto (for an identity with no relay list of its own, as a Pixel guest)
 * relay.nostr.band (still in Standalone's list) did not answer on 2026-10-13 and is left out.
 *
 * CONFIRMATION POLICY: an event counts as shared only when it is READ BACK (a fresh query returns the very event, or a
 * newer one by the same owner that still says the same) from at least `quorum` relays, `REQUIRED_RELAY` among them. A relay's `OK` alone is
 * recorded but is not enough, and a WebSocket send with no `OK` counts for nothing. Fewer than `quorum` relays
 * holding it is a PARTIAL share: the Blobbi may already be discoverable, the run stays open and a retry sends the
 * same signed events only to the relays still missing them.
 *
 * LIVE OR REHEARSAL: REHEARSAL (an in-browser relay, nothing leaves the device) unless the BUILD says live
 * (`VITE_BLOBBI_PUBLISH=live`, the owner's release decision) or, in a DEVELOPMENT server only, the page is opened with
 * `#publish=live`. A production build ignores the page flag, so no link can switch a player to real relays.
 */

/** Where canonical Blobbi events are published (and read back from). */
export const PUBLISH_RELAYS: readonly string[] = ['wss://relay.ditto.pub', 'wss://relay.primal.net', 'wss://relay.dreamith.to'];

/** The relay every Blobbi app reads: a share is confirmed only once it holds the events (when it is in the set). */
export const REQUIRED_RELAY = 'wss://relay.ditto.pub';

/** Where public profiles and a player's Blobbis are read from (the same set: what is published can be found). */
export const READ_RELAYS: readonly string[] = PUBLISH_RELAYS;

/** How many relays must hold an event (read back) for it to count as shared: two, or every relay if fewer. */
export const quorumFor = (relays: readonly string[]): number => Math.min(2, relays.length);

/** Whether the relays holding an event (read back) meet the policy for this relay set. */
export const policyMet = (relays: readonly string[], holders: readonly string[]): boolean => holders.filter((h) => relays.includes(h)).length >= quorumFor(relays) && (!relays.includes(REQUIRED_RELAY) || holders.includes(REQUIRED_RELAY));

/** The publishing mode of this page: the build's decision; the page flag only on a development server. */
export function publishModeFor(o: { buildMode?: string; dev: boolean; hash: URLSearchParams }): 'live' | 'rehearsal' {
  if (o.buildMode === 'live') return 'live';
  return o.dev && o.hash.get('publish') === 'live' ? 'live' : 'rehearsal';
}
