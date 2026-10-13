/**
 * FURNITURE AND DECORATION ART: procedural pixel sprites for every placeable in the content catalogue, in the
 * world's style (shaded ramps, light from the upper left, a one-pixel outline). Each generator takes the record's
 * seed (small details) and a `variant` (colourways: blanket, rug, paint, plant). Sprites anchor at the bottom
 * centre of their footprint, like every object in the lab.
 */
import { stream } from '../core/rng';
import { hex, mix, type Color } from '../core/color';
import { ramp, type Ramp, type WorldPalette } from '../core/palette';
import { PixelBuffer } from '../core/pixel';

/** Fabric and paint colourways; `variant` picks one. */
export const FABRICS: readonly Ramp[] = [
  ramp(hex('#d2504a'), { step: 0.085, hueShift: 8 }),
  ramp(hex('#4d74d6'), { step: 0.085, hueShift: 4 }),
  ramp(hex('#4fae5a'), { step: 0.085, hueShift: 6 }),
  ramp(hex('#8c5fc8'), { step: 0.085, hueShift: 4 }),
  ramp(hex('#e0a33a'), { step: 0.085, hueShift: 8 }),
];
export const FABRIC_NAMES = ['red', 'blue', 'green', 'violet', 'gold'];
const CREAM = ramp(hex('#f3e3c3'), { step: 0.07, hueShift: 8 });
const IRON = ramp(hex('#6a7084'), { step: 0.09, hueShift: 4 });
const LIGHT = hex('#ffe07a');
const GLOW = hex('#fff4b0');
const LEAF = ramp(hex('#4fbf3a'), { step: 0.1, hueShift: 8 });
const CLAY = ramp(hex('#c8643a'), { step: 0.085, hueShift: 8 });
const WATER = ramp(hex('#5fb3f0'), { step: 0.07, hueShift: 3 });

export interface ArtInput {
  seed: string;
  palette: WorldPalette;
  variant: number;
}

export type ArtFn = (a: ArtInput) => PixelBuffer;

const fab = (v: number) => FABRICS[((v % FABRICS.length) + FABRICS.length) % FABRICS.length];

/** A box lit from the upper left: top face light, front mid, right edge dark. */
function block(b: PixelBuffer, x: number, y: number, w: number, h: number, r: Ramp, top = 2): void {
  b.fillRect(x, y, w, h, r.mid);
  b.fillRect(x, y, w, Math.min(top, h), r.light);
  b.vline(x + w - 1, y + top, y + h - 1, r.dark);
  b.hline(x, x + w - 1, y + h - 1, r.dark);
}

/** Finish a sprite: a one-pixel outline OUTSIDE the shape (so one-pixel details on the silhouette survive). */
const done = (b: PixelBuffer, outline: Color): PixelBuffer => {
  const out = new PixelBuffer(b.width + 2, b.height + 2);
  out.blit(b, 1, 1);
  const mask = out.opaqueMask();
  const grown = mask.dilate();
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) if (grown.get(x, y) && !mask.get(x, y)) out.set(x, y, outline);
  out.validate();
  return out;
};

