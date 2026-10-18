/**
 * ONE GAME PER BROWSER. The island lives in localStorage and every tab keeps its own copy in memory, so two open tabs
 * would each save over the other (the last write wins, and a stale tab can undo hours of play). The game therefore
 * starts only in the tab that holds one Web Lock (`GAME_LOCK`); another tab says so and waits, then starts by itself
 * the moment the lock is free (the other tab closed), reading the island fresh from storage.
 *
 *  - The lock is the browser's: it is per origin and per browser profile, and it goes away with its tab, also when
 *    the tab crashes. Nothing is stored for it, so nothing can be left stuck.
 *  - A page kept in the back/forward cache lets the lock go (`pagehide`) and reloads if it is shown again
 *    (`pageshow` with `persisted`), so it can never come back running beside the tab that took over.
 *  - Never `steal`: the tab that holds the lock may hold progress not saved yet.
 *  - Without Web Locks (an insecure context, a very old browser) the game starts as before, unguarded: production is
 *    served over HTTPS, where every supported browser has them.
 */

/** The lock's name: the same in every tab of this origin. */
export const GAME_LOCK = 'blobbi-pixel:game';

/** The part of `navigator.locks` used here. */
export interface TabLocks {
  request(name: string, options: { ifAvailable: true }, fn: (lock: unknown) => Promise<unknown> | null): Promise<unknown>;
  request(name: string, fn: (lock: unknown) => Promise<unknown>): Promise<unknown>;
}

export interface ClaimDeps {
  locks: TabLocks | undefined;
  /** Starts the game (once). */
  start: () => void;
  /** Another tab holds the game: say so. */
  waiting: () => void;
  /** Where the back/forward cache events arrive (the window). */
  win?: Pick<Window, 'addEventListener'>;
  /** Reloads the page (a page restored from the back/forward cache). */
  reload?: () => void;
}

export type ClaimResult = 'started' | 'waiting' | 'unguarded';

/** Starts the game in this tab once it holds the game lock; resolves with what happened first. */
export function claimTab(deps: ClaimDeps): Promise<ClaimResult> {
  if (!deps.locks || typeof deps.locks.request !== 'function') {
    deps.start();
    return Promise.resolve('unguarded');
  }
  const locks = deps.locks;
  let release: (() => void) | null = null;
  let started = false;
  const hold = (): Promise<void> => {
    if (!started) {
      started = true;
      deps.start();
    }
    return new Promise<void>((resolve) => (release = resolve));
  };
  deps.win?.addEventListener('pagehide', () => release?.());
  deps.win?.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) (deps.reload ?? (() => location.reload()))();
  });
  return new Promise<ClaimResult>((resolve) => {
    void locks.request(GAME_LOCK, { ifAvailable: true }, (lock) => {
      if (lock) {
        resolve('started');
        return hold();
      }
      deps.waiting();
      resolve('waiting');
      // Queued: granted when the tab holding it closes.
      void locks.request(GAME_LOCK, () => hold());
      return null;
    });
  });
}
