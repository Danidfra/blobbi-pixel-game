/**
 * THE WHALE CARRIER (species constants). A long, gentle giant: a blunt, barnacled head facing the viewer (south),
 * a broad back carrying a LONG, NARROW island along the spine, two very long pectoral fins with knobbly leading
 * edges, twin blowholes in front of the island that spout now and then, a ridge of knuckles behind it, and wide
 * flukes at the far end that rise and fall slowly.
 *
 * Personality: patient, deep-voiced, sings; travels far and straight. Its island is a ridge meadow: long paths,
 * long views, the spout as a landmark. Unlike the turtle (a dome, an oval island, four paddles) everything here is
 * elongated along one axis, and its motion is a slow vertical wave through the tail.
 */
import { Mask, PixelBuffer } from '../core/pixel';
import { hex, mix, type Color } from '../core/color';
import { ramp, type Ramp, type WorldPalette } from '../core/palette';
import { stream } from '../core/rng';
import { clamp } from '../core/math';
import { grow, islandMask, paintIslandTop, paintSea, paintWake, polygonMask, shadeBody, smoothClosed, type IslandTop, type Pt } from './common';

export interface WhaleGenome {
  seed: string;
  /** Body length as a fraction of the scene height, girth (max half width) as a fraction of the length. */
  length: number;
  girth: number;
  /** How blunt the head is (0 pointed .. 1 square). */
  headBlunt: number;
  /** Pectoral fin length (fraction of length), width (fraction of girth) and backward sweep (radians). */
  finLength: number;
  finWidth: number;
  finSweep: number;
  /** Fluke span as a multiple of the girth, and the depth of its middle notch. */
  flukeSpan: number;
  flukeNotch: number;
  /** Knuckles on the ridge behind the island. */
  knuckles: number;
  /** Cosmetic: skin, pale fins or not, barnacle density. */
  skin: Ramp;
  finPale: boolean;
  barnacles: number;
  eye: Color;
}

const WHALE_SKIN = ['#4a6178', '#56687f', '#4b5a6e', '#5b6e7a', '#475a73', '#5a6476'];

export function generateWhaleGenome(seed: string): WhaleGenome {
  const shape = stream(seed, 'whale', 'shape');
  const look = stream(seed, 'whale', 'cosmetic');
  return {
    seed,
    length: shape.range(0.78, 0.86),
    girth: shape.range(0.15, 0.18),
    headBlunt: shape.range(0.55, 0.8),
    finLength: shape.range(0.22, 0.29),
    finWidth: shape.range(0.48, 0.6),
    finSweep: shape.range(0.45, 0.75),
    flukeSpan: shape.range(1.45, 1.8),
    flukeNotch: shape.range(0.12, 0.22),
    knuckles: shape.int(3, 6),
    skin: ramp(hex(look.pick(WHALE_SKIN)), { step: 0.075, hueShift: 6 }),
    finPale: look.chance(0.55),
    barnacles: look.range(0.4, 1),
    eye: hex(look.pick(['#1b1f2a', '#2a1d16'])),
  };
}

export interface WhaleAnatomy {
  genome: WhaleGenome;
  w: number;
  h: number;
  cx: number;
  /** Snout (south) and peduncle (north) y. */
  ySnout: number;
  yTail: number;
  girthPx: number;
  /** Half width along the body, t = 0 snout .. 1 tail stock. */
  half: (t: number) => number;
  y: (t: number) => number;
  blowhole: Pt;
  fins: { side: -1 | 1; base: Pt; length: number; width: number; angle: number }[];
  fluke: { cx: number; cy: number; span: number };
  /** The island on the back (stage 0). */
  island: { cx: number; cy: number; rx: number; ry: number };
}

export function whaleAnatomy(g: WhaleGenome, w: number, h: number): WhaleAnatomy {
  const L = h * g.length * 0.86; // room for the flukes
  const cx = Math.round(w / 2);
  const ySnout = Math.round(h * 0.94);
  const yTail = ySnout - L;
  const G = L * g.girth;
  const y = (t: number) => ySnout - t * (ySnout - yTail);
  const half = (t: number) => {
    if (t < 0.3) return G * (g.headBlunt + (1 - g.headBlunt) * Math.sin((t / 0.3) * (Math.PI / 2)));
    return G * (1 - ((t - 0.3) / 0.7) ** 1.8 * 0.86);
  };
  const finBaseT = 0.27;
  const fins = ([-1, 1] as const).map((side) => ({ side, base: { x: cx + side * half(finBaseT) * 0.92, y: y(finBaseT) }, length: L * g.finLength, width: G * g.finWidth, angle: g.finSweep }));
  return {
    genome: g,
    w,
    h,
    cx,
    ySnout,
    yTail,
    girthPx: G,
    half,
    y,
    blowhole: { x: cx, y: y(0.13) },
    fins,
    fluke: { cx, cy: yTail - G * 0.12, span: G * g.flukeSpan },
    island: { cx, cy: y(0.52), rx: half(0.5) * 0.74, ry: (y(0.33) - y(0.71)) / 2 },
  };
}

