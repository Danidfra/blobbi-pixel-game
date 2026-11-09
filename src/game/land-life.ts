/**
 * LAND LIFE (Living World, batch 1): small creatures on the island, mostly scenery, each with a little character:
 *
 *   crab      at the island's edge, where the land meets the water or the Carrier's own shell: scuttles sideways
 *             between pauses, stops to watch the Blobbi when it comes near, and buries itself when it comes nearer
 *   bunny     in the meadows and among the flowers, by day and in dry weather: hops between spots and nibbles, sits
 *             up to watch the Blobbi, and bolts when it gets too close, then sits and watches from a safe distance
 *   songbird  at a bird feeder the player built, by day and in dry weather: flies in, perches, pecks, and either
 *             sings when the Blobbi stands still nearby (a tame one) or flies off when it comes near (a shy one)
 *
 * Like the sea's creatures (`marine-life.ts`), WHAT appears, WHERE and WHEN is a pure function of the world's seed
 * and world time: time is cut into slots per kind and lane, and a hash of (seed, kind, lane, slot) decides whether
 * something appears in that slot, where it lives and what it is like (its traits). Its routine (the way it moves
 * about its home) is a pure function of its age too. Only its REACTIONS to the Blobbi (hiding, bolting, flying
 * off) need a little memory, which the live world keeps for the appearance and never saves. Nothing here draws
 * from any random stream, so the island's leaves, birds and butterflies fall exactly as they would have.
 *
 * Creatures never block the Blobbi, never touch anything, and stand only where the Blobbi itself could stand.
 */
import { hash32 } from '../core/rng';
import { T, type WorldDescription } from '../world/types';
import { lightAt } from './daylight';

export type LandKind = 'crab' | 'bunny' | 'songbird';

export interface Pt {
  x: number;
  y: number;
}

/** A creature's character for one appearance: how bold it is (0 shy .. 1 bold) and how brisk (0.85 .. 1.15). */
export interface LandTraits {
  bold: number;
  pace: number;
}

export interface LandSighting {
  id: string;
  kind: LandKind;
  lane: number;
  slot: number;
  /** Where it lives this appearance: a shore cell, a meadow cell, or a feeder's perch. */
  home: Pt;
  /** Seconds since it appeared, and how long the appearance lasts. */
  age: number;
  span: number;
  /** Per-appearance variety. */
  seed: number;
  traits: LandTraits;
  /** Which way it faces at first (and arrives from, for the bird). */
  dir: 1 | -1;
}

/** How often each kind may appear: slot length (s), lanes at once, the chance a slot has one, how long it stays. */
export const LAND_SCHEDULE: Record<LandKind, { slot: number; lanes: number; chance: number; stay: number }> = {
  crab: { slot: 44, lanes: 2, chance: 0.7, stay: 30 },
  bunny: { slot: 56, lanes: 2, chance: 0.6, stay: 34 },
  songbird: { slot: 38, lanes: 1, chance: 0.75, stay: 20 },
};

/** Creatures alive at once, at most (the lanes). */
export const MAX_LAND_CREATURES = Object.values(LAND_SCHEDULE).reduce((n, s) => n + s.lanes, 0);

/** How near the Blobbi must be (world px) for each reaction; a bold creature lets it come closer (`reach`). */
export const LAND_REACH = { crabWatch: 36, crabHide: 16, bunnyWatch: 48, bunnyFlee: 22, birdStartle: 20, birdSing: 44, notice: 40 } as const;
export const reach = (base: number, traits: LandTraits): number => base * (1.3 - traits.bold * 0.6);

/** The foot a creature needs to stand (world px, half-sizes). */
export const LAND_FOOT = { rx: 2, ry: 1 } as const;

/** Seconds of the bird's flight in and out, and of a bunny's bolt. */
export const BIRD_FLIGHT = 1.5;
export const BUNNY_BOLT = 0.9;
export const BUNNY_BOLT_DISTANCE = 30;

/**
 * THE BUNNY ENCOUNTER (Living World, phase 2): a bunny that watches the Blobbi grows curious when it keeps still,
 * comes over on its own, sits beside it a while, and goes about its business again.
 */
