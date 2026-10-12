/**
 * DISCOVERIES: small things to find around the island, each at a stable spot (deterministic from the world seed,
 * on ground the Blobbi can reach, never under a building). Picked up with E into the bag as a special item that
 * can be read; some start or finish quests, all add a note to the journal.
 */
import type { ItemDefinition } from '../game/items';

export type Terrain = 'beach' | 'forest' | 'meadow' | 'grass' | 'plateau' | 'pond';

export interface DiscoveryContent {
  id: string;
  /** Where it can be: terrain the spot must be on. */
  terrain: Terrain;
  item: ItemDefinition;
  /** The note it adds to the journal. */
  lore: string;
}

const special = (id: string, label: string, description: string, rows: string[], colours: Record<string, string>): ItemDefinition => ({
  id: `blobbi-pixel:special:${id}`,
  label,
  plural: label,
  category: 'special',
  stack: 1,
  description,
  icon: { rows, colours },
});

export const DISCOVERY_CONTENT: readonly DiscoveryContent[] = [
  {
    id: 'bottle',
    terrain: 'beach',
    lore: 'blobbis-and-carriers',
    item: special('bottle', 'message in a bottle', 'A corked green bottle with a rolled letter inside. Read it.', ['...c..', '...g..', '..gGg.', '.gGggg', '.ggpgg', '.gpppg', '.ggggg', '..ggg.'], { c: '#b07a3a', g: '#4fae5a', G: '#a8e0a0', p: '#f3e3c3' }),
  },
  {
    id: 'carrier-stone',
    terrain: 'grass',
    lore: 'carrier-stone',
    item: special('carrier-stone', 'Carrier Stone', 'A warm, smooth stone ringed like a shell. It hums very softly.', ['..sss..', '.sSsss.', 'ssrrrss', 'srSsrss', 'ssrrrss', '.sssss.', '..sss..'], { s: '#7a8a9a', S: '#c8d8e8', r: '#e0c070' }),
  },
  {
    id: 'page-1',
    terrain: 'forest',
    lore: 'keepers',
    item: special('page-1', 'journal page', 'A weathered page in neat handwriting, about Keepers.', ['pppppp', 'pllllp', 'pppppp', 'pllllp', 'pplllp', 'pppppp'], { p: '#efe2c4', l: '#8a7a6a' }),
  },
  {
    id: 'page-2',
    terrain: 'meadow',
    lore: 'shell-soil',
    item: special('page-2', 'second journal page', 'Another page, stained with soil, about how the island grew.', ['pppppp', 'plllpp', 'pppppp', 'pllllp', 'pppppp', 'ppllpp'], { p: '#e8d8b0', l: '#7a6a5a' }),
  },
  {
    id: 'scale',
    terrain: 'beach',
    lore: 'scale',
    item: special('scale', 'shed scale', 'A curved piece of shell, polished by the sea.', ['..ttt..', '.tTttt.', 'tTtrttt', 'ttrrrtt', '.ttttt.'], { t: '#8a9a5a', T: '#c8d88a', r: '#5a6a3a' }),
  },
  {
    id: 'moonbloom',
    terrain: 'plateau',
    lore: 'moonbloom',
    item: special('moonbloom', 'moonbloom', 'A pale flower that smells like rain. Rare.', ['.w.w.', 'wWwWw', '.wyw.', 'wWwWw', '.w.w.', '..g..', '.gg..'], { w: '#e8ecff', W: '#ffffff', y: '#fff09a', g: '#4fbf3a' }),
  },
  {
    id: 'treasure',
    terrain: 'forest',
    lore: 'treasure',
    item: special('treasure', 'small treasure', 'A pouch of sea glass and an old button, left for whoever came next.', ['..bb..', '.bBBb.', 'bBgbBb', 'bgbabb', 'bbbbbb', '.bbbb.'], { b: '#8a5a33', B: '#b4733f', g: '#5fd0c0', a: '#9a7ad8' }),
  },
  {
    id: 'carving',
    terrain: 'pond',
    lore: 'carving',
    item: special('carving', 'driftwood carving', 'A little wooden turtle with a tiny Blobbi on its back.', ['...bb..', '..bBb..', '.ccccc.', 'cCcCcCc', 'ccccccc', 'c.c.c.c'], { c: '#a8845a', C: '#d8b88a', b: '#78d0a0', B: '#b8f0d0' }),
  },
];

/**
 * GROWN-LAND DISCOVERIES (M7): one in each new region, placed only on that region's land once it has grown (a
 * separate list, so the island's own discoveries above never move).
 */
