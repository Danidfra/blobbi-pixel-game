/**
 * THE JOYSTICK HINT (P1.1): on a touch screen, a translucent stick resting near the bottom-left corner says "drag
 * to walk" before the first touch. It is only a picture of the touch stick (`touch.ts`): it takes no presses (a
 * thumb on it starts the ordinary floating stick right there), and it never moves or replaces that stick.
 *
 * - Until the player has walked with the stick, the knob nudges out and back now and then (one direction a cycle),
 *   unless reduced motion is on; any movement input stops the nudging for the session.
 * - Once the stick has walked the Blobbi a little (LEARN_PX), movement is learned: the hint fades to a faint ring,
 *   and comes back to a gentle IDLE level after IDLE_AFTER_S without movement input. The nudging never returns.
 * - Learned is remembered in this browser (`blobbi-pixel-lab:touch-hint`, a viewer preference like the settings,
 *   never part of a save), so a returning player sees the quiet hint without the demonstration.
 *
 * Pure: the time is passed in, the storage is handed in, nothing reads a clock or the DOM.
 */

/** The hint's timings (seconds), opacities (0..1, applied to the drawing's own translucency) and thresholds. */
export const HINT = {
  /** Before the stick has been used: fully the hint's own (already translucent) look. */
  DISCOVER_ALPHA: 1,
  /** Learned and lately used: a faint ring, still there. */
  LEARNED_ALPHA: 0.3,
  /** Learned, but no movement input for a while: gently back. */
  IDLE_ALPHA: 0.65,
  /** Seconds without movement input before a learned hint comes back to IDLE_ALPHA. */
  IDLE_AFTER_S: 12,
  /** Seconds a fade between two levels takes (from one end to the other); never a jump, never a flash. */
  FADE_S: 0.8,
  /** Seconds after the hint first shows before the first nudge. */
  DEMO_DELAY_S: 1.2,
  /** One nudge's cycle: out, hold, back, rest. */
  DEMO_CYCLE_S: 2.6,
  /** How far the knob nudges, as a share of the stick's radius. */
  DEMO_REACH: 0.5,
  /** World pixels the stick must walk the Blobbi before movement counts as learned. */
  LEARN_PX: 12,
} as const;

/** The nudges, one per cycle: right, up, left, down (screen y down). */
const NUDGES: readonly [number, number][] = [
  [1, 0],
  [0, -1],
  [-1, 0],
  [0, 1],
];

export const TOUCH_HINT_KEY = 'blobbi-pixel-lab:touch-hint';

export interface HintStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** Whether this browser remembers that the stick was learned (a broken or missing record: not learned). */
export function readLearned(store: HintStore | null): boolean {
  try {
    const raw = store?.getItem(TOUCH_HINT_KEY);
    if (!raw) return false;
    const v = JSON.parse(raw) as { learned?: unknown };
    return v?.learned === true;
  } catch {
    return false;
  }
}

/** Remember that the stick was learned (a store that refuses: the hint simply teaches again next time). */
export function writeLearned(store: HintStore | null): void {
  try {
    store?.setItem(TOUCH_HINT_KEY, JSON.stringify({ version: 1, learned: true }));
  } catch {
    /* private mode or full: not remembered */
  }
}

export interface HintFrame {
  /** The real time now (seconds). */
  now: number;
  /** The stick is held past its dead zone (the stick itself is drawn; the hint steps aside). */
  stickActive: boolean;
  /** Any movement input this frame: the stick pointing somewhere, a movement key, a tap to walk. */
  moving: boolean;
  /** World pixels the stick walked the Blobbi this frame. */
  stickWalkedPx: number;
  reducedMotion: boolean;
}

export interface HintLook {
  /** 0..1 over the drawing's own translucency; 0 draws nothing. */
  alpha: number;
  /** The knob's offset from the centre, as a share of the radius (the nudge), 0,0 at rest. */
  knob: { x: number; y: number };
  /** Draw the four small arrows (still teaching: they say "any direction" without moving). */
  arrows: boolean;
}

export class JoystickHint {
  learned: boolean;
  /** Some movement input was seen this session: no more nudging. */
  interacted = false;
  private alpha = 0;
  private shownAt: number | null = null;
  private lastMoveAt = -Infinity;
  private lastNow: number | null = null;
  private walked = 0;
  /** Set when movement becomes learned this session (the caller stores it once). */
  justLearned = false;

  constructor(learned = false) {
    this.learned = learned;
  }

