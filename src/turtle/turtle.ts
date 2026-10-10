/**
 * THE TURTLE. A giant, peaceful animal whose shell carries the island.
 *
 *   turtle seed ─► TurtleGenome ─► TurtleAnatomy (world pixels) ─► body buffer (shell dome, rim, head,
 *                  neck, flippers, tail) ─► the terrain raster treats the shell top as land, the rim and the
 *                  body parts as non-walkable classes, and the painter copies their pixels from the buffer.
 *
 * Variation is controlled: every turtle is the same species (an oval shell with faceted edges, a round
 * head facing the viewer, four paddle flippers, a short tail); the seed decides proportions, facets,
 * markings, colours and the small details. All streams are keyed, nothing depends on draw order.
 */
import { stream } from '../core/rng';
import { type Color, hex, mix } from '../core/color';
import { ramp, type Ramp } from '../core/palette';
import { Mask, PixelBuffer } from '../core/pixel';
import { blobScore, shadeOf, shadedEllipse } from '../core/shade';
import { clamp, TAU } from '../core/math';

export type MarkingStyle = 'hex' | 'rings' | 'spots';

export interface TurtleGenome {
  seed: string;
  /** Shell half-axes as fractions of the world's width and height. */
  shellRx: number;
  shellRy: number;
  /** Facet amplitudes: k=6 lobes (scute edges) and k=4 squareness. */
  facets: number;
  squareness: number;
  facetPhase: number;
  /** Head radius as a fraction of the shell's rx; neck length as a fraction of head radius. */
  headSize: number;
  headLength: number;
  neck: number;
  /** Flipper length and width as fractions of the shell's rx; rear flippers are a fraction of the front. */
  flipperLength: number;
  flipperWidth: number;
  flipperAngle: number;
  rearScale: number;
  tailSize: number;
  markings: MarkingStyle;
  markingDensity: number;
  shell: Ramp;
  rim: Ramp;
  skin: Ramp;
  eye: Color;
  /** A lighter belly/jaw tone. */
  jaw: Color;
}

const SHELL_HUES = ['#7a9a3c', '#8b7a3a', '#5f8f6a', '#9a7b4a', '#6f8a4e', '#4f8a7a'];
const SKIN_HUES = ['#86b85a', '#7fb06e', '#8fb66a', '#9ab85e', '#73a87a', '#a3b45c'];

export function generateTurtleGenome(seed: string): TurtleGenome {
  const shape = stream(seed, 'turtle', 'shape');
  const colour = stream(seed, 'turtle', 'colour');
  const shellHue = colour.pick(SHELL_HUES);
  const skinHue = colour.pick(SKIN_HUES);
  const shellMid = hex(shellHue);
  const shellRamp = ramp(shellMid, { step: 0.085, hueShift: 8 });
  return {
    seed,
    shellRx: shape.range(0.25, 0.285),
    shellRy: shape.range(0.3, 0.345),
    facets: shape.range(0.012, 0.03),
    squareness: shape.range(-0.02, 0.035),
    facetPhase: shape.range(0, TAU),
    headSize: shape.range(0.18, 0.22),
    headLength: shape.range(0.9, 1.1),
    neck: shape.range(0.55, 0.85),
    flipperLength: shape.range(0.34, 0.44),
    flipperWidth: shape.range(0.16, 0.21),
    flipperAngle: shape.range(0.55, 0.8),
    rearScale: shape.range(0.68, 0.82),
    tailSize: shape.range(0.08, 0.13),
    markings: colour.weighted(['hex', 'rings', 'spots'] as const, [4, 3, 2]),
    markingDensity: colour.range(0.7, 1.2),
    shell: shellRamp,
    rim: ramp(mix(shellMid, hex('#e8d9a8'), 0.35), { step: 0.08, hueShift: 6 }),
    skin: ramp(hex(skinHue), { step: 0.085, hueShift: 8 }),
    eye: hex(colour.pick(['#2b1d12', '#1d2a33', '#3a2410'])),
    jaw: mix(hex(skinHue), hex('#f3eac2'), 0.45),
  };
}

