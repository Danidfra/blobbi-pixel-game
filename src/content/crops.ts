/**
 * CROP CONTENT: every plantable, as data. The farming logic (`game/farming.ts`) reads these definitions; adding a
 * crop is adding an entry here (its seed and produce items are registered from it in `game/items.ts`).
 *
 * Sprites are hand-set pixel templates per stage (growing and mature; seeds, sprout and young are shared), in a
 * leaf ramp plus the crop's own colours: `g`/`G`/`d` leaf mid/light/dark, every other letter a colour from
 * `colours`. `icon` is the produce's 7×7-ish inventory icon in the same letters.
 *
 * Only `import type` from the game: content stays plain data with no runtime dependencies.
 */
import type { FoodEffect } from '../game/items';

export interface CropContent {
  kind: string;
  label: string;
  plural: string;
  /** The seed item: an existing item id (wild seeds) or a new seed item to register. */
  seed: string | { id: string; label: string; plural: string; description: string };
  produce: { id: string; label: string; plural: string; description: string; food?: FoodEffect; stack: number; category: 'food' | 'material' };
  /** Produce per harvest. */
  yield: number;
  /** Seeds returned by a harvest (the last one for multi-harvest crops). */
  seedBack: number;
  /** Seconds of WET world time from planting to the first harvest. */
  growSeconds: number;
  /** Seconds one watering keeps the soil wet. */
  waterSeconds: number;
  /** Multi-harvest crops: harvests before the plant is spent, and wet seconds between them. */
  harvests?: number;
  regrowSeconds?: number;
  /** A flower: decorative, harvested as cut flowers. */
  flower?: boolean;
  colours: Record<string, string>;
  growing: string[];
  mature: string[];
  icon: string[];
}

