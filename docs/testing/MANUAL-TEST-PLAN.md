# Manual test plan

This plan brings together the manual checklists from the M4–M7 reports
([M4](../milestones/reports/REPORT-M4-LIVING-ISLAND.md) §11, [M5](../milestones/reports/REPORT-M5-LIVING-WORLD.md) §11,
[M6](../milestones/reports/REPORT-M6-LIVING-ARCHIPELAGO.md) §7, [M7](../milestones/reports/REPORT-M7-LIVING-WORLDS.md) §8),
adds regressions for M1–M3, and sorts everything by system.

**Status rule:** a test is PASS or FAIL only after a person has run it. Automated runs (vitest, or the scripted
browser passes done during development) do **not** count as passes here; they are listed in the Notes column. Every
test is currently **NOT TESTED**.

## Setup (applies to every test)

- `npm install`, then `npm run dev`. Open the Play tab. Dev tools are at the bottom of the Play panel and exist only on
  the dev server.
- **Protect your saves.** Use a new world seed (World tab → Regenerate) or dev tools → **Test world**. Saves live in
  this browser's localStorage under `blobbi-pixel-lab:save:*`; the progress-reset button in the sidebar deletes the
  current save **without asking** ([known issues](KNOWN-ISSUES.md)).
- "Fresh test world" below means a new seed with no save.
- Record the browser, OS and date in Notes when you mark a result.

Columns: **ID** · **Prerequisites** · **Steps** · **Expected result** · **Status** · **Notes**.

## Title and session (TITLE)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| TITLE-01 | Any | Open Play. Use arrows, Enter and Esc; open ISLANDS and ABOUT. | The title appears; every entry responds; Esc goes back. | NOT TESTED | |
| TITLE-02 | At least one save | NEW ISLAND → A TURTLE ISLAND; confirm. | Asks first, then makes a new world; earlier islands remain listed in ISLANDS. | NOT TESTED | |
| TITLE-03 | — | NEW ISLAND → A MANTA ISLAND. | A manta world starts; ISLANDS shows its species. | NOT TESTED | |
| TITLE-04 | A save | CONTINUE. | The Blobbi arrives by teleport (TELE-02). | NOT TESTED | |

## Gathering and tools (GATHER)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| GATHER-01 | Fresh test world | Check the goal box; pick up 5 resources (E). | The goal reads "GATHER SUPPLIES 0/5", counts up and completes with a notice and seeds; toasts show each pickup. | NOT TESTED | |
| GATHER-02 | GATHER-01 | Craft an axe (C), equip (Q), fell a tree. | Chopping sound and wood; fence plans unlock. | NOT TESTED | |
| GATHER-03 | — | Craft a pickaxe (V); mine a small and a large rock. | Stone and ore; large rocks take several hits; rocks return later. | NOT TESTED | |
| GATHER-04 | — | Look at the tool in every view and while walking. | The tool is in the Blobbi's anatomical left hand. | NOT TESTED | M2.3 regression |
| GATHER-05 | Fishing rod | Fish from the rim and wait for "!". | A fish is caught; on a manta world sea fishing is not available (KNOWN-ISSUES). | NOT TESTED | |
| GATHER-06 | Full bag | Pick up or harvest. | Refused with a message; nothing is lost. | NOT TESTED | |

## Crafting and inventory (CRAFT, INV)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| CRAFT-01 | Materials | K: craft a recipe from each tab. | Missing materials are shown; crafting consumes them and adds the item. | NOT TESTED | |
| CRAFT-02 | Workbench placed | E at the workbench. | The furniture tab opens. | NOT TESTED | |
| INV-01 | Items | I: browse, Use / Feed / Place / Read / Drop. | Each action does what it says; counts update. | NOT TESTED | |
| INV-02 | Storage crate or chest | Store all / half / one; store matching; take back. | Items move correctly; stack limits rise by 10 with a crate. | NOT TESTED | |
| INV-03 | Full chest | Try to pick up the chest (M). | Refused. | NOT TESTED | |

## Farming (FARM)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| FARM-01 | Hoe (G), equipped | Face grass. | A green dotted cell; E tills. | NOT TESTED | |
| FARM-02 | Hoe | Try water, a path, a tree, next to the shelter. | A red frame and a reason each time. | NOT TESTED | |
| FARM-03 | A tilled plot | T picks the seed, E plants, E waters; dev +1 min. | The soil darkens; the prompt shows the percentage; the drop returns when dry. | NOT TESTED | |
| FARM-04 | A ripe crop | E harvests. | The crop glints when ripe, floats up and goes to the bag; the plot can be replanted. | NOT TESTED | |
| FARM-05 | Rain (dev tools) | Leave crops in the rain. | They are watered by themselves. | NOT TESTED | |

