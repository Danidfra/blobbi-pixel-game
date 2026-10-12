/**
 * Frames of the intro cinematic for every World Carrier species (headless), for inspection and the docs:
 * `examples/intro-cinematic/<species>-<moment>.png` (960×540) and a contact sheet per species.
 *
 *   npx tsx scripts/intro-cinematic.ts                 all species, the full presentation
 *   npx tsx scripts/intro-cinematic.ts whale           one species
 *   npx tsx scripts/intro-cinematic.ts --reduced       the reduced-motion presentation
 *   npx tsx scripts/intro-cinematic.ts --size 1280x720 another screen size
 *
 * Nothing is saved by the worlds it makes (memory stores only).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { PixelBuffer } from '../src/core/pixel';
import { toPng } from '../src/node/png';
import { LiveWorld } from '../src/sim/live-world';
import { DEFAULT_LIVE_OPTIONS, LiveRenderer } from '../src/render/live-render';
import { ViewRenderer } from '../src/render/view-renderer';
import { memoryStore } from '../src/game/persistence';
import { IntroCinematic } from '../src/cinematic/intro';
import { introPreviewWorld } from '../src/cinematic/preview';
import type { CarrierSpecies } from '../src/game/archipelago';
import { drawTinyText } from '../src/render/live-render';
import { hex } from '../src/core/color';

const args = process.argv.slice(2);
const reduced = args.includes('--reduced');
const sizeArg = args[args.indexOf('--size') + 1];
const [W, H] = args.includes('--size') && /^\d+x\d+$/.test(sizeArg) ? sizeArg.split('x').map(Number) : [960, 540];
const species = (['turtle', 'manta', 'whale'] as CarrierSpecies[]).filter((s) => args.includes(s));
const wanted = species.length ? species : (['turtle', 'manta', 'whale'] as CarrierSpecies[]);
const OUT = 'examples/intro-cinematic';
mkdirSync(OUT, { recursive: true });

function half(buf: PixelBuffer): PixelBuffer {
  const out = new PixelBuffer(Math.floor(buf.width / 2), Math.floor(buf.height / 2));
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) out.data[y * out.width + x] = buf.data[y * 2 * buf.width + x * 2];
  return out;
}

for (const kind of wanted) {
  const store = memoryStore();
  const live = new LiveWorld(introPreviewWorld(kind), 'blobbi-9', 16, { store });
  const renderer = new LiveRenderer(live);
  const view = new ViewRenderer(live, renderer);
  const intro = new IntroCinematic({ live, renderer, view }, { reducedMotion: reduced });
  const tm = intro.timing;
  const moments: [string, number][] = reduced
    ? [
        ['ocean', 1],
        ['reveal', (tm.surfacing[0] + tm.surfacing[1]) / 2],
        ['bare', tm.carrierBeat + 0.1],
        ['land-first-patch', tm.landForming[0] + 0.55],
        ['land-half', (tm.landForming[0] + tm.landForming[1]) / 2],
        ['life', tm.lifeForming[0] + 1.4],
        ['arrival-start', tm.arrival + 0.9],
        ['arrived', tm.arrival + 2.3],
        ['blobbi-notices', tm.notices + 0.3],
        ['blobbi-hello', tm.happy + 0.6],
        ['message', tm.line2 + 1.2],
        ['handoff', tm.end],
      ]
    : [
        ['ocean', 2.2],
        ['shadow', tm.carrier - 0.6],
        ['reveal', (tm.surfacing[0] + tm.surfacing[1]) / 2],
        ['bare', tm.carrierBeat + 0.1],
        ['land-first-patch', tm.landForming[0] + 0.7],
        ['land-half', (tm.landForming[0] + tm.landForming[1]) / 2],
        ['land-complete', tm.landForming[1] + 0.1],
        ['life', tm.lifeForming[0] + 2.2],
        ['island', tm.lifeForming[1] + 0.2],
        ['arrival-start', tm.arrival + 0.9],
        ['arrival-rebuild', tm.arrival + 2.3],
        ['arrived', tm.arrival + 3.7],
        ['blobbi-looks', tm.looks[0] + 0.5],
        ['blobbi-notices', tm.notices + 0.3],
        ['blobbi-hello', tm.happy + 0.6],
        ['message', tm.line2 + 1.2],
        ['handoff', tm.end],
      ];
  const sheet: PixelBuffer[] = [];
  const sheetEvery = tm.end / 12;
  let nextSheet = 0.4;
  const dt = 1 / 30;
  let t = 0;
  let mi = 0;
  const pending = [...moments].sort((a, b) => a[1] - b[1]);
  const times = { steps: 0, ms: 0 };
  let last: PixelBuffer | null = null;
  while (!intro.done) {
    const t0 = performance.now();
    const frame = intro.frame(dt, W, H);
    if (intro.done) last = frame.clone();
    times.ms += performance.now() - t0;
    times.steps++;
    t = intro.elapsed;
    while (mi < pending.length && t >= pending[mi][1] - dt / 2) {
      writeFileSync(`${OUT}/${kind}${reduced ? '-reduced' : ''}-${pending[mi][0]}.png`, toPng(frame));
      mi++;
    }
    if (t >= nextSheet && sheet.length < 12) {
      const small = half(frame);
      drawTinyText(small, `${t.toFixed(1)}S ${intro.scene.toUpperCase()}`, 3, 3, hex('#1b1f2a'));
      drawTinyText(small, `${t.toFixed(1)}S ${intro.scene.toUpperCase()}`, 2, 2, hex('#fffaf0'));
      sheet.push(small);
      nextSheet += sheetEvery;
    }
  }
  // The handoff frame: what the game draws first, from the same view (must equal the cinematic's last frame on
  // every pixel the game paints itself).
  const hv = intro.handoffView(W, H);
  const game = view.render(hv, 2, live.clock.time, { ...DEFAULT_LIVE_OPTIONS, hud: false }, { hud: false, indicator: false, goals: false, prompt: false, lighting: false, uiScale: 2 });
  writeFileSync(`${OUT}/${kind}${reduced ? '-reduced' : ''}-game-first-frame.png`, toPng(game));
  let diff = 0;
  for (let i = 0; i < game.data.length; i++) if (game.data[i] !== last!.data[i]) diff++;
  // The contact sheet: 4 × 3 half-size frames.
  const cols = 4;
  const sw = Math.floor(W / 2);
  const sh = Math.floor(H / 2);
  const rows = Math.ceil(sheet.length / cols);
  const contact = new PixelBuffer(cols * (sw + 2) + 2, rows * (sh + 2) + 2);
  contact.fill(hex('#1b1f2a'));
  sheet.forEach((f, i) => contact.blit(f, 2 + (i % cols) * (sw + 2), 2 + Math.floor(i / cols) * (sh + 2)));
  writeFileSync(`${OUT}/${kind}${reduced ? '-reduced' : ''}-sheet.png`, toPng(contact));
  console.log(`${kind}${reduced ? ' (reduced)' : ''}: ${tm.end}s, ${times.steps} frames, ${(times.ms / times.steps).toFixed(1)} ms/frame at ${W}x${H}; handoff differs from the game's first frame by ${diff} px (message band and bubble aside); store writes: ${store.data.size}`);
}

// The manta's wings through the reveal (the wing-clipping regressions): under the shadow, early and half-way
// through the surfacing, bare, and just before the island zoom, at two screen sizes, half size, in one sheet.
if (wanted.includes('manta') && !reduced) {
  const rowsOut: PixelBuffer[] = [];
  for (const [w, h] of [
    [960, 540],
    [1280, 800],
  ]) {
    const live = new LiveWorld(introPreviewWorld('manta'), 'blobbi-9', 16, { store: memoryStore() });
    const renderer = new LiveRenderer(live);
    const view = new ViewRenderer(live, renderer);
    const intro = new IntroCinematic({ live, renderer, view }, {});
    const tm = intro.timing;
    const moments: [string, number][] = [
      ['shadow', tm.surfacing[0] - 0.25],
      ['surfacing', tm.surfacing[0] + 0.6],
      ['half up', (tm.surfacing[0] + tm.surfacing[1]) / 2],
      ['bare', tm.carrierBeat + 0.1],
      ['before zoom', tm.islandZoom[0] - 0.2],
    ];
    const panels: PixelBuffer[] = [];
    for (const [label, at] of moments) {
      let f = intro.lastScreen!;
      while (!intro.done && intro.elapsed < at) f = intro.frame(1 / 30, w, h);
      const small = half(f);
      const text = `${w}X${h} ${label.toUpperCase()} ${intro.elapsed.toFixed(1)}S`;
      drawTinyText(small, text, 3, 3, hex('#1b1f2a'));
      drawTinyText(small, text, 2, 2, hex('#fffaf0'));
      panels.push(small);
    }
    const pw = Math.max(...panels.map((p) => p.width));
    const ph = Math.max(...panels.map((p) => p.height));
    const row = new PixelBuffer(panels.length * (pw + 2) + 2, ph + 2);
    row.fill(hex('#1b1f2a'));
    panels.forEach((p, i) => row.blit(p, 2 + i * (pw + 2), 2));
    rowsOut.push(row);
  }
  const sheetW = Math.max(...rowsOut.map((r) => r.width));
  const wings = new PixelBuffer(sheetW, rowsOut.reduce((n, r) => n + r.height, 0) + 2);
  wings.fill(hex('#1b1f2a'));
  let y = 2;
  for (const r of rowsOut) {
    wings.blit(r, 0, y);
    y += r.height;
  }
  writeFileSync(`${OUT}/manta-wings.png`, toPng(wings));
  console.log(`manta: wings sheet written (${OUT}/manta-wings.png)`);
}
