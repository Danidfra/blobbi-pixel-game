# M5: The Living World

**Status:** implemented and **not committed**. M4 (Living Island) is also uncommitted and has **not** been manually approved; both wait for your gameplay validation. Nothing was pushed or deployed, and no other repository was touched.

| Where | What |
|---|---|
| `M5-DEVELOPMENT-LOG.md` | Development journal, batch by batch |
| `examples/living-world/` | Images (`npx tsx scripts/living-world.ts`) |
| `examples/living-island/` | M4 images (`npx tsx scripts/living-island.ts`) |

## At a glance

| Content | Count | Notes |
|---|---|---|
| Crops | **11** | 8 food or ingredient crops (2 with several pickings) and 3 flowers |
| Furniture and decorations | **43** placeables | 22 usable indoors (17 indoor-only, 5 indoor or outdoor), 26 usable outdoors (21 outdoor-only) |
| Recipes | **66** | 8 tools (incl. 4 copper upgrades), 1 material, 20 furniture, 18 outdoor, **19 meals** |
| Tools | **9** | Simple axe, pickaxe, hoe; watering can; 4 copper upgrades; fishing rod |
| Quests | **33** | **16 main** (chapter 1: 12, chapter 2: 4), **14 side**, **3 discovery**, plus **8** repeatable island requests |
| Lore notes | **14** | |
| Discoveries | **8** | Special items, each with a journal note |
| Forage kinds | **5** | Fibre, mushroom, wild berry, wild herb, sea shell |
| Fish | **4** | |
| Items in all | **115** | 12 materials, 11 seeds, 32 food, 9 tools, 43 furniture, 8 special |
| Tests | **300 passing** | Typecheck and production build pass |

## 1. Implemented systems

### P0: essential gameplay

**Inventory UI (I).** A pixel-art menu drawn in the game canvas.
- Seven tabs: All, Materials, Seeds, Food, Tools, Furniture, Special.
- Icon slots with stack quantities. A full stack shows its count in yellow; the equipped tool has a corner mark.
- A details pane: name, category, quantity against the limit, description, food effects, tool tier.
- One action per item, on Enter or a second click: Equip or Unequip, Feed Blobbi, Plant these, Place, Read.
- Mouse, keyboard and touch all work.
- The menu reads the live inventory directly; there is no second copy of the state.

**Storage chests.**
- A wooden chest holds 16 stacks and a cabinet 24, each with its own inventory, keyed by its stable placed id.
- Transfers move all, half or one, plus "store matching", which tops up stacks the chest already holds.
- Every transfer is atomic and partial (`game/containers.ts`), so items are never duplicated or lost.
- Contents survive reloads and survive moving the chest.
- A chest that holds items can't be picked up ("empty it first").
- The M4 storage crate keeps its stack bonus. Removing that bonus could clamp stacks and lose items.

**Building management (M).**
- **E** picks the selected object up to move it. It keeps the same id, so a chest keeps its contents and a shelter its interior.
- **X** puts it back in the bag. This is refused, with the reason, whenever something would be lost; a shelter is moved but never removed.
- **T** cycles the colourway, and indoors with nothing selected it restyles the room.
- **Esc** cancels and puts the object back where it was.
- Previews reuse the placement checks.
- Navigation updates after every change.
- Empty farm plots can be filled in.
- Path protection: a solid placement may not cut the Blobbi off from a shelter doorway, a chest or workstation front, or the hub; indoors, the door and the bed.

**House interior.**
- **Entering:** E at a finished shelter's door goes inside. The room is a separate 128×96 scene with log walls, a window showing the sky of the hour, a plank floor with a pool of sunlight, a door gap and a doormat.
- **Starter furniture:** a bed, table, chest, wall lantern and rug, placed once.
- **Systems:** the room has its own collision, navigation, autonomy and particles. The camera modes and the native 12/24/48 px Blobbi work exactly as outside.
- **Leaving:** walking into the door gap returns the Blobbi to the shelter's doorway.
- **Saving:** furniture positions, room style and a `level` field (ready for house upgrades) are saved per shelter id.

