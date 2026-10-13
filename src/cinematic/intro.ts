/**
 * THE INTRO CINEMATIC: about half a minute that shows, in pictures, the birth of a small living world. The ocean
 * is wide; a shape moves beneath it; a World Carrier surfaces, bare, an animal; a patch of soil appears on its
 * back and spreads into an island; grass, trees and rocks come up; a Blobbi arrives on it the way Blobbis arrive
 * (the existing teleport), looks around, notices you and says hello. Then: "Every little world has a story. This
 * one begins with you." And the camera is the game's own camera, on the Blobbi, ready to play.
 *
 * Mystery → discovery → creation → life → welcome.
 *
 * It is a PRESENTATION over a paused live world, built from the existing renderers:
 *
 *   - the world frame is `ViewRenderer.render` (the same native Blobbi, the same magnified world, the same turtle,
 *     manta and whale animations, the same teleport arrival) with a view the cinematic's own camera decides;
 *   - the open sea beyond the world, the surfacing and the island's formation are a recolouring of that frame
 *     (`sea.ts`, with the cinematic-only pictures of `layers.ts`: the Carrier bare, the terrain alone);
 *   - the Blobbi's performance is cues on its existing animator (expressions, hops, gaze, facing), its arrival the
 *     existing `TeleportController`, and the turtle's blink and glance its existing head variants;
 *   - sound is cues on the existing engine and moods of the existing score (`audio.ts`).
 *
 * The simulation is never stepped and never written: no world time passes, nothing is collected, nothing is saved,
 * no object moves, no growth stage changes. The only state it touches is the Blobbi animator's volatile fields,
 * the teleport controller's presence, the turtle's blink schedule and the speech bubble, which it restores or
 * settles at the end, skipped or not, so the handoff is always a valid play state with the complete real world.
 *
 * Time: the cinematic has its own clock `t` (0 .. duration). The world is drawn at `clock.time - duration + t`,
 * so at the handoff the water, the wings and the fins are exactly where the game's own first frame draws them.
 * Given the same world and the same frame times the presentation is identical (tests pin it).
 */
import { t as lang, upper } from '../i18n';
import { PixelBuffer } from '../core/pixel';
import { hex, type Color } from '../core/color';
import { paletteFor } from '../world/generate';
import type { WorldPalette } from '../core/palette';
import type { LiveWorld } from '../sim/live-world';
import type { LiveRenderer, LiveRenderOptions } from '../render/live-render';
import { DEFAULT_LIVE_OPTIONS, drawTinyText } from '../render/live-render';
import type { ViewRenderer } from '../render/view-renderer';
import { ViewCamera, worldBounds, type CameraModeId, type ViewRect, type WorldBounds } from '../render/view-camera';
import type { AudioEngine } from '../audio/engine';
import type { CarrierSpecies } from '../game/archipelago';
import type { AnimatorState } from '../blobbi/animation';
import type { Expression } from '../blobbi/pose';
import { whalePose } from '../carriers/whale';
import { UI, textWidth } from '../ui/gfx';
import { DESIGN } from '../ui/hud';
import { turtleUnderlay } from '../render/compose';
import { composeIntroFrame, FULLY_GROWN, FULLY_SURFACED, movingPartsMask, OpenSea, SOIL_BAND, type ComposeScratch, type SubmergeState } from './sea';
import { bareCarrierLayer, formation, revealScale, revealSubject, terrainOnlyLayer, type Formation } from './layers';
import { birthTiming, carrierSounds, fullTiming, reducedTiming, sceneAt, surfacingOrder, travelDirection, type IntroSceneId, type IntroTiming } from './script';
import { DEPART, TeleportController, type PresenceState } from '../game/teleport';
import { drawTeleportParticles } from '../render/teleport-render';
import { eggPoseAt } from '../blobbi/egg';
import { IntroAudio } from './audio';

export interface IntroContext {
  live: LiveWorld;
  renderer: LiveRenderer;
  view: ViewRenderer;
}

