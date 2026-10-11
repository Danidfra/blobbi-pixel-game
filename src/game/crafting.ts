/**
 * CRAFTING. A recipe turns ingredients into an output. `craft` is atomic: it checks every ingredient and the
 * room for the output first and only then moves anything, so an inventory never ends up half-way. The
 * recipe list is data; more recipes are more entries.
 */
import { ITEMS, stackLimit } from './items';
import type { Inventory } from './inventory';
import { PLACEABLE_CONTENT, placeableItem } from '../content/placeables';
import { MEAL_CONTENT } from '../content/meals';
import { UPGRADES } from '../content/tools';

export interface Ingredient {
  item: string;
  quantity: number;
}

export type RecipeGroup = 'tools' | 'materials' | 'furniture' | 'outdoor' | 'meals';
export type Station = 'hand' | 'workbench' | 'cooking';

export interface Recipe {
  id: string;
  label: string;
  ingredients: readonly Ingredient[];
  output: Ingredient;
  /** Menu tab. */
  group?: RecipeGroup;
  /** Where it is made: in the hand (anywhere), at a workbench, at a cooking station. */
  station?: Station;
  /** The quest whose completion teaches it; known from the start without one. */
  unlock?: string;
}

export const RECIPES: Recipe[] = [
  {
    id: 'blobbi-pixel:recipe:simple-axe',
    label: 'Simple axe',
    ingredients: [
      { item: ITEMS.stick.id, quantity: 3 },
      { item: ITEMS.stone.id, quantity: 2 },
    ],
    output: { item: ITEMS.axe.id, quantity: 1 },
  },
  {
    id: 'blobbi-pixel:recipe:simple-pickaxe',
    label: 'Simple pickaxe',
    ingredients: [
      { item: ITEMS.wood.id, quantity: 2 },
      { item: ITEMS.stick.id, quantity: 2 },
      { item: ITEMS.stone.id, quantity: 3 },
    ],
    output: { item: ITEMS.pickaxe.id, quantity: 1 },
  },
  {
    id: 'blobbi-pixel:recipe:simple-hoe',
    label: 'Simple hoe',
    ingredients: [
      { item: ITEMS.wood.id, quantity: 1 },
      { item: ITEMS.stick.id, quantity: 2 },
      { item: ITEMS.stone.id, quantity: 1 },
    ],
    output: { item: ITEMS.hoe.id, quantity: 1 },
  },
];

for (const r of RECIPES) {
  r.group ??= 'tools';
  r.station ??= 'hand';
}

/** Materials made from other materials. */
RECIPES.push({ id: 'blobbi-pixel:recipe:cloth', label: 'Cloth', ingredients: [{ item: 'blobbi-pixel:resource:fibre', quantity: 2 }], output: { item: 'blobbi-pixel:material:cloth', quantity: 1 }, group: 'materials', station: 'workbench' });

/** Every placeable in the content catalogue is crafted into the bag. */
for (const p of PLACEABLE_CONTENT)
  RECIPES.push({
    id: `blobbi-pixel:recipe:${p.kind}`,
    label: p.label[0].toUpperCase() + p.label.slice(1),
    ingredients: p.recipe,
    output: { item: placeableItem(p).id, quantity: p.makes ?? 1 },
    group: p.where === 'indoor' ? 'furniture' : p.where === 'outdoor' ? 'outdoor' : p.use === 'storage' || p.use === 'cook' || p.use === 'craft' ? 'furniture' : 'outdoor',
    station: p.station,
    unlock: p.unlock,
  });

/** Meals, made at a cooking station. */
for (const m of MEAL_CONTENT)
  RECIPES.push({ id: `blobbi-pixel:recipe:${m.id.split(':').pop()}`, label: m.label[0].toUpperCase() + m.label.slice(1), ingredients: m.ingredients, output: { item: m.id, quantity: 1 }, group: 'meals', station: 'cooking', unlock: m.unlock });

/** Copper upgrades: the old tool plus ore, at a workbench. */
for (const u of UPGRADES)
  RECIPES.push({ id: `blobbi-pixel:recipe:${u.id}`, label: u.id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '), ingredients: [{ item: u.from, quantity: 1 }, ...u.extra], output: { item: u.to, quantity: 1 }, group: 'tools', station: 'workbench', unlock: 'side-miner' });
/** The fishing rod. */
RECIPES.push({ id: 'blobbi-pixel:recipe:fishing-rod', label: 'Fishing rod', ingredients: [{ item: 'blobbi-pixel:resource:stick', quantity: 3 }, { item: 'blobbi-pixel:resource:fibre', quantity: 2 }], output: { item: 'blobbi-pixel:tool:fishing-rod', quantity: 1 }, group: 'tools', station: 'hand', unlock: 'carrier' });

export const recipeById = (id: string): Recipe | undefined => RECIPES.find((r) => r.id === id);

export interface CraftCheck {
  ok: boolean;
  /** Ingredients short, with how many are missing. */
  missing: { item: string; need: number; have: number }[];
  /** True when the output would not fit under its stack limit. */
  outputFull: boolean;
}

export function canCraft(inventory: Inventory, recipe: Recipe): CraftCheck {
  const missing: CraftCheck['missing'] = [];
  for (const ing of recipe.ingredients) {
    const have = inventory.count(ing.item);
    if (have < ing.quantity) missing.push({ item: ing.item, need: ing.quantity, have });
  }
  const outputFull = inventory.count(recipe.output.item) + recipe.output.quantity > stackLimit(recipe.output.item);
  return { ok: missing.length === 0 && !outputFull, missing, outputFull };
}

/**
 * Craft once. Returns true when the ingredients were consumed and the output added; false leaves the
 * inventory exactly as it was (nothing is removed unless everything can be).
 */
export function craft(inventory: Inventory, recipe: Recipe): boolean {
  const check = canCraft(inventory, recipe);
  if (!check.ok) return false;
  // Every ingredient is present (checked above); remove them all, then add the output.
  const removed: Ingredient[] = [];
  for (const ing of recipe.ingredients) {
    const n = inventory.remove(ing.item, ing.quantity);
    removed.push({ item: ing.item, quantity: n });
    if (n !== ing.quantity) {
      // Cannot happen after the check; if it did, put everything back and refuse.
      for (const r of removed) inventory.add(r.item, r.quantity);
      return false;
    }
  }
  const added = inventory.add(recipe.output.item, recipe.output.quantity);
  if (added !== recipe.output.quantity) {
    inventory.remove(recipe.output.item, added);
    for (const r of removed) inventory.add(r.item, r.quantity);
    return false;
  }
  return true;
}

/** Remove a set of ingredients atomically: all of them or none. Returns whether they were consumed. */
export function consumeIngredients(inventory: Inventory, ingredients: readonly Ingredient[]): boolean {
  for (const ing of ingredients) if (inventory.count(ing.item) < ing.quantity) return false;
  const removed: Ingredient[] = [];
  for (const ing of ingredients) {
    const n = inventory.remove(ing.item, ing.quantity);
    removed.push({ item: ing.item, quantity: n });
    if (n !== ing.quantity) {
      for (const r of removed) inventory.add(r.item, r.quantity);
      return false;
    }
  }
  return true;
}