/** One hop of an encounter: seconds, and the longest hop (world px). */
export const BUNNY_HOP = 0.32;
export const BUNNY_HOP_LENGTH = 12;
/** How close it comes to the Blobbi (world px from the Blobbi's centre), and how close a curious hop may bring it: no nearer than two thirds of the gap it started from. */
export const BUNNY_BESIDE = 10;
export const BUNNY_CURIOUS_KEEP = 2 / 3;
/** The Blobbi closing in faster than this share of its walking speed, for longer than `BUNNY_HASTE` seconds, frightens a bunny that is watching. */
export const BUNNY_FAST = 0.6;
export const BUNNY_HASTE = 0.2;
/** Seconds of the Blobbi's stillness, times `patience`, before a watching bunny grows curious, and before a curious one comes over. */
export const BUNNY_CURIOUS_AFTER = 2;
export const BUNNY_APPROACH_AFTER = 4;
/** How long it sits beside the Blobbi (seconds, seeded between these). */
export const BUNNY_STAY = { min: 8, max: 14 } as const;
/** Keeper encounter B: a bunny settled beside the Blobbi for this long may lead it to something buried. */
export const BUNNY_LEAD_AFTER = 3;
/** How far it leads (px), and how long it digs (s). */
export const BUNNY_LEAD_DISTANCE = 22;
export const BUNNY_DIG = 2.4;
/** Which appearances lead (every other one, by the appearance's seed), and which songbirds carry a ribbon (one in four). */
export const bunnyLeads = (seed: number): boolean => seed % 2 === 0;
export const birdCarriesRibbon = (seed: number): boolean => seed % 4 === 0;
/** A shy bunny takes longer to trust, never forever: 1 (bold) .. 2.5 (shy). */
export const patience = (traits: LandTraits): number => 1 + (1 - traits.bold) * 1.5;

const CRAB_SEGMENT = 3;
const CRAB_MOVE = 1.2;
const BUNNY_SEGMENT = 4.5;
const BUNNY_MOVE = 1.4;

const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const MEADOW = new Set<number>([T.MEADOW, T.CLOVER, T.GRASS_PATCH]);
const isWater = (c: number) => c === T.DEEP || c === T.WATER || c === T.SHALLOW || c === T.FOAM || c === T.POND;
/** Where the island ends: water, or the Carrier's own body. */
export const isEdge = (c: number): boolean => isWater(c) || c === T.RIM || c === T.SKIN;

/** What a creature can be seen doing (the renderer has a sprite for each). */
export type LandPose = 'walk' | 'idle' | 'watch' | 'hide' | 'hop' | 'sit' | 'nibble' | 'twitch' | 'curious' | 'perch' | 'peck' | 'sing' | 'fly';

/** What a creature is doing in its routine at a moment (no reactions). */
export interface Routine {
  x: number;
  y: number;
  /** Walking, hopping or flying this moment (else paused: idle, nibbling, perched). */
  moving: boolean;
  /** Facing. */
  dir: 1 | -1;
  /** For the bird: flying in, flying out, or on the perch. */
  flight: 'in' | 'out' | null;
  /** Seconds into the current pause (nibble, peck, idle animations key on it). */
  pause: number;
  /** How far through the current move (0..1; 1 while paused): a hop's arc keys on it. */
  progress: number;
}

export class LandLife {
  /** Standable land at the island's edge: by the water, or by the Carrier's rim or skin (the crabs' homes). */
  readonly shore: Pt[] = [];
  /** Standable meadow, clover and flower patches (the bunnies' homes). */
  readonly meadow: Pt[] = [];
  private readonly salt: number;

  constructor(
    readonly world: WorldDescription,
    readonly canStand: (x: number, y: number) => boolean,
  ) {
    this.salt = hash32(`${world.seed}/land`);
    const { width, height, cls } = world.terrain;
    const flowers = world.objects.filter((o) => o.kind === 'flower');
    const G = 4;
    const spread = (list: Pt[], p: Pt, gap: number) => list.every((o) => Math.hypot(o.x - p.x, o.y - p.y) >= gap);
    for (let y = G; y < height - G; y += G)
      for (let x = G; x < width - G; x += G) {
        const c = cls[y * width + x];
        if (isWater(c) || c < T.GRASS_EDGE || !canStand(x, y)) continue;
        // The edge: water, or the Carrier's rim or skin, within five pixels in any direction.
        let edge = false;
        for (let dy = -5; dy <= 5 && !edge; dy += 5) for (let dx = -5; dx <= 5 && !edge; dx += 5) if (dx || dy) edge = isEdge(cls[Math.min(height - 1, Math.max(0, y + dy)) * width + Math.min(width - 1, Math.max(0, x + dx))]);
        if (edge) {
          if (this.shore.length < 48 && spread(this.shore, { x, y }, 16)) this.shore.push({ x, y });
          continue;
        }
        const meadow = MEADOW.has(c) || flowers.some((f) => Math.abs(f.x - x) < 10 && Math.abs(f.y - y) < 10);
        if (meadow && this.meadow.length < 48 && spread(this.meadow, { x, y }, 24)) this.meadow.push({ x, y });
      }
  }

  private h(kind: LandKind, lane: number, slot: number): number {
    return hash32(`${this.salt}:${kind}:${lane}:${slot}`);
  }

