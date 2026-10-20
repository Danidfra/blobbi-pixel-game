/**
 * THE BLOBBI APP ICON FAMILY. One generator for the icons of Blobbi Pixel (this game), Blobbi Home, Blobbi Island
 * and Nostr Farm, so the four read as one family beside Blobbi Rumble's existing icon (blobbi-3d, `icon.html`), whose
 * composition rules this follows: the canonical Blobbi (every gene at zero, the authored purple adult), happy, on a
 * light radial background; the character fills 80 % of an "any" icon, 60 % of a maskable one (inside Android's safe
 * circle), 78 % of the Apple touch icon and 92 % of the 32 px favicon.
 *
 *   Pixel    the game's own pixel Blobbi (`buildBlobbiSprite`, the canonical genome) on a small grass island in the
 *            sea, every size a whole-pixel enlargement of a scene drawn at icon resolution: no smoothing, ever.
 *   Home     the kit's vector Blobbi on a warm rose background, a small heart beside it: the classic one.
 *   Island   the same Blobbi on a sandy island under a tropical sky: palm, sun, sea.
 *   Farm     the same Blobbi in a straw hat on a green field, a sprout at its feet (the sprout is Nostr Farm's own).
 *
 * Each vector app gets an editable SVG source (`icon.svg`) and the PNGs rasterized from THAT source with resvg; edit
 * the SVG and run the `--svg` mode to rasterize it again. Every PNG is written at the sizes a web app needs:
 *
 *   icon-192.png, icon-512.png      "any"
 *   icon-512-maskable.png           maskable (the character in the 80 % safe zone)
 *   apple-touch-icon.png (180)      opaque, full bleed (iOS rounds the corners)
 *   favicon-32.png, icon.svg        the browser tab (the SVG has rounded corners)
 *
 * Usage (from this repository):
 *   npx tsx scripts/app-icons.ts                      Pixel's icons into public/icons/ (what `npm run icons` does)
 *   npx tsx scripts/app-icons.ts --family <dir>       Home, Island and Farm sets into <dir>/<app>/ (copy them into
 *                                                     each repository's public/icons/)
 *   npx tsx scripts/app-icons.ts --svg <icon.svg> --out <dir>   rasterize an edited SVG source again
 *
 * The destination cards of the World Travel menus use each app's `icon-192.png` as it is, copied into every app
 * under public/icons/worlds/<world id>.png (Rumble's comes from blobbi-3d/public/icons/icon-192.png unchanged).
 * Nothing here changes how any game draws a Blobbi.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { canonicalGenome, renderBlobbiSvg } from '@blobbi-kit/renderer/procedural';
import { PixelBuffer } from '../src/core/pixel';
import { hex, type Color } from '../src/core/color';
import { toPng } from '../src/node/png';
import { identityFromGenome } from '../src/blobbi/identity';
import { buildBlobbiSprite, REST_POSE } from '../src/blobbi/sprite';

// ─── The kit's Blobbi as a vector, placed in an icon ────────────────────────

/** The kit's canonical adult, happy, as an SVG fragment with its own viewBox (no width or height). */
function kitBlobbi(idPrefix: string): { svg: string; viewBox: [number, number, number, number] } {
  const svg = renderBlobbiSvg(canonicalGenome(), { expression: { happy: 1 }, gaze: { x: 0.1, y: 0.05 } }, { idPrefix });
  const vb = svg.match(/viewBox="([^"]+)"/)?.[1].split(/\s+/).map(Number) as [number, number, number, number] | undefined;
  if (!vb || vb.length !== 4) throw new Error('the kit SVG has no viewBox');
  return { svg, viewBox: vb };
}

/**
 * The character's own box inside the kit's viewBox (its drawing has margins): measured once by rasterizing it alone,
 * so the icon's fill rules speak of the character, not of the document.
 */
