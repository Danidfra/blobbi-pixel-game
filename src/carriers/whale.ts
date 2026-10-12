/**
 * THE WHALE CARRIER (species constants). A long, gentle giant lying along the sea, its blunt, barnacled head to
 * the east: a broad back carrying a LONG, NARROW island along the spine, two very long pectoral fins with knobbly
 * leading edges sweeping back from the shoulders, twin blowholes in front of the island that spout now and then, a
 * ridge of knuckles behind it, and wide flukes at the far (west) end that rise and fall slowly.
 *
 * Personality: patient, deep-voiced, sings; travels far and straight. Its island is a ridge meadow: long paths,
 * long views, a mossy fringe where the land meets the skin, the spout as a landmark. Unlike the turtle (a dome, an
 * oval island, four paddles) and the manta (a wide disc, wing tips), everything here is elongated along one axis,
 * and its motion is a slow wave through the tail.
 *
 * Geometry is written in the body's own frame: `s` runs along the spine from the snout (0) to the tail stock (1),
 * `u` across it in pixels (negative north). `P(s, u)` places a body point on the scene. (M8 phase 0: the whale lies
 * east-west so its long island fits a wide screen; before, as a preview only, it faced south.)
 */
import { Mask, PixelBuffer } from '../core/pixel';
import { hex, mix, type Color } from '../core/color';
import { ramp, type Ramp, type WorldPalette } from '../core/palette';
import { stream } from '../core/rng';
import { clamp } from '../core/math';
import { grow, islandMask, paintIslandTop, paintSea, paintWake, polygonMask, shadeBody, smoothClosed, valueNoise, type IslandTop, type Pt } from './common';

export interface WhaleGenome {
  seed: string;
  /** Body length as a fraction of the scene width (at most: tall fins may shorten it), girth (max half width) as a fraction of the length. */
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
  /** Cosmetic (drawn after the rest, so older genomes keep their values): pale skin mottling, knobs on the head, scars. */
  mottle: number;
  knobs: number;
  scars: number;
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
    mottle: look.range(0.2, 0.9),
    knobs: look.int(5, 10),
    scars: look.int(0, 3),
  };
}

export interface WhaleFin {
  side: -1 | 1;
  base: Pt;
  length: number;
  width: number;
  angle: number;
}

export interface WhaleAnatomy {
  genome: WhaleGenome;
  w: number;
  h: number;
  /** The spine's y; the snout's x (east) and the tail stock's x (west); the body length and girth in pixels. */
  cy: number;
  xSnout: number;
  xTail: number;
  L: number;
  girthPx: number;
  /** Half width along the body, s = 0 snout .. 1 tail stock. */
  half: (s: number) => number;
  /** x of a point along the spine. */
  x: (s: number) => number;
  /** A body point: `s` along, `u` across (pixels, negative north). */
  P: (s: number, u: number) => Pt;
  blowhole: Pt;
  /** The head's centre (in front of it, on the island, is where one listens). */
  head: Pt;
  fins: WhaleFin[];
  fluke: { cx: number; cy: number; span: number };
  /** The island on the back (stage 0, previews). */
  island: { cx: number; cy: number; rx: number; ry: number };
}

/** The share of the body length the flukes reach beyond the tail stock (for fitting the scene). */
const FLUKE_REACH = 0.1;

