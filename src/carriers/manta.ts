/**
 * THE MANTA CARRIER (species constants). A wide, flat, graceful glider: a broad diamond of a body with long
 * swept-back wing tips, two cephalic horns curling forward at the head (south, toward the viewer), a long thin tail
 * whip behind, pale shoulder chevrons and a few spots that are this individual's own (as real mantas are known by
 * theirs). Its island is WIDE and FLAT across the central disc, with tide pools where the land meets the wings.
 *
 * Personality: curious, playful, quiet; drifts in wide circles and loves the shallows. Unlike the turtle (dome,
 * paddles) and the whale (long body, tail wave), the manta moves by a slow wave travelling out along its wings: the
 * tips rise and fall while the middle (and the island) stays level.
 */
import { Mask, PixelBuffer } from '../core/pixel';
import { hex, mix, type Color } from '../core/color';
import { ramp, type Ramp, type WorldPalette } from '../core/palette';
import { stream } from '../core/rng';
import { clamp } from '../core/math';
import { grow, islandMask, paintIslandTop, paintSea, paintWake, polygonMask, shadeBody, smoothClosed, valueNoise, type IslandTop, type Pt } from './common';

/** The share of the half-span that never moves (the island rests on it); the wings beyond it rise and fall. */
export const MANTA_CORE = 0.74;

export interface MantaGenome {
  seed: string;
  /** Wingspan as a fraction of the scene width; chord (front to back) as a fraction of the span. */
  span: number;
  chord: number;
  /** How far back the wing tips sweep (fraction of the chord). */
  sweep: number;
  /** Cephalic horn length (fraction of the chord) and how much they curl in. */
  horn: number;
  curl: number;
  /** Tail whip length (fraction of the chord). */
  tail: number;
  /** Cosmetic: skin, the shoulder chevrons' size, its own spots. */
  skin: Ramp;
  chevron: number;
  spots: { u: number; v: number; r: number }[];
  pale: Color;
  eye: Color;
}

const MANTA_SKIN = ['#2e3a4f', '#33384a', '#2b3f48', '#3d3550', '#283848', '#353c3a'];

export function generateMantaGenome(seed: string): MantaGenome {
  const shape = stream(seed, 'manta', 'shape');
  const look = stream(seed, 'manta', 'cosmetic');
  const skin = ramp(hex(look.pick(MANTA_SKIN)), { step: 0.08, hueShift: 6 });
  return {
    seed,
    span: shape.range(0.84, 0.93),
    chord: shape.range(0.44, 0.52),
    sweep: shape.range(0.14, 0.26),
    horn: shape.range(0.12, 0.17),
    curl: shape.range(0.2, 0.5),
    tail: shape.range(0.55, 0.85),
    skin,
    chevron: look.range(0.75, 1.15),
    spots: Array.from({ length: look.int(3, 8) }, () => ({ u: look.range(-0.32, 0.32), v: look.range(-0.05, 0.25), r: look.range(0.8, 1.8) })),
    pale: mix(skin.light, hex('#e6ece8'), look.range(0.5, 0.7)),
    eye: hex('#11141c'),
  };
}

export interface MantaAnatomy {
  genome: MantaGenome;
  w: number;
  h: number;
  cx: number;
  cy: number;
  /** Half span and chord in pixels. */
  S: number;
  C: number;
  island: { cx: number; cy: number; rx: number; ry: number };
}

export function mantaAnatomy(g: MantaGenome, w: number, h: number): MantaAnatomy {
  const S = (w * g.span) / 2;
  const C = S * 2 * g.chord;
  const cx = Math.round(w / 2);
  const cy = Math.round(h * 0.47);
  return { genome: g, w, h, cx, cy, S, C, island: { cx, cy: cy - C * 0.06, rx: S * 0.38, ry: C * 0.21 } };
}

/** Movement (pure): the wave out along the wings (tips rise and fall), the tail whip's sway. */
/** One wing-beat, seconds (the tail whip sways twice per beat, so a beat loops seamlessly). */
export const MANTA_PERIOD = 3.6;

