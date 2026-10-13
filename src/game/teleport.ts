/**
 * BLOBBI TELEPORTATION: the presence lifecycle and its cinematic effect, reusable by any scene.
 *
 *   present ──leaveBlobbi──► departing ──(done)──► absent ──enterBlobbi──► arriving ──(done)──► present
 *        ▲                      │  ▲                                          │  │
 *        └──cancelTransition────┘  └──────────────── reverse ─────────────────┘  └─cancelTransition─► present
 *
 * Departure: the Blobbi stops, closes its eyes tightly, concentrates and squashes a little, then dissolves FROM
 * TOP TO BOTTOM into glowing pixels that accelerate UP into the sky; it is fully gone only when departure ends.
 * Arrival: a distant cluster appears high above the landing spot, more pixels fall FROM THE SKY with short trails,
 * a faint shadow grows on the ground, they converge and the Blobbi rebuilds FROM BOTTOM TO TOP with its eyes
 * closed, settles, opens its eyes, smiles and bounces.
 *
 * Everything visual is a pure function of (transition, time): the visible part of the sprite and every particle's
 * position are computed, never simulated, so there is nothing to leak or clean up and the effect is identical in
 * every camera mode. Time is the live world's simulated time: menus and hidden tabs pause a transition, they never
 * break it. Presence is never saved: a reload always starts with the Blobbi present, so no failure can strand it.
 *
 * No networking here: a future cross-app handoff (see docs/architecture/CROSS-GAME-TRAVEL.md) would call these same
 * operations when presence moves between apps.
 */
import { stream } from '../core/rng';

export type PresenceState = 'present' | 'departing' | 'absent' | 'arriving';

/** Phase times in seconds (full motion). Reduced motion runs a shorter, calmer version. */
export const DEPART = { concentrate: 0.15, dissolveStart: 0.8, dissolveEnd: 1.9, end: 2.6 } as const;
export const ARRIVE = { descendEnd: 1.9, shadowStart: 0.8, rebuildStart: 1.9, rebuildEnd: 2.8, openEyes: 3.1, end: 3.6 } as const;
const REDUCED = 0.6;

/** The height (world px) a particle cluster starts from on arrival, and departing pixels fade at. */
export const SKY = 150;

export type TeleportEvent = 'gather' | 'dissolve' | 'whoosh' | 'gone' | 'incoming' | 'rebuild' | 'arrived' | 'cancelled' | 'reversed';

export interface TeleportParticle {
  /** Offset from the Blobbi's ground point (world px). */
  dx: number;
  /** Altitude above the ground (world px). */
  z: number;
  /** Altitudes of the trail behind it (newest first). */
  trail: number[];
  /** 0 bright core, 1 mid, 2 faint. */
  tone: 0 | 1 | 2;
  /** 0..1 fade. */
  alpha: number;
}

interface ParticleSeed {
  dx: number;
  /** Departure: the row (0 top .. 1 bottom) it leaves from. Arrival: the row it lands on. */
  row: number;
  /** Arrival: spawn time and starting height. */
  start: number;
  z0: number;
  speed: number;
  drift: number;
  tone: 0 | 1 | 2;
}

export class TeleportController {
  state: PresenceState = 'present';
  /** Simulated time the current transition started (scaled so `reverse` can resume mid-way). */
  private t0 = 0;
  /** Transitions begun (seeds each one's particles). */
  private count = 0;
  private seeds: ParticleSeed[] = [];
  /** The last phase whose event was emitted. */
  private emitted = new Set<TeleportEvent>();
  /** The current transition's time scale (fixed when it begins, so toggling reduced motion never jumps it). */
  private k = 1;
  /** Calmer, shorter transitions: fewer pixels, no camera movement. Read when a transition begins. */
  reducedMotion = false;

  constructor(
    readonly seed: string,
    /** The Blobbi's standing height and half width, world px (for particle placement). */
    public height = 16,
    public halfWidth = 7,
  ) {}

  /**
   * M11D.2: the body the effect is drawn for (a Baby's own drawn height and half width, not the adult's). Read by
   * the particles every frame and by a transition's seeds when it begins, so it is set before a swap's arrival.
   */
  resize(height: number, halfWidth: number): void {
    this.height = height;
    this.halfWidth = halfWidth;
  }

  getPresenceState(): PresenceState {
    return this.state;
  }

  /** Movement and actions are locked while anything but present. */
  get locked(): boolean {
    return this.state !== 'present';
  }


