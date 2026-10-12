/**
 * THE OPEN SEA (M10; first made for the intro cinematic): open water for ANY world pixel, inside or outside the
 * world, with the terrain painter's own rule for deep water (the same streak noise, the same colours) and the live
 * renderer's own wave strokes (the same hash per 8×4 cell, the same drift). The world's border is deep water, so
 * the ocean continues past the edge without a seam: zoomed out, there is no rectangle, only more sea.
 *
 * Still water is made in 128×128 tiles, each with the wave strokes that start in it, once (and kept, up to a cap:
 * the camera roams a bounded area, so in play the cap is never reached). A frame copies tile rows and draws a
 * few strokes: no noise is evaluated per frame.
 */
import { createNoise, type Noise2D } from '../core/noise';
import { hash32 } from '../core/rng';
import { mix, type Color } from '../core/color';
import type { WorldPalette } from '../core/palette';
import type { PixelBuffer } from '../core/pixel';
import type { WorldDescription } from '../world/types';

export const SEA_TILE = 128;
/** The live renderer's wave cells: one candidate stroke per 8×4 world pixels. */
export const SEA_CELL_W = 8;
export const SEA_CELL_H = 4;
/**
 * Tiles kept: at least this many (4 MB), and always every tile of the largest view painted so far plus a ring
 * (a 2560×1440 overview needs about 300: 20 MB) — never evicting what the next frame needs again. Past it the
 * least recently made go.
 */
const TILE_LIMIT = 64;

export interface SeaStroke {
  x: number;
  y: number;
  len: number;
  curl: 1 | -1;
  speed: number;
}

interface Tile {
  water: Uint32Array;
  /** The wave strokes whose cell lies in this tile. */
  strokes: SeaStroke[];
}

/** Open water for any world pixel, matching the terrain painter and the live renderer exactly. */
export class OpenSea {
  private readonly streaks: Noise2D;
  private readonly streakColor: Color;
  private readonly salt: number;
  private readonly tiles = new Map<number, Tile>();
  private readonly cells = new Map<number, SeaStroke | null>();
  private limit = TILE_LIMIT;
  private generated = 0;

  constructor(
    readonly world: WorldDescription,
    readonly palette: WorldPalette,
  ) {
    this.streaks = createNoise(`${world.seed}/water/streaks`, 44);
    this.streakColor = mix(palette.water.dark, palette.water.mid, 0.55);
    this.salt = hash32(`${world.seed}/waves`);
  }

  private made(tx: number, ty: number): Tile {
    const key = (tx + 0x8000) * 0x10000 + (ty + 0x8000);
    let t = this.tiles.get(key);
    if (!t) {
      const water = new Uint32Array(SEA_TILE * SEA_TILE);
      const x0 = tx * SEA_TILE;
      const y0 = ty * SEA_TILE;
      for (let j = 0; j < SEA_TILE; j++) for (let i = 0; i < SEA_TILE; i++) water[j * SEA_TILE + i] = this.streaks.fbm(x0 + i, y0 + j, 2) > 0.62 ? this.streakColor : this.palette.water.dark;
      const strokes: SeaStroke[] = [];
      for (let cy = (y0 / SEA_CELL_H) | 0; cy < (y0 + SEA_TILE) / SEA_CELL_H; cy++)
        for (let cx = (x0 / SEA_CELL_W) | 0; cx < (x0 + SEA_TILE) / SEA_CELL_W; cx++) {
          const s = this.stroke(cx, cy);
          if (s) strokes.push(s);
        }
      t = { water, strokes };
      this.generated++;
      this.tiles.set(key, t);
      if (this.tiles.size > this.limit) this.tiles.delete(this.tiles.keys().next().value!);
    }
    return t;
  }

  /** A tile of still water colours (`SEA_TILE` square), made once (the first ocean frame pays for its whole view). */
  tile(tx: number, ty: number): Uint32Array {
    return this.made(tx, ty).water;
  }

  /** The still colour of open water at a world pixel (the terrain painter's deep-water rule). */
  base(x: number, y: number): Color {
    const tx = Math.floor(x / SEA_TILE);
    const ty = Math.floor(y / SEA_TILE);
    return this.tile(tx, ty)[(y - ty * SEA_TILE) * SEA_TILE + (x - tx * SEA_TILE)];
  }