/** Movement (pure): the flukes' slow rise and fall, the fins' sway, the spout's cycle. */
export function whalePose(a: WhaleAnatomy, t: number): { fluke: number; finSway: number; spout: number } {
  const fluke = Math.sin((t / 6.5) * Math.PI * 2);
  const finSway = Math.sin((t / 6.5) * Math.PI * 2 + 1.1) * 0.07;
  // Every 11 s the whale breathes: the spout lasts 1.6 s (0..1 through it), else -1.
  const phase = (t + (a.genome.knuckles * 1.7) % 11) % 11;
  return { fluke, finSway, spout: phase < 1.6 ? phase / 1.6 : -1 };
}

/** The body outline (snout cap, both sides). */
function bodyOutline(a: WhaleAnatomy): Pt[] {
  const pts: Pt[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: a.cx - a.half(t), y: a.y(t) });
  }
  pts.push({ x: a.cx, y: a.yTail - 2 });
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    pts.push({ x: a.cx + a.half(t), y: a.y(t) });
  }
  // The rounded snout.
  pts.push({ x: a.cx + a.half(0) * 0.55, y: a.ySnout + a.girthPx * 0.08 });
  pts.push({ x: a.cx, y: a.ySnout + a.girthPx * 0.12 });
  pts.push({ x: a.cx - a.half(0) * 0.55, y: a.ySnout + a.girthPx * 0.08 });
  return smoothClosed(pts, 3);
}

function finPolygon(f: WhaleAnatomy['fins'][number], sway: number): Pt[] {
  const ang = f.angle + sway * f.side;
  // Out to the side and back toward the tail (north): direction in screen space.
  const dx = Math.cos(ang) * f.side;
  const dy = -Math.sin(ang);
  const nx = -dy * f.side;
  const ny = dx * f.side;
  const tip = { x: f.base.x + dx * f.length, y: f.base.y + dy * f.length };
  const pts: Pt[] = [];
  // Leading edge (toward the head) with tubercles; trailing edge smooth.
  const bumps = 5;
  for (let i = 0; i <= bumps * 2; i++) {
    const s = i / (bumps * 2);
    const width = f.width * (1 - s * 0.85) * (i % 2 ? 1.12 : 1);
    pts.push({ x: f.base.x + dx * f.length * s + nx * width * 0.5, y: f.base.y + dy * f.length * s + ny * width * 0.5 });
  }
  pts.push(tip);
  for (let i = 8; i >= 0; i--) {
    const s = i / 8;
    const width = f.width * (1 - s * 0.85);
    pts.push({ x: f.base.x + dx * f.length * s - nx * width * 0.5, y: f.base.y + dy * f.length * s - ny * width * 0.5 });
  }
  return pts;
}

function flukePolygon(a: WhaleAnatomy, lift: number): Pt[] {
  const g = a.genome;
  // Rising flukes come toward the viewer: a little longer and further back; sinking ones foreshorten.
  const k = 1 + 0.12 * lift;
  const { cx, cy, span } = a.fluke;
  const base = cy + 2;
  const depth = a.girthPx * 0.42 * k;
  const pts: Pt[] = [
    { x: cx - a.girthPx * 0.1, y: base },
    { x: cx - span * 0.32, y: base - depth * 0.5 },
    { x: cx - span * 0.5, y: base - depth * 0.95 },
    { x: cx - span * 0.36, y: base - depth * 0.92 },
    { x: cx - span * 0.14, y: base - depth * 0.8 },
    { x: cx, y: base - depth * (0.8 - g.flukeNotch) },
    { x: cx + span * 0.14, y: base - depth * 0.8 },
    { x: cx + span * 0.36, y: base - depth * 0.92 },
    { x: cx + span * 0.5, y: base - depth * 0.95 },
    { x: cx + span * 0.32, y: base - depth * 0.5 },
    { x: cx + a.girthPx * 0.1, y: base },
  ];
  return smoothClosed(pts, 4).map((p) => ({ x: p.x, y: p.y - lift * 2 }));
}

/** Island geometry at a growth stage (0 young .. 3 ancient): the whale's island LENGTHENS along the spine. */
export function whaleIslandAt(a: WhaleAnatomy, stage: number): { cx: number; cy: number; rx: number; ry: number } {
  const s = clamp(stage, 0, 3);
  const i = a.island;
  // Growth runs toward the tail (north): the front edge stays behind the blowholes.
  const ry = i.ry * (1 + 0.12 * s);
  return { cx: i.cx, cy: i.cy - (ry - i.ry), rx: i.rx * (1 + 0.04 * s), ry };
}

export interface WhaleFrame {
  buffer: PixelBuffer;
  body: Mask;
  island: IslandTop;
}