  private begin(state: 'departing' | 'arriving', now: number): void {
    this.state = state;
    this.t0 = now;
    this.k = this.reducedMotion ? REDUCED : 1;
    this.count++;
    this.emitted.clear();
    const rng = stream(this.seed, 'teleport', this.count);
    const n = this.reducedMotion ? 16 : 44;
    this.seeds = Array.from({ length: n }, (_, i) => ({
      dx: rng.range(-this.halfWidth, this.halfWidth),
      row: (i + rng.range(0, 1)) / n,
      start: state === 'arriving' ? (i < 6 ? rng.range(0, 0.25) : rng.range(0.15, 1.1)) : 0,
      z0: SKY + rng.range(-20, 25),
      speed: rng.range(0.85, 1.25),
      drift: state === 'arriving' ? rng.range(-3, 3) : rng.range(-6, 6),
      // The first arrivals are the bright cluster seen high above.
      tone: (state === 'arriving' && i < 6 ? 0 : rng.int(0, 5) === 0 ? 0 : rng.int(0, 2) === 0 ? 2 : 1) as 0 | 1 | 2,
    }));
  }

  /** Start departing (only when present). Returns whether it started. A departure during arrival reverses it. */
  leaveBlobbi(now: number): boolean {
    if (this.state === 'arriving') return this.reverse(now);
    if (this.state !== 'present') return false;
    this.begin('departing', now);
    return true;
  }

  /** Start arriving (only when absent). An arrival during departure reverses it. */
  enterBlobbi(now: number): boolean {
    if (this.state === 'departing') return this.reverse(now);
    if (this.state !== 'absent') return false;
    this.begin('arriving', now);
    return true;
  }

  /** Stop any transition: the Blobbi is simply present again (never left invisible). */
  cancelTransition(): PresenceState {
    if (this.state === 'departing' || this.state === 'arriving') {
      this.state = 'present';
      this.seeds = [];
      this.emitted.clear();
      this.emitted.add('cancelled');
    }
    return this.state;
  }

  /**
   * Turn a transition around mid-way: a departure becomes an arrival (and the other way), resuming from the same
   * visible fraction so the sprite never jumps.
   */
  reverse(now: number): boolean {
    if (this.state !== 'departing' && this.state !== 'arriving') return false;
    const visible = this.visible(now);
    if (this.state === 'departing') {
      this.begin('arriving', now);
      // Arrival time at which `visible` of the sprite is rebuilt.
      const t = (ARRIVE.rebuildStart + visible * (ARRIVE.rebuildEnd - ARRIVE.rebuildStart)) * this.k;
      this.t0 = now - t;
      for (const e of ['incoming', 'rebuild'] as TeleportEvent[]) this.emitted.add(e);
    } else {
      this.begin('departing', now);
      const t = (DEPART.dissolveStart + (1 - visible) * (DEPART.dissolveEnd - DEPART.dissolveStart)) * this.k;
      this.t0 = now - t;
      for (const e of ['gather', 'dissolve'] as TeleportEvent[]) this.emitted.add(e);
    }
    this.emitted.add('reversed');
    return true;
  }

  /** Seconds into the current transition, in full-motion time. */
  elapsed(now: number): number {
    return (now - this.t0) / this.k;
  }

  /**
   * Advance: finish transitions that ran their course and return the events reached since the last step (for
   * sounds and reactions).
   */
  step(now: number): TeleportEvent[] {
    const out: TeleportEvent[] = [];
    const emit = (e: TeleportEvent, when: boolean) => {
      if (when && !this.emitted.has(e)) {
        this.emitted.add(e);
        out.push(e);
      }
    };
    if (this.emitted.has('cancelled')) {
      this.emitted.delete('cancelled');
      out.push('cancelled');
    }
    if (this.emitted.has('reversed')) {
      this.emitted.delete('reversed');
      out.push('reversed');
    }
    const t = this.elapsed(now);
    if (this.state === 'departing') {
      emit('gather', t >= 0);
      emit('dissolve', t >= DEPART.dissolveStart);
      emit('whoosh', t >= DEPART.dissolveEnd);
      if (t >= DEPART.end) {
        this.state = 'absent';
        out.push('gone');
      }
    } else if (this.state === 'arriving') {
      emit('incoming', t >= 0);
      emit('rebuild', t >= ARRIVE.rebuildStart);
      if (t >= ARRIVE.end) {
        this.state = 'present';
        out.push('arrived');
      }
    }
    return out;
  }

