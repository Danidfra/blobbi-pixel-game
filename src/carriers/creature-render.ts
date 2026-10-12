/**
 * DRAWING A CREATURE WORLD'S CARRIER (M7 manta, M8 phase 0 whale). The still core of the body is the world's
 * underlay (painted once into the static layer, under the land); the parts that move are precomputed frames of one
 * beat, drawn over the sea each frame:
 *
 *   manta  the wing tips and the tail whip (one sprite per frame)
 *   whale  the two long fins and the flukes (a small sprite per part per frame, so a long animal costs no more
 *          than a wide one), plus two drawn moments: the spout and a slow blink
 *
 * Pure functions of the world; cached per creature.
 */
import { PixelBuffer, type Mask } from '../core/pixel';
import type { WorldDescription } from '../world/types';
import { mantaBody, MANTA_CORE, MANTA_PERIOD } from './manta';
import { drawWhaleEyes, drawWhaleSpout, whaleBody, whalePose, WHALE_PERIOD } from './whale';
import { paletteFor } from '../world/generate';
import { mantaCore } from './manta-world';
import { whaleCore } from './whale-world';
import type { CreatureInfo } from './creature';

type Sprite = { buffer: PixelBuffer; x: number; y: number };

const underlays = new Map<string, PixelBuffer>();
const partFrames = new Map<string, Sprite[][]>();
export const CREATURE_FRAMES = 12;
/** The whale's beat is slower and longer: more frames, so the flukes glide rather than step. */
export const WHALE_FRAMES = 16;

const keyOf = (world: WorldDescription) => `${world.creature!.species}|${world.creature!.seed}|${world.options.width}x${world.options.height}`;

const coreOf = (c: CreatureInfo): Mask => (c.species === 'whale' ? whaleCore(c.anatomy) : mantaCore(c.anatomy));
const periodOf = (c: CreatureInfo) => (c.species === 'whale' ? WHALE_PERIOD : MANTA_PERIOD);
const framesOf = (c: CreatureInfo) => (c.species === 'whale' ? WHALE_FRAMES : CREATURE_FRAMES);

/** The creature's still core (underlay for the terrain painter), or undefined for a world without a creature. */
export function creatureUnderlay(world: WorldDescription): PixelBuffer | undefined {
  const c = world.creature;
  if (!c) return undefined;
  const key = keyOf(world);
  let hit = underlays.get(key);
  if (!hit) {
    const body = c.species === 'whale' ? whaleBody(c.anatomy, 0).buffer : mantaBody(c.anatomy, 0, 0).buffer;
    const core = coreOf(c);
    hit = new PixelBuffer(world.options.width, world.options.height);
    for (let i = 0; i < hit.data.length; i++) if (core.get(i % hit.width, (i / hit.width) | 0)) hit.data[i] = body.data[i];
    underlays.set(key, hit);
  }
  return hit;
}

/** The manta's moving parts at one moment: wing tips and whip with their own wake, as one trimmed sprite. */
function mantaFrame(world: WorldDescription, c: Extract<CreatureInfo, { species: 'manta' }>, core: Mask, k: number): Sprite[] {
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
  return [{ buffer: t.buffer, x: t.dx, y: t.dy }];
}

/** The whale's moving parts at one moment: each fin and the flukes, with its own wake, as a small sprite each. */
function whaleFrame(world: WorldDescription, c: Extract<CreatureInfo, { species: 'whale' }>, core: Mask, k: number): Sprite[] {
  const body = whaleBody(c.anatomy, (k / WHALE_FRAMES) * WHALE_PERIOD);
  const palette = paletteFor(world.options.palette);
  const out: Sprite[] = [];
  for (const part of [...body.fins, body.fluke]) {
    const box = part.dilate().dilate().dilate().bounds();
    if (!box) continue;
    const buf = new PixelBuffer(box.w, box.h);
    const ring1 = part.dilate();
    const ring2 = ring1.dilate().dilate();
    for (let y = box.y; y < box.y + box.h; y++)
      for (let x = box.x; x < box.x + box.w; x++) {
        if (core.get(x, y)) continue; // the trunk is drawn once, in the underlay
        const j = (y - box.y) * box.w + (x - box.x);
        if (part.get(x, y)) buf.data[j] = body.buffer.data[y * world.options.width + x];
        else if (body.all.get(x, y)) continue; // another part's pixel: that part's own sprite draws it
        else if (ring1.get(x, y)) buf.data[j] = ((x * 7 + y * 3) >> 1) % 3 ? palette.foam : palette.shallow.light;
        else if (ring2.get(x, y)) buf.data[j] = palette.shallow.mid;
      }
    const t = buf.trimmed();
    if (t.buffer.width && t.buffer.height) out.push({ buffer: t.buffer, x: box.x + t.dx, y: box.y + t.dy });
  }
  return out;
}

/** One beat of the moving parts, as trimmed sprites per frame. */
export function creatureParts(world: WorldDescription): Sprite[][] {
  const c = world.creature!;
  const key = keyOf(world);
  let frames = partFrames.get(key);
  if (!frames) {
    const core = coreOf(c);
    frames = [];
    for (let k = 0; k < framesOf(c); k++) frames.push(c.species === 'whale' ? whaleFrame(world, c, core, k) : mantaFrame(world, c, core, k));
    partFrames.set(key, frames);
  }
  return frames;
}

/** Draw the moving parts at `time` into a frame whose top-left is world (ox, oy). */
export function drawCreatureParts(frame: PixelBuffer, world: WorldDescription, ox: number, oy: number, time: number): void {
  const c = world.creature!;
  const frames = creatureParts(world);
  const period = periodOf(c);
  const n = frames.length;
  const k = Math.floor(((((time % period) + period) % period) / period) * n) % n;
  for (const f of frames[k]) frame.blit(f.buffer, f.x - ox, f.y - oy);
  if (c.species === 'whale') {
    // The whale's moments: a slow blink just after each breath, and the spout.
    if (whalePose(c.anatomy, time).blink) drawWhaleEyes(frame, c.anatomy, true, ox, oy);
    drawWhaleSpout(frame, c.anatomy, time, paletteFor(world.options.palette).foam, ox, oy);
  }
}
