/**
 * DRAWING AN OCCUPIED PIECE OF FURNITURE: the piece goes behind the Blobbi in the painter's order, then the part of
 * it that should hide the Blobbi (a seat's front and legs, the tub's water and front, a bed's blanket) goes over it
 * again, half a pixel later. Both renderers (the island and the room) use these, so a seat holds the Blobbi the
 * same way indoors and out, and the multi-scale view's overlay gets the front part as it gets anything in front.
 */
import { PixelBuffer, type Sprite } from '../core/pixel';
import { OCCUPANCY } from '../game/furniture-use';

const parts = new WeakMap<Sprite, Map<string, Sprite>>();

/** The pixels of `sprite` that `pick` keeps (same size and anchor), cached per sprite and key. */
export function partOf(sprite: Sprite, key: string, pick: (x: number, y: number, w: number, h: number) => boolean): Sprite {
  let byKey = parts.get(sprite);
  if (!byKey) parts.set(sprite, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const { width, height } = sprite.buffer;
  const buffer = new PixelBuffer(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (pick(x, y, width, height)) buffer.set(x, y, sprite.buffer.get(x, y));
  const out = { ...sprite, buffer };
  byKey.set(key, out);
  return out;
}

/** The part of an occupied piece drawn in front of the Blobbi (its `OCCUPANCY.front`); the whole sprite for a kind without one. */
export function frontOf(sprite: Sprite, kind: string): Sprite {
  const o = OCCUPANCY[kind];
  return o ? partOf(sprite, `front:${kind}`, o.front) : sprite;
}

/** The two drawables of an occupied piece around a Blobbi drawn at `by`: behind it, and its front over it. */
export function occupiedLayers(sprite: Sprite, kind: string, fx: number, fy: number, by: number): { x: number; y: number; sprite: Sprite; dy: number }[] {
  return [
    { x: fx, y: by - 0.5, sprite, dy: fy - by + 0.5 },
    { x: fx, y: by + 0.25, sprite: frontOf(sprite, kind), dy: fy - by - 0.25 },
  ];
}
