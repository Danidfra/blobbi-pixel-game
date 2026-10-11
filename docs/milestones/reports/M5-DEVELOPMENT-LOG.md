# M5 — The Living World: development log

Status: in progress, uncommitted. M4 (Living Island) is also uncommitted and has **not** been manually approved;
M4 and M5 will be validated together. Nothing is pushed or deployed.

## Plan (technical order)

| # | Phase | Brief phases | Depends on |
|---|---|---|---|
| A | Item registry v2: categories, descriptions, icons for every item; data-driven catalogues | 1, content | — |
| B | In-canvas pixel UI framework (menus, keyboard, mouse/touch hit-testing, input capture, pause) + inventory menu | 1, 12 | A |
| C | Containers (real chests) + storage menu with partial transfers | 2 | B |
| D | Placeables: furniture items crafted into the bag and placed from it (indoor/outdoor), workbench, crafting menu | 5 | A, B |
| E | Building management mode: select, move, remove, path/doorway protection | 3 | D |
| F | House interior scene: enter/exit, room, furniture inside, persistence | 4 | D, E |
| G | Cooking station and recipes; food effects on several needs | 8 | D |
| H | Quests (main chapter, side, discovery, repeatable) + journal + lore + discoveries | 6, 7, 11 | G |
| I | Friendship, preferences, deeper autonomy | 9 | H |
| J | Atmosphere: day/night from world time, ambient creatures, weather, sound hooks | 10 | — |
| K | Content expansion to the catalogue targets (crops, furniture, decorations, recipes, tools, nature) | content | all |
| L | Save v7 migration (grows with each phase), dev tools, docs | 13, 15, 16 | all |

Rules kept throughout: turtle and shell variant B untouched; canonical V3 Blobbi untouched; camera modes
untouched; deterministic simulation; no Nostr; no new dependencies; extend systems, never duplicate them.

## Journal

### 2026-10-11 — start
- Baseline: M3.4 committed (`9d0c99f`); M4 uncommitted (255 tests passing).

### Batch 1 — content layer, game UI, placeables, chests, management, interior (P0)
- **A. Content layer.** `src/content/` holds plain data (crops, forage, placeables); `game/items.ts` registers it.
  Items now carry descriptions, menu categories (Materials, Seeds, Food, Tools, Furniture, Special), multi-need
  food effects and pixel icon templates. Duplicate ids throw at load.
- **Crops: 11** (8 food/ingredient crops: turnip, radish, carrot, potato, tomato*, strawberry*, wheat, pumpkin;
  3 flowers: sunflower, tulip, lavender; * multi-harvest). Crop sprites, timings and yields are data.
- **Forage: 5 kinds** (fibre, mushroom, wild berry, wild herb, sea shell), generated after the original nodes
  from their own streams (no existing node moved). Forage never blocks building: it is trampled under a new
  footprint and grows back only where the ground is free again (sticks, stones and seeds still block, as before).
- **B. Game UI** (`src/ui/`): immediate-mode pixel panels with hit regions (mouse and touch), whole-number scale
  that fits the view, a corner menu bar. While a screen is open it takes every key and the world is paused.
  Inventory screen: 7 tabs, icon grid, details, Equip / Feed / Plant / Place actions, full-stack feedback.
- **D. Placeables: 43 kinds** (shelter + 5 M4 decorations + 37 from content): 22 usable indoors, 23 outdoors.
  Crafted into the bag (hand or workbench), placed from it with a preview (T cycles colourways), picked up again.
  Layers: solid / floor (walked over, drawn flat) / open (walked under) / wall (interior back wall).
  Furniture art outlines OUTSIDE the shape so one-pixel details survive.
- **C. Chests**: `game/containers.ts` (atomic partial transfers, distinct-stack capacity); containers keyed by
  `island/<id>` or `room/<shelter>/<id>`; storage screen (all / half / one, store-matching). A chest with items
  cannot be picked up; moving keeps its contents.
- **E. Management** (M): E picks up to move (same id), X back to the bag (refused when it would lose anything; a
  shelter is moved, never removed), T restyle, Esc cancels. Empty plots can be filled in. Solid placements may
  not cut the way to a shelter doorway, a chest/workstation front or the hub (indoors: the door and the bed).
- **F. Interior**: E at the shelter door enters a 128×96 room scene (own collision, nav, brain, particles);
  starter furniture once; wall items; door gap exits to the doorway; the room renderer shares the split-layer
  contract so camera modes and the native Blobbi work indoors. Interiors keyed by shelter id.
- Save schema **7**: variants, interiors, containers, producers (herb planters). 1-6 migrate.
- Tests: 275 passing (+20: ui, placeables). Existing tests adjusted only for new schema/kinds.