export interface IntroOptions {
  /** The Carrier species to present; the live world's own when absent (the world is the source of truth). */
  species?: CarrierSpecies;
  /** Shorter, with cuts instead of camera moves, no hops, the teleport's own short form. */
  reducedMotion?: boolean;
  /** The game's audio engine, or null for silence (muted, or sound off). */
  audio?: AudioEngine | null;
  /** The live renderer's options (the playground's); defaults to the game's. */
  renderOptions?: LiveRenderOptions;
  /** Screen pixels per UI font pixel for the message, the hint and the Blobbi's bubble. */
  uiScale?: number;
  onComplete?: (result: IntroResult) => void;
  onSkip?: () => void;
  /**
   * M11D.3, A FIRST BIRTH: a genuinely new Blobbi is met here. Its own kit egg arrives in its place (the teleport's
   * particles), rocks, cracks and hatches (a burst of the teleport's rising pixels), and the Baby is out; then the
   * usual performance. A LOCAL PRESENTATION: no canonical stage is stated, changed or published by it.
   */
  birth?: boolean;
}

export interface IntroResult {
  skipped: boolean;
  /** The camera mode play should continue in (the view the cinematic ended on, or would have ended on). */
  cameraMode: CameraModeId;
  /** Seconds of the cinematic that were shown. */
  elapsed: number;
  species: CarrierSpecies;
  worldIdentity: string;
}

interface Pose {
  x: number;
  y: number;
  s: number;
}

interface Segment {
  t0: number;
  t1: number;
  a: Pose;
  b: Pose;
  /** The teleport's camera lift applies (the arrival wants the sky in view). */
  lift?: boolean;
}

interface Cue {
  at: number;
  run: () => void;
  done?: boolean;
}

const STEP = 1 / 60;
const TYPE_RATE = 30;
const FADE_IN = 0.7;
const TITLE_TINT = hex('#1b2440');
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const easeInOut = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * k));
const modeFor = (s: number): CameraModeId => (s >= 3 ? 'closeup' : s >= 1.5 ? 'exploration' : 'overview');

type AnimatorSnapshot = Pick<AnimatorState, 'direction' | 'lastFacing' | 'moving' | 'walkPhase' | 'nextBlink' | 'blinkStart' | 'nextGlance' | 'turning' | 'reaction' | 'sleeping' | 'mood'> & { glance: AnimatorState['glance'] };

export class IntroCinematic {
  readonly species: CarrierSpecies;
  readonly timing: IntroTiming;
  readonly reducedMotion: boolean;
  readonly audio: IntroAudio;
  readonly sea: OpenSea;
  /** The birth of the island: its pictures and order (tests and the dev inspector). */
  readonly formation: Formation;
  /** What the reveal frames: the whole animal, moving parts included. */
  readonly subject: { x0: number; y0: number; x1: number; y1: number };
  /** The view of the last frame (tests and the host's handoff). */
  lastView: ViewRect | null = null;
  /** The last frame drawn (the view renderer's own buffer: clone it to keep it). */
  lastScreen: PixelBuffer | null = null;

  private readonly live: LiveWorld;
  private readonly view: ViewRenderer;
  private readonly palette: WorldPalette;
  private readonly bounds: WorldBounds;
  private readonly order: Float32Array;
  private readonly parts: Uint8Array;
  private readonly staticLayer: PixelBuffer;
  private readonly bare: PixelBuffer;
  private readonly land: PixelBuffer;
  private readonly renderOptions: LiveRenderOptions;
  private readonly uiScale: number;
  private readonly onComplete?: (r: IntroResult) => void;
  private readonly onSkip?: () => void;
  private readonly scratch: ComposeScratch = { kinds: null };
  private readonly cues: Cue[] = [];
  private readonly segmentCache = new Map<string, Segment[]>();
  private t = 0;
  private perfTime = 0;
  private started = false;
  private finished = false;
  private disposed = false;
  private snapshot: { animator: AnimatorSnapshot; turtle: LiveWorld['turtleAnim']; bubble: LiveWorld['bubble']; presence: PresenceState; teleportReduced: boolean } | null = null;
  private lastSpout = -1;
  /** The world's clock when the cinematic began: the world is drawn at `t0 + t`, ending exactly on it. */
  private readonly t0: number;
  /** M11D.3: a first birth (the egg). */
  readonly birth: boolean;
  /** M11D.3: the hatch's burst of light (the teleport's own departure particles, rising from the shell). */
  private burst: TeleportController | null = null;

