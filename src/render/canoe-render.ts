/**
 * THE CANOE ON SCREEN (M10 phase B): a small wooden canoe in the world's own wood ramp, drawn in world pixels like
 * every object. Pointed bow and stern, a lit gunwale, a darker planked inside, two thwarts. In the painter's order
 * it is two pieces round the seated Blobbi: the hull behind it, and the near gunwale (and the paddle, when it
 * paddles) in front of it, so the Blobbi sits IN the canoe. Sprites are made once per heading and palette.
 */
import { PixelBuffer, type Sprite } from '../core/pixel';
import type { WorldPalette } from '../core/palette';
import { CANOE, type Heading } from '../game/canoe';

export interface CanoeSprites {
  /** The whole canoe (moored, nobody in it). */
  whole: Sprite;
  /** Behind the Blobbi: the hull and its far side. */
  back: Sprite;
  /** In front of the Blobbi: the near gunwale. */
  front: Sprite;
}

const cache = new Map<string, CanoeSprites>();

/**
 * The hull's profile along its length (M10 phase C, KI-50): `u` runs from the stern (-L) to the bow (+L). The half
 * beam is fuller toward the stern and sharper at the bow, and the ends rise (the sheer), so the canoe reads as a canoe
 * — and which way it points — from every heading.
 */
const beamAt = (u: number) => {
  const t = u / (CANOE.halfLength + 0.5);
  return (CANOE.halfBeam + 0.6) * Math.max(0, 1 - Math.pow(Math.abs(t), t > 0 ? 2.1 : 3.4));
};
const sheerAt = (u: number) => Math.round(1.7 * Math.pow(Math.abs(u) / (CANOE.halfLength + 0.5), 3));

export function canoeSprites(heading: Heading, palette: WorldPalette): CanoeSprites {
  const key = `${palette.name}|${heading}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const along = heading === 'left' || heading === 'right';
  const L = CANOE.halfLength;
  const B = CANOE.halfBeam + 1;
  const wood = palette.wood;
  // In the game's three-quarter view the hull's near side shows below its gunwale: a band of darker planks.
  const SIDE = 2;
  const W = along ? L * 2 + 3 : B * 2 + 3;
  const H = (along ? B * 2 + 3 : L * 2 + 3) + SIDE + 2;
  const cx = along ? L + 1 : B + 1;
  const cy = (along ? B + 1 : L + 1) + 2;
  // Hull coordinates (u along, bow +; v across) to the sprite: the ends lift by the sheer.
  const toScreen = (u: number, v: number): [number, number] => {
    const lift = sheerAt(u);
    if (heading === 'right') return [cx + u, cy + v - lift];
    if (heading === 'left') return [cx - u, cy + v - lift];
    if (heading === 'down') return [cx + v, cy + u - lift];
    return [cx + v, cy - u - lift];
  };
  const inside = (u: number, v: number) => Math.abs(v) <= beamAt(u);
  const whole = new PixelBuffer(W, H);
  // Where each column's hull meets the water (its unlifted lowest pixel): the near side reaches down to it.
  const water = new Int32Array(W).fill(-1);
  for (let u = -L; u <= L; u++)
    for (let v = -B; v <= B; v++) {
      if (!inside(u, v)) continue;
      const rim = !inside(u - 1, v) || !inside(u + 1, v) || !inside(u, v - 1) || !inside(u, v + 1);
      const thwart = Math.abs(u) === Math.round(L * 0.45);
      // Planks run along the hull.
      const plank = (v + 20) % 2 === 0;
      const [x, y] = toScreen(u, v);
      whole.set(x, y, rim ? wood.light : thwart ? wood.light : plank ? wood.dark : wood.mid);
      water[x] = Math.max(water[x], y + sheerAt(u));
    }
  // The near side under the gunwale: from each column's lowest opening pixel down to the waterline and SIDE more, so
  // where the ends rise the side sweeps up with them.
  for (let x = 0; x < W; x++) {
    let low = -1;
    for (let y = H - 1; y >= 0; y--)
      if (whole.get(x, y) >>> 24) {
        low = y;
        break;
      }
    if (low < 0) continue;
    // Pointing at the viewer, the bow's prow deepens to a V at its keel (so the near end reads as the front).
    const prow = heading === 'down' ? Math.max(0, 2 - Math.abs(x - cx)) : 0;
    const to = Math.max(low + SIDE, water[x] + SIDE) + prow;
    for (let y = low + 1; y <= to; y++) whole.set(x, y, y === low + 1 ? wood.mid : wood.dark);
  }
  // The bow's stem rises a pixel past the gunwale (where it points); toward the viewer it is the prow's keel line.
  const [bx, by] = toScreen(L, 0);
  if (heading === 'right') whole.set(bx + 1, by - 1, wood.light);
  else if (heading === 'left') whole.set(bx - 1, by - 1, wood.light);
  else if (heading === 'up') whole.set(bx, by - 1, wood.light);
  else whole.set(bx, by, wood.light);
  // Outline.
  const mask = whole.opaqueMask();
  const grown = mask.dilate();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grown.get(x, y) && !mask.get(x, y)) whole.set(x, y, wood.outline);
  // The near (lower on screen) part of the canoe goes in front of the Blobbi: the rows from just above the hull's
  // centre line down, so the Blobbi's lower body is hidden behind the near side.
  const ax = cx;
  const ay = cy;
  // The seated Blobbi's ground point is SEAT (4) below the centre line: everything from just above the seat down
  // is the near side and goes in front, hiding its lower body inside the hull.
  const splitRow = ay + 1;
  const back = whole.clone();
  const front = new PixelBuffer(whole.width, whole.height);
  for (let y = splitRow; y < whole.height; y++)
    for (let x = 0; x < whole.width; x++) {
      const c = whole.get(x, y);
      if (c >>> 24) front.set(x, y, c);
    }
  const sprite = (buffer: PixelBuffer): Sprite => ({ buffer, anchorX: ax, anchorY: ay, footRx: 0, footRy: 0 });
  const out = { whole: sprite(whole), back: sprite(back), front: sprite(front) };
  cache.set(key, out);
  return out;
}

/** The paddle in the Blobbi's hands, dipping on alternate sides as it paddles (a small sprite, anchored at the seat). */
export function paddleSprite(heading: Heading, stroke: number, palette: WorldPalette): Sprite {
  const along = heading === 'left' || heading === 'right';
  const buf = new PixelBuffer(along ? 9 : 11, along ? 11 : 9);
  const wood = palette.wood;
  const side = stroke % 2 === 0 ? 1 : -1;
  if (along) {
    // A diagonal shaft across the near side, the blade in the water on one side.
    const dir = heading === 'right' ? -1 : 1;
    for (let i = 0; i < 6; i++) buf.set(Math.round(4 + dir * (i - 2) * 0.5), 2 + i, wood.mid);
    const bx = 4 + dir * 2;
    const by = side > 0 ? 8 : 7;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]]) buf.set(bx + dx, by + dy, wood.light);
  } else {
    for (let i = 0; i < 6; i++) buf.set(5 + side * (i - 1), 4, wood.mid);
    for (const [dx, dy] of [[0, -1], [0, 0], [0, 1], [side, 0]]) buf.set(5 + side * 5 + dx, 4 + dy, wood.light);
  }
  return { buffer: buf, anchorX: Math.floor(buf.width / 2), anchorY: Math.floor(buf.height / 2), footRx: 0, footRy: 0 };
}
