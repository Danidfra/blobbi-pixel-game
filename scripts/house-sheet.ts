/**
 * HOUSE SHEET (M8): the three house levels, their looks and their rooms, for visual review.
 *   npx tsx scripts/house-sheet.ts [outDir]   → examples/houses/
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { toPng } from '../src/node/png';

const writePng = (path: string, buf: PixelBuffer) => writeFileSync(path, toPng(buf));
import { PixelBuffer } from '../src/core/pixel';
import { paletteFor } from '../src/world/generate';
import { houseSprite, type Building } from '../src/game/buildings';
import { ROOF_COLOURS, WALL_MATERIALS, DOOR_STYLES, WINDOW_STYLES } from '../src/game/house-art';
import { LAYOUTS, roomSprite, newInterior } from '../src/game/interior';
import { buildingSprite } from '../src/game/buildings';
import { hex } from '../src/core/color';

const out = process.argv[2] ?? 'examples/houses';
mkdirSync(out, { recursive: true });
const palette = paletteFor('cozy');
const grass = palette.grass.mid;
const house = (level: number, look: Building['look'] = undefined, seed = 'home-seed'): Building => ({ id: 'shelter:0', kind: 'shelter', x: 0, y: 0, placedAt: 0, seed, level, ...(look ? { look } : {}) });

function cell(sprite: { buffer: PixelBuffer; anchorX: number; anchorY: number; footRx: number; footRy: number }, w = 72, h = 64): PixelBuffer {
  const b = new PixelBuffer(w, h);
  b.fill(grass);
  const gx = Math.floor(w / 2);
  const gy = h - 8;
  b.fillEllipse(gx + 0.5, gy + 0.5, sprite.footRx + 2, sprite.footRy + 1, palette.shadowOnGrass);
  b.blit(sprite.buffer, gx - sprite.anchorX, gy - sprite.anchorY);
  return b;
}

// 1. The three levels, built, at night, and under construction.
{
  const sheet = new PixelBuffer(72 * 4, 64 * 3);
  sheet.fill(hex('#20242e'));
  for (let l = 1; l <= 3; l++) {
    const row = l - 1;
    sheet.blit(cell(houseSprite(house(l), palette, 1)), 0, row * 64);
    sheet.blit(cell(houseSprite(house(l), palette, 1, 1.6, true)), 72, row * 64);
    sheet.blit(cell(houseSprite(house(l), palette, 0.4)), 144, row * 64);
    sheet.blit(cell(houseSprite(house(l), palette, 0.8)), 216, row * 64);
  }
  writePng(`${out}/levels.png`, sheet.scaled(4));
}
// 2. Looks: roof colours, wall materials, doors, windows, for each level.
{
  const rows = [ROOF_COLOURS.length, WALL_MATERIALS.length, DOOR_STYLES.length, WINDOW_STYLES.length];
  const cols = Math.max(...rows);
  const sheet = new PixelBuffer(72 * cols, 64 * 4 * 3);
  sheet.fill(hex('#20242e'));
  for (let l = 1; l <= 3; l++)
    (['roof', 'wall', 'door', 'window'] as const).forEach((part, r) => {
      for (let i = 0; i < rows[r]; i++) sheet.blit(cell(houseSprite(house(l, { [part]: i }), palette, 1)), i * 72, ((l - 1) * 4 + r) * 64);
    });
  writePng(`${out}/looks.png`, sheet.scaled(3));
}
// 3. The rooms, with the starter furniture arranged for each level.
for (let l = 1; l <= 3; l++) {
  const layout = LAYOUTS[l as 1 | 2 | 3];
  const st = newInterior('shelter:0', 'room-seed', l);
  const room = roomSprite(st.style, palette, hex('#9ad0f0'), layout).clone();
  for (const f of st.furniture) {
    const s = buildingSprite(f, palette, 1);
    room.blit(s.buffer, f.x - s.anchorX, f.y - s.anchorY);
  }
  writePng(`${out}/room-level-${l}.png`, room.scaled(4));
}
// 4. Room styles: floors, wall colours and finishes on the Cottage.
{
  const layout = LAYOUTS[2];
  const styles = [
    { floor: 3, wall: 3, finish: 3 },
    { floor: 4, wall: 1, finish: 1 },
    { floor: 5, wall: 4, finish: 2 },
    { floor: 1, wall: 5, finish: 4 },
  ];
  const sheet = new PixelBuffer(layout.w * 2, layout.h * 2);
  styles.forEach((st, i) => sheet.blit(roomSprite(st, palette, hex('#9ad0f0'), layout), (i % 2) * layout.w, Math.floor(i / 2) * layout.h));
  writePng(`${out}/room-styles.png`, sheet.scaled(3));
}
console.log(`wrote ${out}`);
