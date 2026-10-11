/**
 * CONTROLLED RASTERIZATION of the kit's own SVG. The canonical V3 renderer
 * writes a small, regular SVG (groups with transforms, paths of M/L/C/Q/Z,
 * ellipses, gradients, one blur filter, one clip path). This module reads
 * exactly that and paints it into a PixelBuffer with pixel-art rules:
 *
 *  - no anti-aliasing: a pixel is painted when at least half of its
 *    sub-samples fall inside the shape (coverage is measured, then thresholded);
 *  - gradients become BANDS: the gradient's own stop colours, quantized;
 *  - strokes thinner than a pixel become one-pixel lines, never fade out;
 *  - a shape too small to win a pixel still gets its centre pixel, so a
 *    glint or a freckle survives at 16 px;
 *  - blurred shapes (soft shadows) are skipped: the world draws shadows;
 *  - an optional one-pixel outline is added OUTSIDE the silhouette.
 *
 * Nothing here knows what a Blobbi is. It is a renderer of this SVG dialect,
 * deterministic in Node and in the browser alike.
 */
import { PixelBuffer, Mask, forEachEllipsePixel } from '../core/pixel';
import { type Color, alpha, blue, green, hex, red, rgba } from '../core/color';

type Matrix = readonly [number, number, number, number, number, number];
const UNIT: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const invert = (m: Matrix): Matrix => {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
};
const scaleOf = (m: Matrix) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

const numbers = (text: string) => (text.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);

function parseTransform(value: string | undefined): Matrix {
  if (!value) return UNIT;
  let out: Matrix = UNIT;
  for (const match of value.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const n = numbers(match[2]);
    switch (match[1]) {
      case 'matrix':
        out = multiply(out, [n[0], n[1], n[2], n[3], n[4], n[5]]);
        break;
      case 'translate':
        out = multiply(out, [1, 0, 0, 1, n[0], n[1] ?? 0]);
        break;
      case 'scale':
        out = multiply(out, [n[0], 0, 0, n[1] ?? n[0], 0, 0]);
        break;
      case 'rotate': {
        const r = (n[0] * Math.PI) / 180;
        const turn: Matrix = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
        out = n.length >= 3 ? multiply(multiply(multiply(out, [1, 0, 0, 1, n[1], n[2]]), turn), [1, 0, 0, 1, -n[1], -n[2]]) : multiply(out, turn);
        break;
      }
      default:
        throw new Error(`svg-raster: transform "${match[1]}" is not understood`);
    }
  }
  return out;
}

// ─── A tiny XML reader for the dialect ───────────────────────────────────────

interface Node {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
}

/** Letters the flattener does not implement; the kit never writes them, and silence would mean a wrong shape. */
const UNSUPPORTED_PATH = /[STst]/;

