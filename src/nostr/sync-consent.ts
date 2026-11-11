/**
 * THE ACCOUNT'S CHOICE TO HAVE ITS EXISTING EVENTS COPIED BETWEEN THE RELAYS (off until it says otherwise).
 *
 * Opening the game, a remembered account, the answer to a read: none of them sends anything. An event that already
 * exists (signed in an earlier visit, or by another Blobbi app) is offered to a relay that lacks it only after the
 * account turned this on in SETTINGS > ACCOUNT, where the relays that would receive copies are listed, and only to
 * those very relays: a relay added to the game later is not covered until the account is asked again. What the
 * player does NOW (sharing a Blobbi, choosing a companion, a move between worlds) is a new publication and never
 * passes through here.
 *
 * Record `blobbi-pixel-lab:relay-sync-consent`: `{ version: 1, accounts: { <pubkey>: { enabled, at, destinations } } }`
 * (public keys, relay urls and a time: nothing secret). Types and constants only: no network library is loaded.
 */
import type { KeyValueStore } from '../game/persistence';
import { PUBLISH_RELAYS } from './relay-config';
import { SyncConsent, type SyncConsentRecord } from './relay-routing';

export const SYNC_CONSENT_KEY = 'blobbi-pixel-lab:relay-sync-consent';

/** The relays an account is shown, and that would receive copies of its existing events. */
export const SYNC_DESTINATIONS: readonly string[] = PUBLISH_RELAYS;

/** The stored choices as they stand now (read afresh each time: the settings page and the network module share them). */
export function syncConsent(store: KeyValueStore, now: () => number = Date.now): SyncConsent {
  let initial: Record<string, SyncConsentRecord> = {};
  try {
    const v = JSON.parse(store.get(SYNC_CONSENT_KEY) ?? 'null') as { version?: unknown; accounts?: unknown } | null;
    if (v?.version === 1 && v.accounts && typeof v.accounts === 'object') initial = v.accounts as Record<string, SyncConsentRecord>;
  } catch {
    /* unreadable: nobody consented */
  }
  return new SyncConsent({
    now,
    initial,
    onChange: (accounts) => {
      try {
        store.set(SYNC_CONSENT_KEY, JSON.stringify({ version: 1, accounts }));
      } catch {
        /* not kept: the choice lasts for this call only, and nothing is carried on a guess */
      }
    },
  });
}

/** What the settings page shows for an account: on only when every relay of the game is covered by its answer. */
export function syncChoice(store: KeyValueStore, pubkey: string | null): { on: boolean; relays: string[] } {
  const consent = syncConsent(store);
  return { on: consent.isEnabled(pubkey) && consent.uncovered(pubkey, SYNC_DESTINATIONS).length === 0, relays: [...SYNC_DESTINATIONS] };
}

/** The account's answer: on for exactly the relays it was shown, or off. */
export function setSyncChoice(store: KeyValueStore, pubkey: string, on: boolean, now: () => number = Date.now): void {
  const consent = syncConsent(store, now);
  if (on) consent.enable(pubkey, SYNC_DESTINATIONS);
  else consent.disable(pubkey);
}
