/**
 * TOOL CONTENT: upgrades, fishing and their materials, as data. Copper tools are the simple ones made better at a
 * workbench (the old tool goes into the recipe, so you never own both by accident). Fish come from fishing with a
 * rod at the shore or the pond.
 */
import type { ItemDefinition } from '../game/items';

const tool = (id: string, label: string, type: NonNullable<ItemDefinition['tool']>['type'], interactions: NonNullable<ItemDefinition['tool']>['interactions'], description: string, tier = 1): ItemDefinition => ({
  id,
  label,
  plural: `${label}s`,
  category: 'tool',
  stack: 1,
  description,
  tool: { type, interactions, tier },
});

export const COPPER_ORE: ItemDefinition = {
  id: 'blobbi-pixel:material:copper-ore',
  label: 'copper ore',
  plural: 'copper ore',
  category: 'material',
  stack: 30,
  description: 'Green-flecked stone with a warm gleam. Found in large rocks once you know where to look.',
  icon: { rows: ['..sss..', '.sSoss.', 'soOosss', 'ssoOsos', '.ssssO.', '..sss..'], colours: { s: '#8a8f9f', S: '#c4c9d8', o: '#d8843a', O: '#ffb070' } },
};

/** The canoe (M10 phase B): made at a workbench once the island has a fisher; launched from the shore (E). */
export const CANOE_ITEM: ItemDefinition = {
  id: 'blobbi-pixel:vehicle:canoe',
  label: 'canoe',
  plural: 'canoes',
  category: 'special',
  stack: 1,
  description: 'A small wooden canoe with a paddle. Stand at the shore facing the water and press E to launch it; E beside it to get in.',
  icon: { rows: ['..........', '.o......o.', 'oLLLLLLLLo', '.oddLdddo.', '..oooooo..'], colours: { o: '#5a3a1e', L: '#c88a4a', d: '#7a4a24' } },
};

export const TOOL_ITEMS: readonly ItemDefinition[] = [
  CANOE_ITEM,
  tool('blobbi-pixel:tool:copper-axe', 'copper axe', 'axe', ['chop'], 'A keen copper edge: fells a grown tree in two hits.', 2),
  tool('blobbi-pixel:tool:copper-pickaxe', 'copper pickaxe', 'pickaxe', ['mine'], 'Breaks a large rock in three hits.', 2),
  tool('blobbi-pixel:tool:copper-hoe', 'copper hoe', 'hoe', ['till'], 'Tills a row of three plots in one go.', 2),
  tool('blobbi-pixel:tool:copper-can', 'copper watering can', 'watering-can', ['water'], 'A big can: waters a three by three patch of crops.', 2),
  tool('blobbi-pixel:tool:fishing-rod', 'fishing rod', 'fishing-rod', ['fish'], 'Cast at the sea or the pond (E), wait for the bite, then press E again.'),
  COPPER_ORE,
];

export const UPGRADES: readonly { id: string; from: string; to: string; extra: readonly { item: string; quantity: number }[] }[] = [
  { id: 'copper-axe', from: 'blobbi-pixel:tool:simple-axe', to: 'blobbi-pixel:tool:copper-axe', extra: [{ item: COPPER_ORE.id, quantity: 3 }, { item: 'blobbi-pixel:material:wood', quantity: 2 }] },
  { id: 'copper-pickaxe', from: 'blobbi-pixel:tool:simple-pickaxe', to: 'blobbi-pixel:tool:copper-pickaxe', extra: [{ item: COPPER_ORE.id, quantity: 4 }, { item: 'blobbi-pixel:material:wood', quantity: 2 }] },
  { id: 'copper-hoe', from: 'blobbi-pixel:tool:simple-hoe', to: 'blobbi-pixel:tool:copper-hoe', extra: [{ item: COPPER_ORE.id, quantity: 3 }, { item: 'blobbi-pixel:material:wood', quantity: 1 }] },
  { id: 'copper-can', from: 'blobbi-pixel:tool:watering-can', to: 'blobbi-pixel:tool:copper-can', extra: [{ item: COPPER_ORE.id, quantity: 4 }] },
];