  constructor(ctx: IntroContext, opts: IntroOptions = {}) {
    this.live = ctx.live;
    this.view = ctx.view;
    this.species = this.live.species;
    this.reducedMotion = !!opts.reducedMotion;
    this.birth = !!opts.birth;
    const base = this.reducedMotion ? reducedTiming() : fullTiming(this.species);
    this.timing = this.birth ? birthTiming(base, this.reducedMotion) : base;
    this.palette = paletteFor(this.live.world.options.palette);
    this.bounds = worldBounds(this.live.world);
    this.order = surfacingOrder(this.live.world, this.species, this.bounds);
    this.parts = movingPartsMask(this.live.world);
    this.subject = revealSubject(this.live.world, this.bounds, this.parts);
    this.staticLayer = ctx.renderer.staticLayer;
    this.bare = bareCarrierLayer(this.live.world);
    this.land = terrainOnlyLayer(this.live.world, turtleUnderlay(this.live.world, { head: false, flippers: false }));
    this.formation = formation(this.live.world, this.bare, this.land);
    // The game's own open sea (one set of tiles for the frame beneath and the water painted over it).
    this.sea = ctx.renderer.openSea();
    this.audio = new IntroAudio(opts.audio ?? null, this.live.world.seed);
    this.renderOptions = { ...(opts.renderOptions ?? DEFAULT_LIVE_OPTIONS), hud: false, debugCollision: false, debugPath: false };
    this.uiScale = opts.uiScale ?? 2;
    this.onComplete = opts.onComplete;
    this.onSkip = opts.onSkip;
    this.t0 = this.live.clock.time - this.timing.end;
    this.plan();
  }

  /** Total length in seconds (the full presentation about 32 s, reduced motion about 19.5 s). */
  get duration(): number {
    return this.timing.end;
  }

  get elapsed(): number {
    return this.t;
  }

  get done(): boolean {
    return this.finished;
  }

  get scene(): IntroSceneId | 'done' {
    return this.finished ? 'done' : sceneAt(this.t, this.timing);
  }

  /** The world's drawing time for cinematic time `t`. */
  worldTime(t = this.t): number {
    return this.t0 + t;
  }

  // ─── The plan: cues on the animator, the teleport, the turtle and the sound, in cinematic time ────────