Decisions:
- The M4 storage crate keeps its stack bonus (removing it could clamp stacks and lose items); chests and
  cabinets are the real containers.
- E at the shelter now goes inside (M4 showed a bubble). Building mode (B) still pays materials in place, but
  uses a matching bag item first.

### Batch 2 — cooking, quests, journal, lore, discoveries, friendship (P1)
- **G. Cooking**: `content/meals.ts`, **15 meals** (toasted seeds, berry snack, roasted turnip, baked potato,
  carrot soup, vegetable mix, radish salad, bread, mushroom soup, tomato soup, berry porridge, lavender tea,
  strawberry tart, pumpkin stew, harvest feast). Cooking station (E opens the cooking screen); atomic crafting;
  recipes learnt through quests. Food effects now cover hunger, energy and joy; a full Blobbi still accepts a
  drink that is mostly energy/joy (tea) and refuses the rest (no waste).
- **H. Quests**: `content/quests.ts` + `game/objectives.ts` (now the quest engine, same API). Declarative goals
  (tally counts, items owned, finished buildings, decorations, finds, friendship, all/any). Prerequisites form a
  graph, not a line. **16 main quests** (chapter 1 "The First Home": 12, keeping the M4 ids; chapter 2
  "Whispers of the Carrier": 4), **12 side quests**, **3 discovery quests**, **8 repeatable island requests**
  (one at a time, next at the following dawn of world time, never expire).
- **Lore**: `content/lore.ts`, 14 notes (World Carriers, Keepers, the hum, the Carrier Stone...), original and
  game-specific. Delivered by discoveries, quests and listening to the turtle.
- **Discoveries**: 8 finds at deterministic, reachable spots (by terrain), kept 30 px from resource nodes,
  blocking placement while hidden; E picks up first; special items are readable (journal note).
- **The Carrier as companion**: at the shore in front of its head, E "listens": triggers the turtle's own blink
  and glance (no new turtle art or animation), ripples, a line of the hum.
- **I (part). Friendship**: points that only grow (attention, food, favourites, meals, quests, listening), six
  levels; tastes derived from the Blobbi's seed (2 favourite foods, a favourite thing), discovered by trying.
- **Decision (ownership)**: the M3.4 rule "no save names a Blobbi" is kept. Blobbi-specific state (needs,
  friendship, foods tried) is the island's single companion record in the world save, never keyed by identity;
  tastes are computed from the seed at runtime and never stored. Switching Blobbis (a lab feature) keeps it.
- **UI**: journal (quests, notes, finds), Blobbi panel (needs, friendship, tastes, actions), settings (lighting,
  goal box, sound hooks, menu scale; stored per browser, never in a save), cooking screen.
- **Tools**: the watering can (reward of "Water a crop"): waters the target and its two neighbours across the row.
- Fixes found by tests: autonomy's looks no longer count toward quests (only the player's E); discoveries stay
  apart from resource nodes.
- Day/night clock (`game/daylight.ts`): 20-minute days of world time, starting at 7:00; lighting not yet drawn.
- Tests: 288 passing (+13 quests).

### Batch 3 — the living world: light, weather, creatures, deeper autonomy (P2)
- **J. Day and night** (`game/daylight.ts`): 20-minute days of world time from 7:00; light applied at world
  resolution in the view (world, overlay, a tinted copy of the native Blobbi): a cool readable night (darkness
  capped at 0.45), golden dusk and dawn (dawn warmth over by 7:00, so a new game opens exactly as before), warm
  pools around lanterns, wall lanterns and lamps and at the shelter's door. The room's window shows the sky of the
  hour. Off when a caller does not ask for it (camera tests compare against the classic render); on in the game
  (setting "Day and night light").
