/**
 * THE VIEW CAMERA: four presentation scales over one world. It decides only where the screen looks and how
 * many screen pixels a world pixel covers; it never reads or writes the simulation, so world coordinates,
 * footprints, navigation, reach and saves are identical in every mode.
 *
 *   overview     1× world pixels, the Blobbi drawn natively at 12 px, centred on the turtle (whole animal in view)
 *   exploration  2×, the Blobbi drawn natively at 24 px, follows the Blobbi
 *   close-up     4×, the Blobbi drawn natively at 48 px, follows the Blobbi
 *   up close     6× (M10), the Blobbi drawn natively at 72 px, follows the Blobbi (the same HUD as every mode)
 *
 * The Blobbi is drawn at three quarters of its world size in every mode, so it keeps one proportion to the
 * shelter, trees and rocks whatever the zoom.
 *
 * At rest the scale is a whole number and the view origin a whole world pixel, so every world pixel is a crisp
 * square block. A mode change eases the scale and the focus over `TRANSITION_SECONDS`; sampling stays
 * nearest-neighbour throughout (no blur), and the final frame is pixel-exact.
 */

import { T, type WorldDescription } from '../world/types';

export type CameraModeId = 'overview' | 'exploration' | 'closeup' | 'upclose';

export interface CameraMode {
  id: CameraModeId;
  label: string;
  /** Screen pixels per world pixel at rest. */
  scale: number;
  /** Follow the Blobbi (else frame the whole turtle). */
  follow: boolean;
  /**
   * The Blobbi's drawn size relative to its world size (the same in every mode, so its proportion to the world
   * never changes with the zoom). Presentation only: its world size, collision, reach and navigation never change.
   */
  blobbiScale: number;
}

/**
 * The 16 px Blobbi is drawn at 12, 24 and 48 px (1×, 2×, 4×): the size the player chose beside the shelter's
 * door, kept in every mode.
 */
export const BLOBBI_DRAWN_SCALE = 0.75;

export const CAMERA_MODES: Record<CameraModeId, CameraMode> = {
  overview: { id: 'overview', label: 'Overview', scale: 1, follow: false, blobbiScale: BLOBBI_DRAWN_SCALE },
  exploration: { id: 'exploration', label: 'Exploration', scale: 2, follow: true, blobbiScale: BLOBBI_DRAWN_SCALE },
  closeup: { id: 'closeup', label: 'Close-up', scale: 4, follow: true, blobbiScale: BLOBBI_DRAWN_SCALE },
  // M10: 6× rather than 8× — at 8× a phone held sideways (390 px tall) would see 49 world pixels, three Blobbi
  // heights; at 6× it sees 65, room for what is in front of it. Still a whole number: crisp square blocks.
  upclose: { id: 'upclose', label: 'Up close', scale: 6, follow: true, blobbiScale: BLOBBI_DRAWN_SCALE },
};

/** Up close keeps at least this many world pixels on screen vertically (a short screen steps down to 5×, 4×). */
export const UPCLOSE_MIN_VIEW = 60;

/** The smallest Blobbi drawn (screen pixels): below it the canonical face no longer reads. */
export const MIN_BLOBBI_PX = 12;

/**
 * The Blobbi's native raster size in a mode: its world size × the view's rest scale × the mode's `blobbiScale`,
 * never under `MIN_BLOBBI_PX` and never over its true size at that scale.
 */
export function blobbiScreenSize(worldSize: number, mode: CameraModeId, restScale: number): number {
  const actual = Math.max(8, Math.round(worldSize * restScale));
  const wanted = Math.round(worldSize * restScale * CAMERA_MODES[mode].blobbiScale);
  return Math.min(actual, Math.max(MIN_BLOBBI_PX, wanted));
}

/** Z cycles in this order. */
export const CAMERA_CYCLE: readonly CameraModeId[] = ['overview', 'exploration', 'closeup', 'upclose'];
export const DEFAULT_CAMERA_MODE: CameraModeId = 'exploration';
export const TRANSITION_SECONDS = 0.4;
/**
 * The overview may shrink below 1× (never under this) when the screen is smaller than the turtle, so the whole
 * animal stays in view; the Blobbi is then drawn natively at that smaller size (12 px at 0.75×).
 */
export const MIN_OVERVIEW_SCALE = 0.75;
/** How fast a following camera catches up (per second, exponential). */
const FOLLOW_RATE = 6;

export const isCameraMode = (s: unknown): s is CameraModeId => typeof s === 'string' && s in CAMERA_MODES;

