# Specification: Housing (the home, its levels, its rooms and its looks)

## 1. Purpose
Give the player a home that is earned, grows with the island and becomes theirs: a first shelter built by hand, two
upgrades (Cottage, Dream Home) earned through play, rooms to furnish, and a look to choose.

## 2. Status
**IMPLEMENTED** (M5 interior; M8 levels, upgrades, room layouts, customisation; M10 phase B upgrade feedback). **NOT TESTED** by a person.

## 3. Player-facing behaviour
- **No house at the start (M8).** A new island has no house; chapter 1 (The First Home) leads to the first shelter
  ([quests](QUESTS.md)). Worlds made before M8 keep their generated cottage (scenery) and their shelters.
- **Three levels** (`src/content/houses.ts`, art `src/game/house-art.ts`, rooms `src/game/interior.ts`):

  | Level | Name | Outside | Inside | Footprint |
  |---|---|---|---|---|
  | 1 | Cozy Shelter | log walls, thatched gable, one door, one window | one room 128 × 96: bed, table, chest, lantern, rug | 12 × 5 |
  | 2 | Cottage | plank walls on a stone footing, shingled roof, chimney, two windows and a gable window, a small porch | 192 × 112: sleeping nook (half wall), main room, tiled kitchen with a counter | 17 × 6 |
  | 3 | Dream Home | two storeys, tiled roof with a dormer and chimney, five windows with flower boxes, arched double door, wide porch with railing and lanterns, a vine | 240 × 144: bedroom, study (any use), kitchen above; living room below, through three openings | 22 × 7 |

  Each level is its own drawing at the world's native scale; nothing is a scaled-up smaller house.