export interface Flipper {
  /** Which corner: front-left, front-right, rear-left, rear-right (viewer's left/right; front is south). */
  side: 'fl' | 'fr' | 'rl' | 'rr';
  /** Base on the shell edge and the paddle's centre, in world pixels. */
  base: { x: number; y: number };
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Radians, the paddle's long axis. */
  angle: number;
}

export interface TurtleAnatomy {
  genome: TurtleGenome;
  cx: number;
  cy: number;
  /** Shell half-axes in pixels. */
  rx: number;
  ry: number;
  /** Width of the visible shell rim beyond the terrain, in pixels. */
  rimWidth: number;
  head: { cx: number; cy: number; rx: number; ry: number };
  neck: { x0: number; x1: number; y0: number; y1: number };
  flippers: Flipper[];
  tail: { cx: number; cy: number; length: number; width: number };
  /** Mean radius for the Island record. */
  meanRadius: number;
}

/** The shell's radius in direction `angle` (radians, 0 = +x, π/2 = down the screen), in pixels. */
export function shellRadius(a: TurtleAnatomy, angle: number): number {
  const g = a.genome;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const ellipse = (a.rx * a.ry) / Math.sqrt((a.ry * c) ** 2 + (a.rx * s) ** 2);
  const facet = 1 + g.facets * Math.cos(6 * angle + g.facetPhase) + g.squareness * Math.cos(4 * angle);
  return ellipse * facet;
}

/**
 * A SHELL FIT: the shell enlarged around the same island (the World Carrier's shell variants). Part sizes
 * (head, neck, flippers, tail) come from the reference anatomy, so their sprites stay pixel-identical; only
 * their positions follow the enlarged shell's edge, by whole pixels.
 */
export interface ShellFit {
  /** Shell centre in the canvas. */
  cx: number;
  cy: number;
  /** Half-axes of the enlarged shell, in pixels. */
  rx: number;
  ry: number;
  /** The reference anatomy (the unchanged shell) the part sizes and sub-pixel phases come from. */
  ref: TurtleAnatomy;
}

export function turtleAnatomy(genome: TurtleGenome, width: number, height: number, scale: number, fit?: ShellFit): TurtleAnatomy {
  const refRx = fit ? fit.ref.rx : width * genome.shellRx;
  const rx = fit ? fit.rx : refRx;
  const ry = fit ? fit.ry : height * genome.shellRy;
  const headR = refRx * genome.headSize;
  const cx = fit ? fit.cx : Math.round(width / 2);
  // The shell sits a little above centre: the head and front flippers need room below.
  const cy = fit ? fit.cy : Math.round(height * 0.415);
  const rimWidth = Math.round(5 * scale);
  const neckLen = headR * genome.neck;
  // With a fit, the parts below and above the shell move by the whole-pixel growth of the shell's edge at
  // their angle, so the visible neck, the tail and every sprite keep their exact pixels.
  const growth = (angle: number): number => (fit ? shellRadius({ genome, rx, ry } as TurtleAnatomy, angle) - shellRadius(fit.ref, angle) : 0);
  const southShift = fit ? Math.round(cy - fit.ref.cy + growth(Math.PI / 2)) : 0;
  const northShift = fit ? Math.round(cy - fit.ref.cy - growth(-Math.PI / 2)) : 0;
  const head = fit
    ? { cx, cy: fit.ref.head.cy + southShift, rx: headR, ry: headR * 0.92 * genome.headLength }
    : { cx, cy: Math.round(cy + ry + rimWidth + neckLen + headR * 0.8), rx: headR, ry: headR * 0.92 * genome.headLength };
  const neck = { x0: cx - headR * 0.62, x1: cx + headR * 0.62, y0: fit ? fit.ref.neck.y0 + southShift : cy + ry * 0.9, y1: head.cy };
  const flippers: Flipper[] = [];
  const fl = refRx * genome.flipperLength;
  const fw = refRx * genome.flipperWidth;
  const sides: [Flipper['side'], number, number][] = [
    ['fl', Math.PI - genome.flipperAngle * 0 - (Math.PI / 2 - genome.flipperAngle), 1],
    ['fr', Math.PI / 2 - genome.flipperAngle, 1],
    ['rl', Math.PI + (Math.PI / 2 - genome.flipperAngle * 0.8), genome.rearScale],
    ['rr', -(Math.PI / 2 - genome.flipperAngle * 0.8), genome.rearScale],
  ];
  sides.forEach(([side, angle, k], index) => {
    // The base sits on the shell edge at `angle`; the paddle reaches outward along it, slightly downward.
    const r = shellRadius({ genome, rx, ry } as TurtleAnatomy, angle) + rimWidth * 0.5;
    let base = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
    const len = fl * k;
    const dir = angle + (side.startsWith('f') ? 0.08 : -0.1) * (side.endsWith('l') ? -1 : 1);
    let fcx = base.x + Math.cos(dir) * len * 0.5;
    let fcy = base.y + Math.sin(dir) * len * 0.5;
    if (fit) {
      // Whole-pixel move from the reference flipper: the same sub-pixel phase, so the same sprite.
      const ref = fit.ref.flippers[index];
      const dx = Math.round(fcx - ref.cx);
      const dy = Math.round(fcy - ref.cy);
      fcx = ref.cx + dx;
      fcy = ref.cy + dy;
      base = { x: ref.base.x + dx, y: ref.base.y + dy };
    }
    flippers.push({ side, base, cx: fcx, cy: fcy, rx: len * 0.55, ry: fw * k * 0.5, angle: dir });
  });
  const tail = fit
    ? { cx, cy: fit.ref.tail.cy + northShift, length: refRx * genome.tailSize, width: refRx * genome.tailSize * 0.9 }
    : { cx, cy: cy - ry - rimWidth * 0.3, length: rx * genome.tailSize, width: rx * genome.tailSize * 0.9 };
  const a: TurtleAnatomy = { genome, cx, cy, rx, ry, rimWidth, head, neck, flippers, tail, meanRadius: (rx + ry) / 2 };
  return a;
}

