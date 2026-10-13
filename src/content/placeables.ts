/**
 * PLACEABLE CONTENT: furniture and decorations, as data. Each entry is an item you craft into the bag and place
 * (indoors, outdoors or both), pick up again, and sometimes use. Art comes from `game/furniture-art.ts` by `art`.
 *
 * Layers: `solid` blocks walking; `floor` is walked over and drawn flat on the ground (rugs, paths, the pet bed);
 * `open` is walked under but drawn upright (the flower arch); `wall` hangs on an interior's back wall.
 *
 * `unlock` names the quest whose completion makes the recipe available; without one it is known from the start.
 * `station` is where it is crafted: in the hand, or at a workbench.
 */
import type { ItemDefinition } from '../game/items';

export type Where = 'outdoor' | 'indoor' | 'both';
export type Layer = 'solid' | 'floor' | 'open' | 'wall';
export type Use = 'storage' | 'cook' | 'craft' | 'sit' | 'sleep' | 'nap' | 'read' | 'light' | 'admire' | 'play' | 'music' | 'sprinkle' | 'birds' | 'time' | 'herbs';

export interface PlaceableContent {
  kind: string;
  label: string;
  plural: string;
  description: string;
  art: string;
  where: Where;
  layer: Layer;
  footRx: number;
  footRy: number;
  recipe: readonly { item: string; quantity: number }[];
  /** How many a recipe makes (path tiles come in pairs). */
  makes?: number;
  station: 'hand' | 'workbench';
  unlock?: string;
  use?: Use;
  /** Joy a visit or a use gives the Blobbi. */
  joy?: number;
  /** Storage: distinct stacks it holds. */
  capacity?: number;
  /** Colourways (cycled in move mode). */
  variants?: number;
}

const I = {
  wood: 'blobbi-pixel:material:wood',
  stick: 'blobbi-pixel:resource:stick',
  stone: 'blobbi-pixel:resource:stone',
  seed: 'blobbi-pixel:resource:seed',
  fibre: 'blobbi-pixel:resource:fibre',
  cloth: 'blobbi-pixel:material:cloth',
  shell: 'blobbi-pixel:resource:shell',
  herb: 'blobbi-pixel:resource:herb',
  wheat: 'blobbi-pixel:material:wheat',
  tulip: 'blobbi-pixel:flower:tulip',
  sunflower: 'blobbi-pixel:flower:sunflower',
};

