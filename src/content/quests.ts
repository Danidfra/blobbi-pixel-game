/**
 * QUEST CONTENT: the island's goals as data. A quest becomes active once its prerequisites are done and completes
 * as soon as its goal holds; goals read what the player actually did (the action tally) and what the world holds.
 * Opening a menu never counts. Rewards: items, building plans (`unlocks`), journal notes (`lore`), friendship.
 * Recipes name the quest that teaches them (`unlock` in the meal and placeable catalogues).
 *
 * Main chapter 1 keeps the ids of the M4 objectives, so a save that already earned those rewards never earns
 * them twice.
 */
export type TallyKey =
  | 'collected'
  | 'crafted'
  | 'axesCrafted'
  | 'felled'
  | 'mined'
  | 'plots'
  | 'planted'
  | 'watered'
  | 'harvested'
  | 'fed'
  | 'petted'
  | 'built'
  | 'decorations'
  | 'entered'
  | 'furnished'
  | 'stored'
  | 'cooked'
  | 'mealsFed'
  | 'discoveries'
  | 'looked'
  | 'sat'
  | 'played'
  | 'talked'
  | 'flowers'
  | 'shells'
  | 'foraged'
  | 'favourites'
  | 'fished'
  /** Waves to the curious seal (M10). */
  | 'waved';

export type Goal =
  | { tally: TallyKey; n: number }
  | { have: string; n?: number }
  | { finished: string; n?: number }
  | { decorations: number }
  | { found: string }
  | { friendship: number }
  /** The home has reached a house level (M8). */
  | { house: number }
  | { all: readonly Goal[] }
  | { any: readonly Goal[] };

export interface QuestReward {
  items?: readonly { item: string; quantity: number }[];
  /** Building kinds B may build from now on (the M4 decorations). */
  unlocks?: readonly string[];
  lore?: readonly string[];
  friendship?: number;
  text: string;
}

export interface QuestContent {
  id: string;
  type: 'main' | 'side' | 'discovery';
  chapter?: number;
  title: string;
  /** A sentence or two of story. */
  story: string;
  /** How to do it. */
  hint: string;
  requires?: readonly string[];
  goal: Goal;
  reward: QuestReward;
}

const I = {
  seed: 'blobbi-pixel:resource:seed',
  stone: 'blobbi-pixel:resource:stone',
  stick: 'blobbi-pixel:resource:stick',
  cloth: 'blobbi-pixel:material:cloth',
  axe: 'blobbi-pixel:tool:simple-axe',
  carrotSeed: 'blobbi-pixel:seed:carrot',
  pumpkinSeed: 'blobbi-pixel:seed:pumpkin',
  radishSeed: 'blobbi-pixel:seed:radish',
  potatoSeed: 'blobbi-pixel:seed:potato',
  tomatoSeed: 'blobbi-pixel:seed:tomato',
  strawberrySeed: 'blobbi-pixel:seed:strawberry',
  wheatSeed: 'blobbi-pixel:seed:wheat',
  sunflowerSeed: 'blobbi-pixel:seed:sunflower',
  tulipBulb: 'blobbi-pixel:seed:tulip',
  lavenderSeed: 'blobbi-pixel:seed:lavender',
  wateringCan: 'blobbi-pixel:tool:watering-can',
  wood: 'blobbi-pixel:material:wood',
  pottedPlant: 'blobbi-pixel:furniture:potted-plant',
};

