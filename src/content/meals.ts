/**
 * MEAL CONTENT: what the cooking station makes, as data. Each meal is a food item (it restores the Blobbi's
 * hunger, and some also energy and joy) and a recipe of ingredients from the farm and the wild. `unlock` names
 * the quest that teaches it; the first few are known as soon as there is a cooking station.
 *
 * Icons share a few vessel shapes (bowl, plate, mug, loaf, tart) in the meal's own colours: `c` contents, `C`
 * highlight, `v` vessel, `V` vessel highlight, `s` steam.
 */
import type { ItemDefinition } from '../game/items';

export interface MealContent {
  id: string;
  label: string;
  plural: string;
  description: string;
  food: NonNullable<ItemDefinition['food']>;
  ingredients: readonly { item: string; quantity: number }[];
  unlock?: string;
  vessel: 'bowl' | 'plate' | 'mug' | 'loaf' | 'tart';
  colours: { c: string; C: string };
}

const F = {
  turnip: 'blobbi-pixel:food:turnip',
  radish: 'blobbi-pixel:food:radish',
  carrot: 'blobbi-pixel:food:carrot',
  potato: 'blobbi-pixel:food:potato',
  tomato: 'blobbi-pixel:food:tomato',
  strawberry: 'blobbi-pixel:food:strawberry',
  pumpkin: 'blobbi-pixel:food:pumpkin',
  wheat: 'blobbi-pixel:material:wheat',
  mushroom: 'blobbi-pixel:food:mushroom',
  berry: 'blobbi-pixel:food:wild-berry',
  herb: 'blobbi-pixel:resource:herb',
  seed: 'blobbi-pixel:resource:seed',
  lavender: 'blobbi-pixel:flower:lavender',
  bread: 'blobbi-pixel:meal:bread',
};

