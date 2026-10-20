/**
 * THE DEPARTURE TO ANOTHER BLOBBI WORLD (the World Travel menu's VISIT): the game's half of leaving. The move itself
 * is the shared rule (`world-travel-departure.ts`, `departTo`): this World signs and publishes the one World Location
 * that puts the Blobbi in the destination, then the page goes to the destination's plain address.
 *
 *   1. On the press the island is saved, the Blobbi's teleport departure starts (when it is here and present), and
 *      the move is started AT ONCE (`depart`): a fresh read, one signature (a silent one from this game's vault, or
 *      the extension's prompt, where the choice was just made), one publication.
 *   2. The page leaves once BOTH are over: the departure has played (the Blobbi is gone; or no departure could play;
 *      or it is taking too long, `maxWaitMs`) and the move is settled (moved, already there, or not made). A refusal,
 *      a timeout or unreachable relays still leave: the Blobbi simply stays where it was, and the destination, which
 *      treats being opened as the same intention, asks for the move again when it loads.
 *   3. One trip at a time: a second press while one is under way does nothing (`'busy'`), so no second signature is
 *      ever asked for and no second navigation started. If the page has not left `failMs` after navigating, the trip
 *      failed (a blocked navigation): the Blobbi comes back and the player is told.
 *
 * Pure: time, timers, the teleport and the page are passed in, so it runs in tests without a page.
 */
import type { BlobbiWorld } from './blobbi-worlds';
import type { DepartureOutcome } from './world-travel-departure';

export type DeparturePhase = 'idle' | 'leaving' | 'failed';
/** The move's state: none could be started (no session, nothing to move), under way, or its outcome. */
export type MoveState = 'none' | 'moving' | DepartureOutcome;

export interface DepartureState {
  phase: DeparturePhase;
  world: BlobbiWorld | null;
  move: MoveState;
  /** The page was asked to go (once). */
  navigated: boolean;
}

export interface DepartureDeps {
  /**
   * Move the Blobbi to a destination World from here (`departTo`): null at once when no move can be made (world
   * travel off, no session, the Blobbi not the account's). The promise never rejects.
   */
  depart(destination: string): Promise<DepartureOutcome> | null;
  /** Start the Blobbi's teleport departure; false when there is nothing to play (absent, no world). */
  leave(): boolean;
  /** The departure has played out (the Blobbi is absent). */
  gone(): boolean;
  /** After a failed trip: the Blobbi comes back. */
  comeBack(): void;
  /** Save the island before leaving. */
  save(): void;
  /** Go to the address (the page is left). */
  navigate(url: string): void;
  onChange?(state: DepartureState): void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  /** How long after navigating a page still here means the trip failed (ms). */
  failMs?: number;
  /** How long a departure animation may hold the trip (ms): after that the page leaves anyway. */
  maxWaitMs?: number;
}

export interface Departure {
  state(): DepartureState;
  /** Start a trip; `'busy'` while one is under way. */
  go(world: BlobbiWorld): 'started' | 'busy';
  /** Each frame: leave when the departure and the move are both over. */
  update(): void;
  /** The page is leaving (pagehide): the failure timer is dropped. */
  left(): void;
  /** After a failure: back to idle (the notice was shown). */
  reset(): void;
}

export const DEPARTURE_FAIL_MS = 5_000;
export const DEPARTURE_MAX_WAIT_MS = 8_000;

export function createDeparture(deps: DepartureDeps): Departure {
  const now = deps.now ?? (() => performance.now());
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const failMs = deps.failMs ?? DEPARTURE_FAIL_MS;
  const maxWaitMs = deps.maxWaitMs ?? DEPARTURE_MAX_WAIT_MS;
  let state: DepartureState = { phase: 'idle', world: null, move: 'none', navigated: false };
  let settled = false;
  let animating = false;
  let startedAt = 0;
  let failTimer: unknown = null;
  /** Which trip a move belongs to: an old one that settles late is ignored. */
  let trip = 0;
  const set = (next: Partial<DepartureState>) => {
    state = { ...state, ...next };
    deps.onChange?.(state);
  };

  return {
    state: () => state,
    go(world) {
      if (state.phase === 'leaving') return 'busy';
      if (failTimer !== null) clearTimer(failTimer);
      failTimer = null;
      trip++;
      const mine = trip;
      settled = false;
      startedAt = now();
      deps.save();
      animating = deps.leave();
      const pending = deps.depart(world.travelId);
      set({ phase: 'leaving', world, move: pending ? 'moving' : 'none', navigated: false });
      if (!pending) settled = true;
      else {
        pending.then(
          (outcome) => {
            if (mine !== trip) return;
            settled = true;
            set({ move: outcome });
          },
          () => {
            if (mine !== trip) return;
            settled = true;
            set({ move: 'unreachable' });
          },
        );
      }
      return 'started';
    },
    update() {
      if (state.phase !== 'leaving' || state.navigated || !settled) return;
      if (animating && !deps.gone() && now() - startedAt < maxWaitMs) return;
      const world = state.world!;
      set({ navigated: true });
      deps.navigate(world.url);
      failTimer = setTimer(() => {
        failTimer = null;
        if (state.phase !== 'leaving') return;
        set({ phase: 'failed' });
        deps.comeBack();
      }, failMs);
    },
    left() {
      if (failTimer !== null) clearTimer(failTimer);
      failTimer = null;
    },
    reset() {
      if (state.phase === 'leaving') return;
      set({ phase: 'idle', world: null, move: 'none', navigated: false });
    },
  };
}