export const CROP_CONTENT: readonly CropContent[] = [
  {
    kind: 'turnip',
    label: 'turnip',
    plural: 'turnips',
    seed: 'blobbi-pixel:resource:seed',
    produce: { id: 'blobbi-pixel:food:turnip', label: 'turnip', plural: 'turnips', description: 'A crisp white root with a purple top. Grows from wild seeds.', food: { restores: 25 }, stack: 20, category: 'food' },
    yield: 2,
    seedBack: 0,
    growSeconds: 90,
    waterSeconds: 45,
    colours: { p: '#9a4fc4', w: '#f4efe4', W: '#ffffff', c: '#c9bfae' },
    growing: ['G.G.G', '.gGg.', '..g..', '.wWw.'],
    mature: ['G...G', '.GgG.', '..g..', '.ppp.', 'pwWwp', '.www.'],
    icon: ['.G.G.', '..g..', '.ppp.', 'pwWwp', 'pwwwp', '.www.', '..c..'],
  },
  {
    kind: 'radish',
    label: 'radish',
    plural: 'radishes',
    seed: { id: 'blobbi-pixel:seed:radish', label: 'radish seed', plural: 'radish seeds', description: 'Tiny round seeds. Radishes are the quickest crop on the island.' },
    produce: { id: 'blobbi-pixel:food:radish', label: 'radish', plural: 'radishes', description: 'Small, red and peppery. A quick crunchy snack.', food: { restores: 15, joy: 2 }, stack: 30, category: 'food' },
    yield: 3,
    seedBack: 1,
    growSeconds: 60,
    waterSeconds: 30,
    colours: { r: '#e0405a', R: '#ff7a8a', w: '#f4efe4', c: '#9a2438' },
    growing: ['.G.G.', 'gGgGg', '..g..', '..r..'],
    mature: ['G...G', '.GgG.', '..g..', '.rRr.', '.rrr.', '..w..'],
    icon: ['.G.G.', '..g..', '.rRr.', 'rRrrr', 'rrrrc', '.rrc.', '..w..'],
  },
  {
    kind: 'carrot',
    label: 'carrot',
    plural: 'carrots',
    seed: { id: 'blobbi-pixel:seed:carrot', label: 'carrot seed', plural: 'carrot seeds', description: 'Feathery little seeds for sweet orange roots.' },
    produce: { id: 'blobbi-pixel:food:carrot', label: 'carrot', plural: 'carrots', description: 'Sweet and orange. Blobbis like the crunch.', food: { restores: 35 }, stack: 20, category: 'food' },
    yield: 2,
    seedBack: 1,
    growSeconds: 150,
    waterSeconds: 50,
    colours: { o: '#f08a2c', O: '#ffb45a', c: '#c0601c' },
    growing: ['G.G.G', 'gGgGg', '.ggg.', '..o..'],
    mature: ['G.G.G', 'gGgGg', '.gGg.', '.oOo.', '.ooc.', '..c..'],
    icon: ['G.G..', '.gG..', '.oOo.', '.oOo.', '..oc.', '..oc.', '...c.'],
  },
  {
    kind: 'potato',
    label: 'potato',
    plural: 'potatoes',
    seed: { id: 'blobbi-pixel:seed:potato', label: 'seed potato', plural: 'seed potatoes', description: 'A small potato with eyes, ready to sprout.' },
    produce: { id: 'blobbi-pixel:food:potato', label: 'potato', plural: 'potatoes', description: 'Earthy and filling. Much better cooked.', food: { restores: 20 }, stack: 30, category: 'food' },
    yield: 4,
    seedBack: 1,
    growSeconds: 180,
    waterSeconds: 60,
    colours: { p: '#c9a15a', P: '#e8c27a', f: '#ffffff', c: '#8a6a30' },
    growing: ['.G.G.', 'GgGgG', 'gGdGg', '..d..'],
    mature: ['.f.f.', 'GgGgG', 'gGdGg', 'dgGgd', '.pPp.', 'pc.pc'],
    icon: ['.....', '.pPp.', 'pPppp', 'ppcpp', 'pppcp', '.ppp.', '.....'],
  },
  {
    kind: 'tomato',
    label: 'tomato',
    plural: 'tomatoes',
    seed: { id: 'blobbi-pixel:seed:tomato', label: 'tomato seed', plural: 'tomato seeds', description: 'The vine keeps fruiting: three pickings from one plant.' },
    produce: { id: 'blobbi-pixel:food:tomato', label: 'tomato', plural: 'tomatoes', description: 'Juicy and bright. Good fresh, better in a soup.', food: { restores: 15, joy: 3 }, stack: 30, category: 'food' },
    yield: 2,
    seedBack: 1,
    growSeconds: 200,
    waterSeconds: 50,
    harvests: 3,
    regrowSeconds: 80,
    colours: { t: '#e8402c', T: '#ff7a5a', s: '#9b6b3f', c: '#a8281c' },
    growing: ['..s..', '.GsG.', 'gGsgG', '..s..'],
    mature: ['..s..', 'GtsGT', 'gGsgt', 'tgsG.', '.Gst.', '..s..'],
    icon: ['..g..', '.gGg.', '.tTt.', 'tTttt', 'ttttc', '.tcc.', '.....'],
  },
  {
    kind: 'strawberry',
    label: 'strawberry',
    plural: 'strawberries',
    seed: { id: 'blobbi-pixel:seed:strawberry', label: 'strawberry runner', plural: 'strawberry runners', description: 'A little plant that fruits again and again: four pickings.' },
    produce: { id: 'blobbi-pixel:food:strawberry', label: 'strawberry', plural: 'strawberries', description: 'Sweet, red and very popular with Blobbis.', food: { restores: 10, joy: 6 }, stack: 40, category: 'food' },
    yield: 2,
    seedBack: 1,
    growSeconds: 160,
    waterSeconds: 40,
    harvests: 4,
    regrowSeconds: 60,
    colours: { b: '#e83a4a', B: '#ff8090', y: '#ffe07a', c: '#a82030' },
    growing: ['.G.G.', 'GgGgG', '.g.g.'],
    mature: ['G.G.G', 'gGbGg', 'bgGgB', '.b.b.'],
    icon: ['.GgG.', '..g..', '.bBb.', 'bByBb', 'bybyb', '.bbc.', '..c..'],
  },
  {
    kind: 'wheat',
    label: 'wheat',
    plural: 'wheat',
    seed: { id: 'blobbi-pixel:seed:wheat', label: 'wheat seed', plural: 'wheat seeds', description: 'Golden grain for bread and porridge.' },
    produce: { id: 'blobbi-pixel:material:wheat', label: 'wheat', plural: 'wheat', description: 'A bundle of golden grain. An ingredient, not a snack.', stack: 40, category: 'material' },
    yield: 3,
    seedBack: 1,
    growSeconds: 120,
    waterSeconds: 60,
    colours: { w: '#e0b84a', W: '#ffe08a', h: '#b08a30', c: '#8a6a20' },
    growing: ['g.g.g', 'g.g.g', 'g.g.g', 'g.g.g'],
    mature: ['W.W.W', 'wWwWw', 'w.w.w', 'h.h.h', 'h.h.h', 'h.h.h'],
    icon: ['.W.W.', 'wWwWw', '.wWw.', '..h..', '.hhh.', '..h..', '..h..'],
  },
  {
    kind: 'pumpkin',
    label: 'pumpkin',
    plural: 'pumpkins',
    seed: { id: 'blobbi-pixel:seed:pumpkin', label: 'pumpkin seed', plural: 'pumpkin seeds', description: 'Big flat seeds. Pumpkins take their time.' },
    produce: { id: 'blobbi-pixel:food:pumpkin', label: 'pumpkin', plural: 'pumpkins', description: 'Heavy, round and orange. Feeds a hungry Blobbi.', food: { restores: 60 }, stack: 10, category: 'food' },
    yield: 1,
    seedBack: 2,
    growSeconds: 240,
    waterSeconds: 80,
    colours: { o: '#f0902a', O: '#ffc060', c: '#c06414', s: '#6f8a2e' },
    growing: ['.G.G..', 'gGdGg.', '..d.oo', '...ooc'],
    mature: ['..dG...', '.dGg...', '.oOOoo.', 'oOoooOo', 'ooooooc', '.ccccc.'],
    icon: ['...d...', '..dG...', '.oOOoo.', 'oOoooOo', 'oooooOc', 'oooooc.', '.cccc..'],
  },
  {
    kind: 'sunflower',
    label: 'sunflower',
    plural: 'sunflowers',
    flower: true,
    seed: { id: 'blobbi-pixel:seed:sunflower', label: 'sunflower seed', plural: 'sunflower seeds', description: 'Striped seeds for a tall, sunny flower.' },
    produce: { id: 'blobbi-pixel:flower:sunflower', label: 'sunflower', plural: 'sunflowers', description: 'A cut sunflower. For vases, beds and very happy Blobbis.', stack: 20, category: 'material' },
    yield: 1,
    seedBack: 2,
    growSeconds: 150,
    waterSeconds: 50,
    colours: { y: '#ffd23b', Y: '#fff09a', c: '#7a4a20' },
    growing: ['..G..', '.Gg..', '..gG.', '..g..'],
    mature: ['.yYy.', 'yYcYy', '.yYy.', '..g..', '.Gg..', '..gG.', '..g..'],
    icon: ['.yYy.', 'yYcYy', 'yccYy', '.yYy.', '..g..', '.Gg..', '..g..'],
  },
  {
    kind: 'tulip',
    label: 'tulip',
    plural: 'tulips',
    flower: true,
    seed: { id: 'blobbi-pixel:seed:tulip', label: 'tulip bulb', plural: 'tulip bulbs', description: 'A papery bulb. Tulips come up pink.' },
    produce: { id: 'blobbi-pixel:flower:tulip', label: 'tulip', plural: 'tulips', description: 'A cut pink tulip. Lovely in a vase.', stack: 20, category: 'material' },
    yield: 2,
    seedBack: 1,
    growSeconds: 100,
    waterSeconds: 50,
    colours: { p: '#ff6b9a', P: '#ffb0c8' },
    growing: ['.G.G.', '..g..', '.GgG.', '..g..'],
    mature: ['.p.p.', '.pPp.', '..p..', 'G.g.G', '.GgG.', '..g..'],
    icon: ['.p.p.', '.pPp.', '.ppp.', '..g..', 'G.g.G', '.GgG.', '..g..'],
  },
  {
    kind: 'lavender',
    label: 'lavender',
    plural: 'lavender',
    flower: true,
    seed: { id: 'blobbi-pixel:seed:lavender', label: 'lavender seed', plural: 'lavender seeds', description: 'Tiny dark seeds with a soft scent.' },
    produce: { id: 'blobbi-pixel:flower:lavender', label: 'lavender sprig', plural: 'lavender sprigs', description: 'Fragrant purple sprigs. Calming in tea, pretty in a vase.', stack: 30, category: 'material' },
    yield: 3,
    seedBack: 1,
    growSeconds: 120,
    waterSeconds: 40,
    colours: { l: '#9a7ad8', L: '#c8b0f0' },
    growing: ['g.g.g', '.ggg.', '..g..'],
    mature: ['L.l.L', 'l.L.l', 'lgLgl', 'g.g.g', '.ggg.', '..g..'],
    icon: ['L.l..', 'l.L..', 'lLl.l', '.g.Ll', '.g.l.', '..gg.', '..g..'],
  },
];
