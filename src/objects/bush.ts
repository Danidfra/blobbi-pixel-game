/** BUSHES: a low cloud of foliage, optional berries or blossoms, no trunk. */
import { stream } from '../core/rng';
import { PixelBuffer, type Sprite } from '../core/pixel';
import { type Blob, shadedCloud } from '../core/shade';
import { shift } from '../core/color';
import { clamp } from '../core/math';
import type { ObjectInput } from './types';

export interface BushVariation {
  foliage: number;
  berries: boolean;
  blossom: boolean;
  /** 1 = a single round bush, 2..3 = a wider cluster. */
  lobes: number;
}

export function generateBush(input: ObjectInput<BushVariation>): Sprite {
  const { seed, palette } = input;
  const size = clamp(Math.round(input.size), 6, 32); // width
  const rng = stream(seed, 'bush', 'variation');
  const v: BushVariation = {
    foliage: input.variation?.foliage ?? rng.int(0, palette.foliage.length - 1),
    berries: input.variation?.berries ?? rng.chance(0.25),
    blossom: input.variation?.blossom ?? rng.chance(0.15),
    lobes: input.variation?.lobes ?? rng.weighted([1, 2, 3], [3, 4, 2]),
  };
  if (v.berries) v.blossom = false;
  const ramp = palette.foliage[v.foliage % palette.foliage.length];
  const shape = stream(seed, 'bush', 'shape');
  const h = Math.round(size * shape.range(0.6, 0.78));
  const width = size + 4;
  const height = h + 4;
  const buf = new PixelBuffer(width, height);
  const cx = width / 2;
  const groundY = height - 2;
  const blobs: Blob[] = [];
  if (v.lobes === 1) blobs.push({ cx, cy: groundY - h / 2, rx: size / 2, ry: h / 2 });
  else {
    for (let i = 0; i < v.lobes; i++) {
      const t = v.lobes === 1 ? 0.5 : i / (v.lobes - 1);
      const rx = (size / 2) * (v.lobes === 2 ? 0.62 : 0.5);
      blobs.push({ cx: cx + (t - 0.5) * (size - rx * 2) * 1.0, cy: groundY - h / 2 + shape.centered() * 1.2, rx, ry: h / 2 - Math.abs(t - 0.5) * 1.5 });
    }
    // A top lobe for a fuller silhouette
    blobs.push({ cx: cx + shape.centered() * 2, cy: groundY - h * 0.62, rx: size * 0.3, ry: h * 0.34 });
  }
  const mask = shadedCloud(buf, blobs, ramp, { highlight: 0.7, light: 0.4, dark: 0.0 }, 0.55);
  // Ground contact: the bottom row of the bush sits in shadow.
  for (let x = 0; x < width; x++) if (mask.get(x, groundY) && !mask.get(x, groundY + 1)) buf.set(x, groundY, ramp.outline);

  if (v.berries || v.blossom) {
    const dot = stream(seed, 'bush', 'dots');
    const color = v.berries ? dot.pick(palette.fruit) : dot.pick([palette.flowers[0], palette.flowers[2], palette.flowers[3]]);
    const n = Math.max(2, Math.round(mask.count() / 24));
    const placed: { x: number; y: number }[] = [];
    for (let tries = 0; tries < n * 8 && placed.length < n; tries++) {
      const x = dot.int(1, width - 2);
      const y = dot.int(1, height - 3);
      if (!mask.get(x, y) || buf.get(x, y) === ramp.outline || buf.get(x, y) === ramp.highlight) continue;
      if (placed.some((p) => Math.abs(p.x - x) < 3 && Math.abs(p.y - y) < 3)) continue;
      placed.push({ x, y });
      buf.set(x, y, color);
      if (v.blossom && size >= 14 && mask.get(x + 1, y) && buf.get(x + 1, y) !== ramp.outline) buf.set(x + 1, y, shift(color, -0.08, 1, 0));
    }
  }
  buf.validate();
  return { buffer: buf, anchorX: Math.floor(cx), anchorY: groundY, footRx: Math.round(size * 0.45), footRy: Math.max(1, Math.round(size * 0.18)), swayRow: groundY - 1 };
}
