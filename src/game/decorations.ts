/**
 * DECORATIONS: small things the player builds to make the island theirs. Drawn in the world's own palette and
 * style: the fence and the lantern are the generators the world already places (`objects/structures.ts`), so a
 * player's fence is the island's fence; the flower bed, bench and storage crate are drawn here the same way
 * (shaded wood ramps, a one-pixel outline, light from the upper left). The seed varies details, never the shape.
 *
 * Under construction (`progress` < 1) a decoration rises from the ground: rows appear from the bottom up.
 */
import { stream } from '../core/rng';
import { hex, mix } from '../core/color';
import type { WorldPalette } from '../core/palette';
import { PixelBuffer, type Sprite } from '../core/pixel';
import { generateDecor, generateFence } from '../objects/structures';
/** The decorations M4 built in place. */
export type LegacyDecoration = 'fence' | 'flower-bed' | 'lantern' | 'bench' | 'crate';

export function generateDecoration(kind: LegacyDecoration, seed: string, palette: WorldPalette, progress = 1): Sprite {
  const full = fullDecoration(kind, seed, palette);
  return progress >= 1 ? full : rising(full, progress, palette);
}

function fullDecoration(kind: LegacyDecoration, seed: string, palette: WorldPalette): Sprite {
  switch (kind) {
    case 'fence':
      return generateFence({ seed, size: 12, palette, variation: { posts: 3 } });
    case 'lantern':
      return generateDecor({ seed, size: 12, palette, variation: { kind: 'lantern' } });
    case 'flower-bed':
      return flowerBed(seed, palette);
    case 'bench':
      return bench(seed, palette);
    case 'crate':
      return storageCrate(seed, palette);
  }
}

/** A low wooden frame of soil with a row of flowers in the world's flower colours. */
function flowerBed(seed: string, palette: WorldPalette): Sprite {
  const rng = stream(seed, 'flower-bed');
  const w = 13;
  const h = 9;
  const buf = new PixelBuffer(w, h);
  const wood = palette.wood;
  const soil = hex('#7a4f2e');
  // The frame: a box seen from slightly above, front plank lit.
  buf.fillRect(0, 4, w, 5, wood.mid);
  buf.fillRect(1, 5, w - 2, 2, soil);
  buf.hline(1, w - 2, 5, mix(soil, hex('#000000'), 0.2));
  buf.hline(0, w - 1, 7, wood.light);
  buf.hline(0, w - 1, 8, wood.dark);
  // Flowers: stems and blossoms in two or three of the world's flower colours.
  const colours = [rng.pick(palette.flowers), rng.pick(palette.flowers), rng.pick(palette.flowers)];
  const leaf = palette.foliage[0];
  for (let i = 0; i < 4; i++) {
    const x = 2 + i * 3;
    const top = 1 + (i % 2);
    buf.vline(x, top + 1, 5, leaf.mid);
    buf.set(x + 1, 4, leaf.light);
    const c = colours[i % colours.length];
    buf.set(x, top, c);
    buf.set(x - 1, top + 1, c);
    buf.set(x + 1, top + 1, c);
    buf.set(x, top + 1, hex('#fff2b0'));
  }
  buf.outline(wood.outline);
  buf.validate();
  return { buffer: buf, anchorX: Math.floor(w / 2), anchorY: h - 1, footRx: 6, footRy: 3 };
}

/** A two-plank bench on four short legs, with a backrest. */
function bench(seed: string, palette: WorldPalette): Sprite {
  const wood = palette.wood;
  const rng = stream(seed, 'bench');
  const w = 13;
  const h = 10;
  const buf = new PixelBuffer(w, h);
  // Backrest: two slats on posts.
  buf.vline(1, 0, 5, wood.dark);
  buf.vline(w - 2, 0, 5, wood.dark);
  buf.hline(1, w - 2, 1, wood.light);
  buf.hline(1, w - 2, 3, wood.mid);
  // Seat: a lit top plank and a front edge.
  buf.fillRect(0, 5, w, 2, wood.light);
  buf.hline(0, w - 1, 6, wood.mid);
  buf.hline(0, w - 1, 7, wood.dark);
  // Legs.
  for (const x of [1, w - 2]) buf.vline(x, 8, 9, wood.dark);
  // A knot or two in the planks.
  buf.set(rng.int(3, w - 4), 5, wood.mid);
  buf.outline(wood.outline);
  buf.validate();
  return { buffer: buf, anchorX: Math.floor(w / 2), anchorY: h - 1, footRx: 6, footRy: 2 };
}

/** A lidded storage crate: planks, two dark bands, a lid with a lit edge. */
function storageCrate(seed: string, palette: WorldPalette): Sprite {
  const wood = palette.wood;
  const rng = stream(seed, 'crate');
  const w = 11;
  const h = 10;
  const buf = new PixelBuffer(w, h);
  // Lid.
  buf.fillRect(0, 0, w, 3, wood.light);
  buf.hline(0, w - 1, 2, wood.mid);
  // Body: vertical planks, lit on the left.
  for (let x = 0; x < w; x++) for (let y = 3; y < h; y++) buf.set(x, y, x < 3 ? wood.mid : x % 3 === 2 ? wood.dark : mix(wood.mid, wood.dark, 0.3));
  // Bands of stone-grey iron.
  buf.hline(0, w - 1, 4, palette.stone.dark);
  buf.hline(0, w - 1, h - 2, palette.stone.dark);
  // A latch.
  const lx = Math.floor(w / 2);
  buf.set(lx, 3, palette.stone.light);
  buf.set(lx, 4, palette.stone.mid);
  if (rng.chance(0.5)) buf.set(1, 6, wood.light);
  buf.outline(wood.outline);
  buf.validate();
  return { buffer: buf, anchorX: Math.floor(w / 2), anchorY: h - 1, footRx: 5, footRy: 2 };
}

/** The decoration rising from the ground: the bottom rows up to `progress`, the rest a faint wooden frame. */
function rising(full: Sprite, progress: number, palette: WorldPalette): Sprite {
  const src = full.buffer;
  const buf = new PixelBuffer(src.width, src.height);
  const shown = Math.max(1, Math.round((full.anchorY + 1) * Math.max(0, Math.min(1, progress))));
  const line = full.anchorY + 1 - shown;
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const c = src.get(x, y);
      if (!(c >>> 24)) continue;
      if (y >= line) buf.set(x, y, c);
      else if ((x + y) % 3 === 0) buf.set(x, y, palette.wood.light); // the outline of what is coming
    }
  return { ...full, buffer: buf };
}