export interface GrowthDiscoveryContent extends DiscoveryContent {
  /** The biome whose region holds it (see world/growth.ts). */
  biome: 'meadow' | 'woodland' | 'rocky' | 'coastal' | 'mushroom' | 'sanctuary';
}

export const GROWTH_DISCOVERIES: readonly GrowthDiscoveryContent[] = [
  {
    id: 'pressed-bloom',
    biome: 'meadow',
    terrain: 'meadow',
    lore: 'new-meadow',
    item: special('pressed-bloom', 'pressed bloom', 'A flower pressed flat between two leaves, still bright.', ['.p.p.', 'pPpPp', '.pyp.', 'pPpPp', '.p.p.', '..g..'], { p: '#ff9ad1', P: '#ffd0ea', y: '#fff09a', g: '#4fbf3a' }),
  },
  {
    id: 'acorn-cap',
    biome: 'woodland',
    terrain: 'forest',
    lore: 'new-woodland',
    item: special('acorn-cap', 'carved acorn cap', 'An acorn cap with a tiny spiral carved inside.', ['.bbbb.', 'bBbbBb', 'bbBBbb', '.cccc.', '.cCcc.', '..cc..'], { b: '#7a5030', B: '#a8784a', c: '#c8a060', C: '#e8c890' }),
  },
  {
    id: 'geode',
    biome: 'rocky',
    terrain: 'grass',
    lore: 'new-rocky',
    item: special('geode', 'little geode', 'A plain grey stone that is purple crystal inside.', ['..sss..', '.sAaAs.', 'sAaWaAs', 'saWWWas', 'sAaWaAs', '.sAaAs.', '..sss..'], { s: '#8a8f9a', a: '#9a6ad8', A: '#c8a0f0', W: '#f0e0ff' }),
  },
  {
    id: 'sea-glass',
    biome: 'coastal',
    terrain: 'beach',
    lore: 'new-shore',
    item: special('sea-glass', 'blue sea glass', 'A frosted pebble of blue glass, soft as soap.', ['..bb..', '.bBBb.', 'bBWBbb', 'bbBbbb', '.bbbb.'], { b: '#5fa8d0', B: '#9fd0f0', W: '#e8f8ff' }),
  },
  {
    id: 'glowcap',
    biome: 'mushroom',
    terrain: 'forest',
    lore: 'new-grove',
    item: special('glowcap', 'glowcap', 'A tiny mushroom that glows faintly green in the dark.', ['.gggg.', 'gGgGgg', 'gggggg', '..ww..', '..ww..', '.wwww.'], { g: '#8ae07a', G: '#d8ffc8', w: '#f0e8d8' }),
  },
  {
    id: 'golden-seed',
    biome: 'sanctuary',
    terrain: 'grass',
    lore: 'new-sanctuary',
    item: special('golden-seed', 'golden seed', 'A warm seed the colour of evening sun. It hums, very softly.', ['..yy..', '.yYYy.', 'yYWYyy', 'yyYyyy', '.yyyy.', '..gg..'], { y: '#e8b040', Y: '#ffd870', W: '#fff8d0', g: '#5aa04a' }),
  },
];

/**
 * Sea discoveries (M10): not things lying on the ground but meetings with marine life (`src/game/marine-life.ts`),
 * each found once, the first time it happens, with a keepsake for the bag and a note for the journal.
 */
export const SEA_DISCOVERIES: readonly DiscoveryContent[] = [
  {
    id: 'sea:seal',
    terrain: 'beach',
    lore: 'curious-seal',
    item: special('seal-sea-glass', 'seal\'s sea glass', 'A frosted green pebble of glass, worn smooth. The curious seal left it on the sand for you.', ['..gg..', '.gGgg.', 'gGgggg', 'gggggg', '.gggg.'], { g: '#7ac8a8', G: '#d8fff0' }),
  },
  {
    id: 'sea:glowray',
    terrain: 'beach',
    lore: 'glowing-ray',
    item: special('glowray-sketch', 'night-lamp sketch', 'A quick drawing of the glowing ray, made by moonlight. Read it.', ['pppppp', 'pbbbbp', 'pbcCbp', 'pbCcbp', 'pbbbbp', 'pppppp'], { p: '#f3e3c3', b: '#3a4a7a', c: '#7ae8f0', C: '#e8ffff' }),
  },
];

/** Every discovery, the island's, the grown land's and the sea's (journal, notes). */
export const ALL_DISCOVERIES: readonly DiscoveryContent[] = [...DISCOVERY_CONTENT, ...GROWTH_DISCOVERIES, ...SEA_DISCOVERIES];
