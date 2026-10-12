/**
 * THE OPEN SEA AND THE SURFACING, for the intro cinematic. Two things the gameplay renderer never needs:
 *
 *   1. Water beyond the world's edge. The playground fills the margin with one flat colour; the cinematic wants a
 *      vast ocean. `OpenSea` paints open water for ANY world pixel, inside or outside the world, with the terrain
 *      painter's own rule for deep water (the same streak noise, the same colours) and the live renderer's own wave
 *      strokes (the same hash per 8×4 cell, the same drift), so the ocean continues past the edge without a seam and
 *      the frame the cinematic hands over is pixel-identical to the game's.
 *
 *   2. The World Carrier beneath the surface. `composeIntroFrame` takes a finished gameplay frame and shows the
 *      carrier (and everything it carries) as a dark shape under the water, then lets it surface along a per-pixel
 *      ORDER (the species decides: a turtle's dome first, a whale's snout first) behind a front of foam. Pixels are
 *      only ever recoloured whole: no blur, no translucency over the pixel grid, the game's own foam dither.
 *
 * Everything here is a pure function of (world, view, time, state); nothing reads or writes the simulation.
 */
import { hex, mix, type Color } from '../core/color';
import type { WorldPalette } from '../core/palette';
import type { PixelBuffer } from '../core/pixel';
import type { ViewRect } from '../render/view-camera';
import { T, type WorldDescription } from '../world/types';
import { creatureParts } from '../carriers/creature-render';
import { turtleBodyForWorld } from '../render/compose';

// The open sea lives with the renderers (M10: the game's own view paints it beyond the world's edge too).
export { OpenSea, SEA_CELL_W, SEA_CELL_H, type SeaStroke } from '../render/open-sea';
import { OpenSea, SEA_CELL_W, SEA_CELL_H, SEA_TILE as TILE } from '../render/open-sea';

export interface SubmergeState {
  /** How visible the submerged carrier is, 0 (open water only) .. 1 (a dark shape under the surface). */
  shadow: number;
  /** The surfacing front: a pixel whose order lies below it has surfaced; `FULLY_SURFACED` and above: everything. */
  progress: number;
  /** Per world pixel, 0..1: the order in which the carrier breaks the surface (see `script.ts`). */
  order: Float32Array;
  /**
   * Where the Carrier's moving parts (a manta's wing tips and whip, a whale's fins and flukes, a turtle's paddling
   * flippers) may be drawn over open water, with their wake (`movingPartsMask`), and the world's static layer: on
   * those pixels, whatever differs from the still water is a part of the animal and sinks with it.
   */
  parts: Uint8Array;
  staticLayer: PixelBuffer;
  /**
   * The birth of the island (`layers.ts`): the Carrier bare, the terrain alone, the per-pixel formation order and
   * the set of pixels that form; how far the land has formed (0..1) and how far life has appeared (0..1+VEG_BAND).
   */
  bare: PixelBuffer;
  land: PixelBuffer;
  form: Float32Array;
  formSet: Uint8Array;
  landProgress: number;
  vegProgress: number;
}

/** The soil front: the land arrives as fresh earth this far (order units) before it greens. */
export const SOIL_BAND = 0.07;
/** Life (plants, rocks, houses, their shadows) sparkles in over this much of the order. */
export const VEG_BAND = 0.12;
/** A vegetation progress at which every pixel's life is shown. */
export const FULLY_GROWN = 1 + VEG_BAND + 0.01;

/**
 * The union, over every frame of its beat, of the pixels a Carrier's moving parts and their wake can cover (a
 * world-sized mask, 1 where they may be drawn). A turtle's head and flippers move by a pixel or two: their sprites
 * grown by two.
 */