export function parseSvg(svg: string): Node {
  const root: Node = { tag: 'root', attrs: {}, children: [] };
  const stack: Node[] = [root];
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  for (const m of svg.matchAll(re)) {
    const [, closing, tag, rawAttrs, selfClosing] = m;
    if (closing) {
      stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of rawAttrs.matchAll(/([a-zA-Z][\w:-]*)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const node: Node = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root;
}

// ─── Geometry flattening ─────────────────────────────────────────────────────

type Pt = [number, number];

const CURVE_STEPS = 24;

/** An SVG elliptical arc as points (the end included, the start not); the standard centre conversion. */
function arcPoints(from: Pt, rx: number, ry: number, rotation: number, large: boolean, sweep: boolean, to: Pt, steps = CURVE_STEPS): Pt[] {
  if (rx === 0 || ry === 0) return [to];
  const phi = (rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from[0] - to[0]) / 2;
  const dy = (from[1] - to[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  let a = Math.abs(rx);
  let b = Math.abs(ry);
  const lambda = (x1 * x1) / (a * a) + (y1 * y1) / (b * b);
  if (lambda > 1) {
    a *= Math.sqrt(lambda);
    b *= Math.sqrt(lambda);
  }
  const k = Math.sqrt(Math.max(0, (a * a * b * b - a * a * y1 * y1 - b * b * x1 * x1) / (a * a * y1 * y1 + b * b * x1 * x1))) * (large === sweep ? -1 : 1);
  const cxp = (k * a * y1) / b;
  const cyp = (-k * b * x1) / a;
  const cx = cos * cxp - sin * cyp + (from[0] + to[0]) / 2;
  const cy = sin * cxp + cos * cyp + (from[1] + to[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const start = angle(1, 0, (x1 - cxp) / a, (y1 - cyp) / b);
  let delta = angle((x1 - cxp) / a, (y1 - cyp) / b, (-x1 - cxp) / a, (-y1 - cyp) / b);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = start + (delta * i) / steps;
    out.push([cx + a * Math.cos(t) * cos - b * Math.sin(t) * sin, cy + a * Math.cos(t) * sin + b * Math.sin(t) * cos]);
  }
  return out;
}

/** Flatten a path's `d` into subpaths of points, in the path's own units. */
function flattenPath(d: string, steps = CURVE_STEPS): { points: Pt[]; closed: boolean }[] {
  if (UNSUPPORTED_PATH.test(d)) throw new Error('svg-raster: path command S/T is not understood');
  const out: { points: Pt[]; closed: boolean }[] = [];
  let cur: Pt[] = [];
  let closed = false;
  let pos: Pt = [0, 0];
  let start: Pt = [0, 0];
  const flush = () => {
    if (cur.length) out.push({ points: cur, closed });
    cur = [];
    closed = false;
  };
  const re = /([MLCQZHVAmlcqzhva])([^MLCQZHVAmlcqzhva]*)/g;
  for (const m of d.matchAll(re)) {
    const cmd = m[1];
    const n = numbers(m[2]);
    const rel = cmd === cmd.toLowerCase() && cmd !== 'Z' && cmd !== 'z';
    const abs = (x: number, y: number): Pt => (rel ? [pos[0] + x, pos[1] + y] : [x, y]);
    switch (cmd.toUpperCase()) {
      case 'M':
        flush();
        pos = abs(n[0], n[1]);
        start = pos;
        cur.push(pos);
        for (let i = 2; i + 1 < n.length; i += 2) {
          pos = abs(n[i], n[i + 1]);
          cur.push(pos);
        }
        break;
      case 'L':
        for (let i = 0; i + 1 < n.length; i += 2) {
          pos = abs(n[i], n[i + 1]);
          cur.push(pos);
        }
        break;
      case 'H':
        for (const x of n) {
          pos = [rel ? pos[0] + x : x, pos[1]];
          cur.push(pos);
        }
        break;
      case 'V':
        for (const y of n) {
          pos = [pos[0], rel ? pos[1] + y : y];
          cur.push(pos);
        }
        break;
      case 'C':
        for (let i = 0; i + 5 < n.length; i += 6) {
          const c1 = abs(n[i], n[i + 1]);
          const c2 = abs(n[i + 2], n[i + 3]);
          const p1 = abs(n[i + 4], n[i + 5]);
          const p0 = pos;
          for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const u = 1 - t;
            cur.push([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0], u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1]]);
          }
          pos = p1;
        }
        break;
      case 'Q':
        for (let i = 0; i + 3 < n.length; i += 4) {
          const c = abs(n[i], n[i + 1]);
          const p1 = abs(n[i + 2], n[i + 3]);
          const p0 = pos;
          for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const u = 1 - t;
            cur.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
          }
          pos = p1;
        }
        break;
      case 'A':
        for (let i = 0; i + 6 < n.length; i += 7) {
          const to = abs(n[i + 5], n[i + 6]);
          cur.push(...arcPoints(pos, n[i], n[i + 1], n[i + 2], n[i + 3] !== 0, n[i + 4] !== 0, to, steps));
          pos = to;
        }
        break;
      case 'Z':
        closed = true;
        pos = start;
        flush();
        break;
    }
  }
  flush();
  return out;
}

function ellipsePoints(cx: number, cy: number, rx: number, ry: number, steps = 40): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

// ─── Coverage rasterization ──────────────────────────────────────────────────

const SUB = 3; // sub-samples per axis

/**
 * Coverage of closed polygons (even-odd) over a pixel grid: for each
 * sub-scanline the crossings are sorted and the spans between them add to
 * the covered pixels. Returns a Float32 coverage 0..1 per pixel of the
 * bounding box, with the box itself.
 */
function coverage(polys: Pt[][], width: number, height: number): { data: Float32Array; x0: number; y0: number; w: number; h: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of polys)
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  if (minX === Infinity) return null;
  const x0 = Math.max(0, Math.floor(minX));
  const y0 = Math.max(0, Math.floor(minY));
  const x1 = Math.min(width - 1, Math.ceil(maxX));
  const y1 = Math.min(height - 1, Math.ceil(maxY));
  if (x1 < x0 || y1 < y0) return null;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const data = new Float32Array(w * h);
  const inc = 1 / (SUB * SUB);
  const xs: number[] = [];
  for (let sy = 0; sy < h * SUB; sy++) {
    const y = y0 + (sy + 0.5) / SUB;
    xs.length = 0;
    for (const poly of polys) {
      const n = poly.length;
      for (let i = 0; i < n; i++) {
        const [ax, ay] = poly[i];
        const [bx, by] = poly[(i + 1) % n];
        if (ay === by) continue;
        if ((y >= ay && y < by) || (y >= by && y < ay)) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    const row = Math.floor(sy / SUB) * w;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const sa = Math.max(0, Math.ceil((xs[i] - x0) * SUB - 0.5));
      const sb = Math.min(w * SUB - 1, Math.floor((xs[i + 1] - x0) * SUB - 0.5));
      for (let sx = sa; sx <= sb; sx++) data[row + Math.floor(sx / SUB)] += inc;
    }
  }
  return { data, x0, y0, w, h };
}

// ─── Paint ───────────────────────────────────────────────────────────────────

interface Stop {
  offset: number;
  color: Color;
}
interface Gradient {
  kind: 'linear' | 'radial';
  stops: Stop[];
  userSpace: boolean;
  transform: Matrix;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
  r: number;
}

function parseColor(s: string | undefined): Color | null {
  if (!s || s === 'none') return null;
  if (s.startsWith('#')) return hex(s);
  if (s.startsWith('rgb')) {
    const n = numbers(s);
    return rgba(n[0], n[1], n[2], 255);
  }
  return hex('#000000');
}

function lerpColor(a: Color, b: Color, t: number): Color {
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return rgba(m(red(a), red(b)), m(green(a), green(b)), m(blue(a), blue(b)), 255);
}

function stopColor(stops: Stop[], t: number): Color {
  if (t <= stops[0].offset) return stops[0].color;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].offset) {
      const a = stops[i - 1];
      const b = stops[i];
      const u = b.offset === a.offset ? 0 : (t - a.offset) / (b.offset - a.offset);
      return lerpColor(a.color, b.color, u);
    }
  }
  return stops[stops.length - 1].color;
}

