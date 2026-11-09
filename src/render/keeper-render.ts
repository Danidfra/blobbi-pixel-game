/**
 * THE KEEPER'S CAIRN ON SCREEN: a stack of balanced stones in the world's stone ramp, one more per growth stage
 * (`cairnStones`), moss at its foot once the island has grown twice, a tiny flower on top at the Sanctuary. Made
 * once per palette and stage; anchored at its ground centre like every object.
 */
import { hex, mix } from '../core/color';
import { PixelBuffer, type Sprite } from '../core/pixel';
import type { WorldPalette } from '../core/palette';
import { cairnStones, CAIRN_FOOT } from '../game/keeper';

const cache = new Map<string, Sprite>();

export function cairnSprite(palette: WorldPalette, stage: number): Sprite {
  const n = cairnStones(stage);
  const key = `${palette.name}|${n}|${stage >= 2 ? 'm' : ''}|${stage >= 4 ? 'f' : ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = palette.stone;
  const w = 11;
  const h = 3 + n * 2 + (stage >= 4 ? 3 : 0);
  const b = new PixelBuffer(w, h);
  const cx = 5;
  // Stones from the ground up, each a little narrower and a shade lighter than the one under it.
  const rx = [4, 3.3, 2.7, 2.2, 1.7, 1.3];
  for (let i = 0; i < n; i++) {
    const cy = h - 2 - i * 2;
    const shade = i % 3 === 0 ? s.mid : i % 3 === 1 ? s.light : mix(s.light, s.highlight, 0.5);
    b.fillEllipse(cx + (i % 2 ? 0.3 : -0.3), cy, rx[i], 1.4, shade);
    b.hline(Math.round(cx - rx[i] + 1), Math.round(cx + rx[i] - 1), cy + 1, s.dark); // its underside
  }
  if (stage >= 2) {
    const moss = hex('#5aa04a');
    b.set(1, h - 2, moss);
    b.set(2, h - 1, mix(moss, s.mid, 0.4));
    b.set(w - 2, h - 1, moss);
  }
  if (stage >= 4) {
    const top = h - 2 - (n - 1) * 2 - 1;
    b.set(cx, top, hex('#5aa04a'));
    b.set(cx, top - 1, hex('#ff9ad1'));
    b.set(cx + 1, top - 1, hex('#ffd0ea'));
  }
  // The outline, grown outside the shape as the furniture art does.
  const out = new PixelBuffer(w + 2, h + 2);
  out.blit(b, 1, 1);
  const mask = out.opaqueMask();
  const grown = mask.dilate();
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) if (grown.get(x, y) && !mask.get(x, y)) out.set(x, y, s.outline);
  out.validate();
  const sprite: Sprite = { buffer: out, anchorX: cx + 1, anchorY: out.height - 2, footRx: CAIRN_FOOT.rx, footRy: CAIRN_FOOT.ry };
  cache.set(key, sprite);
  return sprite;
}
