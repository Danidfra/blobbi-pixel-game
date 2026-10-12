/**
 * CONTENT: every data-driven catalogue, gathered for the registries. Content modules hold plain data and import
 * only types from the game, so they never create runtime cycles.
 */
import type { ItemDefinition } from '../game/items';
import { FORAGE_CONTENT } from './forage';
import { LEGACY_PLACEABLE_ITEMS, PLACEABLE_CONTENT, PLACEABLE_MATERIALS, placeableItem } from './placeables';
import { MEAL_CONTENT, mealItem } from './meals';
import { FISH_CONTENT, TOOL_ITEMS } from './tools';
import { ALL_DISCOVERIES } from './discoveries';

/** Items defined by content catalogues other than crops (crops register their own seed and produce items). */
export const CONTENT_ITEMS: ItemDefinition[] = [...FORAGE_CONTENT.filter((f) => !f.dynamic).map((f) => f.item), ...PLACEABLE_MATERIALS, ...PLACEABLE_CONTENT.map(placeableItem), ...LEGACY_PLACEABLE_ITEMS, ...MEAL_CONTENT.map(mealItem), ...TOOL_ITEMS, ...FISH_CONTENT.map((f) => f.item), ...ALL_DISCOVERIES.map((d) => d.item)];
