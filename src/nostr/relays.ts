/**
 * READING PUBLIC PROFILES FROM RELAYS. Read-only by construction: a `ProfileReader` can only ask relays for
 * kind 0 events (REQ) and close; it has no way to send an event (EVENT), answer an AUTH challenge or sign.
 *
 * The default reader opens a Nostrify `NRelay1` per relay only for the request (no reconnection, closed straight
 * after), and NRelay1 verifies every event's signature before returning it. The relays are the ones the Blobbi apps
 * already use; no relay list is read from the player's profile in this version.
 */

/** The relays profiles are read from (the Blobbi ecosystem's defaults; public data only). */
export const DEFAULT_RELAYS: readonly string[] = ['wss://relay.ditto.pub', 'wss://relay.primal.net'];

export interface ProfileReadResult {
  /** Whatever the relays returned (checked later, never trusted). */
  events: unknown[];
  /** How many relays answered before the deadline. */
  reachable: number;
}

export interface ProfileReader {
  readProfile(pubkey: string, relays: readonly string[], signal: AbortSignal): Promise<ProfileReadResult>;
}

/** Ask every relay for the author's newest kind 0; each relay is opened for the request and closed after. */
export function relayProfileReader(): ProfileReader {
  return {
    async readProfile(pubkey, relays, signal) {
      const { NRelay1 } = await import('@nostrify/nostrify');
      const answers = await Promise.allSettled(
        relays.map(async (url) => {
          const relay = new NRelay1(url, { backoff: false, idleTimeout: false });
          try {
            return await relay.query([{ kinds: [0], authors: [pubkey], limit: 1 }], { signal });
          } finally {
            void relay.close().catch(() => {});
          }
        }),
      );
      const events: unknown[] = [];
      let reachable = 0;
      for (const a of answers)
        if (a.status === 'fulfilled') {
          reachable++;
          events.push(...a.value);
        }
      return { events, reachable };
    },
  };
}