export function whaleAnatomy(g: WhaleGenome, w: number, h: number): WhaleAnatomy {
  // The longest body that fits: the scene's width, and its height across the fins (swept back, they still reach
  // out a long way to either side).
  const across = g.girth + g.finLength * Math.cos(g.finSweep) + g.girth * g.finWidth * 0.6 + 0.015;
  const L = Math.min(w * g.length * 0.86, (h * 0.47) / across);
  const G = L * g.girth;
  const cy = Math.round(h / 2);
  // Centre the whole animal (snout cap to fluke tips) across the scene.
  const extent = L * (1 + FLUKE_REACH) + G * 0.12;
  const xSnout = Math.round(w / 2 + extent / 2 - G * 0.12);
  const xTail = xSnout - L;
  const x = (s: number) => xSnout - s * L;
  const P = (s: number, u: number): Pt => ({ x: x(s), y: cy + u });
  const half = (s: number) => {
    // A broad, flat rostrum tapering to a rounded tip (seen from above), blunter on some whales than others.
    const tip = 0.3 + 0.3 * g.headBlunt;
    if (s < 0.3) return G * (tip + (1 - tip) * Math.sin((s / 0.3) * (Math.PI / 2)));
    return G * (1 - ((s - 0.3) / 0.7) ** 1.8 * 0.86);
  };
  const finBase = 0.27;
  const fins = ([-1, 1] as const).map((side) => ({ side, base: P(finBase, side * half(finBase) * 0.92), length: L * g.finLength, width: G * g.finWidth, angle: g.finSweep }));
  return {
    genome: g,
    w,
    h,
    cy,
    xSnout,
    xTail,
    L,
    girthPx: G,
    half,
    x,
    P,
    blowhole: P(0.13, 0),
    head: P(0.08, 0),
    fins,
    fluke: { cx: xTail - G * 0.12, cy, span: G * g.flukeSpan * 1.15 },
    island: { cx: x(0.53), cy, rx: (x(0.3) - x(0.76)) / 2, ry: half(0.53) * 0.7 },
  };
}

/** One fluke beat, seconds: the flukes and the fins move on it, so a beat loops seamlessly. */
export const WHALE_PERIOD = 6.5;
/** The whale breathes (and spouts) every this many seconds. */
export const WHALE_BREATH = 11;

/** Movement (pure): the flukes' slow rise and fall, the fins' sway, the spout's cycle, the eyes' slow blink. */
export function whalePose(a: WhaleAnatomy, t: number): { fluke: number; finSway: number; spout: number; blink: boolean } {
  const fluke = Math.sin((t / WHALE_PERIOD) * Math.PI * 2);
  const finSway = Math.sin((t / WHALE_PERIOD) * Math.PI * 2 + 1.1) * 0.07;
  // Every 11 s the whale breathes: the spout lasts 1.6 s (0..1 through it), else -1.
  const phase = (((t + ((a.genome.knuckles * 1.7) % WHALE_BREATH)) % WHALE_BREATH) + WHALE_BREATH) % WHALE_BREATH;
  // It closes its eyes for a moment just after each breath.
  return { fluke, finSway, spout: phase < 1.6 ? phase / 1.6 : -1, blink: phase > 2 && phase < 2.3 };
}

/** The body outline: both flanks and the rounded snout cap. */
function bodyOutline(a: WhaleAnatomy): Pt[] {
  const pts: Pt[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) pts.push(a.P(i / n, -a.half(i / n)));
  pts.push(a.P(1, 0));
  pts.push({ x: a.xTail - 2, y: a.cy });
  for (let i = n; i >= 0; i--) pts.push(a.P(i / n, a.half(i / n)));
  // The rounded snout, bulging forward (east).
  const G = a.girthPx;
  pts.push({ x: a.xSnout + G * 0.1, y: a.cy + a.half(0) * 0.6 });
  pts.push({ x: a.xSnout + G * 0.16, y: a.cy });
  pts.push({ x: a.xSnout + G * 0.1, y: a.cy - a.half(0) * 0.6 });
  return smoothClosed(pts, 3);
}

