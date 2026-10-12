/**
 * THE PLAYER GUIDE (M8) as data: short pages about what the game actually does today. Each page names both ways to
 * do a thing: the key, and the button a mouse or a finger uses. Keep a page to a handful of sentences; when a system
 * changes, change its page in the same change (docs/game-design/PLAYER-GUIDE.md mirrors these pages).
 */
export interface GuidePage {
  id: string;
  title: string;
  text: string;
}

export const GUIDE_PAGES: readonly GuidePage[] = [
  {
    id: 'controls',
    title: 'Controls',
    text: 'Walk: WASD or arrows, or click where to go; on a touch screen drag anywhere (a tap walks there). Use: E or SPACE, or the USE button: picks up, farms, chops, mines, opens, talks. Menus: I bag, K craft, J journal, U Blobbi, N map, L growth, 1 home, ? guide, Y islands; or the buttons in the corner. B build, M move furniture, Q switch tool, T seed or style, F feed, H pet, R rest, Z camera, ESC back.',
  },
  {
    id: 'blobbi',
    title: 'Blobbi care',
    text: 'Your Blobbi has three needs: fed, energy and joy. They fall slowly while you play, never while the game is closed. Feed it food (F, or FEED in the bag), pet it (H) and let it rest (R): it sleeps faster in its bed. Low needs only slow it a little. Friendship grows with care and never goes down; feed it new foods to learn its favourites (BLOBBI panel).',
  },
  {
    id: 'gather',
    title: 'Gathering',
    text: 'Sticks lie under trees, stones by rocks, seeds by bushes and flowers. Walk up and press E (USE). Wild things grow too: fibre by tall grass, mushrooms in shade, berries by bushes, herbs in meadows, shells on the shore. What you pick up grows back after a few minutes of play.',
  },
  {
    id: 'bag',
    title: 'Inventory',
    text: 'The bag (I) holds stacks of everything you carry, each with a limit. Choose an item to EQUIP a tool, FEED a food, PLACE furniture or READ a note. Chests store 16 stacks wherever they stand; storage crates add room to every stack in the bag.',
  },
  {
    id: 'craft',
    title: 'Crafting',
    text: 'CRAFT (K) lists what you can make and what each needs. Tools are made by hand. Furniture and cloth are made at a workbench (5 wood, 3 sticks, 2 stones): stand next to it. New recipes appear as you finish quests.',
  },
  {
    id: 'tools',
    title: 'Tools',
    text: 'Axe (3 sticks, 2 stones): three hits fell a tree for wood; the stump grows back. Pickaxe (2 wood, 2 sticks, 3 stones): four hits break a large rock for stones. Hoe (1 wood, 2 sticks, 1 stone): tills grass into a farm plot. A watering can and a fishing rod come later. Q (or EQUIP) changes what you hold.',
  },
  {
    id: 'build',
    title: 'Building',
    text: 'B (or CRAFT, then BUILD) shows what you would build in front of the Blobbi: green fits, red says why not. E builds it: the materials leave the bag and it rises over a little time. Keep the ground in front of a door open. Fences, flower beds, lanterns, benches and crates unlock with quests.',
  },
  {
    id: 'home',
    title: 'Housing',
    text: 'Your first home is a wooden shelter (6 wood, 3 stones). E at its door goes inside; walk out of the door to leave. HOME (1) shows its level and what the next needs: a Cottage, then a Dream Home, each with more rooms. Upgrading asks first, keeps all your furniture (anything without room goes to the bag) and takes a little building time. Leave room around the house: it grows.',
  },
  {
    id: 'furniture',
    title: 'Furniture and styles',
    text: 'Make furniture at a workbench, then PLACE it from the bag and press E where it fits. M (or HOME, ROOMS, ARRANGE) moves things: E picks up and puts down, T changes its colours, X puts it back in the bag. HOME, LOOK and ROOMS change the roof, walls, door, windows, floors and wallpaper; new styles unlock as you play.',
  },
  {
    id: 'farm',
    title: 'Farming',
    text: 'Hold the hoe and press E on flat grass to till a plot. Face the plot and press E to plant (T picks the seed). A crop grows only while its soil is wet: water it when it shows a drop. When it glints it is ripe: press E to harvest. Crops keep growing across reloads.',
  },
  {
    id: 'cook',
    title: 'Cooking',
    text: 'After your first harvest you can craft a cooking station (8 stones, 2 wood, 2 sticks). Place it and press E at it to cook: meals feed the Blobbi better than raw food. More recipes come with quests.',
  },
  {
    id: 'quests',
    title: 'Quests',
    text: 'The goal box (top right) shows the next step of the story; J opens the journal with every open quest, its hint and its reward. Quests finish by themselves when you have done what they ask, even early. Once you have a home, the island asks for small favours, one at a time.',
  },
  {
    id: 'growth',
    title: 'World growth',
    text: 'The island can grow. GROWTH (L) shows what the next stage needs: harmony, care, harvests, building, finds and a quest. When it is ready, you choose when it grows: new land rises from the Carrier, with new things to find. Nothing you built ever moves.',
  },
  {
    id: 'explore',
    title: 'Exploring',
    text: 'Glinting things are discoveries: press E to pick one up and read its note in the journal. The map (N) shows the places you visited. Your island rides a living World Carrier: at its head, press E to listen to it.',
  },
  {
    id: 'visit',
    title: 'Visiting islands',
    text: 'ISLANDS (Y) lists the other islands in this browser. VISIT sends your Blobbi there: you can walk around and look, but not change anything. GO HOME brings you back. (Visiting works on this device only for now.)',
  },
  {
    id: 'tips',
    title: 'Tips',
    text: 'Tips show one at a time while you learn the basics. SKIP TIPS turns them off for this island; turn them back on here (ENTER) or in SETTINGS.',
  },
];