/** Composite `c` at `opacity` over `under` (which may be transparent). */
function over(under: Color, c: Color, opacity: number): Color {
  if (opacity >= 1 || alpha(under) === 0) return opacity >= 1 ? c : c;
  const m = (x: number, y: number) => Math.round(y * (1 - opacity) + x * opacity);
  return rgba(m(red(c), red(under)), m(green(c), green(under)), m(blue(c), blue(under)), 255);
}

export interface RasterOptions {
  /** Pixels per SVG user unit (the viewBox's units). */
  scale: number;
  /** Offset in pixels added after scaling. */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  /** How many bands a gradient is quantized into. */
  bands?: number;
  /** Paint a one-pixel outline outside the silhouette in this colour. */
  outline?: Color | null;
  /** Skip shapes with these `data-part` values (prefix match). */
  skipParts?: readonly string[];
  /** Skip shapes that carry a filter (blurred soft shadows). */
  skipFiltered?: boolean;
  /** A floor for the opacity of groups whose `data-part` starts with a key (markings that must stay readable). */
  minOpacity?: Record<string, number>;
  /**
   * FEATURE-AWARE RECONSTRUCTION: eyes and mouths are rebuilt pixel by pixel
   * from the canonical shapes' own centres, radii and endpoints instead of
   * being thresholded, so a 3-pixel iris keeps one highlight and a smile
   * keeps its curve. Default true.
   */
  features?: boolean;
  /** A whole-pixel shift applied to every iris, pupil and highlight: the gaze, identical for both eyes. */
  gazeShift?: { dx: number; dy: number };
  /**
   * WHOLE-PIXEL RIG MOTION. A rig transform (`data-rig`: the body's bounce and sway, a leg's lift, an arm's swing)
   * that moves its part by less than one output pixel everywhere cannot be drawn as motion; rasterized as is, it
   * only tips individual features across rounding thresholds (an eye steps a pixel, the outline does not: the
   * part shakes). With this on, such a transform is replaced by the whole-pixel translation nearest to its mean
   * displacement, so the part moves rigidly or not at all. Transforms that move a part by a pixel or more are kept.
   */
  snapRig?: boolean;
}

/**
 * Rasterize one of the kit's SVGs. `skipParts` lets a caller drop the
 * artwork's own ground shadows, which the world draws itself.
 */