- **Weather**: about one day in four has a gentle afternoon shower (13-16 h), deterministic from the world seed.
  Rain streaks around the Blobbi, a bubble, and **rain waters dry outdoor crops** (a new, documented cozy rule; not
  counted as the player's watering). **Sprinklers** water dry crops within one cell, once a second.
- **Creatures** (their own random stream, so older ambient sequences are untouched): butterflies by flowers by
  day, birds crossing now and then, fireflies at night.
- **I. Deeper autonomy**: the Blobbi now also looks at what the player built (three times the weight, its
  favourite thing four), watches the sea from the beach, is curious about hidden discoveries within reach (an
  "!" and "what's that?": a gentle hint), comments on crops (ripe / thirsty / growing), sits a long while on
  seats. Autonomous visits are cosmetic only: never a menu, never herbs, never indoors, never the bag (tested).
- Behaviour note: with these new points of interest the brain draws different random numbers than in M4 on a
  fresh island (determinism holds: same inputs, same island). Two long-running behaviour tests got longer windows.
- Tests: 292 passing (+4 atmosphere).

### Batch 4 — tools, upgrades, fishing, dev tools (content + P3)
- **Tools: 9** (simple axe, pickaxe, hoe; watering can; copper axe, pickaxe, hoe, watering can; fishing rod),
  each with held sprites in the anatomical left hand (copper heads drawn in a copper ramp).
- **Upgrades** (`content/tools.ts`): at a workbench, the old tool + copper ore (+ wood) makes the copper one.
  Copper axe: 2 hits; copper pickaxe: 3 hits; copper hoe: tills a row of three; copper can: waters 3×3.
  Taught by the new side quest **"Deeper stone"** (break 3 large rocks), after which large rocks also give
  copper ore (before it, mining is exactly the M3.2 rule: stones only).
- **Fishing**: rod from 3 sticks + 2 fibre (taught by "Listen to the Carrier"). E facing the sea or the pond
  casts; the bite comes after a deterministic 1.5-5 s ("!", the float dips); E within 1.2 s catches, too soon or
  too late it swims off (nothing lost), walking away reels in. **4 fish** (minnow, sea bream, pond perch,
  rainbow fish; sea and pond have different catches). Side quest **"Gone fishing"** (3 catches) teaches
  **4 fish meals** (grilled minnows, fish soup, perch roast, rainbow platter): **19 meals** in all.
- **Dev tools** (dev server only, verified absent from the build): a separate test world, time skips (+1 min,
  +10 min, +1 h, next morning), kits (materials, seeds, food, all tools, all furniture), unlock all quests (no
  items), needs presets, friendship +20, enter/leave the house, Blobbi reactions, quest reset (two clicks), and an
  inspector (time, light, rain, needs, friendship and tastes, brain, scene, active quests, request, hidden finds,
  tally, chest contents, planters, plots).
- Tests: 297 passing (+5 tools).

### Batch 5 — playability: the shore, balance, the whole story played, browser pass
- **A World Carrier has no beach** (its grass meets the shell rim). Found by a balance probe: shells never
  spawned, sea-watching spots were empty, and the sea was out of casting reach (sea bream, fish soup unreachable).
  Now the shore is sand or land within a few pixels of the rim/sea (`isShore`): shells (6-7 per world),
  "beach" discoveries and six sea-watching spots use it, and a cast carries over the rim into the sea (up to 48 px).
- **Balance**: mushrooms 0.14 → 0.24 per tree, fibre 0.08 → 0.11 per grass tuft (cloth is needed for beds,
  rugs, cushions, lamps, toys).
- **The whole story, played** (`playStory` in `src/dev/scripted-play.ts`, after `playLoop`): furnish the house,
  build a stove and cook, find the Carrier Stone, listen to the Carrier, grow sunflowers and decorate. All
  **16 main quests** complete from real actions on turtle-0..3 (tested on turtle-0, with a reload that grants
  nothing again). Scripts press E until an action happens (E always picks up what lies in reach first).
- **Notices** carry their own heading (Quest complete / Side quest done / New request / Request done /
  Discovery / Friendship) instead of always "Goal complete".
- **Settings** controls list wrapped to fit the panel. **Discovery items** registered (8 special items).
- **Browser pass** (dev server, test world `m5-browser-test`, removed afterwards; the existing save on that origin
  verified byte-identical): bag captures movement keys (the Blobbi did not move), Esc closes; K opens crafting;
  B and E build the shelter; "E go inside" enters with the starter furniture; an armchair placed through the
  bag screen in its third colourway; the menu bar opens screens by pointer, X and a press outside close them;
  furniture persisted across a reload; no console errors. Pointer coordinates now come from the client position
  and the canvas rectangle (robust to CSS scaling; a synthetic event exposed a wrong `offsetX`).
- Tests: 299 passing.

### Batch 6 — touch, sound hooks, documentation
- Tap-to-walk (brain `goTo`, a player command that works with autonomy off; keys still take over) and a USE
  button (E) on the menu bar, for mouse and touch. Sound hooks are drained every frame and dispatched as
  `blobbi-sound` window events when enabled (no audio layer yet).
- `REPORT-M5-LIVING-WORLD.md`, ROADMAP and README updated. Images regenerated.
- Final: 300 tests passing, typecheck and build pass; M4 and M5 uncommitted.

## Status and next steps
- **Done**: all P0 and P1 items, P2 (friendship, autonomy, creatures, weather, day/night, sound hooks), P3 (tool
  upgrades, fishing, variants, extra quests, balance).
- **Not done (by choice)**: world-generator variety (tree/flower variants, seasonal looks) to protect the
  approved world visuals; audio itself; house upgrades; furniture grid/rotation; mobile joystick.
- **Next exact task** if work resumes: a small audio layer listening to `blobbi-sound`; then house upgrades via
  `InteriorState.level` (a second room), then chapter 3.