  private plan(): void {
    const tm = this.timing;
    const live = this.live;
    const b = live.blobbi;
    const anim = b.animator;
    const s = anim.state;
    const sounds = carrierSounds(this.species);
    const reduced = this.reducedMotion;
    const cue = (at: number, run: () => void) => this.cues.push({ at, run });
    const T = () => this.worldTime();
    const react = (e: Expression, seconds: number, hop: number) => anim.react(e, T(), seconds, reduced ? 0 : hop);
    // The arrival: the existing teleport, begun on the cinematic's clock (its events are read every frame).
    cue(tm.arrival, () => {
      live.teleport.reducedMotion = reduced;
      s.direction = 'down';
      // A first birth: the Blobbi's own egg is what arrives (the same particles), and stays until it hatches.
      if (tm.egg) live.egg = { crack: 'none', angle: 0 };
      live.teleport.enterBlobbi(T());
    });
    if (tm.egg) {
      const egg = tm.egg;
      for (const c of egg.cracks) cue(c, () => this.audio.cue('plant', 0.8));
      cue(egg.strong, () => this.audio.cue('curious', 0.6));
      cue(egg.hatch, () => {
        // The shell opens: a burst of light rises from it (the teleport's own departure pixels, begun so they leave
        // at once), and the Baby is there, facing you, with a happy little hop.
        live.egg = null;
        const burst = new TeleportController(`${live.blobbi.seed}/birth`, live.bodyH, Math.max(3, live.teleport.halfWidth + 2));
        burst.reducedMotion = reduced;
        burst.leaveBlobbi(T() - DEPART.dissolveStart * (reduced ? 0.6 : 1));
        this.burst = burst;
        s.direction = 'down';
        react('happy', 1.1, reduced ? 0 : 2);
        this.audio.cue('recipe', 0.9);
        this.audio.cue('happy', 0.7);
      });
    }
    // The performance: a look one way and the other (the body turns, as a Blobbi looks), then you, then hello.
    const first: -1 | 1 = this.formation.land.cx >= b.x ? 1 : -1;
    cue(tm.looks[0], () => {
      s.direction = first > 0 ? 'right' : 'left';
      s.lastFacing = first;
      s.glance = { x: first, until: T() + 1000 };
      this.audio.cue('curious', 0.7);
    });
    cue(tm.looks[1], () => {
      s.direction = first > 0 ? 'left' : 'right';
      s.lastFacing = first > 0 ? -1 : 1;
      s.glance = { x: s.lastFacing, until: T() + 1000 };
    });
    cue(tm.notices, () => {
      s.direction = 'down';
      s.glance = { x: 0, until: 0 };
      react('surprised', 0.95, 1);
      this.audio.cue('curious', 0.8);
    });
    cue(tm.happy, () => {
      react('happy', reduced ? 2.4 : 2, 3);
      this.audio.cue('happy', 0.8);
      this.audio.mood('special');
      live.bubble = { text: 'hello!', until: T() + 2.1, x: b.x, y: b.y - b.size - 2, head: b.size };
    });
    cue(tm.happy + 2.1, () => {
      live.bubble = null;
    });
    cue(tm.beginning + 0.2, () => react('happy', tm.end - tm.beginning + 1.2, 0));
    // The Carrier's own moment.
    if (this.species === 'turtle' && live.world.turtle) {
      const ta = live.turtleAnim;
      // The turtle glances toward where its island will be; the head sprite's left/right variant.
      const glance: -1 | 1 = this.formation.land.cx < live.world.turtle.head.cx ? -1 : 1;
      cue(tm.carrierBeat, () => {
        ta.blinkUntil = T() + 0.22;
        ta.glance = glance;
        ta.glanceUntil = T() + 2.4;
      });
      cue(tm.carrierBeat + 0.22, () => {
        ta.blinkUntil = -1;
      });
      cue(tm.carrierBeat + 2.4, () => {
        ta.glance = 0;
        ta.glanceUntil = 0;
      });
      cue(tm.carrierBeat + 3.2, () => {
        ta.blinkUntil = T() + 0.18;
      });
      cue(tm.carrierBeat + 3.38, () => {
        ta.blinkUntil = -1;
      });
    }
    // Sound: the ocean, the emergence, the formation, the greeting (the arrival's own sounds come with its events).
    cue(0, () => {
      this.audio.beds(0.9, 0.35);
      this.audio.mood('mystery');
    });
    cue(Math.min(1.8, tm.carrier * 0.5), () => this.audio.cue(sounds.call, 0.5));
    cue(tm.surfacing[0], () => {
      this.audio.cue('splash', 0.9);
      if (this.species !== 'whale') this.audio.cue(sounds.breath, 0.8);
    });
    cue(tm.surfacing[0] + (tm.surfacing[1] - tm.surfacing[0]) * 0.45, () => this.audio.cue('splash', 0.7));
    cue(tm.surfacing[1] - 0.3, () => this.audio.cue('splash', 0.6));
    cue(tm.carrierBeat, () => this.audio.cue(this.species === 'turtle' ? 'hum' : sounds.call, this.species === 'turtle' ? 0.5 : 0.7));
    const [landStart, landEnd] = tm.landForming;
    cue(landStart, () => {
      this.audio.cue('grow', 0.8);
      this.audio.beds(0.55, 0.22);
      this.audio.mood('day');
    });
    for (const p of this.formation.patches) if (p.delay > 0) cue(landStart + p.delay * (landEnd - landStart), () => this.audio.cue('plant', 0.6));
    cue(landEnd, () => this.audio.cue('recipe', 0.5));
    cue(tm.lifeForming[0] + 0.6, () => this.audio.cue('bird', 0.7));
    cue(tm.lifeForming[0] + 2.0, () => this.audio.cue('bird', 0.6));
    cue(tm.line1, () => this.audio.cue('friend', 0.6));
    this.cues.sort((p, q) => p.at - q.at);
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    const live = this.live;
    const s = live.blobbi.animator.state;
    this.snapshot = {
      animator: { direction: s.direction, lastFacing: s.lastFacing, moving: s.moving, walkPhase: s.walkPhase, nextBlink: s.nextBlink, blinkStart: s.blinkStart, nextGlance: s.nextGlance, glance: { ...s.glance }, turning: s.turning, reaction: s.reaction, sleeping: s.sleeping, mood: s.mood },
      turtle: { ...live.turtleAnim },
      bubble: live.bubble,
      presence: live.teleport.state,
      teleportReduced: live.teleport.reducedMotion,
    };
    // A calm, awake Blobbi, not yet here: it arrives once its island exists.
    const T = this.worldTime(0);
    s.moving = false;
    s.walkPhase = 0;
    s.turning = null;
    s.reaction = null;
    s.sleeping = false;
    s.mood = null;
    s.blinkStart = -1;
    s.nextBlink = T + this.timing.arrival + 5;
    s.glance = { x: 0, until: 0 };
    s.nextGlance = T + 1e6; // the performance decides where it looks
    s.direction = 'down';
    live.bubble = null;
    if (live.teleport.state !== 'absent') {
      live.teleport.cancelTransition();
      live.teleport.state = 'absent';
    }
    if (this.species === 'whale' && live.world.creature?.species === 'whale') this.lastSpout = whalePose(live.world.creature.anatomy, T).spout;
  }