export function movingPartsMask(world: WorldDescription): Uint8Array {
  const { width, height } = world.options;
  const out = new Uint8Array(width * height);
  const stamp = (buf: PixelBuffer, x0: number, y0: number, grow: number) => {
    for (let y = 0; y < buf.height; y++)
      for (let x = 0; x < buf.width; x++) {
        if (!(buf.data[y * buf.width + x] >>> 24)) continue;
        for (let dy = -grow; dy <= grow; dy++)
          for (let dx = -grow; dx <= grow; dx++) {
            const px = x0 + x + dx;
            const py = y0 + y + dy;
            if (px >= 0 && py >= 0 && px < width && py < height) out[py * width + px] = 1;
          }
      }
  };
  if (world.creature) for (const frame of creatureParts(world)) for (const sprite of frame) stamp(sprite.buffer, sprite.x, sprite.y, 0);
  else if (world.turtle) {
    const body = turtleBodyForWorld(world);
    stamp(body.head.buffer, body.head.x, body.head.y, 2);
    for (const f of body.flippers) stamp(f.buffer, f.x, f.y, 2);
  }
  return out;
}

/** The foam front, in order units: solid foam, then a sparse trail. */
export const FOAM_BAND = 0.036;
export const FOAM_TRAIL = 0.11;
/** A progress at which every pixel (order ≤ 1) has surfaced and the foam trail has passed. */
export const FULLY_SURFACED = 1 + FOAM_TRAIL + 0.01;

/** Scratch buffers the compositor reuses between frames. */
export interface ComposeScratch {
  kinds: Uint8Array | null;
}

