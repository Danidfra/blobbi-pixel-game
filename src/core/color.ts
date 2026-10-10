/**
 * Colour math. Colours travel the pipeline as packed 32-bit RGBA integers in
 * ImageData byte order (little-endian: A<<24 | B<<16 | G<<8 | R), so a
 * PixelBuffer can be a Uint32Array and blit straight into a canvas.
 * OKLCH is used for RAMP DERIVATION only (shadow hue shifts), never per pixel.
 */

export type Color = number;
export const TRANSPARENT: Color = 0;

// `>>> 0` keeps the value unsigned, so a colour compares equal to what a Uint32Array hands back.
export const rgba = (r: number, g: number, b: number, a = 255): Color =>
  (((a & 0xff) << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff)) >>> 0;

export function hex(h: string): Color {
  const s = h.startsWith('#') ? h.slice(1) : h;
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return rgba((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 255);
}

export const red = (c: Color) => c & 0xff;
export const green = (c: Color) => (c >>> 8) & 0xff;
export const blue = (c: Color) => (c >>> 16) & 0xff;
export const alpha = (c: Color) => (c >>> 24) & 0xff;

export function toHex(c: Color): string {
  return `#${[red(c), green(c), blue(c)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// ─── OKLCH (for building ramps) ──────────────────────────────────────────────

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const wrap = (h: number) => ((h % 360) + 360) % 360;

export function toOklch(c: Color): Oklch {
  const r = toLinear(red(c) / 255);
  const g = toLinear(green(c) / 255);
  const b = toLinear(blue(c) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: wrap((Math.atan2(B, A) * 180) / Math.PI) };
}

function oklchToLinear({ l: L, c, h }: Oklch): [number, number, number] {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

export function maxChroma(l: number, h: number): number {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear({ l, c: mid, h }))) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function fromOklch(color: Oklch): Color {
  const l = Math.min(1, Math.max(0, color.l));
  const c = Math.min(Math.max(0, color.c), maxChroma(l, color.h));
  const [r, g, b] = oklchToLinear({ l, c, h: color.h }).map((v) => Math.round(Math.min(1, Math.max(0, toGamma(v))) * 255));
  return rgba(r, g, b, 255);
}

/** Shift a colour in OKLCH: lightness delta, chroma multiplier, hue delta (degrees). */
export function shift(c: Color, dl: number, cm = 1, dh = 0): Color {
  const o = toOklch(c);
  return fromOklch({ l: o.l + dl, c: o.c * cm, h: wrap(o.h + dh) });
}

/** Mix two colours in linear-ish sRGB (fine for subtle blends at ramp-build time). */
export function mix(a: Color, b: Color, t: number): Color {
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return rgba(m(red(a), red(b)), m(green(a), green(b)), m(blue(a), blue(b)), m(alpha(a), alpha(b)));
}
