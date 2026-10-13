/**
 * M11D.1, THE V1 BABY (and the V2 baby, which the kit draws with the same art: "Baby V2 is not designed yet").
 *
 * A V1 or V2 Blobbi has no V3 genome: its look is the kit's one authored baby droplet, painted with the three
 * colours its event states (`base_color`, `secondary_color`, `eye_color`). The pixel game draws exactly that
 * drawing: `renderBlobbiSvg({ stage: 'baby', visualGeneration })` from `@blobbi-kit/renderer`, rasterized with the
 * same pixel rules as the V3 Blobbi. Nothing is invented and no V3 creature stands in for it.
 *
 * The authored file predates the kit's part names and writes stop colours as CSS. `pixelDialect` rewrites it,
 * shape for shape, into the rasterizer's dialect: stop styles become attributes, named and rgba colours become
 * colours with an opacity, and the shapes get the part names the feature rules read (eye whites, pupils,
 * highlights, the mouth, the cheeks), regrouped eye by eye. Geometry and colours are untouched. Anything in the
 * markup it does not recognise makes it refuse (an exception), never guess: a kit update that changes the file is
 * caught by the tests, not drawn wrongly.
 *
 * What the V1 art has, and so what the pixel V1 baby can show: a front and a back drawing (no profile: the kit
 * draws the front for a side facing too), open or sleeping eyes, no expressions (the kit's expression is a no-op on
 * V1), no walk rig (the hop is the pixel game's whole-pixel lift, as for V3 babies).
 */
import { renderBlobbiSvg } from '@blobbi-kit/renderer';
import type { Sprite } from '../core/pixel';
import { hex, shift } from '../core/color';
import { rasterizeSvg } from './svg-raster';
import { babyHeightFor, babyHopFor } from './canonical';
import type { BlobbiPose } from './pose';

export interface V1Colors {
  base: string;
  secondary: string;
  eye: string;
}

/** The V1 baby art's own measurements (viewBox 0 0 100 100): the droplet from its crown to its lowest point. */
const V1_TOP = 12.5;
const V1_BOTTOM = 88;
const V1_VIEWBOX = 100;

/** The kit's baby drawing for these colours and pose, as the kit writes it. V2 resolves to the same V1 art. */
export function kitV1BabySvg(colors: V1Colors, pose: BlobbiPose, generation: 'v1' | 'v2' = 'v1'): string {
  return renderBlobbiSvg({
    stage: 'baby',
    visualGeneration: generation,
    baseColor: colors.base,
    secondaryColor: colors.secondary,
    eyeColor: colors.eye,
    facing: pose.view === 'back' ? 'back' : 'front',
    eyesClosed: pose.lid === 2,
    sleepIndicator: 'none',
  }).svg;
}

const attr = (el: string, name: string): string | undefined => new RegExp(`\\s${name}="([^"]*)"`).exec(el)?.[1];

/** `rgba(r,g,b,a)` → `rgb(r,g,b)` plus an opacity; `white` → `#ffffff`; anything else as written. */
function paint(value: string | undefined): { color: string | undefined; opacity: number } {
  if (value === undefined) return { color: undefined, opacity: 1 };
  if (value === 'white') return { color: '#ffffff', opacity: 1 };
  const m = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(value);
  if (m) return { color: `rgb(${m[1]},${m[2]},${m[3]})`, opacity: Number(m[4]) };
  return { color: value, opacity: 1 };
}

