/**
 * THE ITEM REGISTRY. Every item the game knows, by a stable id in the `game:category:name` style of the
 * inventory protocol's `d` tags. Resources come from the ground, materials from work, tools from recipes.
 * A tool names the interactions it supports; nothing else about tools exists yet (no durability).
 */

export type ItemCategory = 'resource' | 'material' | 'tool';
export type ToolType = 'axe' | 'pickaxe';
/** Interactions a tool can perform on the world. */
export type ToolInteraction = 'chop' | 'mine';

export interface ItemDefinition {
  id: string;
  label: string;
  /** Plural label for counters. */
  plural: string;
  category: ItemCategory;
  /** Stack limit in one inventory. */
  stack: number;
  tool?: { type: ToolType; interactions: readonly ToolInteraction[] };
}

export const ITEMS = {
  stick: { id: 'blobbi-pixel:resource:stick', label: 'stick', plural: 'sticks', category: 'resource', stack: 50 },
  stone: { id: 'blobbi-pixel:resource:stone', label: 'stone', plural: 'stones', category: 'resource', stack: 30 },
  seed: { id: 'blobbi-pixel:resource:seed', label: 'seed', plural: 'seeds', category: 'resource', stack: 20 },
  wood: { id: 'blobbi-pixel:material:wood', label: 'wood', plural: 'wood', category: 'material', stack: 40 },
  axe: { id: 'blobbi-pixel:tool:simple-axe', label: 'simple axe', plural: 'simple axes', category: 'tool', stack: 1, tool: { type: 'axe', interactions: ['chop'] } },
  pickaxe: { id: 'blobbi-pixel:tool:simple-pickaxe', label: 'simple pickaxe', plural: 'simple pickaxes', category: 'tool', stack: 1, tool: { type: 'pickaxe', interactions: ['mine'] } },
} as const satisfies Record<string, ItemDefinition>;

export type ItemKey = keyof typeof ITEMS;

const byId = new Map<string, ItemDefinition>(Object.values(ITEMS).map((d) => [d.id, d]));

export const itemById = (id: string): ItemDefinition | undefined => byId.get(id);
export const stackLimit = (id: string): number => byId.get(id)?.stack ?? 99;
export const isTool = (id: string): boolean => !!byId.get(id)?.tool;
export const toolSupports = (id: string, interaction: ToolInteraction): boolean => !!byId.get(id)?.tool?.interactions.includes(interaction);
export const itemLabel = (id: string): string => byId.get(id)?.label ?? id;