/** Render the whale and its island at time `t` (growth stage for previews only). */
export function renderWhale(a: WhaleAnatomy, t: number, palette: WorldPalette, stage = 0): WhaleFrame {
  const g = a.genome;
  const buf = new PixelBuffer(a.w, a.h);
  const pose = whalePose(a, t);
  paintSea(buf, palette, g.seed, t);
  const body = polygonMask(a.w, a.h, bodyOutline(a));
  const finSkin: Ramp = g.finPale ? ramp(mix(g.skin.mid, hex('#e9eef2'), 0.7), { step: 0.06 }) : g.skin;
  const fins = a.fins.map((f) => polygonMask(a.w, a.h, smoothClosed(finPolygon(f, pose.finSway), 2)));
  const fluke = polygonMask(a.w, a.h, flukePolygon(a, pose.fluke));
  const all = body.clone();
  for (const m of [...fins, fluke]) all.union(m);
  paintWake(buf, all, palette, `${g.seed}|wake`);
  // Fins and flukes under the body's outline.
  for (const m of fins) shadeBody(buf, m, a.cx, a.y(0.3), a.girthPx * 2.2, a.girthPx * 2, finSkin, 0.6);
  shadeBody(buf, fluke, a.fluke.cx, a.fluke.cy, a.fluke.span * 0.6, a.girthPx, g.skin, 0.6);
  shadeBody(buf, body, a.cx, a.y(0.45), a.girthPx * 1.2, (a.ySnout - a.yTail) * 0.55, g.skin, 0.8);
  // The head: barnacle clusters, the eyes at the sides, twin blowholes.
  const marks = stream(g.seed, 'whale', 'barnacles');
  const crust = mix(g.skin.light, hex('#d8d3c6'), 0.6);
  const count = Math.round(26 * g.barnacles);
  for (let i = 0; i < count; i++) {
    const tt = marks.range(0.02, 0.24);
    const side = marks.chance(0.5) ? -1 : 1;
    const x = Math.round(a.cx + side * marks.range(0.2, 0.9) * a.half(tt));
    const y = Math.round(a.y(tt));
    if (!body.get(x, y) || !body.get(x + 1, y)) continue;
    buf.set(x, y, crust);
    if (marks.chance(0.4)) buf.set(x + 1, y, g.skin.dark);
  }
  for (const side of [-1, 1]) {
    const ex = Math.round(a.cx + side * (a.half(0.17) - 2));
    const ey = Math.round(a.y(0.17));
    buf.set(ex, ey, g.eye);
    buf.set(ex - side, ey, g.skin.dark);
  }
  const bh = a.blowhole;
  for (const side of [-1, 1]) {
    buf.set(Math.round(bh.x + side * 2), Math.round(bh.y), g.skin.outline);
    buf.set(Math.round(bh.x + side * 2), Math.round(bh.y) - 1, g.skin.outline);
  }
  // The dorsal line: a lit ridge along the spine, before and behind the island.
  for (let yy = Math.round(a.y(0.2)); yy >= Math.round(a.y(0.92)); yy--) if (body.get(a.cx, yy) && (yy & 1) === 0) buf.set(a.cx, yy, g.skin.light);
  // The ridge knuckles behind the island.
  for (let k = 0; k < g.knuckles; k++) {
    const tt = 0.76 + (k / Math.max(1, g.knuckles - 1)) * 0.14;
    const yy = Math.round(a.y(tt));
    buf.set(a.cx, yy, g.skin.light);
    buf.set(a.cx, yy + 1, g.skin.dark);
  }
  // The island: long and narrow on the spine, its edge a mossy fringe.
  const isl = whaleIslandAt(a, stage);
  const island = islandMask(`${g.seed}|island`, a.w, a.h, isl.cx, isl.cy, isl.rx, isl.ry, grow(body, -3), 0.08);
  paintIslandTop(buf, island, palette, `${g.seed}|top`, mix(g.skin.mid, hex('#5f7d4a'), 0.6), (b, top) => {
    // The ridge path: a worn track along the spine, the whole length of the island.
    for (let yy = Math.round(top.cy - top.ry); yy <= Math.round(top.cy + top.ry); yy++) {
      const x = Math.round(top.cx + Math.sin(yy * 0.09) * 2);
      for (const dx of [0, 1]) if (top.mask.get(x + dx, yy) && top.mask.get(x + dx, yy - 2) && top.mask.get(x + dx, yy + 2)) b.set(x + dx, yy, dx ? palette.path.mid : palette.path.light);
    }
  });
  // The spout: a puff rising from the blowholes, then drops falling around it.
  if (pose.spout >= 0) {
    const p = pose.spout;
    const r = 2 + p * 9;
    const cy = bh.y - 4 - p * 10;
    const spray = stream(g.seed, 'spout', Math.floor(t * 8));
    for (let i = 0; i < 40; i++) {
      const ang = spray.range(0, Math.PI * 2);
      const d = Math.sqrt(spray.range(0, 1)) * r;
      const x = Math.round(bh.x + Math.cos(ang) * d);
      const y = Math.round(cy + Math.sin(ang) * d * 0.8);
      if (spray.range(0, 1) < 1 - p * 0.6) buf.set(x, y, d < r * 0.5 ? hex('#ffffff') : palette.foam);
    }
  }
  return { buffer: buf, body: all, island };
}
