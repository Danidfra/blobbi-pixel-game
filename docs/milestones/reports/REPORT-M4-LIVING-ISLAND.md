# M4: Living Island

- **Status:** implemented, **not committed**: it waits for manual gameplay validation. Nothing was pushed or deployed.
- **Before it:** M3.4 was committed locally as `9d0c99f` after its approval, together with the procedural audit report.
- **Images:** `examples/living-island/`, regenerated with `npx tsx scripts/living-island.ts`.

## The loop

```
gather → craft an axe → fell trees → build the shelter → craft a hoe → till plots
→ plant → water until ripe → harvest food → feed Blobbi → complete goals → decorate
```

All of it can be played from an empty bag. A scripted play-through (`src/dev/scripted-play.ts`, `playLoop`) does it with player actions only, in three different worlds, and completes all ten goals. A test runs it and checks the result.

## Design (how M4 fits the existing systems)

Every new feature extends a system that already existed; nothing runs in parallel to the old code.

| Need | Extended system |
|---|---|
| Hoe, seeds, food | the item registry (`items.ts`) and the recipe list (`crafting.ts`) |
| Tilling | the tool swing (`Swing.action: 'till'`) and the equipment layer (hoe templates, same hand) |
| Plot placement | the building placement rules (`checkGround`, shared with buildings) |
| Growth, regrowth | persisted **world time**, like trees, rocks and construction |
| Decorations | new `BuildingKind`s: same cost, preview, collision, navigation and save path |
| Blobbi needs | stepped in the fixed sim `dt`; the brain gets a read-only `wants` view |
| Objectives | a persisted tally of the player's own actions, checked each step |
| Save | schema 6 of the same record, with migration |

- **Determinism:** two plays of the loop write byte-identical saves (tested).
- **Unchanged behaviour:** while needs are fine and the player has built nothing, the brain draws exactly the same random numbers as before. All 211 existing tests still pass with their assertions unchanged, except four that pin the save's version and key list (now 6).

## 1. Features implemented

- **Farming:**
  - A hoe tills grid-aligned plots. Three crops each have their own seed, five growth stages, watering and a harvest.
  - A plot replants after harvest. Harvest history is kept on each plot and in the tally.
