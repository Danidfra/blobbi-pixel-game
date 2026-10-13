/**
 * M11D.1, THE BABY LAB PAGE (`/baby-lab.html`, development server only: the production build takes `index.html`
 * alone, and nothing in the game imports this). The comparison sheets of `baby-sheet.ts` at a chosen whole-pixel
 * scale, and a live strip: Babies of three generations walking with their hop, swinging an axe and fishing, drawn
 * frame by frame by the game's own builders.
 */
import { PixelBuffer } from '../core/pixel';
import { hex } from '../core/color';
import { stagedIdentity } from '../blobbi/identity';
import { buildBlobbiSprite, REST_POSE, type BlobbiPose } from '../blobbi/sprite';
import { buildV1BabySprite } from '../blobbi/v1-baby';
import { WALK_CYCLE_HZ } from '../blobbi/animation';
import { WALK_FRAMES } from '../blobbi/canonical';
import { babySheets, holding, sampleV3Seed, SAMPLE_PETS, V1_SAMPLES } from './baby-sheet';
import { ITEMS } from '../game/items';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const sheets = babySheets();
const select = $<HTMLSelectElement>('sheet');
for (const s of sheets) select.add(new Option(s.name, s.name));
const zoomOf = () => Number($<HTMLSelectElement>('zoom').value);

function paint(canvas: HTMLCanvasElement, buf: PixelBuffer, zoom: number): void {
  canvas.width = buf.width;
  canvas.height = buf.height;
  canvas.style.width = `${buf.width * zoom}px`;
  canvas.style.height = `${buf.height * zoom}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(buf.data.buffer as ArrayBuffer, buf.data.byteOffset, buf.data.byteLength), buf.width, buf.height), 0, 0);
}

function showSheet(): void {
  paint($<HTMLCanvasElement>('view'), sheets.find((s) => s.name === select.value)!.buffer, zoomOf());
}
select.addEventListener('change', showSheet);
$('zoom').addEventListener('change', showSheet);
showSheet();

const SIZE = 24;
const W = 60;
const H = 52;
const seeds = SAMPLE_PETS.slice(0, 3).map(sampleV3Seed);
const t0 = performance.now();
function frame(now: number): void {
  const t = (now - t0) / 1000;
  const walk = Math.floor((t * WALK_CYCLE_HZ * WALK_FRAMES) % WALK_FRAMES) as BlobbiPose['walk'];
  const facing: 1 | -1 = Math.floor(t / 3) % 2 ? -1 : 1;
  const strip = new PixelBuffer(W * 7, H);
  strip.fill(hex('#5d9b4a'));
  const at = (i: number, sprite: { buffer: PixelBuffer; anchorX: number; anchorY: number }) => strip.blit(sprite.buffer, i * W + W / 2 - sprite.anchorX, H - 6 - sprite.anchorY);
  seeds.forEach((seed, i) => at(i, buildBlobbiSprite(stagedIdentity(seed, 'baby'), { ...REST_POSE, view: 'side', facing, walk }, SIZE)));
  at(3, buildV1BabySprite(V1_SAMPLES[0].colors, { ...REST_POSE, walk }, SIZE));
  // A swing every 1.2 s: idle, raise, strike, recover; and a cast then a held rod.
  const phase = (t % 1.2) / 1.2;
  const swing = phase < 0.4 ? 'idle' : phase < 0.6 ? 'raise' : phase < 0.8 ? 'strike' : 'recover';
  strip.blit(holding(seeds[0], 'baby', ITEMS.axe.id, { ...REST_POSE, view: 'side', facing: -1 }, swing, SIZE, W, H), 4 * W, 0);
  strip.blit(holding(seeds[1], 'baby', ITEMS.pickaxe.id, { ...REST_POSE, view: 'front' }, swing === 'raise' ? 'raise' : swing === 'strike' ? 'strike' : 'idle', SIZE, W, H), 5 * W, 0);
  strip.blit(holding(seeds[2], 'baby', 'blobbi-pixel:tool:fishing-rod', { ...REST_POSE, view: 'side', facing: 1 }, phase < 0.5 ? 'fishing' : phase < 0.7 ? 'raise' : 'cast', SIZE, W, H), 6 * W, 0);
  paint($<HTMLCanvasElement>('live'), strip, zoomOf() + 1);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
