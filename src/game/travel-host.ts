/**
 * M16, WORLD TRAVEL in Blobbi Pixel: the account's Blobbi has ONE canonical World on Nostr (its World Location,
 * kind 31126; `@blobbi-kit/core`'s world-travel). When it is elsewhere (Blobbi Home on any device), it is not walking
 * here. OPENING THIS GAME IS THE PLAYER'S INTENTION TO BRING IT HERE (revised 2026-10-19, `world-travel-departure.ts`):
 * once play is on and the place is confirmed with the relays, an away Blobbi is moved here at once with the kit's own
 * explicit move (one signed World Location), ONCE PER PAGE LOAD (`ArrivalIntent`) and only while the page is still
 * being opened (`ARRIVAL_INTENT_TTL_MS` from its navigation start, visible): never again on a re-render, a reconnect,
 * a relay update or a focus change; an old background tab shown again moves nothing; a reload may move again.
 * "Call {name} here" (Settings > Account) is the retry when a signer refused or no relay answered. A move made
 * elsewhere sends it away with the game's own teleport. It is the only model of where the Blobbi is (the cookie-based
 * world presence v1 was removed): with world travel off, the Blobbi simply walks here, and nothing about its place is
 * read, kept or sent.
 *
 * The host only wires it. Who may travel (the connected account's own walking Blobbi), the session (relays, signer,
 * store; `src/nostr/world-travel.ts`), the teleport (`LiveWorld.leaveBlobbi` / `enterBlobbi` / `settleBlobbi`) and the
 * words are the playground's. Nothing here reaches the network.
 *
 * Inputs: a real input (a trusted press or key in a visible, focused page) in play is activity, for the optional
 * Active Presence only; no input moves the Blobbi. A departure waits for the game's moment; the game's own journeys
 * come first (paused).
 */
import { isMeaningfulInput, isPlayedNow, syncTravel, travelView, type ShownBlobbi, type TravelOutcome, type TravelSync, type TravelViewKind, type WorldTravelSession, type WorldTravelSnapshot } from '@blobbi-kit/core';
import { ArrivalIntent, autoArrivalDecision, pageAgeMs, pageIsFresh } from './world-travel-departure';

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
  /** Play has started: the Blobbi may arrive here (the title's and menus' own time is not play). */
  playing(): boolean;
  /** A journey began because of where the Blobbi is (`leave` names where it went). */
  onJourney(kind: 'enter' | 'leave', place: string): void;
  /** What a move here came to (a notice for the player), with where the Blobbi is now. */
  onOutcome(outcome: TravelOutcome, snapshot: WorldTravelSnapshot): void;
  /** The session changed (the travel phase, presence, the place). */
  onChange?(snapshot: WorldTravelSnapshot): void;
  /**
   * Whether a signature could be asked for now (the account's extension answered for it on this visit, or the vault
   * keeps its key). Absent: always. When it is not, the arrival on opening, or Call here, is NEVER dropped in
   * silence: it goes to `onNoSigner` (the host asks the extension again and tells the player), and the session is
   * not asked to move (nothing is signed).
   */
  signerReady?(): boolean;
  onNoSigner?(kind: 'explicit'): void;
  /** Test seams. */
  /** How long ago this page's navigation started (ms); default `pageAgeMs` (performance.now). */
  pageAge?: () => number;
  doc?: Pick<Document, 'visibilityState' | 'hasFocus' | 'addEventListener' | 'removeEventListener'>;
  win?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

export interface TravelHost {
  /** Follow the account and the walking Blobbi (cheap; call every frame). */
  update(): void;
  /** Look again now (the game's moment ended, or it moved the Blobbi itself). */
  check(): void;
  /** The player's explicit request (Settings > Account, and the retry after a failure): move the Blobbi here now. */
  callHere(): Promise<TravelOutcome | null>;
  /** What the game shows of the Blobbi's place (the kit's `travelView`), or null without a session. */
  view(): ReturnType<typeof travelView> | null;
  snapshot(): WorldTravelSnapshot | null;
  /** The Blobbi belongs here now (true without a session: a guest's Blobbi always walks here). */
  here(): boolean;
  /** The Blobbi on screen: present, departing, absent, arriving (null without a world). */
  shown(): ShownBlobbi extends { state(): infer S } ? S | null : never;
  setPresenceEnabled(on: boolean): void;
  dispose(): void;
}