  /** The wave stroke of cell (cx, cy), as the live renderer would make it on open water; null for a quiet cell. */
  stroke(cx: number, cy: number): SeaStroke | null {
    const key = (cx + 0x8000) * 0x10000 + (cy + 0x8000);
    const hit = this.cells.get(key);
    if (hit !== undefined) return hit;
    const h = hash32(`${this.salt}:${cx}:${cy}`);
    const s: SeaStroke | null = (h & 0xff) > 60 ? null : { x: cx * SEA_CELL_W + ((h >>> 8) & 7), y: cy * SEA_CELL_H + ((h >>> 11) & 3), len: 3 + ((h >>> 14) & 1) * 2, curl: ((h >>> 15) & 1) === 1 ? 1 : -1, speed: 2.5 + ((h >>> 16) & 3) * 0.8 };
    if (this.cells.size > 1 << 16) this.cells.clear();
    this.cells.set(key, s);
    return s;
  }

  /**
   * Paint the sea into `frame` (a view of world pixels whose top-left is (ox, oy)) wherever it lies outside the
   * world, with the waves that lie wholly outside it (the world draws its own): the margin of a zoomed-out view.
   */
  paintBeyond(frame: PixelBuffer, ox: number, oy: number, time: number): void {
    const { width, height } = this.world.terrain;
    const W = frame.width;
    const H = frame.height;
    if (ox >= 0 && oy >= 0 && ox + W <= width && oy + H <= height) return; // all world
    this.limit = Math.max(this.limit, (Math.ceil(W / SEA_TILE) + 3) * (Math.ceil(H / SEA_TILE) + 3) * 2);
    const d = frame.data;
    const span = (y: number, wy: number, a: number, b: number) => {
      // World columns [a, b) of world row wy, into frame row y.
      const ty = Math.floor(wy / SEA_TILE);
      const row = (wy - ty * SEA_TILE) * SEA_TILE;
      for (let wx = a; wx < b; ) {
        const tx = Math.floor(wx / SEA_TILE);
        const end = Math.min(b, (tx + 1) * SEA_TILE);
        const t = this.made(tx, ty).water;
        d.set(t.subarray(row + wx - tx * SEA_TILE, row + end - tx * SEA_TILE), y * W + wx - ox);
        wx = end;
      }
    };
    for (let y = 0; y < H; y++) {
      const wy = oy + y;
      if (wy < 0 || wy >= height) span(y, wy, ox, ox + W);
      else {
        if (ox < 0) span(y, wy, ox, Math.min(0, ox + W));
        if (ox + W > width) span(y, wy, Math.max(width, ox), ox + W);
      }
    }
    // The waves: those of the tiles in view, drawn where the whole stroke lies beyond the world.
    const light = this.palette.water.mid;
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
    const tx0 = Math.floor((ox - 12) / SEA_TILE);
    const tx1 = Math.floor((ox + W + 6) / SEA_TILE);
    const ty0 = Math.floor((oy - 2) / SEA_TILE);
    const ty1 = Math.floor((oy + H) / SEA_TILE);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        // A tile wholly inside the world (and its strokes' reach) has nothing to draw here.
        if (tx * SEA_TILE >= 8 && ty * SEA_TILE >= 4 && (tx + 1) * SEA_TILE + 8 <= width && (ty + 1) * SEA_TILE + 2 <= height) continue;
        for (const st of this.made(tx, ty).strokes) {
          const x = st.x + (Math.floor(time * st.speed) % 10) - 5;
          const y = st.y;
          const cx = st.curl > 0 ? x + st.len : x - 1;
          if (inside(x - 1, y) || inside(x + st.len, y) || inside(cx, y + 1)) continue;
          if (y + 1 < oy || y >= oy + H || x + st.len < ox || x - 1 >= ox + W) continue;
          frame.hline(x - ox, x + st.len - 1 - ox, y - oy, light);
          frame.set(cx - ox, y + 1 - oy, light);
        }
      }
  }

  /** Tiles and cells made so far (tests and the dev inspector). */
  get cached(): { tiles: number; cells: number; made: number } {
    return { tiles: this.tiles.size, cells: this.cells.size, made: this.generated };
  }
}