function characterBox(svg: string, viewBox: [number, number, number, number]): { x: number; y: number; w: number; h: number } {
  const px = 400;
  const png = new Resvg(svg.replace(/ width="100%" height="100%"/, ''), { fitTo: { mode: 'width', value: px } }).render();
  const data = png.pixels;
  const width = png.width;
  const height = png.height;
  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 40) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  const s = viewBox[2] / width;
  return { x: viewBox[0] + x0 * s, y: viewBox[1] + y0 * s, w: (x1 - x0 + 1) * s, h: (y1 - y0 + 1) * s };
}

/** The Blobbi nested in an icon of `size`, its larger side `fill` of the icon, its feet at `groundY` (a fraction). */
function placeBlobbi(size: number, fill: number, groundY: number, idPrefix: string): { markup: string; box: { x: number; y: number; w: number; h: number } } {
  const { svg, viewBox } = kitBlobbi(idPrefix);
  const box = characterBox(svg, viewBox);
  const scale = (size * fill) / Math.max(box.w, box.h);
  const w = box.w * scale;
  const h = box.h * scale;
  const x = (size - w) / 2;
  const y = size * groundY - h;
  // The nested document keeps the kit's viewBox; it is offset so the character's box lands where asked.
  const docW = viewBox[2] * scale;
  const docH = viewBox[3] * scale;
  const docX = x - (box.x - viewBox[0]) * scale;
  const docY = y - (box.y - viewBox[1]) * scale;
  const inner = svg.replace(/^<svg [^>]*>/, `<svg x="${r(docX)}" y="${r(docY)}" width="${r(docW)}" height="${r(docH)}" viewBox="${viewBox.join(' ')}" xmlns="http://www.w3.org/2000/svg">`);
  return { markup: inner, box: { x, y, w, h } };
}

const r = (n: number) => Math.round(n * 100) / 100;

// ─── The three vector icons ─────────────────────────────────────────────────

export type VectorApp = 'home' | 'island' | 'farm';
type Variant = 'any' | 'maskable' | 'apple' | 'favicon';
const FILL: Record<Variant, number> = { any: 0.8, maskable: 0.6, apple: 0.78, favicon: 0.86 };