/** The part of the turtle (outside the shell top) a world pixel belongs to, or null. */
export function turtlePartAt(a: TurtleAnatomy, x: number, y: number): 'head' | 'neck' | 'flipper' | 'tail' | null {
  const px = x + 0.5;
  const py = y + 0.5;
  const h = a.head;
  if (((px - h.cx) / h.rx) ** 2 + ((py - h.cy) / h.ry) ** 2 <= 1) return 'head';
  if (px >= a.neck.x0 && px <= a.neck.x1 && py >= a.neck.y0 && py <= a.neck.y1) return 'neck';
  for (const f of a.flippers) if (inRotatedEllipse(px, py, f.cx, f.cy, f.rx, f.ry, f.angle)) return 'flipper';
  const t = a.tail;
  const ty = t.cy - py; // positive above the shell top
  if (ty >= 0 && ty <= t.length && Math.abs(px - t.cx) <= (t.width / 2) * (1 - ty / t.length) + 0.5) return 'tail';
  return null;
}

/** Signed distance (approximate) from a pixel to the turtle's body parts, negative inside; for the foam bands. */
export function turtleBodyDistance(a: TurtleAnatomy, x: number, y: number): number {
  const px = x + 0.5;
  const py = y + 0.5;
  let best = Infinity;
  const h = a.head;
  best = Math.min(best, ellipseDistance(px, py, h.cx, h.cy, h.rx, h.ry, 0));
  for (const f of a.flippers) best = Math.min(best, ellipseDistance(px, py, f.cx, f.cy, f.rx, f.ry, f.angle));
  const t = a.tail;
  best = Math.min(best, Math.hypot(px - t.cx, py - (t.cy - t.length / 2)) - t.length / 2);
  return best;
}

function inRotatedEllipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number, angle: number): boolean {
  const dx = px - cx;
  const dy = py - cy;
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  const u = (dx * c - dy * s) / rx;
  const v = (dx * s + dy * c) / ry;
  return u * u + v * v <= 1;
}

