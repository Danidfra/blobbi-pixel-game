/**
 * DRAWING A CREATURE WORLD'S CARRIER (M7: the manta). The still core of the body is the world's underlay (painted
 * once into the static layer, under the land); the wing tips and the tail whip move, so they are precomputed frames
 * of one wing-beat, drawn over the sea each frame. Pure functions of the world; cached per creature.
 */
import { PixelBuffer } from '../core/pixel';
import type { WorldDescription } from '../world/types';
import { mantaBody, MANTA_CORE, MANTA_PERIOD } from './manta';
import { paletteFor } from '../world/generate';
import { mantaCore } from './manta-world';

const underlays = new Map<string, PixelBuffer>();
const partFrames = new Map<string, { buffer: PixelBuffer; x: number; y: number }[]>();
export const CREATURE_FRAMES = 12;

const keyOf = (world: WorldDescription) => `${world.creature!.seed}|${world.options.width}x${world.options.height}`;

/** The creature's still core (underlay for the terrain painter), or undefined for a world without a creature. */
export function creatureUnderlay(world: WorldDescription): PixelBuffer | undefined {
  const c = world.creature;
  if (!c) return undefined;
  const key = keyOf(world);
  let hit = underlays.get(key);
  if (!hit) {
    const body = mantaBody(c.anatomy, 0, 0);
    const core = mantaCore(c.anatomy);
    hit = new PixelBuffer(world.options.width, world.options.height);
    for (let i = 0; i < hit.data.length; i++) if (core.get(i % hit.width, (i / hit.width) | 0)) hit.data[i] = body.buffer.data[i];
    underlays.set(key, hit);
  }
  return hit;
}

/** One wing-beat of the moving parts (wing tips and tail whip), as trimmed sprites. */
export function creatureParts(world: WorldDescription): { buffer: PixelBuffer; x: number; y: number }[] {
  const c = world.creature!;
  const key = keyOf(world);
  let frames = partFrames.get(key);
  if (!frames) {
    const core = mantaCore(c.anatomy);
    frames = [];
    for (let k = 0; k < CREATURE_FRAMES; k++) {
      const body = mantaBody(c.anatomy, (k / CREATURE_FRAMES) * MANTA_PERIOD);
      const W = world.options.width;
      const full = new PixelBuffer(W, world.options.height);
      const palette = paletteFor(world.options.palette);
      // Its own wake: a light ring and broken foam hugging the moving parts, so the foam moves with the wing.
      const ring1 = body.all.dilate();
      const ring2 = ring1.dilate().dilate();
      const moving = (x: number, y: number) => !core.get(x, y);
      for (let i = 0; i < full.data.length; i++) {
        const x = i % W;
        const y = (i / W) | 0;
        if (body.all.get(x, y)) {
          if (moving(x, y)) full.data[i] = body.buffer.data[i];
          continue;
        }
        // Only round the moving parts, and never over the still core's own sea bands.
        const nearMoving = Math.abs(x + 0.5 - c.anatomy.cx) > c.anatomy.S * MANTA_CORE - 2 || y < c.anatomy.cy - c.anatomy.C * 0.36;
        if (!nearMoving) continue;
        if (ring1.get(x, y)) full.data[i] = ((x * 7 + y * 3) >> 1) % 3 ? palette.foam : palette.shallow.light;
        else if (ring2.get(x, y)) full.data[i] = palette.shallow.mid;
      }
      const t = full.trimmed();
      frames.push({ buffer: t.buffer, x: t.dx, y: t.dy });
    }
    partFrames.set(key, frames);
  }
  return frames;
}

/** Draw the moving parts at `time` into a frame whose top-left is world (ox, oy). */
export function drawCreatureParts(frame: PixelBuffer, world: WorldDescription, ox: number, oy: number, time: number): void {
  const frames = creatureParts(world);
  const k = Math.floor((((time % MANTA_PERIOD) + MANTA_PERIOD) % MANTA_PERIOD) / MANTA_PERIOD * CREATURE_FRAMES) % CREATURE_FRAMES;
  const f = frames[k];
  frame.blit(f.buffer, f.x - ox, f.y - oy);
}
