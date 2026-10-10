/**
 * THE ANIMATOR: a small state machine that turns time and input into a
 * pose. There is no spritesheet; every frame is a pose key, and the sprite
 * builder draws it. Blinks and idle glances come from a keyed stream of the
 * Blobbi's seed, so two runs of the same world blink at the same moments.
 */
import { stream, type Rng } from '../core/rng';
import { type BlobbiPose, type Expression, type Facing, REST_POSE } from './pose';
import { WALK_FRAMES } from './canonical';

export type Direction = 'down' | 'up' | 'left' | 'right';

export interface AnimInput {
  moving: boolean;
  direction: Direction;
}

export interface Reaction {
  expression: Expression;
  until: number;
  /** Hop height in pixels at the start of the reaction. */
  hop: number;
  start: number;
}

export interface AnimatorState {
  direction: Direction;
  lastFacing: Facing;
  moving: boolean;
  walkPhase: number;
  breathPhase: number;
  nextBlink: number;
  blinkStart: number;
  nextGlance: number;
  glance: { x: -1 | 0 | 1; until: number };
  turning: { until: number; facing: Facing } | null;
  reaction: Reaction | null;
  sleeping: boolean;
}

export const WALK_CYCLE_HZ = 1 / 0.62; // the kit's walk: one cycle per 0.62 s
export const BREATH_PERIOD = 3.2;
export const BLINK_DURATION = 0.14;
export const TURN_DURATION = 0.09;

export class BlobbiAnimator {
  readonly state: AnimatorState;
  private readonly rng: Rng;

  constructor(seed: string) {
    this.rng = stream(seed, 'blobbi', 'animation');
    this.state = {
      direction: 'down',
      lastFacing: 1,
      moving: false,
      walkPhase: 0,
      breathPhase: 0,
      nextBlink: 1.5 + this.rng.range(0, 2),
      blinkStart: -1,
      nextGlance: 3 + this.rng.range(0, 3),
      glance: { x: 0, until: 0 },
      turning: null,
      reaction: null,
      sleeping: false,
    };
  }

  /** Advance by one simulation step. */
  step(dt: number, time: number, input: AnimInput): void {
    const s = this.state;
    if (input.direction !== s.direction) {
      const opposite = (a: Direction, b: Direction) => (a === 'down' && b === 'up') || (a === 'up' && b === 'down') || (a === 'left' && b === 'right') || (a === 'right' && b === 'left');
      if (opposite(s.direction, input.direction)) s.turning = { until: time + TURN_DURATION, facing: s.lastFacing };
      s.direction = input.direction;
      if (input.direction === 'left') s.lastFacing = -1;
      if (input.direction === 'right') s.lastFacing = 1;
    }
    if (s.turning && time >= s.turning.until) s.turning = null;
    s.moving = input.moving;
    if (input.moving) {
      s.walkPhase = (s.walkPhase + dt * WALK_CYCLE_HZ * WALK_FRAMES) % WALK_FRAMES;
      s.sleeping = false;
    } else s.walkPhase = 0;
    s.breathPhase = (s.breathPhase + dt / BREATH_PERIOD) % 1;
    // Blinks: scheduled from the seed's own stream.
    if (s.blinkStart < 0 && time >= s.nextBlink) {
      s.blinkStart = time;
      s.nextBlink = time + BLINK_DURATION + this.rng.range(1.8, 4.5);
      // Occasionally a double blink.
      if (this.rng.chance(0.2)) s.nextBlink = time + BLINK_DURATION + 0.25;
    }
    if (s.blinkStart >= 0 && time >= s.blinkStart + BLINK_DURATION) s.blinkStart = -1;
    // Idle glances.
    if (!input.moving && time >= s.nextGlance) {
      s.glance = { x: this.rng.pick([-1, 1] as const), until: time + this.rng.range(0.6, 1.4) };
      s.nextGlance = time + this.rng.range(3, 7);
    }
    if (input.moving) s.glance.until = 0;
    if (s.reaction && time >= s.reaction.until) s.reaction = null;
  }

  react(expression: Expression, time: number, duration = 1.2, hop = 3): void {
    this.state.reaction = { expression, until: time + duration, hop, start: time };
    this.state.sleeping = false;
  }

  /** The pose to draw at `time`. */
  pose(time: number): BlobbiPose {
    const s = this.state;
    const pose: BlobbiPose = { ...REST_POSE };
    const dir = s.turning ? 'side' : s.direction;
    if (dir === 'side') {
      pose.view = 'side';
      pose.facing = s.turning!.facing;
    } else if (dir === 'down') pose.view = 'front';
    else if (dir === 'up') pose.view = 'back';
    else {
      pose.view = 'side';
      pose.facing = dir === 'left' ? -1 : 1;
    }
    pose.walk = s.moving ? (Math.floor(s.walkPhase) as BlobbiPose['walk']) : -1;
    pose.breath = !s.moving && s.breathPhase > 0.5 ? 1 : 0;
    if (s.sleeping) pose.lid = 2;
    else if (s.blinkStart >= 0) {
      const t = (time - s.blinkStart) / BLINK_DURATION;
      pose.lid = t < 0.2 || t > 0.8 ? 1 : 2;
    }
    if (s.reaction) pose.expression = s.reaction.expression;
    else if (s.sleeping) pose.expression = 'sleepy';
    if (!s.moving && time < s.glance.until && !s.reaction) pose.gazeX = s.glance.x;
    return pose;
  }

  /** Vertical offset in pixels (negative is up) for a reaction hop. */
  hop(time: number): number {
    const r = this.state.reaction;
    if (!r || r.hop <= 0) return 0;
    const t = (time - r.start) / 0.32;
    if (t >= 1) return 0;
    return -Math.round(Math.sin(t * Math.PI) * r.hop);
  }
}