  // ─── Per frame ──────────────────────────────────────────────────────────────────────────────────────

  /** Advance by `dt` real seconds (clamped) and draw the frame for a `W`×`H` screen. */
  frame(dt: number, W: number, H: number): PixelBuffer {
    if (this.disposed) throw new Error('intro cinematic disposed');
    this.start();
    if (!this.finished) {
      this.t = Math.min(this.timing.end, this.t + Math.max(0, Math.min(0.1, dt)));
      this.fireCues();
      if (this.timing.egg && this.live.egg) this.live.egg = eggPoseAt(this.t, this.timing.egg, this.reducedMotion) ?? this.live.egg;
      this.stepPerformance();
      this.stepArrival();
      this.watchSpout();
    }
    const screen = this.draw(W, H, this.finished ? this.timing.end : this.t);
    this.audio.tick();
    if (!this.finished && this.t >= this.timing.end) this.finish(false);
    return screen;
  }

  private fireCues(): void {
    for (const c of this.cues) {
      if (c.done || c.at > this.t) continue;
      c.done = true;
      c.run();
    }
  }

  /** The Blobbi's animator advances in fixed steps of the cinematic's clock (deterministic for a frame-time sequence). */
  private stepPerformance(): void {
    const anim = this.live.blobbi.animator;
    while (this.t - this.perfTime >= STEP) {
      this.perfTime += STEP;
      anim.step(STEP, this.worldTime(this.perfTime), { moving: false, direction: anim.state.direction });
    }
  }

  /** The existing arrival's phases: its sounds, and the smile and hop when it lands (as the game does). */
  private stepArrival(): void {
    const tp = this.live.teleport;
    if (tp.state !== 'arriving') return;
    const T = this.worldTime();
    for (const e of tp.step(T)) {
      this.audio.cue(`teleport-${e}`, 1);
      if (e === 'arrived' && !this.live.egg) this.live.blobbi.animator.react('happy', T, 1.2, this.reducedMotion ? 0 : 3);
    }
  }

  /** A whale's breath is heard when its spout leaves the blowholes, once it is up. */
  private watchSpout(): void {
    const c = this.live.world.creature;
    if (c?.species !== 'whale') return;
    const spout = whalePose(c.anatomy, this.worldTime()).spout;
    if (spout >= 0 && this.lastSpout < 0 && this.surfacing(this.t) > 0.3) this.audio.cue('whale-blow', 0.9);
    this.lastSpout = spout;
  }

  /** 0 .. 1 of the carrier's shape under the water. */
  private shadow(t: number): number {
    const [a, b] = this.timing.shadowIn;
    return smooth((t - a) / Math.max(1e-6, b - a));
  }

  /** The surfacing front, 0 .. FULLY_SURFACED. */
  surfacing(t: number): number {
    const [a, b] = this.timing.surfacing;
    return FULLY_SURFACED * smooth((t - a) / Math.max(1e-6, b - a));
  }