/** What the camera follows and frames, in world pixels. */
export interface CameraTarget {
  /** The Blobbi's ground point. */
  x: number;
  y: number;
  /** The Blobbi's world height (16 by default), so the follow point is the middle of its body. */
  size: number;
}

export interface WorldBounds {
  width: number;
  height: number;
  /** Where the bounds start (M10 phase B: the canoe's sea reaches past the world's edge); 0 when absent. */
  x0?: number;
  y0?: number;
  /** What the overview frames (the turtle with its foam); the whole world when absent. */
  subject?: { x0: number; y0: number; x1: number; y1: number };
}

/** Pixels of sea kept around the turtle in the overview. */
const SUBJECT_MARGIN = 4;

/** The world's bounds with the turtle as the overview's subject: everything that is not open water. */
export function worldBounds(world: WorldDescription): WorldBounds {
  const { width, height, cls } = world.terrain;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const c = cls[y * width + x];
      if (c === T.DEEP || c === T.WATER || c === T.SHALLOW) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  const bounds: WorldBounds = { width: world.options.width, height: world.options.height };
  if (x1 >= x0) bounds.subject = { x0: Math.max(0, x0 - SUBJECT_MARGIN), y0: Math.max(0, y0 - SUBJECT_MARGIN), x1: Math.min(width, x1 + 1 + SUBJECT_MARGIN), y1: Math.min(height, y1 + 1 + SUBJECT_MARGIN) };
  return bounds;
}

const subjectOf = (world: WorldBounds) => world.subject ?? { x0: 0, y0: 0, x1: world.width, y1: world.height };

