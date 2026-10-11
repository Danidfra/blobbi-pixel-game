/**
 * THE ITEM REGISTRY. Every item the game knows, by a stable id in the `game:category:name` style of the
 * inventory protocol's `d` tags. Resources come from the ground, materials from work, tools from recipes,
 * seeds and food from the farm, furniture from the workbench, special items from discoveries and quests.
 *
 * Core items are defined here; everything else is CONTENT (`src/content/`): plain data registered at load, so a new
 * crop, meal or piece of furniture is a new entry, never new logic. Every item has a description and a menu
 * category; content items can carry a pixel icon template (others get their icon from their sprite).
 */
import { CONTENT_ITEMS } from '../content';
import { CROP_CONTENT, type CropContent } from '../content/crops';

export type ItemCategory = 'resource' | 'material' | 'tool' | 'seed' | 'food' | 'furniture' | 'special';
export type ToolType = 'axe' | 'pickaxe' | 'hoe' | 'watering-can' | 'fishing-rod';
/** Interactions a tool can perform on the world. */
export type ToolInteraction = 'chop' | 'mine' | 'till' | 'water' | 'fish';

/** What eating one item does to the Blobbi's needs (hunger restored is `restores`). */
export interface FoodEffect {
  restores: number;
  energy?: number;
  joy?: number;
}

/** A small hand-set pixel icon: rows of letters, each letter a colour (`.` is clear). */
export interface IconTemplate {
  rows: readonly string[];
  colours: Readonly<Record<string, string>>;
}

export interface ItemDefinition {
  id: string;
  label: string;
  /** Plural label for counters. */
  plural: string;
  category: ItemCategory;
  /** Stack limit in one inventory. */
  stack: number;
  description: string;
  /** Tools: what it does; `tier` 2+ is an upgrade (faster or wider). */
  tool?: { type: ToolType; interactions: readonly ToolInteraction[]; tier?: number };
  /** Food: what one item does to the Blobbi's needs. */
  food?: FoodEffect;
  /** Furniture: the placeable kind it becomes when placed (see `game/placeables.ts`). */
  place?: string;
  icon?: IconTemplate;
}

const tool = (id: string, label: string, type: ToolType, interactions: readonly ToolInteraction[], description: string, tier = 1): ItemDefinition => ({
  id,
  label,
  plural: `${label}s`,
  category: 'tool',
  stack: 1,
  description,
  tool: { type, interactions, tier },
});

const CORE = {
  stick: { id: 'blobbi-pixel:resource:stick', label: 'stick', plural: 'sticks', category: 'resource', stack: 50, description: 'A dry stick from under a tree. Handles, fences, kindling.' },
  stone: { id: 'blobbi-pixel:resource:stone', label: 'stone', plural: 'stones', category: 'resource', stack: 30, description: 'A fist-sized stone. Tool heads, walls and paths.' },
  seed: { id: 'blobbi-pixel:resource:seed', label: 'seed', plural: 'seeds', category: 'resource', stack: 20, description: 'Wild seeds from bushes and flowers. They grow into turnips.' },
  wood: { id: 'blobbi-pixel:material:wood', label: 'wood', plural: 'wood', category: 'material', stack: 40, description: 'Sturdy logs from a felled tree. The island\'s main building material.', icon: { rows: ['..ll...', '.lLLl..', 'lLccLl.', 'lcrcLll', 'lLccLLl', '.lLLlLl', '..lllL.', '....ll.'], colours: { l: '#8a5a33', L: '#b4733f', c: '#e3c48a', r: '#c49a5a' } } },
  axe: tool('blobbi-pixel:tool:simple-axe', 'simple axe', 'axe', ['chop'], 'Fells a grown tree in three hits. It grows back.'),
  pickaxe: tool('blobbi-pixel:tool:simple-pickaxe', 'simple pickaxe', 'pickaxe', ['mine'], 'Breaks a large rock into stones in four hits.'),
  hoe: tool('blobbi-pixel:tool:simple-hoe', 'simple hoe', 'hoe', ['till'], 'Tills flat grass into a farm plot.'),
  wateringCan: tool('blobbi-pixel:tool:watering-can', 'watering can', 'watering-can', ['water'], 'Waters a crop and its two neighbours across the row in one go.'),
} satisfies Record<string, ItemDefinition>;