export function rasterizeSvg(svg: string, o: RasterOptions): PixelBuffer {
  const root = parseSvg(svg);
  const svgNode = root.children.find((c) => c.tag === 'svg');
  if (!svgNode) throw new Error('svg-raster: no <svg>');
  const buf = new PixelBuffer(o.width, o.height);
  const gradients = new Map<string, Gradient>();
  const clips = new Map<string, Node>();
  const bands = o.bands ?? 4;
  const skipFiltered = o.skipFiltered ?? true;
  const skipParts = o.skipParts ?? [];
  const base: Matrix = [o.scale, 0, 0, o.scale, o.offsetX, o.offsetY];

  // Defs.
  const collectDefs = (n: Node) => {
    for (const c of n.children) {
      if (c.tag === 'linearGradient' || c.tag === 'radialGradient') {
        const stops: Stop[] = c.children.filter((s) => s.tag === 'stop').map((s) => ({ offset: Number(s.attrs.offset ?? 0), color: parseColor(s.attrs['stop-color']) ?? hex('#000000') }));
        if (!stops.length) continue;
        gradients.set(c.attrs.id, {
          kind: c.tag === 'linearGradient' ? 'linear' : 'radial',
          stops,
          userSpace: c.attrs.gradientUnits === 'userSpaceOnUse',
          transform: parseTransform(c.attrs.gradientTransform),
          x1: Number(c.attrs.x1 ?? 0),
          y1: Number(c.attrs.y1 ?? 0),
          x2: Number(c.attrs.x2 ?? 1),
          y2: Number(c.attrs.y2 ?? 0),
          cx: Number(c.attrs.cx ?? 0.5),
          cy: Number(c.attrs.cy ?? 0.5),
          r: Number(c.attrs.r ?? 0.5),
        });
      } else if (c.tag === 'clipPath') clips.set(c.attrs.id, c);
      else if (c.tag === 'defs') collectDefs(c);
    }
  };
  collectDefs(svgNode);

  const clipCache = new Map<string, Mask>();
  const clipMask = (id: string, ctm: Matrix): Mask => {
    const key = `${id}|${ctm.map((v) => v.toFixed(4)).join(',')}`;
    const hit = clipCache.get(key);
    if (hit) return hit;
    const mask = new Mask(o.width, o.height);
    const node = clips.get(id);
    if (node) {
      for (const shape of node.children) {
        const polys = shapePolys(shape, multiply(ctm, parseTransform(shape.attrs.transform)));
        const cov = coverage(polys, o.width, o.height);
        if (!cov) continue;
        for (let y = 0; y < cov.h; y++) for (let x = 0; x < cov.w; x++) if (cov.data[y * cov.w + x] >= 0.5) mask.set(cov.x0 + x, cov.y0 + y);
      }
    }
    clipCache.set(key, mask);
    return mask;
  };

  const shapePolys = (node: Node, ctm: Matrix): Pt[][] => {
    if (node.tag === 'path') {
      return flattenPath(node.attrs.d ?? '')
        .map((sp) => sp.points.map(([x, y]) => apply(ctm, x, y)))
        .filter((p) => p.length >= 3);
    }
    if (node.tag === 'ellipse' || node.tag === 'circle') {
      const cx = Number(node.attrs.cx ?? 0);
      const cy = Number(node.attrs.cy ?? 0);
      const rx = Number(node.attrs.rx ?? node.attrs.r ?? 0);
      const ry = Number(node.attrs.ry ?? node.attrs.r ?? 0);
      return [ellipsePoints(cx, cy, rx, ry).map(([x, y]) => apply(ctm, x, y))];
    }
    return [];
  };

  const paintFill = (node: Node, ctm: Matrix, opacity: number, clip: Mask | null) => {
    const fill = node.attrs.fill;
    if (!fill || fill === 'none') return;
    const part = node.attrs['data-part'] ?? '';
    const sparesEyes = part.includes('cheek') || part.includes('freckle');
    const polys = shapePolys(node, ctm);
    const cov = coverage(polys, o.width, o.height);
    if (!cov) return;
    const gradId = fill.startsWith('url(') ? fill.slice(5, -1) : null;
    const grad = gradId ? gradients.get(gradId) : undefined;
    const solid = grad ? null : parseColor(fill);
    if (!grad && solid === null) return;
    // Bounding box in pixel space, for objectBoundingBox gradients.
    const inv = invert(ctm);
    const colorAt = (px: number, py: number): Color => {
      if (!grad) return solid!;
      let t: number;
      if (grad.userSpace) {
        // Pixel → shape user space → gradient space.
        const [ux, uy] = apply(inv, px + 0.5, py + 0.5);
        const [gx, gy] = apply(invert(grad.transform), ux, uy);
        t = grad.kind === 'radial' ? Math.hypot(gx - grad.cx, gy - grad.cy) / grad.r : project(gx, gy, grad);
      } else {
        const bx = (px + 0.5 - cov.x0) / cov.w;
        const by = (py + 0.5 - cov.y0) / cov.h;
        t = grad.kind === 'radial' ? Math.hypot(bx - grad.cx, by - grad.cy) / grad.r : project(bx, by, grad);
      }
      t = Math.max(0, Math.min(1, t));
      // Quantize into bands: each band takes the colour at its centre.
      const q = (Math.min(bands - 1, Math.floor(t * bands)) + 0.5) / bands;
      return stopColor(grad.stops, q);
    };
    let painted = 0;
    let best = -1;
    let bestI = -1;
    for (let y = 0; y < cov.h; y++)
      for (let x = 0; x < cov.w; x++) {
        const c = cov.data[y * cov.w + x];
        if (c > best) {
          best = c;
          bestI = y * cov.w + x;
        }
        if (c < 0.5) continue;
        const px = cov.x0 + x;
        const py = cov.y0 + y;
        if (clip && !clip.get(px, py)) continue;
        if (sparesEyes && eyeMask.get(px, py)) continue;
        buf.set(px, py, over(buf.get(px, py), colorAt(px, py), opacity));
        painted++;
      }
    // Too small to win a pixel: give it its best pixel anyway, if it has real presence.
    if (painted === 0 && best >= 0.2 && opacity >= 0.5) {
      const px = cov.x0 + (bestI % cov.w);
      const py = cov.y0 + Math.floor(bestI / cov.w);
      if (!clip || clip.get(px, py)) buf.set(px, py, over(buf.get(px, py), colorAt(px, py), opacity * best));
    }
  };

  const paintStroke = (node: Node, ctm: Matrix, opacityIn: number, clip: Mask | null) => {
    let opacity = opacityIn;
    const stroke = parseColor(node.attrs.stroke);
    if (stroke === null) return;
    const widthPx = Number(node.attrs['stroke-width'] ?? 1) * scaleOf(ctm);
    const polylines = node.tag === 'path' ? flattenPath(node.attrs.d ?? '').map((sp) => ({ pts: sp.points.map(([x, y]) => apply(ctm, x, y)), closed: sp.closed })) : shapePolys(node, ctm).map((pts) => ({ pts, closed: true }));
    const put = (x: number, y: number) => {
      if (clip && !clip.get(x, y)) return;
      buf.set(x, y, over(buf.get(x, y), stroke, opacity));
    };
    if (widthPx <= 1.6) {
      // One-pixel line through the pixel centres. A stroke thinner than a pixel is lightened in proportion,
      // as its coverage would be: a hairline brow stays a hint, not a bar.
      opacity *= Math.max(0.4, Math.min(1, widthPx / 1.0));
      for (const { pts, closed } of polylines) {
        const n = pts.length;
        for (let i = 0; i + 1 < n + (closed ? 1 : 0); i++) {
          const a = pts[i];
          const b = pts[(i + 1) % n];
          line(Math.floor(a[0]), Math.floor(a[1]), Math.floor(b[0]), Math.floor(b[1]), put);
        }
      }
      return;
    }
    // Thick: stamp discs along the line.
    const r = widthPx / 2;
    for (const { pts, closed } of polylines) {
      const n = pts.length;
      for (let i = 0; i + 1 < n + (closed ? 1 : 0); i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const steps = Math.max(1, Math.ceil(len / 0.5));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const cx = a[0] + (b[0] - a[0]) * t;
          const cy = a[1] + (b[1] - a[1]) * t;
          for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
            for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
              if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) put(x, y);
        }
      }
    }
  };

  const features = o.features ?? true;

  /** The transformed centre and radii of an ellipse (the CTM is a uniform scale plus a small rotation). */
  const ellipsePx = (node: Node, ctm: Matrix) => {
    const m = multiply(ctm, parseTransform(node.attrs.transform));
    const [cx, cy] = apply(m, Number(node.attrs.cx ?? 0), Number(node.attrs.cy ?? 0));
    const k = scaleOf(m);
    return { cx, cy, rx: Number(node.attrs.rx ?? node.attrs.r ?? 0) * k, ry: Number(node.attrs.ry ?? node.attrs.r ?? 0) * k };
  };

  /** Every eye white painted so far: cheeks and other later features never paint over an eye. */
  const eyeMask = new Mask(o.width, o.height);

  /** Eyes are painted in groups: the white is remembered so the iris, pupil and highlights can stay inside it. */
  let currentWhite: { cx: number; cy: number; ecx: number; ecy: number; rx: number; ry: number; mask: Mask; box: { x0: number; y0: number; x1: number; y1: number } } | null = null;

  const paintFeature = (node: Node, part: string, ctm: Matrix, opacity: number, clip: Mask | null): boolean => {
    const put = (x: number, y: number, c: Color, op = opacity) => {
      if (clip && !clip.get(x, y)) return;
      buf.set(x, y, over(buf.get(x, y), c, op));
    };
    if (node.tag === 'ellipse' && part.endsWith('eye-white')) {
      // The white: a pixel ellipse of WHOLE-PIXEL size (the same for both eyes, since both share the canonical
      // radii), its centre snapped to the grid so the two eyes rasterize to the same shape. Never thinner than
      // 2 px nor flatter than 3 px tall.
      const e = ellipsePx(node, ctm);
      const wantW = Math.max(2, Math.round(e.rx * 2));
      const wantH = Math.max(3, Math.round(e.ry * 2));
      const rx = wantW / 2;
      const ry = wantH / 2;
      const scx = wantW % 2 === 0 ? Math.round(e.cx) : Math.floor(e.cx) + 0.5;
      const scy = wantH % 2 === 0 ? Math.round(e.cy) : Math.floor(e.cy) + 0.5;
      const mask = new Mask(o.width, o.height);
      forEachEllipsePixel(scx, scy, rx, ry, (x, y) => mask.set(x, y));
      const white = parseColor(node.attrs.fill) ?? hex('#ffffff');
      for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) if (mask.get(x, y)) put(x, y, white);
      eyeMask.union(mask);
      const box = mask.bounds() ?? { x: Math.floor(e.cx), y: Math.floor(e.cy), w: 1, h: 1 };
      currentWhite = { cx: scx, cy: scy, ecx: e.cx, ecy: e.cy, rx, ry, mask, box: { x0: box.x, y0: box.y, x1: box.x + box.w - 1, y1: box.y + box.h - 1 } };
      return true;
    }
    if (node.tag === 'ellipse' && (part.endsWith('iris') || part.endsWith('pupil'))) {
      if (!currentWhite) return false;
      const e = ellipsePx(node, ctm);
      const whiteW = currentWhite.rx * 2;
      const isIris = part.endsWith('iris');
      // The iris fills most of the white, as in the drawing: at least 2 px wide once the white is 3 px wide,
      // and never the whole white (a ring of white stays). The pupil only exists when it can be its own pixel.
      if (!isIris && e.rx < 0.75) return true;
      // The iris keeps the drawing's share of the white (about 70%), measured in whole pixels, and never
      // fills it: a ring of white stays on at least the top and one side.
      const whiteH = currentWhite.ry * 2;
      const wantW = Math.max(whiteW >= 3 ? 2 : 1, Math.min(Math.round(whiteW) - 1, Math.round((e.rx / currentWhite.rx) * whiteW)));
      const wantH = Math.max(whiteH >= 3 ? 2 : 1, Math.min(Math.round(whiteH) - 1, Math.round((e.ry / currentWhite.ry) * whiteH)));
      const rx = isIris ? wantW / 2 : e.rx;
      const ry = isIris ? wantH / 2 : e.ry;
      const fill = node.attrs.fill ?? '';
      const grad = fill.startsWith('url(') ? gradients.get(fill.slice(5, -1)) : undefined;
      const color = grad ? stopColor(grad.stops, 0.45) : (parseColor(fill) ?? hex('#000000'));
      // PLACEMENT, the same rule for both eyes. The iris box is centred in the white's PIXEL box (not snapped from
      // its own sub-pixel centre, which let the two eyes round differently and look cross-eyed), nudged by the
      // canonical offset only when that is at least a third of a pixel, with ties broken toward the viewer's right
      // for both eyes, then moved by the shared whole-pixel gaze shift and kept inside the white.
      const wb = currentWhite.box;
      const nudge = (d: number) => (Math.abs(d) < 0.34 ? 0 : Math.sign(d) * Math.round(Math.abs(d)));
      const shift = o.gazeShift ?? { dx: 0, dy: 0 };
      const place = (boxLo: number, boxHi: number, want: number, canonicalOffset: number, gaze: number) => {
        const span = boxHi - boxLo + 1;
        const free = span - want;
        // Centre; a leftover pixel goes to the top-left side, i.e. the iris sits toward the viewer's right and
        // low in the white, as the kit's does, and identically for both eyes.
        let lo = boxLo + Math.ceil(free / 2);
        lo += nudge(canonicalOffset) + gaze;
        return Math.max(boxLo, Math.min(boxHi - want + 1, lo));
      };
      // The nudge is measured against the CANONICAL white centre, never the snapped one (snapping differs per eye).
      const irisX0 = isIris ? place(wb.x0, wb.x1, wantW, e.cx - currentWhite.ecx, shift.dx) : 0;
      const irisY0 = isIris ? place(wb.y0, wb.y1, wantH, e.cy - currentWhite.ecy, shift.dy) : 0;
      // A pupil only exists inside a 3-px iris, and it rides along with the iris (clamped into the iris box).
      if (!isIris && (!irisBox || irisBox.x1 - irisBox.x0 + 1 < 3)) return true;
      const cx = isIris ? irisX0 + wantW / 2 : Math.max(irisBox!.x0 + e.rx, Math.min(irisBox!.x1 + 1 - e.rx, e.cx + shift.dx));
      const cy = isIris ? irisY0 + wantH / 2 : Math.max(irisBox!.y0 + e.ry, Math.min(irisBox!.y1 + 1 - e.ry, e.cy + shift.dy));
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      // In a small eye (four rows or fewer) the white's top row stays white: the canonical iris sits low in
      // the white, and a white brow line over a dark iris is what keeps a 3-row eye readable as an eye.
      const whiteRows = wb.y1 - wb.y0 + 1;
      const topRowOf = new Map<number, number>();
      if (isIris && whiteRows <= 4) for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) if (currentWhite.mask.get(x, y) && !topRowOf.has(x)) topRowOf.set(x, y);
      // The protection only applies when the iris keeps at least two rows of its own; otherwise the eye
      // would collapse to a single dark line.
      let protect = isIris && whiteRows <= 4;
      if (protect) {
        const rows = new Set<number>();
        forEachEllipsePixel(cx, cy, rx, ry, (x, y) => {
          if (currentWhite!.mask.get(x, y) && topRowOf.get(x) !== y) rows.add(y);
        });
        if (rows.size < 2) protect = false;
      }
      forEachEllipsePixel(cx, cy, rx, ry, (x, y) => {
        if (!currentWhite!.mask.get(x, y)) return;
        if (protect && topRowOf.get(x) === y) return;
        put(x, y, color);
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      });
      if (isIris && x0 !== Infinity) irisBox = { x0, x1, y0, y1, color };
      return true;
    }
    if (node.tag === 'ellipse' && part.includes('eye-highlight')) {
      if (!currentWhite || !irisBox) return true;
      const e = ellipsePx(node, ctm);
      const irisW = irisBox.x1 - irisBox.x0 + 1;
      const irisH = irisBox.y1 - irisBox.y0 + 1;
      const primary = part.includes('primary');
      // The primary highlight exists once the iris is 2 px wide: a block the size of the canonical ellipse
      // (one pixel until it is a pixel tall, never more than a third of the iris), anchored at its canonical place.
      // The secondary glint needs its own half pixel of radius and a 5 px iris.
      if (primary ? irisW < 2 || irisH < 2 : irisW < 5 || irisH < 5 || e.rx < 0.45) return true;
      const hw = primary ? Math.max(1, Math.min(Math.floor(irisW / 3), Math.round(e.rx * 2))) : 1;
      const hh = primary ? Math.max(1, Math.min(Math.floor(irisH / 3), Math.round(e.ry * 2))) : 1;
      // Anchored to the iris box: the primary glint in its upper-left quadrant (one pixel in from a 4-px iris),
      // the secondary in the lower right. It follows the iris wherever the gaze moves it.
      const inset = (n: number) => (n >= 4 ? 1 : 0);
      const x = primary ? irisBox.x0 + inset(irisW) : irisBox.x1 - 1;
      const y = primary ? irisBox.y0 + inset(irisH) : irisBox.y1 - 1;
      const white = parseColor(node.attrs.fill) ?? hex('#ffffff');
      for (let j = 0; j < hh; j++) for (let i = 0; i < hw; i++) put(x + i, y + j, white, 1);
      return true;
    }
    if (node.tag === 'path' && part === 'mouth' && node.attrs.fill === 'none') {
      // A closed mouth: one stroke, M x0 y0 C c1 c2 x1 y1. Its width, its sag and its direction are measured
      // from the canonical curve and redrawn as a symmetric pixel arc, so a smile is a smile at any size.
      const subs = flattenPath(node.attrs.d ?? '');
      if (subs.length !== 1 || subs[0].points.length < 3) return false;
      const pts = subs[0].points.map(([x, y]) => apply(ctm, x, y));
      const a = pts[0];
      const b = pts[pts.length - 1];
      // Only front mouths (level endpoints) are reconstructed; a profile's half mouth keeps the generic stroke.
      if (Math.abs(a[1] - b[1]) > 0.35 * Math.max(1, Math.abs(b[0] - a[0]))) return false;
      const mid = pts[Math.floor(pts.length / 2)];
      const sag = mid[1] - (a[1] + b[1]) / 2; // positive: corners up, a smile
      const widthPx = Math.abs(b[0] - a[0]);
      const depth = Math.abs(sag) < 0.3 ? 0 : Math.max(1, Math.round(Math.abs(sag)));
      // A curve needs three pixels to show; a flat mouth may be two.
      const w = Math.max(depth > 0 ? 3 : 2, Math.round(widthPx));
      const dir = sag >= 0 ? 1 : -1;
      const ink = parseColor(node.attrs.stroke) ?? hex('#000000');
      const x0 = Math.round((a[0] + b[0]) / 2 - w / 2);
      const yCorner = Math.floor((a[1] + b[1]) / 2);
      // A symmetric arc: the two corner pixels on the corner row, the rest bulging `depth` rows toward the sag
      // (one row at the ends of a wide mouth, the full depth in the middle).
      for (let i = 0; i < w; i++) {
        let bulge = 0;
        if (depth > 0 && i > 0 && i < w - 1) {
          const t = (i - 0.5) / (w - 2); // 0..1 across the inner pixels
          bulge = Math.max(1, Math.round(depth * Math.sin(t * Math.PI)));
        }
        put(x0 + i, yCorner + dir * bulge, ink, 1);
      }
      return true;
    }
    return false;
  };

  let irisBox: { x0: number; x1: number; y0: number; y1: number; color: Color } | null = null;

  /** Every outline point of the drawn shapes under a node, in output pixels. */
  const groupPoints = (node: Node, ctm: Matrix, out: Pt[] = []): Pt[] => {
    for (const c of node.children) {
      if (c.tag === 'defs' || c.tag === 'clipPath' || c.tag === 'filter' || c.tag === 'linearGradient' || c.tag === 'radialGradient' || c.tag === 'stop') continue;
      const part = c.attrs['data-part'] ?? '';
      if (skipParts.some((p) => part.startsWith(p))) continue;
      if (skipFiltered && c.attrs.filter) continue;
      const m = multiply(ctm, parseTransform(c.attrs.transform));
      if (c.tag === 'g' || c.tag === 'svg') groupPoints(c, m, out);
      else for (const poly of shapePolys(c, m)) for (const pt of poly) out.push(pt);
    }
    return out;
  };

  /**
   * The rig transform of `node` under `ctm`, or its whole-pixel replacement when it moves the part less than a
   * pixel everywhere. A pure translation (a leg's lift and stride, a bounce) becomes the nearest whole-pixel
   * step, and at least one pixel once it reaches a quarter pixel, so a step the kit makes stays visible. A
   * rotation or squash of a limb (an arm's swing, the tuft) becomes a rigid translation by the rounded
   * displacement of its farthest-moving point, so a swinging hand still moves a pixel; the body (the root rig,
   * which carries the face) moves by its rounded mean displacement instead, so its sub-pixel lean, largest at
   * the crown, never shifts the whole face sideways.
   */
  const rigMatrix = (node: Node, ctm: Matrix): Matrix => {
    const local = parseTransform(node.attrs.transform);
    const m = multiply(ctm, local);
    if (!o.snapRig || !node.attrs['data-rig'] || !node.attrs.transform) return m;
    const before = groupPoints(node, ctm);
    const after = groupPoints(node, m);
    if (!before.length || before.length !== after.length) return m;
    let sx = 0;
    let sy = 0;
    let most = 0;
    let far: [number, number] = [0, 0];
    for (let i = 0; i < before.length; i++) {
      const dx = after[i][0] - before[i][0];
      const dy = after[i][1] - before[i][1];
      sx += dx;
      sy += dy;
      const d = Math.hypot(dx, dy);
      if (d > most) {
        most = d;
        far = [dx, dy];
      }
    }
    if (most >= 1) return m;
    const translation = local[0] === 1 && local[1] === 0 && local[2] === 0 && local[3] === 1;
    const step = (v: number) => (Math.abs(v) < 0.25 ? 0 : Math.sign(v) * Math.max(1, Math.round(Math.abs(v))));
    const root = node.attrs['data-part'] === 'character';
    const dx = translation ? step(sx / before.length) : Math.round(root ? sx / before.length : far[0]);
    const dy = translation ? step(sy / before.length) : Math.round(root ? sy / before.length : far[1]);
    return multiply([1, 0, 0, 1, dx, dy], ctm);
  };

  const walk = (node: Node, ctm: Matrix, opacity: number, clip: Mask | null) => {
    for (const c of node.children) {
      if (c.tag === 'defs' || c.tag === 'clipPath' || c.tag === 'filter' || c.tag === 'linearGradient' || c.tag === 'radialGradient' || c.tag === 'stop') continue;
      const part = c.attrs['data-part'] ?? '';
      if (skipParts.some((p) => part.startsWith(p))) continue;
      if (skipFiltered && c.attrs.filter) continue;
      const m = rigMatrix(c, ctm);
      let own = Number(c.attrs.opacity ?? 1);
      if (o.minOpacity) for (const [prefix, floor] of Object.entries(o.minOpacity)) if (part.startsWith(prefix)) own = Math.max(own, floor);
      const op = opacity * own;
      let cl = clip;
      if (c.attrs['clip-path']) {
        const id = c.attrs['clip-path'].slice(5, -1);
        const mask = clipMask(id, m);
        if (cl) {
          const both = new Mask(o.width, o.height);
          for (let i = 0; i < both.data.length; i++) both.data[i] = cl.data[i] && mask.data[i] ? 1 : 0;
          cl = both;
        } else cl = mask;
      }
      if (c.tag === 'g' || c.tag === 'svg') {
        walk(c, m, op, cl);
        if (part.endsWith('eye')) {
          currentWhite = null;
          irisBox = null;
        }
        continue;
      }
      if (c.tag === 'path' || c.tag === 'ellipse' || c.tag === 'circle') {
        if (features && paintFeature(c, part, m, op, cl)) continue;
        paintFill(c, m, op, cl);
        paintStroke(c, m, op, cl);
      }
    }
  };
  walk(svgNode, base, 1, null);

  if (o.outline) {
    const mask = buf.opaqueMask();
    const grown = mask.dilate();
    for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (grown.get(x, y) && !mask.get(x, y)) buf.set(x, y, o.outline);
  }
  buf.validate();
  return buf;
}

function project(x: number, y: number, g: Gradient): number {
  const dx = g.x2 - g.x1;
  const dy = g.y2 - g.y1;
  const len2 = dx * dx + dy * dy || 1;
  return ((x - g.x1) * dx + (y - g.y1) * dy) / len2;
}

function line(x0: number, y0: number, x1: number, y1: number, put: (x: number, y: number) => void): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 10000; guard++) {
    put(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}