**Functional furniture.** Each piece has a use, which E triggers:

| Use | Pieces |
|---|---|
| Storage | Chest, cabinet |
| Cook | Cooking station |
| Craft | Workbench |
| Sit | Chairs, armchair, stool, benches, log seat, hay bale |
| Sleep | The bed (the Blobbi walks to it and sleeps, recovering twice as fast) |
| Nap | The Blobbi cushion |
| Read | Bookshelf, signpost |
| Music | Music box, wind chime |
| Play | Toy ball |
| Light | Lanterns, lamps |
| Time | The clock tells the time of day |
| Herbs | The herb planter grows a herb every 4 minutes, up to 3 |
| Sprinkle | The sprinkler waters dry crops within one cell |
| Birds | Bird bath, bird feeder |
| Admire | The rest |

### P1: content and progression

**Crops.**
- Turnip, radish, carrot, potato, tomato (3 pickings), strawberry (4 pickings), wheat and pumpkin, plus sunflower, tulip and lavender.
- Each has its own growth time (60 to 240 s of wet growth), yield (1 to 4) and pixel sprites.
- Picked plants stay full-grown and need water again. Seeds come back on the last picking.

**Forage.** Fibre, mushrooms, wild berries, herbs and shells grow back over world time.
- Each comes from its own random stream, so no existing node moved.
- Forage never blocks building: it's trampled under a new footprint.

**Crafting (K).**
- Tabs: Tools, Materials, Furniture, Outdoor, Build. The Build tab lists the buildings that B builds in place.
- Ingredients show have/need with icons, and each recipe shows where it's made (in hand or at a workbench).
- Locked recipes stay hidden, with a count of how many are left to discover.

**Cooking.** E at a cooking station opens the stove.
- 19 meals restore fullness, energy and joy in different mixes.
- Recipes are learnt through quests.
- Crafting is atomic, so a full stack refuses and nothing is consumed.
- Feedback: steam, the Blobbi smelling it, and a sound hook.

**Quests (J).** Data-driven goals (`content/quests.ts`) evaluated by `game/objectives.ts`:
- Goals read tally counts, items owned, finished buildings, decorations, finds and friendship.
- Prerequisites form a graph rather than a single line, so farming and building progress side by side.
- Each reward is granted exactly once: items, plans, journal notes, friendship.
- Island requests:
  - One request at a time, after the shelter is built.
  - Progress counts from when the request begins.
  - The next request comes at the following in-game dawn.
  - Requests never expire, so a missed day costs nothing.

**Lore and discoveries.**
- 14 original notes about World Carriers, Keepers, the hum and the Carrier Stone.
- 8 finds at deterministic, reachable spots chosen by terrain. They glint, block building while hidden, and are picked up before anything else.
- **The Carrier as companion:** at the shore in front of its head, E "listens". This triggers the turtle's own existing blink and glance (no new turtle art or animation), plus ripples and a line of the hum.

### P2: the living world

**Friendship and tastes.**
- Friendship points only grow, from attention, food, favourites, meals, quests and listening. There are six levels, from "new friends" to "inseparable".
- Each Blobbi has 2 favourite foods and a favourite thing, derived from its seed and discovered by trying. A favourite is a bigger treat.
- The Blobbi panel (U) shows needs, friendship and tastes.

**Deeper autonomy.**
- **New things it looks at:**
  - What the player built, weighted higher, with its favourite thing highest.
  - Growing crops: it comments "ripe!", "thirsty" or "growing nicely".
  - The sea, from shore spots.
  - Hidden discoveries close by, with an "!" and "what's that?", a gentle hint.
- **Seats:** it sits a long while on them.
- **Rest:** it sleeps in its bed indoors.
- **Strictly cosmetic:** it never opens a chest, cooks, picks herbs, goes indoors or touches the bag (tested).

