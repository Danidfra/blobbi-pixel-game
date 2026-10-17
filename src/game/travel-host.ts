/**
 * M16, WORLD TRAVEL in Blobbi Pixel: the account's Blobbi has ONE canonical World on Nostr (its World Location,
 * kind 31126; `@blobbi-kit/core`'s world-travel). When it is elsewhere (Blobbi Home on any device), it is not walking
 * here; the player's first press in play calls it over (one signed World Location), and a move made elsewhere sends
 * it away with the game's own teleport. Replaces world presence v1's cookie lease while world travel is on (the
 * cookie is then never read or written); with it off, `presence-host.ts` runs exactly as before.
 *
 * The host only wires it. Who may travel (the connected account's own walking Blobbi), the session (relays, signer,
 * store; `src/nostr/world-travel.ts`), the teleport (`LiveWorld.leaveBlobbi` / `enterBlobbi` / `settleBlobbi`) and the
 * words are the playground's. Nothing here reaches the network.
 *
 * Rules kept from v1: only a real input (a trusted press or key in a visible, focused page) is the player's act, and
 * only once play has started (the title's and menus' own presses are not); focus, visibility, a timer or a remote
 * change never travel. A departure waits for the game's moment; the game's own journeys come first (paused).
 */
import { isMeaningfulInput, isPlayedNow, syncTravel, type ShownBlobbi, type TravelOutcome, type TravelSync, type WorldTravelSession, type WorldTravelSnapshot } from '@blobbi-kit/core';

export interface TravelSessionHandle {
  session: WorldTravelSession;
  /** The page was hidden or shown (the relays' live stream follows it). */
  setVisible?(visible: boolean): void;
  /** Called when the session ends (after `session.dispose()`). */
  dispose?(): void;
}

