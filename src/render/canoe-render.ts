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

/** The hull's half beam at `x` along its length (pointed ends). */
const halfBeam = (x: number) => (CANOE.halfBeam + 0.6) * Math.max(0, 1 - Math.pow(Math.abs(x) / (CANOE.halfLength + 0.5), 2.6));

export function canoeSprites(heading: Heading, palette: WorldPalette): CanoeSprites {
  const key = `${palette.name}|${heading}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const along = heading === 'left' || heading === 'right';
  const L = CANOE.halfLength;
  const B = CANOE.halfBeam + 1;
  const wood = palette.wood;
  // The top view (the hull's opening: gunwale, planked inside, thwarts) along x, bow right.
  const inside = (x: number, y: number) => Math.abs(y) <= halfBeam(x);
  const top = (W: number, H: number, cx: number, cy: number, transpose: boolean) => {
    const buf = new PixelBuffer(W, H);
    const put = (x: number, y: number, c: number) => (transpose ? buf.set(cx + y, cy + (heading === 'up' ? -x : x), c) : buf.set(cx + (heading === 'left' ? -x : x), cy + y, c));
    for (let y = -B; y <= B; y++)
      for (let x = -L; x <= L; x++) {
        if (!inside(x, y)) continue;
        const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        const thwart = Math.abs(x) === Math.round(L * 0.45);
        const plank = transpose ? (x + 20) % 3 === 0 : (y + 20) % 2 === 0;
        put(x, y, rim ? wood.light : thwart ? wood.light : plank ? wood.dark : wood.mid);
      }
    return buf;
  };
  // In the game's three-quarter view the hull's near side shows below its gunwale: a band of darker planks.
  const SIDE = 2;
  const W = along ? L * 2 + 3 : B * 2 + 3;
  const H = (along ? B * 2 + 3 : L * 2 + 3) + SIDE;
  const cx = along ? L + 1 : B + 1;
  const cy = along ? B + 1 : L + 1;
  const whole = top(W, H, cx, cy, !along);
  for (let x = 0; x < W; x++) {
    // The lowest opening pixel of each column: the near gunwale; the side hangs below it.
    let low = -1;
    for (let y = H - 1; y >= 0; y--)
      if (whole.get(x, y) >>> 24) {
        low = y;
        break;
      }
    if (low < 0) continue;
    for (let k = 1; k <= SIDE; k++) whole.set(x, low + k, k === 1 ? wood.mid : wood.dark);
  }
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