  /**
   * Everything about at world time `t`: a pure function of the world, `t`, the rain outside (0..1) and the perches
   * the player's feeders offer. `near` (optional) limits the answer to what lies within `radius` of a point.
   */
  at(t: number, rain: number, perches: readonly Pt[], near?: Pt, radius = Infinity): LandSighting[] {
    const out: LandSighting[] = [];
    const night = lightAt(t).night;
    for (const kind of Object.keys(LAND_SCHEDULE) as LandKind[]) {
      const sch = LAND_SCHEDULE[kind];
      // Bunnies and songbirds keep to dry days; the crab is out in any weather, day or night.
      if (kind !== 'crab' && (night || rain > 0)) continue;
      const pool = kind === 'crab' ? this.shore : kind === 'bunny' ? this.meadow : perches;
      if (!pool.length) continue;
      for (let lane = 0; lane < sch.lanes; lane++) {
        const shifted = t + (lane * sch.slot) / sch.lanes;
        const slot = Math.floor(shifted / sch.slot);
        const h = this.h(kind, lane, slot);
        if ((h & 0xffff) / 0x10000 >= sch.chance) continue;
        const start = (((h >>> 16) & 0xff) / 0xff) * Math.max(0, sch.slot - sch.stay);
        const age = shifted - slot * sch.slot - start;
        if (age < 0 || age >= sch.stay) continue;
        const pick = hash32(`${h}:spot`);
        const home = pool[pick % pool.length];
        if (near && Math.hypot(home.x - near.x, home.y - near.y) > radius) continue;
        const traits: LandTraits = { bold: ((pick >>> 8) & 0xff) / 255, pace: 0.85 + (((pick >>> 4) & 0xf) / 15) * 0.3 };
        out.push({ id: `${kind}:${lane}:${slot}`, kind, lane, slot, home: { x: home.x, y: home.y }, age, span: sch.stay, seed: pick, traits, dir: (h >>> 24) & 1 ? 1 : -1 });
      }
    }
    return out;
  }

  /** Where a creature's routine has it `age` seconds into its appearance, with no reactions: pure. */
  routine(s: LandSighting, age: number): Routine {
    const { home, seed, traits } = s;
    if (s.kind === 'crab') {
      // Sideways scuttles along the shore: a new offset every segment, reached in its first moment, then a pause.
      const seg = CRAB_SEGMENT / traits.pace;
      const k = Math.floor(age / seg);
      const u = age - k * seg;
      const off = (i: number) => (i <= 0 ? 0 : (hash32(`${seed}:crab:${i}`) % 21) - 10);
      const from = off(k - 1);
      const to = off(k);
      const move = CRAB_MOVE / traits.pace;
      const x = home.x + (u < move ? from + (to - from) * ease(u / move) : to);
      const standable = this.canStand(Math.round(x), home.y);
      return { x: standable ? x : home.x, y: home.y, moving: standable && u < move && to !== from, dir: to > from ? 1 : to < from ? -1 : s.dir, flight: null, pause: u < move ? 0 : u - move, progress: u < move ? u / move : 1 };
    }
    if (s.kind === 'bunny') {
      // Hops to a new spot near home every segment (three hops), then nibbles; a spot it cannot stand on is skipped.
      const seg = BUNNY_SEGMENT / traits.pace;
      const k = Math.floor(age / seg);
      const u = age - k * seg;
      const spot = (i: number): Pt => {
        let at: Pt = home;
        for (let j = 1; j <= i; j++) {
          const hh = hash32(`${seed}:bunny:${j}`);
          const cand = { x: home.x + ((hh % 41) - 20), y: home.y + (((hh >>> 8) % 21) - 10) };
          // The spot, and the way there (a hop never crosses water or anything standing).
          const clear = [0.25, 0.5, 0.75, 1].every((k) => {
            const x = Math.round(at.x + (cand.x - at.x) * k);
            const y = Math.round(at.y + (cand.y - at.y) * k);
            return this.canStand(x, y) && !this.wet(x, y);
          });
          if (clear) at = cand;
        }
        return at;
      };
      const from = spot(k - 1);
      const to = spot(k);
      const move = BUNNY_MOVE / traits.pace;
      const e = u < move ? ease(u / move) : 1;
      const x = from.x + (to.x - from.x) * e;
      const y = from.y + (to.y - from.y) * e;
      const moving = u < move && (to.x !== from.x || to.y !== from.y);
      return { x, y, moving, dir: to.x > from.x ? 1 : to.x < from.x ? -1 : s.dir, flight: null, pause: moving ? 0 : u - (u < move ? 0 : move), progress: u < move ? u / move : 1 };
    }
    // The songbird: in from one side high up, the perch, out the other side.
    const flyIn = age < BIRD_FLIGHT;
    const flyOut = age > s.span - BIRD_FLIGHT;
    if (flyIn) {
      const k = ease(age / BIRD_FLIGHT);
      return { x: home.x + s.dir * 48 * (1 - k), y: home.y - 40 * (1 - k), moving: true, dir: s.dir > 0 ? -1 : 1, flight: 'in', pause: 0, progress: k };
    }
    if (flyOut) {
      const k = ease((age - (s.span - BIRD_FLIGHT)) / BIRD_FLIGHT);
      return { x: home.x - s.dir * 48 * k, y: home.y - 40 * k, moving: true, dir: s.dir > 0 ? -1 : 1, flight: 'out', pause: 0, progress: k };
    }
    return { x: home.x, y: home.y, moving: false, dir: s.dir > 0 ? -1 : 1, flight: null, pause: age - BIRD_FLIGHT, progress: 1 };
  }

