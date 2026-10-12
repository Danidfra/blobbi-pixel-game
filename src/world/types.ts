/**
 * THE WORLD DESCRIPTION: plain data between generation and rendering.
 * Nothing here knows a colour. A renderer (pixel, or one day a tilemap) reads
 * this; tests inspect it.
 */
import type { ObjectKind } from '../objects';

export interface WorldOptions {
  /** Logical size in pixels. */
  width: number;
  height: number;
  /** Palette name (`core/palette.ts`). */
  palette: string;
  /** How many islands to try for (0 = let the seed choose 2-4); the layout may place fewer when space runs out. */
  islands: number;
  /** Object density multiplier, 1 = default. */
  density: number;
  /**
   * WORLD SCALE: how many pixels one "unit" of the environment is. Trees,
   * houses, bridges, paths and shore bands all grow with it, so the world
   * can be sized around the character rather than the character around
   * the world. 1 is the phase 1 world (18 px trees); 1.6 makes a 16 px
   * Blobbi a small creature beside 30-50 px trees and 36-48 px houses.
   */
  scale: number;
  /** `island` (phase 1-3 archipelagos), `turtle` (one shell carrying the land) or `manta` (M7: a Wing Carrier). */
  kind: 'island' | 'turtle' | 'manta' | 'whale';
  /** A creature carrier's own seed (manta worlds); the world seed when absent. */
  carrierSeed?: string;
  /** The turtle's own seed; the world seed when absent. */
  turtleSeed?: string;
  /** The World Carrier's shell variant (turtle worlds): 0 = the M1 shell, 1-3 = the enlarged shells. Default: Variant B (2). */
  shellVariant?: import('../carrier/types').ShellVariant;
}

export const DEFAULT_WORLD_OPTIONS: WorldOptions = { width: 704, height: 448, palette: 'cozy', islands: 0, density: 1, scale: 1.6, kind: 'island' };

export interface Harmonic {
  k: number;
  amp: number;
  phase: number;
}

/** A coastline feature: a bay cuts into the shore, a cape reaches out of it, each a soft bump in the radius function. */
export interface CoastFeature {
  kind: 'bay' | 'cape';
  /** Direction from the island's centre, radians. */
  angle: number;
  /** Depth (bay) or reach (cape) as a fraction of the mean radius. */
  size: number;
  /** Angular half-width, radians. */
  width: number;
}

/** A raised inner plateau with a cliff on its sunward (south) side. */
export interface Plateau {
  cx: number;
  cy: number;
  radius: number;
  harmonics: Harmonic[];
}

export interface Pier {
  island: number;
  axis: Axis;
  /** Shore end and water end of the deck's centre line. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
}

export interface Island {
  id: number;
  cx: number;
  cy: number;
  /** Mean radius in pixels. */
  radius: number;
  /** Low-order radial harmonics that give the island its silhouette. */
  harmonics: Harmonic[];
  /** Amplitude of the fine noise on the boundary, as a fraction of the radius. */
  roughness: number;
  /** Island whose bridge this one was placed from (-1 for the first). */
  parent: number;
  coast: CoastFeature[];
  plateau: Plateau | null;
  /** Vertical over horizontal stretch of the base shape (1 is a circle); a turtle shell is an oval. */
  aspect?: number;
}

export type Axis = 'h' | 'v';

export interface Bridge {
  id: number;
  from: number;
  to: number;
  axis: Axis;
  /** Centre line: for 'h' the bridge runs x0..x1 at y0 (= y1); for 'v' y0..y1 at x0. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Deck width across the axis, in pixels. */
  width: number;
}

export interface Path {
  island: number;
  points: { x: number; y: number }[];
  width: number;
}

/** Terrain classes, per pixel. Order matters: higher = further inland. */
export const T = {
  DEEP: 0,
  WATER: 1,
  SHALLOW: 2,
  FOAM: 3,
  SAND_WET: 4,
  SAND: 5,
  GRASS_EDGE: 6,
  GRASS: 7,
  GRASS_PATCH: 8,
  PATH: 9,
  /** The earth wall under a plateau's south edge. */
  CLIFF_FACE: 10,
  /** Darker grass under tree groves. */
  GRASS_DARK: 11,
  /** The turtle's shell rim beyond the terrain: not walkable. */
  RIM: 12,
  /** The turtle's head, neck, flippers and tail: not walkable. */
  SKIN: 13,
  /** A freshwater pond on the land, and its bank. */
  POND: 14,
  POND_EDGE: 15,
  /** A flower meadow: lighter grass with blooms. */
  MEADOW: 16,
  /** Grown land (M7): soft moss under a mushroom grove. */
  MOSS: 17,
  /** Grown land (M7): the gravel of a rocky garden. */
  GRAVEL: 18,
  /** Grown land (M7): salt-loving shore turf. */
  CLOVER: 19,
} as const;
export const MAX_TERRAIN_CLASS = 19;
/** Classes a character may stand on. */
export const WALKABLE = new Set<number>([T.SAND_WET, T.SAND, T.GRASS_EDGE, T.GRASS, T.GRASS_PATCH, T.PATH, T.GRASS_DARK, T.MEADOW, T.MOSS, T.GRAVEL, T.CLOVER]);
/** Classes that count as land for shore detection, audits and bridges. */
export const isLandClass = (c: number) => c >= T.GRASS_EDGE && c !== T.RIM && c !== T.SKIN;
export type TerrainClass = (typeof T)[keyof typeof T];

export interface TerrainMap {
  width: number;
  height: number;
  /** One `TerrainClass` per pixel. */
  cls: Uint8Array;
  /** Signed distance to the nearest island boundary: negative inside land. */
  dist: Float32Array;
  /** Which island a pixel belongs to (-1 for water). */
  owner: Int8Array;
  /** 0 at sea level, 1 on a plateau. */
  elevation: Uint8Array;
}

export type Layer = 'vegetation' | 'structures' | 'details';

export interface Placement {
  kind: ObjectKind;
  layer: Layer;
  seed: string;
  size: number;
  /** Ground anchor in world pixels. */
  x: number;
  y: number;
  island: number;
  variation?: Record<string, unknown>;
}

export interface WorldStats {
  islands: number;
  bridges: number;
  piers: number;
  landPixels: number;
  objects: Record<string, number>;
  generationMs: number;
}

export interface WorldDescription {
  seed: string;
  options: WorldOptions;
  islands: Island[];
  bridges: Bridge[];
  piers: Pier[];
  paths: Path[];
  /** Each island's hub: the open spot its paths meet at, and where a character starts. */
  hubs: { island: number; x: number; y: number }[];
  /** Present when the island is a turtle's shell: the animal's anatomy, for the painter and the live renderer. */
  turtle?: import('../turtle/turtle').TurtleAnatomy;
  /** The World Carrier (turtle worlds): species, variant, canvas, and the island frame's origin in it. */
  carrier?: import('../carrier/types').WorldCarrier;
  terrain: TerrainMap;
  objects: Placement[];
  stats: WorldStats;
  /** Present on a creature world (M7: the manta), the carrier's species, seed, head and anatomy. */
  creature?: import('../carriers/creature').CreatureInfo;
  /** Present on a grown world (M7, `world/growth.ts`): the stage, its regions and where they are. */
  growth?: import('./growth').WorldGrowth;
}
