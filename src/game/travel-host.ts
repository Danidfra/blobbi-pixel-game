/**
 * M16, WORLD TRAVEL in Blobbi Pixel: the account's Blobbi has ONE canonical World on Nostr (its World Location,
 * kind 31126; `@blobbi-kit/core`'s world-travel). When it is elsewhere (Blobbi Home on any device), it is not walking
 * here; a few interactions with this World call it over (M16.1: the kit's `interact`, three distinct ones within
 * 20 s, then one signed World Location), "Call {name} here" calls it at once, and a move made elsewhere sends it away
 * with the game's own teleport. It is the only model of where the Blobbi is (the cookie-based world presence v1 was
 * removed): with world travel off, the Blobbi simply walks here, and nothing about its place is read, kept or sent.
 *
 * The host only wires it. Who may travel (the connected account's own walking Blobbi), the session (relays, signer,
 * store; `src/nostr/world-travel.ts`), the teleport (`LiveWorld.leaveBlobbi` / `enterBlobbi` / `settleBlobbi`) and the
 * words are the playground's. Nothing here reaches the network.
 *
 * Rules: only a real input (a trusted press or key in a visible, focused page) is the player's act, and
 * only once play has started (the title's and menus' own presses are not); focus, visibility, a timer, a frame or a
 * remote change never count. A held key's auto-repeat (`KeyboardEvent.repeat`) is never counted, and inputs less than
 * a second apart are one gesture (the kit's gap), so walking with a held key is one interaction and walking by taps
 * is one per burst. The press that starts play (NEW ADVENTURE, CONTINUE) counts once, never as a move
 * by itself. A departure waits for the game's moment; the game's own journeys come first (paused).
 */
import { isMeaningfulInput, isPlayedNow, syncTravel, travelView, type InteractOutcome, type ShownBlobbi, type TravelOutcome, type TravelSync, type TravelViewKind, type WorldTravelSession, type WorldTravelSnapshot } from '@blobbi-kit/core';

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
  /** An interaction was counted toward bringing the Blobbi over, not yet enough (`snapshot.follow`). Optional. */
  onCounted?(snapshot: WorldTravelSnapshot): void;
  /**
   * Whether the play now beginning needs this very Blobbi here (a new island's birth intro, NEW ADVENTURE WITH
   * {name}): the trusted press that began it is then an explicit request (a move at once), not one interaction.
   * Read once, as play begins. Default: never.
   */
  playStartExplicit?(): boolean;
  /** The session changed (the travel phase, presence, the place). */
  onChange?(snapshot: WorldTravelSnapshot): void;
  /**
   * Whether a signature could be asked for now (the account's extension answered for it on this visit, or the vault
   * keeps its key). Absent: always. When it is not, a press that would count toward a move, or Call here, is NEVER
   * dropped in silence: it goes to `onNoSigner` (the host asks the extension again and tells the player), and the
   * session is not asked to move (nothing is counted or signed).
   */
  signerReady?(): boolean;
  onNoSigner?(kind: 'interact' | 'explicit'): void;
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
  /** The player asked for it explicitly (a button): come here at once, even right after a move elsewhere. */
  callHere(): Promise<TravelOutcome | null>;
  /** What the game shows of the Blobbi's place (the kit's `travelView`), or null while there is no session. */
  view(): { kind: TravelViewKind; unreachable: boolean } | null;
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
/**
 * The press that began play is counted once the place is known (a fresh device's first look, the network module
 * loading): no later than this after the press, else it is dropped (it was the title's, long ago).
 */
