/**
 * THE LIVE WORLD: a generated world plus everything that changes. The
 * terrain and object placements stay what the generator made; on top of
 * them live a controllable Blobbi, wind, falling leaves, sparkles, smoke,
 * planted trees that grow, and the small reactions of touching things.
 * All of it advances in fixed clock steps and draws its randomness from
 * keyed streams, so a replay of the same inputs is the same world.
 */
import { SimClock } from './clock';
import { CollisionMap } from './collision';
import { ParticleSystem } from './particles';
import { stream, type Rng } from '../core/rng';
import type { Sprite } from '../core/pixel';
import { hex } from '../core/color';
import { OBJECT_GENERATORS } from '../objects';
import type { TreeResult } from '../objects/tree';
import type { HouseResult } from '../objects/structures';
import { paletteFor } from '../world/generate';
import { T, type Placement, type WorldDescription } from '../world/types';
import { blobbiIdentity, type PixelBlobbiIdentity } from '../blobbi/identity';
import { BlobbiAnimator, type Direction } from '../blobbi/animation';
import { buildBlobbiSprite, poseKey, type BlobbiPose } from '../blobbi/sprite';
import { Brain, NavGrid } from './brain';

export interface LiveInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Edge-triggered: true on the step the key went down. */
  interact: boolean;
  plant: boolean;
}

export const IDLE_INPUT: LiveInput = { up: false, down: false, left: false, right: false, interact: false, plant: false };

export interface BlobbiEntity {
  seed: string;
  identity: PixelBlobbiIdentity;
  animator: BlobbiAnimator;
  x: number;
  y: number;
  size: number;
  footRx: number;
  footRy: number;
  /** Pixels per second. */
  speed: number;
}

export interface PlantedTree {
  placement: Placement;
  plantedAt: number;
  /** Whether its footprint has been added to the collision map yet. */
  solid: boolean;
}

export interface Bubble {
  text: string;
  until: number;
  x: number;
  y: number;
}

export interface LiveStats {
  steps: number;
  interactions: number;
  particles: number;
  planted: number;
}

/** Wind strength 0..1 at a world x and time: slow gusts that travel across the map. */
export function windAt(time: number, x: number): number {
  const gust = Math.sin(time * 0.45 - x / 140) * Math.sin(time * 0.17 + 0.8);
  return Math.max(0, gust) ** 1.5;
}

export class LiveWorld {
  readonly clock = new SimClock();
  readonly particles: ParticleSystem;
  readonly spriteCache = new Map<string, Sprite>();
  readonly blobbiCache = new Map<string, Sprite>();
  collision: CollisionMap;
  blobbi: BlobbiEntity;
  readonly planted: PlantedTree[] = [];
  /** Per-object sway phase, so trees do not move in step. */
  readonly swayPhase: Float32Array;
  /** The Blobbi's autonomy: a nav grid over the collision map and a small behaviour machine. */
  nav!: NavGrid;
  brain!: Brain;
  /** Turtle animation state (turtle worlds only). */
  readonly turtleAnim = { blinkUntil: -1, nextBlink: 2.5, glance: 0 as -1 | 0 | 1, glanceUntil: 0, nextGlance: 6 };
  /** Shake impulses from interactions, by object index (planted trees use index + objects.length). */
  readonly impulses = new Map<number, { until: number; strength: number }>();
  bubble: Bubble | null = null;
  growDuration = 45;
  readonly stats: LiveStats = { steps: 0, interactions: 0, particles: 0, planted: 0 };
  private readonly ambient: Rng;
  private readonly shallow: Int32Array;
  private readonly chimneys: { x: number; y: number }[] = [];
  private smokeTimer = 0;
  private lastInput: LiveInput = IDLE_INPUT;
  private movedLastStep = false;