  /** The level the hint is heading for now. */
  target(now: number, stickActive: boolean): number {
    if (stickActive) return 0;
    if (!this.learned) return HINT.DISCOVER_ALPHA;
    return now - this.lastMoveAt >= HINT.IDLE_AFTER_S ? HINT.IDLE_ALPHA : HINT.LEARNED_ALPHA;
  }

  /** Advance one frame; returns how to draw the hint. */
  update(f: HintFrame): HintLook {
    this.justLearned = false;
    if (this.shownAt === null) {
      this.shownAt = f.now;
      // A returning player (learned) starts at the level it would rest at; a new one fades in from nothing.
      this.alpha = this.learned ? this.target(f.now, f.stickActive) : 0;
    }
    const dt = this.lastNow === null ? 0 : Math.max(0, Math.min(0.25, f.now - this.lastNow));
    this.lastNow = f.now;
    if (f.moving || f.stickActive) {
      this.interacted = true;
      this.lastMoveAt = f.now;
    }
    if (!this.learned && f.stickWalkedPx > 0) {
      this.walked += f.stickWalkedPx;
      if (this.walked >= HINT.LEARN_PX) {
        this.learned = true;
        this.justLearned = true;
      }
    }
    // While the stick is held the hint is simply not drawn (no fade-out to watch under the thumb).
    if (f.stickActive) {
      this.alpha = this.target(f.now, false);
      return { alpha: 0, knob: { x: 0, y: 0 }, arrows: false };
    }
    const goal = this.target(f.now, false);
    const step = dt / HINT.FADE_S;
    this.alpha = this.alpha < goal ? Math.min(goal, this.alpha + step) : Math.max(goal, this.alpha - step);
    const teaching = !this.learned;
    return { alpha: this.alpha, knob: teaching && !this.interacted && !f.reducedMotion ? demoKnob(f.now - this.shownAt) : { x: 0, y: 0 }, arrows: teaching };
  }

  /** The nudging is on now (tests and the browser check). */
  demoing(reducedMotion: boolean): boolean {
    return !this.learned && !this.interacted && !reducedMotion;
  }

  /** The current level (tests). */
  get level(): number {
    return this.alpha;
  }
}

/** The knob's nudge `t` seconds after the hint appeared: out (eased), hold, back (eased), rest; a new way each cycle. */
export function demoKnob(t: number): { x: number; y: number } {
  if (t < HINT.DEMO_DELAY_S) return { x: 0, y: 0 };
  const c = HINT.DEMO_CYCLE_S;
  const u = t - HINT.DEMO_DELAY_S;
  const [dx, dy] = NUDGES[Math.floor(u / c) % NUDGES.length];
  const p = (u % c) / c;
  // out 0–0.2, hold 0.2–0.4, back 0.4–0.6, rest 0.6–1
  const ease = (k: number) => k * k * (3 - 2 * k);
  const k = p < 0.2 ? ease(p / 0.2) : p < 0.4 ? 1 : p < 0.6 ? 1 - ease((p - 0.4) / 0.2) : 0;
  return { x: dx * k * HINT.DEMO_REACH, y: dy * k * HINT.DEMO_REACH };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the hint's centre goes: near the bottom-left corner, inside the safe area, above the menu bar, and clear of
 * everything already on screen there (the hotbar, the mode bar, the camera indicator, the tip...). It climbs above
 * whatever it would cover; null when there is no clear spot (then it is not drawn).
 */
export function hintAnchor(screenW: number, screenH: number, radius: number, margin: number, insets: { top: number; right: number; bottom: number; left: number }, bottomClear: number, avoid: readonly (Box | null | undefined)[], topClear = 0): { x: number; y: number } | null {
  const pad = radius + 2; // the ring's own width and a pixel to spare
  const x = Math.round(insets.left + margin + pad);
  let y = Math.round(screenH - insets.bottom - bottomClear - margin - pad);
  const boxes = avoid.filter((b): b is Box => !!b && b.w > 0 && b.h > 0);
  for (let guard = 0; guard < boxes.length + 1; guard++) {
    const hit = boxes.find((b) => x - pad < b.x + b.w && b.x < x + pad && y - pad < b.y + b.h && b.y < y + pad);
    if (!hit) break;
    y = Math.round(hit.y - margin - pad);
  }
  if (y - pad < Math.max(insets.top, topClear) || x + pad > screenW - insets.right) return null;
  if (boxes.some((b) => x - pad < b.x + b.w && b.x < x + pad && y - pad < b.y + b.h && b.y < y + pad)) return null;
  return { x, y };
}