export const PLAY_START_OWED_MS = 10_000;

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
  /** When the press that began play was made, while it is still to be counted (the place not known yet). */
  let owedPlayStart: number | null = null;
  let owedExplicit = false;
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

  /** A session for the account's walking Blobbi, and the sync that keeps it on screen in line with it. */
  const start = (a: { owner: string; d: string }) => {
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
  };

  /** A move would need a signature and none can be asked for now: the Blobbi is elsewhere and its place is known. */
  const needsSigner = (h: TravelSessionHandle) => {
    const s = h.session.snapshot();
    return !s.here && s.resolution !== 'pending' && !!deps.signerReady && !deps.signerReady();
  };

  const request = async (explicit: boolean): Promise<TravelOutcome | null> => {
    const h = handle;
    if (!h) return null;
    if (needsSigner(h)) {
      deps.onNoSigner?.('explicit');
      return null;
    }
    const out = await h.session.travel({ explicit });
    if (handle === h && !disposed) deps.onOutcome(out, h.session.snapshot());
    return out;
  };

  /** One interaction with this World (the kit counts it while the Blobbi is elsewhere, and moves it on the third). */
  const interact = async (repeat: boolean): Promise<InteractOutcome | null> => {
    const h = handle;
    if (!h) return null;
    if (!repeat && needsSigner(h)) {
      h.session.noteActivity();
      deps.onNoSigner?.('interact');
      return 'ignored';
    }
    const out = await h.session.interact({ repeat });
    if (handle !== h || disposed) return out;
    if (out === 'counted') deps.onCounted?.(h.session.snapshot());
    else if (out !== 'ignored') deps.onOutcome(out, h.session.snapshot());
    return out;
  };

  const onInput = (e: Event) => {
    if (disposed) return;
    if (!isMeaningfulInput({ trusted: e.isTrusted, visible: visible(), focused: focused() || visible() })) return;
    lastPressAt = now();
    if (!handle || !deps.playing()) return;
    lastInputAt = now();
    // While the game drives the teleport itself (an intro, a visit's handoff, a swap) the press is activity only
    if (deps.paused()) {
      handle.session.noteActivity();
      return;
    }
    void interact((e as KeyboardEvent).repeat === true);
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
      // this Blobbi here: ONE interaction, as a press in play is (never a move by itself). An entry with no press (a
      // startup that goes straight into an island) never counts: nothing signs on load
      const playing = deps.playing();
      if (playing && !wasPlaying && lastPressAt !== null && now() - lastPressAt < PLAY_START_PRESS_MS) {
        owedPlayStart = lastPressAt;
        owedExplicit = deps.playStartExplicit?.() ?? false;
      }
      if (!playing) owedPlayStart = null;
      wasPlaying = playing;
      const a = deps.account();
      if (a?.owner !== owner || a?.d !== d) {
        // Another account or Blobbi: a new session (its count starts over); a press owed to the old one is dropped
        if (owner !== null) owedPlayStart = null;
        stop();
        if (a) start(a);
      }
      // The press that began play, counted once the place is known (a fresh device asks the relays first)
      if (owedPlayStart !== null && now() - owedPlayStart > PLAY_START_OWED_MS) owedPlayStart = null;
      if (owedPlayStart !== null && handle && handle.session.snapshot().resolution !== 'pending') {
        owedPlayStart = null;
        // An explicit start (the birth intro needs the Blobbi here) moves it at once; else it is one interaction
        if (owedExplicit && !handle.session.snapshot().here) void request(true);
        else void interact(false);
        owedExplicit = false;
      }
    },
    check: () => sync?.check(),
    callHere: () => request(true),
    view: () => (handle ? travelView(handle.session.snapshot()) : null),
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

/**
 * M16.2, PLAY'S ENTRY WHILE THE PLACE IS NOT KNOWN. A fresh device does not know where the account's Blobbi is until
 * the relays answer its first look (the kit's `resolution: 'pending'`, or no session yet while the network module
 * loads): showing the entry arrival then would show the Blobbi walking here and take it away a moment later. So the
 * entry waits ('wait', with a small "looking for" cue), for no longer than `ENTRY_HOLD_MAX_MS`; then the Blobbi
 * arrives ('enter': it is here, or no session could start and it walks freely as with world travel off) or stays
 * away ('skip').
 */
export const ENTRY_HOLD_MAX_MS = 6_000;

/** The place is not known: world travel follows this Blobbi (`candidate`) and its view is 'looking' or not there yet. */
export function placeUnknown(o: { candidate: boolean; view: TravelViewKind | null }): boolean {
  return o.candidate && (o.view ?? 'looking') === 'looking';
}

/** What play's entry does now (`heldFor`: how long it has waited, ms). */
export function entryDecision(o: { unknown: boolean; here: boolean; heldFor: number }): 'enter' | 'skip' | 'wait' {
  if (o.unknown && o.heldFor < ENTRY_HOLD_MAX_MS) return 'wait';
  return o.here ? 'enter' : 'skip';
}

/**
 * The cue drawn at the empty spot while the Blobbi is absent here (`drawTravelCue`): 'looking' while its place is not
 * known, 'calling' while a move here is under way (the kit's 'coming': checking, signing, publishing, waiting for the
 * arrival), 'noticed' while it is elsewhere and interactions are being counted; nothing otherwise (and never while it
 * shows: the teleport's own arrival takes over from the cue).
 */
export function travelCueFor(o: { absent: boolean; looking: boolean; view: TravelViewKind | null; follow: { count: number; needed: number; suspended: boolean } | null }): { kind: 'looking' | 'noticed' | 'calling'; amount?: number } | null {
  if (!o.absent) return null;
  if (o.looking) return { kind: 'looking' };
  if (o.view === 'coming') return { kind: 'calling' };
  if (o.view === 'away' && o.follow && o.follow.count > 0 && !o.follow.suspended) return { kind: 'noticed', amount: o.follow.count / o.follow.needed };
  return null;
}

/**
 * Whether world travel on Nostr runs in this page (M16; off by default, the kinds are experimental). M16.2: world
 * travel signs and publishes to the public travel relays, so a production build runs it only when the build is also
 * a LIVE publishing one (`VITE_BLOBBI_PUBLISH=live`): a rehearsal build never writes the experimental kinds, whatever
 * `VITE_BLOBBI_WORLD_TRAVEL` says. A development server keeps its explicit switches (the developer's choice).
 */
export function worldTravelMode(o: { buildMode?: string; dev: boolean; hash: URLSearchParams; stored: string | null; publishLive?: boolean }): 'nostr' | 'off' {
  if (o.buildMode === 'nostr') return o.dev || o.publishLive === true ? 'nostr' : 'off';
  if (!o.dev) return 'off';
  return o.hash.get('world-travel') === 'nostr' || o.stored === 'nostr' ? 'nostr' : 'off';
}

export const WORLD_TRAVEL_SWITCH_KEY = 'blobbi:world-travel:v1';
/** The player's choice of Active Presence, per account (absent: off). */
export const activePresenceKey = (pubkey: string) => `blobbi:active-presence:v1:${pubkey}`;