export const MEAL_CONTENT: readonly MealContent[] = [
  { id: 'blobbi-pixel:meal:toasted-seeds', label: 'toasted seeds', plural: 'toasted seeds', description: 'A crunchy handful of wild seeds, warm from the pan.', food: { restores: 12, joy: 2 }, ingredients: [{ item: F.seed, quantity: 3 }], vessel: 'plate', colours: { c: '#c9a66b', C: '#eed9a6' } },
  { id: 'blobbi-pixel:meal:berry-snack', label: 'berry snack', plural: 'berry snacks', description: 'Wild berries, gently warmed. A sweet little treat.', food: { restores: 20, joy: 8 }, ingredients: [{ item: F.berry, quantity: 3 }], vessel: 'bowl', colours: { c: '#5a3a9a', C: '#9a7ad8' } },
  { id: 'blobbi-pixel:meal:roasted-turnip', label: 'roasted turnip', plural: 'roasted turnips', description: 'Golden at the edges, soft in the middle.', food: { restores: 40, joy: 3 }, ingredients: [{ item: F.turnip, quantity: 1 }], vessel: 'plate', colours: { c: '#e8c27a', C: '#fff0c0' } },
  { id: 'blobbi-pixel:meal:baked-potato', label: 'baked potato', plural: 'baked potatoes', description: 'Fluffy inside, crisp skin. Very filling.', food: { restores: 45, energy: 5 }, ingredients: [{ item: F.potato, quantity: 1 }], vessel: 'plate', colours: { c: '#b8864a', C: '#f0d8a0' } },
  { id: 'blobbi-pixel:meal:carrot-soup', label: 'carrot soup', plural: 'carrot soups', description: 'Sweet orange soup with a herb on top.', food: { restores: 50, energy: 5, joy: 5 }, ingredients: [{ item: F.carrot, quantity: 2 }, { item: F.herb, quantity: 1 }], unlock: 'cook', vessel: 'bowl', colours: { c: '#f08a2c', C: '#ffb45a' } },
  { id: 'blobbi-pixel:meal:vegetable-mix', label: 'vegetable mix', plural: 'vegetable mixes', description: 'A bit of everything from the garden.', food: { restores: 55, joy: 6 }, ingredients: [{ item: F.turnip, quantity: 1 }, { item: F.carrot, quantity: 1 }, { item: F.radish, quantity: 1 }], unlock: 'cook', vessel: 'bowl', colours: { c: '#7ac04a', C: '#f08a2c' } },
  { id: 'blobbi-pixel:meal:radish-salad', label: 'radish salad', plural: 'radish salads', description: 'Peppery radishes and fresh herbs. Wakes you up.', food: { restores: 30, energy: 8, joy: 6 }, ingredients: [{ item: F.radish, quantity: 2 }, { item: F.herb, quantity: 1 }], unlock: 'cook', vessel: 'bowl', colours: { c: '#e0405a', C: '#8fe06a' } },
  { id: 'blobbi-pixel:meal:bread', label: 'bread', plural: 'loaves of bread', description: 'A small round loaf. Good alone, better in a tart.', food: { restores: 30, energy: 5 }, ingredients: [{ item: F.wheat, quantity: 2 }], unlock: 'side-chef', vessel: 'loaf', colours: { c: '#c8904a', C: '#f0c880' } },
  { id: 'blobbi-pixel:meal:mushroom-soup', label: 'mushroom soup', plural: 'mushroom soups', description: 'Earthy, warm and thick. Gives a lot of energy.', food: { restores: 50, energy: 15 }, ingredients: [{ item: F.mushroom, quantity: 2 }, { item: F.potato, quantity: 1 }], unlock: 'side-chef', vessel: 'bowl', colours: { c: '#a8784a', C: '#e0b080' } },
  { id: 'blobbi-pixel:meal:tomato-soup', label: 'tomato soup', plural: 'tomato soups', description: 'Bright red and a little sweet.', food: { restores: 45, joy: 8 }, ingredients: [{ item: F.tomato, quantity: 2 }, { item: F.herb, quantity: 1 }], unlock: 'side-chef', vessel: 'bowl', colours: { c: '#e8402c', C: '#ff7a5a' } },
  { id: 'blobbi-pixel:meal:porridge', label: 'berry porridge', plural: 'berry porridges', description: 'Warm wheat porridge with strawberries. A slow, steady breakfast.', food: { restores: 45, energy: 15, joy: 4 }, ingredients: [{ item: F.wheat, quantity: 2 }, { item: F.strawberry, quantity: 1 }], unlock: 'side-chef', vessel: 'bowl', colours: { c: '#efe2c4', C: '#e83a4a' } },
  { id: 'blobbi-pixel:meal:lavender-tea', label: 'lavender tea', plural: 'cups of lavender tea', description: 'A calming cup. Restores energy and cheers up a tired Blobbi.', food: { restores: 5, energy: 25, joy: 8 }, ingredients: [{ item: F.lavender, quantity: 2 }], unlock: 'side-florist', vessel: 'mug', colours: { c: '#9a7ad8', C: '#c8b0f0' } },
  { id: 'blobbi-pixel:meal:strawberry-tart', label: 'strawberry tart', plural: 'strawberry tarts', description: 'A golden tart heaped with strawberries. Pure joy.', food: { restores: 35, joy: 15 }, ingredients: [{ item: F.bread, quantity: 1 }, { item: F.strawberry, quantity: 2 }], unlock: 'side-baker', vessel: 'tart', colours: { c: '#e83a4a', C: '#ff8090' } },
  { id: 'blobbi-pixel:meal:pumpkin-stew', label: 'pumpkin stew', plural: 'pumpkin stews', description: 'A big pot of pumpkin, potato and herbs. Fills a Blobbi right up.', food: { restores: 80, energy: 15, joy: 5 }, ingredients: [{ item: F.pumpkin, quantity: 1 }, { item: F.potato, quantity: 1 }, { item: F.herb, quantity: 1 }], unlock: 'side-baker', vessel: 'bowl', colours: { c: '#f0902a', C: '#ffc060' } },
  { id: 'blobbi-pixel:meal:harvest-feast', label: 'harvest feast', plural: 'harvest feasts', description: 'Everything the island grows, on one plate. For celebrations.', food: { restores: 100, energy: 25, joy: 25 }, ingredients: [{ item: F.pumpkin, quantity: 1 }, { item: F.tomato, quantity: 2 }, { item: F.bread, quantity: 1 }, { item: F.mushroom, quantity: 1 }], unlock: 'restore', vessel: 'plate', colours: { c: '#f0902a', C: '#e8402c' } },
];

// Fish meals (defined with the fishing content).
import { FISH_MEALS } from './tools';
for (const m of FISH_MEALS) (MEAL_CONTENT as MealContent[]).push({ ...m, unlock: 'side-angler', vessel: m.id.endsWith('soup') ? 'bowl' : 'plate' });

const VESSELS: Record<MealContent['vessel'], string[]> = {
  bowl: ['.s.s.s.', 's.s.s..', '.......', 'vcCcCcv', 'vcccccv', '.vVVVv.', '..vvv..'],
  plate: ['.......', '..s.s..', '..cCc..', '.cCccc.', 'vVVVVVv', '.vvvvv.'],
  mug: ['..s.s..', '.s.s...', 'vvvvv..', 'vcCcvvv', 'vcccv.v', 'vcccvvv', '.vvv...'],
  loaf: ['.......', '..CCC..', '.CcCcC.', 'ccCcCcc', 'ccccccc', '.ccccc.'],
  tart: ['..cCc..', '.cCcCc.', 'cCcCcCc', 'VvVvVvV', '.vvvvv.'],
};

/** The food item a meal is. */
export function mealItem(m: MealContent): ItemDefinition {
  const vessel = m.vessel === 'mug' ? { v: '#f3e3c3', V: '#ffffff' } : m.vessel === 'loaf' || m.vessel === 'tart' ? { v: '#b07a3a', V: '#e0b070' } : { v: '#d8dde8', V: '#ffffff' };
  return { id: m.id, label: m.label, plural: m.plural, category: 'food', stack: 10, description: m.description, food: m.food, icon: { rows: VESSELS[m.vessel], colours: { ...m.colours, ...vessel, s: '#e8f0ff' } } };
}
