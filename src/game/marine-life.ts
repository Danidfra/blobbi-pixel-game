/**
 * MARINE LIFE (M10): the sea around the Carrier is alive. A few kinds, mostly scenery:
 *
 *   school    small fish flicking along under the surface in the shallows
 *   jelly     jellyfish drifting in open water, pulsing (a soft glow at night)
 *   dolphin   now and then a pod's leader passes in deep water, leaping
 *   seal      a curious seal (the recurring one): it surfaces by the shore, watches the Blobbi, comes a little
 *             closer when it is near, and answers a wave (E)
 *   glowray   rare, at night only: a ray glowing softly in the deep near the island (E to watch it)
 *
 * Nothing is simulated or saved. What swims where is a pure function of the world's seed and world time: time is
 * cut into slots per kind and "lane", and a hash of (seed, kind, lane, slot) decides whether something appears
 * in that slot, where and which way it goes. The same island at the same moment shows the same sea, on every
 * machine; reloading never changes it. Only places in the sea the camera can see are drawn, and only a handful
 * of creatures exist at any time, so the cost is a few dozen pixels a frame.
 */
import { hash32 } from '../core/rng';
import { T, type WorldDescription } from '../world/types';
import { lightAt } from './daylight';

export type MarineKind = 'school' | 'jelly' | 'dolphin' | 'seal' | 'glowray';

export interface Sighting {
  /** Stable for the appearance: kind, lane and slot. */
  id: string;
  kind: MarineKind;
  /** World position (the creature's centre at the surface). */
  x: number;
  y: number;
  /** Swimming direction (sprites face it). */
  dir: 1 | -1;
  /** Seconds since it appeared, and how long the appearance lasts. */
  age: number;
  span: number;
  /** For the seal: where the Blobbi stands to see it (on the shore). */
  shore?: { x: number; y: number };
  /** Per-appearance variety (school size, colours). */
  seed: number;
}

interface Pt {
  x: number;
  y: number;
}

/** How often each kind may appear: slot length (s), lanes at once, and the chance a slot has one. */
export const MARINE_SCHEDULE: Record<MarineKind, { slot: number; lanes: number; chance: number; stay: number }> = {
  school: { slot: 26, lanes: 4, chance: 0.85, stay: 20 },
  jelly: { slot: 48, lanes: 3, chance: 0.7, stay: 40 },
  dolphin: { slot: 70, lanes: 1, chance: 0.4, stay: 14 },
  seal: { slot: 45, lanes: 1, chance: 0.6, stay: 22 },
  glowray: { slot: 120, lanes: 1, chance: 0.22, stay: 30 },
};

/** How near (world px) the Blobbi must be to greet the seal, or to watch the ray. */
export const SEAL_REACH = 30;
export const RAY_REACH = 70;

const isWater = (c: number) => c === T.SHALLOW || c === T.WATER || c === T.DEEP;

export class MarineLife {
  readonly shallow: Pt[] = [];
  readonly open: Pt[] = [];
  readonly deep: Pt[] = [];
  /** Shallow water right by standable shore, with that shore spot. */
  readonly sealSpots: { water: Pt; shore: Pt }[] = [];
  private readonly salt: number;