  /** The land's formation, 0 .. 1 + SOIL_BAND (slow to start: the first patch lingers). */
  landProgress(t: number): number {
    const [a, b] = this.timing.landForming;
    return (1 + SOIL_BAND) * smooth((t - a) / Math.max(1e-6, b - a));
  }

  /** Life's appearance, 0 .. FULLY_GROWN. */
  vegProgress(t: number): number {
    const [a, b] = this.timing.lifeForming;
    return FULLY_GROWN * smooth((t - a) / Math.max(1e-6, b - a));
  }

  // ─── The camera ─────────────────────────────────────────────────────────────────────────────────────

  /** The gameplay view the cinematic settles on: the exploration camera at rest on the Blobbi (what the host snaps to). */
  handoffView(W: number, H: number): ViewRect {
    const b = this.live.blobbi;
    return new ViewCamera('exploration').update(0, { x: b.x, y: b.y, size: b.size }, W, H, this.bounds, true);
  }

  private segments(W: number, H: number): Segment[] {
    const key = `${W}x${H}`;
    const hit = this.segmentCache.get(key);
    if (hit) return hit;
    const tm = this.timing;
    const sub = this.subject;
    const sO = revealScale(W, H, sub);
    const C: Pose = { x: (sub.x0 + sub.x1) / 2, y: (sub.y0 + sub.y1) / 2, s: sO };
    const b = this.live.blobbi;
    const F: Pose = { x: b.x, y: b.y - b.size / 2, s: 2 };
    const hv = this.handoffView(W, H);
    const G: Pose = { x: hv.originX + W / 4, y: hv.originY + H / 4, s: 2 };
    let out: Segment[];
    if (this.reducedMotion) {
      // Cuts: the whole Carrier (bare, then its island forming), then the gameplay framing for everything else.
      out = [
        { t0: 0, t1: tm.islandZoom[1], a: C, b: C },
        { t0: tm.islandZoom[1], t1: tm.end, a: G, b: G },
      ];
    } else {
      // The ocean: start ahead of the Carrier along its course, so it glides into view head first.
      const v = travelDirection(this.species);
      const halfSub = (Math.abs(v.x) * (sub.x1 - sub.x0) + Math.abs(v.y) * (sub.y1 - sub.y0)) / 2;
      const halfView = (Math.abs(v.x) * (W / sO) + Math.abs(v.y) * (H / sO)) / 2;
      const away = halfSub + halfView + 16;
      const start: Pose = { x: C.x + v.x * away, y: C.y + v.y * away, s: sO };
      const F4: Pose = { ...F, s: 4 };
      out = [
        { t0: 0, t1: tm.carrier, a: start, b: C },
        { t0: tm.carrier, t1: tm.islandZoom[0], a: C, b: C },
        { t0: tm.islandZoom[0], t1: tm.islandZoom[1], a: C, b: F },
        { t0: tm.islandZoom[1], t1: tm.closeUp[0], a: F, b: F, lift: true },
        { t0: tm.closeUp[0], t1: tm.closeUp[1], a: F, b: F4 },
        { t0: tm.closeUp[1], t1: tm.settle[0], a: F4, b: F4 },
        { t0: tm.settle[0], t1: tm.settle[1], a: F4, b: G },
        { t0: tm.settle[1], t1: tm.end, a: G, b: G },
      ];
    }
    this.segmentCache.set(key, out);
    return out;
  }

  /** The view at cinematic time `t`: focus and scale from the segments, origins on whole world pixels at rest. */
  viewAt(t: number, W: number, H: number): { view: ViewRect; restScale: number } {
    const segs = this.segments(W, H);
    let seg = segs[segs.length - 1];
    for (const s of segs)
      if (t < s.t1) {
        seg = s;
        break;
      }
    const k = easeInOut((t - seg.t0) / Math.max(1e-6, seg.t1 - seg.t0));
    const zooming = seg.a.s !== seg.b.s;
    const s = zooming ? Math.exp(Math.log(seg.a.s) + (Math.log(seg.b.s) - Math.log(seg.a.s)) * k) : seg.a.s;
    const fx = seg.a.x + (seg.b.x - seg.a.x) * k;
    let fy = seg.a.y + (seg.b.y - seg.a.y) * k;
    if (seg.lift) {
      // The arrival wants the sky in view: the game's own lift (a fifth of the view), eased in just before it.
      const ramp = smooth((t - (this.timing.arrival - 1)) / 1);
      fy -= this.live.teleport.cameraLift(this.worldTime(t)) * ramp * (H / s) * 0.2;
    }
    let originX = fx - W / s / 2;
    let originY = fy - H / s / 2;
    if (!zooming) {
      originX = Math.round(originX);
      originY = Math.round(originY);
    }
    const restScale = seg.b.s;
    return { view: { mode: modeFor(restScale), scale: s, originX, originY, screenW: W, screenH: H, transitioning: zooming }, restScale };
  }