export const PLACEABLE_CONTENT: readonly PlaceableContent[] = [
  // ─── Workstations and storage ────────────────────────────────────────────
  { kind: 'workbench', label: 'workbench', plural: 'workbenches', description: 'A sturdy bench with a saw and a hammer. Furniture is made here.', art: 'workbench', where: 'both', layer: 'solid', footRx: 7, footRy: 2, recipe: [{ item: I.wood, quantity: 5 }, { item: I.stick, quantity: 3 }, { item: I.stone, quantity: 2 }], station: 'hand', use: 'craft' },
  { kind: 'chest', label: 'wooden chest', plural: 'wooden chests', description: 'Iron-banded storage for 16 stacks. Keeps its contents wherever it stands.', art: 'chest', where: 'both', layer: 'solid', footRx: 5, footRy: 2, recipe: [{ item: I.wood, quantity: 6 }, { item: I.stone, quantity: 2 }], station: 'hand', use: 'storage', capacity: 16 },
  { kind: 'cooking-station', label: 'cooking station', plural: 'cooking stations', description: 'A stone stove with a pot. Turns the harvest into meals.', art: 'cooking-station', where: 'both', layer: 'solid', footRx: 6, footRy: 2, recipe: [{ item: I.stone, quantity: 8 }, { item: I.wood, quantity: 2 }, { item: I.stick, quantity: 2 }], station: 'hand', unlock: 'harvest', use: 'cook' },
  { kind: 'cabinet', label: 'cabinet', plural: 'cabinets', description: 'A tall two-door cabinet: storage for 24 stacks, indoors.', art: 'cabinet', where: 'indoor', layer: 'solid', footRx: 5, footRy: 2, recipe: [{ item: I.wood, quantity: 8 }, { item: I.stone, quantity: 2 }], station: 'workbench', unlock: 'side-storage', use: 'storage', capacity: 24 },
  // ─── Indoor furniture ───────────────────────────────────────────────────
  { kind: 'bed', label: 'bed', plural: 'beds', description: 'A wooden bed with a warm blanket. Blobbi sleeps best here.', art: 'bed', where: 'indoor', layer: 'solid', footRx: 7, footRy: 4, recipe: [{ item: I.wood, quantity: 6 }, { item: I.cloth, quantity: 3 }], station: 'workbench', unlock: 'shelter', use: 'sleep', joy: 3, variants: 5 },
  { kind: 'pet-bed', label: 'Blobbi cushion', plural: 'Blobbi cushions', description: 'A round cushion just Blobbi-sized. A favourite napping spot.', art: 'pet-bed', where: 'indoor', layer: 'floor', footRx: 6, footRy: 3, recipe: [{ item: I.cloth, quantity: 3 }, { item: I.wood, quantity: 1 }], station: 'workbench', unlock: 'feed', use: 'nap', joy: 4, variants: 5 },
  { kind: 'chair', label: 'wooden chair', plural: 'wooden chairs', description: 'A simple chair with a slatted back.', art: 'chair', where: 'indoor', layer: 'solid', footRx: 3, footRy: 2, recipe: [{ item: I.wood, quantity: 3 }, { item: I.stick, quantity: 2 }], station: 'workbench', unlock: 'shelter', use: 'sit', joy: 1 },
  { kind: 'armchair', label: 'armchair', plural: 'armchairs', description: 'A deep, soft armchair. The coziest seat in the house.', art: 'armchair', where: 'indoor', layer: 'solid', footRx: 5, footRy: 3, recipe: [{ item: I.wood, quantity: 4 }, { item: I.cloth, quantity: 3 }], station: 'workbench', unlock: 'feed', use: 'sit', joy: 3, variants: 5 },
  { kind: 'stool', label: 'stool', plural: 'stools', description: 'Three legs and a round top. Handy anywhere.', art: 'stool', where: 'indoor', layer: 'solid', footRx: 3, footRy: 1, recipe: [{ item: I.wood, quantity: 2 }, { item: I.stick, quantity: 1 }], station: 'workbench', unlock: 'shelter', use: 'sit' },
  { kind: 'table', label: 'small table', plural: 'small tables', description: 'A little table for a cup and a book.', art: 'table', where: 'indoor', layer: 'solid', footRx: 5, footRy: 2, recipe: [{ item: I.wood, quantity: 4 }], station: 'workbench', unlock: 'shelter', use: 'admire' },
  { kind: 'dining-table', label: 'dining table', plural: 'dining tables', description: 'A long table for shared meals. Meals eaten nearby make Blobbi happier.', art: 'dining-table', where: 'indoor', layer: 'solid', footRx: 9, footRy: 3, recipe: [{ item: I.wood, quantity: 7 }, { item: I.stick, quantity: 2 }], station: 'workbench', unlock: 'cook', use: 'admire', joy: 2 },
  { kind: 'bookshelf', label: 'bookshelf', plural: 'bookshelves', description: 'Three shelves of mismatched books. Some are about turtles.', art: 'bookshelf', where: 'indoor', layer: 'solid', footRx: 6, footRy: 2, recipe: [{ item: I.wood, quantity: 6 }, { item: I.cloth, quantity: 1 }], station: 'workbench', unlock: 'carrier', use: 'read', joy: 2 },
  { kind: 'wall-shelf', label: 'wall shelf', plural: 'wall shelves', description: 'A shelf of little jars, hung on the wall.', art: 'wall-shelf', where: 'indoor', layer: 'wall', footRx: 6, footRy: 1, recipe: [{ item: I.wood, quantity: 3 }, { item: I.stone, quantity: 2 }], station: 'workbench', unlock: 'home', use: 'admire' },
  { kind: 'painting', label: 'Carrier painting', plural: 'Carrier paintings', description: 'A small painting of a turtle carrying an island across the sea.', art: 'painting', where: 'indoor', layer: 'wall', footRx: 6, footRy: 1, recipe: [{ item: I.wood, quantity: 2 }, { item: I.cloth, quantity: 1 }, { item: I.sunflower, quantity: 1 }], station: 'workbench', unlock: 'mystery', use: 'admire', joy: 2, variants: 2 },
  { kind: 'wall-clock', label: 'wall clock', plural: 'wall clocks', description: 'Tells the time of day on the island.', art: 'wall-clock', where: 'indoor', layer: 'wall', footRx: 4, footRy: 1, recipe: [{ item: I.wood, quantity: 3 }, { item: I.stone, quantity: 1 }, { item: I.shell, quantity: 1 }], station: 'workbench', unlock: 'side-shells', use: 'time' },
  { kind: 'wall-lantern', label: 'wall lantern', plural: 'wall lanterns', description: 'A warm light on the wall. Brightens the room at night.', art: 'wall-lantern', where: 'indoor', layer: 'wall', footRx: 3, footRy: 1, recipe: [{ item: I.wood, quantity: 1 }, { item: I.stone, quantity: 2 }, { item: I.stick, quantity: 1 }], station: 'workbench', unlock: 'shelter', use: 'light' },
  { kind: 'floor-lamp', label: 'floor lamp', plural: 'floor lamps', description: 'A tall lamp with a cloth shade.', art: 'floor-lamp', where: 'indoor', layer: 'solid', footRx: 2, footRy: 1, recipe: [{ item: I.wood, quantity: 2 }, { item: I.stone, quantity: 2 }, { item: I.cloth, quantity: 2 }], station: 'workbench', unlock: 'home', use: 'light', variants: 5 },
  { kind: 'rug', label: 'round rug', plural: 'round rugs', description: 'A woven rug. Soft underfoot; walk right over it.', art: 'rug', where: 'indoor', layer: 'floor', footRx: 8, footRy: 4, recipe: [{ item: I.cloth, quantity: 4 }], station: 'workbench', unlock: 'shelter', use: 'admire', variants: 5 },
  { kind: 'potted-plant', label: 'potted plant', plural: 'potted plants', description: 'A clay pot with a fern, a cactus or a flowering bush.', art: 'potted-plant', where: 'both', layer: 'solid', footRx: 3, footRy: 2, recipe: [{ item: I.stone, quantity: 2 }, { item: I.seed, quantity: 1 }], station: 'workbench', unlock: 'shelter', use: 'admire', joy: 1, variants: 3 },
  { kind: 'vase', label: 'flower vase', plural: 'flower vases', description: 'Cut tulips in a glassy blue vase.', art: 'vase', where: 'indoor', layer: 'solid', footRx: 2, footRy: 1, recipe: [{ item: I.stone, quantity: 2 }, { item: I.tulip, quantity: 2 }], station: 'workbench', unlock: 'side-flowers', use: 'admire', joy: 3, variants: 3 },
  { kind: 'music-box', label: 'music box', plural: 'music boxes', description: 'Plays a slow little tune when opened. Blobbi loves it.', art: 'music-box', where: 'indoor', layer: 'solid', footRx: 4, footRy: 2, recipe: [{ item: I.wood, quantity: 3 }, { item: I.shell, quantity: 2 }], station: 'workbench', unlock: 'discover-bottle', use: 'music', joy: 4 },
  { kind: 'toy-ball', label: 'toy ball', plural: 'toy balls', description: 'A soft striped ball. Blobbi plays with it when bored.', art: 'toy-ball', where: 'both', layer: 'floor', footRx: 2, footRy: 2, recipe: [{ item: I.cloth, quantity: 2 }, { item: I.fibre, quantity: 1 }], station: 'workbench', unlock: 'feed', use: 'play', joy: 4, variants: 5 },
  // ─── Outdoor decorations ─────────────────────────────────────────────────
  { kind: 'picket-fence', label: 'picket fence', plural: 'picket fences', description: 'A white picket fence. Lines up end to end.', art: 'picket-fence', where: 'outdoor', layer: 'solid', footRx: 6, footRy: 1, recipe: [{ item: I.wood, quantity: 3 }], station: 'workbench', unlock: 'improve', use: 'admire' },
  { kind: 'stone-wall', label: 'low stone wall', plural: 'low stone walls', description: 'Dry-stacked stones, knee high.', art: 'stone-wall', where: 'outdoor', layer: 'solid', footRx: 6, footRy: 1, recipe: [{ item: I.stone, quantity: 5 }], station: 'workbench', unlock: 'improve', use: 'admire' },
  { kind: 'stone-path', label: 'stone path', plural: 'stone paths', description: 'Flat stepping stones. Walk on them; make a path to your door.', art: 'stone-path', where: 'outdoor', layer: 'floor', footRx: 3, footRy: 3, recipe: [{ item: I.stone, quantity: 2 }], makes: 2, station: 'hand' },
  { kind: 'boardwalk', label: 'boardwalk', plural: 'boardwalks', description: 'Wooden boards laid flat. Walk on them.', art: 'boardwalk', where: 'outdoor', layer: 'floor', footRx: 3, footRy: 3, recipe: [{ item: I.wood, quantity: 1 }], makes: 2, station: 'hand' },
  { kind: 'signpost', label: 'signpost', plural: 'signposts', description: 'A sign with a friendly word for whoever passes.', art: 'signpost', where: 'outdoor', layer: 'solid', footRx: 2, footRy: 1, recipe: [{ item: I.wood, quantity: 2 }, { item: I.stick, quantity: 1 }], station: 'workbench', unlock: 'improve', use: 'read' },
  { kind: 'scarecrow', label: 'scarecrow', plural: 'scarecrows', description: 'A straw friend for the field. Blobbi waves at it.', art: 'scarecrow', where: 'outdoor', layer: 'solid', footRx: 2, footRy: 1, recipe: [{ item: I.stick, quantity: 3 }, { item: I.cloth, quantity: 2 }, { item: I.wheat, quantity: 1 }], station: 'workbench', unlock: 'plant', use: 'admire', joy: 2, variants: 5 },
  { kind: 'bird-bath', label: 'bird bath', plural: 'bird baths', description: 'A stone basin of water. Little birds come to splash.', art: 'bird-bath', where: 'outdoor', layer: 'solid', footRx: 4, footRy: 2, recipe: [{ item: I.stone, quantity: 6 }], station: 'workbench', unlock: 'improve', use: 'birds', joy: 2 },
  { kind: 'cairn', label: 'stone cairn', plural: 'stone cairns', description: 'Balanced stones. Nobody knows who started this.', art: 'cairn', where: 'outdoor', layer: 'solid', footRx: 3, footRy: 2, recipe: [{ item: I.stone, quantity: 4 }], station: 'hand', use: 'admire' },
  { kind: 'log-seat', label: 'log seat', plural: 'log seats', description: 'Half a log to sit on and watch the sea.', art: 'log-seat', where: 'outdoor', layer: 'solid', footRx: 6, footRy: 2, recipe: [{ item: I.wood, quantity: 3 }], station: 'hand', use: 'sit', joy: 2 },
  { kind: 'sprinkler', label: 'sprinkler', plural: 'sprinklers', description: 'Waters every dry crop within a step of it, all by itself.', art: 'sprinkler', where: 'outdoor', layer: 'solid', footRx: 2, footRy: 1, recipe: [{ item: I.stone, quantity: 4 }, { item: I.wood, quantity: 2 }, { item: I.shell, quantity: 1 }], station: 'workbench', unlock: 'side-farmer', use: 'sprinkle' },
  { kind: 'bird-feeder', label: 'bird feeder', plural: 'bird feeders', description: 'A little roof over seeds. Birds visit often.', art: 'bird-feeder', where: 'outdoor', layer: 'solid', footRx: 2, footRy: 1, recipe: [{ item: I.wood, quantity: 3 }, { item: I.stick, quantity: 1 }, { item: I.seed, quantity: 2 }], station: 'workbench', unlock: 'improve', use: 'birds', joy: 1 },
  { kind: 'flower-arch', label: 'flower arch', plural: 'flower arches', description: 'A wooden arch wound with flowers. Walk under it.', art: 'flower-arch', where: 'outdoor', layer: 'open', footRx: 8, footRy: 1, recipe: [{ item: I.wood, quantity: 3 }, { item: I.stick, quantity: 2 }, { item: I.fibre, quantity: 3 }], station: 'workbench', unlock: 'improve', use: 'admire', joy: 2, variants: 4 },
  { kind: 'blobbi-statue', label: 'Blobbi statue', plural: 'Blobbi statues', description: 'A round stone friend on a plinth. Blobbi finds it very flattering.', art: 'blobbi-statue', where: 'outdoor', layer: 'solid', footRx: 4, footRy: 2, recipe: [{ item: I.stone, quantity: 8 }], station: 'workbench', unlock: 'side-friend', use: 'admire', joy: 4 },
  { kind: 'herb-planter', label: 'herb planter', plural: 'herb planters', description: 'A box of kitchen herbs. Grows a fresh herb every few minutes.', art: 'herb-planter', where: 'outdoor', layer: 'solid', footRx: 6, footRy: 2, recipe: [{ item: I.wood, quantity: 4 }, { item: I.herb, quantity: 2 }], station: 'workbench', unlock: 'cook', use: 'herbs' },
  { kind: 'wind-chime', label: 'wind chime', plural: 'wind chimes', description: 'Shell chimes that ring in the breeze.', art: 'wind-chime', where: 'outdoor', layer: 'solid', footRx: 2, footRy: 1, recipe: [{ item: I.stick, quantity: 2 }, { item: I.shell, quantity: 3 }], station: 'workbench', unlock: 'side-shells', use: 'music', joy: 2 },
  // M10 phase C: prepared land. Wild things (trees, rocks, bushes, sticks and stones) do not come back within its
  // circle (`KEEP_CLEAR_RADIUS`, game/clearing.ts); pick it up and they may return. Walked under, never in the way.
  { kind: 'clearing-flag', label: 'clearing flag', plural: 'clearing flags', description: 'A little flag on a stick. Nothing wild grows back within its circle: ground kept clear for building. Pick it up and nature may return.', art: 'clearing-flag', where: 'outdoor', layer: 'open', footRx: 2, footRy: 1, recipe: [{ item: I.stick, quantity: 2 }, { item: I.fibre, quantity: 1 }], station: 'hand', use: 'admire', variants: 4 },
  { kind: 'hay-bale', label: 'hay bale', plural: 'hay bales', description: 'A neat bale of wheat straw. A fine outdoor seat.', art: 'hay-bale', where: 'outdoor', layer: 'solid', footRx: 5, footRy: 2, recipe: [{ item: I.wheat, quantity: 4 }, { item: I.fibre, quantity: 1 }], station: 'workbench', unlock: 'harvest', use: 'sit', joy: 1 },
];