## Building and housing (BUILD, HOUSE)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| BUILD-01 | 6 wood, 3 stones | B, then E near cliffs, then in open ground. | A red preview explains "the doorway needs open ground"; in open ground construction runs to the finished shelter. | NOT TESTED | |
| BUILD-02 | Decorations | Place a lantern and a bench. | Fireflies at night; the Blobbi visits them; "Improve the island" completes. | NOT TESTED | |
| BUILD-03 | Placed things | M: move (E, E), restyle (T), X to the bag. | Each works; the thing returns to the bag on X. | NOT TESTED | |
| HOUSE-01 | A shelter | E at the door; place a chair, rug and wall items; T colours. | Indoors works; things stay where placed. | NOT TESTED | |
| HOUSE-02 | A bed | R near the bed or indoors. | The Blobbi walks to the bed and sleeps; WASD wakes it. | NOT TESTED | |
| HOUSE-03 | Stove after the harvest quest | Cook toasted seeds or a roasted turnip. | Steam; "A warm meal" completes. | NOT TESTED | |

## Care and the Blobbi (CARE)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| CARE-01 | Dev "Hungry" | F. | Crumbs, hearts, a hop; FED rises; at full "not hungry". | NOT TESTED | |
| CARE-02 | — | H several times. | Joy rises once per 8 s; hearts every time. | NOT TESTED | |
| CARE-03 | Shelter | R. | Sleeps at the doorway with Zs; energy fills twice as fast there. | NOT TESTED | |
| CARE-04 | Dev "Tired", autonomy on | Wait. | It goes to sleep by itself. | NOT TESTED | |
| CARE-05 | A favourite food | Feed it. | "my favourite!"; U lists favourites after tasting. | NOT TESTED | |
| CARE-06 | Comfortable needs | Look at the face. | Neutral face. | NOT TESTED | |

## Quests and journal (QUEST)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| QUEST-01 | Fresh test world | "Look around": E on a tree, flower and rock. | A journal note arrives (J → Notes). | NOT TESTED | |
| QUEST-02 | — | Play chapter 1 through to the shelter and harvest. | Each quest gives a notice and its reward once; two quest lines run in parallel. | NOT TESTED | |
| QUEST-03 | Chapter 1 done | Grow sunflowers and place 3 decorations. | The harvest feast unlocks. | NOT TESTED | |
| QUEST-04 | Shelter | Wait for dawn. | One island request at a time; the next begins at the following dawn. | NOT TESTED | |
| QUEST-05 | — | Find a glinting discovery (E). | The Blobbi is curious nearby; the find goes to the bag and adds a note. | NOT TESTED | |
| QUEST-06 | Goals done | Reload. | Rewards are not granted again. | NOT TESTED | |

## The Carrier (CARR)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| CARR-01 | Carrier Stone found | Listen at the shore near the head (E). | The turtle blinks and glances; "Listen to the Carrier" completes. | NOT TESTED | |
| CARR-02 | CARR-01 | E at the shore: greet, observe, offer, rest. | Favourites appear under LIKES; harmony never drops. | NOT TESTED | |
| CARR-03 | — | Stand still by the head about 6 s. | A quiet moment. | NOT TESTED | |
| CARR-04 | Manta world | Listen; watch the wings. | Manta observations; the wings beat. | NOT TESTED | |
| CARR-05 | — | Carrier panel → ISLAND GROWTH. | Shows the real growth stage (not the M6 design model). | NOT TESTED | |

## Map, places and HUD (MAP, HUD)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| MAP-01 | — | N; walk around; click the map. | Places appear once visited; the Blobbi walks to the clicked spot. | NOT TESTED | |
| MAP-02 | — | J → PLACES and CARRIER tabs. | Listed correctly. | NOT TESTED | |
| HUD-01 | — | Pick up, equip, let a need drop, check time and weather. | Toasts, a tool chip, the "!", the time and weather chip. | NOT TESTED | |
| HUD-02 | — | Settings → LARGE HUD TEXT. | The HUD text is larger. | NOT TESTED | |

## Living world and menus (WORLD, UI)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| WORLD-01 | Dev tools | +1 h / Morning. | Dusk, night (lantern pools, fireflies), rain, birds and butterflies. | NOT TESTED | |
| UI-01 | — | Open each menu; press WASD and E. | Nothing happens in the world; the island is paused. | NOT TESTED | |
| UI-02 | — | Click and tap in menus; click outside; use the menu bar. | Everything responds; a click outside closes. | NOT TESTED | |
| UI-03 | — | Settings (Esc): lighting, goal box, sound, menu scale. | Each takes effect. | NOT TESTED | |
| UI-04 | — | Tap the world. | The Blobbi walks there. | NOT TESTED | |