const INPUTS = ['pointerdown', 'keydown'] as const;

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
  let visibleSince: number | null = visible() ? now() : null;
  let disposed = false;
  /** This page's one decision per Blobbi: opening the game brings it here once; nothing after that is automatic. */
  const intent = new ArrivalIntent();
  const signerReady = () => deps.signerReady?.() ?? true;

  function stop(): void {
    unsubscribe?.();
    sync?.dispose();
    handle?.session.dispose();
    handle?.dispose?.();
    unsubscribe = null;
    sync = null;
    handle = null;
    owner = null;
    d = null;
  }

  /** The explicit move here (the kit's `travel`), or the word that no signature can be asked for now. */
  async function request(): Promise<TravelOutcome | null> {
    const h = handle;
    if (!h) return null;
    const s = h.session.snapshot();
    if (!s.here && s.resolution !== 'pending' && !signerReady()) {
      deps.onNoSigner?.('explicit');
      return null;
    }
    const out = await h.session.travel({ explicit: true });
    if (handle === h && !disposed) deps.onOutcome(out, h.session.snapshot());
    return out;
  }

  /** Opening the game: the one automatic decision per page and Blobbi (see `autoArrivalDecision`). */
  function autoArrive(): void {
    const h = handle;
    if (disposed || !h || owner === null || d === null || !deps.playing()) return;
    const s = h.session.snapshot();
    const consumed = intent.consumed(owner, d);
    const decision = autoArrivalDecision({ consumed, fresh: pageIsFresh((deps.pageAge ?? pageAgeMs)()), resolution: s.resolution, here: s.here, visible: visible(), signer: signerReady() });
    if (decision === 'wait' || consumed) return;
    intent.consume(owner, d);
    if (decision === 'arrive') void request();
    // No signer yet: the page asks the extension again and brings the Blobbi over once it answers (never in silence)
    else if (!s.here && s.resolution === 'confirmed' && !signerReady()) deps.onNoSigner?.('explicit');
  }

  /** A session for the account's walking Blobbi, and the sync that keeps it on screen in line with it. */
  function start(a: { owner: string; d: string }): void {
    owner = a.owner;
    d = a.d;
    handle = deps.session(a.owner, a.d, { isActive: () => isPlayedNow({ visible: visible(), lastInputAt, now: now() }) });
    handle.session.setVisible(visible());
    handle.setVisible?.(visible());
    const session = handle.session;
    unsubscribe = session.subscribe((s) => {
      deps.onChange?.(s);
      // The place just got confirmed (or changed): the opening's one decision may be due now
      autoArrive();
    });
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
  }

  // A real input in play is activity (Active Presence renews only while played); it never moves the Blobbi
  const onInput = (e: Event) => {
    if (disposed || !handle || !deps.playing()) return;
    if (!isMeaningfulInput({ trusted: e.isTrusted, visible: visible(), focused: focused() || visible() })) return;
    lastInputAt = now();
    handle.session.noteActivity();
  };
  const onVisibility = () => {
    visibleSince = visible() ? now() : null;
    handle?.session.setVisible(visible());
    handle?.setVisible?.(visible());
    sync?.check();
    // A tab opened hidden acts the first time it is seen; a tab that already decided does nothing more
    autoArrive();
  };
  for (const type of INPUTS) win.addEventListener(type, onInput, { capture: true, passive: true });
  doc.addEventListener('visibilitychange', onVisibility);

  return {
    update() {
      if (disposed) return;
      const a = deps.account();
      if (a?.owner !== owner || a?.d !== d) {
        // Another account or Blobbi: a new session (the same page's decision for that Blobbi, if made, stands)
        stop();
        if (a) start(a);
      }
      autoArrive();
    },
    check: () => sync?.check(),
    callHere: () => request(),
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
 * away ('skip': the opening's own move then brings it here with the teleport's arrival).
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
 * arrival); nothing otherwise (and never while it shows: the teleport's own arrival takes over from the cue).
 */
export function travelCueFor(o: { absent: boolean; looking: boolean; view: TravelViewKind | null }): { kind: 'looking' | 'calling' } | null {
  if (!o.absent) return null;
  if (o.looking) return { kind: 'looking' };
  if (o.view === 'coming') return { kind: 'calling' };
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