export function mantaPose(_a: MantaAnatomy, t: number): { wing: number; tail: number } {
  return { wing: Math.sin((t / MANTA_PERIOD) * Math.PI * 2), tail: ((t / MANTA_PERIOD) * Math.PI * 4) / 1.7 };
}

/** A point on the body outline in (u, v): u across (-1 .. 1, the tips), v along (+ is forward, south). */
function outline(a: MantaAnatomy, wing: number): Pt[] {
  const g = a.genome;
  // Raised tips come toward the viewer and swing a little back; lowered ones fall forward and in.
  // Only the wings beyond the core move (|u| > MANTA_CORE): the disc that carries the island never does.
  const lift = (u: number) => Math.max(0, (Math.abs(u) - MANTA_CORE) / (1 - MANTA_CORE)) ** 2 * wing;
  const P = (u: number, v: number): Pt => ({ x: a.cx + u * a.S * (1 - 0.07 * Math.abs(lift(u))), y: a.cy + (v + lift(u) * 0.17) * a.C });
  const half: [number, number][] = [
    [0.1, 0.46], // beside the mouth (front, south)
    [0.24, 0.4],
    [0.46, 0.27],
    [0.72, 0.08],
    [1.0, -g.sweep], // the tip, swept back (north)
    [0.84, -g.sweep - 0.06],
    [0.6, -0.2],
    [0.32, -0.3],
    [0.12, -0.36],
  ];
  const pts: Pt[] = [];
  for (const [u, v] of half) pts.push(P(-u, v));
  pts.push(P(0, -0.33)); // the notch at the tail root
  for (const [u, v] of [...half].reverse()) pts.push(P(u, v));
  pts.push(P(0, 0.44)); // the mouth's middle
  return smoothClosed(pts, 4);
}

/** Island geometry at a growth stage (0..3): the manta's island WIDENS across the disc, toward the wings. */
export function mantaIslandAt(a: MantaAnatomy, stage: number): { cx: number; cy: number; rx: number; ry: number } {
  const s = clamp(stage, 0, 3);
  const i = a.island;
  return { cx: i.cx, cy: i.cy, rx: i.rx * (1 + 0.14 * s), ry: i.ry * (1 + 0.04 * s) };
}

export interface MantaFrame {
  buffer: PixelBuffer;
  body: Mask;
  island: IslandTop;
}

export interface MantaBody {
  /** The body alone (transparent elsewhere): disc, horns, whip, markings, eyes, mouth. */
  buffer: PixelBuffer;
  /** The disc (wings and body), the horns and the whip, and all three together. */
  disc: Mask;
  all: Mask;
}