export const QUEST_CONTENT: readonly QuestContent[] = [
  // ─── Chapter 1: The First Home ───────────────────────────────────────────
  // M8: a new island has no house; this chapter is the way to the first one: meet the Blobbi, explore, gather, make a
  // tool, prepare materials, build, step inside, make it yours. (Ids of the M4 objectives are kept.)
  { id: 'meet', type: 'main', chapter: 1, title: 'Meet your Blobbi', story: 'The little Blobbi keeps peeking at you.', hint: 'Give Blobbi some attention: H, or BLOBBI then PET.', goal: { tally: 'petted', n: 1 }, reward: { lore: ['blobbi'], friendship: 5, text: 'a new friend' } },
  { id: 'arrive', type: 'main', chapter: 1, title: 'Explore the island', story: 'A small island in a wide sea. Where are you?', hint: 'Walk about and press E (or USE) on 3 things: trees, flowers, rocks...', goal: { tally: 'looked', n: 3 }, reward: { lore: ['arrival'], friendship: 2, text: 'a journal note (J)' } },
  { id: 'gather', type: 'main', chapter: 1, title: 'Gather supplies', story: 'Sticks, stones and seeds lie all over the island.', hint: 'Pick up 5 sticks, stones or seeds (E).', goal: { tally: 'collected', n: 5 }, reward: { items: [{ item: I.seed, quantity: 2 }], text: '+2 seeds' } },
  { id: 'axe', type: 'main', chapter: 1, title: 'Your first tool', story: 'A sharp stone and a good stick make an axe.', hint: 'Open CRAFT (K) and make a simple axe: 3 sticks + 2 stones.', requires: ['gather'], goal: { any: [{ tally: 'axesCrafted', n: 1 }, { have: I.axe }] }, reward: { unlocks: ['fence'], text: 'fence plans' } },
  { id: 'wood', type: 'main', chapter: 1, title: 'Gather wood', story: 'The trees here grow back quickly. It feels allowed.', hint: 'Hold the axe (Q, or Equip in the bag) and fell a tree: three hits (E).', requires: ['axe'], goal: { tally: 'felled', n: 1 }, reward: { items: [{ item: I.stone, quantity: 2 }], text: '+2 stones' } },
  { id: 'materials', type: 'main', chapter: 1, title: 'Building materials', story: 'A shelter wants six good logs and three flat stones.', hint: 'Have 6 wood and 3 stones in the bag (fell another tree or two).', requires: ['wood'], goal: { any: [{ all: [{ have: I.wood, n: 6 }, { have: I.stone, n: 3 }] }, { finished: 'shelter' }] }, reward: { friendship: 2, text: 'ready to build' } },
  { id: 'shelter', type: 'main', chapter: 1, title: 'Build your first home', story: 'Somewhere for you and Blobbi to sleep, out of the wind.', hint: 'Build (B, or CRAFT then Build): green means it fits, with open ground at its door. E builds.', requires: ['materials'], goal: { finished: 'shelter' }, reward: { items: [{ item: I.seed, quantity: 3 }], text: '+3 seeds, house furniture plans' } },
  { id: 'enter-home', type: 'main', chapter: 1, title: 'Step inside', story: 'It is small, but it is yours.', hint: 'Walk to the door of your shelter and press E.', requires: ['shelter'], goal: { tally: 'entered', n: 1 }, reward: { items: [{ item: I.pottedPlant, quantity: 1 }], text: 'a housewarming gift: a potted plant' } },
  { id: 'first-furniture', type: 'main', chapter: 1, title: 'Make it yours', story: 'A home needs one thing that is only yours.', hint: 'Inside, open the bag (I), choose the potted plant, Place, and press E where it fits.', requires: ['enter-home'], goal: { tally: 'furnished', n: 1 }, reward: { friendship: 3, text: 'a cozier home' } },
  // ─── Chapter 2: Roots ────────────────────────────────────────────────────
  { id: 'plot', type: 'main', chapter: 2, title: 'Prepare a farm plot', story: 'The soil here is deep and dark. Something would grow.', hint: 'Simple hoe: 1 wood + 2 sticks + 1 stone (CRAFT). Hold it and till grass (E).', requires: ['wood'], goal: { tally: 'plots', n: 1 }, reward: { items: [{ item: I.carrotSeed, quantity: 3 }], text: '+3 carrot seeds (new crop)' } },
  { id: 'plant', type: 'main', chapter: 2, title: 'Plant a seed', story: 'Wild seeds make turnips. Carrots need carrot seeds.', hint: 'Face your plot and press E. T picks which seed.', requires: ['plot'], goal: { tally: 'planted', n: 1 }, reward: { unlocks: ['flower-bed'], items: [{ item: I.radishSeed, quantity: 3 }], text: 'flower bed plans, +3 radish seeds' } },
  { id: 'water', type: 'main', chapter: 2, title: 'Water a crop', story: 'Crops only grow while their soil is wet.', hint: 'A dry crop shows a drop. Face it and press E.', requires: ['plant'], goal: { tally: 'watered', n: 1 }, reward: { items: [{ item: I.seed, quantity: 2 }, { item: I.wateringCan, quantity: 1 }], text: '+2 seeds, a watering can' } },
  { id: 'harvest', type: 'main', chapter: 2, title: 'Harvest food', story: 'Keep it watered, and soon there is food.', hint: 'Water until it is ripe (it glints), then press E.', requires: ['water'], goal: { tally: 'harvested', n: 1 }, reward: { items: [{ item: I.pumpkinSeed, quantity: 2 }, { item: I.potatoSeed, quantity: 2 }], text: '+2 pumpkin seeds, +2 seed potatoes, stove plans' } },
  { id: 'feed', type: 'main', chapter: 2, title: 'Feed Blobbi', story: 'Blobbi has been eyeing the harvest.', hint: 'Press F (or Feed in the bag) to give Blobbi something to eat.', requires: ['harvest'], goal: { tally: 'fed', n: 1 }, reward: { unlocks: ['lantern', 'bench'], friendship: 5, text: 'lantern and bench plans, cozy furniture plans' } },
  { id: 'home', type: 'main', chapter: 2, title: 'Make it home', story: 'Four walls are a shelter. Things you made make it a home.', hint: 'Craft furniture at a workbench (K) and place 2 pieces inside your shelter (I, then Place).', requires: ['first-furniture'], goal: { tally: 'furnished', n: 2 }, reward: { items: [{ item: I.cloth, quantity: 3 }, { item: I.tomatoSeed, quantity: 2 }], lore: ['carriers'], text: '+3 cloth, +2 tomato seeds, a journal note' } },
  // ─── Chapter 3: Whispers of the Carrier ──────────────────────────────────
  { id: 'cook', type: 'main', chapter: 3, title: 'A warm meal', story: 'Raw turnips are fine. A roasted one is better.', hint: 'Craft a cooking station (K), place it, and cook something (E at the stove).', requires: ['harvest'], goal: { tally: 'cooked', n: 1 }, reward: { items: [{ item: I.wheatSeed, quantity: 3 }], text: '+3 wheat seeds, new recipes, herb planter plans' } },
  { id: 'mystery', type: 'main', chapter: 3, title: 'Something that hums', story: 'Blobbi keeps staring at a patch of grass, as if listening.', hint: 'Explore the island: somewhere, a stone is glinting. Press E on it.', requires: ['home'], goal: { found: 'carrier-stone' }, reward: { friendship: 5, text: 'a painting plan' } },
  { id: 'carrier', type: 'main', chapter: 3, title: 'Listen to the Carrier', story: 'The stone hums. So, you suspect, does the island.', hint: 'Go to the shore near the turtle\'s head and press E to listen.', requires: ['mystery'], goal: { tally: 'talked', n: 1 }, reward: { lore: ['hum'], items: [{ item: I.sunflowerSeed, quantity: 3 }], text: '+3 sunflower seeds, a journal note, bookshelf and fishing rod plans' } },
  { id: 'restore', type: 'main', chapter: 3, title: 'Begin restoring the island', story: 'A tended island makes a strong, calm Carrier.', hint: 'Grow 3 flowers in your garden and place 3 decorations outside.', requires: ['carrier'], goal: { all: [{ tally: 'flowers', n: 3 }, { decorations: 3 }] }, reward: { lore: ['restoring', 'where-to'], friendship: 10, text: 'two journal notes, the harvest feast recipe' } },
  // ─── Chapter 4: A Growing Home (M8) ──────────────────────────────────────
  { id: 'cottage', type: 'main', chapter: 4, title: 'A bigger home', story: 'Blobbi keeps bumping into the table. Time for more room.', hint: 'Open HOME (1): upgrade to a Cottage with 10 wood, 6 stones and 2 cloth.', requires: ['home', 'harvest'], goal: { house: 2 }, reward: { friendship: 5, text: 'new roof and wall colours, room styles' } },
  { id: 'dream-home', type: 'main', chapter: 4, title: 'The dream home', story: 'A house as warm as the island has become.', hint: 'Island harmony 35 and 3 discoveries; then HOME (1): 16 wood, 10 stones, 4 cloth.', requires: ['cottage', 'carrier'], goal: { house: 3 }, reward: { friendship: 10, lore: ['keepers'], text: 'the last house styles, a journal note' } },
  // ─── Side quests ─────────────────────────────────────────────────────────
  { id: 'improve', type: 'side', title: 'Make it pretty', story: 'A fence here, a flower bed there.', hint: 'Place 2 decorations outside (B, or from the bag).', requires: ['axe'], goal: { decorations: 2 }, reward: { unlocks: ['crate'], text: 'storage crate plans, garden decoration plans' } },
  { id: 'side-storage', type: 'side', title: 'A place for everything', story: 'The bag is getting heavy.', hint: 'Store 20 items in chests.', requires: ['shelter'], goal: { tally: 'stored', n: 20 }, reward: { items: [{ item: I.cloth, quantity: 2 }], text: 'cabinet plans, +2 cloth' } },
  { id: 'side-shells', type: 'side', title: 'Shell seeker', story: 'Pretty shells wash up along the shore.', hint: 'Pick up 6 sea shells on the beach.', goal: { tally: 'shells', n: 6 }, reward: { items: [{ item: I.strawberrySeed, quantity: 2 }], text: 'wind chime and wall clock plans, +2 strawberry runners' } },
  { id: 'side-flowers', type: 'side', title: 'Flower friend', story: 'Blobbi sniffs every flower it passes.', hint: 'Harvest 3 flowers from your garden.', requires: ['plant'], goal: { tally: 'flowers', n: 3 }, reward: { items: [{ item: I.tulipBulb, quantity: 3 }, { item: I.lavenderSeed, quantity: 2 }], text: 'vase plans, +3 tulip bulbs, +2 lavender seeds' } },
  { id: 'side-farmer', type: 'side', title: 'Green thumb', story: 'The garden is getting bigger.', hint: 'Harvest 10 crops.', requires: ['harvest'], goal: { tally: 'harvested', n: 10 }, reward: { items: [{ item: I.tomatoSeed, quantity: 2 }], text: 'sprinkler plans, +2 tomato seeds' } },
  { id: 'side-chef', type: 'side', title: 'Little chef', story: 'Blobbi follows the smell of cooking everywhere.', hint: 'Cook 3 meals.', requires: ['cook'], goal: { tally: 'cooked', n: 3 }, reward: { text: 'bread, soups and porridge recipes' } },
  { id: 'side-baker', type: 'side', title: 'Baker', story: 'With bread, anything is possible. Tarts, for instance.', hint: 'Cook 8 meals.', requires: ['side-chef'], goal: { tally: 'cooked', n: 8 }, reward: { friendship: 5, text: 'tart and stew recipes' } },
  { id: 'side-florist', type: 'side', title: 'Lavender fields', story: 'Lavender would make a calming tea.', hint: 'Harvest 6 flowers in total.', requires: ['side-flowers'], goal: { tally: 'flowers', n: 6 }, reward: { text: 'lavender tea recipe' } },
  { id: 'side-friend', type: 'side', title: 'Best friends', story: 'Blobbi beams whenever you come near.', hint: 'Reach friendship level 3 with your Blobbi (care, food and attention).', goal: { friendship: 3 }, reward: { text: 'Blobbi statue plans' } },
  { id: 'side-forager', type: 'side', title: 'Forager', story: 'Mushrooms, berries, herbs, fibre: the island feeds you if you look.', hint: 'Gather 15 wild things (fibre, mushrooms, berries, herbs, shells).', goal: { tally: 'foraged', n: 15 }, reward: { items: [{ item: I.potatoSeed, quantity: 2 }, { item: I.strawberrySeed, quantity: 1 }], text: '+2 seed potatoes, +1 strawberry runner' } },
  { id: 'side-cozy', type: 'side', title: 'Cozy corner', story: 'A chair by the window, a rug underfoot.', hint: 'Place 5 pieces of furniture inside.', requires: ['home'], goal: { tally: 'furnished', n: 5 }, reward: { items: [{ item: I.cloth, quantity: 4 }], friendship: 5, text: '+4 cloth' } },
  { id: 'side-miner', type: 'side', title: 'Deeper stone', story: 'The big rocks have green flecks inside, if you look closely.', hint: 'Break 3 large rocks with the pickaxe. After that, rocks give copper ore too.', goal: { tally: 'mined', n: 3 }, reward: { items: [{ item: 'blobbi-pixel:material:copper-ore', quantity: 3 }], text: '+3 copper ore, copper tool upgrades' } },
  { id: 'side-angler', type: 'side', title: 'Gone fishing', story: 'Fish flash silver at the shore.', hint: 'Craft a fishing rod (sticks and fibre), cast at the water (E) and press E when a fish bites. Catch 3.', requires: ['carrier'], goal: { tally: 'fished', n: 3 }, reward: { items: [{ item: 'blobbi-pixel:resource:herb', quantity: 2 }], friendship: 3, text: 'fish recipes, +2 wild herbs' } },
  { id: 'side-sea-friends', type: 'side', title: 'Sea friends', story: 'Something with whiskers keeps watching from the shallows.', hint: 'Wait where the land meets the sea until the curious seal comes up, then wave to it (E). Wave 3 times. (On a young island the land may not reach the water yet: it will as the island grows.)', requires: ['carrier'], goal: { tally: 'waved', n: 3 }, reward: { friendship: 4, text: 'a seal that knows you' } },
  { id: 'side-favourite', type: 'side', title: 'A favourite treat', story: 'Every Blobbi has favourite foods. What are this one\'s?', hint: 'Feed Blobbi one of its favourite foods (the care panel, U, shows its likes once you have tried a few).', requires: ['feed'], goal: { tally: 'favourites', n: 1 }, reward: { friendship: 10, text: 'a happy Blobbi' } },
  // ─── Discovery quests ────────────────────────────────────────────────────
  { id: 'discover-bottle', type: 'discovery', title: 'A message from far away', story: 'Something green glints at the waterline.', hint: 'Search the beaches.', goal: { found: 'bottle' }, reward: { text: 'music box plans' } },
  { id: 'discover-pages', type: 'discovery', title: 'The Keeper\'s pages', story: 'Someone kept a journal here once.', hint: 'Two pages lie somewhere in the woods and the meadows.', goal: { all: [{ found: 'page-1' }, { found: 'page-2' }] }, reward: { items: [{ item: I.cloth, quantity: 2 }], text: '+2 cloth' } },
  { id: 'discover-all', type: 'discovery', title: 'Collector', story: 'The island is full of small secrets.', hint: 'Find all 8 discoveries.', goal: { tally: 'discoveries', n: 8 }, reward: { friendship: 10, items: [{ item: I.wheatSeed, quantity: 4 }, { item: I.lavenderSeed, quantity: 2 }], text: 'a proud Keeper' } },
];

