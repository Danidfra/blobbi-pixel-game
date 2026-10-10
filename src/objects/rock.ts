/**
 * ROCKS: a flat-bottomed boulder, built as a cloud of grey blobs clipped to
 * a ground line, with a strong top-left highlight and optional moss.
 */
import { stream } from '../core/rng';
import { Mask, PixelBuffer, type Sprite } from '../core/pixel';
import { type Blob, blobScore, shadeOf } from '../core/shade';
import { forEachEllipsePixel } from '../core/pixel';
import { clamp } from '../core/math';
import type { ObjectInput } from './types';

export interface RockVariation {
  moss: boolean;
  /** 1 = one boulder, 2..3 = a small pile. */
  pieces: number;
  /** Add a crack line. */
  crack: boolean;
}

export function generateRock(input: ObjectInput<RockVariation>): Sprite {
  const { seed, palette } = input;
  const size = clamp(Math.round(input.size), 4, 28); // width
  const rng = stream(seed, 'rock', 'variation');
  const v: RockVariation = {
    moss: input.variation?.moss ?? rng.chance(0.35),
    pieces: input.variation?.pieces ?? (size >= 10 ? rng.weighted([1, 2, 3], [4, 3, 1]) : 1),
    crack: input.variation?.crack ?? (size >= 10 && rng.chance(0.4)),
  };
  const ramp = palette.stone;
  const shape = stream(seed, 'rock', 'shape');
  const h = Math.max(3, Math.round(size * shape.range(0.55, 0.75)));
  const width = size + 2;
  const height = h + 3;
  const buf = new PixelBuffer(width, height);
  const groundY = height - 2;
  const blobs: Blob[] = [];
  if (v.pieces === 1) blobs.push({ cx: width / 2, cy: groundY - h * 0.42, rx: size / 2, ry: h * 0.62 });
  else {
    for (let i = 0; i < v.pieces; i++) {
      const t = i / (v.pieces - 1);
      const rx = (size / 2) * (v.pieces === 2 ? 0.6 : 0.45);
      const ry = h * (0.42 + shape.range(0, 0.22));
      blobs.push({ cx: 1 + rx + t * (size - rx * 2), cy: groundY - ry * 0.7, rx, ry });
    }
  }
  const mask = new Mask(width, height);
  const sorted = blobs.slice().sort((a, b) => a.cy - b.cy);
  for (const b of sorted) {
    const m = new Mask(width, height);
    forEachEllipsePixel(b.cx, b.cy, b.rx, b.ry, (x, y) => {
      if (y > groundY) return; // flat bottom
      const u = (x + 0.5 - b.cx) / b.rx;
      const vv = (y + 0.5 - b.cy) / b.ry;
      // Rocks are faceted: quantize the score harder so bands are flat planes.
      const score = blobScore(u, vv, 0.8);
      buf.set(x, y, shadeOf(score, ramp, { highlight: 0.66, light: 0.3, dark: -0.08 }));
      m.set(x, y);
    });
    const edge = m.edge();
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (edge.get(x, y) && mask.get(x, y) && y > b.cy) buf.set(x, y, ramp.dark);
    mask.union(m);
  }
  buf.paintMask(mask.edge(), ramp.outline);
  // Bottom row: a darker contact line.
  for (let x = 0; x < width; x++) if (mask.get(x, groundY)) buf.set(x, groundY, ramp.outline);
  if (v.crack) {
    const b0 = sorted[sorted.length - 1];
    const x0 = Math.round(b0.cx + shape.range(-1, 2));
    const y0 = Math.round(b0.cy - b0.ry * 0.3);
    let x = x0;
    for (let y = y0; y < groundY - 1; y++) {
      if (mask.get(x, y) && buf.get(x, y) !== ramp.outline) buf.set(x, y, ramp.dark);
      if (shape.chance(0.4)) x += shape.chance(0.5) ? 1 : -1;
    }
  }
  if (v.moss) {
    const moss = stream(seed, 'rock', 'moss');
    const g = palette.foliage[0];
    const n = Math.max(2, Math.round(mask.count() / 14));
    for (let i = 0; i < n; i++) {
      const x = moss.int(1, width - 2);
      const y = moss.int(0, Math.round(groundY - h * 0.45));
      if (!mask.get(x, y) || buf.get(x, y) === ramp.outline) continue;
      buf.set(x, y, g.mid);
      if (moss.chance(0.6) && mask.get(x + 1, y) && buf.get(x + 1, y) !== ramp.outline) buf.set(x + 1, y, g.light);
    }
  }
  buf.validate();
  return { buffer: buf, anchorX: Math.floor(width / 2), anchorY: groundY, footRx: Math.round(size * 0.48), footRy: Math.max(1, Math.round(size * 0.18)) };
}