/** The icon of a vector app as SVG, `size` square, the character sized for the variant. */
export function vectorIcon(app: VectorApp, variant: Variant, size = 512): string {
  const fill = FILL[variant];
  const rounded = variant === 'favicon';
  const id = `${app}-${variant}`;
  const clip = rounded ? ` clip-path="url(#${id}-corners)"` : '';
  const corners = rounded ? `<clipPath id="${id}-corners"><rect width="${size}" height="${size}" rx="${r(size * 0.2)}"/></clipPath>` : '';
  const S = size;
  const parts: string[] = [];
  if (app === 'home') {
    // Warm rose, light in the middle; a small heart floating by the Blobbi: the classic, welcoming one.
    const ground = 0.5 + fill * 0.56;
    const b = placeBlobbi(S, fill, ground, id);
    const hx = b.box.x + b.box.w * 1.02;
    const hy = b.box.y + b.box.h * 0.14;
    const hs = b.box.w * 0.2;
    parts.push(
      `<defs>${corners}<radialGradient id="${id}-bg" cx="0.5" cy="0.42" r="0.75"><stop offset="0" stop-color="#fff8f3"/><stop offset="0.55" stop-color="#ffe0e6"/><stop offset="1" stop-color="#ffb9c8"/></radialGradient></defs>`,
      `<g${clip}><rect width="${S}" height="${S}" fill="url(#${id}-bg)"/>`,
      b.markup,
      heart(hx, hy, hs, '#ff6f9c'),
      `</g>`,
    );
  } else if (app === 'island') {
    // A tropical sky over the sea, a sandy island with one palm, the sun in the corner.
    const ground = 0.5 + fill * 0.42;
    const b = placeBlobbi(S, fill * 0.86, ground, id);
    const sandW = Math.max(b.box.w * 1.8, S * 0.5);
    const sandH = sandW * 0.28;
    const cy = S * ground - sandH * 0.08;
    const palmX = S / 2 + sandW * 0.37;
    const palmBase = cy + sandH * 0.08;
    const palmH = b.box.h * 0.82;
    parts.push(
      `<defs>${corners}<linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eefbff"/><stop offset="0.55" stop-color="#a9e2ff"/><stop offset="1" stop-color="#7fcff6"/></linearGradient>` +
        `<linearGradient id="${id}-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5cc3ef"/><stop offset="1" stop-color="#2f93d1"/></linearGradient></defs>`,
      `<g${clip}><rect width="${S}" height="${S}" fill="url(#${id}-sky)"/>`,
      `<rect y="${r(cy - sandH * 0.1)}" width="${S}" height="${r(S - cy + sandH)}" fill="url(#${id}-sea)"/>`,
      // Two soft wave lines
      `<path d="M0 ${r(cy + sandH * 0.95)} q ${r(S * 0.08)} ${r(-S * 0.02)} ${r(S * 0.16)} 0 t ${r(S * 0.16)} 0 t ${r(S * 0.16)} 0 t ${r(S * 0.16)} 0 t ${r(S * 0.16)} 0 t ${r(S * 0.16)} 0" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="${r(S * 0.012)}" stroke-linecap="round"/>`,
      sun(S * 0.17, S * 0.18, S * 0.085),
      // The island: sand with a wet edge, a bit of grass on top
      `<ellipse cx="${r(S / 2)}" cy="${r(cy)}" rx="${r(sandW / 2)}" ry="${r(sandH / 2)}" fill="#e9c77a"/>`,
      `<ellipse cx="${r(S / 2)}" cy="${r(cy - sandH * 0.06)}" rx="${r(sandW / 2 - S * 0.012)}" ry="${r(sandH / 2 - S * 0.012)}" fill="#f8dd91"/>`,
      `<ellipse cx="${r(S / 2 - sandW * 0.06)}" cy="${r(cy - sandH * 0.1)}" rx="${r(sandW * 0.3)}" ry="${r(sandH * 0.24)}" fill="#8ed16b"/>`,
      palm(palmX, palmBase, palmH),
      b.markup,
      `</g>`,
    );
  } else {
    // A green field (Nostr Farm's green), the Blobbi in a straw hat, Nostr Farm's own sprout at its feet.
    const ground = 0.5 + fill * 0.54;
    const b = placeBlobbi(S, fill * 0.94, ground, id);
    const hatW = b.box.w * 0.78;
    const hatCx = b.box.x + b.box.w * 0.5;
    const hatCy = b.box.y + b.box.h * 0.15;
    const sproutS = b.box.h * 0.4;
    const sproutX = b.box.x + b.box.w * 1.04 + sproutS * 0.12;
    const sproutY = S * ground - sproutS * 0.9;
    parts.push(
      `<defs>${corners}<radialGradient id="${id}-bg" cx="0.5" cy="0.4" r="0.78"><stop offset="0" stop-color="#d9f3a6"/><stop offset="0.55" stop-color="#9ad468"/><stop offset="1" stop-color="#4F8A3A"/></radialGradient></defs>`,
      `<g${clip}><rect width="${S}" height="${S}" fill="url(#${id}-bg)"/>`,
      // A soil strip the field stands on, low and soft
      `<rect x="${r(-S * 0.05)}" y="${r(S * ground + b.box.h * 0.02)}" width="${r(S * 1.1)}" height="${r(S)}" rx="${r(S * 0.04)}" fill="#8B5A2B" fill-opacity="0.9"/>`,
      `<rect x="${r(-S * 0.05)}" y="${r(S * ground + b.box.h * 0.02)}" width="${r(S * 1.1)}" height="${r(S * 0.02)}" fill="#6f4520"/>`,
      b.markup,
      strawHat(hatCx, hatCy, hatW),
      sprout(sproutX, sproutY, sproutS),
      `</g>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">${parts.join('')}</svg>`;
}

function heart(x: number, y: number, s: number, fill: string): string {
  // A heart `s` wide, its top lobes at (x, y)
  const d = `M${r(x)} ${r(y + s * 0.3)} c ${r(-s * 0.5)} ${r(-s * 0.55)} ${r(-s * 0.95)} ${r(s * 0.1)} 0 ${r(s * 0.7)} c ${r(s * 0.95)} ${r(-s * 0.6)} ${r(s * 0.5)} ${r(-s * 1.25)} 0 ${r(-s * 0.7)} z`;
  return `<path d="${d}" fill="${fill}" transform="rotate(14 ${r(x)} ${r(y + s * 0.5)})"/>`;
}

function sun(cx: number, cy: number, rad: number): string {
  return `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(rad * 1.45)}" fill="#fff4b0" fill-opacity="0.55"/><circle cx="${r(cx)}" cy="${r(cy)}" r="${r(rad)}" fill="#ffe169"/>`;
}

function palm(x: number, base: number, h: number): string {
  const top = base - h;
  const trunk = `<path d="M${r(x)} ${r(base)} q ${r(h * 0.12)} ${r(-h * 0.55)} ${r(h * 0.1)} ${r(-h)}" fill="none" stroke="#9a6b3e" stroke-width="${r(h * 0.09)}" stroke-linecap="round"/>`;
  const tx = x + h * 0.1;
  const leaf = (a: number, len: number) => {
    const rad = (a * Math.PI) / 180;
    const ex = tx + Math.cos(rad) * len;
    const ey = top + Math.sin(rad) * len;
    const mx = tx + Math.cos(rad - 0.45) * len * 0.55;
    const my = top + Math.sin(rad - 0.45) * len * 0.55;
    return `<path d="M${r(tx)} ${r(top)} Q ${r(mx)} ${r(my)} ${r(ex)} ${r(ey)} Q ${r(tx + Math.cos(rad + 0.25) * len * 0.5)} ${r(top + Math.sin(rad + 0.25) * len * 0.5)} ${r(tx)} ${r(top)} z" fill="#2fae5c"/>`;
  };
  const L = h * 0.5;
  return trunk + [200, 235, 300, 340, 15, 50].map((a, i) => leaf(a, L * (i % 2 ? 0.9 : 1))).join('') + `<circle cx="${r(tx)}" cy="${r(top + h * 0.02)}" r="${r(h * 0.05)}" fill="#7a4f2a"/>`;
}

function strawHat(cx: number, cy: number, w: number): string {
  const brimRy = w * 0.13;
  const domeW = w * 0.56;
  const domeH = w * 0.3;
  return (
    `<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="${r(w / 2)}" ry="${r(brimRy)}" fill="#e9c46a" stroke="#c99a3d" stroke-width="${r(w * 0.02)}"/>` +
    `<path d="M${r(cx - domeW / 2)} ${r(cy)} v ${r(-domeH * 0.35)} a ${r(domeW / 2)} ${r(domeH * 0.65)} 0 0 1 ${r(domeW)} 0 v ${r(domeH * 0.35)} z" fill="#f0d27d" stroke="#c99a3d" stroke-width="${r(w * 0.02)}"/>` +
    `<rect x="${r(cx - domeW / 2)}" y="${r(cy - domeH * 0.36)}" width="${r(domeW)}" height="${r(domeH * 0.17)}" fill="#a2683a"/>` +
    `<ellipse cx="${r(cx)}" cy="${r(cy + brimRy * 0.15)}" rx="${r(w / 2 - w * 0.02)}" ry="${r(brimRy * 0.5)}" fill="#c99a3d" fill-opacity="0.35"/>`
  );
}

/** Nostr Farm's own sprout (its favicon's leaves and stem), `s` tall, its soil at (x, y + s). */
function sprout(x: number, y: number, s: number): string {
  const k = s / 40;
  return `<g transform="translate(${r(x)} ${r(y)}) scale(${r(k)}) translate(-32 -14)"><path d="M32 44V27" stroke="#FBF6EA" stroke-width="4" stroke-linecap="round"/><path d="M32 30c-2-8-8-11-14-10 1 7 6 11 14 10z" fill="#FBF6EA"/><path d="M32 24c2-8 8-11 14-10-1 7-6 11-14 10z" fill="#FBF6EA"/><path d="M32 36c-2-6-7-8-11-7 1 5 5 8 11 7z" fill="#C98A22"/></g>`;
}

export function rasterize(svg: string, size: number): Buffer {
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
}

// ─── The pixel icon (this game's own) ───────────────────────────────────────

const PIX = {
  skyTop: hex('#9ddcff'),
  skyLow: hex('#c3ecff'),
  seaDeep: hex('#2d7fc4'),
  sea: hex('#3f98d8'),
  seaLight: hex('#6fb9e8'),
  foam: hex('#d9f2ff'),
  sand: hex('#e8d38a'),
  sandDark: hex('#c9ad62'),
  grass: hex('#78d04c'),
  grassDark: hex('#55a83a'),
  grassLight: hex('#95dd64'),
  sun: hex('#ffe169'),
  sunGlow: hex('#fff2b0'),
};

/**
 * The scene at icon resolution (`base` px square): sky, sea, a grass island with a sandy shore, the canonical pixel
 * Blobbi standing on it, its height `fill` of the icon. Every output size is a whole-pixel enlargement of a scene.
 */
export function pixelScene(base: number, fill: number): PixelBuffer {
  const b = new PixelBuffer(base, base);
  const horizon = Math.round(base * 0.46);
  for (let y = 0; y < base; y++) {
    const c: Color = y < horizon ? (y < horizon * 0.55 ? PIX.skyTop : PIX.skyLow) : y < horizon + Math.max(1, base * 0.04) ? PIX.seaLight : y > base * 0.86 ? PIX.seaDeep : PIX.sea;
    b.hline(0, base - 1, y, c);
  }
  // Foam flecks on the sea, placed by a fixed pattern (the same icon every run)
  for (let i = 0; i < Math.max(3, base / 6); i++) {
    const fx = (i * 37 + 11) % base;
    const fy = horizon + Math.round(base * 0.06) + ((i * 53) % Math.max(1, Math.round(base * 0.42)));
    if (fy < base - 1) b.hline(fx, Math.min(base - 1, fx + Math.max(1, Math.round(base / 40))), fy, PIX.foam);
  }
  // The sun, top left
  const sr = Math.max(2, Math.round(base * 0.07));
  b.fillEllipse(base * 0.2, base * 0.2, sr + 1, sr + 1, PIX.sunGlow);
  b.fillEllipse(base * 0.2, base * 0.2, sr, sr, PIX.sun);
  // The island
  const id = identityFromGenome(canonicalGenome());
  const height = Math.max(10, Math.round(base * fill));
  const sprite = buildBlobbiSprite(id, { ...REST_POSE, expression: 'happy' }, height);
  const groundY = Math.round(base * (0.5 + fill * 0.5));
  const rx = Math.max(sprite.footRx * 2.8, base * 0.34);
  const ry = Math.max(3, Math.round(rx * 0.34));
  const cx = Math.floor(base / 2) + 0.5;
  b.fillEllipse(cx, groundY + 0.5, rx + 2, ry + 1, PIX.sandDark);
  b.fillEllipse(cx, groundY - 0.5, rx + 1, ry, PIX.sand);
  b.fillEllipse(cx, groundY - 1.5, rx - 2, Math.max(2, ry - 2), PIX.grassDark);
  b.fillEllipse(cx, groundY - 2.5, rx - 3, Math.max(1, ry - 3), PIX.grass);
  if (base >= 48) b.fillEllipse(cx - rx * 0.2, groundY - 3.5, rx * 0.35, Math.max(1, ry - 4), PIX.grassLight);
  // The Blobbi's shadow, then the Blobbi, its ground point on the island's top
  const standY = groundY - 2;
  b.fillEllipse(cx, standY + 0.5, sprite.footRx + 1, 2, PIX.grassDark);
  b.blit(sprite.buffer, Math.floor(cx) - sprite.anchorX, standY - sprite.anchorY);
  return b;
}

/** A pixel scene as an SVG of whole-pixel rects (crisp at any size, the browser tab included). */
export function pixelSvg(scene: PixelBuffer, rounded: boolean): string {
  const rows: string[] = [];
  for (let y = 0; y < scene.height; y++) {
    let x = 0;
    while (x < scene.width) {
      const c = scene.get(x, y);
      let x1 = x + 1;
      while (x1 < scene.width && scene.get(x1, y) === c) x1++;
      const a = (c >>> 24) & 255;
      if (a > 0) {
        const fill = `#${((c & 255) | 0).toString(16).padStart(2, '0')}${((c >>> 8) & 255).toString(16).padStart(2, '0')}${((c >>> 16) & 255).toString(16).padStart(2, '0')}`;
        rows.push(`<rect x="${x}" y="${y}" width="${x1 - x}" height="1" fill="${fill}"${a < 255 ? ` fill-opacity="${(a / 255).toFixed(2)}"` : ''}/>`);
      }
      x = x1;
    }
  }
  const S = scene.width;
  const clip = rounded ? `<clipPath id="corners"><rect width="${S}" height="${S}" rx="${r(S * 0.2)}"/></clipPath>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" shape-rendering="crispEdges"><defs>${clip}</defs><g${rounded ? ' clip-path="url(#corners)"' : ''}>${rows.join('')}</g></svg>`;
}

// ─── The sets ───────────────────────────────────────────────────────────────

const write = (dir: string, name: string, data: Buffer | string) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), data);
  console.log(`wrote ${join(dir, name)}`);
};