export const ART: Record<string, ArtFn> = {
  // ─── Indoor furniture ────────────────────────────────────────────────────
  bed: ({ palette, variant }) => {
    const w = palette.wood;
    const f = fab(variant);
    const b = new PixelBuffer(16, 14);
    block(b, 0, 0, 16, 5, w); // headboard
    b.fillRect(1, 4, 14, 8, CREAM.light); // sheet
    b.fillRect(2, 5, 5, 3, CREAM.highlight); // pillow
    b.fillRect(1, 7, 14, 5, f.mid); // blanket
    b.hline(1, 14, 7, f.light);
    b.hline(1, 14, 11, f.dark);
    for (let x = 3; x < 14; x += 4) b.set(x, 9, f.light);
    b.fillRect(0, 12, 16, 2, w.dark); // frame foot
    return done(b, w.outline);
  },
  'pet-bed': ({ variant }) => {
    const f = fab(variant + 3);
    const b = new PixelBuffer(13, 7);
    b.fillEllipse(6.5, 3.5, 6.5, 3.5, f.dark);
    b.fillEllipse(6.5, 3.5, 5.5, 2.5, f.mid);
    b.fillEllipse(6.5, 4, 4, 1.6, CREAM.light);
    b.hline(3, 9, 1, f.light);
    return done(b, f.outline);
  },
  chair: ({ palette }) => {
    const w = palette.wood;
    const b = new PixelBuffer(7, 11);
    b.fillRect(1, 0, 5, 5, w.mid); // back
    b.hline(1, 5, 0, w.light);
    b.vline(3, 1, 4, w.dark);
    b.fillRect(0, 5, 7, 2, w.light); // seat
    b.hline(0, 6, 6, w.mid);
    b.vline(1, 7, 10, w.dark);
    b.vline(5, 7, 10, w.dark);
    return done(b, w.outline);
  },
  armchair: ({ palette, variant }) => {
    const w = palette.wood;
    const f = fab(variant);
    const b = new PixelBuffer(11, 11);
    b.fillRect(1, 0, 9, 6, f.mid);
    b.hline(1, 9, 0, f.light);
    b.fillRect(0, 3, 2, 6, f.dark);
    b.fillRect(9, 3, 2, 6, f.dark);
    b.fillRect(2, 5, 7, 3, f.light);
    b.hline(2, 8, 7, f.mid);
    b.fillRect(0, 9, 11, 2, w.dark);
    return done(b, f.outline);
  },
  stool: ({ palette }) => {
    const w = palette.wood;
    const b = new PixelBuffer(7, 6);
    b.fillRect(0, 0, 7, 2, w.light);
    b.hline(0, 6, 1, w.mid);
    b.vline(1, 2, 5, w.dark);
    b.vline(5, 2, 5, w.dark);
    return done(b, w.outline);
  },
  table: ({ palette, seed }) => {
    const w = palette.wood;
    const b = new PixelBuffer(11, 9);
    block(b, 0, 0, 11, 4, w, 3);
    b.vline(1, 4, 8, w.dark);
    b.vline(9, 4, 8, w.dark);
    // Something on it: a cup or a book.
    if (stream(seed, 'table').chance(0.5)) b.fillRect(6, 0, 2, 2, CREAM.highlight);
    else b.fillRect(2, 1, 3, 1, FABRICS[1].mid);
    return done(b, w.outline);
  },
  'dining-table': ({ palette }) => {
    const w = palette.wood;
    const b = new PixelBuffer(19, 10);
    block(b, 0, 0, 19, 5, w, 4);
    b.hline(1, 17, 2, mix(w.light, w.mid, 0.5));
    b.vline(1, 5, 9, w.dark);
    b.vline(17, 5, 9, w.dark);
    b.fillRect(8, 0, 3, 2, CREAM.highlight); // a bowl
    return done(b, w.outline);
  },
  bookshelf: ({ palette, seed }) => {
    const w = palette.wood;
    const rng = stream(seed, 'books');
    const b = new PixelBuffer(13, 17);
    block(b, 0, 0, 13, 17, w, 1);
    for (const row of [2, 7, 12]) {
      b.fillRect(1, row, 11, 4, w.outline);
      for (let x = 1; x < 12; x++) {
        if (rng.chance(0.15)) continue;
        const book = FABRICS[rng.int(0, FABRICS.length - 1)];
        const h = rng.int(2, 4);
        b.vline(x, row + 4 - h, row + 3, x % 2 ? book.mid : book.light);
      }
      b.hline(0, 12, row + 4, w.light);
    }
    return done(b, w.outline);
  },
  cabinet: ({ palette }) => {
    const w = palette.wood;
    const b = new PixelBuffer(12, 14);
    block(b, 0, 0, 12, 14, w, 2);
    b.vline(6, 3, 12, w.dark);
    b.strokeRect(1, 3, 5, 9, w.dark);
    b.strokeRect(6, 3, 5, 9, w.dark);
    b.set(4, 7, LIGHT);
    b.set(7, 7, LIGHT);
    return done(b, w.outline);
  },
  'wall-shelf': ({ palette, seed }) => {
    const w = palette.wood;
    const rng = stream(seed, 'jars');
    const b = new PixelBuffer(13, 8);
    b.fillRect(0, 5, 13, 2, w.light);
    b.hline(0, 12, 6, w.mid);
    b.set(1, 7, w.dark);
    b.set(11, 7, w.dark);
    for (let x = 1; x < 12; x += 3) {
      const jar = [CLAY, WATER, LEAF, FABRICS[4]][rng.int(0, 3)];
      b.fillRect(x, 2, 2, 3, jar.mid);
      b.set(x, 2, jar.light);
    }
    return done(b, w.outline);
  },
  painting: ({ palette, variant }) => {
    const w = palette.wood;
    const b = new PixelBuffer(13, 10);
    b.fillRect(0, 0, 13, 10, w.light);
    b.fillRect(1, 1, 11, 8, hex('#9ad0f0'));
    // A tiny World Carrier: sea, a green shell, a head (the island's own story, in paint).
    b.fillRect(1, 6, 11, 3, WATER.mid);
    b.fillEllipse(6, 5, 3.5, 2, variant % 2 ? hex('#4fae5a') : hex('#78d04c'));
    b.fillRect(9, 5, 2, 2, hex('#86b85a'));
    b.set(2, 2, LIGHT);
    return done(b, w.outline);
  },
  'wall-clock': ({ palette }) => {
    const w = palette.wood;
    const b = new PixelBuffer(9, 9);
    b.fillEllipse(4.5, 4.5, 4.5, 4.5, w.mid);
    b.fillEllipse(4.5, 4.5, 3.4, 3.4, CREAM.highlight);
    b.vline(4, 2, 4, w.outline);
    b.hline(4, 6, 4, w.outline);
    return done(b, w.outline);
  },
  'wall-lantern': ({ palette }) => {
    const b = new PixelBuffer(7, 9);
    b.hline(1, 5, 0, IRON.dark);
    b.fillRect(1, 2, 5, 5, LIGHT);
    b.fillRect(2, 3, 3, 3, GLOW);
    b.strokeRect(1, 2, 5, 5, IRON.dark);
    b.set(3, 1, IRON.mid);
    b.hline(2, 4, 7, IRON.dark);
    void palette;
    return done(b, IRON.outline);
  },
  'floor-lamp': ({ variant }) => {
    const f = fab(variant + 4);
    const b = new PixelBuffer(7, 15);
    b.fillRect(0, 0, 7, 4, f.light);
    b.hline(0, 6, 3, f.mid);
    b.set(3, 4, GLOW);
    b.vline(3, 4, 13, IRON.dark);
    b.hline(1, 5, 14, IRON.dark);
    return done(b, IRON.outline);
  },
  rug: ({ variant }) => {
    const f = fab(variant);
    const b = new PixelBuffer(17, 9);
    b.fillEllipse(8.5, 4.5, 8.5, 4.5, f.dark);
    b.fillEllipse(8.5, 4.5, 7, 3.3, f.mid);
    b.fillEllipse(8.5, 4.5, 4.5, 2, f.light);
    b.fillEllipse(8.5, 4.5, 2, 0.9, CREAM.light);
    return done(b, f.outline);
  },
  'potted-plant': ({ variant, seed }) => {
    const b = new PixelBuffer(9, 12);
    const kind = ((variant % 3) + 3) % 3;
    block(b, 2, 7, 5, 5, CLAY, 1);
    b.hline(1, 7, 7, CLAY.light);
    if (kind === 0) {
      // A leafy fern.
      const rng = stream(seed, 'fern');
      for (let i = 0; i < 6; i++) {
        const x = 1 + rng.int(0, 6);
        b.line(4, 7, x, rng.int(0, 3), i % 2 ? LEAF.mid : LEAF.light);
      }
    } else if (kind === 1) {
      // A little cactus with a flower.
      b.fillRect(3, 1, 3, 6, LEAF.dark);
      b.vline(4, 1, 6, LEAF.mid);
      b.fillRect(1, 3, 2, 2, LEAF.dark);
      b.fillRect(6, 2, 2, 2, LEAF.dark);
      b.set(4, 0, hex('#ff6b9a'));
    } else {
      // A flowering bush.
      b.fillEllipse(4.5, 4, 4, 3.2, LEAF.mid);
      for (const [x, y] of [[2, 3], [5, 2], [6, 5], [3, 5]]) b.set(x, y, hex('#ffd93b'));
    }
    return done(b, LEAF.outline);
  },
  vase: ({ variant }) => {
    const b = new PixelBuffer(7, 11);
    const flowers = [hex('#ffd23b'), hex('#ff6b9a'), hex('#9a7ad8')];
    b.fillRect(2, 6, 3, 5, WATER.mid);
    b.fillRect(1, 7, 5, 3, WATER.mid);
    b.vline(2, 7, 9, WATER.light);
    for (let i = 0; i < 3; i++) b.line(3, 6, 1 + i * 2, 3, LEAF.mid);
    for (let i = 0; i < 3; i++) {
      const c = flowers[(((variant + i) % 3) + 3) % 3];
      b.set(1 + i * 2, 1, c);
      b.set(1 + i * 2, 2, c);
    }
    return done(b, WATER.outline);
  },
  'music-box': ({ palette }) => {
    const w = palette.wood;
    const b = new PixelBuffer(9, 6);
    block(b, 0, 1, 9, 5, w, 2);
    b.hline(0, 8, 0, w.light);
    b.set(6, 3, LIGHT);
    return done(b, w.outline);
  },
  'toy-ball': ({ variant }) => {
    const f = fab(variant);
    const b = new PixelBuffer(6, 6);
    b.fillEllipse(3, 3, 3, 3, f.mid);
    b.vline(3, 0, 5, CREAM.highlight);
    b.set(1, 1, f.light);
    return done(b, f.outline);
  },
  // ─── Workstations and storage (indoor or outdoor) ──────────────────────
  chest: ({ palette }) => {
    const w = palette.wood;
    const b = new PixelBuffer(11, 9);
    b.fillRect(0, 0, 11, 3, w.light);
    b.hline(0, 10, 2, w.mid);
    block(b, 0, 3, 11, 6, w, 0);
    b.hline(0, 10, 3, IRON.dark);
    b.vline(1, 0, 8, IRON.dark);
    b.vline(9, 0, 8, IRON.dark);
    b.fillRect(5, 3, 1, 2, LIGHT);
    return done(b, w.outline);
  },
  workbench: ({ palette }) => {
    const w = palette.wood;
    const b = new PixelBuffer(15, 10);
    block(b, 0, 0, 15, 4, w, 3);
    b.vline(1, 4, 9, w.dark);
    b.vline(13, 4, 9, w.dark);
    b.hline(1, 13, 7, w.mid);
    // A saw and a hammer on top.
    b.hline(2, 6, 1, IRON.light);
    b.set(7, 1, w.dark);
    b.vline(10, 0, 2, w.dark);
    b.hline(9, 11, 0, IRON.mid);
    return done(b, w.outline);
  },
  'cooking-station': ({ palette }) => {
    const s = palette.stone;
    const b = new PixelBuffer(13, 12);
    block(b, 0, 3, 13, 9, s, 2);
    b.fillRect(3, 7, 7, 4, hex('#2b1a10')); // fire mouth
    b.hline(4, 8, 10, hex('#ff8a3a'));
    b.set(6, 9, LIGHT);
    // A pot on top.
    b.fillRect(3, 0, 7, 4, IRON.mid);
    b.hline(3, 9, 0, IRON.light);
    b.set(10, 1, IRON.dark);
    return done(b, s.outline);
  },
  // ─── Outdoor decorations ─────────────────────────────────────────────────
  'picket-fence': () => {
    const white = CREAM;
    const b = new PixelBuffer(13, 8);
    for (let x = 0; x < 13; x += 3) {
      b.vline(x, 1, 7, white.light);
      b.set(x, 0, white.mid);
    }
    b.hline(0, 12, 3, white.mid);
    b.hline(0, 12, 6, white.mid);
    return done(b, white.outline);
  },
  'stone-wall': ({ palette, seed }) => {
    const s = palette.stone;
    const rng = stream(seed, 'wall');
    const b = new PixelBuffer(13, 7);
    for (let row = 0; row < 3; row++)
      for (let x = row % 2 ? -2 : 0; x < 13; x += 4) {
        const c = rng.chance(0.5) ? s.mid : s.light;
        b.fillRect(x, row * 2 + 1, 4, 2, c);
        b.set(x + 3, row * 2 + 1, s.dark);
      }
    b.hline(0, 12, 0, s.light);
    return done(b, s.outline);
  },
  'stone-path': ({ palette, seed }) => {
    const s = palette.stone;
    const rng = stream(seed, 'path');
    const b = new PixelBuffer(10, 8);
    for (const [x, y, r] of [[2.5, 2.5, 2.3], [7, 2, 1.8], [5, 6, 2.2], [1.5, 6, 1.3], [8.5, 6, 1.2]] as const) {
      b.fillEllipse(x, y, r, r * 0.8, rng.chance(0.5) ? s.light : s.mid);
    }
    return done(b, s.dark);
  },
  boardwalk: ({ palette }) => {
    const w = palette.wood;
    const b = new PixelBuffer(10, 8);
    for (let y = 0; y < 8; y += 2) {
      b.hline(0, 9, y, w.light);
      b.hline(0, 9, y + 1, w.mid);
    }
    b.set(2, 1, w.dark);
    b.set(7, 5, w.dark);
    return done(b, w.outline);
  },
  'clearing-flag': ({ palette, variant }) => {
    // A thin stake with a little pennant (its colour from the fabrics), the tip of the stake in the ground.
    const w = palette.wood;
    const f = fab(variant);
    const b = new PixelBuffer(7, 11);
    b.vline(1, 0, 10, w.mid);
    b.set(1, 0, w.light);
    b.fillRect(2, 1, 4, 3, f.mid);
    b.hline(2, 5, 1, f.light);
    b.set(6, 2, f.mid);
    b.hline(2, 4, 3, f.dark);
    return done(b, w.outline);
  },
  signpost: ({ palette }) => {
    const w = palette.wood;
    const b = new PixelBuffer(11, 12);
    b.vline(5, 4, 11, w.dark);
    b.fillRect(0, 1, 11, 4, w.light);
    b.hline(1, 9, 3, w.mid);
    b.hline(2, 7, 2, w.outline);
    b.set(10, 2, w.mid);
    return done(b, w.outline);
  },
  scarecrow: ({ palette, variant }) => {
    const w = palette.wood;
    const f = fab(variant);
    const b = new PixelBuffer(11, 17);
    b.vline(5, 5, 16, w.dark);
    b.hline(0, 10, 7, w.mid);
    b.fillRect(3, 6, 5, 5, f.mid); // shirt
    b.hline(3, 7, 6, f.light);
    b.fillEllipse(5, 3, 2.5, 2.5, hex('#e8c27a')); // straw head
    b.fillRect(2, 0, 7, 2, hex('#8a5a33')); // hat
    b.hline(1, 9, 1, hex('#6a4429'));
    b.set(4, 3, w.outline);
    b.set(6, 3, w.outline);
    return done(b, w.outline);
  },
  'bird-bath': ({ palette }) => {
    const s = palette.stone;
    const b = new PixelBuffer(11, 10);
    b.fillEllipse(5.5, 2, 5.5, 2, s.light);
    b.fillEllipse(5.5, 2, 4, 1.1, WATER.light);
    b.fillRect(4, 3, 3, 5, s.mid);
    b.fillRect(2, 8, 7, 2, s.dark);
    return done(b, s.outline);
  },
  cairn: ({ palette }) => {
    const s = palette.stone;
    const b = new PixelBuffer(9, 10);
    b.fillEllipse(4.5, 8, 4.5, 2, s.mid);
    b.fillEllipse(4.5, 5, 3.4, 1.6, s.light);
    b.fillEllipse(4.5, 2.6, 2.2, 1.3, s.mid);
    b.fillEllipse(4.5, 0.9, 1.2, 0.8, s.highlight);
    return done(b, s.outline);
  },
  'log-seat': ({ palette }) => {
    const t = palette.trunk[0];
    const b = new PixelBuffer(13, 7);
    b.fillRect(0, 2, 13, 5, t.mid);
    b.hline(0, 12, 2, t.light);
    b.hline(0, 12, 6, t.dark);
    b.fillEllipse(1.5, 4, 1.5, 2.5, palette.wood.light);
    b.set(1, 4, t.dark);
    return done(b, t.outline);
  },
  sprinkler: () => {
    const b = new PixelBuffer(7, 8);
    b.fillRect(2, 3, 3, 5, IRON.mid);
    b.vline(2, 3, 7, IRON.light);
    b.fillRect(1, 1, 5, 2, IRON.light);
    b.set(3, 0, WATER.light);
    b.set(0, 1, WATER.light);
    b.set(6, 1, WATER.light);
    return done(b, IRON.outline);
  },
  'bird-feeder': ({ palette }) => {
    const w = palette.wood;
    const b = new PixelBuffer(9, 15);
    b.vline(4, 6, 14, w.dark);
    for (let j = 0; j < 3; j++) b.hline(4 - j - 1, 4 + j + 1, j, hex('#d2504a'));
    b.fillRect(1, 3, 7, 3, w.light);
    b.hline(1, 7, 5, hex('#e3c48a'));
    return done(b, w.outline);
  },
  'flower-arch': ({ palette, variant }) => {
    const w = palette.wood;
    const flowers = [hex('#ff6b9a'), hex('#ffd93b'), hex('#9a7ad8'), hex('#ffffff')];
    const b = new PixelBuffer(17, 18);
    b.vline(1, 4, 17, w.dark);
    b.vline(15, 4, 17, w.dark);
    for (let x = 1; x <= 15; x++) {
      const y = Math.round(4 - Math.sin(((x - 1) / 14) * Math.PI) * 3.5);
      b.set(x, y, w.mid);
      b.set(x, y + 1, w.dark);
    }
    const rng = stream(`arch/${variant}`, 'vine');
    for (let i = 0; i < 16; i++) {
      const side = rng.chance(0.5);
      const y = rng.int(1, 14);
      const x = y < 5 ? rng.int(2, 14) : side ? rng.int(0, 2) : rng.int(14, 16);
      b.set(x, y, rng.chance(0.4) ? flowers[(variant + i) % 4] : LEAF.mid);
    }
    return done(b, w.outline);
  },
  'blobbi-statue': ({ palette }) => {
    const s = palette.stone;
    const b = new PixelBuffer(11, 14);
    b.fillRect(1, 10, 9, 4, s.dark);
    b.hline(1, 9, 10, s.mid);
    // A round little Blobbi-shaped stone (not a portrait: just the friendly silhouette).
    b.fillEllipse(5.5, 5.5, 4.5, 4.5, s.light);
    b.fillEllipse(4.5, 4.5, 2, 2, s.highlight);
    b.set(4, 6, s.outline);
    b.set(7, 6, s.outline);
    return done(b, s.outline);
  },
  'herb-planter': ({ palette, seed }) => {
    const w = palette.wood;
    const rng = stream(seed, 'herbs');
    const b = new PixelBuffer(13, 9);
    block(b, 0, 4, 13, 5, w, 1);
    for (let x = 1; x < 12; x++) {
      const h = rng.int(1, 4);
      b.vline(x, 4 - h, 4, x % 2 ? LEAF.mid : LEAF.light);
    }
    return done(b, w.outline);
  },
  'wind-chime': ({ palette }) => {
    const w = palette.wood;
    const b = new PixelBuffer(9, 15);
    b.vline(4, 0, 14, w.dark);
    b.hline(0, 8, 2, w.mid);
    for (const x of [1, 3, 5, 7]) b.vline(x, 3, 3 + 2 + (x % 3), WATER.light);
    b.hline(2, 6, 14, w.dark);
    return done(b, w.outline);
  },
  'hay-bale': () => {
    const hay = ramp(hex('#e0b84a'), { step: 0.085, hueShift: 8 });
    const b = new PixelBuffer(11, 7);
    block(b, 0, 0, 11, 7, hay, 2);
    b.vline(3, 0, 6, hay.dark);
    b.vline(7, 0, 6, hay.dark);
    return done(b, hay.outline);
  },
};