  /** How much of the sprite shows, as the BOTTOM fraction of its rows (1 whole, 0 none). */
  visible(now: number): number {
    const t = this.elapsed(now);
    if (this.state === 'present') return 1;
    if (this.state === 'absent') return 0;
    if (this.state === 'departing') return 1 - clamp01((t - DEPART.dissolveStart) / (DEPART.dissolveEnd - DEPART.dissolveStart));
    return clamp01((t - ARRIVE.rebuildStart) / (ARRIVE.rebuildEnd - ARRIVE.rebuildStart));
  }

  /** Eyes closed tightly while concentrating (departure) and while rebuilding (arrival). */
  eyesClosed(now: number): boolean {
    const t = this.elapsed(now);
    if (this.state === 'departing') return t >= DEPART.concentrate;
    if (this.state === 'arriving') return t < ARRIVE.openEyes;
    return false;
  }

  /** Squash 0..1: a little compression while concentrating before the dissolve. */
  squash(now: number): number {
    if (this.state !== 'departing') return 0;
    const t = this.elapsed(now);
    return clamp01((t - DEPART.concentrate) / (DEPART.dissolveStart - DEPART.concentrate)) * (1 - clamp01((t - DEPART.dissolveStart) / 0.3));
  }

  /** The ground shadow under an arrival (0..1), growing as the pixels come down. */
  shadow(now: number): number {
    if (this.state !== 'arriving') return 0;
    const t = this.elapsed(now);
    return clamp01((t - ARRIVE.shadowStart) / (ARRIVE.rebuildEnd - ARRIVE.shadowStart));
  }

  /**
   * Camera choreography, 0..1: how much the camera should look above the Blobbi (the caller turns it into a share
   * of the view's height). Departure follows the pixels up a little at the end and holds while absent; arrival
   * starts there, showing the incoming cluster, and eases down with it. Zero with reduced motion.
   */
  cameraLift(now: number): number {
    if (this.k !== 1 && this.state !== 'present') return 0;
    const t = this.elapsed(now);
    if (this.state === 'departing') return smooth(clamp01((t - DEPART.dissolveEnd + 0.4) / (DEPART.end - DEPART.dissolveEnd + 0.4)));
    if (this.state === 'absent') return 1;
    if (this.state === 'arriving') return 1 - smooth(clamp01((t - 0.5) / (ARRIVE.rebuildStart - 0.3)));
    return 0;
  }

  /** Every particle now: offsets from the Blobbi's ground point, altitudes, trails, tone and fade. */
  particles(now: number): TeleportParticle[] {
    const t = this.elapsed(now);
    const out: TeleportParticle[] = [];
    const H = this.height;
    if (this.state === 'departing') {
      const span = DEPART.dissolveEnd - DEPART.dissolveStart;
      for (const s of this.seeds) {
        // It leaves when the dissolve line (top to bottom) passes its row, then accelerates up.
        const leave = DEPART.dissolveStart + s.row * span;
        const tau = t - leave;
        if (tau < 0) continue;
        const rise = (z: number) => (1 - s.row) * H + 10 * s.speed * z + 0.5 * 160 * s.speed * z * z;
        const z = rise(tau);
        if (z > SKY) continue;
        const trail = [0.03, 0.06, 0.09].map((d) => rise(Math.max(0, tau - d)));
        out.push({ dx: s.dx + s.drift * tau, z, trail, tone: s.tone, alpha: 1 - clamp01((z - SKY * 0.6) / (SKY * 0.4)) });
      }
    } else if (this.state === 'arriving') {
      for (const s of this.seeds) {
        const tau = t - s.start;
        if (tau < 0) continue;
        // Falls from the sky, accelerating, to its landing row (low rows land first: the body builds from the bottom).
        const target = (1 - s.row) * H * 0.9;
        const land = ARRIVE.rebuildStart + (1 - s.row) * (ARRIVE.rebuildEnd - ARRIVE.rebuildStart) * 0.9 - s.start;
        const fall = (u: number) => s.z0 - (s.z0 - target) * smooth(clamp01(u / Math.max(0.3, land)) ** 1.6);
        if (tau > land + 0.08) continue; // absorbed into the body
        const z = fall(tau);
        const trail = [0.04, 0.08, 0.12].map((d) => fall(Math.max(0, tau - d)));
        out.push({ dx: s.dx * (0.4 + 0.6 * clamp01(tau / land)) + s.drift * (1 - clamp01(tau / land)), z, trail, tone: s.tone, alpha: clamp01(tau / 0.25) });
      }
    }
    return out;
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