  // ─── Drawing ────────────────────────────────────────────────────────────────────────────────────────

  private draw(W: number, H: number, t: number): PixelBuffer {
    const { view, restScale } = this.viewAt(t, W, H);
    const time = this.worldTime(t);
    // Up close the bubble follows the Blobbi's size (the HUD is off, so the UI scale only sizes the bubble).
    const uiScale = this.uiScale * (restScale >= 4 ? 2 : 1);
    const screen = this.view.render(view, restScale, time, this.renderOptions, { hud: false, goals: false, prompt: false, indicator: false, lighting: false, uiScale });
    const state: SubmergeState = {
      shadow: this.shadow(t),
      progress: this.surfacing(t),
      order: this.order,
      parts: this.parts,
      staticLayer: this.staticLayer,
      bare: this.bare,
      land: this.land,
      form: this.formation.order,
      formSet: this.formation.set,
      landProgress: this.landProgress(t),
      vegProgress: this.vegProgress(t),
    };
    composeIntroFrame(screen, view, this.live.world, this.sea, this.palette, time, state, this.scratch);
    // The hatch's light, over the Baby (where it was drawn this frame).
    const at = this.view.lastBlobbi;
    if (this.burst && at && this.burst.state === 'departing') {
      this.burst.step(time);
      drawTeleportParticles(screen, this.burst, time, at.x, at.y, view.scale);
    }
    if (t < FADE_IN) tint(screen, TITLE_TINT, 1 - smooth(t / FADE_IN));
    if (t >= 1.2 && t < this.timing.beginning) this.drawHint(screen);
    if (t >= this.timing.line1) this.drawMessage(screen, t);
    this.lastView = view;
    this.lastScreen = screen;
    return screen;
  }

  private drawHint(screen: PixelBuffer): void {
    const u = this.uiScale;
    // The hint and the two lines are in the player's language (M11B; English is `SKIP_HINT` and `INTRO_MESSAGE`).
    const hint = upper(lang('intro.skip'));
    const w = textWidth(hint) + 2;
    const b = new PixelBuffer(w + 1, 9);
    drawTinyText(b, hint, 2, 4, DESIGN.card);
    drawTinyText(b, hint, 1, 3, UI.muted);
    const big = b.scaled(u);
    screen.blit(big, screen.width - big.width - 5 * u, screen.height - big.height - 5 * u);
  }

  /** The two lines, typed out, over a band of dusk so they read on any ground. */
  private drawMessage(screen: PixelBuffer, t: number): void {
    const tm = this.timing;
    const W = screen.width;
    const lines = [upper(lang('intro.line1')), upper(lang('intro.line2'))];
    const widest = Math.max(...lines.map(textWidth));
    let k = this.uiScale + 1;
    while (k > 1 && widest * k > W - 16) k--;
    const y0 = Math.round(screen.height * 0.16);
    const lineGap = 9 * k;
    const bandTop = y0 - 5 * k;
    const bandBottom = y0 + lineGap + 5 * k + 5 * k;
    const shown = [Math.floor((t - tm.line1) * TYPE_RATE), Math.floor((t - tm.line2) * TYPE_RATE)];
    if (shown[0] <= 0) return;
    // The band fades in with the first letters.
    const band = smooth(Math.min(1, (t - tm.line1) / 0.5)) * 0.45;
    const d = screen.data;
    for (let y = Math.max(0, bandTop); y < Math.min(screen.height, bandBottom); y++) for (let x = 0; x < W; x++) d[y * W + x] = blendColor(d[y * W + x], DESIGN.card, band);
    lines.forEach((line, i) => {
      const n = shown[i];
      if (n <= 0) return;
      const text = line.slice(0, n);
      const full = textWidth(line);
      const b = new PixelBuffer(full + 2, 10);
      drawTinyText(b, text, 1, 3, i === 0 ? UI.ink : UI.accent);
      const big = b.scaled(k);
      const shadow = new PixelBuffer(full + 2, 10);
      drawTinyText(shadow, text, 1, 3, DESIGN.card);
      const x = Math.floor((W - full * k) / 2) - k;
      const y = y0 + i * lineGap - 2 * k;
      screen.blit(shadow.scaled(k), x + k, y + k);
      screen.blit(big, x, y);
    });
  }