/** The view for one frame: everything a renderer needs to map world pixels to screen pixels. */
export interface ViewRect {
  mode: CameraModeId;
  /** Screen pixels per world pixel (a whole number at rest). */
  scale: number;
  /** World coordinate of the screen's top-left corner (whole at rest). */
  originX: number;
  originY: number;
  screenW: number;
  screenH: number;
  /** True while easing between modes. */
  transitioning: boolean;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export class ViewCamera {
  mode: CameraModeId;
  /** The world point at the centre of the screen. */
  focusX = 0;
  focusY = 0;
  scale: number;
  private from: { scale: number; t: number } | null = null;
  private initialised = false;
  /** The last followed target: the Blobbi is drawn at its rounded position, so the origin is derived from it. */
  private target: CameraTarget | null = null;
  /** The last resting origin and the eased origin it came from (per axis), for the direction rule. */
  private held: { ox: number; oy: number; fx: number; fy: number } | null = null;

  constructor(mode: CameraModeId = DEFAULT_CAMERA_MODE) {
    this.mode = mode;
    this.scale = CAMERA_MODES[mode].scale;
  }

  /** The scale a mode settles at on this screen (the overview fits the turtle). */
  restScale(mode: CameraModeId, screenW: number, screenH: number, world: WorldBounds): number {
    const m = CAMERA_MODES[mode];
    if (mode === 'upclose') return Math.max(CAMERA_MODES.closeup.scale, Math.min(m.scale, Math.floor(screenH / UPCLOSE_MIN_VIEW)));
    if (mode !== 'overview') return m.scale;
    const sub = subjectOf(world);
    const fit = Math.min(screenW / (sub.x1 - sub.x0), screenH / (sub.y1 - sub.y0));
    if (fit >= m.scale) return m.scale;
    // Below 1×: a quarter step that fits, never under the floor.
    return Math.max(MIN_OVERVIEW_SCALE, Math.floor(fit * 4) / 4);
  }

  setMode(mode: CameraModeId, immediate = false): void {
    if (mode === this.mode && !this.from) return;
    this.mode = mode;
    this.from = immediate || !this.initialised ? null : { scale: this.scale, t: 0 };
  }

  /** The next mode in the Z cycle. */
  cycle(): CameraModeId {
    const next = CAMERA_CYCLE[(CAMERA_CYCLE.indexOf(this.mode) + 1) % CAMERA_CYCLE.length];
    this.setMode(next);
    return next;
  }

  /** Where this mode wants the centre of the screen. */
  private wantedFocus(target: CameraTarget, world: WorldBounds): { x: number; y: number } {
    if (CAMERA_MODES[this.mode].follow) return { x: target.x, y: target.y - target.size / 2 };
    const sub = subjectOf(world);
    return { x: (sub.x0 + sub.x1) / 2, y: (sub.y0 + sub.y1) / 2 };
  }

  /**
   * Advance by `dt` seconds of real time and return the view. `snap` jumps straight to the rest position (first
   * frame, a new world). `followDt` is the simulated time the target moved in this frame (fixed steps × step
   * length; defaults to `dt`): following eases in that time, so on a display frame without a simulation step
   * (common above 60 Hz) the camera waits for the Blobbi instead of creeping ahead of it. Mode transitions run
   * in real time.
   */
  update(dt: number, target: CameraTarget, screenW: number, screenH: number, world: WorldBounds, snap = false, followDt = dt): ViewRect {
    const rest = this.restScale(this.mode, screenW, screenH, world);
    const want = this.wantedFocus(target, world);
    this.target = target;
    if (snap || !this.initialised) this.held = null;
    if (snap || !this.initialised) {
      this.initialised = true;
      this.from = null;
      this.scale = rest;
      this.focusX = want.x;
      this.focusY = want.y;
    } else {
      if (this.from) {
        this.from.t = Math.min(1, this.from.t + dt / TRANSITION_SECONDS);
        const k = ease(this.from.t);
        // Eased in log space, so 1→2 and 2→4 feel like the same step.
        this.scale = Math.exp(Math.log(this.from.scale) + (Math.log(rest) - Math.log(this.from.scale)) * k);
        if (this.from.t >= 1) {
          this.from = null;
          this.scale = rest;
        }
      } else this.scale = rest;
      // During a transition the focus catches up faster, so the zoom lands on its subject.
      const rate = this.from ? FOLLOW_RATE * 2.5 : FOLLOW_RATE;
      const k = 1 - Math.exp(-(this.from ? dt : followDt) * rate);
      this.focusX += (want.x - this.focusX) * k;
      this.focusY += (want.y - this.focusY) * k;
    }
    return this.view(screenW, screenH, world);
  }

  /** The view rectangle for the current focus and scale, clamped to the world (centred when the world is smaller). */
  view(screenW: number, screenH: number, world: WorldBounds): ViewRect {
    const s = this.scale;
    const vw = screenW / s;
    const vh = screenH / s;
    const bx = world.x0 ?? 0;
    const by = world.y0 ?? 0;
    const clamp = (focus: number, span: number, size: number, start: number) => start + (size <= span ? (size - span) / 2 : Math.max(0, Math.min(size - span, focus - start - span / 2)));
    let originX = clamp(this.focusX, vw, world.width, bx);
    let originY = clamp(this.focusY, vh, world.height, by);
    const transitioning = this.from !== null;
    // At rest the origin sits on the world-pixel grid: whole blocks, no shimmer.
    if (!transitioning) {
      const t = this.target;
      if (CAMERA_MODES[this.mode].follow && t) {
        // The Blobbi is drawn at its rounded position. Rounding the eased origin on its own as well would let the
        // two round at different moments, and the Blobbi would step back and forth a whole world pixel on screen
        // while walking (2 or 4 screen pixels). Instead the Blobbi's offset in the view is rounded once, from two
        // smooth values, and the origin follows the rounded Blobbi: walking steadily, the Blobbi holds still on
        // the screen and the world scrolls; settling, it drifts to the centre one whole pixel at a time.
        const fx = originX;
        const fy = originY;
        let ox = Math.round(t.x) - Math.round(t.x - fx);
        let oy = Math.round(t.y) - Math.round(t.y - fy);
        // While the camera's lag grows or shrinks, the rounded offset and the rounded Blobbi can still change on
        // different frames; the origin therefore only ever moves the way the eased camera is moving (and never
        // strays a pixel from it), so the world never scrolls backwards for a frame.
        const h = this.held;
        const hold = (o: number, prev: number, f: number, prevF: number) => (o !== prev && Math.sign(o - prev) !== Math.sign(f - prevF) && Math.abs(prev - f) < 1 ? prev : o);
        if (h) {
          ox = hold(ox, h.ox, fx, h.fx);
          oy = hold(oy, h.oy, fy, h.fy);
        }
        if (world.width > vw) ox = Math.max(bx, Math.min(bx + Math.floor(world.width - vw), ox));
        if (world.height > vh) oy = Math.max(by, Math.min(by + Math.floor(world.height - vh), oy));
        this.held = { ox, oy, fx, fy };
        originX = ox;
        originY = oy;
      } else this.held = null;
      originX = Math.round(originX);
      originY = Math.round(originY);
    }
    return { mode: this.mode, scale: s, originX, originY, screenW, screenH, transitioning };
  }
}