/** Rewrite the authored V1 baby into the rasterizer's dialect (see the module comment). Throws on anything unknown. */
export function pixelDialect(svg: string): string {
  const clean = svg.replace(/<\?xml[^>]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const defsMatch = /<defs>([\s\S]*?)<\/defs>/.exec(clean);
  const defs = (defsMatch?.[1] ?? '')
    .replace(/offset="([\d.]+)%"/g, (_m, p: string) => `offset="${Number(p) / 100}"`)
    .replace(/style="([^"]*)"/g, (_m, style: string) =>
      style
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const [k, v] = d.split(':').map((x) => x.trim());
          if (k !== 'stop-color' && k !== 'stop-opacity') throw new Error(`v1-baby: unknown stop style ${k}`);
          return `${k}="${v}"`;
        })
        .join(' '),
    );
  const body = clean.replace(/<defs>[\s\S]*?<\/defs>/, '');
  for (const m of body.matchAll(/<([a-zA-Z][\w-]*)\b/g)) if (!['svg', 'path', 'ellipse', 'circle'].includes(m[1])) throw new Error(`v1-baby: unknown shape <${m[1]}>`);
  const shapes = [...body.matchAll(/<(path|ellipse|circle)\b([^>]*?)\/>/g)].map((m) => ({ tag: m[1], el: m[0], attrs: m[2] }));
  const out = { body: [] as string[], left: [] as string[], right: [] as string[], face: [] as string[] };
  const emit = (tag: string, el: string, part: string, extra: Record<string, string | undefined> = {}) => {
    const keep = ['d', 'cx', 'cy', 'rx', 'ry', 'r', 'stroke', 'stroke-width', 'stroke-linecap'];
    const fill = paint(attr(el, 'fill'));
    const opacity = Number(attr(el, 'opacity') ?? 1) * fill.opacity;
    const parts = [`data-part="${part}"`];
    for (const k of keep) {
      const v = attr(el, k);
      if (v !== undefined) parts.push(`${k}="${v.replace(/\s+/g, ' ').trim()}"`);
    }
    if (fill.color !== undefined) parts.push(`fill="${fill.color}"`);
    if (opacity !== 1) parts.push(`opacity="${opacity}"`);
    for (const [k, v] of Object.entries(extra)) if (v !== undefined) parts.push(`${k}="${v}"`);
    return `<${tag} ${parts.join(' ')}/>`;
  };
  for (const { tag, el } of shapes) {
    const fill = attr(el, 'fill');
    const stroke = attr(el, 'stroke');
    const cx = Number(attr(el, 'cx') ?? 50);
    const side = cx < 50 ? 'left' : 'right';
    if (tag === 'path' && fill === 'url(#blobbiBodyGradient)') out.body.push(emit(tag, el, 'body-base'));
    else if (tag === 'ellipse' && fill === 'white') out.body.push(emit(tag, el, 'body-glow'));
    else if (tag === 'ellipse' && fill === 'url(#blobbiEyeGradient)') out[side].unshift(emit(tag, el, `${side}-eye-white`));
    else if (tag === 'circle' && fill === 'url(#blobbiPupilGradient)') out[side].push(emit(tag, el, `${side}-pupil`));
    else if (tag === 'circle' && fill === 'white') out[side].push(emit(tag, el, `${side}-eye-highlight-primary`));
    else if (tag === 'ellipse' && fill?.startsWith('rgba(')) out.face.push(emit(tag, el, `${side}-cheek`));
    else if (tag === 'path' && stroke === 'url(#blobbiMouthGradient)' && fill === 'none') {
      // The open-eyed mouth sits low (y 62); the sleeping drawing's two closed-eye arcs sit on the eye line (y 45).
      const y = Number(/M\s*[\d.]+\s+([\d.]+)/.exec(attr(el, 'd') ?? '')?.[1] ?? 0);
      out.face.push(emit(tag, el, y > 55 ? 'mouth' : `${(attr(el, 'd') ?? '').includes('M 30') ? 'left' : 'right'}-eye-closed`));
    } else if (tag === 'circle' && fill === 'url(#blobbiMouthGradient)') out.face.push(emit(tag, el, 'mouth-dot'));
    else throw new Error(`v1-baby: unknown shape ${el.slice(0, 80)}`);
  }
  // Eye groups in drawing order (white, pupil, highlight), so each pupil is painted inside its own white.
  const eye = (side: 'left' | 'right') => (out[side].length ? `<g data-part="${side}-eye">${out[side].join('')}</g>` : '');
  return `<svg viewBox="0 0 ${V1_VIEWBOX} ${V1_VIEWBOX}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs><g data-part="character">${out.body.join('')}${eye('left')}${eye('right')}${out.face.join('')}</g></svg>`;
}

/**
 * The pixel V1 (or V2) baby: the kit's art for these colours, as tall as a V3 baby drawn for the same adult `size`,
 * with the same whole-pixel hop. Its ground point is under the droplet's lowest point.
 */
export function buildV1BabySprite(colors: V1Colors, pose: BlobbiPose, size: number, generation: 'v1' | 'v2' = 'v1'): Sprite & { svg: string } {
  const height = babyHeightFor(size);
  const scale = height / (V1_BOTTOM - V1_TOP);
  const margin = 2;
  const width = Math.ceil(V1_VIEWBOX * scale) + margin * 2;
  const svg = pixelDialect(kitV1BabySvg(colors, pose, generation));
  // The art's outer colour is the base colour (the gradient's edge stop): the outline is a darker step of it.
  const outline = shift(hex(colors.base), -0.3, 1.05, 6);
  const top = Math.floor(V1_TOP * scale);
  const buffer = rasterizeSvg(svg, {
    scale,
    offsetX: margin,
    offsetY: margin - top,
    width,
    height: height + margin * 2 + 1,
    bands: 4,
    outline,
    insideBody: ['left-cheek', 'right-cheek'],
  });
  const anchorX = Math.round(50 * scale + margin);
  const anchorY = Math.round(V1_BOTTOM * scale + margin - top) + babyHopFor(pose.walk, height);
  return { buffer, anchorX, anchorY, footRx: Math.max(2, Math.round(25 * scale * 0.7)), footRy: 2, svg };
}
