/**
 * M11D.5 SHADOW SHEET: the same V3 Blobbi as an adult and as a Baby, on the same spot, in every camera zoom; the Baby
 * again after the island grew (still a Baby, the same small shadow). Crops around the Blobbi, magnified for review.
 *   npx tsx scripts/m11d5-shadow-sheet.ts [outDir=examples/m11d5]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { getCanonicalBlobbiD } from '@blobbi-kit/core';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { resolveBlobbi } from '../src/blobbi/source';
import { memoryStore } from '../src/game/persistence';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { rebuildFromSave } from '../src/sim/regrow';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewCamera, CAMERA_CYCLE, worldBounds } from '../src/render/view-camera';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';

const out = process.argv[2] ?? 'examples/m11d5';
mkdirSync(out, { recursive: true });
const PK = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';
const r = resolveBlobbi({ pubkey: PK, d: getCanonicalBlobbiD(PK, '0000000001') });
if (!r.ok) throw new Error(r.error);
const W = 480;
const H = 320;
/** The crop around the Blobbi. */
const CW = 96;
const CH = 72;
const base = generateTurtleWorld('turtle-0');

function shots(live: LiveWorld): PixelBuffer[] {
  live.brain.enabled = false;
  const renderer = new ViewRenderer(live, new LiveRenderer(live));
  const bounds = worldBounds(live.world);
  return CAMERA_CYCLE.map((mode) => {
    const camera = new ViewCamera(mode);
    const view = camera.update(0, { x: live.blobbi.x, y: live.blobbi.y, size: live.blobbi.size }, W, H, bounds, true);
    const frame = renderer.render(view, camera.restScale(mode, W, H, bounds), live.clock.time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, hud: false, goals: false, prompt: false, indicator: false });
    const bx = Math.round((live.blobbi.x - view.originX) * view.scale);
    const by = Math.round((live.blobbi.y - view.originY) * view.scale);
    const crop = new PixelBuffer(CW, CH);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) crop.set(x, y, frame.get(bx - CW / 2 + x, by - Math.round(CH * 0.7) + y));
    return crop;
  });
}

const store = memoryStore();
const adult = new LiveWorld(base, r.source, 16, { store: memoryStore() });
const baby = new LiveWorld(base, r.source, 16, { store, stage: 'baby' });
baby.blobbi.x = adult.blobbi.x;
baby.blobbi.y = adult.blobbi.y;
baby.devSetGrowthStage(2);
const grown = rebuildFromSave(baby, { base, store, reveal: false });
grown.blobbi.x = adult.blobbi.x;
grown.blobbi.y = adult.blobbi.y;
const rows = [shots(adult), shots(new LiveWorld(base, r.source, 16, { stage: 'baby' })), shots(grown)];
console.log('adult foot/shadow', adult.blobbi.footRx, adult.blobbi.shadowRx, '| baby', baby.blobbi.footRx, baby.blobbi.shadowRx, '| after growth', grown.blobbi.identity.stage, grown.blobbi.shadowRx);
const pad = 4;
const sheet = new PixelBuffer(CAMERA_CYCLE.length * (CW + pad) + pad, rows.length * (CH + pad) + pad);
sheet.fillRect(0, 0, sheet.width, sheet.height, hex('#1b1f2a'));
rows.forEach((row, j) => row.forEach((f, i) => sheet.blit(f, pad + i * (CW + pad), pad + j * (CH + pad))));
writeFileSync(`${out}/shadow-adult-baby-grown-by-zoom.png`, toPng(sheet.scaled(4)));
console.log(`rows: adult, Baby, Baby after the island grew to stage 2; columns: ${CAMERA_CYCLE.join(', ')}`);
