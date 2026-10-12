# Gameplay systems

The game as the player meets it, system by system, with the numbers the code uses. Every system here is
**IMPLEMENTED** in code with automated tests and **NOT TESTED** by a person (see
[the manual test plan](../testing/MANUAL-TEST-PLAN.md)). Detailed behaviour, data and edge cases are in the
[specifications](../specifications/).

### Controls (Play mode)

| Key | Action | Source |
|---|---|---|
| WASD / arrows | move (autonomy resumes 5 s after the last input) | `src/playground/main.ts`, `src/sim/brain.ts` |
| E / Space | the context action: pick up, harvest / water / plant / till, chop, mine, fish, use, enter a door, listen to or open the Carrier | `LiveWorld.step` |
| Click / tap the world | walk there (tap-to-walk); drag on touch: floating stick | `src/ui/touch.ts` |
| I · K · J · U · N · L · Y · 1 · ? / F1 | bag · crafting · journal · Blobbi panel · map · island growth · worlds · home (M8) · guide (M8) | `OPEN_KEYS` in `src/ui/game-ui.ts` |
| Esc | leave a mode (move, place, manage, build), else settings; in a menu: back | `src/ui/game-ui.ts` |
| F · H · R | feed · pet · rest (R again wakes) | `src/playground/main.ts` |
| T | next seed (farming), or the style of what is placed / managed | idem |
| Q | cycle the tool in hand | idem |
| C · V · G | craft an axe · a pickaxe · a hoe | idem |
| B | build mode (cycles buildings and decorations) | idem |
| M | management mode (move, restyle, pick up placed things); X/Delete puts the selected one back in the bag | idem |
| P | plant a tree (the M1 sapling) | idem |
| Z, mouse wheel, tap the camera indicator | camera: overview 1×, exploration 2×, close-up 4×, up close 6× (M10, compact HUD) | `src/render/view-camera.ts` |
| O | hide or show the goal box | idem |

Menus pause the world and take every key; mouse and touch work in every menu. M8: the menu bar (and, in build,
place and move modes, a mode bar with NEXT, STYLE, TO BAG, DONE, CANCEL) gives every action a button, larger and
without key names once touch is used; tips teach the basics ([tutorial](../specifications/TUTORIAL.md)); the HOME
panel holds upgrades and styles ([housing](../specifications/HOUSING.md)).

### Gathering and forage

Sticks under trees, stones by rocks and on the forest floor, seeds by bushes and flowers; forage: fibre by grass
tufts, mushrooms in tree shade, berries by bushes, herbs in meadows, shells on the shore. E picks up what lies in
reach first (reach 11 px). Collected nodes grow back after a time of world time (120–180 s for the basics, per kind
for forage). Node ids are stable, so the save lists what is gone. Sources: `src/game/resources.ts`,
`src/content/forage.ts`.

### Tools, crafting and upgrades

Tools: axe (chop trees: 3 hits, a stump, wood, regrowth), pickaxe (mine large rocks: 4 hits, rubble, stones and
sometimes copper ore, regrowth), hoe (till farm plots), watering can, fishing rod; copper upgrades at a workbench
(the old tool goes into the recipe). The tool is visibly held in the Blobbi's hand (`src/game/equipment.ts`).
Crafting is atomic (`src/game/crafting.ts`): it checks every ingredient and the room for the output first. Locked
recipes stay hidden until a quest teaches them. Counts: [content catalogue](CONTENT-CATALOG.md).

### Cooking

Meals are made at a cooking station from farm produce and forage; each is a food that restores hunger and some
energy and joy. The first few are known with a station; others are taught by quests. Source: `src/content/meals.ts`.

### Farming

Till a plot (8 px grid tile) with the hoe, plant a seed, water it; a crop grows only while the soil is wet, through
five stages (seeds, sprout, young, growing, mature), and is harvested into food (some crops regrow). A dry crop
simply waits; nothing wilts. See [Farming](../specifications/FARMING.md).

### Building, decorations and housing

A wooden shelter (6 wood, 3 stones, 24 world seconds to build) and decorations and furniture from the placeables
catalogue; placement is checked (ground, water, overlap, doorways, paths); management mode moves, restyles and picks
things up again. E at the shelter's door goes inside: a room with furniture from the bag, styles, wall items and a
bed. See [Building](../specifications/BUILDING.md) and [Housing](../specifications/HOUSING.md).

### Care and friendship

Needs, each 0–100 where 100 is good (`src/game/care.ts`): fed (falls about 0.06/s), energy (falls 0.08/s awake,
0.11/s walking; rest restores 1.5/s, 3/s in a shelter), joy (drifts to a floor of 40, or 20 when hungry or tired).
A hungry or exhausted Blobbi only walks a little slower; nothing worse happens. Food above 95 fed is refused (no
waste). Friendship (`src/game/friendship.ts`) only grows: pet +1 (8 s cooldown), feed +2, a favourite +5, a meal +3,
rest +2, a quest +3; levels at 0, 15, 45, 100, 180 and 300 points. Each Blobbi has two favourite foods and a
favourite kind of thing from its own seed.