function ellipseDistance(px: number, py: number, cx: number, cy: number, rx: number, ry: number, angle: number): number {
  const dx = px - cx;
  const dy = py - cy;
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  const u = dx * c - dy * s;
  const v = dx * s + dy * c;
  const k = Math.hypot(u / rx, v / ry);
  // Scale the radial excess by the local radius: a cheap signed distance good enough for bands.
  const r = Math.hypot(u, v) / Math.max(1e-6, k);
  return Math.hypot(u, v) - r;
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

export interface TurtleBodyParts {
  head: boolean;
  flippers: boolean;
}

export interface TurtleBody {
  /** World-sized buffer: shell dome, rim, neck, tail (the static parts) with transparency elsewhere. */
  buffer: PixelBuffer;
  /** The head and flippers as separate sprites, so the live renderer can move them. */
  head: { buffer: PixelBuffer; x: number; y: number; blink: PixelBuffer; left: PixelBuffer; right: PixelBuffer };
  flippers: { buffer: PixelBuffer; x: number; y: number; axis: { x: number; y: number } }[];
}

const LIGHT = { x: -0.55, y: -0.85 };

/** Shade a rotated ellipse with the lab's banded sphere rule and an inside outline. Returns its mask. */
export function shadedRotatedEllipse(buf: PixelBuffer, cx: number, cy: number, rx: number, ry: number, angle: number, rampIn: Ramp, s: { highlight?: number; light?: number; dark?: number } = {}): Mask {
  const mask = new Mask(buf.width, buf.height);
  const reach = Math.max(rx, ry) + 1;
  const c = Math.cos(-angle);
  const sn = Math.sin(-angle);
  for (let y = Math.floor(cy - reach); y <= Math.ceil(cy + reach); y++)
    for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const u = (dx * c - dy * sn) / rx;
      const v = (dx * sn + dy * c) / ry;
      if (u * u + v * v > 1) continue;
      // Lighting in world orientation: the screen-space offset decides the band.
      const wu = dx / Math.max(rx, ry);
      const wv = dy / Math.max(rx, ry);
      const rr = u * u + v * v;
      const facing = -(wu * LIGHT.x + wv * LIGHT.y);
      const score = facing * 0.62 + (1 - rr) * 0.45;
      buf.set(x, y, shadeOf(score, rampIn, s));
      mask.set(x, y);
    }
  buf.paintMask(mask.edge(), rampIn.outline);
  return mask;
}

/**
 * Draw the turtle. The shell dome is drawn in full (the terrain will cover its top). With `shell`, the dome
 * is painted by the World Carrier's shell surface (the enlarged shell variants) instead of the M1 rim.
 */