export interface TravelHostDeps {
  /** The connected account's own walking Blobbi when world travel may run for it (else null: a guest, a local Blobbi). */
  account(): { owner: string; d: string } | null;
  /** Make the session for that Blobbi; `isActive` says whether the game is being played now (for presence). */
  session(owner: string, d: string, hooks: { isActive: () => boolean }): TravelSessionHandle;
  /** The Blobbi on screen, or null while there is no world in play. */
  blobbi(): ShownBlobbi | null;
  /** The game's own moment, which a departure waits for (a menu, a speech, a timed action, building). */
  busy(): boolean;
  /** The game is driving the teleport itself (the title, an intro, a visit's handoff, a swap): travel stands aside. */
  paused(): boolean;
  /** Play has started: a press now is the player playing here (not the title's or a menu's own press). */
  playing(): boolean;
  /** A journey began because of where the Blobbi is (`leave` names where it went). */
  onJourney(kind: 'enter' | 'leave', place: string): void;
  /** What a request to come here came to (a notice for the player), with where the Blobbi is now. */
  onOutcome(outcome: TravelOutcome, snapshot: WorldTravelSnapshot): void;
  /** The session changed (the travel phase, presence, the place). */
  onChange?(snapshot: WorldTravelSnapshot): void;
  /** Test seams. */
  doc?: Pick<Document, 'visibilityState' | 'hasFocus' | 'addEventListener' | 'removeEventListener'>;
  win?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

export interface TravelHost {
  /** Follow the account and the walking Blobbi (cheap; call every frame). */
  update(): void;
  /** Look again now (the game's moment ended). */
  check(): void;
  /** The player asked for it explicitly (a button): come here, even right after a move elsewhere. */
  callHere(): Promise<TravelOutcome | null>;
  /** The session's snapshot, or null while there is none. */
  snapshot(): WorldTravelSnapshot | null;
  /** Whether the Blobbi belongs here now (true while there is no session: a guest or a local Blobbi walks freely). */
  here(): boolean;
  /** The walking Blobbi's teleport state, or null. */
  shown(): string | null;
  setPresenceEnabled(on: boolean): void;
  dispose(): void;
}

const INPUTS = ['pointerdown', 'keydown'] as const;
/** A press this recent when play begins is the press that began it. */
export const PLAY_START_PRESS_MS = 2_000;

export function createTravelHost(deps: TravelHostDeps): TravelHost {
  const doc = deps.doc ?? document;
  const win = deps.win ?? window;
  const now = deps.now ?? (() => Date.now());
  const visible = () => doc.visibilityState === 'visible';
  const focused = () => {
    try {
      return doc.hasFocus();
    } catch {
      return false;
    }
  };
  let owner: string | null = null;
  let d: string | null = null;
  let handle: TravelSessionHandle | null = null;
  let sync: TravelSync | null = null;
  let unsubscribe: (() => void) | null = null;
  let lastInputAt: number | null = null;
  /** The last trusted press anywhere (the title's and menus' too): the press that starts play is the player's choice. */
  let lastPressAt: number | null = null;
  let wasPlaying = false;
  let visibleSince: number | null = visible() ? now() : null;
  let disposed = false;

  const stop = () => {
    unsubscribe?.();
    sync?.dispose();
    handle?.session.dispose();
    handle?.dispose?.();
    unsubscribe = null;
    sync = null;
    handle = null;
    owner = null;
    d = null;
  };

  const request = async (explicit: boolean): Promise<TravelOutcome | null> => {
    const h = handle;
    if (!h) return null;
    const out = await h.session.travel({ explicit });
    if (handle === h && !disposed) deps.onOutcome(out, h.session.snapshot());
    return out;
  };

  const onInput = (e: Event) => {
    if (disposed || !handle) return;
    if (!isMeaningfulInput({ trusted: e.isTrusted, visible: visible(), focused: focused() || visible() })) return;
    lastPressAt = now();
    if (!deps.playing()) return;
    lastInputAt = now();
    const s = handle.session.snapshot();
    handle.session.noteActivity();
    // Not here and nothing under way: the player playing here calls it over (a casual request: the kit never undoes a
    // move just made elsewhere, and asks nothing again soon after a refusal)
    if (!s.here && (s.travel.phase === 'idle' || s.travel.phase === 'failed') && !deps.paused()) void request(false);
  };
  const onVisibility = () => {
    visibleSince = visible() ? now() : null;
    handle?.session.setVisible(visible());
    handle?.setVisible?.(visible());
    sync?.check();
  };
  for (const type of INPUTS) win.addEventListener(type, onInput, { capture: true, passive: true });
  doc.addEventListener('visibilitychange', onVisibility);

  return {
    update() {
      if (disposed) return;
      // Play starting because of a press (NEW ADVENTURE WITH BAMBU, CONTINUE...) is the player choosing to play with
      // this Blobbi here: it is called over, as a press in play would. An entry with no press (a startup that goes
      // straight into an island) never travels: nothing signs on load
      const playing = deps.playing();
      if (playing && !wasPlaying && handle && lastPressAt !== null && now() - lastPressAt < PLAY_START_PRESS_MS) {
        const s = handle.session.snapshot();
        if (!s.here && (s.travel.phase === 'idle' || s.travel.phase === 'failed')) void request(false);
      }
      wasPlaying = playing;
      const a = deps.account();
      if (a?.owner === owner && a?.d === d) return;
      stop();
      if (!a) return;
      owner = a.owner;
      d = a.d;
      handle = deps.session(a.owner, a.d, { isActive: () => isPlayedNow({ visible: visible(), lastInputAt, now: now() }) });
      handle.session.setVisible(visible());
      handle.setVisible?.(visible());
      const session = handle.session;
      unsubscribe = session.subscribe((s) => deps.onChange?.(s));
      sync = syncTravel({
        source: session,
        blobbi: {
          state: () => deps.blobbi()?.state() ?? (session.snapshot().here ? 'present' : 'absent'),
          enter: () => deps.blobbi()?.enter(),
          leave: () => deps.blobbi()?.leave(),
          settle: (state) => {
            const b = deps.blobbi();
            if (!b) return;
            if (b.settle) b.settle(state);
            else if (state === 'present') b.enter();
            else b.leave();
          },
        },
        busy: () => deps.busy(),
        paused: () => deps.paused() || !deps.blobbi(),
        page: () => ({ visible: visibleSince !== null, visibleSince }),
        onJourney: (kind, place) => deps.onJourney(kind, place),
        now,
        setTimer: deps.setTimer,
        clearTimer: deps.clearTimer,
      });
    },
    check: () => sync?.check(),
    callHere: () => request(true),
    snapshot: () => handle?.session.snapshot() ?? null,
    here: () => handle?.session.snapshot().here ?? true,
    shown: () => deps.blobbi()?.state() ?? null,
    setPresenceEnabled: (on) => handle?.session.setPresenceEnabled(on),
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      for (const type of INPUTS) win.removeEventListener(type, onInput, { capture: true });
      doc.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

/** Whether world travel on Nostr runs in this page (M16; off by default, the kinds are provisional). */
export function worldTravelMode(o: { buildMode?: string; dev: boolean; hash: URLSearchParams; stored: string | null }): 'nostr' | 'off' {
  if (o.buildMode === 'nostr') return 'nostr';
  if (!o.dev) return 'off';
  return o.hash.get('world-travel') === 'nostr' || o.stored === 'nostr' ? 'nostr' : 'off';
}

export const WORLD_TRAVEL_SWITCH_KEY = 'blobbi:world-travel:v1';
/** The player's choice of Active Presence, per account (absent: off). */
export const activePresenceKey = (pubkey: string) => `blobbi:active-presence:v1:${pubkey}`;