**Rest (M9).** R (or BLOBBI → REST, or E at a bed) means bed:
- *Outside:* the Blobbi walks to the nearest finished house, goes in through its door (the usual way in, no jump),
  walks to the nearest bed it can reach (a bed or a Blobbi cushion) and climbs in with a short hop (0.45 s).
- *Inside:* straight to the nearest reachable bed (before M9 it stopped on the floor below the bed).
- *In bed:* tucked in — the bed is drawn behind it and the blanket in front, eyes closed, little z's; it recovers at
  the sheltered rate (3/s). The prompt says R to wake up.
- *Waking* (R again, rested, or any movement key): a hop back out to the front of the bed, then free to walk.
- *Edge cases:* a bed moved or picked up on the way is chosen again; no house, no reachable house or no bed: a nap
  where it stands; a key on the way home ends the plan; a reload starts awake outside (rest is not saved; needs
  are). On its own, a tired Blobbi still naps in the doorway outside (no surprise trip indoors) and climbs into bed
  when it is already inside.
- Source: `LiveWorld.rest`, `stepRestPlan`, `goToBed`, `inBed`; drawing in `src/render/interior-render.ts`; tests
  `tests/rest.test.ts`.

### The World Carrier

Listen (E at the shore by its head), then — once the "Listen to the Carrier" quest is done — the Carrier panel:
greet, observe, offer a food or flower, rest by its head; standing still there lets the Blobbi feel the island
breathe. Island harmony (0–100, five levels) only grows. See [World Carriers](../architecture/WORLD-CARRIERS.md).

### Exploration

A map (N) of the island with the Blobbi, home, buildings, farm, visited places and found discoveries (never what is
still hidden); click the map to walk there. Named places (the Carrier's head, the pond, the grove, the meadow, the
cliff, the tail end, and one per grown region) give a notice when first visited. The journal (J) has quests, notes,
finds, places and the Carrier's observations. Sources: `src/ui/screens/map.ts`, `src/game/places.ts`,
`src/ui/screens/journal.ts`.

### Fishing

With a rod, E facing the sea (up to 48 px over the shell's rim) or the pond casts; a bite comes after 1.5–5 s and
must be reeled in in time; the catch is drawn by weight from that water's fish. Manta worlds have no sea fishing in
reach (their sea is beyond the body); the pond works. Source: `LiveWorld.fish`, `src/content/tools.ts`.

**The cast (M10):** the rod is wound back (0.22 s), swung (to 0.4 s), then held out over the water; the float flies
from the rod's tip on an arc and lands at 0.78 s with a ring (`CAST`). The line is drawn from the rod's tip as drawn
(every orientation of the rod marks its tip) to the float, in the rod's layer: behind the Blobbi when the rod is (the
far hand, or facing away), in front otherwise; slack while waiting, taut on a bite, when the rod tugs. Source:
`src/game/equipment.ts` (`ROD`, `attachTool().tip`), `src/render/fishing-line.ts`, `ViewRenderer.render`.

### The sea (M10)

Beyond the world's edge the open sea continues (the terrain painter's deep water and the live renderer's waves,
`src/render/open-sea.ts`): zoomed out there is no rectangle. Marine life (`src/game/marine-life.ts`) is a pure function
of the world seed and world time, never saved: fish schools in the shallows, jellyfish (glowing at night), now and
then a leaping dolphin, a curious seal where the land meets the water (from the growth stage that brings the land
there), and rarely, at night, a glowing ray. E waves to the seal or watches the ray; the first meeting of each is a
discovery (`SEA_DISCOVERIES`); waves count for the side quest *Sea friends* (`waved`).

### Atmosphere

Day and night (a day is 1200 world seconds; time passes only while playing), rain from the world seed, a light
night tint (presentation only), creatures, wind, water. Source: `src/game/daylight.ts`, `LiveWorld.stepAtmosphere`.

### Island growth (M7)

Three stages, each adding new regions (biomes) over the Carrier's free surface, earned by care, farming, building,
discoveries, harmony and the story; it grows only when the player chooses. See
[World growth](../specifications/WORLD-GROWTH.md) and [Progression](PROGRESSION.md).

### Teleportation and visiting (M6, M7)

The Blobbi can teleport (a cinematic dissolve upward and rebuild from the sky); it arrives this way when play starts
and when visiting another local island as a read-only visitor. See
[Teleportation](../specifications/TELEPORTATION.md) and [World visiting](../specifications/WORLD-VISITING.md).

### Settings and accessibility

Day and night light, goal box, sound, reduced motion (defaults to the system preference), large HUD text, menu scale;
volumes for music, effects and ambience, music on or off, softer sound, mute. Stored per browser, never in a save.
Source: `src/ui/screens/settings.ts`.