export function renderTurtleBody(a: TurtleAnatomy, shell?: (buf: PixelBuffer, a: TurtleAnatomy) => Mask): TurtleBody {
  const g = a.genome;
  const W = a.cx * 2;
  const H = Math.ceil(a.head.cy + a.head.ry + 4);
  const buf = new PixelBuffer(W, H);

  // ── Neck and tail (behind the shell) ──────────────────────────────────────
  const neckMask = new Mask(W, H);
  neckMask.fillRect(Math.round(a.neck.x0), Math.round(a.neck.y0), Math.round(a.neck.x1 - a.neck.x0), Math.round(a.neck.y1 - a.neck.y0));
  buf.paintMaskWith(neckMask, (x) => (x < a.cx - (a.neck.x1 - a.neck.x0) * 0.25 ? g.skin.light : x > a.cx + (a.neck.x1 - a.neck.x0) * 0.22 ? g.skin.dark : g.skin.mid));
  // Neck wrinkles: three faint lines.
  for (let i = 1; i <= 3; i++) {
    const y = Math.round(a.neck.y0 + ((a.neck.y1 - a.neck.y0) * i) / 4);
    buf.hline(Math.round(a.neck.x0) + 2, Math.round(a.neck.x1) - 3, y, g.skin.dark);
  }
  buf.paintMask(neckMask.edge(), g.skin.outline);
  const t = a.tail;
  const tailMask = new Mask(W, H);
  for (let y = Math.floor(t.cy - t.length); y <= Math.ceil(t.cy); y++) {
    const ty = t.cy - (y + 0.5);
    if (ty < 0 || ty > t.length) continue;
    const half = (t.width / 2) * (1 - ty / t.length) + 0.5;
    for (let x = Math.ceil(t.cx - half); x <= Math.floor(t.cx + half - 0.5); x++) tailMask.set(x, y);
  }
  buf.paintMaskWith(tailMask, (x) => (x < t.cx - 1 ? g.skin.light : g.skin.mid));
  buf.paintMask(tailMask.edge(), g.skin.outline);

  // ── Shell dome ─────────────────────────────────────────────────────────────
  if (shell) shell(buf, a);
  else paintM1Shell(buf, a);

  // ── Flippers: separate sprites, drawn into their own buffers ───────────────
  const flippers: TurtleBody['flippers'] = [];
  for (const f of a.flippers) {
    const reach = Math.ceil(Math.max(f.rx, f.ry)) + 3;
    const fb = new PixelBuffer(reach * 2 + 2, reach * 2 + 2);
    const ox = Math.round(f.cx) - reach - 1;
    const oy = Math.round(f.cy) - reach - 1;
    const m = shadedRotatedEllipse(fb, f.cx - ox, f.cy - oy, f.rx, f.ry, f.angle, g.skin, { highlight: 0.92, light: 0.62, dark: 0.12 });
    // Toe lines: two short creases toward the tip.
    const tipX = f.cx - ox + Math.cos(f.angle) * f.rx * 0.95;
    const tipY = f.cy - oy + Math.sin(f.angle) * f.rx * 0.95;
    for (const k of [-0.35, 0.35]) {
      const sx = f.cx - ox + Math.cos(f.angle) * f.rx * 0.45 + Math.cos(f.angle + Math.PI / 2) * f.ry * k;
      const sy = f.cy - oy + Math.sin(f.angle) * f.rx * 0.45 + Math.sin(f.angle + Math.PI / 2) * f.ry * k;
      const ex = tipX + Math.cos(f.angle + Math.PI / 2) * f.ry * k * 0.6;
      const ey = tipY + Math.sin(f.angle + Math.PI / 2) * f.ry * k * 0.6;
      fb.line(Math.round(sx), Math.round(sy), Math.round(ex), Math.round(ey), g.skin.dark);
    }
    void m;
    flippers.push({ buffer: fb, x: ox, y: oy, axis: { x: Math.cos(f.angle), y: Math.sin(f.angle) } });
  }

  // ── Head: three gaze variants and a blink ─────────────────────────────────
  const h = a.head;
  const headOf = (gaze: -1 | 0 | 1, blink: boolean): PixelBuffer => {
    const hw = Math.ceil(h.rx) + 3;
    const hh = Math.ceil(h.ry) + 3;
    const hb = new PixelBuffer(hw * 2, hh * 2);
    const cx = hw;
    const cy = hh;
    shadedEllipse(hb, cx, cy, h.rx, h.ry, g.skin, { highlight: 0.84, light: 0.5, dark: 0.05 });
    // Jaw: a lighter lower face.
    const jawMask = new Mask(hb.width, hb.height);
    jawMask.fillEllipse(cx, cy + h.ry * 0.45, h.rx * 0.62, h.ry * 0.38);
    hb.paintMaskWith(jawMask, (x, y) => (hb.get(x, y) === g.skin.outline ? undefined : g.jaw));
    // Eyes: large, on the upper half, wide apart; a white with a dark iris, a highlight; a blink is a lid line.
    const eyeR = Math.max(2, h.rx * 0.17);
    for (const side of [-1, 1]) {
      const ex = cx + side * h.rx * 0.5;
      const ey = cy - h.ry * 0.18;
      if (blink) {
        hb.hline(Math.round(ex - eyeR), Math.round(ex + eyeR), Math.round(ey), g.skin.outline);
        hb.set(Math.round(ex - eyeR), Math.round(ey) - 1, g.skin.outline);
        hb.set(Math.round(ex + eyeR), Math.round(ey) - 1, g.skin.outline);
        continue;
      }
      const wm = new Mask(hb.width, hb.height);
      wm.fillEllipse(ex, ey, eyeR, eyeR * 1.15);
      hb.paintMask(wm, hex('#ffffff'));
      const irisR = Math.max(1, eyeR * 0.62);
      const im = new Mask(hb.width, hb.height);
      im.fillEllipse(ex + gaze * Math.max(1, eyeR * 0.3) + side * 0.2, ey + eyeR * 0.15, irisR, irisR * 1.1);
      hb.paintMaskWith(im, (x, y) => (wm.get(x, y) ? g.eye : undefined));
      hb.set(Math.round(ex - irisR * 0.3 + gaze * Math.max(1, eyeR * 0.3)), Math.round(ey - irisR * 0.4), hex('#ffffff'));
      hb.paintMaskWith(wm.edge(), (x, y) => (hb.get(x, y) === hex('#ffffff') ? undefined : undefined));
      // Lid line over the eye.
      hb.hline(Math.round(ex - eyeR), Math.round(ex + eyeR), Math.round(ey - eyeR * 1.15) - 1, g.skin.dark);
    }
    // Nostrils and a gentle smile.
    hb.set(cx - Math.round(h.rx * 0.14), Math.round(cy + h.ry * 0.2), g.skin.outline);
    hb.set(cx + Math.round(h.rx * 0.14), Math.round(cy + h.ry * 0.2), g.skin.outline);
    const my = Math.round(cy + h.ry * 0.5);
    const mw = Math.round(h.rx * 0.42);
    hb.hline(cx - mw + 1, cx + mw - 1, my + 1, g.skin.outline);
    hb.set(cx - mw, my, g.skin.outline);
    hb.set(cx + mw, my, g.skin.outline);
    hb.validate();
    return hb;
  };
  const headBuf = headOf(0, false);
  const hx = Math.round(h.cx) - Math.ceil(h.rx) - 3;
  const hy = Math.round(h.cy) - Math.ceil(h.ry) - 3;
  buf.validate();
  return { buffer: buf, head: { buffer: headBuf, x: hx, y: hy, blink: headOf(0, true), left: headOf(-1, false), right: headOf(1, false) }, flippers };
}