## Touch and accessibility (TOUCH, A11Y)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| TOUCH-01 | A phone or device mode | Drag for the stick, tap to walk, the big E. | All work. | NOT TESTED | Never tried on a real device |
| A11Y-01 | — | Settings → REDUCED MOTION; teleport and grow. | Shorter, calmer effects; no camera movement. | NOT TESTED | |

## Audio (AUDIO)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| AUDIO-01 | — | Load; listen before any key; then press a key. | Silent until the gesture, then sound starts. | NOT TESTED | |
| AUDIO-02 | — | Walk on several surfaces; use tools; click menus. | Matching footsteps, tool sounds, clicks. | NOT TESTED | |
| AUDIO-03 | Dev +1 h | Day, night, rain, indoors. | Sea and birds; crickets at night; rain; a muffled room indoors. | NOT TESTED | Never heard by a person |
| AUDIO-04 | — | Settings → SOUND (Tab, LEFT/RIGHT); music off. | Volumes change; music stops separately. | NOT TESTED | |
| AUDIO-05 | — | Hide the tab, then show it. | Audio suspends and resumes. | NOT TESTED | |
| AUDIO-06 | Manta world | Listen to ambience. | Manta chimes and glides instead of turtle calls. | NOT TESTED | |

## Teleport (TELE)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| TELE-01 | Dev tools | Depart. | Eyes close, the Blobbi dissolves top to bottom, pixels rise; it is gone at the end. | NOT TESTED | Scripted browser pass only |
| TELE-02 | TELE-01 | Arrive. | A falling cluster, a shadow, a bottom-to-top rebuild, eyes open, a hop. | NOT TESTED | |
| TELE-03 | — | Round trip, Cancel, Reverse, Arrive far, in each camera mode (Z). | Never left invisible; reverse continues smoothly. | NOT TESTED | |

## Island growth (GROW)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| GROW-01 | Test world | L. | Stage, progress, requirements, the next unlock, regions. | NOT TESTED | |
| GROW-02 | Requirements not met | Try to grow. | Nothing grows; the reason is shown. | NOT TESTED | |
| GROW-03 | Dev → Meet requirements | LET THE ISLAND GROW, confirm. | The land spreads from the coast, plants appear, the camera pulls back and returns, "The island grew". | NOT TESTED | Scripted browser pass only |
| GROW-04 | Grown | Walk each new region; gather; till and plant; build a fence. | All work; the map shows regions once visited. | NOT TESTED | |
| GROW-05 | Grown | Reload. | Still grown; everything where it was. | NOT TESTED | |
| GROW-06 | Variant 0 turtle | L. | Says it cannot grow. | NOT TESTED | |
| GROW-07 | Manta world | Grow (dev tools). | Land grows toward the wings. | NOT TESTED | |

## Visiting (VISIT)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| VISIT-01 | Dev → Make visit test worlds | Y. | Names, species, stage, owner and a preview. | NOT TESTED | First preview is slow |
| VISIT-02 | VISIT-01 | VISIT. | Teleports away, arrives on the other island; the HUD says VISITING. | NOT TESTED | Scripted browser pass only |
| VISIT-03 | Visiting | Pick up, chop, build, open a chest. | Each is refused gently. | NOT TESTED | |
| VISIT-04 | Visiting | Y → RETURN HOME. | Back on the same spot with the same bag. | NOT TESTED | |
| VISIT-05 | Visiting | Reload. | Home. | NOT TESTED | |

## Saves and migration (SAVE)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| SAVE-01 | Played world | Reload. | Plots, crops (and wet time), needs, goals, decorations, bag, Carrier bond, growth all kept. | NOT TESTED | |
| SAVE-02 | An M3/M4 save (schema ≤ 5) | Load. | Loads; earned goals complete with notices in the first frames. | NOT TESTED | |
| SAVE-03 | An M6 save (schema 8) | Load. | Stage 0, everything in place. | NOT TESTED | |
| SAVE-04 | A schema-7 save | Load. | The Carrier bond starts fresh; everything else as before. | NOT TESTED | |

## Camera and regressions M1–M3 (CAM, REG)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| CAM-01 | — | Z through overview, exploration, close-up; the mouse wheel. | Each mode works; nothing in the world changes. | NOT TESTED | |
| CAM-02 | Indoors | Each camera mode. | The Blobbi at native 12/24/48 px. | NOT TESTED | |
| REG-01 | Turtle Variant B | Look at the head, flippers, shell. | Unchanged from M3.4. | NOT TESTED | |
| REG-02 | — | Look at the Blobbi. | The canonical V3 look. | NOT TESTED | M3.4 |
| REG-03 | — | Walk at 2× and 4×. | Smooth, no jitter. | NOT TESTED | |
| REG-04 | — | P: plant a tree. | The M1 sapling grows. | NOT TESTED | M1 |
| REG-05 | Lab tabs | Open the World and Blobbi tabs; regenerate. | The procedural lab still works. | NOT TESTED | |