- **Upgrading** (HOME panel, key 0 or Home since M11C (was 1), or the menu bar's HOME): the panel shows now/next pictures and every requirement
  with OK/-- and have/need. UPGRADE asks first (CONFIRM is greyed for 0.35 s, so a double press never confirms) and
  says the cost and what happens to the furniture. Then the materials leave the bag, the house is rebuilt over a
  short construction (scaffold, walls, roof) in world time, and a burst of sparkles and a chime mark the end.
  - Cottage: quests *Make it home* and *Harvest food* done; 10 wood, 6 stones, 2 cloth; a stove comes with the kitchen.
  - Dream Home: *A bigger home* and *Listen to the Carrier* done; island harmony 35; 3 discoveries; 16 wood, 10 stones,
    4 cloth; an armchair comes with the living room.
  - Refused (with the reason, nothing changes) from inside the house, while it is being built, or when the bigger
    house does not fit. Paths, rugs and meadows under the new walls are fine (M10 phase B: paths no longer refuse
    it); loose sticks and stones there are cleared. Nothing is ever removed or moved automatically.
  - **What is in the way (M10 phase B).** When natural things stand where the bigger house would go, the HOME panel
    says all of them, where and with what: *Clear the two trees and the small rock behind your house to make room
    (axe, pickaxe).* — and the world marks each with an orange arrow while the panel is open and for 4 s after.
    Clearing them frees the ground ([land clearing](LAND-CLEARING.md)). Pieces that cannot be cleared (a sign, a
    well) are named with the other way out: *move the house (M) to a roomier spot*. When the land itself is in the
    way (the map's edge, ground that is not flat grass, a slope, the edge of the high ground) or a building or plot
    is, it says so and **where a move would give room** (*there is room a little to the east*), from a search of the
    nearby ground — advice only: the house moves only when the player moves it.
  - The house still grows round its own centre: shifting it to make it fit would move it silently, which the game
    never does.
- **Furniture is never lost.** On an upgrade every piece keeps its id, colourway and (chests) contents and is moved
  into the new rooms (`relocateFurniture`): beds to the bedroom, stoves to the kitchen, bookshelves to the study,
  others to the same place in the matching room; if that spot is taken or would cut a room off, the nearest free
  spot is used. A piece with no place left goes back to the bag; if the bag could not take it the upgrade is refused
  before anything is paid (a chest holding things never goes to the bag).
- **Customising** (HOME → LOOK and ROOMS): roof colour, wall material, door style, window style; floor, wall colour,
  wall finish. A live preview shows the draft; APPLY saves it, REVERT forgets it. Locked options are listed with
  what unlocks them and cannot be applied ([unlocks](#unlocks)). ROOMS → ARRANGE (inside) starts the move mode.
- **Beds (M9):** a bed (or a Blobbi cushion) is where rest happens: R walks the Blobbi home and into the nearest
  reachable bed, tucked under the blanket ([gameplay systems](../game-design/GAMEPLAY-SYSTEMS.md#care-and-friendship)).
- **At night (M9)** a home's windows glow and its light reaches further with each level; a Cottage's and a Dream
  Home's chimney smokes.
- Entering, leaving, sleeping and indoor placing work as in M5, in every layout: E at the door goes in (the Cottage's
  door is right of centre), walking out of the door gap leaves.

### Unlocks
From `src/content/home-styles.ts` (M9 rebalance; derived from the save: nothing extra is stored). A new island starts
with ONE style of each part; the rest are earned. Locked options are listed with a padlock and what unlocks them;
the preview shows a locked draft dimmed under a padlock, and APPLY only explains. A style a save already has (chosen
under the M8 rules) is kept and never blocks changing another part. T in move mode cycles only unlocked floors and
walls. Earning a style shows a "New home style" notice.

| Part | Options (unlock) |
|---|---|
| Roof | natural · terracotta (quest: Build your first home) · slate blue (a Cottage) · moss green (2 discoveries) · plum (island stage 2) · honey (pick up 40 things) |
| Walls | natural wood · whitewash (craft 5 things) · dark timber (fell 10 trees) · fieldstone (break 3 large rocks) · rose paint (quest: Flower friend) · sky paint (island stage 1) |
| Door | open doorway · plank (quest: Step inside) · round (a Cottage) · double (a Dream Home) |
| Windows | cross panes · round (quest: Something that hums) · shutters (quest: Make it home) · flower box (grow 3 flowers) |
| Floor | honey planks · dark planks (quest: Make it yours) · pale planks (craft 10 things) · flagstones (break a large rock) · terracotta tiles (quest: A warm meal) · blue carpet (quest: Cozy corner) |
| Wall colour | warm wood · cream (quest: Make it home) · sage (harvest 3 crops) · rose (grow 3 flowers) · sky (3 discoveries) · lavender (quest: Begin restoring the island) |
| Wall finish | logs · plaster (a Cottage) · stripes (craft 15 things) · flower paper (quest: Begin restoring the island) · wainscot (a Dream Home) |

Each level has its own default door (open doorway, plank door, double door) and roof material; a look stores only
what the player changed, so unchanged parts follow the level.

## 4. Controls
1 or HOME: the panel (Tab between HOUSE, LOOK, ROOMS; arrows; Enter applies / upgrades; Backspace reverts) · E at
the door · M arrange · T room style in move mode (base styles) · mouse and touch on every control.

## 5. Data structures
- Shelter `Building` (`src/game/buildings.ts`): `level` (2–3; absent = 1), `look` (`HouseLook`: roof, wall, door,
  window indices), `upgradedAt` (world time). `footOf`, `doorwayRect`, `doorSpot`, `houseSprite`, `houseLevel`.
- `InteriorState`: `{ shelterId, furniture, style: { floor, wall, finish? }, level }`. `RoomLayout` per level:
  size, back wall, door gap, windows, spawn, floor, clear zones (door and openings), partitions, rooms with anchors,
  tiled floor, counters.
- `HouseLevel` (`src/content/houses.ts`): name, footprint, door half-width, cost, build seconds, quest, harmony,
  finds, gift.

## 6. State transitions
shelter (level 1) ─UPGRADE + CONFIRM─► level 2 under construction ─(20 s)─► Cottage ─…─► Dream Home (28 s).
island ─E at door─► room (layout of the level) ─walk out─► island.

## 7. Persistence
Save schema 10 (unchanged in 11): shelter `level`, `look`, `upgradedAt` in `buildings`; interior `style.finish` and `level` in
`interiors`. Older records load as level 1 with their room and furniture unchanged. The interior keeps its id across
levels, so chests indoors (`room/<shelter>/<id>`) keep their contents.

## 8. Edge cases
An interior never entered before an upgrade is furnished at the new level when first entered. Placement indoors
refuses partitions, openings and anything that would cut a room off from the door. A visitor cannot upgrade or
restyle. The Blobbi standing where new walls rise is moved to the door.

## 9. Failure handling
Every refusal leaves the bag, the house and the rooms exactly as they were. Unknown look values load as the
level's defaults; a malformed level loads as 1.

## 10. Source files
`src/content/houses.ts`, `src/content/home-styles.ts`, `src/game/house-art.ts`, `src/game/interior.ts`,
`src/game/buildings.ts`, `src/render/interior-render.ts`, `src/ui/screens/home.ts`, `src/ui/screens/home-style.ts`,
`LiveWorld.houseUpgrade`, `upgradeHouse`, `setHouseLook`, `setRoomStyle`, `styleContext`, `enterInterior`.

## 11. Automated tests
`tests/housing.test.ts` (layouts, the M5 room pinned pixel for pixel, relocation, art, upgrades on turtle and whale
islands, saves, schema 9, the HOME panel's confirmation), `tests/customisation.test.ts`, `tests/first-home.test.ts`,
`tests/quests.test.ts` (the scripted story earns both upgrades), `tests/placeables.test.ts`, `tests/clearing.test.ts`
(M10 phase B: what is in the way, on difficult seeds of every Carrier; every test island can grow its first house —
at once, after clearing, or after the suggested move).

## 12. Known limitations
Customisation covers the home (the first shelter) only. Wall items hang on the back wall only (not on partitions).
No night glow in the house's windows on the island (the art supports it; not wired). Room styles in move mode (T)
cycle the unlocked floors and walls (M9). See [known issues](../testing/KNOWN-ISSUES.md).

## 13. Extension points
More levels are a `HOUSE_LEVELS` entry, a drawing and a `RoomLayout`; more styles are entries in the art lists and
`STYLE_OPTIONS`.
