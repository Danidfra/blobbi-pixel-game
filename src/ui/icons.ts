/**
 * ITEM ICONS: one small pixel icon for every item, from what the item already is. Tools use their resting sprite,
 * ground resources their ground sprite, content items their icon template (outlined like every object in the lab),
 * furniture its placed sprite fitted into the slot. Cached per item and palette.
 */
import { hex, mix, type Color } from '../core/color';
import type { WorldPalette } from '../core/palette';
import { PixelBuffer } from '../core/pixel';
import { itemById } from '../game/items';
import { toolIcon, EQUIPMENT } from '../game/equipment';
import { resourceSprite, kindOfItem } from '../game/resources';
import { BUILDINGS, buildingSprite } from '../game/buildings';

/** Icons fit in this square (UI pixels). */
export const ICON_SIZE = 14;

const cache = new Map<string, PixelBuffer>();

/** A placed object's sprite, for furniture icons. */
const placedSprite = (kind: string, palette: WorldPalette): PixelBuffer | null =>
  BUILDINGS[kind] ? buildingSprite({ id: 'icon', kind, x: 0, y: 0, placedAt: -1e9, seed: `icon/${kind}` }, palette, 1).buffer : null;

export function itemIcon(id: string, palette: WorldPalette): PixelBuffer {
  const key = `${palette.name}|${id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const icon = makeIcon(id, palette);
  cache.set(key, icon);
  return icon;
}

function makeIcon(id: string, palette: WorldPalette): PixelBuffer {
  const def = itemById(id);
  if (EQUIPMENT[id]) return fit(toolIcon(id, palette).buffer);
  const resource = kindOfItem(id);
  if (resource) return fit(resourceSprite(resource, 0, palette).buffer);
  if (def?.icon) return fromTemplate(def.icon.rows, def.icon.colours);
  if (def?.place) {
    const s = placedSprite(def.place, palette);
    if (s) return fit(s);
  }
  // Unknown: a neutral question tile (never shown for registered items; tests check every item has an icon).
  return fromTemplate(['.aaa.', 'a...a', '...a.', '..a..', '.....', '..a..'], { a: '#f4efe4' });
}

/** A template in its colours, with a one-pixel outline in a darkened version of each edge's neighbour. */
export function fromTemplate(rows: readonly string[], colours: Readonly<Record<string, string>>): PixelBuffer {
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const buf = new PixelBuffer(w + 2, h + 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch !== '.' && colours[ch]) buf.set(x + 1, y + 1, hex(colours[ch]));
    }
  const mask = buf.opaqueMask();
  const grown = mask.dilate();
  for (let y = 0; y < buf.height; y++)
    for (let x = 0; x < buf.width; x++) {
      if (!grown.get(x, y) || mask.get(x, y)) continue;
      let near: Color = 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!near && buf.get(x + ox, y + oy) >>> 24) near = buf.get(x + ox, y + oy);
      buf.set(x, y, mix(near, hex('#1b1410'), 0.7));
    }
  return buf;
}

/** Fit a sprite into the icon square: trimmed, halved (nearest) while too large. */
export function fit(src: PixelBuffer): PixelBuffer {
  const t = src.trimmed().buffer;
  let buf = t;
  while (buf.width > ICON_SIZE + 2 || buf.height > ICON_SIZE + 2) {
    const half = new PixelBuffer(Math.ceil(buf.width / 2), Math.ceil(buf.height / 2));
    for (let y = 0; y < half.height; y++)
      for (let x = 0; x < half.width; x++) {
        // Prefer an opaque source pixel of the 2×2 block, so thin parts survive.
        let c = 0;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const v = buf.get(x * 2 + dx, y * 2 + dy);
          if (v >>> 24 && !c) c = v;
        }
        half.set(x, y, c);
      }
    buf = half;
  }
  return buf;
}
