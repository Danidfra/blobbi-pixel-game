/**
 * TERRAIN PAINTER: classes in, pixels out. This is where the shared palette
 * meets the terrain: outlines between bands, wave strokes on the water, a
 * dashed foam line, speckles on the sand. All detail is hashed from the
 * pixel position, so it is stable under regeneration.
 */
import { hash32 } from '../core/rng';
import { createNoise } from '../core/noise';
import { mix } from '../core/color';
import { PixelBuffer } from '../core/pixel';
import type { WorldPalette } from '../core/palette';
import { T, type TerrainMap } from '../world/types';

export interface PaintOptions {
  /** When true, foam dashes and wave strokes are left for a live renderer to animate. */
  animatedWater?: boolean;
  /** A world-sized buffer whose pixels are used for the turtle's rim and skin classes. */
  underlay?: PixelBuffer;
}

export function paintTerrain(buf: PixelBuffer, terrain: TerrainMap, palette: WorldPalette, seed: string, options: PaintOptions = {}): void {
  const { width, height, cls, elevation } = terrain;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? T.DEEP : cls[y * width + x]);
  const elev = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : elevation[y * width + x]);
  const waveSalt = hash32(`${seed}/waves`);
  const streaks = createNoise(`${seed}/water/streaks`, 44);
  const streakColor = mix(palette.water.dark, palette.water.mid, 0.55);
  const grassDark = mix(palette.grass.mid, palette.grass.dark, 0.5);
  const cliffEarth = mix(palette.wood.mid, palette.path.dark, 0.3);
  const cliffLight = mix(palette.wood.light, palette.path.mid, 0.4);
  const cliffDark = mix(palette.wood.dark, palette.grass.outline, 0.35);
  const cliffFoot = mix(palette.wood.outline, palette.grass.outline, 0.5);
  const mossMid = mix(palette.grass.dark, palette.foliage[0].dark, 0.5);
  const mossDark = mix(mossMid, palette.grass.outline, 0.35);
  const cloverMid = mix(palette.grass.mid, palette.shallow.mid, 0.1);
  const cloverLight = mix(palette.grass.light, palette.shallow.light, 0.14);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = cls[y * width + x];
      let color: number;
      switch (c) {
        case T.DEEP:
          // Open water carries soft lighter streaks: a low-frequency noise, thresholded into blobs.
          color = streaks.fbm(x, y, 2) > 0.62 ? streakColor : palette.water.dark;
          break;
        case T.WATER:
          color = palette.water.mid;
          break;
        case T.SHALLOW:
          color = palette.shallow.mid;
          break;
        case T.FOAM:
          // A dashed foam line: 3 on, 2 off, phase from position so it follows the shore.
          color = options.animatedWater ? palette.shallow.light : (x + y * 2 + ((waveSalt >>> 3) & 3)) % 5 < 3 ? palette.foam : palette.shallow.light;
          break;
        case T.SAND_WET:
          color = palette.sand.dark;
          break;
        case T.SAND:
          color = palette.sand.mid;
          break;
        case T.GRASS_EDGE: {
          // Outline where grass meets sand; the band inside it is a darker grass.
          const n = at(x - 1, y) < T.GRASS_EDGE || at(x + 1, y) < T.GRASS_EDGE || at(x, y - 1) < T.GRASS_EDGE || at(x, y + 1) < T.GRASS_EDGE;
          color = n ? palette.grass.outline : palette.grassEdge;
          break;
        }
        case T.GRASS:
          color = palette.grass.mid;
          break;
        case T.GRASS_PATCH:
          color = palette.grassPatch;
          break;
        case T.PATH: {
          const n = at(x - 1, y) !== T.PATH || at(x + 1, y) !== T.PATH || at(x, y - 1) !== T.PATH || at(x, y + 1) !== T.PATH;
          color = n ? palette.path.dark : palette.path.mid;
          break;
        }
        case T.GRASS_DARK:
          color = grassDark;
          break;
        case T.RIM:
        case T.SKIN: {
          const u = options.underlay?.get(x, y) ?? 0;
          color = u >>> 24 ? u : palette.water.mid;
          break;
        }
        case T.POND: {
          // Still fresh water: a little lighter than the sea, with soft streaks.
          color = streaks.fbm(x * 1.7, y * 1.7, 2) > 0.62 ? palette.shallow.light : palette.shallow.mid;
          break;
        }
        case T.POND_EDGE: {
          // A muddy bank, darker where it meets the water.
          const wet = at(x - 1, y) === T.POND || at(x + 1, y) === T.POND || at(x, y - 1) === T.POND || at(x, y + 1) === T.POND;
          color = wet ? mix(palette.path.dark, palette.grass.outline, 0.45) : palette.path.dark;
          break;
        }
        case T.MEADOW: {
          // Lighter grass with blooms: a hashed sprinkle of two flower colours and pale grass.
          const h = hash32(`${seed}/meadow:${x}:${y}`);
          const k = h & 0x3f;
          color = k === 0 ? palette.flowers[(h >>> 8) % palette.flowers.length] : k === 1 ? palette.flowers[(h >>> 12) % palette.flowers.length] : k === 2 ? palette.grass.light : (h & 0x7) === 0 ? palette.grassPatch : mix(palette.grassPatch, palette.grass.light, 0.4);
          break;
        }
        case T.MOSS: {
          // Moss: a deep, soft green, speckled lighter and with the odd dark tuft.
          const h = hash32(`${seed}/moss:${x}:${y}`);
          color = (h & 0x1f) === 0 ? palette.grass.light : (h & 0x1f) === 1 ? palette.grass.outline : (h & 3) === 0 ? mossDark : mossMid;
          break;
        }
        case T.GRAVEL: {
          // Gravel: path tones with stone grains.
          const h = hash32(`${seed}/gravel:${x}:${y}`);
          const k = h & 0xf;
          color = k === 0 ? palette.stone.light : k === 1 ? palette.stone.mid : k === 2 ? palette.stone.dark : (h >>> 8) & 1 ? palette.path.mid : palette.path.light;
          break;
        }
        case T.CLOVER: {
          // Shore turf: a cool, blue-green grass with pale flecks (thrift) here and there.
          const h = hash32(`${seed}/clover:${x}:${y}`);
          color = (h & 0xff) === 0 ? palette.flowers[0] : (h & 0x7) === 0 ? cloverLight : (h & 0xf) === 1 ? palette.grass.mid : cloverMid;
          break;
        }
        case T.CLIFF_FACE: {
          // The plateau's lip in outline, an earth wall with a lit upper band and vertical streaks, a dark foot.
          const below = at(x, y + 1);
          const h = hash32(`${seed}/cliff:${x}`);
          if (elev(x, y - 1)) color = palette.grass.outline;
          else if (below !== T.CLIFF_FACE) color = cliffFoot;
          else if (elev(x, y - 2)) color = (h & 3) === 0 ? cliffEarth : cliffLight;
          else color = (h & 7) === 0 ? cliffDark : (h & 7) === 1 ? cliffLight : cliffEarth;
          break;
        }
        default:
          color = palette.water.mid;
      }
      buf.data[y * width + x] = color;
    }
  }

  // Plateau rim: a dark outline where raised ground meets lower ground on its north, east and west sides,
  // and a shadow row under each cliff foot.
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (elevation[i]) {
        if ((!elev(x - 1, y) || !elev(x + 1, y) || !elev(x, y - 1)) && cls[i] !== T.PATH) buf.data[i] = palette.grass.outline;
        // A lit lip just inside the northern rim.
        else if (!elev(x, y - 2) && elev(x, y - 1) && cls[i] !== T.PATH && cls[i] !== T.GRASS_DARK) buf.data[i] = palette.grass.light;
      } else if ((cls[i] === T.GRASS || cls[i] === T.GRASS_PATCH || cls[i] === T.GRASS_DARK || cls[i] === T.MEADOW) && at(x, y - 1) === T.CLIFF_FACE) buf.data[i] = palette.shadowOnGrass;
    }

  // Water detail: short horizontal wave strokes, sparse, never touching each other.
  for (let y = 2; y < height - 2 && !options.animatedWater; y++) {
    for (let x = 2; x < width - 6; x++) {
      const c = cls[y * width + x];
      if (c !== T.WATER && c !== T.DEEP && c !== T.SHALLOW) continue;
      const h = hash32(`${waveSalt}:${x >> 3}:${y >> 2}`);
      // One candidate per 8x4 cell; only some cells get a stroke, at a hashed offset.
      if ((h & 0xff) > 56) continue;
      const ox = (h >>> 8) & 7;
      const oy = (h >>> 11) & 3;
      if ((x & 7) !== ox || (y & 3) !== oy) continue;
      const len = 3 + ((h >>> 14) & 1) * 2;
      const light = c === T.SHALLOW ? palette.shallow.light : c === T.DEEP ? palette.water.mid : palette.water.light;
      let ok = true;
      for (let i = 0; i < len + 1; i++) if (cls[y * width + x + i] !== c) ok = false;
      if (!ok) continue;
      buf.hline(x, x + len - 1, y, light);
      // A one-pixel tail a row below gives the stroke a curl.
      if (((h >>> 15) & 1) === 1) buf.set(x + len, y + 1, light);
      else buf.set(x - 1, y + 1, light);
    }
  }

  // Sand speckles and grass sparkle: single pixels, very sparse.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = cls[y * width + x];
      if (c === T.SAND) {
        const h = hash32(`${seed}/sand:${x}:${y}`);
        if ((h & 0x3f) === 0) buf.set(x, y, palette.sand.dark);
        else if ((h & 0x3f) === 1) buf.set(x, y, palette.sand.light);
      } else if (c === T.GRASS || c === T.GRASS_PATCH || c === T.GRASS_DARK) {
        const h = hash32(`${seed}/grass:${x}:${y}`);
        if ((h & 0x3f) === 0) buf.set(x, y, c === T.GRASS_DARK ? palette.grass.mid : c === T.GRASS ? palette.grass.light : palette.grass.mid);
        else if ((h & 0x3f) === 1) buf.set(x, y, c === T.GRASS_DARK ? palette.grass.outline : palette.grass.dark);
        else if ((h & 0x3f) === 2 && c !== T.GRASS_PATCH) {
          // A two-pixel blade.
          buf.set(x, y, palette.grass.dark);
          buf.set(x, y - 1, c === T.GRASS_DARK ? palette.grass.dark : palette.grass.light);
        }
      } else if (c === T.PATH) {
        const h = hash32(`${seed}/path:${x}:${y}`);
        if ((h & 0x1f) === 0) buf.set(x, y, palette.path.light);
      }
    }
  }
}