/** Draw the manta's body at time `t` (the wings at their pose), on its own transparent layer. */
export function mantaBody(a: MantaAnatomy, t: number, wing = mantaPose(a, t).wing): MantaBody {
  const g = a.genome;
  const buf = new PixelBuffer(a.w, a.h);
  const pose = mantaPose(a, t);
  const body = polygonMask(a.w, a.h, outline(a, wing));
  // The tail whip: a thin line trailing behind (north), swaying more toward its end.
  const whip = new Mask(a.w, a.h);
  const tailLen = a.C * g.tail;
  for (let i = 0; i <= tailLen; i++) {
    const s = i / tailLen;
    const x = Math.round(a.cx + Math.sin(pose.tail * 1.7 + s * 3) * s * s * 4);
    const y = Math.round(a.cy - a.C * 0.34 - i);
    whip.set(x, y);
    if (s < 0.3) whip.set(x + 1, y);
  }
  // Horns: two lobes reaching forward (south) from the mouth's corners, curling in.
  const horns = new Mask(a.w, a.h);
  for (const side of [-1, 1]) {
    const bx = a.cx + side * a.S * 0.14;
    const by = a.cy + a.C * 0.42;
    const len = a.C * g.horn;
    for (let i = 0; i <= len; i++) {
      const s = i / len;
      const x = bx - side * g.curl * s * s * len * 0.6;
      const y = by + i;
      const r = 2.2 * (1 - s * 0.6);
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) if (Math.abs(dx) <= r) horns.set(Math.round(x + dx), Math.round(y));
    }
  }
  const all = body.clone();
  all.union(horns);
  all.union(whip);
  buf.paintMask(whip, g.skin.dark);
  shadeBody(buf, horns, a.cx, a.cy + a.C * 0.4, a.S * 0.3, a.C * 0.2, g.skin, 0.5);
  shadeBody(buf, body, a.cx, a.cy, a.S * 0.85, a.C * 0.75, g.skin, 0.6);
  const edge = body.edge();
  // The wings' leading edges catch the light: a lit line just inside the front (south) edge.
  buf.paintMaskWith(grow(body, -1).edge(), (x, y) => (y > a.cy + a.C * 0.05 && !body.get(x, y + 2) ? g.skin.light : undefined));
  // Shoulder chevrons: pale bands on the front of each wing, with a dithered back edge.
  buf.paintMaskWith(body, (x, y) => {
    const u = (x + 0.5 - a.cx) / a.S;
    const v = (y + 0.5 - a.cy) / a.C;
    const au = Math.abs(u);
    if (au < 0.1 || au > 0.52 || edge.get(x, y)) return undefined;
    // A swath following the leading edge, thickest in its middle, tapering to points at both ends.
    const front = 0.33 - au * 0.4;
    const thick = 0.1 * g.chevron * Math.sin(((au - 0.1) / 0.42) * Math.PI) ** 0.7;
    const back = front - thick;
    if (v < front && v > back) return front - v < 0.025 || v - back < 0.02 ? ((x + y) % 2 ? g.skin.light : g.pale) : g.pale;
    return undefined;
  });
  // Its own spots, on the disc behind the chevrons.
  for (const sp of g.spots) {
    const x = Math.round(a.cx + sp.u * a.S);
    const y = Math.round(a.cy + sp.v * a.C + a.C * 0.05);
    const m = new Mask(a.w, a.h);
    m.fillEllipse(x, y, sp.r, sp.r);
    buf.paintMaskWith(m, (px, py) => (body.get(px, py) ? g.skin.dark : undefined));
  }
  // Eyes at the sides of the head, just behind the horns.
  for (const side of [-1, 1]) {
    const ex = Math.round(a.cx + side * a.S * 0.2);
    const ey = Math.round(a.cy + a.C * 0.34);
    buf.set(ex, ey, g.eye);
    buf.set(ex, ey - 1, g.skin.light);
  }
  // The mouth: a dark line between the horns.
  buf.hline(Math.round(a.cx - a.S * 0.1), Math.round(a.cx + a.S * 0.1), Math.round(a.cy + a.C * 0.43), g.skin.outline);
  return { buffer: buf, disc: body, all };
}

export function renderManta(a: MantaAnatomy, t: number, palette: WorldPalette, stage = 0): MantaFrame {
  const g = a.genome;
  const buf = new PixelBuffer(a.w, a.h);
  paintSea(buf, palette, g.seed, t);
  const m = mantaBody(a, t);
  const body = m.disc;
  const all = m.all;
  paintWake(buf, all, palette, `${g.seed}|wake`);
  buf.blit(m.buffer, 0, 0);
  // The island: wide and flat, a sandy fringe, tide pools where it meets the wings.
  const isl = mantaIslandAt(a, stage);
  const island = islandMask(`${g.seed}|island`, a.w, a.h, isl.cx, isl.cy, isl.rx, isl.ry, grow(body, -4), 0.14);
  paintIslandTop(buf, island, palette, `${g.seed}|top`, palette.sand.light, (b, top) => {
    const pools = stream(g.seed, 'manta', 'pools');
    for (const side of [-1, 1]) {
      const px = Math.round(top.cx + side * top.rx * pools.range(0.68, 0.8));
      const py = Math.round(top.cy + pools.range(-0.25, 0.25) * top.ry);
      const pm = new Mask(a.w, a.h);
      pm.fillEllipse(px, py, pools.range(3, 5), pools.range(2, 3));
      b.paintMaskWith(pm, (x, y) => (top.mask.get(x, y) ? (valueNoise(g.seed, x, y + t, 2) > 0.8 ? palette.shallow.light : palette.shallow.mid) : undefined));
      b.paintMaskWith(pm.edge(), (x, y) => (top.mask.get(x, y) ? palette.sand.mid : undefined));
    }
  });
  return { buffer: buf, body: all, island };
}