function finPolygon(f: WhaleFin, sway: number): Pt[] {
  // Out to its side and back toward the tail (west), bending further back toward the tip (a long, curved wing);
  // the leading edge faces the head (east).
  const at = (s: number, off: number): Pt => {
    // Integrate the bending axis in a few steps (cheap, smooth).
    let x = f.base.x;
    let y = f.base.y;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const ang = f.angle + sway * f.side + 0.45 * ((i + 0.5) / n) * s;
      x += (-Math.sin(ang) * f.length * s) / n;
      y += (Math.cos(ang) * f.side * f.length * s) / n;
    }
    const ang = f.angle + sway * f.side + 0.45 * s;
    return { x: x + Math.cos(ang) * off, y: y + f.side * Math.sin(ang) * off };
  };
  const pts: Pt[] = [];
  // Leading edge with tubercles (knobs); trailing edge smooth.
  const bumps = 6;
  for (let i = 0; i <= bumps * 2; i++) {
    const s = i / (bumps * 2);
    const width = f.width * (1 - s * 0.8) * (0.55 + 0.45 * Math.sin(Math.min(1, s * 4) * Math.PI / 2)) * (i % 2 ? 1.1 : 1);
    pts.push(at(s, width * 0.5));
  }
  pts.push(at(1.04, 0));
  for (let i = 10; i >= 0; i--) {
    const s = i / 10;
    const width = f.width * (1 - s * 0.8) * (0.55 + 0.45 * Math.sin(Math.min(1, s * 4) * Math.PI / 2));
    pts.push(at(s, -width * 0.5));
  }
  return pts;
}

/** Fins: lit along the leading edge (the knobbly one), darker toward the trailing edge. */
function shadeFin(buf: PixelBuffer, m: Mask, f: WhaleFin, r: Ramp): void {
  const ang = f.angle + 0.2;
  const nx = Math.cos(ang);
  const ny = f.side * Math.sin(ang);
  buf.paintMaskWith(m, (x, y) => {
    const lead = ((x + 0.5 - f.base.x) * nx + (y + 0.5 - f.base.y) * ny) / (f.width * 0.5);
    const north = f.side < 0 ? 0.12 : -0.05;
    const score = 0.4 + lead * 0.35 + north;
    return score > 0.62 ? r.light : score > 0.25 ? r.mid : r.dark;
  });
  buf.paintMask(m.edge(), r.outline);
}

function flukePolygon(a: WhaleAnatomy, lift: number): Pt[] {
  const g = a.genome;
  // Rising flukes come toward the viewer: a little longer and further back (west); sinking ones foreshorten.
  const k = 1 + 0.12 * lift;
  const { cx, cy, span } = a.fluke;
  const base = cx + 2;
  const depth = a.girthPx * 0.42 * k;
  // (back, across) pairs: `back` toward the west, `across` north (-) to south (+).
  const half: [number, number][] = [
    [0, a.girthPx * 0.1],
    [depth * 0.5, span * 0.32],
    [depth * 0.95, span * 0.5],
    [depth * 0.92, span * 0.36],
    [depth * 0.8, span * 0.14],
  ];
  const pts: Pt[] = [];
  for (const [b, u] of [...half].reverse()) pts.push({ x: base - b, y: cy - u });
  pts.push({ x: base - depth * (0.8 - g.flukeNotch), y: cy });
  for (const [b, u] of half) pts.push({ x: base - b, y: cy + u });
  return smoothClosed(pts, 4).map((p) => ({ x: p.x - lift * 2, y: p.y }));
}

/** Island geometry at a growth stage (previews; 0 young .. 3 ancient): the whale's island LENGTHENS toward the tail. */
export function whaleIslandAt(a: WhaleAnatomy, stage: number): { cx: number; cy: number; rx: number; ry: number } {
  const s = clamp(stage, 0, 3);
  const i = a.island;
  // Growth runs toward the tail (west): the front edge stays behind the blowholes.
  const rx = i.rx * (1 + 0.12 * s);
  return { cx: i.cx - (rx - i.rx), cy: i.cy, rx, ry: i.ry * (1 + 0.04 * s) };
}

export interface WhaleBody {
  /** The body alone (transparent elsewhere): fins, flukes, the body, its markings. */
  buffer: PixelBuffer;
  /** The trunk (snout to tail stock), each fin, the flukes, and all of them together. */
  trunk: Mask;
  fins: Mask[];
  fluke: Mask;
  all: Mask;
}

/**
 * The trunk as a long lit cylinder: the light (from the north, as everywhere) catches the upper flank and the spine,
 * the lower flank falls into shadow, and the head's rostrum is a touch paler. Banded like every other form.
 */