**Day and night.**
- 20-minute days of world time; a new game starts at 7:00, looking exactly as before.
- **Readable night:** a cool blue, with darkness capped at 0.45 and warm pools of light around lanterns, lamps and the shelter door.
- A golden dusk.
- Presentation only, and it can be switched off in Settings.

**Weather.** About one day in four has a gentle afternoon shower, deterministic from the world seed. Rain waters dry outdoor crops (a new, documented cozy rule; it doesn't count as the player's watering).

**Creatures.** Butterflies by flowers, birds crossing, fireflies at night. They use their own random stream, so older ambient behaviour is unchanged.

**Sound hooks.** World events (`pickup`, `harvest`, `craft`, `cook`, `place`, `door`, `quest`, `discover`, `hum`, `catch`, `eat`, `friend` and others) are dispatched as `blobbi-sound` window events for a future audio layer. There is no audio yet, and Settings can turn the hooks off.

### P3: polish

**Tools.**
- The watering can waters a crop and its two neighbours across the row.
- Copper upgrades are made at a workbench from the old tool plus copper ore. Copper ore appears in large rocks only after the side quest "Deeper stone".

  | Copper tool | Improvement |
  |---|---|
  | Axe | Fells a tree in 2 hits |
  | Pickaxe | Breaks a rock in 3 hits |
  | Hoe | Tills a row of 3 cells |
  | Watering can | Waters a 3×3 patch |

