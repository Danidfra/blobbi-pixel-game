/**
 * The installable page: a valid web app manifest the page links to, icons that exist at the sizes they claim (a
 * maskable one among them), the Apple touch icon and favicons in the page's head, the policy that lets the manifest
 * load, and no service worker (a cached game is a stale game; nothing here caches anything).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { CSP } from '../vite.config';
import { pngSize } from './helpers/png';

const html = readFileSync('index.html', 'utf8');
const manifest = JSON.parse(readFileSync(join('public', 'manifest.webmanifest'), 'utf8')) as {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};

describe('the web app manifest', () => {
  it('names the app, starts at the root, opens standalone, and the page links to it', () => {
    expect(manifest.name).toBe('Blobbi Pixel');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain(`<meta name="theme-color" content="${manifest.theme_color}" />`);
  });

  it('lists a 192 and a 512 "any" icon and a 512 maskable icon, each a PNG of exactly that size', () => {
    const by = (sizes: string, purpose: string) => manifest.icons.find((i) => i.sizes === sizes && (i.purpose ?? 'any') === purpose);
    expect(by('192x192', 'any')).toBeDefined();
    expect(by('512x512', 'any')).toBeDefined();
    expect(by('512x512', 'maskable')).toBeDefined();
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/')).toBe(true);
      const file = join('public', icon.src);
      expect(existsSync(file), file).toBe(true);
      expect(icon.type).toBe('image/png');
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(file), icon.src).toEqual([w, h]);
    }
  });
});

describe('the page head', () => {
  it('links the SVG and PNG favicons and a 180 px Apple touch icon, all shipped', () => {
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />');
    expect(html).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />');
    expect(pngSize(join('public', 'icons', 'favicon-32.png'))).toEqual([32, 32]);
    expect(pngSize(join('public', 'icons', 'apple-touch-icon.png'))).toEqual([180, 180]);
    const svg = readFileSync(join('public', 'icons', 'icon.svg'), 'utf8');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('shape-rendering="crispEdges"');
  });

  it("the production policy lets the manifest load from this origin and nothing else", () => {
    expect(CSP).toContain("manifest-src 'self'");
  });

  it('no service worker: nothing is cached, nothing registers one', () => {
    expect(existsSync(join('public', 'sw.js'))).toBe(false);
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
    for (const f of files('src')) expect(readFileSync(f, 'utf8'), f).not.toMatch(/serviceWorker\.register|workbox/);
  });
});

describe('the pixel icons are whole-pixel enlargements of one scene (never smoothed)', () => {
  it('192 is 64 × 3 and 512 is 64 × 8: every block is one colour', () => {
    for (const [name, factor] of [
      ['icon-192.png', 3],
      ['icon-512.png', 8],
    ] as const) {
      const png = PNG.sync.read(readFileSync(join('public', 'icons', name)));
      expect(png.width % factor).toBe(0);
      const at = (x: number, y: number) => png.data.readUInt32BE((y * png.width + x) * 4);
      for (let by = 0; by < png.height / factor; by += 5)
        for (let bx = 0; bx < png.width / factor; bx += 5) {
          const c = at(bx * factor, by * factor);
          for (let dy = 0; dy < factor; dy++) for (let dx = 0; dx < factor; dx++) expect(at(bx * factor + dx, by * factor + dy)).toBe(c);
        }
    }
  });
});