function shadeTrunk(buf: PixelBuffer, a: WhaleAnatomy, trunk: Mask): void {
  const r = a.genome.skin;
  buf.paintMaskWith(trunk, (x, y) => {
    const s = clamp((a.xSnout - (x + 0.5)) / a.L, 0, 1);
    const v = clamp((y + 0.5 - a.cy) / Math.max(4, a.half(s)), -1, 1);
    const round = Math.sqrt(1 - v * v);
    const score = round * 0.62 - v * 0.3 + 0.1 * clamp(1 - s / 0.22, 0, 1) - 0.1 * clamp((s - 0.8) / 0.2, 0, 1);
    return score > 0.74 ? r.highlight : score > 0.42 ? r.light : score > 0.08 ? r.mid : r.dark;
  });
  buf.paintMask(trunk.edge(), r.outline);
}

/** Draw the whale's body at time `t` (fins and flukes at their pose), on its own transparent layer. */
export function whaleBody(a: WhaleAnatomy, t: number): WhaleBody {
  const g = a.genome;
  const buf = new PixelBuffer(a.w, a.h);
  const pose = whalePose(a, t);
  const trunk = polygonMask(a.w, a.h, bodyOutline(a));
  const finSkin: Ramp = g.finPale ? ramp(mix(g.skin.mid, hex('#e9eef2'), 0.7), { step: 0.06 }) : g.skin;
  const fins = a.fins.map((f) => polygonMask(a.w, a.h, smoothClosed(finPolygon(f, pose.finSway), 2)));
  const fluke = polygonMask(a.w, a.h, flukePolygon(a, pose.fluke));
  const all = trunk.clone();
  for (const m of [...fins, fluke]) all.union(m);
  // Fins and flukes under the body's outline; rising flukes catch more light.
  const G = a.girthPx;
  fins.forEach((m, i) => shadeFin(buf, m, a.fins[i], finSkin));
  shadeBody(buf, fluke, a.fluke.cx - G * 0.2, a.fluke.cy, G, a.fluke.span * 0.6, g.skin, 0.6 - pose.fluke * 0.12);
  shadeTrunk(buf, a, trunk);
  // Pale mottling over the back, its own pattern.
  const crust = mix(g.skin.light, hex('#d8d3c6'), 0.6);
  buf.paintMaskWith(grow(trunk, -2), (x, y) => (valueNoise(`${g.seed}|mottle`, x, y, 4) > 0.86 - g.mottle * 0.1 && (x + y) % 2 === 0 ? mix(g.skin.mid, g.skin.light, 0.7) : undefined));
  // Details are sized to the animal (a preview whale is a quarter the size of a world's).
  const k = detailScale(a);
  const dot = (x: number, y: number, r: number, c: Color) => {
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) if (dx * dx + dy * dy <= r * r + 0.3 && trunk.get(Math.round(x + dx), Math.round(y + dy))) buf.set(Math.round(x + dx), Math.round(y + dy), c);
  };
  // The head: barnacle clusters, pale crust with a shadow under each, mostly on the rostrum and round the mouth.
  const marks = stream(g.seed, 'whale', 'barnacles');
  const count = Math.round(26 * g.barnacles);
  for (let i = 0; i < count; i++) {
    const s = marks.range(0.02, 0.24);
    const side = marks.chance(0.5) ? -1 : 1;
    const p = a.P(s, side * marks.range(0.2, 0.9) * a.half(s));
    if (!trunk.get(Math.round(p.x), Math.round(p.y))) continue;
    const n = 1 + marks.int(0, Math.round(2 * k));
    for (let j = 0; j < n; j++) {
      const x = p.x + marks.range(-1.5, 1.5) * k;
      const y = p.y + marks.range(-1.5, 1.5) * k;
      dot(x, y + 1, 0.5 * k, g.skin.dark);
      dot(x, y, 0.45 * k, crust);
    }
  }
  // Knobs (tubercles) in rows down the rostrum: little lit bumps, each with its shadow.
  const knobs = stream(g.seed, 'whale', 'knobs');
  for (let i = 0; i < g.knobs; i++) {
    const p = a.P(0.015 + (i / g.knobs) * 0.11, (i % 2 ? 1 : -1) * knobs.range(0.12, 0.38) * a.half(0.05));
    dot(p.x, p.y + 0.6 * k, 0.8 * k, g.skin.dark);
    dot(p.x, p.y, 0.7 * k, g.skin.light);
  }
  // Old scars: thin pale strokes on the flanks.
  const scars = stream(g.seed, 'whale', 'scars');
  for (let i = 0; i < g.scars; i++) {
    const s = scars.range(0.3, 0.75);
    const side = scars.chance(0.5) ? -1 : 1;
    const p = a.P(s, side * a.half(s) * scars.range(0.55, 0.85));
    const len = Math.round(scars.range(5, 9) * k);
    for (let j = 0; j < len; j++) {
      const x = Math.round(p.x) - j;
      const y = Math.round(p.y + (j / len) * 2 * k * side);
      if (trunk.get(x, y)) buf.set(x, y, crust);
    }
  }
  // The mouth: a long line curving along each side of the head, from the snout tip back below the eye, with a lit
  // lip above it.
  for (const side of [-1, 1]) {
    let prev: Pt | null = null;
    for (let x = Math.round(a.xSnout); x >= Math.round(a.x(0.19)); x--) {
      const s = (a.xSnout - x) / a.L;
      const y = Math.round(a.cy + side * a.half(s) * (0.7 + (s / 0.19) * 0.18));
      const y0 = prev ? Math.min(prev.y, y) : y;
      const y1 = prev ? Math.max(prev.y, y) : y;
      for (let yy = y0; yy <= y1; yy++) if (trunk.get(x, yy) && trunk.get(x, yy + side * 2)) buf.set(x, yy, g.skin.outline);
      if (trunk.get(x, y - side)) buf.set(x, y - side, g.skin.light);
      prev = { x, y };
    }
  }
  drawWhaleEyes(buf, a, false);
  // Twin blowholes: two dark slits in a little raised splash guard.
  const bh = a.blowhole;
  dot(bh.x + 1, bh.y, 2.6 * k, g.skin.light);
  for (const side of [-1, 1])
    for (let j = 0; j < Math.round(3 * k); j++) buf.set(Math.round(bh.x) - j, Math.round(bh.y + side * (k + j * 0.25)), g.skin.outline);
  // The dorsal line: a lit ridge along the spine, and the knuckles near the tail.
  for (let xx = Math.round(a.x(0.2)); xx >= Math.round(a.x(0.96)); xx--) if (trunk.get(xx, a.cy) && (xx & 1) === 0) buf.set(xx, a.cy, g.skin.light);
  for (let j = 0; j < g.knuckles; j++) {
    const p = a.P(0.84 + (j / Math.max(1, g.knuckles - 1)) * 0.1, 0);
    dot(p.x, p.y + 0.7 * k, 1.1 * k, g.skin.dark);
    dot(p.x, p.y, 1 * k, g.skin.light);
  }
  return { buffer: buf, trunk, fins, fluke, all };
}