/** The M1 shell: the dome in the rim ramp, scute seams on the rim, a lit inner lip and the outline. Unchanged since M1. */
function paintM1Shell(buf: PixelBuffer, a: TurtleAnatomy): void {
  const g = a.genome;
  const W = buf.width;
  const H = buf.height;
  const shellMask = new Mask(W, H);
  for (let y = Math.floor(a.cy - a.ry * 1.1); y <= Math.ceil(a.cy + a.ry * 1.1); y++)
    for (let x = Math.floor(a.cx - a.rx * 1.1); x <= Math.ceil(a.cx + a.rx * 1.1); x++) {
      const dx = x + 0.5 - a.cx;
      const dy = y + 0.5 - a.cy;
      const r = shellRadius(a, Math.atan2(dy, dx)) + a.rimWidth;
      if (Math.hypot(dx, dy) <= r) shellMask.set(x, y);
    }
  buf.paintMaskWith(shellMask, (x, y) => {
    const dx = (x + 0.5 - a.cx) / (a.rx + a.rimWidth);
    const dy = (y + 0.5 - a.cy) / (a.ry + a.rimWidth);
    return shadeOf(blobScore(dx, dy, 0.9), g.rim, { highlight: 0.8, light: 0.45, dark: 0.05 });
  });
  // Rim seams: scute edges every few pixels along the rim, radial, one pixel dark.
  const seams = Math.round(26 * g.markingDensity);
  for (let i = 0; i < seams; i++) {
    const ang = (i / seams) * TAU + g.facetPhase * 0.3;
    const r0 = shellRadius(a, ang) - 1;
    const r1 = r0 + a.rimWidth + 1;
    buf.line(Math.round(a.cx + Math.cos(ang) * r0), Math.round(a.cy + Math.sin(ang) * r0), Math.round(a.cx + Math.cos(ang) * r1), Math.round(a.cy + Math.sin(ang) * r1), g.rim.dark);
  }
  // A lighter inner lip (where the rim meets the terrain) and the outline.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!shellMask.get(x, y)) continue;
      const dx = x + 0.5 - a.cx;
      const dy = y + 0.5 - a.cy;
      const d = Math.hypot(dx, dy) - shellRadius(a, Math.atan2(dy, dx));
      if (d >= 0 && d < 1.5) buf.set(x, y, g.rim.light);
    }
  buf.paintMask(shellMask.edge(), g.shell.outline);
}

/** Clamp helper for callers. */
export const clampGrowth = (v: number) => clamp(v, 0, 1);