  // ─── Ending ─────────────────────────────────────────────────────────────────────────────────────────

  /** Skip: the handoff state at once, then the callbacks (`onSkip`, then `onComplete` with `skipped: true`). */
  skip(): void {
    if (this.finished) return;
    this.finish(true);
  }

  private finish(skipped: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.settle(skipped);
    this.audio.release();
    const result: IntroResult = { skipped, cameraMode: 'exploration', elapsed: this.t, species: this.species, worldIdentity: this.live.identity };
    if (skipped) this.onSkip?.();
    this.onComplete?.(result);
  }

  /**
   * Leave the live world in a valid play state: the Blobbi present on the complete real world. Skipped (or
   * cancelled) early, the world's drawing time jumps back to the game's clock, so every time the performance set
   * is dropped; at the natural end the two clocks coincide and the Blobbi's last smile may simply finish.
   */
  private settle(hard: boolean): void {
    const live = this.live;
    const snap = this.snapshot;
    if (!snap) return;
    const now = live.clock.time;
    // Whatever happens, the egg is a presentation only: the Baby is simply there at the handoff.
    live.egg = null;
    this.burst = null;
    const s = live.blobbi.animator.state;
    s.moving = false;
    s.walkPhase = 0;
    s.turning = null;
    s.sleeping = false;
    s.direction = 'down';
    s.glance = { x: 0, until: 0 };
    s.nextGlance = now + 3;
    s.mood = snap.animator.mood;
    if (hard || s.nextBlink > now + 5 || s.nextBlink < now) s.nextBlink = now + 1.5;
    if (hard || s.blinkStart > now) s.blinkStart = -1;
    if (hard || (s.reaction && (s.reaction.until > now + 3 || s.reaction.start > now))) s.reaction = null;
    Object.assign(live.turtleAnim, snap.turtle);
    if (hard || (live.bubble && live.bubble.until > now + 3)) live.bubble = null;
    // The Blobbi is simply present (the arrival ended on the clock, or is cut short), with the game's own setting.
    if (live.teleport.state === 'arriving' || live.teleport.state === 'departing') live.teleport.cancelTransition();
    live.teleport.state = 'present';
    live.teleport.reducedMotion = snap.teleportReduced;
  }

  /** Cancel without callbacks (the host is leaving): the world is settled and the buffers released. */
  dispose(): void {
    if (this.disposed) return;
    if (!this.finished) {
      this.finished = true;
      this.settle(true);
      this.audio.release();
    }
    this.disposed = true;
    this.scratch.kinds = null;
    this.segmentCache.clear();
    this.lastScreen = null;
  }
}

/** Blend the whole screen toward one colour (a colour fade in time: every pixel stays a crisp block). */
function tint(screen: PixelBuffer, c: Color, k: number): void {
  if (k <= 0) return;
  const d = screen.data;
  for (let i = 0; i < d.length; i++) d[i] = blendColor(d[i], c, k);
}

function blendColor(a: Color, b: Color, t: number): Color {
  const r = (a & 0xff) + ((b & 0xff) - (a & 0xff)) * t;
  const g = ((a >>> 8) & 0xff) + (((b >>> 8) & 0xff) - ((a >>> 8) & 0xff)) * t;
  const bl = ((a >>> 16) & 0xff) + (((b >>> 16) & 0xff) - ((a >>> 16) & 0xff)) * t;
  return (0xff000000 | ((bl + 0.5) << 16) | ((g + 0.5) << 8) | (r + 0.5)) >>> 0;
}
