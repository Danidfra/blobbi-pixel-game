/**
 * PLACEMENT OVERLAY, shared by the island and the room renderers: the checker ghost of what is being built,
 * placed from the bag or moved, its footprint (green when it fits, red with the reason when not), and in
 * management mode a highlight on the selected object with what the keys do.
 */
import { hex } from '../core/color';
import type { WorldPalette } from '../core/palette';
import type { PixelBuffer } from '../core/pixel';
import { BUILDINGS, PROBLEM_TEXT, buildingSprite } from '../game/buildings';
import type { LiveWorld } from '../sim/live-world';
import { drawTinyText, type SplitLayers } from './live-render';

const GOOD = hex('#4dffb0');
const BAD = hex('#ff3b5c');
const INK = hex('#1b1f2a');

function label(out: PixelBuffer, split: SplitLayers | undefined, text: string, x: number, y: number, ox: number, oy: number, colour: number): void {
  if (split) {
    split.texts.push({ kind: 'label', text, x, y, color: colour, background: INK });
    return;
  }
  const w = text.length * 4 + 3;
  out.fillRect(Math.round(x - w / 2) - ox, y - oy, w, 9, INK);
  drawTinyText(out, text, Math.round(x - w / 2) + 2 - ox, y + 2 - oy, colour);
}

export function drawPlacementOverlay(live: LiveWorld, out: PixelBuffer, ox: number, oy: number, palette: WorldPalette, scale: number, split?: SplitLayers): void {
  const kind = live.previewKind;
  if (kind) {
    const spot = live.placementSpot(kind);
    const check = live.placementCheck(kind, spot);
    const variant = live.moving ? live.moving.record.variant ?? 0 : live.placing ? live.placingVariant : 0;
    const seed = live.moving ? live.moving.record.seed : `preview/${kind}`;
    const ghost = buildingSprite({ id: 'preview', kind, x: spot.x, y: spot.y, placedAt: 0, seed, variant }, palette, 1, scale);
    const gx = spot.x - ghost.anchorX - ox;
    const gy = spot.y - ghost.anchorY - oy;
    for (let y = 0; y < ghost.buffer.height; y++)
      for (let x = 0; x < ghost.buffer.width; x++) {
        const c = ghost.buffer.get(x, y);
        if (!(c >>> 24) || ((x + y) & 1)) continue; // a checker ghost
        out.set(gx + x, gy + y, c);
      }
    const colour = check.ok ? GOOD : BAD;
    out.strokeRect(check.x0 - ox, check.y0 - oy, check.x1 - check.x0 + 1, check.y1 - check.y0 + 1, colour);
    let text: string;
    if (!check.ok) text = PROBLEM_TEXT[check.problem!].toUpperCase();
    else if (live.moving) text = 'E PUT DOWN  ESC CANCEL';
    else if (live.placing) text = `E PLACE (${live.inventory.count(live.placing)})${(BUILDINGS[kind].variants ?? 1) > 1 ? '  T STYLE' : ''}`;
    else text = live.canAfford(kind) || (BUILDINGS[kind].item && live.inventory.count(BUILDINGS[kind].item!) > 0) ? 'E TO BUILD' : 'NOT ENOUGH MATERIALS';
    label(out, split, text, spot.x, Math.min(check.y0, gy + oy) - 12, ox, oy, colour);
    return;
  }
  if (!live.manage) return;
  const sel = live.selectedPlaced();
  const b = live.blobbi;
  if (!sel) {
    label(out, split, 'MOVE MODE: FACE SOMETHING YOU BUILT  M EXIT', b.x, b.y - b.size - 14, ox, oy, hex('#ffe07a'));
    return;
  }
  const def = BUILDINGS[sel.kind];
  const sprite = buildingSprite(sel, palette, 1, scale);
  const x0 = sel.x - sprite.anchorX - ox - 1;
  const y0 = sel.y - sprite.anchorY - oy - 1;
  const x1 = x0 + sprite.buffer.width + 1;
  const y1 = y0 + sprite.buffer.height + 1;
  const c = hex('#ffe07a');
  for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    out.set(cx, cy, c);
    out.set(cx + sx, cy, c);
    out.set(cx + 2 * sx, cy, c);
    out.set(cx, cy + sy, c);
    out.set(cx, cy + 2 * sy, c);
  }
  const problem = live.removalProblem(sel);
  const keys = ['E MOVE', problem ? '' : 'X TO BAG', (def.variants ?? 1) > 1 ? 'T STYLE' : ''].filter(Boolean).join('  ');
  label(out, split, `${def.label.toUpperCase()}: ${keys}`, sel.x, y0 + oy - 12, ox, oy, c);
}