/** The seed and produce items a crop definition describes. */
export function cropItems(c: CropContent): ItemDefinition[] {
  const colours = { g: '#4fbf3a', G: '#8fe06a', d: '#2f8a2a', ...c.colours };
  const out: ItemDefinition[] = [{ ...c.produce, icon: { rows: c.icon, colours } }];
  if (typeof c.seed !== 'string') out.push({ ...c.seed, category: 'seed', stack: 20, icon: { rows: SEED_PACKET, colours: { ...colours, a: c.flower ? '#f4e6f0' : '#efe2c4', A: c.flower ? '#c8a0c0' : '#b89a64', x: Object.values(c.colours)[0] } } });
  return out;
}

/** A little paper seed packet, the crop's own colour on the front. */
const SEED_PACKET = ['AAAAA', 'AaaaA', 'AaxaA', 'AxxxA', 'AaxaA', 'AaaaA', 'AAAAA'];

const cropItem = (kind: string, which: 'seed' | 'produce'): ItemDefinition => {
  const c = CROP_CONTENT.find((x) => x.kind === kind)!;
  const items = cropItems(c);
  return which === 'produce' ? items[0] : items[1];
};

/** Items the code refers to by name. Everything else is reached by id through the registry. */
export const ITEMS = {
  ...CORE,
  carrotSeed: cropItem('carrot', 'seed'),
  pumpkinSeed: cropItem('pumpkin', 'seed'),
  turnip: cropItem('turnip', 'produce'),
  carrot: cropItem('carrot', 'produce'),
  pumpkin: cropItem('pumpkin', 'produce'),
} satisfies Record<string, ItemDefinition>;

export type ItemKey = keyof typeof ITEMS;

/** Every item, in registration order: core, then crops, then the rest of the content. */
export const ALL_ITEMS: readonly ItemDefinition[] = (() => {
  const seen = new Map<string, ItemDefinition>();
  for (const d of [...Object.values(CORE), ...CROP_CONTENT.flatMap(cropItems), ...CONTENT_ITEMS]) {
    if (seen.has(d.id)) throw new Error(`item registered twice: ${d.id}`);
    seen.set(d.id, d);
  }
  return [...seen.values()];
})();

const byId = new Map<string, ItemDefinition>(ALL_ITEMS.map((d) => [d.id, d]));

export const itemById = (id: string): ItemDefinition | undefined => byId.get(id);
export const stackLimit = (id: string): number => byId.get(id)?.stack ?? 99;
export const isTool = (id: string): boolean => !!byId.get(id)?.tool;
export const toolSupports = (id: string, interaction: ToolInteraction): boolean => !!byId.get(id)?.tool?.interactions.includes(interaction);
export const toolTier = (id: string): number => byId.get(id)?.tool?.tier ?? 1;
export const itemLabel = (id: string): string => byId.get(id)?.label ?? id;
export const itemPlural = (id: string): string => byId.get(id)?.plural ?? id;
export const itemDescription = (id: string): string => byId.get(id)?.description ?? '';
export const isFood = (id: string): boolean => !!byId.get(id)?.food;
export const foodValue = (id: string): number => byId.get(id)?.food?.restores ?? 0;
export const foodEffect = (id: string): FoodEffect | null => byId.get(id)?.food ?? null;
/** "3 turnips" / "1 turnip". */
export const countLabel = (id: string, n: number): string => `${n} ${n === 1 ? itemLabel(id) : itemPlural(id)}`;

/** Every tool, in the order Q cycles through them. */
export const TOOLS: readonly string[] = ALL_ITEMS.filter((d) => d.tool).map((d) => d.id);
/** Every food, in the order F offers them: smallest hunger value first, so a peckish Blobbi is not handed a feast. */
export const FOODS: readonly string[] = ALL_ITEMS.filter((d) => d.food)
  .map((d, i) => ({ d, i }))
  .sort((a, b) => a.d.food!.restores - b.d.food!.restores || a.i - b.i)
  .map(({ d }) => d.id);

// ─── Menu categories ─────────────────────────────────────────────────────────

export type MenuCategory = 'materials' | 'seeds' | 'food' | 'tools' | 'furniture' | 'special';
export const MENU_CATEGORIES: readonly MenuCategory[] = ['materials', 'seeds', 'food', 'tools', 'furniture', 'special'];
export const MENU_LABEL: Record<MenuCategory, string> = { materials: 'Materials', seeds: 'Seeds', food: 'Food', tools: 'Tools', furniture: 'Furniture', special: 'Special' };

export function menuCategory(id: string): MenuCategory {
  const c = byId.get(id)?.category;
  if (c === 'seed') return 'seeds';
  if (c === 'food') return 'food';
  if (c === 'tool') return 'tools';
  if (c === 'furniture') return 'furniture';
  if (c === 'special') return 'special';
  // The wild seed is a resource by id (saves depend on it), but it is planted like any seed.
  if (id === CORE.seed.id) return 'seeds';
  return 'materials';
}