- **Blobbi care:**
  - Three needs: fed (hunger), energy and joy.
  - Player actions: feeding, petting, napping (at the shelter's doorway when one is built).
  - Autonomy rests when tired and visits what you built. It shows hunger, tiredness and happiness on its own, and never eats.
- **Progression:** ten ordered objectives with practical rewards, a goal box in the view (O hides it), a completion notice, and an objectives list in the side panel.
- **Decorations:** fence, flower bed, small lantern, wooden bench and storage crate. All are craftable from the build menu, placed with a preview, solid, and avoided by navigation.
- **Game feel:**
  - A prompt saying what E does right now.
  - Needs bars in the HUD and a food count in the counter.
  - Crops: water drops over dry ones, a glint on ripe ones, harvested crops that float up.
  - Feeding crumbs and hearts, sleep Zs, fireflies by lanterns.
  - Short-lived decorations rise as they're built.
  - The tiny font gains `! : . ( ) / + ?`, which bubbles already used but drew as blanks.
- **Dev tools** (dev server only):
  - +1 min and +10 min of world time.
  - A test kit of resources.
  - Needs presets (hungry, tired, sad, well).
  - A two-click goal reset.
  - A live inspector for crops, needs, the brain and the tally.

## 2. Controls

| Key | Action |
|---|---|
| WASD / arrows | move (always overrides autonomy, and wakes a sleeping Blobbi) |
| E / Space | pick up a resource in reach, else the farm (harvest, water, plant, or till with the hoe), else chop or mine, else look |
| F | feed Blobbi (the smallest food first) |
| H | pet Blobbi |
| R | nap (walks to the shelter's doorway if there is one); R again wakes it |
| T | next seed type (among those in the bag) |
| C / V / G | craft axe / pickaxe / hoe |
| Q | cycle tools: empty hands → axe → pickaxe → hoe (the ones you own) |
| B | build: cycles shelter → unlocked decorations → off. E places, Esc cancels |
| O | show or hide the goal box |
| P | plant a tree (M1) |
| Z | camera mode |

The Play panel has buttons for the same actions, plus one button per building kind.

## 3. Crafting recipes and build costs

| Item | Cost | Notes |
|---|---|---|
| Simple axe | 3 sticks + 2 stones | unchanged |
| Simple pickaxe | 2 wood + 2 sticks + 3 stones | unchanged |
| **Simple hoe** | 1 wood + 2 sticks + 1 stone | tills plots |
| Wooden shelter | 6 wood + 3 stones | unchanged; now needs open, walkable ground in front of its door |
| **Wooden fence** | 2 wood | unlocked by the goal "Craft an axe" |
| **Flower bed** | 1 wood + 2 seeds | unlocked by "Plant a seed" |
| **Small lantern** | 1 wood + 2 stones + 1 stick | unlocked by "Feed Blobbi" |
| **Wooden bench** | 3 wood + 1 stick | unlocked by "Feed Blobbi" |
| **Storage crate** | 4 wood + 2 sticks | unlocked by "Improve the island"; +10 to every non-tool stack, counting up to two crates |

## 4. Farming mechanics

- **Plots:**
  - One 8 × 8 px cell on a fixed grid in the **island frame**, so world growth or another canvas never moves a field.
  - The cell in front of the Blobbi is the target. It shows soft white corners on a plot, or a dotted green or red frame for the hoe.
  - **Allowed:** flat buildable grass on one level.
  - **Refused, with the reason in the prompt or a bubble:** water, object footprints, buildings and their 2 px clearance, a shelter's doorway, resource nodes, another plot, and the map edge.
  - Plots are walkable and never block navigation. Resources never grow back onto a plot, and nothing can be built on one.
- **Crops:**

  | Crop | Seed | Wet growth time | Waterings | Harvest |
  |---|---|---|---|---|
  | Turnip | wild seed (by bushes and flowers) | 90 s | 2 (45 s each) | 2 turnips (25 hunger each) |
  | Carrot | carrot seed (goal reward) | 150 s | 3 (50 s each) | 2 carrots (35) + 1 carrot seed |
  | Pumpkin | pumpkin seed (goal reward) | 240 s | 3 (80 s each) | 1 pumpkin (60) + 2 pumpkin seeds |

- **Growth:**
  - The five stages are seeds, sprout, young, growing and mature.
  - Crops grow only inside a watering's wet window and pause when it ends. Nothing wilts or is lost.
  - Everything is a pure function of world time, so it survives reloads. Frame rate never matters: a big frame runs the same fixed steps.
- **Watering:**
  - E on a dry crop, shown by a bobbing drop; the soil turns dark while wet.
  - Watering a wet crop does nothing; the prompt shows the growth percentage instead.
- **Harvest:**
  - Everything the crop yields goes into the bag at once, or nothing does and the crop waits ("no room for …").
  - The crop is removed in the same step its yield arrives, and both are saved together, so a reward can't be given twice.
- **Collect-first rule:** as before, E picks up a resource in reach before anything else. The prompt says "E pick up the seed" when that will happen.

## 5. Blobbi care mechanics

- **Needs:**
  - Each runs 0–100, where 100 is good. A new Blobbi starts at fed 100, energy 100, joy 70.
  - Needs change only in simulated steps while the game runs; a closed tab costs nothing.
  - **Fed:** −0.06/s, full to empty in about 28 minutes of play.
  - **Energy:**
    - Awake: −0.08/s standing, −0.11/s walking.
    - Resting: +1.5/s, or +3/s asleep in a finished shelter's doorway.
  - **Joy:**
    - Drifts down 0.02/s to a floor of 40, or 20 while hungry or tired.
    - Gains: feeding +10 (+5 more when hungry), petting +6 (once per 8 s), a completed rest +5, an autonomous inspection +2, a harvest +3, a finished build +5, a completed goal +4, visiting a flower bed, bench or lantern +3 (once per 20 s).
- **Effects** (never harsh):
  - Below 15 fed or energy, the Blobbi walks at 85% speed.
  - The resting face follows the needs, using kit expressions: `sleepy` (energy < 15), `sad` (fed < 15 or joy < 25), `happy` (joy ≥ 85 while fed ≥ 50 and energy ≥ 40). Otherwise it keeps the approved neutral face.
  - Reactions and sleep always take precedence over the mood face.
- **Feeding (F):**
  - Consumes exactly one food, the smallest first, and only if the Blobbi eats it. At fed 95 or above it says "not hungry right now" and keeps the food.
  - Gives an excited hop, crumbs and hearts. The new need is saved at once.
- **Rest (R or autonomous):**
  - A tired Blobbi (energy < 25) rests on its own. It walks to the shelter's doorway if one is built and reachable, else lies down where it is.
  - A rest lasts at least 6 s and continues until energy reaches 95. R again, or any movement key, wakes it.
- **Autonomous reactions:**
  - "hungry..." with a sad face about every 45 s (it suggests F when food is in the bag), and "so sleepy..." when tired.
  - The occasional heart when very happy.
  - Visits to decorations and growing crops: things the player made get half of all inspection picks when they're nearby.
- **Never autonomous:** collecting, crafting, building, tilling, planting, watering, harvesting or eating. Tests cover feeding, the farm and the bag.

## 6. Progression objectives

They complete in order. When one completes, any later ones whose conditions already hold complete right after it.

| # | Goal | Condition (from play) | Reward |
|---|---|---|---|
| 1 | Gather supplies | 5 resources picked up | +2 seeds |
| 2 | Craft an axe | an axe crafted, or one in the bag | fence plans |
| 3 | Gather wood | a tree felled | +2 stones |
| 4 | Build a shelter | a finished shelter | +3 seeds |
| 5 | Prepare a farm plot | a plot tilled | +3 carrot seeds (new crop) |
| 6 | Plant a seed | a seed planted | flower bed plans |
| 7 | Water a crop | a crop watered | +2 seeds |
| 8 | Harvest food | a crop harvested | +2 pumpkin seeds (new crop) |
| 9 | Feed Blobbi | Blobbi fed | lantern and bench plans |
| 10 | Improve the island | 2 decorations placed | storage crate plans |

- Looking at the panel, the prompt or the goal box changes nothing (tested).
- Completed goals are stored with their world time. A reload never grants a reward again (tested).
- If an item reward doesn't fit in the bag, the part that fits is added and the notice says what didn't fit.

## 7. New decorations

| Decoration | Footprint | What it does |
|---|---|---|
| Wooden fence | 13 × 3 | uses the island's own fence generator; fences can be placed end to end |
| Flower bed | 13 × 7 | a wooden frame with flowers in the world's flower colours; Blobbi visits it (joy) |
| Small lantern | 5 × 3 | the island's own lantern; fireflies drift around it |
| Wooden bench | 13 × 5 | "what a nice view" (joy) |
| Storage crate | 11 × 5 | more room in the bag |

All five:
- are drawn in the world palette, with the lab's outline and light direction;
- rise from the ground during their 2–5 s build;
- block collision and are rebuilt into the nav grid;
- are saved in island-frame coordinates.

The turtle, shell variant B, the Blobbi's anatomy and face, the camera proportions and the tool hand mapping are untouched.

## 8. Save format changes

- **Schema 6**, same key namespace, still `owner: 'local-world'`. Four new fields:
  - **`plots`:** `{ id, gx, gy, preparedAt, harvests, crop: { kind, plantedAt, grown, wetFrom, wetUntil } | null }[]`. Cells are in the island frame; one plot per cell.
  - **`care`:** `{ hunger, energy, happiness, lastPet }`.
  - **`tally`:** counters of the player's own actions.
  - **`objectives`:** `{ completed: { [id]: worldTime } }`.
  - Decorations are entries in `buildings` with new kinds.
- **Migration from schema 1–5:**
  - No plots, comfortable needs, no goals completed yet.
  - The tally is seeded from what the record shows was done: collected nodes, felled trees, broken rocks, buildings.
  - On the first step, goals that this progress already satisfies complete and grant their rewards. For example, an old save with 5 nodes collected, an axe and a felled tree completes goals 1–3 (tested).
  - Older code refuses schema 6 records.
- **Validation:**
  - Malformed plots, unknown crops, unknown building kinds, bad tally values and unknown goal ids are each dropped on their own; nothing is half-read.
  - A record naming another owner is still refused.
- **Ownership:**
  - Needs, plots, goals and the bag belong to the world record and are never keyed by a Blobbi.
  - Switching Blobbis keeps them, and the record never contains a Blobbi seed (tested).
  - Canonical V3 identity is unchanged.

## 9. Test results

- `npm run check`: **typecheck OK; 25 files, 255 tests passed; build OK** (372.6 kB, 131.3 kB gzipped).
- **New tests (44):**
  - **`tests/farming.test.ts` (14):** growth maths, crop data and sprites, valid and invalid placement, seed consumption, seed cycling, watering, world-time growth, harvest, no duplicate reward, full bag, collect-first, autonomy never farms, persistence, malformed plots, no respawn on fields.
  - **`tests/care.test.ts` (15):**
    - needs maths, eating, mood faces, malformed records;
    - feeding (F) and its persistence; autonomy never eats;
    - tired autonomous rest; walking to the shelter at double recovery; WASD wakes; R and the minimum nap;
    - petting cooldown, exploring joy, hungry reactions;
    - determinism and persistence.
  - **`tests/living-island.test.ts` (15):**
    - **Objectives:** order and cascade, unlocks, the panel never counts, the full played loop with rewards once across a reload, loop determinism.
    - **Save:** v5 → v6 migration, world ownership separate from the Blobbi, malformed sections.
    - **Decorations:** sprites, placement with cost, collision, nav and persistence, crate stack room, the doorway rule, autonomous visits.
    - **Regressions:** hoe in the anatomical left hand like every tool, the neutral face for a comfortable Blobbi.
- **Updated (schema 6 only):**
  - `tests/camera.test.ts`: version and key list.
  - `tests/crafting.test.ts`: the v1 migration shape.
  - `tests/identity.test.ts`: the migrated version.
- **Regression suites, all passing with unchanged assertions:** turtle anatomy hashes, Blobbi V3 identity and sprite hashes, camera modes, walking jitter, equipment, mining, shelter, resource regeneration, old saves.
- **Performance** (exploration 2×, 960×540, warm caches):

  | World | Render per frame |
  |---|---|
  | Fresh | 1.17 ms |
  | Furnished, hoe in hand | 1.02 ms |

  The first frames after equipping the hoe build its hand-rig poses once. The simulation step stays under 0.03 ms.
- **Browser check** (dev server, separate test world):
  - Every new key worked through the real keyboard handlers: G, Q, E till, T, E plant, E water, dev time skip, E harvest, F, H, R, R again, B, Esc, O.
  - Plots, crop, bag and needs survived a reload.
  - No console errors.
  - The test save was removed afterwards. The other save already on that origin was verified byte-identical before and after.
  - Fixed during the check: on a narrow window the goal box now moves under the HUD, and a nap asked for at full energy now lasts at least 6 s.
- **Production build:** contains no dev tools (checked by searching the bundle).

## 10. Known limitations

- **Building and planting:**
  - Nothing can be removed or moved yet: plots, decorations and the shelter are permanent.
  - Only one seed type is planted per press. T picks among seeds in the bag; there's no seed menu.
- **Farming:** crops are small (5–7 px wide at world scale), drawn from hand-set templates per stage with seed mirroring, not generated shapes. They read well at 2× and 4× and only as colour at 1×.
- **Care:**
  - Needs don't change while the game is closed (by design), and there's no day/night cycle. Lanterns don't light anything.
  - Joy saturates at 100 quickly for an engaged player and then drifts down slowly (about 1.2 per minute).
- **Objectives:**
  - A fixed list of ten. There's nothing after "Improve the island" except the decorations themselves.
  - On a migrated save, completed goals pay their rewards on load (shown as notices). This is intended: the progress was real.
- **Prompts:** E still picks up a resource in reach before tending a crop (the existing rule); the prompt says so.
- **Autonomy:** the shelter-door path search falls back to sleeping in place if the door is unreachable. Shelters built before M4 may have their door against a cliff, since the doorway rule only applies to new placements.
- **Browser testing:** the automation tab is hidden (no animation frames), so frames were driven through a dev-only `frame()` hook on the existing `__blobbi` dev handle. The visible-tab experience, including frame pacing, still needs your manual pass.

## 11. Manual testing checklist

Run `npm run dev`; dev tools appear at the bottom of the Play panel. Use a fresh world seed (World tab, then Regenerate) so your existing save isn't migrated.

1. **Fresh start:** the goal box shows "GOAL 1/10 GATHER SUPPLIES 0/5", and the needs bars sit under the counter.
2. Pick up 5 resources. A notice appears ("+2 seeds") and the goal moves on.
3. Craft an axe (C), equip it (Q), fell a tree. Fence plans unlock; check the B cycle.
4. Build the shelter (B, then E). A red preview explains "the doorway needs open ground" next to cliffs. Wait for it to finish.
5. Craft the hoe (G), equip it (Q), and face grass: a green dotted cell appears. Press E to till. Try water, a path, a tree and next to the shelter: each gives a red frame and a reason.
6. **Plant:**
   - Press E; T switches to carrots, which arrive as the plot reward.
   - A drop bobs over the dry crop. Press E to water; the soil darkens and the prompt shows the percentage.
   - Use dev +1 min to skip ahead and re-water when the drop returns.
7. Harvest the ripe crop (it glints). The crop floats up, food enters the bag, and the plot is ready to replant. With a full bag, the crop waits.
8. Dev "Hungry", then F: crumbs, hearts, an excited hop, and the FED bar rises. At full, F says "not hungry".
9. Press H a few times: joy rises once per 8 s and hearts appear every time.
10. Press R: the Blobbi walks to the shelter's doorway and sleeps with Zs. The energy bar fills twice as fast there. Any WASD key wakes it.
11. Dev "Tired" with autonomy on: it goes to sleep by itself.
12. Place a lantern and a bench (B). Fireflies appear. The Blobbi wanders over to look at them. "Improve the island" completes and unlocks the storage crate; build one and stack limits rise by 10.
13. Reload: plots, crops (and their wet time), needs, goals, decorations and the bag are all still there. Camera modes (Z) change nothing.
14. **Regression look:**
    - Turtle head, flippers and shell are unchanged; the Blobbi's face is neutral when its needs are comfortable.
    - Tools are in the left hand in every view, walking is smooth at 2× and 4×, and mining and chopping still work.
15. **Optional:** load an old (schema 5) world; goals already satisfied should complete with notices on the first frames.
