/** FLOWERS and GRASS TUFTS: 3-7 px ground details. Few pixels, so each one is hand-shaped. */
import { stream } from '../core/rng';
import { PixelBuffer, type Sprite } from '../core/pixel';
import { shift } from '../core/color';
import { clamp } from '../core/math';
import type { ObjectInput } from './types';

export interface FlowerVariation {
  color: number;
  /** 'single' is one bloom on a stem; 'cluster' is three blooms in a tuft; 'tall' a stem with two blooms. */
  kind: 'single' | 'cluster' | 'tall';
}

export function generateFlower(input: ObjectInput<FlowerVariation>): Sprite {
  const { seed, palette } = input;
  const size = clamp(Math.round(input.size), 3, 9);
  const rng = stream(seed, 'flower', 'variation');
  const v: FlowerVariation = {
    color: input.variation?.color ?? rng.int(0, palette.flowers.length - 1),
    kind: input.variation?.kind ?? rng.weighted(['single', 'cluster', 'tall'] as const, [4, 3, 2]),
  };
  const petal = palette.flowers[v.color % palette.flowers.length];
  const center = shift(petal, -0.25, 1.1, 20);
  const stem = palette.grass.dark;
  const leaf = palette.grass.outline;
  const big = size >= 6;
  const w = v.kind === 'cluster' ? 7 : 5;
  const h = v.kind === 'tall' ? 8 : big ? 6 : 5;
  const buf = new PixelBuffer(w, h);
  const ground = h - 1;
  const bloom = (x: number, y: number, large: boolean) => {
    if (large) {
      // A plus shape of petals around a centre.
      buf.set(x, y, center);
      buf.set(x - 1, y, petal);
      buf.set(x + 1, y, petal);
      buf.set(x, y - 1, petal);
      buf.set(x, y + 1, petal);
    } else {
      buf.set(x, y, petal);
      buf.set(x, y - 1, shift(petal, 0.1, 0.9, 0));
    }
  };
  if (v.kind === 'single') {
    const cx = 2;
    buf.vline(cx, ground - 2, ground, stem);
    buf.set(cx + 1, ground - 1, leaf);
    buf.set(cx - 1, ground, leaf);
    bloom(cx, ground - 3, big);
  } else if (v.kind === 'cluster') {
    const cx = 3;
    buf.vline(cx, ground - 2, ground, stem);
    buf.set(cx - 2, ground - 1, stem);
    buf.set(cx - 1, ground, stem);
    buf.set(cx + 2, ground - 1, stem);
    buf.set(cx + 1, ground, stem);
    bloom(cx, ground - 3, false);
    bloom(cx - 2, ground - 2, false);
    bloom(cx + 2, ground - 2, false);
  } else {
    const cx = 2;
    buf.vline(cx, ground - 5, ground, stem);
    buf.set(cx + 1, ground - 1, leaf);
    buf.set(cx - 1, ground - 2, leaf);
    bloom(cx, ground - 6, true);
    bloom(cx + 1, ground - 3, false);
  }
  buf.validate();
  return { buffer: buf, anchorX: Math.floor(w / 2), anchorY: ground, footRx: 1, footRy: 1, swayRow: ground - 1 };
}

export interface GrassVariation {
  /** 'tuft' is a 3-5 blade clump; 'sprout' two tiny blades; 'patch' a wide low clump. */
  kind: 'tuft' | 'sprout' | 'patch';
}

export function generateGrassTuft(input: ObjectInput<GrassVariation>): Sprite {
  const { seed, palette } = input;
  const rng = stream(seed, 'grass', 'variation');
  const kind = input.variation?.kind ?? rng.weighted(['tuft', 'sprout', 'patch'] as const, [4, 4, 2]);
  const dark = palette.grass.dark;
  const darker = palette.grass.outline;
  const light = palette.grass.light;
  if (kind === 'sprout') {
    const buf = new PixelBuffer(3, 2);
    buf.set(0, 0, dark);
    buf.set(2, 0, dark);
    buf.set(1, 1, dark);
    return { buffer: buf, anchorX: 1, anchorY: 1, footRx: 1, footRy: 1 };
  }
  if (kind === 'tuft') {
    const buf = new PixelBuffer(5, 4);
    // Blades: a small fan.
    buf.set(2, 3, darker);
    buf.set(1, 2, dark);
    buf.set(3, 2, dark);
    buf.set(2, 2, dark);
    buf.set(0, 1, dark);
    buf.set(4, 1, dark);
    buf.set(2, 1, light);
    buf.set(2, 0, light);
    buf.set(1, 1, light);
    return { buffer: buf, anchorX: 2, anchorY: 3, footRx: 2, footRy: 1 };
  }
  const buf = new PixelBuffer(7, 3);
  for (let x = 0; x < 7; x += 2) buf.set(x, 2, dark);
  buf.set(1, 1, dark);
  buf.set(3, 1, light);
  buf.set(5, 1, dark);
  buf.set(3, 0, light);
  return { buffer: buf, anchorX: 3, anchorY: 2, footRx: 3, footRy: 1 };
}