  /** A spot a frightened bunny bolts to: away from `from` (the Blobbi), on standable dry ground; null when none. */
  boltSpot(at: Pt, from: Pt, seed: number): Pt | null {
    const away = Math.atan2(at.y - from.y, at.x - from.x);
    for (let i = 0; i < 10; i++) {
      // Straight away first, then fanning out to either side.
      const a = away + ((i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI) / 7 + ((seed >>> (i * 3)) & 3) * 0.05;
      const d = BUNNY_BOLT_DISTANCE - (i > 5 ? 8 : 0);
      const x = Math.round(at.x + Math.cos(a) * d);
      const y = Math.round(at.y + Math.sin(a) * d * 0.7);
      if (this.canStand(x, y) && !this.wet(x, y)) return { x, y };
    }
    return null;
  }

  /**
   * Where a bunny digs (Keeper encounter B): `BUNNY_LEAD_DISTANCE` from where it sits, away from the Blobbi first and
   * fanning round, on standable dry ground, never closer than a stride to the Blobbi; null when nowhere fits.
   */
  digSpot(at: Pt, blobbi: Pt, seed: number): Pt | null {
    const away = Math.atan2(at.y - blobbi.y, at.x - blobbi.x);
    for (let i = 0; i < 12; i++) {
      const a = away + ((i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI) / 6 + ((seed >>> (i * 2)) & 3) * 0.05;
      const x = Math.round(at.x + Math.cos(a) * BUNNY_LEAD_DISTANCE);
      const y = Math.round(at.y + Math.sin(a) * BUNNY_LEAD_DISTANCE * 0.7);
      if (Math.hypot(x - blobbi.x, y - blobbi.y) < 14) continue;
      if (this.canStand(x, y) && !this.wet(x, y)) return { x, y };
    }
    return null;
  }

  /**
   * The next hop from `at` toward `to`: the whole way when it is within `maxLen`, else `maxLen` along the line; null
   * when the ground there, or on the way (checked at quarter points), is not standable dry ground.
   */
  hopAlong(at: Pt, to: Pt, maxLen = BUNNY_HOP_LENGTH): Pt | null {
    const d = Math.hypot(to.x - at.x, to.y - at.y);
    if (d < 0.5) return null;
    const k = Math.min(1, maxLen / d);
    const end = { x: Math.round(at.x + (to.x - at.x) * k), y: Math.round(at.y + (to.y - at.y) * k) };
    for (const q of [0.25, 0.5, 0.75, 1]) {
      const x = Math.round(at.x + (end.x - at.x) * q);
      const y = Math.round(at.y + (end.y - at.y) * q);
      if (!this.canStand(x, y) || this.wet(x, y)) return null;
    }
    return end;
  }

  /**
   * Where a bunny sits beside the Blobbi: `BUNNY_BESIDE` from the Blobbi's centre, on the bunny's own side first and
   * then fanning round, on standable dry ground and never inside the Blobbi's foot (plus a pixel or two); null when
   * nowhere fits.
   */
  approachSpot(at: Pt, blobbi: Pt, foot: { rx: number; ry: number }, seed: number): Pt | null {
    const base = Math.atan2(at.y - blobbi.y, at.x - blobbi.x);
    for (let i = 0; i < 9; i++) {
      const a = base + ((i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI) / 5 + ((seed >>> (i * 2)) & 3) * 0.04;
      const x = Math.round(blobbi.x + Math.cos(a) * BUNNY_BESIDE);
      const y = Math.round(blobbi.y + Math.sin(a) * BUNNY_BESIDE * 0.7);
      const dx = (x - blobbi.x) / (foot.rx + 2);
      const dy = (y - blobbi.y) / (foot.ry + 2);
      if (dx * dx + dy * dy < 1) continue;
      if (this.canStand(x, y) && !this.wet(x, y)) return { x, y };
    }
    return null;
  }

  /** Water at a world pixel (beyond the world's edge counts as water). */
  wet(x: number, y: number): boolean {
    const { width, height, cls } = this.world.terrain;
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= width || yi >= height) return true;
    return isWater(cls[yi * width + xi]);
  }
}