  constructor(
    readonly world: WorldDescription,
    shoreSpots: readonly Pt[],
    canStand?: (x: number, y: number) => boolean,
  ) {
    this.salt = hash32(`${world.seed}/marine`);
    const { width, height, cls } = world.terrain;
    // Distance from land on a coarse grid (multi-source flood over water cells), to keep the deep-water creatures
    // where they can be seen from the island and never right against it.
    const G = 6;
    const gw = Math.ceil(width / G);
    const gh = Math.ceil(height / G);
    const dist = new Int32Array(gw * gh).fill(-1);
    const queue: number[] = [];
    for (let gy = 0; gy < gh; gy++)
      for (let gx = 0; gx < gw; gx++) {
        const c = cls[Math.min(height - 1, gy * G) * width + Math.min(width - 1, gx * G)];
        if (!isWater(c)) {
          dist[gy * gw + gx] = 0;
          queue.push(gy * gw + gx);
        }
      }
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q];
      const gx = k % gw;
      const gy = (k / gw) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || dist[ny * gw + nx] >= 0) continue;
        dist[ny * gw + nx] = dist[k] + 1;
        queue.push(ny * gw + nx);
      }
    }
    for (let gy = 1; gy < gh - 1; gy++)
      for (let gx = 1; gx < gw - 1; gx++) {
        const x = gx * G;
        const y = gy * G;
        const c = cls[y * width + x];
        const d = dist[gy * gw + gx] * G;
        if (c === T.SHALLOW && d >= 6) this.shallow.push({ x, y });
        else if (c === T.WATER && d >= 10) this.open.push({ x, y });
        else if (c === T.DEEP && d >= 24 && d <= 120) this.deep.push({ x, y });
      }
    // The seal comes up in the water right off ground the Blobbi can stand on (so it can be greeted): water a
    // short way from land, with standable ground within reach; spread out, a dozen at most.
    if (canStand)
      for (const w of [...this.shallow, ...this.open]) {
        if (this.sealSpots.length >= 12) break;
        if (this.sealSpots.some((o) => Math.hypot(o.water.x - w.x, o.water.y - w.y) < 48)) continue;
        let shore: Pt | null = null;
        for (let r = 6; r <= SEAL_REACH - 6 && !shore; r += 3)
          for (let k = 0; k < 16 && !shore; k++) {
            const a = (k / 16) * Math.PI * 2;
            const x = Math.round(w.x + Math.cos(a) * r);
            const y = Math.round(w.y + Math.sin(a) * r);
            if (x >= 0 && y >= 0 && x < width && y < height && !isWater(cls[y * width + x]) && canStand(x, y)) shore = { x, y };
          }
        if (shore) this.sealSpots.push({ water: w, shore });
      }
    void shoreSpots;
  }

  private h(kind: MarineKind, lane: number, slot: number): number {
    return hash32(`${this.salt}:${kind}:${lane}:${slot}`);
  }

  /**
   * Everything in the sea at world time `t`: a pure function of the world and `t`. `near` (optional) limits the
   * answer to what lies within `radius` of a point (the camera's centre), for drawing.
   */
  at(t: number, near?: Pt, radius = Infinity): Sighting[] {
    const out: Sighting[] = [];
    const night = lightAt(t).night;
    for (const kind of Object.keys(MARINE_SCHEDULE) as MarineKind[]) {
      const sch = MARINE_SCHEDULE[kind];
      if (kind === 'glowray' && !night) continue;
      const pool = kind === 'school' ? this.shallow : kind === 'jelly' ? this.open.length ? this.open : this.deep : kind === 'seal' ? this.sealSpots.map((s) => s.water) : this.deep;
      if (!pool.length) continue;
      for (let lane = 0; lane < sch.lanes; lane++) {
        // Lanes are offset so they do not all change at once.
        const shifted = t + (lane * sch.slot) / sch.lanes;
        const slot = Math.floor(shifted / sch.slot);
        const h = this.h(kind, lane, slot);
        if ((h & 0xffff) / 0x10000 >= sch.chance) continue;
        // Each appearance starts a little into its slot and lasts `stay`.
        const start = ((h >>> 16) & 0xff) / 0xff * Math.max(0, sch.slot - sch.stay);
        const age = shifted - slot * sch.slot - start;
        if (age < 0 || age >= sch.stay) continue;
        const pick = hash32(`${h}:spot`);
        const at = pool[pick % pool.length];
        const dir: 1 | -1 = (h >>> 24) & 1 ? 1 : -1;
        const p = age / sch.stay;
        let x = at.x;
        let y = at.y;
        if (kind === 'school') {
          x += dir * (p - 0.5) * 46;
          y += Math.sin(p * 9 + (pick & 7)) * 3;
        } else if (kind === 'jelly') {
          x += Math.sin(p * 2.4 + (pick & 7)) * 6;
          y += (p - 0.5) * 8;
        } else if (kind === 'dolphin') x += dir * (p - 0.5) * 120;
        else if (kind === 'glowray') {
          x += dir * (p - 0.5) * 40;
          y += Math.sin(p * 3.1) * 6;
        }
        if (near && Math.hypot(x - near.x, y - near.y) > radius) continue;
        // Never over land (a path that swims ashore is cut short there).
        if (!this.wet(Math.round(x), Math.round(y))) continue;
        const s: Sighting = { id: `${kind}:${lane}:${slot}`, kind, x, y, dir, age, span: sch.stay, seed: pick };
        if (kind === 'seal') s.shore = this.sealSpots[pick % this.sealSpots.length].shore;
        out.push(s);
      }
    }
    return out;
  }

  /** Water at a world pixel (beyond the world's edge is open sea). */
  wet(x: number, y: number): boolean {
    const { width, height, cls } = this.world.terrain;
    if (x < 0 || y < 0 || x >= width || y >= height) return true;
    return isWater(cls[y * width + x]);
  }
}