  constructor(
    readonly world: WorldDescription,
    blobbiSeed: string,
    blobbiSize = 16,
  ) {
    this.particles = new ParticleSystem(world.seed);
    this.ambient = stream(world.seed, 'ambient');
    const phases = stream(world.seed, 'sway');
    this.swayPhase = new Float32Array(world.objects.length);
    for (let i = 0; i < world.objects.length; i++) this.swayPhase[i] = phases.range(0, Math.PI * 2);
    // Shallow-water pixels, for sparkles.
    const list: number[] = [];
    const { cls } = world.terrain;
    for (let i = 0; i < cls.length; i += 3) if (cls[i] === T.SHALLOW) list.push(i);
    this.shallow = Int32Array.from(list);
    for (const o of world.objects) {
      if (o.kind !== 'house') continue;
      const s = this.spriteOf(o) as HouseResult;
      if (s.chimney) this.chimneys.push({ x: o.x - s.anchorX + s.chimney.x, y: o.y - s.anchorY + s.chimney.y });
    }
    this.collision = CollisionMap.fromWorld(world, (p) => this.spriteOf(p));
    this.blobbi = this.makeBlobbi(blobbiSeed, blobbiSize);
    this.placeBlobbiAtStart();
    this.rebuildBrain();
  }

  /** The nav grid and brain depend on the Blobbi's foot size and the world; rebuilt when either changes. */
  private rebuildBrain(): void {
    this.nav = new NavGrid(this.collision, this.blobbi.footRx, this.blobbi.footRy);
    const wasEnabled = this.brain?.enabled ?? true;
    this.brain = new Brain(`${this.world.seed}/${this.blobbi.seed}`, this.nav, this.world.objects);
    this.brain.enabled = wasEnabled;
  }

  private makeBlobbi(seed: string, size: number): BlobbiEntity {
    const identity = blobbiIdentity(seed);
    const sprite = buildBlobbiSprite(identity, { view: 'front', facing: 1, breath: 0, lid: 0, expression: 'neutral', walk: -1, gazeX: 0, gazeY: 0 }, size);
    return { seed, identity, animator: new BlobbiAnimator(seed), x: 0, y: 0, size, footRx: Math.max(2, sprite.footRx - 1), footRy: 2, speed: 42 };
  }

  /** Start on the first island's hub, or the nearest free ground to it. */
  private placeBlobbiAtStart(): void {
    const hub = this.world.hubs[0] ?? { x: this.world.islands[0].cx, y: this.world.islands[0].cy };
    const spot = this.collision.nearestFree(hub.x, hub.y + 2, this.blobbi.footRx, this.blobbi.footRy) ?? { x: hub.x, y: hub.y };
    this.blobbi.x = spot.x;
    this.blobbi.y = spot.y;
  }

  setBlobbi(seed: string, size = this.blobbi.size): void {
    const { x, y } = this.blobbi;
    this.blobbi = this.makeBlobbi(seed, size);
    this.blobbi.x = x;
    this.blobbi.y = y;
    this.blobbiCache.clear();
    this.rebuildBrain();
  }

  /** The sprite of a placement, with growth for planted trees. Cached by every input that matters. */
  spriteOf(p: Placement, growth = 1): Sprite {
    const key = `${this.world.options.palette}|${p.kind}|${p.seed}|${p.size}|${JSON.stringify(p.variation ?? null)}|${growth}`;
    const hit = this.spriteCache.get(key);
    if (hit) return hit;
    const sprite = OBJECT_GENERATORS[p.kind]({ seed: p.seed, size: p.size, palette: paletteFor(this.world.options.palette), variation: p.variation as never, growth });
    this.spriteCache.set(key, sprite);
    return sprite;
  }

  /** Growth of a planted tree at the current time, quantized so sprites are reused. */
  growthOf(t: PlantedTree): number {
    const g = Math.min(1, (this.clock.time - t.plantedAt) / this.growDuration);
    return Math.round(g * 24) / 24;
  }

  /** The Blobbi's sprite for a pose, cached. */
  blobbiSprite(pose: BlobbiPose): Sprite {
    const key = `${this.blobbi.seed}|${this.blobbi.size}|${poseKey(pose)}`;
    const hit = this.blobbiCache.get(key);
    if (hit) return hit;
    const s = buildBlobbiSprite(this.blobbi.identity, pose, this.blobbi.size);
    this.blobbiCache.set(key, s);
    return s;
  }

  /** Run as many fixed steps as `realSeconds` allows. Returns the number of steps run. */
  update(realSeconds: number, input: LiveInput): number {
    const steps = this.clock.advance(realSeconds);
    for (let i = 0; i < steps; i++) {
      // Edge-triggered keys fire once per update, on the first step.
      this.step(i === 0 ? input : { ...input, interact: false, plant: false });
    }
    this.lastInput = input;
    return steps;
  }