/** Pixel's own set: scenes at 64 (×3 = 192, ×8 = 512), 60 (×3 = 180) and 32 px. */
export function writePixelSet(dir: string): void {
  const any = pixelScene(64, 0.5);
  write(dir, 'icon-192.png', toPng(any.scaled(3)));
  write(dir, 'icon-512.png', toPng(any.scaled(8)));
  write(dir, 'icon-512-maskable.png', toPng(pixelScene(64, 0.38).scaled(8)));
  write(dir, 'apple-touch-icon.png', toPng(pixelScene(60, 0.5).scaled(3)));
  const small = pixelScene(32, 0.56);
  write(dir, 'favicon-32.png', toPng(small));
  write(dir, 'icon.svg', pixelSvg(any, true));
}

export function writeVectorSet(app: VectorApp, dir: string): void {
  const source = vectorIcon(app, 'any');
  write(dir, 'icon.svg', vectorIcon(app, 'favicon'));
  write(dir, 'icon-source.svg', source);
  write(dir, 'icon-192.png', rasterize(source, 192));
  write(dir, 'icon-512.png', rasterize(source, 512));
  write(dir, 'icon-512-maskable.png', rasterize(vectorIcon(app, 'maskable'), 512));
  write(dir, 'apple-touch-icon.png', rasterize(vectorIcon(app, 'apple'), 180));
  write(dir, 'favicon-32.png', rasterize(vectorIcon(app, 'favicon'), 32));
}

function main(argv: string[]): void {
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const svgPath = arg('--svg');
  if (svgPath) {
    const out = arg('--out') ?? '.';
    const svg = readFileSync(svgPath, 'utf8');
    write(out, 'icon-192.png', rasterize(svg, 192));
    write(out, 'icon-512.png', rasterize(svg, 512));
    write(out, 'apple-touch-icon.png', rasterize(svg, 180));
    write(out, 'favicon-32.png', rasterize(svg, 32));
    return;
  }
  const family = arg('--family');
  if (family) {
    for (const app of ['home', 'island', 'farm'] as const) writeVectorSet(app, join(family, app));
    return;
  }
  writePixelSet(arg('--out') ?? join('public', 'icons'));
}

const direct = process.argv[1] && /app-icons\.ts$/.test(process.argv[1]);
if (direct) main(process.argv.slice(2));