/** The bag item a placeable is crafted as and picked up into. */
export function placeableItem(p: PlaceableContent): ItemDefinition {
  return { id: `blobbi-pixel:furniture:${p.kind}`, label: p.label, plural: p.plural, category: 'furniture', stack: 10, description: p.description, place: p.kind };
}

/** Items for the decorations built since M4 (built in place with B, picked up into the bag). */
export const LEGACY_PLACEABLE_ITEMS: readonly ItemDefinition[] = [
  { id: 'blobbi-pixel:furniture:fence', label: 'wooden fence', plural: 'wooden fences', category: 'furniture', stack: 10, description: 'A short fence of posts and rails.', place: 'fence' },
  { id: 'blobbi-pixel:furniture:flower-bed', label: 'flower bed', plural: 'flower beds', category: 'furniture', stack: 10, description: 'A wooden frame of soil and flowers.', place: 'flower-bed' },
  { id: 'blobbi-pixel:furniture:lantern', label: 'small lantern', plural: 'small lanterns', category: 'furniture', stack: 10, description: 'A lantern on a post. Fireflies like it.', place: 'lantern' },
  { id: 'blobbi-pixel:furniture:bench', label: 'wooden bench', plural: 'wooden benches', category: 'furniture', stack: 10, description: 'A two-plank bench with a backrest.', place: 'bench' },
  { id: 'blobbi-pixel:furniture:crate', label: 'storage crate', plural: 'storage crates', category: 'furniture', stack: 10, description: 'Adds room to every stack in the bag (up to two crates).', place: 'crate' },
];

/** Materials the furniture needs that the island did not have before M5. */
export const PLACEABLE_MATERIALS: readonly ItemDefinition[] = [
  {
    id: I.cloth,
    label: 'cloth',
    plural: 'cloth',
    category: 'material',
    stack: 30,
    description: 'Woven from wild fibre at a workbench. For beds, rugs and cushions.',
    icon: { rows: ['ccccccc', 'cCcCcCc', 'ccccccc', 'cCcCcCc', 'ccccccc', '.d.d.d.'], colours: { c: '#e6d7b8', C: '#f8f0dc', d: '#b8a07a' } },
  },
];
