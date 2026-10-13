/**
 * M11D.3: the pixel egg sheets (every crack, rocking, the hatchling and the adult) and the birth cinematic's key
 * frames (a preview world, nothing saved), as PNG files.
 *   npx tsx scripts/m11d3-sheets.ts [outDir=examples/m11d3]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toPng } from '../src/node/png';
import { eggsSheet } from '../src/dev/baby-sheet';
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer } from '../src/render/live-render';
import { ViewRenderer } from '../src/render/view-renderer';
import { IntroCinematic } from '../src/cinematic/intro';
import { introPreviewWorld } from '../src/cinematic/preview';

const outDir = process.argv[2] ?? 'examples/m11d3';
mkdirSync(outDir, { recursive: true });
for (const [name, buffer, k] of [['eggs-24', eggsSheet(24), 3], ['eggs-48', eggsSheet(48), 2]] as const) {
  writeFileSync(join(outDir, `${name}@${k}x.png`), toPng(buffer.scaled(k)));
  console.log(name);
}
for (const reduced of [false, true]) {
  const live = new LiveWorld(introPreviewWorld('turtle'), 'local-blobbi-0123456789abcdef', 16, { stage: 'baby', store: null });
  const renderer = new LiveRenderer(live);
  const view = new ViewRenderer(live, renderer);
  const intro = new IntroCinematic({ live, renderer, view }, { birth: true, reducedMotion: reduced });
  const tm = intro.timing;
  const e = tm.egg!;
  const shots: [number, string][] = [
    [tm.arrival + 1.2, 'egg-materialising'],
    [tm.arrival + (reduced ? 2.1 : 3.2), 'egg-arrived'],
    [e.rock + 0.6, 'gentle-rocking'],
    [e.strong + 0.4, 'strong-rocking-first-crack'],
    [e.cracks[1] + 0.2, 'second-crack'],
    [e.cracks[2] + 0.3, 'third-crack'],
    [e.hatch + 0.1, 'hatch'],
    [e.hatch + 0.5, 'baby-out'],
    [tm.looks[0] + 0.4, 'looks-one-way'],
    [tm.looks[1] + 0.4, 'looks-the-other-way'],
    [tm.notices + 0.3, 'faces-you'],
    [tm.happy + 0.6, 'hello'],
  ];
  let f = intro.lastScreen;
  for (const [at, name] of shots) {
    while (intro.elapsed < at && !intro.done) f = intro.frame(1 / 30, 640, 360);
    writeFileSync(join(outDir, `birth${reduced ? '-reduced' : ''}-${name}.png`), toPng(f!));
  }
  console.log(reduced ? 'reduced' : 'full', 'birth', intro.duration.toFixed(1), 's');
}