  step(input: LiveInput): void {
    const dt = this.clock.dt;
    const time = this.clock.time;
    const b = this.blobbi;
    // ── Movement: the keyboard takes control; otherwise the brain's intent drives the same code ─────
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const manualNow = dx !== 0 || dy !== 0 || input.interact || input.plant;
    if (manualNow) this.brain.manual(time);
    let moving = dx !== 0 || dy !== 0;
    let direction: Direction = b.animator.state.direction;
    let speed = b.speed;
    let brainInteract = false;
    const intent = this.brain.step(time, dt, { x: b.x, y: b.y }, this.movedLastStep);
    if (!this.brain.manualActive) {
      dx = intent.dx;
      dy = intent.dy;
      moving = intent.moving;
      speed = this.brain.options.speed;
      brainInteract = intent.interact;
      if (intent.face) direction = intent.face;
    }
    const before = { x: b.x, y: b.y };
    if (moving) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      // Facing: horizontal wins on diagonals, as in most top-down games.
      direction = dx !== 0 && Math.abs(dx) >= Math.abs(dy) * 0.6 ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      const moved = this.collision.move(b.x, b.y, dx * speed * dt, dy * speed * dt, b.footRx, b.footRy);
      b.x = moved.x;
      b.y = moved.y;
    }
    this.movedLastStep = Math.hypot(b.x - before.x, b.y - before.y) > 0.01;
    b.animator.step(dt, time, { moving, direction });
    b.animator.state.sleeping = this.brain.state === 'rest';
    if (brainInteract) this.interact();
    if (input.interact) this.interact();
    if (input.plant) this.plantTree();

