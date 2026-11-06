/**
 * LAND LIFE ON SCREEN: the island's small creatures (`src/game/land-life.ts`, posed by the live world) as tiny
 * procedural sprites in the painter's order with everything that stands, so a bunny goes behind a tree and in
 * front of a rug; a flying bird is drawn over everything. A handful of sprites a frame, each made once and kept.
 */
import { hex, type Color } from '../core/color';
import { PixelBuffer, type Sprite } from '../core/pixel';
import type { LiveWorld } from '../sim/live-world';
import type { LandKind, LandPose } from '../game/land-life';

const INK = hex('#1b1f2a');
const PALETTE: Record<string, Color> = {
  // crab
  R: hex('#d8683a'),
  L: hex('#f0a070'),
  r: hex('#8a3a22'),
  o: INK,
  // bunny
  b: hex('#d9c7a8'),
  w: hex('#f2e8d8'),
  d: hex('#7a6650'),
  e: INK,
  // songbird
  B: hex('#4f7fd6'),
  l: hex('#8ab4f0'),
  y: hex('#f0d060'),
  k: hex('#f0a030'),
  f: hex('#6b4a2a'),
};

/** Rows per kind and pose, facing right; two frames where a pose animates. */
const ART: Record<LandKind, Partial<Record<LandPose, string[][]>>> = {
  crab: {
    walk: [
      ['..o.o..', '.LRRRL.', 'rRRRRRr', '.r.r.r.'],
      ['..o.o..', '.LRRRL.', 'rRRRRRr', 'r.r.r.r'],
    ],
    idle: [['..o.o..', '.LRRRL.', 'rRRRRRr', '.r.r.r.']],
    watch: [['..o.o..', 'LLRRRLL', 'rRRRRRr', '.r.r.r.']],
    hide: [['..o.o..', '.rRRRr.']],
  },
  bunny: {
    idle: [
      ['.b.b.', '.b.b.', '.bbb.', 'bbbeb', 'bbbbb', 'wbbbw', '.d.d.'],
      ['.b.b.', '.b.b.', '.bbb.', 'bbbeb', 'bbbbb', 'wbbbw', '.d.d.'],
    ],
    nibble: [
      ['.b.b.', '.b.b.', '.bbbb', 'bbbeb', 'bbbbb', '.d.d.'],
      ['.b.b.', '.bbb.', 'bbbbb', 'bbbeb', '.d.d.', '.....'],
    ],
    hop: [
      ['....b', '...bb', '.bbbb', 'bbbeb', 'bbbbb', 'd...d'],
      ['...b.', '..bb.', '.bbbb', 'bbbeb', 'bbbbb', '.d.d.'],
    ],
    sit: [['.b.b.', '.b.b.', '.b.b.', '.bbb.', 'bbbeb', '.bbb.', 'wbbbw', '.d.d.']],
    // An ear flicks; the nose comes up, ears forward: it is interested.
    twitch: [
      ['.b.b.', '.bb..', '.bbb.', 'bbbeb', 'bbbbb', 'wbbbw', '.d.d.'],
      ['.b.b.', '..bb.', '.bbb.', 'bbbeb', 'bbbbb', 'wbbbw', '.d.d.'],
    ],
    curious: [['.b.b.', '.b.b.', '.bbbe', '.bbbb', 'bbbbb', 'wbbbw', '.d.d.']],
  },
  songbird: {
    perch: [['..Bl.', '.BBek', 'BByy.', '.yy..', '.f.f.']],
    peck: [
      ['..Bl.', '.BBek', 'BByy.', '.yy..', '.f.f.'],
      ['.....', 'BB...', 'BByek', '.yyk.', '.f.f.'],
    ],
    sing: [
      ['..Bl.', '.BBek', 'BByy.', '.yy..', '.f.f.'],
      ['..Bl.', '.BBek', 'BByyk', '.yy..', '.f.f.'],
    ],
    fly: [
      ['B...B', '.BBB.', '..y..'],
      ['.....', 'BBBBB', '..y..'],
    ],
  },
};

const cache = new Map<string, Sprite>();

/** The sprite for a kind, pose, frame and facing (made once). */
export function landSprite(kind: LandKind, pose: LandPose, frame: number, dir: 1 | -1): Sprite {
  const frames = ART[kind][pose] ?? ART[kind][kind === 'crab' ? 'idle' : kind === 'bunny' ? 'idle' : 'perch']!;
  const rows = frames[frame % frames.length];
  const key = `${kind}|${pose}|${frame % frames.length}|${dir}`;
  let hit = cache.get(key);
  if (hit) return hit;
  const w = rows[0].length;
  const h = rows.length;
  const buffer = new PixelBuffer(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = PALETTE[rows[y][x]];
      if (c !== undefined) buffer.set(dir > 0 ? x : w - 1 - x, y, c);
    }
  hit = { buffer, anchorX: Math.floor(w / 2), anchorY: h - 1, footRx: 2, footRy: 1 };
  cache.set(key, hit);
  return hit;
}

export interface LandDrawable {
  y: number;
  x: number;
  sprite: Sprite;
  sway: number;
  dy: number;
}

/** The creatures in view this frame, as drawables for the live frame's painter's order (a flying bird last). */
export function landDrawables(live: LiveWorld, time: number, ox: number, oy: number, viewW: number, viewH: number): LandDrawable[] {
  const out: LandDrawable[] = [];
  for (const v of live.landViews) {
    if (v.x < ox - 16 || v.x > ox + viewW + 16 || v.y < oy - 48 || v.y > oy + viewH + 16) continue;
    const frame = Math.floor(time * (v.pose === 'fly' ? 10 : v.pose === 'hop' ? 8 : v.pose === 'nibble' || v.pose === 'peck' ? 3 : v.pose === 'sing' ? 4 : v.pose === 'twitch' ? 5 : 6));
    const sprite = landSprite(v.kind, v.pose, frame, v.dir);
    out.push({ y: v.pose === 'fly' ? oy + viewH + 1e6 : v.y, x: v.x, sprite, sway: 0, dy: v.pose === 'fly' ? v.y - (oy + viewH + 1e6) : v.dy });
  }
  return out;
}
