import { describe, expect, it } from 'vitest';
import { generateGenome, renderBlobbiSvg, type BlobbiState } from '@blobbi-kit/renderer/procedural';
import { rasterizeSvg, svgSupportIssues } from '../src/blobbi/svg-raster';
import { buildCanonicalSprite, stateForPose } from '../src/blobbi/canonical';
import { REST_POSE, type BlobbiPose } from '../src/blobbi/pose';
import { hex, red, green, blue, alpha } from '../src/core/color';
import type { PixelBuffer } from '../src/core/pixel';

const SIZES = [12, 24, 48] as const;
const opts = (w: number, h: number) => ({ scale: 1, offsetX: 0, offsetY: 0, width: w, height: h, bands: 4 });
const diff = (a: PixelBuffer, b: PixelBuffer) => {
  let n = 0;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++;
  return n;
};
/** The first `n` demo seeds whose genome has a trait. */
function seedsWith(test: (g: ReturnType<typeof generateGenome>) => boolean, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < n; i++) if (test(generateGenome(`blobbi-${i}`))) out.push(`blobbi-${i}`);
  return out;
}
const GRADIENT = seedsWith((g) => g.traits.pattern.kind === 'gradient', 6);
const FRECKLES = seedsWith((g) => g.traits.freckles.enabled, 6);

describe('rasterizer: the SVG features the kit uses', () => {
  it('paints a rect, and a gradient with stop opacity as translucent bands over what is under it', () => {
    // A white square under a rect whose gradient runs from transparent black (top) to half-opaque black (bottom).
    const svg =
      '<svg viewBox="0 0 8 8"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="8">' +
      '<stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.5"/></linearGradient></defs>' +
      '<rect x="0" y="0" width="8" height="8" fill="#ffffff"/><rect x="0" y="0" width="8" height="8" fill="url(#g)"/></svg>';
    const buf = rasterizeSvg(svg, opts(8, 8));
    const row = (y: number) => red(buf.get(3, y));
    // Four bands (two rows each), getting darker downwards; the top band is the gradient's 1/16 opacity, not opaque.
    expect([row(0), row(2), row(4), row(6)]).toEqual([row(1), row(3), row(5), row(7)]);
    expect(row(0)).toBeGreaterThan(row(2));
    expect(row(2)).toBeGreaterThan(row(4));
    expect(row(4)).toBeGreaterThan(row(6));
    expect(row(0)).toBeGreaterThan(230); // nearly white: band centre 0.125 → 6% black
    expect(row(6)).toBeGreaterThan(140); // never more than half black
    for (let y = 0; y < 8; y++) expect(alpha(buf.get(3, y))).toBe(255);
  });

  it('a fully transparent stop paints nothing, even over an empty pixel', () => {
    const svg =
      '<svg viewBox="0 0 4 4"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff0000" stop-opacity="0"/><stop offset="1" stop-color="#ff0000" stop-opacity="0"/></linearGradient></defs>' +
      '<rect x="0" y="0" width="4" height="4" fill="url(#g)"/></svg>';
    expect(rasterizeSvg(svg, opts(4, 4)).opaqueCount()).toBe(0);
  });

  it('a shape without a fill takes its group\'s (inheritance); its own fill wins; opacity multiplies instead', () => {
    const svg =
      '<svg viewBox="0 0 12 4"><g fill="#00ff00"><circle cx="2" cy="2" r="1.6"/><circle cx="6" cy="2" r="1.6" fill="#0000ff"/></g>' +
      '<g fill="#ff0000" opacity="0.5"><g><circle cx="10" cy="2" r="1.6"/></g></g></svg>';
    const buf = rasterizeSvg(svg, opts(12, 4));
    expect(buf.get(2, 2)).toBe(hex('#00ff00'));
    expect(buf.get(6, 2)).toBe(hex('#0000ff'));
    // Nested inheritance; half opacity over an empty pixel stays solid pixel art (no partial alpha).
    expect(buf.get(10, 2)).toBe(hex('#ff0000'));
  });

  it('dot clusters: dots too small for a pixel are drawn one pixel each once their cluster spans a pixel, never below', () => {
    const trio = (s: number) => `<g data-part="dots" fill="#000000"><circle cx="${1 * s}" cy="2" r="${0.12 * s}"/><circle cx="${1.5 * s}" cy="2" r="${0.12 * s}"/><circle cx="${2 * s}" cy="2" r="${0.12 * s}"/></g>`;
    const paint = (s: number) => rasterizeSvg(`<svg viewBox="0 0 8 8"><rect x="0" y="0" width="8" height="8" fill="#ffffff"/>${trio(s)}</svg>`, { ...opts(8, 8), clusters: ['dots'] });
    const dark = (b: PixelBuffer) => b.data.filter((c) => red(c) < 128).length;
    // Spans 1.2 px: drawn (dots 0.5 px apart fall on 1-2 pixels). Spans 0.6 px: one pixel would stand for less than one.
    expect(dark(paint(1))).toBeGreaterThanOrEqual(1);
    expect(dark(paint(0.5))).toBe(0);
    // Without the cluster option the same dots are below the lone-shape threshold and vanish, as before.
    expect(rasterizeSvg(`<svg viewBox="0 0 8 8"><rect x="0" y="0" width="8" height="8" fill="#ffffff"/>${trio(1)}</svg>`, opts(8, 8)).data.filter((c) => red(c) < 128).length).toBe(0);
  });
});