/** Fish: what a catch can be, how likely, and what it feeds. Ponds have their own fish. */
export interface FishContent {
  item: ItemDefinition;
  /** Weight among the catches of its water. */
  weight: number;
  water: 'sea' | 'pond' | 'both';
  /**
   * M10 phase B: where in the sea — the coast (shallow water by the island) or open water (the deep, and the sea
   * beyond, reached from the canoe or a long cast); absent: anywhere.
   */
  region?: 'coast' | 'open';
  /** M10 phase B: only by day or only at night; absent: any time. */
  time?: 'day' | 'night';
  /** Where and when, for the fish log's hint. */
  hint?: string;
}

/**
 * Each fish's own silhouette (M10 phase C, KI-53), facing left like every fish in the lab: `f` body, `F` light
 * (belly, scales), `d` dark (fins, stripes, spots), `e` the eye; `y` and `p` the rainbow fish's extra bands.
 */
const FISH_SHAPES: Record<string, readonly string[]> = {
  minnow: ['...dd....', '.ffffff.d', 'eFFFFFfdd', '.ffffff.d'],
  'sea-bream': ['...ddd...', '..dffff..', '.ffffffd.', 'efFFFFfdd', '.FFFFFffd', '..FFFf...', '...d.....'],
  'pond-perch': ['..d.d.d..', '.fdfdfdf.', 'efdFdFdfd', '.FdFdFdFd', '..FFFFF..'],
  'rainbow-fish': ['...ff....', '.ffyypp..', 'eFFyyppfd', '.FFyyppdd', '..Fyy....'],
  flounder: ['..ddddd...', '.dfffffd..', 'dfeffeffdd', 'dfdffdffd.', '.dfffffd.d', '..ddddd...'],
  mackerel: ['..dddd....d', '.fdfdfdfdd.', 'efFFFFFFfd.', '.FFFFFFFfdd', '..........d'],
  moonfish: ['...fff...', '.ffFFFf..', 'fFFFFFFf.', 'eFFFFFFfd', 'fFFFFFFfd', '.fFFFFf..', '...fff...'],
};

const fish = (id: string, label: string, plural: string, description: string, restores: number, joy: number, c: string, C: string, dark = '#3a4a5a'): ItemDefinition => ({
  id: `blobbi-pixel:food:${id}`,
  label,
  plural,
  category: 'food',
  stack: 20,
  description,
  food: { restores, joy },
  icon: { rows: FISH_SHAPES[id] ?? FISH_SHAPES.minnow, colours: { f: c, F: C, d: dark, e: '#1b1f2a', y: '#ffd860', p: '#ff8ab8' } },
});

export const FISH_CONTENT: readonly FishContent[] = [
  { item: fish('minnow', 'minnow', 'minnows', 'A little silver fish. Better grilled.', 6, 0, '#a8b8c8', '#e0e8f0', '#6a7a8c'), weight: 6, water: 'both' },
  { item: fish('sea-bream', 'sea bream', 'sea bream', 'A plump pink fish from the sea around the shell.', 12, 1, '#e0909a', '#ffc0c8', '#b05868'), weight: 3, water: 'sea' },
  { item: fish('pond-perch', 'pond perch', 'pond perch', 'A striped green fish from the island pond.', 12, 1, '#7aa860', '#b8d890', '#3e6a30'), weight: 3, water: 'pond' },
  { item: fish('rainbow-fish', 'rainbow fish', 'rainbow fish', 'Rare and shimmering. Blobbis think it is magic.', 15, 8, '#9a7ad8', '#7ad8c8', '#5a4a98'), weight: 1, water: 'both' },
  // M10 phase B: coastal and open-water fish, by day and by night.
  { item: fish('flounder', 'flounder', 'flounder', 'A flat sandy fish that hides in the shallows by day.', 12, 1, '#c8b088', '#e8d8b8', '#8a7050'), weight: 3, water: 'sea', region: 'coast', time: 'day', hint: 'the shallows by the island, by day' },
  { item: fish('mackerel', 'mackerel', 'mackerel', 'A striped, quick fish of the open water. Lovely on a skewer.', 14, 2, '#4a7a9a', '#c8dce8', '#1e3a5a'), weight: 4, water: 'sea', region: 'open', hint: 'open water, from the canoe' },
  { item: fish('moonfish', 'moonfish', 'moonfish', 'A round silver fish that rises toward the moon. Rare, and gentle.', 16, 10, '#a8b4d8', '#f4f8ff', '#6a78a8'), weight: 1, water: 'sea', region: 'open', time: 'night', hint: 'open water, at night' },
];