/** The eyes at the sides of the head (closed: a line of skin). */
export function drawWhaleEyes(buf: PixelBuffer, a: WhaleAnatomy, closed: boolean, ox = 0, oy = 0): void {
  const g = a.genome;
  const k = Math.max(1, Math.round(detailScale(a)));
  for (const side of [-1, 1]) {
    const p = a.P(0.19, side * (a.half(0.19) * 0.86));
    const ex = Math.round(p.x) - ox;
    const ey = Math.round(p.y) - oy;
    // A pale patch round the eye, then the eye (or the closed lid, a line of skin).
    for (let dy = -k; dy <= k; dy++) for (let dx = -k - 1; dx <= k + 1; dx++) buf.set(ex + dx, ey + dy, g.skin.light);
    for (let dx = -k; dx <= k - 1; dx++) {
      if (closed) buf.set(ex + dx, ey, g.skin.dark);
      else for (let dy = -(k >> 1); dy <= (k - 1) >> 1; dy++) buf.set(ex + dx, ey + dy, g.eye);
    }
    if (!closed) buf.set(ex - 1, ey - (k >> 1), g.skin.highlight);
  }
}

/** How big a whale's small details are drawn (1 on a preview, ~2.5 on a world's whale). */
export const detailScale = (a: WhaleAnatomy) => clamp(a.girthPx / 55, 1, 2.5);