    // ── Ambient life ──────────────────────────────────────────────────────
    const objects = this.world.objects;
    if (this.ambient.chance(dt * 0.9)) {
      const i = this.ambient.int(0, objects.length - 1);
      const o = objects[i];
      if (o.kind === 'tree') {
        const s = this.spriteOf(o) as TreeResult;
        const foliage = paletteFor(this.world.options.palette).foliage[s.variation.foliage % 4];
        const x = o.x + this.ambient.range(-s.buffer.width * 0.3, s.buffer.width * 0.3);
        const y = o.y - s.anchorY + this.ambient.range(2, Math.max(3, (s.swayRow ?? s.anchorY) - 2));
        if (s.variation.blossom) this.particles.petal(x, y, hex('#ff9ad1'));
        else this.particles.leaf(x, y, this.ambient.chance(0.5) ? foliage.dark : foliage.mid);
      }
    }
    if (this.shallow.length && this.ambient.chance(dt * 4)) {
      const i = this.shallow[this.ambient.int(0, this.shallow.length - 1)];
      this.particles.sparkle(i % this.world.terrain.width, Math.floor(i / this.world.terrain.width), paletteFor(this.world.options.palette).foam);
    }
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0 && this.chimneys.length) {
      this.smokeTimer = this.ambient.range(1.2, 2.4);
      const c = this.ambient.pick(this.chimneys);
      this.particles.smoke(c.x + 1, c.y - 1);
    }
    // Leaves shaken loose by a gust.
    for (const [index, imp] of this.impulses) {
      if (time >= imp.until) this.impulses.delete(index);
    }
    this.particles.step(dt);

    // ── Growth ────────────────────────────────────────────────────────────
    for (const t of this.planted) {
      if (!t.solid && this.growthOf(t) >= 0.3) {
        const s = this.spriteOf(t.placement, this.growthOf(t));
        this.collision.blockEllipse(t.placement.x, t.placement.y, s.footRx, Math.max(1, s.footRy));
        t.solid = true;
        this.nav.rebuild(t.placement.x - 16, t.placement.y - 12, t.placement.x + 16, t.placement.y + 12);
      }
    }
    if (this.bubble && time >= this.bubble.until) this.bubble = null;
    // ── The turtle: blinks and slow glances on its own schedule ────────────
    if (this.world.turtle) {
      const ta = this.turtleAnim;
      if (ta.blinkUntil < 0 && time >= ta.nextBlink) {
        ta.blinkUntil = time + 0.18;
        ta.nextBlink = time + this.ambient.range(3, 7);
      }
      if (ta.blinkUntil >= 0 && time >= ta.blinkUntil) ta.blinkUntil = -1;
      if (time >= ta.nextGlance) {
        ta.glance = ta.glance === 0 ? this.ambient.pick([-1, 1] as const) : 0;
        ta.glanceUntil = time + this.ambient.range(2, 4);
        ta.nextGlance = ta.glanceUntil + (ta.glance === 0 ? this.ambient.range(4, 9) : 0);
      }
      // A slow ripple now and then by a flipper tip.
      if (this.ambient.chance(dt * 0.35)) {
        const f = this.ambient.pick(this.world.turtle.flippers);
        this.particles.ripple(f.cx + Math.cos(f.angle) * f.rx * 0.9, f.cy + Math.sin(f.angle) * f.rx * 0.9, paletteFor(this.world.options.palette).foam);
      }
    }
    this.clock.tick();
    this.stats.steps = this.clock.step;
    this.stats.particles = this.particles.particles.length;
  }

  /** The object the Blobbi is facing and close to, if any. */
  facingObject(radius = 16): { index: number; placement: Placement; sprite: Sprite } | null {
    const b = this.blobbi;
    const dir = b.animator.state.direction;
    const fx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const fy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    let best: { index: number; placement: Placement; sprite: Sprite; d: number } | null = null;
    const all = [...this.world.objects, ...this.planted.map((t) => t.placement)];
    for (let i = 0; i < all.length; i++) {
      const o = all[i];
      if (o.kind === 'grass' || o.kind === 'bridge') continue;
      const sprite = i < this.world.objects.length ? this.spriteOf(o) : this.spriteOf(o, this.growthOf(this.planted[i - this.world.objects.length]));
      const dx = o.x - b.x;
      const dy = o.y - b.y;
      const d = Math.hypot(dx, dy) - sprite.footRx;
      if (d > radius) continue;
      // Must be roughly in front: the dot product with the facing direction is positive, or very close.
      const dot = dx * fx + dy * fy;
      if (dot < -2 && d > 4) continue;
      if (!best || d < best.d) best = { index: i, placement: o, sprite, d };
    }
    return best;
  }

  interact(): void {
    const time = this.clock.time;
    const b = this.blobbi;
    const target = this.facingObject();
    this.stats.interactions++;
    if (!target) {
      // Nothing there: a small hop and a shrug.
      b.animator.react('surprised', time, 0.6, 2);
      return;
    }
    const { placement: o, sprite, index } = target;
    const top = o.y - sprite.anchorY;
    switch (o.kind) {
      case 'tree': {
        this.impulses.set(index, { until: time + 0.7, strength: 1.4 });
        const tree = sprite as TreeResult;
        const foliage = paletteFor(this.world.options.palette).foliage[tree.variation.foliage % 4];
        const n = 4 + Math.round(sprite.buffer.width / 6);
        for (let i = 0; i < n; i++) {
          const x = o.x + this.particles.rng.range(-sprite.buffer.width * 0.35, sprite.buffer.width * 0.35);
          const y = top + this.particles.rng.range(2, Math.max(3, (sprite.swayRow ?? sprite.anchorY) - 1));
          if (tree.variation.fruit) {
            if (i % 3 === 0) this.particles.dust(x, y, paletteFor(this.world.options.palette).fruit[0]);
          }
          if (tree.variation.blossom) this.particles.petal(x, y, hex('#ff9ad1'));
          else this.particles.leaf(x, y, i % 2 ? foliage.dark : foliage.mid);
        }
        b.animator.react('happy', time, 1, 3);
        break;
      }
      case 'bush':
        this.impulses.set(index, { until: time + 0.5, strength: 1 });
        for (let i = 0; i < 3; i++) this.particles.sparkle(o.x + this.particles.rng.range(-4, 4), top + this.particles.rng.range(1, 5), hex('#ffffff'));
        b.animator.react('excited', time, 0.9, 2);
        break;
      case 'house':
        for (let i = 0; i < 3; i++) this.particles.heart(o.x + this.particles.rng.range(-3, 3), o.y - 6 - i * 2);
        this.particles.note(o.x + 6, o.y - 10);
        b.animator.react('excited', time, 1.2, 3);
        break;
      case 'flower':
        for (let i = 0; i < 4; i++) this.particles.petal(o.x + this.particles.rng.range(-2, 2), top + 1, paletteFor(this.world.options.palette).flowers[(o.variation?.color as number) ?? 0]);
        b.animator.react('happy', time, 0.9, 2);
        break;
      case 'decor':
        if (o.variation?.kind === 'sign') {
          this.bubble = { text: this.signText(o), until: time + 2.5, x: o.x, y: top - 2 };
          b.animator.react('neutral', time, 0.5, 0);
          this.particles.exclaim(b.x, b.y - this.blobbi.size - 4);
        } else if (o.variation?.kind === 'lantern') {
          for (let i = 0; i < 5; i++) this.particles.sparkle(o.x + this.particles.rng.range(-3, 3), top + this.particles.rng.range(0, 4), hex('#ffe07a'));
          b.animator.react('surprised', time, 0.8, 2);
        } else {
          this.particles.exclaim(b.x, b.y - this.blobbi.size - 4);
          b.animator.react('surprised', time, 0.8, 2);
        }
        break;
      case 'rock':
        this.particles.dust(o.x - 2, o.y, paletteFor(this.world.options.palette).stone.light);
        this.particles.dust(o.x + 2, o.y, paletteFor(this.world.options.palette).stone.light);
        b.animator.react('sad', time, 0.9, 0);
        break;
      default:
        b.animator.react('surprised', time, 0.6, 2);
    }
  }

  private signText(o: Placement): string {
    const texts = ['Welcome to the island', 'Mind the water', 'Trees grow here', 'Bridge ahead', 'Home sweet home', 'Keep off the flowers'];
    return stream(this.world.seed, 'sign', o.x, o.y).pick(texts);
  }

  /** Plant a seedling just ahead of the Blobbi on free grass. It will grow with the clock. */
  plantTree(): boolean {
    const b = this.blobbi;
    const dir = b.animator.state.direction;
    const ahead = { x: b.x + (dir === 'left' ? -9 : dir === 'right' ? 9 : 0), y: b.y + (dir === 'up' ? -7 : dir === 'down' ? 7 : 2) };
    const { width, cls } = this.world.terrain;
    const grassAt = (x: number, y: number) => {
      const c = cls[Math.floor(y) * width + Math.floor(x)];
      return c === T.GRASS || c === T.GRASS_PATCH;
    };
    // The spot ahead, else a ring of spots around it; never on a path, the shore or another footprint.
    const candidates = [ahead];
    for (const r of [5, 10]) for (let i = 0; i < 8; i++) candidates.push({ x: ahead.x + Math.cos((i / 8) * Math.PI * 2) * r, y: ahead.y + Math.sin((i / 8) * Math.PI * 2) * r * 0.8 });
    const spot = candidates.find((c) => grassAt(c.x, c.y) && this.collision.canStand(c.x, c.y, 3, 2) && !this.planted.some((t) => Math.hypot(t.placement.x - c.x, t.placement.y - c.y) < 6));
    if (!spot) return false;
    const px = Math.round(spot.x);
    const py = Math.round(spot.y);
    const seed = `${this.world.seed}/planted/${this.planted.length}`;
    const placement: Placement = { kind: 'tree', layer: 'vegetation', seed, size: 20 + stream(seed, 'size').int(0, 10), x: px, y: py, island: -1 };
    this.planted.push({ placement, plantedAt: this.clock.time, solid: false });
    this.stats.planted = this.planted.length;
    this.particles.dust(px, py, hex('#8a5a33'));
    this.particles.dust(px + 1, py, hex('#8a5a33'));
    b.animator.react('happy', this.clock.time, 0.8, 2);
    return true;
  }

  /** Horizontal sway of an object this frame, in pixels: wind plus any shake impulse. */
  swayOf(index: number, x: number, kind: Placement['kind'], time: number): number {
    const imp = this.impulses.get(index);
    if (imp) return Math.round(Math.sin((imp.until - time) * 28) * imp.strength);
    const wind = windAt(time, x);
    if (wind < 0.08) return 0;
    const phase = index < this.swayPhase.length ? this.swayPhase[index] : index * 1.7;
    const rate = kind === 'flower' ? 3.4 : kind === 'bush' ? 2.2 : 1.6;
    return Math.round(Math.sin(time * rate + phase) * wind * 1.3);
  }

  get input(): LiveInput {
    return this.lastInput;
  }
}