describe('rasterizer: unsupported markup is reported, never dropped silently', () => {
  const cases: [string, string, RegExp][] = [
    ['an unknown element', '<svg viewBox="0 0 4 4"><text x="0" y="2">hi</text></svg>', /element <text>/],
    ['an unknown attribute', '<svg viewBox="0 0 4 4"><rect x="0" y="0" width="4" height="4" rx="1" fill="#000"/></svg>', /attribute rx on <rect>/],
    ['a fill-less shape', '<svg viewBox="0 0 4 4"><g opacity="0.5"><circle data-part="dot" cx="2" cy="2" r="1"/></g></svg>', /data-part="dot".*no fill/],
    ['a missing gradient', '<svg viewBox="0 0 4 4"><rect x="0" y="0" width="4" height="4" fill="url(#nope)"/></svg>', /refers to nothing/],
    ['an unknown colour syntax', '<svg viewBox="0 0 4 4"><rect x="0" y="0" width="4" height="4" fill="hsl(0,0%,0%)"/></svg>', /fill "hsl/],
    ['a path command it cannot flatten', '<svg viewBox="0 0 4 4"><path d="M0 0 S 1 1 2 2 Z" fill="#000"/></svg>', /S\/T/],
    ['a skew transform', '<svg viewBox="0 0 4 4"><g transform="skewX(3)"><circle cx="2" cy="2" r="1" fill="#000"/></g></svg>', /skewX/],
    ['a radial focal point', '<svg viewBox="0 0 4 4"><defs><radialGradient id="r" fx="0.2"><stop offset="0" stop-color="#000"/></radialGradient></defs><circle cx="2" cy="2" r="1" fill="url(#r)"/></svg>', /attribute fx/],
  ];
  for (const [label, svg, message] of cases)
    it(`refuses ${label}`, () => {
      expect(svgSupportIssues(svg).join('\n')).toMatch(message);
      expect(() => rasterizeSvg(svg, opts(4, 4))).toThrow(/unsupported markup/);
    });

  it('accepts every SVG the kit writes for the game: 150 seeds × 3 views × still/walk/idle, every expression and lid state', () => {
    const issues = new Set<string>();
    const expressions = ['happy', 'excited', 'sad', 'surprised', 'sleepy'] as const;
    for (let i = 0; i < 150; i++) {
      const genome = generateGenome(`blobbi-${i}`);
      const poses: BlobbiPose[] = [];
      for (const view of ['front', 'side', 'back'] as const) for (const walk of [-1, 2] as const) poses.push({ ...REST_POSE, view, walk, facing: i % 2 ? -1 : 1 });
      poses.push({ ...REST_POSE, breath: 1 });
      if (i < 20) for (const expression of expressions) poses.push({ ...REST_POSE, expression }, { ...REST_POSE, lid: 1 }, { ...REST_POSE, lid: 2 });
      for (const p of poses) for (const issue of svgSupportIssues(renderBlobbiSvg(genome, stateForPose(p) as Partial<BlobbiState>, { idPrefix: 'p' }))) issues.add(issue);
    }
    expect([...issues]).toEqual([]);
  });
});

describe('canonical traits reach the pixels', () => {
  it('the gradient pattern darkens the lower body at 12, 24 and 48 px, and only there', () => {
    expect(GRADIENT.length).toBe(6);
    for (const seed of GRADIENT) {
      const g = generateGenome(seed);
      for (const size of SIZES) {
        const on = buildCanonicalSprite(g, REST_POSE, size);
        const off = buildCanonicalSprite(g, REST_POSE, size, { skipParts: ['pattern'] });
        let changed = 0;
        let darker = 0;
        let top = Infinity;
        for (let y = 0; y < on.buffer.height; y++)
          for (let x = 0; x < on.buffer.width; x++) {
            const a = on.buffer.get(x, y);
            const b = off.buffer.get(x, y);
            if (a === b) continue;
            changed++;
            top = Math.min(top, y);
            if (red(a) + green(a) + blue(a) < red(b) + green(b) + blue(b)) darker++;
          }
        // Visible: a band of the body at 12 px, a broad one at 48 px.
        expect(changed, `${seed} ${size}`).toBeGreaterThanOrEqual(size >= 48 ? 150 : size >= 24 ? 40 : 10);
        expect(darker, `${seed} ${size}`).toBe(changed);
        // It starts below the eyes (the kit's band begins at 52% of the body), never on the crown.
        expect(on.anchorY - top, `${seed} ${size}`).toBeLessThan(size * 0.75);
      }
    }
  });

  it('freckles show at 24 and 48 px in the front and side views, in the kit\'s freckle colour; at 12 px they are under a pixel and are not drawn', () => {
    expect(FRECKLES.length).toBe(6);
    for (const seed of FRECKLES) {
      const g = generateGenome(seed);
      const paint = hex(/data-part="freckles" fill="(#[0-9a-f]{6})"/.exec(renderBlobbiSvg(g, { stage: 'adult' }, { idPrefix: 'p' }))![1]);
      for (const view of ['front', 'side'] as const)
        for (const size of SIZES) {
          const pose = { ...REST_POSE, view };
          const on = buildCanonicalSprite(g, pose, size).buffer;
          const off = buildCanonicalSprite(g, pose, size, { skipParts: ['freckles'] }).buffer;
          const changed: number[] = [];
          for (let i = 0; i < on.data.length; i++) if (on.data[i] !== off.data[i]) changed.push(on.data[i]);
          if (size === 12) expect(changed.length, `${seed} ${view} ${size}`).toBe(0);
          else {
            // Front: both cheeks (2-6 pixels); side: the near cheek (1-3).
            expect(changed.length, `${seed} ${view} ${size}`).toBeGreaterThanOrEqual(view === 'front' ? 2 : 1);
            expect(changed.length).toBeLessThanOrEqual(view === 'front' ? 6 : 3);
            for (const c of changed) expect(c).toBe(paint);
          }
        }
    }
  });

  it('the back view shows neither freckles nor face markings, as in the kit', () => {
    for (const seed of FRECKLES.slice(0, 3)) {
      const g = generateGenome(seed);
      const pose = { ...REST_POSE, view: 'back' as const };
      expect(diff(buildCanonicalSprite(g, pose, 48).buffer, buildCanonicalSprite(g, pose, 48, { skipParts: ['freckles'] }).buffer)).toBe(0);
    }
  });

  it('is deterministic: the same seed, pose and size give the same pixels, whatever was drawn before', () => {
    const seeds = [...GRADIENT.slice(0, 2), ...FRECKLES.slice(0, 2), 'blobbi-9'];
    for (const size of SIZES) {
      const first = seeds.map((s) => buildCanonicalSprite(generateGenome(s), { ...REST_POSE, walk: 3 }, size).buffer.data.join(','));
      const again = [...seeds].reverse().map((s) => buildCanonicalSprite(generateGenome(s), { ...REST_POSE, walk: 3 }, size).buffer.data.join(',')).reverse();
      expect(again).toEqual(first);
    }
  });

  it('distinct seeds stay distinct at every camera size (120 seeds, front view)', () => {
    for (const size of SIZES) {
      const seen = new Set<string>();
      for (let i = 0; i < 120; i++) seen.add(buildCanonicalSprite(generateGenome(`blobbi-${i}`), REST_POSE, size).buffer.data.join(','));
      expect(seen.size, `${size}`).toBe(120);
    }
  });
});