/** The spout at time `t`, drawn into `buf` (whose top-left is scene (ox, oy)); nothing between breaths. */
export function drawWhaleSpout(buf: PixelBuffer, a: WhaleAnatomy, t: number, foam: Color, ox = 0, oy = 0): void {
  const p = whalePose(a, t).spout;
  if (p < 0) return;
  const bh = a.blowhole;
  const k = detailScale(a);
  // A tall plume rising from the twin blowholes, widening into a V as it climbs; then it hangs, thins and falls
  // back as drops. Rising fast (most of its height in the first third), fading in the last half.
  const rise = Math.min(1, p * 3);
  const top = (8 + 28 * rise) * k;
  const fade = p < 0.5 ? 1 : 1 - (p - 0.5) * 1.6;
  const spray = stream(a.genome.seed, 'spout', Math.floor(t * 8));
  const white = hex('#ffffff');
  const n = Math.round(90 * k * fade);
  for (let i = 0; i < n; i++) {
    const h = Math.sqrt(spray.range(0, 1)) * top;
    const f = h / top;
    const side = spray.chance(0.5) ? -1 : 1;
    // Two jets that lean apart, and a cloud at the top that spreads as it slows.
    const lean = side * f * (3 + 5 * rise) * k;
    const spread = (0.8 + f * f * 6 * rise) * k;
    const x = Math.round(bh.x + lean * 0.35 + spray.range(-1, 1) * spread);
    const y = Math.round(bh.y - h + (p > 0.5 ? (p - 0.5) * 10 * k * f : 0));
    buf.set(x - ox, y - oy, f < 0.6 && spray.chance(0.7) ? white : foam);
  }
  // Falling drops round the base once the plume has risen.
  if (p > 0.3)
    for (let i = 0; i < Math.round(14 * k); i++) {
      const x = Math.round(bh.x + spray.range(-1, 1) * 10 * k * p);
      const y = Math.round(bh.y - spray.range(0, 1) * 12 * k * (1 - p));
      buf.set(x - ox, y - oy, foam);
    }
}

export interface WhaleFrame {
  buffer: PixelBuffer;
  body: Mask;
  island: IslandTop;
}

/** Render the whale and its island at time `t` (a preview; the growth stage for previews only). */
export function renderWhale(a: WhaleAnatomy, t: number, palette: WorldPalette, stage = 0): WhaleFrame {
  const g = a.genome;
  const buf = new PixelBuffer(a.w, a.h);
  paintSea(buf, palette, g.seed, t);
  const b = whaleBody(a, t);
  paintWake(buf, b.all, palette, `${g.seed}|wake`);
  buf.blit(b.buffer, 0, 0);
  if (whalePose(a, t).blink) drawWhaleEyes(buf, a, true);
  // The island: long and narrow on the spine, its edge a mossy fringe.
  const isl = whaleIslandAt(a, stage);
  const island = islandMask(`${g.seed}|island`, a.w, a.h, isl.cx, isl.cy, isl.rx, isl.ry, grow(b.trunk, -3), 0.08);
  paintIslandTop(buf, island, palette, `${g.seed}|top`, mix(g.skin.mid, hex('#5f7d4a'), 0.6), (bb, top) => {
    // The ridge path: a worn track along the spine, the whole length of the island.
    for (let xx = Math.round(top.cx - top.rx); xx <= Math.round(top.cx + top.rx); xx++) {
      const y = Math.round(top.cy + Math.sin(xx * 0.09) * 2);
      for (const dy of [0, 1]) if (top.mask.get(xx, y + dy) && top.mask.get(xx - 2, y + dy) && top.mask.get(xx + 2, y + dy)) bb.set(xx, y + dy, dy ? palette.path.mid : palette.path.light);
    }
  });
  drawWhaleSpout(buf, a, t, palette.foam);
  return { buffer: buf, body: b.all, island };
}
