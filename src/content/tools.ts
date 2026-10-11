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

export const TOOL_ITEMS: readonly ItemDefinition[] = [
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
}

const fish = (id: string, label: string, plural: string, description: string, restores: number, joy: number, c: string, C: string): ItemDefinition => ({
  id: `blobbi-pixel:food:${id}`,
  label,
  plural,
  category: 'food',
  stack: 20,
  description,
  food: { restores, joy },
  icon: { rows: ['.......', '..fF...', '.fFfff.', 'fFefffF', '.fffff.', '..ff..F'], colours: { f: c, F: C, e: '#1b1f2a' } },
});

export const FISH_CONTENT: readonly FishContent[] = [
  { item: fish('minnow', 'minnow', 'minnows', 'A little silver fish. Better grilled.', 6, 0, '#a8b8c8', '#e0e8f0'), weight: 6, water: 'both' },
  { item: fish('sea-bream', 'sea bream', 'sea bream', 'A plump pink fish from the sea around the shell.', 12, 1, '#e0909a', '#ffc0c8'), weight: 3, water: 'sea' },
  { item: fish('pond-perch', 'pond perch', 'pond perch', 'A striped green fish from the island pond.', 12, 1, '#7aa860', '#b8d890'), weight: 3, water: 'pond' },
  { item: fish('rainbow-fish', 'rainbow fish', 'rainbow fish', 'Rare and shimmering. Blobbis think it is magic.', 15, 8, '#9a7ad8', '#7ad8c8'), weight: 1, water: 'both' },
];

/** Meals from fish (cooking station). */
export const FISH_MEALS: readonly { id: string; label: string; plural: string; description: string; food: { restores: number; energy?: number; joy?: number }; ingredients: readonly { item: string; quantity: number }[]; colours: { c: string; C: string } }[] = [
  { id: 'blobbi-pixel:meal:grilled-minnows', label: 'grilled minnows', plural: 'plates of grilled minnows', description: 'Crispy little fish with a squeeze of herbs.', food: { restores: 35, energy: 5 }, ingredients: [{ item: 'blobbi-pixel:food:minnow', quantity: 2 }], colours: { c: '#c8b090', C: '#f0e0c0' } },
  { id: 'blobbi-pixel:meal:fish-soup', label: 'fish soup', plural: 'bowls of fish soup', description: 'A warm, clear soup that gives a lot of energy.', food: { restores: 55, energy: 15, joy: 3 }, ingredients: [{ item: 'blobbi-pixel:food:sea-bream', quantity: 1 }, { item: 'blobbi-pixel:food:potato', quantity: 1 }, { item: 'blobbi-pixel:resource:herb', quantity: 1 }], colours: { c: '#e0d0b0', C: '#e0909a' } },
  { id: 'blobbi-pixel:meal:perch-roast', label: 'perch roast', plural: 'perch roasts', description: 'Pond perch roasted with tomatoes.', food: { restores: 55, joy: 6 }, ingredients: [{ item: 'blobbi-pixel:food:pond-perch', quantity: 1 }, { item: 'blobbi-pixel:food:tomato', quantity: 1 }], colours: { c: '#a8b070', C: '#e8402c' } },
  { id: 'blobbi-pixel:meal:rainbow-platter', label: 'rainbow platter', plural: 'rainbow platters', description: 'A festive plate around a rainbow fish. Pure delight.', food: { restores: 60, energy: 10, joy: 25 }, ingredients: [{ item: 'blobbi-pixel:food:rainbow-fish', quantity: 1 }, { item: 'blobbi-pixel:food:strawberry', quantity: 2 }], colours: { c: '#9a7ad8', C: '#7ad8c8' } },
];