/** A small integer hash for dithering (stable per pixel and per frame bucket). */
const dither = (x: number, y: number, k: number) => {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Channel-wise mix without allocations (the hot loop's own). */
function blend(a: Color, b: Color, t: number): Color {
  const r = (a & 0xff) + (((b & 0xff) - (a & 0xff)) * t);
  const g = ((a >>> 8) & 0xff) + ((((b >>> 8) & 0xff) - ((a >>> 8) & 0xff)) * t);
  const bl = ((a >>> 16) & 0xff) + ((((b >>> 16) & 0xff) - ((a >>> 16) & 0xff)) * t);
  return (0xff000000 | ((bl + 0.5) << 16) | ((g + 0.5) << 8) | (r + 0.5)) >>> 0;
}

/** The tone a carrier pixel sinks toward under the water. */
export function deepTone(palette: WorldPalette): Color {
  return mix(palette.water.dark, hex('#0e1a3a'), 0.55);
}

/**
 * Recolour a gameplay frame into the cinematic's: open water beyond the world's edge, the carrier under the surface
 * where it has not surfaced yet, a foam front where it is surfacing, the live renderer's wave strokes over all of
 * the water. `view` is the view the frame was rendered with; `time` the same time.
 */
export function composeIntroFrame(screen: PixelBuffer, view: ViewRect, world: WorldDescription, sea: OpenSea, palette: WorldPalette, time: number, state: SubmergeState, scratch: ComposeScratch): void {
  const { width, height, cls } = world.terrain;
  const W = screen.width;
  const H = screen.height;
  const s = view.scale;
  const ox = view.originX;
  const oy = view.originY;
  const d = screen.data;
  const xmap = new Int32Array(W);
  const ymap = new Int32Array(H);
  for (let x = 0; x < W; x++) xmap[x] = Math.floor(ox + (x + 0.5) / s);
  for (let y = 0; y < H; y++) ymap[y] = Math.floor(oy + (y + 0.5) / s);
  if (!scratch.kinds || scratch.kinds.length !== W * H) scratch.kinds = new Uint8Array(W * H);
  // 0: the game's own pixel (land, the surfaced carrier, its own water); 1: open water painted here; 2: the
  // carrier under the surface.
  const kinds = scratch.kinds;
  const deep = deepTone(palette);
  const foam = palette.foam;
  const foamLight = palette.shallow.light;
  const frameK = Math.floor(time * 5);
  const shadow = Math.max(0, Math.min(1, state.shadow));
  const p = state.progress;
  const order = state.order;
  const allUp = p >= FULLY_SURFACED;
  const parts = state.parts;
  const still = state.staticLayer.data;
  const bare = state.bare.data;
  const land = state.land.data;
  const form = state.form;
  const formSet = state.formSet;
  const lp = state.landProgress;
  const vp = state.vegProgress;
  const allFormed = lp >= 1 + SOIL_BAND && vp >= FULLY_GROWN;
  const all = allUp && allFormed;
  const soilDark = mix(palette.path.dark, palette.grass.outline, 0.45);
  const soilMid = palette.path.dark;
  const soilLight = palette.path.mid;
  // The water's own colours: a part's wake and the game's wave strokes, which the sea beneath simply replaces.
  const white = 0xffffffff;
  const seaish = (c: Color) => c === foam || c === foamLight || c === palette.shallow.mid || c === palette.water.mid || c === palette.water.light || c === white;
  const isWater = (c: number) => c === T.DEEP || c === T.WATER || c === T.SHALLOW || c === T.FOAM;

  // ── Pass 1: water beyond the edge, the birth of the island, the shape beneath, the foam front ───────
  for (let y = 0; y < H; y++) {
    const wy = ymap[y];
    const insideY = wy >= 0 && wy < height;
    const row = y * W;
    const ty = Math.floor(wy / TILE);
    const tileRow = (wy - ty * TILE) * TILE;
    let curTx = 0x7fffffff;
    let curTile: Uint32Array | null = null;
    for (let x = 0; x < W; x++) {
      const wx = xmap[x];
      const i = row + x;
      const inside = insideY && wx >= 0 && wx < width;
      if (!inside) {
        const tx = Math.floor(wx / TILE);
        if (tx !== curTx) {
          curTile = sea.tile(tx, ty);
          curTx = tx;
        }
        d[i] = curTile![tileRow + (wx - tx * TILE)];
        kinds[i] = 1;
        continue;
      }
      const wi = wy * width + wx;
      const c = cls[wi];
      const water = isWater(c);
      // Open water that no moving part can reach, or everything up and grown: the game's own pixel.
      if (all || (c === T.DEEP && (!parts[wi] || d[i] === still[wi]))) {
        kinds[i] = 0;
        continue;
      }
      // The pixel as it is now, before the water: the island forming on the bare Carrier, life sparkling in.
      let px = d[i];
      if (!allFormed && !water && !parts[wi]) {
        const fo = form[wi];
        if (formSet[wi]) {
          const made = lp - fo;
          if (made < 0) px = bare[wi];
          else if (made < SOIL_BAND) {
            const h = dither(wx, wy, 0);
            px = h < 0.18 ? soilLight : h < 0.6 ? soilMid : soilDark;
          } else if (px !== land[wi]) {
            // Something stands here (a plant, a rock, a house, a shadow): it appears with the life front.
            const grown = vp - fo;
            if (grown < 0 || (grown < VEG_BAND && dither(wx, wy, frameK) > grown / VEG_BAND)) px = land[wi];
          }
        } else if (px !== land[wi] && px !== still[wi]) {
          // Life drawn over the Carrier's own skin or rim (a canopy over the edge): the same gate.
          const grown = vp - fo;
          if (grown < 0 || (grown < VEG_BAND && dither(wx, wy, frameK) > grown / VEG_BAND)) px = land[wi];
        }
      }
      const surf = p - order[wi];
      if (surf >= FOAM_TRAIL) {
        d[i] = px;
        kinds[i] = 0;
        continue;
      }
      if (surf >= 0) {
        // The front: a band of foam, then a sparse trail of lighter water fading out behind it.
        if (surf < FOAM_BAND) d[i] = (wx + wy * 2 + frameK) % 5 < 3 && dither(wx, wy, frameK >> 1) < 0.85 ? foam : foamLight;
        else if (dither(wx, wy, frameK) < 0.3 * (1 - (surf - FOAM_BAND) / (FOAM_TRAIL - FOAM_BAND))) d[i] = foamLight;
        else d[i] = px;
        kinds[i] = 0;
        continue;
      }
      // Not surfaced yet: the sea's own colour, with the carrier as a dark shape under it (its own water bands
      // and foam only appear once it is up).
      const tx = Math.floor(wx / TILE);
      if (tx !== curTx) {
        curTile = sea.tile(tx, ty);
        curTx = tx;
      }
      const base = curTile![tileRow + (wx - tx * TILE)];
      // A moving part drawn over the water (a wing beyond the disc, a fin, a flipper) is the animal wherever it is:
      // over the deep as over the sea's own bands round the still body. Only its wake, and water with nothing
      // drawn on it, is the sea.
      const partHere = parts[wi] !== 0 && px !== still[wi] && !seaish(px);
      if (shadow <= 0 || (water && !partHere)) {
        d[i] = base;
        kinds[i] = 1;
        continue;
      }
      d[i] = blend(base, blend(px, deep, 0.9), shadow * 0.9);
      kinds[i] = 2;
    }
  }

  // ── Pass 2: wave strokes over the water painted here (the game draws its own over its own water) ──
  const wx0 = xmap[0];
  const wx1 = xmap[W - 1];
  const wy0 = ymap[0];
  const wy1 = ymap[H - 1];
  const nx = wx1 - wx0 + 1;
  const ny = wy1 - wy0 + 1;
  const startX = new Int32Array(nx).fill(-1);
  const endX = new Int32Array(nx);
  const startY = new Int32Array(ny).fill(-1);
  const endY = new Int32Array(ny);
  for (let x = 0; x < W; x++) {
    const k = xmap[x] - wx0;
    if (startX[k] < 0) startX[k] = x;
    endX[k] = x + 1;
  }
  for (let y = 0; y < H; y++) {
    const k = ymap[y] - wy0;
    if (startY[k] < 0) startY[k] = y;
    endY[k] = y + 1;
  }
  const light = palette.water.mid;
  const lightUnder = mix(palette.water.mid, deep, 0.35);
  const cx0 = Math.floor((wx0 - 12) / SEA_CELL_W);
  const cx1 = Math.floor(wx1 / SEA_CELL_W);
  const cy0 = Math.floor((wy0 - 2) / SEA_CELL_H);
  const cy1 = Math.floor(wy1 / SEA_CELL_H);
  const pixels: number[] = [];
  for (let cy = cy0; cy <= cy1; cy++)
    for (let cx = cx0; cx <= cx1; cx++) {
      const st = sea.stroke(cx, cy);
      if (!st) continue;
      const drift = Math.floor(time * st.speed) % 10;
      const x = st.x + drift - 5;
      const y = st.y;
      pixels.length = 0;
      for (let k = 0; k < st.len; k++) pixels.push(x + k, y);
      pixels.push(st.curl > 0 ? x + st.len : x - 1, y + 1);
      // Only over water painted here (or the shape beneath it): never across the game's own pixels.
      let ok = true;
      for (let k = 0; k < pixels.length && ok; k += 2) {
        const px = pixels[k] - wx0;
        const py = pixels[k + 1] - wy0;
        if (px < 0 || px >= nx || py < 0 || py >= ny) continue;
        const sx0 = startX[px];
        const sy0 = startY[py];
        if (sx0 < 0 || sy0 < 0) continue;
        if (kinds[sy0 * W + sx0] === 0) ok = false;
      }
      if (!ok) continue;
      for (let k = 0; k < pixels.length; k += 2) {
        const px = pixels[k] - wx0;
        const py = pixels[k + 1] - wy0;
        if (px < 0 || px >= nx || py < 0 || py >= ny) continue;
        const sx0 = startX[px];
        const sy0 = startY[py];
        if (sx0 < 0 || sy0 < 0) continue;
        for (let sy = sy0; sy < endY[py]; sy++)
          for (let sx = sx0; sx < endX[px]; sx++) {
            const i = sy * W + sx;
            d[i] = kinds[i] === 2 ? lightUnder : light;
          }
      }
    }
}