/** Repeatable island requests: one at a time, the next at the following dawn. Never expire, never punish. */
export interface RequestContent {
  id: string;
  title: string;
  goal: { tally: TallyKey; n: number };
  reward: { items: readonly { item: string; quantity: number }[]; text: string };
}

export const REQUEST_POOL: readonly RequestContent[] = [
  { id: 'req-sticks', title: 'Tidy up some sticks', goal: { tally: 'collected', n: 6 }, reward: { items: [{ item: I.seed, quantity: 2 }], text: '+2 seeds' } },
  { id: 'req-water', title: 'Water the garden', goal: { tally: 'watered', n: 4 }, reward: { items: [{ item: I.radishSeed, quantity: 2 }], text: '+2 radish seeds' } },
  { id: 'req-harvest', title: 'Bring in the harvest', goal: { tally: 'harvested', n: 3 }, reward: { items: [{ item: I.cloth, quantity: 1 }, { item: I.seed, quantity: 2 }], text: '+1 cloth, +2 seeds' } },
  { id: 'req-cook', title: 'Cook something nice', goal: { tally: 'cooked', n: 1 }, reward: { items: [{ item: I.wheatSeed, quantity: 2 }], text: '+2 wheat seeds' } },
  { id: 'req-pet', title: 'Spend time with Blobbi', goal: { tally: 'petted', n: 3 }, reward: { items: [{ item: I.tulipBulb, quantity: 1 }], text: '+1 tulip bulb' } },
  { id: 'req-forage', title: 'A walk in the wild', goal: { tally: 'foraged', n: 5 }, reward: { items: [{ item: I.potatoSeed, quantity: 1 }, { item: I.carrotSeed, quantity: 1 }], text: '+1 seed potato, +1 carrot seed' } },
  { id: 'req-wood', title: 'Firewood', goal: { tally: 'felled', n: 1 }, reward: { items: [{ item: I.stone, quantity: 3 }], text: '+3 stones' } },
  { id: 'req-feed', title: 'A snack for Blobbi', goal: { tally: 'fed', n: 2 }, reward: { items: [{ item: I.strawberrySeed, quantity: 1 }], text: '+1 strawberry runner' } },
];
