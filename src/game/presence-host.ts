/**
 * World presence in Blobbi Pixel (world-presence.ts, presence-page.ts): while the player plays here, their Blobbi is
 * here; when they go back to the Blobbi home (the Standalone) and play there, it goes home; a Pixel tab left hidden
 * or idle lets it drift home on its own. The host only wires it: the page is made for the signed-in account whose
 * Blobbi is walking (a guest Blobbi or a local one travels nowhere), and its journeys are the game's own teleport
 * (`LiveWorld.leaveBlobbi` / `enterBlobbi`).
 *
 * No network, no Nostr, no signer: the lease is a first-party cookie (presence-page.ts says why). The companion
 * choice is untouched: which Blobbi it is stays the companion sync's business.
 */
import { createPresencePage, syncPresence, type LeaseStore, type PresencePage, type PresencePageOptions, type PresenceSync, type ShownBlobbi } from './presence-page';
import { PIXEL_APP } from './world-presence';

export interface PresenceHostDeps {
  /** The pubkey whose Blobbi is walking here, or null (signed out, a guest or local Blobbi, presence off). */
  account(): string | null;
  /** The Blobbi on screen, or null while there is no world in play. */
  blobbi(): ShownBlobbi | null;
  /** The game's own moment, which a departure waits for (a menu, a speech, a timed action, a building mode). */
  busy(): boolean;
  /** The game is driving the teleport itself (the title, an intro, a visit's handoff): presence stands aside. */
  paused(): boolean;
  /** A journey began because of where the Blobbi is (`leave` names where it went). */
  onJourney(kind: 'enter' | 'leave', place: string): void;
  store(pubkey: string): LeaseStore;
  /** Test seams for the page and the sync (clock, timers, window and document). */
  page?: Partial<Omit<PresencePageOptions, 'app' | 'store'>>;
  sync?: { now?: () => number; setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (h: unknown) => void };
}

export interface PresenceHost {
  /** Follow the account and the walking Blobbi (cheap; call when either may have changed, or every frame). */
  update(): void;
  /** Look again now (the game's moment ended). */
  check(): void;
  /** Whether the Blobbi belongs here now (true while presence is not running). */
  here(): boolean;
  /** Where it is (`home`, `pixel`, …), or null while presence is not running. */
  place(): string | null;
  dispose(): void;
}

export function createPresenceHost(deps: PresenceHostDeps): PresenceHost {
  let owner: string | null = null;
  let page: PresencePage | null = null;
  let sync: PresenceSync | null = null;
  const stop = () => {
    sync?.dispose();
    page?.dispose();
    sync = null;
    page = null;
    owner = null;
  };
  const shown: ShownBlobbi = {
    // Paused or between worlds: shown as present, so nothing is asked of a teleport the game is driving
    state: () => (deps.paused() ? 'present' : (deps.blobbi()?.state() ?? 'present')),
    enter: () => {
      if (!deps.paused()) deps.blobbi()?.enter();
    },
    leave: () => {
      if (!deps.paused()) deps.blobbi()?.leave();
    },
  };
  return {
    update() {
      const pubkey = deps.account();
      if (pubkey === owner) return;
      stop();
      if (!pubkey) return;
      owner = pubkey;
      page = createPresencePage({ app: PIXEL_APP, store: deps.store(pubkey), ...deps.page });
      sync = syncPresence({ page, blobbi: shown, busy: () => deps.busy() || deps.paused(), onJourney: deps.onJourney, ...deps.sync });
    },
    check() {
      sync?.check();
    },
    here: () => page?.snapshot().here ?? true,
    place: () => page?.snapshot().place ?? null,
    dispose: stop,
  };
}
