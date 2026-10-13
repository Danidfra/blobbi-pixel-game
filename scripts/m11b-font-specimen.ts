/**
 * M11B FONT SPECIMEN: both body font sizes (7 and 9 pixel capitals) at 1× and 2×, and the 3×5 title font, with
 * English, Portuguese and Spanish on the game's panel colour; then the size each menu scale uses. Writes
 * examples/m11b/font-specimen.png.
 *   npx tsx scripts/m11b-font-specimen.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { BODY_LARGE, BODY_SMALL } from '../src/ui/fonts/body-font';
import { drawTinyText } from '../src/render/live-render';
import { bodyChoice } from '../src/ui/surface';

const lines = [
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789',
  'abcdefghijklmnopqrstuvwxyz .,:;!?()-+/%&#…',
  'Fish flash silver at the shore. Catch 3!',
  'Peixes brilham prateados na beira. Pegue 3!',
  '¿Qué pasa, señor? ¡Atrapa 3 peces en la orilla!',
  'Ação, coração, maçã, pão, você, avó, é, à, Ç, Ã, É, Ó, Ü, Ñ',
  'MAKE IT PRETTY · FAÇA FICAR BONITO · PONLO BONITO',
];
const W = 900;
const H = 900;
const buf = new PixelBuffer(W, H);
buf.fillRect(0, 0, W, H, hex('#232838'));
let y = 8;
for (const [font, m] of [[BODY_SMALL, 1], [BODY_LARGE, 1], [BODY_SMALL, 2], [BODY_LARGE, 2]] as const) {
  for (const l of lines) {
    if (font.width(l) * m > W - 12) continue;
    font.draw(buf, l, 6, y + 2 * m, hex('#f4efe4'), m);
    y += (font.cellRows + 2) * m;
  }
  y += 8;
}
for (const k of [2, 3]) {
  const t = new PixelBuffer(400, 9);
  drawTinyText(t, 'TITLE FONT: AÇÃO · ¿QUÉ? · MAKE IT PRETTY', 0, 2, hex('#ffe07a'));
  buf.blit(t.scaled(k), 6, y);
  y += 9 * k + 4;
}
mkdirSync('examples/m11b', { recursive: true });
writeFileSync('examples/m11b/font-specimen.png', toPng(buf));
for (const s of [1, 1.5, 2, 2.5, 3, 4, 5, 6])
  for (const smaller of [false, true]) {
    const c = bodyChoice(s, smaller);
    console.log(`scale ${s} ${smaller ? 'small ' : 'normal'}: ${c ? `${c.font.spec.name} ×${c.m} (capitals ${c.font.spec.capRows * c.m} px)` : '3×5 capitals'}`);
  }
console.log('examples/m11b/font-specimen.png', y);