/** Seaweed (M10 phase B): gathered at the kelp garden out at sea; a little food, and a broth. */
export const SEAWEED_ITEM: ItemDefinition = {
  id: 'blobbi-pixel:food:seaweed',
  label: 'seaweed',
  plural: 'seaweed',
  category: 'food',
  stack: 30,
  description: 'Ribbons of kelp from the garden out at sea. Salty, and good in a broth.',
  food: { restores: 5 },
  icon: { rows: ['.g..g.', '.gG.gG', 'gG.gG.', '.gGg..', '..gG..', '.gg...'], colours: { g: '#3a7a4a', G: '#7ac08a' } },
};

/** Meals from fish (cooking station). */
export const FISH_MEALS: readonly { id: string; label: string; plural: string; description: string; food: { restores: number; energy?: number; joy?: number }; ingredients: readonly { item: string; quantity: number }[]; colours: { c: string; C: string } }[] = [
  { id: 'blobbi-pixel:meal:grilled-minnows', label: 'grilled minnows', plural: 'plates of grilled minnows', description: 'Crispy little fish with a squeeze of herbs.', food: { restores: 35, energy: 5 }, ingredients: [{ item: 'blobbi-pixel:food:minnow', quantity: 2 }], colours: { c: '#c8b090', C: '#f0e0c0' } },
  { id: 'blobbi-pixel:meal:fish-soup', label: 'fish soup', plural: 'bowls of fish soup', description: 'A warm, clear soup that gives a lot of energy.', food: { restores: 55, energy: 15, joy: 3 }, ingredients: [{ item: 'blobbi-pixel:food:sea-bream', quantity: 1 }, { item: 'blobbi-pixel:food:potato', quantity: 1 }, { item: 'blobbi-pixel:resource:herb', quantity: 1 }], colours: { c: '#e0d0b0', C: '#e0909a' } },
  { id: 'blobbi-pixel:meal:perch-roast', label: 'perch roast', plural: 'perch roasts', description: 'Pond perch roasted with tomatoes.', food: { restores: 55, joy: 6 }, ingredients: [{ item: 'blobbi-pixel:food:pond-perch', quantity: 1 }, { item: 'blobbi-pixel:food:tomato', quantity: 1 }], colours: { c: '#a8b070', C: '#e8402c' } },
  { id: 'blobbi-pixel:meal:mackerel-skewers', label: 'mackerel skewers', plural: 'mackerel skewers', description: 'Grilled open-water mackerel with herbs, on sticks.', food: { restores: 50, energy: 10, joy: 4 }, ingredients: [{ item: 'blobbi-pixel:food:mackerel', quantity: 2 }, { item: 'blobbi-pixel:resource:herb', quantity: 1 }], colours: { c: '#4a7a9a', C: '#d8b070' } },
  { id: 'blobbi-pixel:meal:kelp-soup', label: 'kelp soup', plural: 'bowls of kelp soup', description: 'A green, salty broth from the kelp garden, with a flounder in it.', food: { restores: 45, energy: 12, joy: 3 }, ingredients: [{ item: 'blobbi-pixel:food:seaweed', quantity: 2 }, { item: 'blobbi-pixel:food:flounder', quantity: 1 }], colours: { c: '#7ac08a', C: '#c8b088' } },
  { id: 'blobbi-pixel:meal:rainbow-platter', label: 'rainbow platter', plural: 'rainbow platters', description: 'A festive plate around a rainbow fish. Pure delight.', food: { restores: 60, energy: 10, joy: 25 }, ingredients: [{ item: 'blobbi-pixel:food:rainbow-fish', quantity: 1 }, { item: 'blobbi-pixel:food:strawberry', quantity: 2 }], colours: { c: '#9a7ad8', C: '#7ad8c8' } },
];