**Fishing.**
- Cast with E at the sea (over the shell's rim) or at the pond.
- The bite comes after a deterministic 1.5 to 5 s, shown by an "!" and a dipping float. E within 1.2 s catches the fish.
- Too soon or too late, the fish swims off; nothing is lost.
- 4 fish, with different catches in the sea and the pond, and 4 fish meals.

**Game UI.**
- **Menu bar:** USE, BAG, CRAFT, JOURNAL, BLOBBI and settings buttons in the corner, for mouse and touch.
- **HUD:** the goal box moves under the HUD on narrow screens.
- **Prompts:** what E will do, with a verb per use.
- **Notices:** each carries its own heading.
- **Panels:** whole-number scale that fits the viewport.
- **Input:** menus pause the world and capture every key.
- **Touch:** tap the world to walk there.

**Settings (Esc).** Day/night lighting, goal box, sound hooks and menu scale, stored per browser and never in a save.

## 2. Controls

| Key | Action |
|---|---|
| WASD / arrows | Move (always overrides autonomy; wakes a sleeping Blobbi) |
| E / Space | In this order: pick up a discovery, then a resource, then farm (harvest, water, plant, till), chop, mine, fish, or use what's in front (door, chest, stove, bench, bed...) |
| I / K / J / U | Bag / crafting / journal / Blobbi panel |
| Esc | Leave a mode (moving, placing, managing, building), or open settings |
| F / H / R | Feed / pet / rest (R again wakes) |
| T | Next seed; while placing, the colourway; in move mode, restyle |
| B | Build mode (cycles shelter and decorations) |
| M | Move mode: E move, X back to the bag, T restyle |
| Q | Switch tool |
| C / V / G | Craft axe / pickaxe / hoe directly |
| Z / O / P | Camera mode / goal box / plant a tree |

- **In menus:** arrows or WASD move, Q, E or Tab switch tabs, digits jump to a tab, Enter acts, Space moves one item (storage) and H moves half.
- **Mouse and touch:** the corner menu bar opens screens, USE presses E, and a tap in the world walks there.

## 3. Recipes

### Tools
- Simple axe: 3 sticks + 2 stones (hand)
- Simple pickaxe: 2 wood + 2 sticks + 3 stones (hand)
- Simple hoe: 1 wood + 2 sticks + 1 stone (hand)
- Fishing rod: 3 sticks + 2 fibre (hand; learnt in "Listen to the Carrier")
- Copper upgrades at a workbench, learnt in "Deeper stone":
  - Copper axe: simple axe + 3 ore + 2 wood
  - Copper pickaxe: simple pickaxe + 4 ore + 2 wood
  - Copper hoe: simple hoe + 3 ore + 1 wood
  - Copper watering can: watering can + 4 ore
- The watering can itself is the reward for "Water a crop".

### Materials
- Cloth: 2 fibre (workbench)

### Workstations and storage
- Workbench: 5 wood + 3 sticks + 2 stones (hand)
- Wooden chest: 6 wood + 2 stones (hand)
- Cooking station: 8 stones + 2 wood + 2 sticks (hand; learnt in "Harvest food")
- Cabinet: 8 wood + 2 stones (workbench; learnt in "A place for everything")

### Furniture (workbench)

| Piece | Cost | Learnt in |
|---|---|---|
| Bed | 6 wood + 3 cloth | Shelter |
| Wooden chair | 3 wood + 2 sticks | Shelter |
| Stool | 2 wood + 1 stick | Shelter |
| Small table | 4 wood | Shelter |
| Round rug | 4 cloth | Shelter |
| Potted plant | 2 stones + 1 seed | Shelter |
| Wall lantern | 1 wood + 2 stones + 1 stick | Shelter |
| Blobbi cushion | 3 cloth + 1 wood | Feed Blobbi |
| Armchair | 4 wood + 3 cloth | Feed Blobbi |
| Toy ball | 2 cloth + 1 fibre | Feed Blobbi |
| Dining table | 7 wood + 2 sticks | A warm meal |
| Bookshelf | 6 wood + 1 cloth | Listen to the Carrier |
| Wall shelf | 3 wood + 2 stones | Make it home |
| Floor lamp | 2 wood + 2 stones + 2 cloth | Make it home |
| Carrier painting | 2 wood + 1 cloth + 1 sunflower | Something that hums |
| Wall clock | 3 wood + 1 stone + 1 shell | Shell seeker |
| Flower vase | 2 stones + 2 tulips | Flower friend |
| Music box | 3 wood + 2 shells | A message from far away |

### Outdoor
- **In hand, known from the start:**
  - Stone path ×2: 2 stones
  - Boardwalk ×2: 1 wood
  - Stone cairn: 4 stones
  - Log seat: 3 wood
- **At the workbench:**

  | Piece | Cost | Learnt in |
  |---|---|---|
  | Picket fence | 3 wood | Make it pretty |
  | Low stone wall | 5 stones | Make it pretty |
  | Signpost | 2 wood + 1 stick | Make it pretty |
  | Bird bath | 6 stones | Make it pretty |
  | Bird feeder | 3 wood + 1 stick + 2 seeds | Make it pretty |
  | Flower arch | 3 wood + 2 sticks + 3 fibre | Make it pretty |
  | Scarecrow | 3 sticks + 2 cloth + 1 wheat | Plant a seed |
  | Hay bale | 4 wheat + 1 fibre | Harvest food |
  | Herb planter | 4 wood + 2 herbs | A warm meal |
  | Sprinkler | 4 stones + 2 wood + 1 shell | Green thumb |
  | Wind chime | 2 sticks + 3 shells | Shell seeker |
  | Blobbi statue | 8 stones | Best friends |

- **Built in place with B, as in M4** (each now also has a bag item, so it can be picked up and placed again):
  - Shelter: 6 wood + 3 stones
  - Fence: 2 wood
  - Flower bed: 1 wood + 2 seeds
  - Lantern: 1 wood + 2 stones + 1 stick
  - Bench: 3 wood + 1 stick
  - Storage crate: 4 wood + 2 sticks

### Meals (cooking station)

| Meal | Ingredients | Fed / energy / joy | Learnt in |
|---|---|---|---|
| Toasted seeds | 3 seeds | 12 / – / 2 | Known |
| Berry snack | 3 wild berries | 20 / – / 8 | Known |
| Roasted turnip | 1 turnip | 40 / – / 3 | Known |
| Baked potato | 1 potato | 45 / 5 / – | Known |
| Carrot soup | 2 carrots + 1 herb | 50 / 5 / 5 | A warm meal |
| Vegetable mix | turnip + carrot + radish | 55 / – / 6 | A warm meal |
| Radish salad | 2 radishes + 1 herb | 30 / 8 / 6 | A warm meal |
| Bread | 2 wheat | 30 / 5 / – | Little chef |
| Mushroom soup | 2 mushrooms + 1 potato | 50 / 15 / – | Little chef |
| Tomato soup | 2 tomatoes + 1 herb | 45 / – / 8 | Little chef |
| Berry porridge | 2 wheat + 1 strawberry | 45 / 15 / 4 | Little chef |
| Lavender tea | 2 lavender | 5 / 25 / 8 | Lavender fields |
| Strawberry tart | 1 bread + 2 strawberries | 35 / – / 15 | Baker |
| Pumpkin stew | pumpkin + potato + herb | 80 / 15 / 5 | Baker |
| Harvest feast | pumpkin + 2 tomatoes + bread + mushroom | 100 / 25 / 25 | Begin restoring the island |
| Grilled minnows | 2 minnows | 35 / 5 / – | Gone fishing |
| Fish soup | sea bream + potato + herb | 55 / 15 / 3 | Gone fishing |
| Perch roast | pond perch + tomato | 55 / – / 6 | Gone fishing |
| Rainbow platter | rainbow fish + 2 strawberries | 60 / 10 / 25 | Gone fishing |

## 4. Quest catalogue

### Chapter 1: "The First Home"

| # | Quest | Goal | Requires | Reward |
|---|---|---|---|---|
| 1 | Look around | Press E on 3 things | – | Note "A small island" |
| 2 | Meet your Blobbi | Pet it once | – | Note "Your Blobbi", friendship |
| 3 | Gather supplies | 5 pickups | – | +2 seeds |
| 4 | Your first tool | Craft an axe | Gather | Fence plans |
| 5 | Gather wood | Fell a tree | Axe | +2 stones |
| 6 | Build a shelter | Finish the shelter | Wood | +3 seeds, house furniture plans |
| 7 | Prepare a farm plot | Till a plot | Wood | +3 carrot seeds |
| 8 | Plant a seed | Plant | Plot | Flower bed plans, +3 radish seeds |
| 9 | Water a crop | Water | Plant | +2 seeds, the watering can |
| 10 | Harvest food | Harvest | Water | +2 pumpkin seeds, +2 seed potatoes, stove plans |
| 11 | Feed Blobbi | Feed it | Harvest | Lantern, bench and cozy furniture plans |
| 12 | Make it home | Place 2 pieces of furniture inside | Shelter | +3 cloth, +2 tomato seeds, note "World Carriers" |

### Chapter 2: "Whispers of the Carrier"

| # | Quest | Goal | Requires | Reward |
|---|---|---|---|---|
| 13 | A warm meal | Cook a meal | Harvest | +3 wheat seeds, recipes |
| 14 | Something that hums | Find the Carrier Stone | Home | Painting plan |
| 15 | Listen to the Carrier | Listen at the shore | Something that hums | Note "The hum", +3 sunflower seeds, bookshelf and fishing rod plans |
| 16 | Begin restoring the island | 3 flowers harvested + 3 decorations | Listen to the Carrier | 2 notes, the harvest feast |

### Side quests (14)

| Quest | Goal | Reward |
|---|---|---|
| Make it pretty (M4's "improve") | Place 2 decorations | Storage crate and garden decoration plans |
| A place for everything | Store 20 items in chests | Cabinet plans, +2 cloth |
| Shell seeker | Pick up 6 shells | Wind chime and clock plans, +2 strawberry runners |
| Flower friend | Harvest 3 flowers | Vase plans, tulip bulbs, lavender seeds |
| Green thumb | Harvest 10 crops | Sprinkler plans, +2 tomato seeds |
| Little chef | Cook 3 meals | Bread, soups and porridge recipes |
| Baker | Cook 8 meals | Tart and stew recipes |
| Lavender fields | Harvest 6 flowers | Lavender tea recipe |
| Best friends | Friendship level 3 | Blobbi statue plans |
| Forager | Gather 15 wild things | Seed potatoes, a strawberry runner |
| Cozy corner | Place 5 pieces inside | +4 cloth |
| Deeper stone | Break 3 large rocks | Copper ore from then on, copper upgrade plans |
| Gone fishing | Catch 3 fish | Fish recipes |
| A favourite treat | Feed a favourite food | Friendship |

### Discovery quests (3)
- A message from far away: find the bottle.
- The Keeper's pages: find both journal pages.
- Collector: find all 8 discoveries.

### Island requests (8, repeatable)

| Request | Goal | Reward |
|---|---|---|
| Tidy up some sticks | 6 pickups | 2 seeds |
| Water the garden | Water 4 times | 2 radish seeds |
| Bring in the harvest | Harvest 3 crops | 1 cloth + 2 seeds |
| Cook something nice | Cook 1 meal | 2 wheat seeds |
| Spend time with Blobbi | Pet 3 times | 1 tulip bulb |
| A walk in the wild | Gather 5 wild things | 1 seed potato + 1 carrot seed |
| Firewood | Fell 1 tree | 3 stones |
| A snack for Blobbi | Feed 2 times | 1 strawberry runner |

**Timescales:**

| Timescale | What the player is doing |
|---|---|
| Seconds to minutes | Pickups, prompts, petting, cooking |
| 5–15 minutes | Axe, shelter, first harvest, first furniture |
| 20–60 minutes | Chapter 1 complete, cooking, chapter 2, side quests, copper tools, fishing |
| Several sessions | Collector, Baker, friendship levels 4–6, island requests, decorating |

## 5. Furniture and decoration catalogue (43)

| Group | Pieces |
|---|---|
| Workstations and storage (indoor or outdoor) | Workbench, wooden chest, cooking station; cabinet (indoor) |
| Indoor (17) | Bed (5 colours), Blobbi cushion (5), wooden chair, armchair (5), stool, small table, dining table, bookshelf, wall shelf, Carrier painting (2), wall clock, wall lantern, floor lamp (5), round rug (5), flower vase (3), music box, cabinet |
| Indoor or outdoor | Potted plant (3: fern, cactus, flowering bush), toy ball (5) |
| Outdoor (21) | Fence, flower bed, small lantern, wooden bench, storage crate (M4); picket fence, low stone wall, stone path, boardwalk, signpost, scarecrow (5), bird bath, stone cairn, log seat, sprinkler, bird feeder, flower arch (4), Blobbi statue, herb planter, wind chime, hay bale |

- **Layers:**
  - Solid: blocks walking.
  - Floor: walked over and drawn flat (rugs, paths, the cushion, the toy ball).
  - Open: walked under (the flower arch).
  - Wall: hangs on the interior's back wall.
- **Art:** in the world palette, with the outline drawn outside the shape so one-pixel details survive.

## 6. Save changes: schema 7

- **New fields:**
  - Building `variant`.
  - `interiors`, by shelter id: furniture in room coordinates, style and level.
  - `containers`, by container key `island/<id>` or `room/<shelter>/<id>`.
  - `producers`: herb-planter timers.
  - `companion`: friendship and foods tried.
  - `found`: discoveries.
  - `objectives`, now the full quest state: completed quests, the active request, how many requests are done, when the next is due, and journal notes.
  - Extra tally counters.
- **Migration:** schema 1–6 records migrate with none of these fields. Interiors are furnished on first entry.
- **Ownership** (a deliberate decision, documented in the log):
  - The M3.4 rule "no save names a Blobbi" is kept.
  - Blobbi-specific state (needs, friendship, foods tried) is the island's single companion record, never keyed by identity.
  - A Blobbi's tastes are computed from its seed at runtime and never stored.
  - Switching Blobbis, a lab feature, keeps the world record byte-identical. This is tested.
- **Robust loading:** malformed sections (plots, buildings, interiors, containers, tally, quests) are each dropped on their own, never half-read. Unknown quest and building ids are ignored.

## 7. Screenshots

| File | Content |
|---|---|
| `examples/living-world/catalogue-placeables.png` | All 42 placeables besides the shelter (indoor on wood, outdoor on grass) |
| `examples/living-world/catalogue-crops.png` | 11 crops × 5 stages on their plots |
| `examples/living-world/catalogue-items.png` | All 115 item icons by category |
| `examples/living-world/home-closeup.png` | A furnished house in close-up |
| `examples/living-world/screens.png` | Bag, crafting, journal, Blobbi, storage, settings |
| `examples/living-world/island-day-rain-dusk-night.png` | The island at 9:00, a rainy 14:30, dusk 18:48, night 22:30 |
| `examples/living-island/*` | M4 sprites, loop and camera modes (regenerated) |

## 8. Test results

- **`npm run check`:** typecheck passes, **30 files, 300 tests pass**, and the build passes (513 kB, 176 kB gzipped; it was 373 kB / 131 kB after M4, the difference being the new content, UI and art).
- **New suites:**

| Suite | Covers |
|---|---|
| `ui` | Icons for every item, input capture, keyboard and pointer actions, panel fit, tap-to-walk, the USE button |
| `placeables` | Catalogue integrity; crafting, unlocks and stations; placement, layers and styles; chests (transfers, capacity, persistence, independence, removal refusal, moving keeps contents); management (move, cancel, restyle, shelter rules, path protection); interior (enter, exit, starter furniture, persistence across a shelter move, sleeping in the bed); the crafting screen |
| `quests` | Catalogue integrity (references, no cycles, unlocks); parallel quests; rewards once across reloads; journal never counts; requests (start, baseline, dawn, never expire); discoveries (stable, reachable, block building, pick-up); listening; cooking; meal effects; friendship and tastes; the M3.4 no-Blobbi-in-save rule; day/night bounds; ingredient reachability; **the whole story played on turtle-0** |
| `atmosphere` | Rain and light; rain and sprinkler watering; creatures by day and night; deterministic particles; autonomy never opening, cooking or picking |
| `tools` | Tool sprites and upgrades; ore gating; copper hits; hoe row and can patch; fishing (too soon, catch, late, walk-away); fish meals; Carrier worlds provide shells, shore and the sea |

- **Updated existing tests** (schema and new content only):
  - Schema assertions: version 7 and the new key list.
  - The M2 gathering test accepts forage kinds.
  - The building test's placement context ignores forage, as the game now does.
  - The M4 objective tests use the quest engine.
  - Two long autonomy windows were extended.
  - All approved-visual regression tests are unchanged and pass: turtle anatomy hashes, Blobbi sprite hashes, camera modes, walking jitter, equipment, mining, shelter, old saves.
- **Performance:** a furnished island renders in the same time per frame as M3.4 measured on this machine with the same script (about 2.7 ms against 3.5 ms at 960×540, exploration mode). The simulation step is about 0.01 ms.
- **Browser pass:** on the dev server with a separate test world (removed afterwards; the existing save on that origin was verified byte-identical). Verified:
  - Bag input capture, crafting and build mode.
  - Entering the house and placing furniture through the bag.
  - Pointer and menu-bar input.
  - Persistence across a reload.
  - No console errors.

## 9. Known limitations

- **Turtle and world:**
  - No new tree or flower variants and no seasonal looks in the world generator. This is deliberate, to protect the approved world visuals; variety comes from forage, crops, flowers and decorations.
  - The turtle is a companion only through listening, which uses its existing blink and glance animations.
- **Audio:** sound is hooks only; nothing plays yet.
- **Interior:**
  - One room per shelter. The `level` field is saved, but there are no house upgrades yet.
  - The window always shows the sky colour; there are no stars.
- **Furniture:** placement is "in front of the Blobbi". There's no grid snapping for furniture (only plots are grid-aligned) and no rotation.
- **Fishing:** catches are deterministic per cast count within a session, so the sequence restarts after a reload. That's by design: nothing is lost and nothing can be exploited.
- **Island requests:** they progress only through the player's own tallies. There's a pool of 8; they repeat in a fixed order.
- **Touch:** tap-to-walk plus the USE button. There's no on-screen joystick, and menus are usable but sized for desktop first.
- **Behaviour:** the new points of interest change which random numbers autonomy draws on a fresh island compared with M4. The simulation stays deterministic given the same inputs.
- **Testing method:** browser testing in the automation tab used a dev-only `frame()` hook, because the hidden tab has no animation frames. Real-time pacing still needs your manual pass.
- **Not implemented, by design:** Nostr, multiplayer, multiple Blobbis, island expansion, monetisation, combat and survival.

## 10. Remaining features (next steps)

1. Audio: a small sound layer listening to `blobbi-sound`.
2. House upgrades: a second room or a bigger room using `level`, and wallpaper and floor styles from the workbench.
3. A furniture grid with rotation, and a decoration catalogue browser with previews.
4. Seasons, or seasonal palettes, behind a setting, after visual approval.
5. More quests in chapter 3 ("Another Carrier?") and requests linked to the Blobbi's favourites.
6. A mobile joystick and larger touch targets.

## 11. Manual testing checklist

**Your existing saves:**
- Start from a **new world seed** (World tab, then Regenerate), or use the dev tools' **Test world** button, so your existing saves are not migrated.
- Optionally, afterwards, load an old M3/M4 world. It should load, with goals already earned completing (and notifying) on the first frames.

**First 30 minutes:**
1. Goal "Look around": E on a tree, a flower and a rock. A journal note arrives (J, Notes).
2. H pets the Blobbi (Meet your Blobbi).
3. Collect 5 things, craft an axe (C or K), fell a tree, build the shelter (B, E). Each quest gives a notice and its reward. The journal shows two quest lines running in parallel.
4. Hoe (G), till, plant (T picks the seed), water, harvest. Rain on an afternoon waters crops by itself.
5. Feed the Blobbi (F, or Feed in the bag). Watch the "my favourite!" reaction when you find one of its favourites (U shows them after tasting).

**Home and furniture:**

6. Craft a workbench (K) and place it from the bag (I, Place, E). At the workbench the furniture tab opens.
7. Enter the shelter (E at the door). Place a chair, the rug and wall items; T changes colours while placing; M moves things (E, then E), and X puts them back in the bag.
8. Open the chest (E). Store all / half / one; "store matching". Try to pick up a full chest: refused.
9. R near the bed or indoors: the Blobbi walks to the bed and sleeps.

**Cooking, quests and exploration:**

10. Build a stove after the harvest quest, then cook toasted seeds or a roasted turnip. Steam appears and "A warm meal" completes.
11. Explore: something glinting (the Blobbi gets curious nearby). Find the Carrier Stone, then listen at the shore near the turtle's head (E). The turtle blinks and glances, and the hum shows.
12. Chapter 2: grow sunflowers, place 3 decorations, and the harvest feast unlocks.
13. Side quests: shells along the rim, mine 3 rocks for copper ore and upgrades, craft a fishing rod and fish (wait for the "!"), and use the island requests (one at a time, at dawn).

**Living world:**

14. Dev tools "+1 h" / "Morning": dusk, night (lantern pools, fireflies), rain, birds and butterflies.
15. Menus: while a menu is open, WASD and E do nothing in the world and the island is paused. Clicks and taps work, a click outside closes the menu, and the bottom-right menu bar works. Settings (Esc) toggles lighting, the goal box, sound hooks and menu scale.
16. Tap the world: the Blobbi walks there.

**Regression look:**

17. Turtle head, flippers and shell (variant B) unchanged.
18. The Blobbi's V3 look and its neutral face when comfortable.
19. Tools held in the left hand.
20. Walking smooth at 2× and 4×.
21. Camera modes (Z), with 12/24/48 px native Blobbi indoors too.
