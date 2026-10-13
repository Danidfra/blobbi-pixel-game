# Manual test plan

This plan brings together the manual checklists from the M4–M7 reports and M8 phase 0 (the playable whale)
([M4](../milestones/reports/REPORT-M4-LIVING-ISLAND.md) §11, [M5](../milestones/reports/REPORT-M5-LIVING-WORLD.md) §11,
[M6](../milestones/reports/REPORT-M6-LIVING-ARCHIPELAGO.md) §7, [M7](../milestones/reports/REPORT-M7-LIVING-WORLDS.md) §8),
adds regressions for M1–M3, and sorts everything by system.

**Status rule:** a test is PASS or FAIL only after a person has run it. Automated runs (vitest, or the scripted
browser passes done during development) do **not** count as passes here; they are listed in the Notes column. Tests
marked PASS were played by the project owner (the date and what was reported are in Notes); every other test is
**NOT TESTED**.

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
| TITLE-01 | Any | Open the game (a plain link opens Play). Use arrows, Enter and Esc; open ISLANDS and ABOUT. | The title appears; every entry responds; Esc goes back. | NOT TESTED | M8; M10 phase C menus |
| TITLE-02 | A fresh browser profile (no saves) | Open the game. | BLOBBI PIXEL, "a little world awaits you.", BEGIN and SETTINGS (ABOUT as a small row); no CONTINUE; opening the game creates no save by itself. | NOT TESTED | M10 phase C |
| TITLE-03 | WELCOME | BEGIN; move between the three Carriers (keys, mouse, tap). | Three animated cards (turtle, manta, whale) each with a name and a personality line; the chosen one is raised with a yellow frame and a mark; NEXT names it; a second tap on the chosen card goes on. | NOT TESTED | M8 |
| TITLE-04 | A save | Open the game; CONTINUE. | "Welcome back!" with CONTINUE (the island's name, Carrier and day) and SETTINGS, ISLANDS and ABOUT as small rows, no NEW ISLAND; CONTINUE opens the active island; the Blobbi arrives by teleport (TELE-02); no intro. | NOT TESTED | M10 phase C |
| TITLE-05 | Carrier chosen | Type a name (letters, digits, space); Backspace; SURPRISE ME; on a phone TYPE A NAME. | The name shows with a caret and a count up to 16; unsupported characters never appear; SURPRISE ME suggests a name; a phone keyboard opens for TYPE A NAME. | NOT TESTED | M8 |
| TITLE-06 | Name page | CREATE ISLAND (press it twice quickly). | "THE SEA STIRS…", then the intro of the chosen Carrier on the new island, ending directly in play on that island. Exactly one new island in MY ISLANDS, with the typed name (or a generated one when left empty). | NOT TESTED | M8 |
| TITLE-07 | A saved island | ABOUT → WATCH THE WHALE INTRO; let it end or skip it. | The intro plays on a preview island; afterwards the title returns; the saved island is unchanged. | NOT TESTED | M8 |
| TITLE-08 | Saves exist, link with `#islands=many` (development) | ISLANDS → NEW ISLAND → … → CREATE. | Same steps as the first time; earlier islands remain listed in ISLANDS. Without `#islands=many` there is no NEW ISLAND anywhere. | NOT TESTED | M10 phase C: one island per player |

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

## Intro cinematic (INTRO)

Since M8 the intro plays when a new island is made (TITLE-06) and from ABOUT → WATCH THE … INTRO.


The cinematic is not in the start flow yet: every test uses the dev preview (dev tools → **Intro cinematic**, or
`#mode=play&intro=<turtle|manta|whale>`), which plays on a preview world with no save. Frames for comparison:
`examples/intro-cinematic/`.

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| INTRO-01 | Dev server | Dev tools → Intro cinematic → Turtle. Watch to the end without touching anything. | About 32 s: ocean, a shape beneath, the turtle surfacing dome first behind foam **with no island** (a whole plated shell, a speck of soil at its centre), a blink and a glance, a patch of soil that spreads into the island, trees and rocks sprouting as the camera pushes in, the Blobbi arriving by teleport, looking left and right, surprised at you, happy with "hello!", the two lines, then the title returns. No blur, no jitter, crisp pixels throughout. | NOT TESTED | Headless-Chrome pass only |
| INTRO-02 | Dev server | Same for Manta. | The whole manta, **wing tips and whip included**, surfaces bare (disc first, then out along the beating wings); **under the water and while surfacing each wing is one unbroken shape from the disc to its tip** (no strip of open sea just outside the disc, no detached tip); the land forms on its disc and never on the wing tips; the sand beach appears with the land. | NOT TESTED | |
| INTRO-03 | Dev server | Same for Whale. | A long shadow from the left, swimming east; snout first, back to the flukes, the grey back bare; its spout and blink during the Carrier or island scene; the island forms between the blowholes and the knuckles with its mossy fringe. About 33 s. | NOT TESTED | |
| INTRO-04 | INTRO-01 | Watch the island form closely (turtle and whale). | A small patch of earth first, spreading organically (not a fade, not a rectangle), two more patches joining, soil turning to grass behind the edge; plants and rocks appear afterwards, sparkling in, not all at once. | NOT TESTED | |
| INTRO-05 | INTRO-01 | Watch the arrival. | The Blobbi is not there until the island is complete; then the game's own teleport arrival (cluster above, falling pixels, shadow, bottom-to-top rebuild, eyes opening, a smile and hop); the camera has lifted a little toward the sky and settles. | NOT TESTED | |
| INTRO-06 | INTRO-01 | Press any key at 3 s, then run again and click at 14 s, then run and tap (touch screen or device mode) at 20 s, then run and press Esc at 26 s. | Each ends the cinematic at once and returns to the title; nothing is stuck; the Blobbi is present on the complete island if play were to start. | NOT TESTED | Key, click and emulated touch checked headless |
| INTRO-07 | Settings → reduced motion on (or the system preference) | Run any species. | About 19.5 s of cuts (the bare Carrier whole, its island forming, the gameplay framing), a one-second surfacing, a quick formation, the short teleport arrival, no hops, the same message. | NOT TESTED | |
| INTRO-08 | Sound on, a key pressed before | Run the whale, then the turtle; listen. | Sea and wind, a call from beneath, splashes and a breath on surfacing, the whale's blow with its spout, a swell and chimes as the land forms, birds, the teleport's own sounds, the Blobbi's sounds, a brighter music at the hello, a chime with the message. Not loud. | NOT TESTED | Never heard by a person |
| INTRO-09 | Sound off, or muted in SOUND | Run any species. | Silent; nothing breaks. | NOT TESTED | |
| INTRO-10 | — | Resize the window (or rotate a device) during the ocean and during the formation. | The picture refits at once; the whole animal stays framed; the ending still lands on the exploration framing. | NOT TESTED | Resize checked headless |
| INTRO-11 | A saved world open at the title | Run the preview; afterwards CONTINUE. | The player's own world is exactly as it was (position, bag, day, growth stage); ISLANDS lists no new world. | NOT TESTED | Store checked empty in tests |
| INTRO-12 | A phone-sized window (about 360×640) | Run the manta. | The whole manta fits (a smaller reveal scale), the message steps down to a size that fits, the skip hint is visible. | NOT TESTED | |

## The turtle's small start (TSTART)

New turtle worlds use shell Variant S (a small island on a big shell); worlds made before keep theirs. Pictures:
`examples/turtle-start/`.

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| TSTART-01 | — | Title → NEW ISLAND → A TURTLE ISLAND. Press Z to the overview. | A giant turtle carrying a small island at the centre of its shell: a wide ring of plates all round; the house, the pond and a few trees fit comfortably; the Blobbi is its usual size. | NOT TESTED | |
| TSTART-02 | TSTART-01 | Play a few minutes: gather, craft an axe, build the shelter, till and plant. | Everything reachable; resources on the land; the shelter and plots place as before. | NOT TESTED | |
| TSTART-03 | TSTART-01, dev tools | Growth → stage 1, 2, 3 (dev buttons on a test world, or play to them). | Noticeable new land at 1, more at 2, a large island at 3 that still leaves a ring of plates and the lip visible; the land spreads over the shell, never over the head or the flippers. | NOT TESTED | Numbers in `examples/turtle-start/README.md` |
| TSTART-04 | A turtle world saved before this change | CONTINUE it; open ISLANDS. | Its island is exactly as before (Variant B), with its buildings and plots in place; the new world and the old one are listed as different islands. | NOT TESTED | Pinned in tests |
| TSTART-05 | — | Compare with a new manta and a new whale world at stage 0. | All three start as a small island on a large animal; the turtle's is of the same order as the manta's. | NOT TESTED | |

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
| GROW-02 | Requirements not met | Press NOT READY YET with the mouse, then press Enter. | Nothing grows; the panel stays open and its footer says how many requirements are left and which; clicking an empty part of the panel never closes it, clicking outside does. | NOT TESTED | Fixed 2026-10-11 (the press used to close the panel silently); scripted browser pass only |
| GROW-03 | Dev → Meet requirements (on a test world) | LET THE ISLAND GROW, confirm. | The land spreads from the coast, plants appear, the camera pulls back, the new land glows for a few seconds and fades, the camera returns, "The island grew". | NOT TESTED | Scripted browser pass only (turtle, manta, whale) |
| GROW-04 | Grown | Walk each new region; gather; till and plant; build a fence. | All work; the map shows regions once visited. | NOT TESTED | |
| GROW-05 | Grown | Reload. | Still grown; everything where it was. | NOT TESTED | |
| GROW-06 | Variant 0 turtle | L. | Says it cannot grow. | NOT TESTED | |
| GROW-07 | Manta world | Grow (dev tools). | Land grows toward the wings. | NOT TESTED | |
| GROW-08 | Whale test world (dev tools → Whale) | Grow (dev tools). | Land grows along its back toward the tail (WHALE-10). | NOT TESTED | Scripted browser pass, stages 1–3 |
| GROW-09 | A world from NEW ISLAND (not a test world) | Press a dev growth button. | Nothing grows; a notice on the game view says dev growth works on test worlds only. | NOT TESTED | Scripted browser pass only |
| GROW-10 | Test world, stage 0 | Dev stage 3. | The reveal plays over all three stages' land; Dev stage 1 afterwards sets it back with a short message and no reveal. | NOT TESTED | |

## Whale worlds (WHALE)

Prerequisite for all: dev tools → **Whale** (a whale test world), or Title → NEW ISLAND → A WHALE ISLAND. The dev
growth and requirement buttons (WHALE-10) work on the dev tools' Whale test world only: a whale from NEW ISLAND
refuses them (GROW-09).

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| WHALE-01 | — | Z to the overview. | A whale lying east-west, head to the east: blunt barnacled head, long knobbly fins, knuckles near the tail, notched flukes; the island along its back with a mossy edge. It reads as a whale, not a turtle or a manta. | NOT TESTED | Rendered frames only (`examples/whale-world/`) |
| WHALE-02 | — | Watch for a minute. | The fins sway and the flukes rise and sink slowly; every 11 s a spout of mist rises from the blowholes and falls; the eyes blink after it; the island never moves. | NOT TESTED | |
| WHALE-03 | Sound on | Listen near the head. | A blow with each spout, a deep song now and then; no turtle calls. | NOT TESTED | Never heard by a person |
| WHALE-04 | — | Walk the whole island; let autonomy run. | Walkable everywhere on the land and moss; never onto the skin or into the sea; the Blobbi lives there on its own. | NOT TESTED | |
| WHALE-05 | — | Gather sticks, stones, forage and shells (on the mossy shore). | All work; every resource can be reached. | NOT TESTED | |
| WHALE-06 | Materials | Craft tools; build a shelter, enter it, furnish it, store in a chest. | As on the turtle. | NOT TESTED | |
| WHALE-07 | Hoe | Till, plant, water, harvest. | As on the turtle. | NOT TESTED | |
| WHALE-08 | Quests | Follow chapter 1; find discoveries. | Quests advance; finds can be picked up. | NOT TESTED | See KI-14 |
| WHALE-09 | Carrier Stone found | Listen at the island's front (by the head); open the Carrier panel; observe. | Whale observations (the spout, its song, the fins, …). | NOT TESTED | |
| WHALE-10 | Dev → Whale, then Dev → Meet requirements | Grow to stages 1, 2 and 3 (LET THE ISLAND GROW). | Stage 1 lengthens the island aft; stage 2 spreads along both flanks behind the fins; stage 3 reaches further aft, and the whole mushroom grove can be walked to its tip. The head and the knuckles stay bare; buildings and plants never move. | NOT TESTED | Scripted browser pass, stages 1–3, walked to the tip |
| WHALE-11 | A played whale world | Reload; also open it from ISLANDS. | Still a whale, same growth stage, same bag and buildings. | NOT TESTED | Scripted browser pass only |
| WHALE-12 | — | Teleport (dev Depart/Arrive), each camera mode, day and night, rain, touch controls, visit a whale world (dev → Make visit test worlds). | All as on the other Carriers. | NOT TESTED | |

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
| SAVE-05 | NEW ISLAND, intro playing | Reload the page during the intro; then CONTINUE. | The island exists (MY ISLANDS lists it); CONTINUE plays its intro again from the start, then play. | NOT TESTED | M8 |
| SAVE-06 | A world made before M8 | Open it. | No intro, its buildings (and generated cottage) exactly as before, no tips. | NOT TESTED | M8 |
| INTRO-INT-01 | NEW ISLAND, intro playing | Skip with a key, a click and a tap (three islands). | Play begins at once on the new island; the intro never plays again for it. | NOT TESTED | M8 |
| INTRO-INT-02 | NEW ISLAND, reduced motion on | Make an island. | The shorter intro, then play. | NOT TESTED | M8 |
| INTRO-INT-03 | NEW ISLAND, intro playing | Switch to another tab for a while, come back. | The intro continues where it was (it does not jump ahead); sound resumes. | NOT TESTED | M8 |
| SAVE-DEL-01 | Play tab, a played world | Sidebar: "Delete this island's progress…", then double-click quickly where the button was. | A confirmation names the island and its Carrier; Cancel has focus; Delete stays greyed for about half a second; the double click deletes nothing. Cancel closes it with the world untouched. | NOT TESTED | M8 (KI-01) |
| SAVE-DEL-02 | Two saved islands | Title → ISLANDS → a row's DELETE (or X). Press Enter at once; then choose DELETE FOREVER after a second. | A DELETE THIS ISLAND? page names it; Enter at once keeps it (KEEP IT is selected); DELETE FOREVER is grey for a moment, then erases only that island; the other is untouched. | NOT TESTED | M8 |
| SAVE-DEL-03 | Touch device, two saved islands | ISLANDS → DELETE, then tap twice fast in the same place. | The second tap lands on the question, not on a delete; nothing is erased without a deliberate later tap on DELETE FOREVER. | NOT TESTED | M8 |

## The first home and housing (FIRST, HOME) — M8

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| FIRST-01 | A new island of each Carrier | Play chapter 1 from the start without help beyond the tips. | No house at first; meet, explore, gather, axe, wood, materials, build, step inside, place the potted plant all complete; about 15 minutes; nothing feels like a chore. | NOT TESTED | estimate only |
| HOME-01 | No shelter | Open HOME (1 or the menu bar). | Says how to build the first home. | NOT TESTED | |
| HOME-02 | A shelter; chapter 2 not done | HOME → UPGRADE. | Requirements listed with OK/--; UPGRADE refuses and says what is missing; nothing changes. | NOT TESTED | |
| HOME-03 | Requirements met | UPGRADE, then press CONFIRM twice quickly. | A confirmation names the cost and the furniture; CONFIRM is grey for a moment; one upgrade happens; scaffold, walls, roof, sparkles and a chime. | NOT TESTED | |
| HOME-04 | A furnished shelter (incl. a chest with items) | Upgrade to Cottage, go inside. | Nook, main room and tiled kitchen; every piece is there (bed in the nook), the chest keeps its items; a stove came with the kitchen. | NOT TESTED | |
| HOME-05 | Cottage, harmony 35, 3 finds | Upgrade to Dream Home; walk through every room. | Bedroom, study, kitchen and living room through openings; no room blocked; an armchair came with the living room. | NOT TESTED | |
| HOME-06 | A shelter close to trees or a fence | Try to upgrade. | Refused with what is in the way; moving the house (M) to open ground lets it upgrade. | NOT TESTED | |
| HOME-07 | Inside the house | Try to upgrade. | Asks to step outside first. | NOT TESTED | |
| HOME-08 | Some styles unlocked | HOME → LOOK and ROOMS: change parts, REVERT, then APPLY. | The preview changes with each choice; nothing changes in the world until APPLY; locked options say what unlocks them and cannot be applied. | NOT TESTED | |
| HOME-09 | Styles applied | Reload the page. | House level, look, room style and furniture all kept. | NOT TESTED | |
| HOME-10 | Look at each house level at the three camera modes, day and night | — | Each level reads as its own house, same pixel scale as the island and the Blobbi; nothing clipped. | NOT TESTED | visual |

## Tips and guide (TIP, GUIDE) — M8

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| TIP-01 | A new island | Play the first minutes. | One tip at a time above the prompt; each disappears when done ("NICE!"), the next after a moment. | NOT TESTED | |
| TIP-02 | A new island | Pick things up before the walk tip ends; craft before its tip. | Steps already done never show. | NOT TESTED | |
| TIP-03 | A tip showing | SKIP TIPS; reload. | No more tips on that island; SETTINGS → TIPS ON THIS ISLAND brings them back. | NOT TESTED | |
| TIP-04 | Touch screen | Watch the tips. | They say "tap" and name buttons, never keys. | NOT TESTED | |
| TIP-05 | An island from before M8 | Open it. | No tips (turn them on in the guide's Tips page if wanted). | NOT TESTED | |
| GUIDE-01 | — | ? (or F1, or GUIDE); read every page. | 16 short pages; everything they describe exists in the game. | NOT TESTED | |
| GUIDE-02 | Phone | GUIDE; tap topics. | Readable; topics change by tap. | NOT TESTED | |

## Touch on phones (TOUCH-M8) — M8

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| TOUCH-M8-01 | Phone, landscape | Open the game. | Full screen (no lab sidebar); the title readable; every page works by tap. | NOT TESTED | emulated only (KI-12) |
| TOUCH-M8-02 | Phone, portrait | Open the game. | A hint asks to turn the device sideways. | NOT TESTED | |
| TOUCH-M8-03 | Phone | Walk (drag and tap), pick up (USE), open BAG, CRAFT an axe, EQUIP it, chop. | All by touch; buttons large enough; nothing overlaps. | NOT TESTED | |
| TOUCH-M8-04 | Phone, 6 wood 3 stones | CRAFT → BUILD → move → USE builds; NEXT; CANCEL. | The mode bar shows NEXT and CANCEL; no key needed. | NOT TESTED | |
| TOUCH-M8-05 | Phone, inside the house | BAG → potted plant → PLACE → USE; HOME → ROOMS → ARRANGE → USE, STYLE, TO BAG, DONE. | Placing and moving furniture fully by touch. | NOT TESTED | |
| TOUCH-M8-06 | Phone | NEW ISLAND: TYPE A NAME, create; tap during the intro. | The phone keyboard opens; the name shows; a tap skips the intro into play. | NOT TESTED | |

## Rest, styles, growth and the turtle (REST, STYLE, GROW4, TLAYER, FEEL) — M9

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| REST-01 | A finished house, the Blobbi outside | R. | It walks to the door, goes in (the usual transition), walks to the bed, hops in and sleeps under the blanket; energy rises faster than outside. | NOT TESTED | M9 |
| REST-02 | Inside | R. | Into the bed, not below it; the prompt says R to wake up. | NOT TESTED | M9 |
| REST-03 | Asleep in bed | R; then rest again and press an arrow. | It hops out to the front of the bed both times; never through a wall. | NOT TESTED | M9 |
| REST-04 | No house; then a house with its bed removed | R. | A nap where it stands (outside / on the floor). | NOT TESTED | M9 |
| REST-05 | Two beds (a bed and a Blobbi cushion) | R from different spots; move the target bed (M) while it walks. | It goes to the nearer one; when the bed moves it follows to the new place. | NOT TESTED | M9 |
| REST-06 | Asleep in bed | Reload. | The Blobbi starts awake outside; its needs are kept. | NOT TESTED | M9 |
| STYLE-01 | A brand-new island, first home built | HOME → LOOK and ROOMS. | One open option per part (two roofs once the first home quest is done); the rest show a padlock and what unlocks them; a locked preview is greyed with a padlock; APPLY only explains. | NOT TESTED | M9 |
| STYLE-02 | Inside, move mode (M), nothing selected | T several times. | Only unlocked floors and walls cycle. | NOT TESTED | M9 |
| STYLE-03 | Play on (craft, finish quests) | — | A "New home style" notice when a style is earned. | NOT TESTED | M9 |
| STYLE-04 | An M8 save with a style that M9 locks | Change another part and APPLY. | It applies; the kept style stays. | NOT TESTED | M9 |
| GROW4-01 | A new island | Open GROWTH (L) through a few sessions. | Stage 1 asks for the first chapters' progress (not just a shelter); each stage asks more; nothing decays during breaks. | NOT TESTED | pacing |
| GROW4-02 | Requirements being met | Play. | An "Island growth: … done" notice for each requirement met. | NOT TESTED | M9 |
| GROW4-03 | A stage-3 turtle (Variant S) | Grow to stage 4 (dev stage buttons on a test world, or play). | Land over most of the shell, a ring of plates and the soil band remain; head, flippers and their motion untouched; nothing placed moved. | NOT TESTED | M9 |
| GROW4-04 | A stage-3 manta | Grow to stage 4. | Land over the central disc; the beating wings and the tail stay bare; no seams or straight edges. | NOT TESTED | M9 |
| GROW4-05 | A stage-3 whale | Grow to stage 4. | Land further toward the head and aft; blowholes and spout clear; knuckles visible; rounded ends. | NOT TESTED | M9 |
| GROW4-06 | Stage 4, any Carrier | Walk all over the new land; build and farm on it; Z through the camera modes. | Everything reachable, buildable, crisp at every scale. | NOT TESTED | M9 |
| GROW4-07 | An M8 save at stage 1–3 | Open it. | Exactly the same land and objects as before. | NOT TESTED | M9 |
| TLAYER-01 | A turtle (Variant B and Variant S) | Close-up on each flipper joint for a few paddle strokes. | The flipper base disappears under the shell's rim at every phase. | NOT TESTED | before/after in examples/m9-world |
| TLAYER-02 | A turtle at stage 3 and 4 | Same. | Same. | NOT TESTED | M9 |
| FEEL-01 | A Cottage or Dream Home | Watch it for a while, then at night. | The chimney smokes; at night the windows glow and the light around reaches further. | NOT TESTED | M9 |
| FEEL-02 | Any | Play an evening. | No extra clutter: particles stay sparse. | NOT TESTED | M9 |

## The living ocean, phase A (LISTEN, FISH, OCEAN, UPCLOSE, SEA, PERF) — M10

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| LISTEN-01 | Each Carrier (turtle, manta, whale), dev tools stage buttons | At stages 0, 1, 2, 3 and 4: walk to the Carrier's head (map: the head place); press E. | The listening spot is on the land right in front of the head at every stage, never inland or in the water; E listens (or opens the Carrier panel once known). | NOT TESTED | Automated: `tests/carrier-listen.test.ts` |
| LISTEN-02 | A grown island | Build a bench or shelter where you listen; walk back to the head. | The spot moves to free ground nearby; E still listens; the map's head place follows. | NOT TESTED | |
| FISH-01 | A rod, an island at stage 1+ (the land reaching the water) | Cast facing down, up, left and right; watch the cast in close-up. | The rod winds back, swings, and the float flies out on an arc from the rod's tip; the line always leaves the tip, never the face or body. | NOT TESTED | Automated: `tests/fishing-rod.test.ts`; images `examples/m10/fishing-*.png` |
| FISH-02 | Line out | Face up (away) and right (rod in the far hand). | The rod and the line are hidden behind the Blobbi where the body covers them; the rod's tip shows above the head when facing away. | NOT TESTED | |
| FISH-03 | Line out | Wait for a bite; reel in; also let one get away. | The line is slack while waiting and pulls straight on the bite; the rod tugs; catching works as before. | NOT TESTED | |
| FISH-04 | All four camera modes | Fish in each mode. | The rod's art reads well at every scale; the Blobbi keeps its canonical proportions. | NOT TESTED | |
| OCEAN-01 | A wide or large screen (1920×1080 or more) | Overview on each Carrier; resize the window. | No rectangle: the sea continues past the world's edge with the same streaks and waves; no seam where the world ends. | NOT TESTED | Automated: `tests/open-sea.test.ts`; images `examples/m10/ocean-*.png` |
| OCEAN-02 | Overview | Switch camera modes (Z) and walk along the coast; watch the intro cinematic. | The sea stays seamless while the camera moves and eases; the cinematic is unchanged. | NOT TESTED | |
| UPCLOSE-01 | Any island | Press Z until UP CLOSE 6X; walk around outdoors and indoors. | Crisp square pixels (no blur); the Blobbi centred and steady (no jitter); the view never shows past the world's or the room's edge. | NOT TESTED | Automated: `tests/camera-upclose.test.ts`, `tests/walk-stability.test.ts` |
| UPCLOSE-02 | Up close | Gather, chop, fish, enter the house, open menus. | Everything works as in other modes; the HUD is the original one (status card with health, hunger, energy; goal box; time), the same as at every other zoom (M10 phase B). | NOT TESTED | Images `examples/m10/camera-*.png` |
| UPCLOSE-03 | Reload the page in up close | Reload. | The game opens in up close again (the choice is remembered). | NOT TESTED | |
| UPCLOSE-04 | Phone or touch screen | Tap the camera indicator (bottom left) repeatedly. | Each tap moves to the next camera mode, through all four. | NOT TESTED | |
| SEA-01 | Any island, exploration | Watch the sea for a few minutes by day and at night. | Small fish schools in the shallows, jellyfish drifting (glowing softly at night), now and then a leaping dolphin; never crowded, never over land. | NOT TESTED | Automated: `tests/marine-life.test.ts`; images `examples/m10/wildlife-*.png` |
| SEA-02 | An island at stage 1–2+ | Stand where the land meets the sea and wait. | A curious seal surfaces, turns to watch the Blobbi and comes a little closer; "E  wave to the seal" — it rolls over; the first time a discovery (seal's sea glass, a journal note). | PASS | Owner, after M10 phase B: "marine animal interactions" work (which creature was not specified). |
| SEA-03 | Sea friends quest (after Listen to the Carrier) | Wave to the seal 3 times (over its visits). | The quest completes. | NOT TESTED | |
| SEA-04 | Night, near deep water by the island | Watch for the rare glowing ray (it may take several nights); E near it. | A softly glowing ray glides past; E records a discovery (night-lamp sketch). | NOT TESTED | rare: about one every two or three nights |
| PERF-01 | A reasonable desktop | Play each mode for a minute with the stats panel open. | About 60 FPS, no hitches when walking. | NOT TESTED | Proxy figures only: `docs/testing/perf/` |
| PERF-02 | A low-end laptop or older phone | Same. | At least 30 FPS in every mode. | NOT TESTED | Never measured on such hardware |

## The living ocean, phase B (HUD, CLEAR, EXPAND, FISHB, CANOE, SEAB, PERFB) — M10 phase B

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| HUD-01 | Desktop and phone | Press Z through all four camera modes. | The status card (portrait, health, hunger, energy), the goal box and the time look the same at every zoom. | NOT TESTED | Automated: `tests/camera-upclose.test.ts`; images `examples/m10b/browser-*-hud-*.png` |
| CLEAR-01 | An axe | Fell a tree; wait 20 s. | A stump, then clear ground: nothing drawn, the Blobbi walks over it. | PASS | Owner, after M10 phase B: clearing a tree. Automated: `tests/clearing.test.ts` |
| CLEAR-02 | A cleared spot | Place a bench, a path or a plot on it. | Allowed. Wait a long time: the tree never grows through it; remove the bench and the tree comes back later. | PARTIAL | Owner, after M10 phase B: building a house on the land of a cleared tree works (PASS). Regrowth after building there: NOT TESTED. |
| CLEAR-03 | Axe and pickaxe | Clear a bush, a small rock, a natural stump or mushroom. | One swing each; a little stick/fibre, stone, wood or mushroom; their ground is free. Signs and wells cannot be cleared. | NOT TESTED | small rocks used to be "too small to mine" (KI-48) |
| CLEAR-04 | Fell most trees on an island | Look at the shore. | Driftwood appears on the shore while fewer than 8 trees stand; picking it up gives wood. | NOT TESTED | |
| EXPAND-01 | A first house with trees or rocks round it, the Cottage's needs met | Open HOME. | It says what to clear and where ("Clear the tree to the left of your house to make room (axe)."); orange arrows mark them in the world. After clearing, UPGRADE works. | PASS | Owner, after M10 phase B: house expansion correctly identifies obstacles. |
| EXPAND-02 | A house on a cramped spot (slope, high ground) | Open HOME. | It says the land is in the way and where a move would give room; nothing moves until you move the house (M). | NOT TESTED | |
| FISHB-01 | A young island (turtle stage 0) with a rod | Face the sea across the shell and press E. | "too far to cast. the island will grow closer to the sea". After growing, casting works. | NOT TESTED | Automated: `tests/fishing-access.test.ts` |
| FISHB-02 | Fishing by day and night, from the shore and the canoe | Catch fish in many places. | Flounder by day in the shallows; mackerel in open water; moonfish only at night out at sea; the journal's FISH tab fills in. | NOT TESTED | `tests/ocean-features.test.ts` |
| CANOE-01 | *Gone fishing* done, a workbench, 8 wood, 4 sticks, 2 cloth | Craft the canoe; launch it at the shore (E). | It floats by the shore; the prompt says E get in the canoe. | PASS | Owner, after M10 phase B: canoe crafting, the unlock progression, launching. |
| CANOE-02 | Moored canoe | E to board; paddle with keys and with the touch stick; zoom through the camera modes. | A smooth hop in; gentle paddling; the camera follows without jitter; the overview still frames the Carrier. | PASS | Owner, after M10 phase B: boarding, navigation, camera zoom while navigating. The touch stick was not reported. |
| CANOE-03 | Aboard | Paddle into the Carrier, its flippers/wings/flukes, and the island; then far out. | Never on land or the animal; rough water and the current at the edge, with the message; no invisible wall elsewhere. | NOT TESTED | |
| CANOE-04 | Aboard by the shore | E to go ashore; try a blocked shore. | The Blobbi hops onto reachable ground; with no landing in reach, E says to paddle to the shore. | PASS | Owner, after M10 phase B: returning to shore and going ashore work. A blocked shore was not reported. |
| CANOE-05 | Aboard | Reload the page; grow the island while the canoe is moored. | Aboard again where it was; a canoe on ground that became land is moved to water (or back to the bag). | NOT TESTED | Still unverified by the owner (save/reload aboard). |
| CANOE-06 | Aboard with a rod | Cast in each direction; reel in. | The line leaves the rod's tip; casting works only on open water. | PASS | Owner, after M10 phase B: fishing from the canoe works. |
| SEAB-01 | Aboard, over several days | Find the bottle adrift, the kelp garden, the silver shoal (dawn/dusk). | Each can be reached and visited (E); first visits are discoveries; seaweed grows back in a day; the bottle is gone once found. | NOT TESTED | `examples/m10b/canoe-sea-features.png` |
| PERFB-01 | A reasonable desktop and a lower-end device | Play on foot and in the canoe at every zoom. | 60 FPS on the desktop, ≥ 30 on the lower-end device; no hitches when paddling. | NOT TESTED | proxy figures only: `docs/testing/perf/` |

## M10 phase C: the road to the ocean (ONB, GROWC, ACCESS, LANDC, FLAG, PLANT, TRACK, LOCK, SEAC, SAVEC, PERFC)

Every test in this section is **NOT TESTED**. Automated tests and the images in `examples/m10c/` are listed in Notes
and do not count as passes.

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| ONB-01 | A fresh browser profile | Open the game; BEGIN; choose each Carrier in turn (go back between them); name the island; CREATE. | BLOBBI PIXEL, "a little world awaits you.", BEGIN and SETTINGS; the Carrier cards; the name page; the creation cinematic, then play. | NOT TESTED | `tests/title.test.ts`, `tests/onboarding.test.ts`; `examples/m10c/browser-*-menu-new.png`, `browser-*-carrier.png` |
| ONB-02 | A saved island | Reload. | "Welcome back!", CONTINUE (name, Carrier, day) and SETTINGS; no NEW ISLAND. CONTINUE plays that island. | NOT TESTED | `browser-*-menu-returning.png` |
| ONB-03 | Two or more islands saved by an older build | Open ISLANDS. | Every island listed, the active one marked ACTIVE; opening another plays it and makes it the one CONTINUE plays; DELETE still asks first. Nothing is lost. | NOT TESTED | `tests/title.test.ts` |
| GROWC-01 | A new island, through the first home and the Carrier stone | Play on after "Something that hums". | The goal box shows "Help your island grow" with a count of what the island needs; growth (L) lists it; when ready, growing it completes the quest (a journal note) and "Listen to the Carrier" follows. | NOT TESTED | `tests/quest-tracking.test.ts`; `examples/m10c/growth-tutorial.png` |
| GROWC-02 | The island grows to stage 1 | Watch the reveal; open the map. | "The island grew", then "The shore: a path to the sea has opened!"; the map shows THE LANDING; nothing that was there moved. | NOT TESTED | `examples/m10c/sea-path-notice.png` |
| ACCESS-01 | Stage 1 on each Carrier (turtle, manta, whale) | Walk to the landing; with a canoe, launch, paddle out, come back, go ashore. | The landing is on a flank (never at the head, neck, tail, fins or wings); the canoe launches, gets out to open sea, and lands back there. | NOT TESTED | `tests/ocean-access.test.ts`, `scripts/m10c-access-scan.ts`; `examples/m10c/landing-*.png` |
| ACCESS-02 | A stage-0 island with a rod or a canoe | Face the far sea and press E. | "the ocean is still out of reach", and a notice once a minute at most: "help your island grow to open a path to the shore! (L)". The canoe recipe says so too. | NOT TESTED | `tests/fishing-access.test.ts` |
| ACCESS-03 | An island grown with an older build (stage ≥ 1) | Open it. | "The shore: a path to the sea has opened!" once; a landing appears; every building, tree and rock is where it was. | NOT TESTED | `tests/growth-stage4.test.ts` |
| LANDC-01 | An axe | Fell a tree; dig out the stump; wait for the seedling; pull it up; wait again; clear the young tree. | Each stage cleared with one swing; nothing, nothing, one log; the seedling is stepped over; the young tree blocks. | NOT TESTED | `tests/regrowth-stages.test.ts`; `examples/m10c/clearing-young.png` |
| LANDC-02 | A pickaxe | Break a large rock; clear the rubble; wait about 15 min; clear the small deposit; wait again; clear the growing rock. | One swing each; nothing, one stone, two stones; the rock forms in steps before it is whole. | NOT TESTED | |
| LANDC-03 | A seedling or forming rock nearby | Try to place a bench or till a plot on it. | Refused: "something is growing there (clear it first)". | NOT TESTED | |
| FLAG-01 | 2 sticks, 1 fibre | Craft a clearing flag (K, by hand); place it next to a felled tree; wait well past its return time. | The dotted circle shows nearby; nothing wild comes back inside it; walking under the flag works. | NOT TESTED | `examples/m10c/prepared-land.png` |
| FLAG-02 | A placed flag | Reload; grow the island; then pick the flag up (M) and wait. | The flag stays where it was; after picking it up, trees and rocks inside the circle may return. | NOT TESTED | |
| PLANT-01 | Any island | Plant a tree (P); reload at once, mid-growth and grown; grow the island. | The tree is there each time, at the same growth, in the same place. | NOT TESTED | `tests/regrowth-stages.test.ts` |
| PLANT-02 | A planted tree | Face it with the axe. | "E  dig up the tree you planted"; it is gone; no wood. | NOT TESTED | |
| TRACK-01 | An open side quest | Journal (J) → select it → PIN (or P); look at the HUD at every zoom (Z), on desktop and phone. | A small SIDE card under the main goal with its progress; UNPIN removes it; completing the quest removes it; reload keeps the pin. | NOT TESTED | `tests/quest-tracking.test.ts`; `examples/m10c/pinned-quest-*.png` |
| LOCK-01 | Listened to the Carrier, "Gone fishing" not done | CRAFT (K) → Tools. | Canoe shown LOCKED with "Complete "Gone fishing" to unlock."; pressing it makes nothing; after the quest it can be made. | NOT TESTED | `examples/m10c/locked-canoe-recipe-*.png` |
| SEAC-01 | Aboard | Paddle in all four directions; look at the canoe. | Each heading looks like a canoe; which way it points is clear. | NOT TESTED | `examples/m10c/canoe-headings.png` |
| SEAC-02 | Aboard | Paddle toward a corner and a side of the sea. | The rough water fades in along a rounded, uneven line; no straight edge; the current turns the canoe back. | NOT TESTED | `examples/m10c/rough-water-edge.png` |
| SEAC-03 | A moored canoe | Walk far away; open the bag; CALL IT BACK. | The canoe is in the bag; launching works again; never while aboard. | NOT TESTED | `tests/canoe-polish.test.ts` |
| SEAC-04 | Fish of several kinds | Look at the bag and the FISH tab. | Each fish has its own shape. | NOT TESTED | `examples/m10c/fish-icons.png` |
| SAVEC-01 | An island saved by this build | Reload aboard the canoe; reload with a pinned quest and planted trees. | Everything as it was. | NOT TESTED | `tests/save-reliability.test.ts` |
| SAVEC-02 | Development only: edit a save's `version` to 99 in localStorage | Open the island. | "Not saving: saved by a newer version of the game"; the stored record is unchanged; a backup key exists. | NOT TESTED | `tests/save-reliability.test.ts` |
| PERFC-01 | A reasonable desktop and a lower-end device | Play at every zoom: a dense island, the canoe, the sea's edge. | Smooth; no hitch near the rough water. | NOT TESTED | proxy figures only: `docs/testing/perf/` |

## M11B: accounts, languages, readable text (ACCT, LANG, READ)

Every test in this section is **NOT TESTED**. Automated tests and the images in `examples/m11b/` (made with a mocked
extension and blocked relays) are listed in Notes and do not count as passes.

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| ACCT-01 | A browser without a Nostr extension | SETTINGS → ACCOUNT; press CONNECT. | "Play freely without an account. Connect to discover your Blobbis from other worlds." (M11C copy); CONNECT says no extension was found; nothing else changes. | NOT TESTED | `tests/nostr-identity.test.ts`; `browser-*-account-guest-no-signer.png` |
| ACCT-02 | A real NIP-07 extension (Alby, nos2x...) with an account that has a profile | CONNECT; approve in the extension. | CONNECTED, the profile name, the short npub; "Your island is still saved only on this device." (M11C copy). The extension was asked only for the public key (it never shows a signing request). | NOT TESTED | mocked only: `browser-*-account-connected*.png` |
| ACCT-03 | ACCT-02 | Reject the extension's prompt instead. | "The extension said no. Nothing changed." | NOT TESTED | `tests/nostr-identity.test.ts` |
| ACCT-04 | ACCT-02 | Reload the page; open ACCOUNT. | Still connected, no new prompt. | NOT TESTED | |
| ACCT-05 | ACCT-02 | Switch accounts in the extension; CHECK THE ACCOUNT AGAIN. | The new account's name and npub. | NOT TESTED | |
| ACCT-06 | ACCT-02, a played island | DISCONNECT; play; reload. | A guest again; the island, its progress and every other island unchanged. | NOT TESTED | |
| ACCT-07 | ACCT-02 with the network offline (or relays blocked) | Open ACCOUNT. | Connected with the short npub; ADVANCED says the relays are out of reach; the game never waits. | NOT TESTED | |
| ACCT-08 | ACCT-02 | ADVANCED DETAILS. | Public key, "Browser extension (NIP-07)", profile state, relays, "read only". No secret anywhere. | NOT TESTED | `browser-*-account-advanced.png` |
| LANG-01 | A browser set to Portuguese (Brazil), fresh profile | Open the game. | Everything in Portuguese from the first frame, no English flash. | NOT TESTED | `tests/i18n.test.ts`; `browser-desktop-menu-pt-BR.png` |
| LANG-02 | A browser set to Spanish, fresh profile | Open the game; play the first quests. | Everything in Spanish. | NOT TESTED | `browser-*-es.png` |
| LANG-03 | Any browser | Change LANGUAGE on the title (button or L) and in SETTINGS, in play, with a menu open. | The change shows at once; no restart; the island and progress unchanged. | NOT TESTED | |
| LANG-04 | LANG-03 | Reload. | The chosen language is kept. | NOT TESTED | |
| LANG-05 | A Portuguese and a Spanish speaker | Play 20 minutes each; read quests, notes, the guide, tips, notices, bubbles. | Natural, warm wording; no English left in play; no awkward or wrong agreement ("a pedra", "el palo"). | NOT TESTED | 1 675 strings per language were written by hand and never reviewed by a native speaker |
| READ-01 | A laptop and a phone in landscape | Read the journal, crafting, bag, tips and the HUD at every camera zoom. | Comfortable to read; the pixel look kept. | NOT TESTED | `browser-*-journal-*.png`, `browser-*-hud-*.png` |
| READ-02 | READ-01 | TEXT SIZE small, normal, large. | Small: smaller menus and text; large: a larger HUD, larger menus where the window has room; nothing clipped; the world camera unchanged. | NOT TESTED | `tests/readability.test.ts`; `browser-*-large-*.png` |
| READ-03 | A small phone (about 667×375) | Open every menu. | Menus at 2× with the readable font (they were 1× before). | NOT TESTED | |

## M11C: who is playing, the tool hotbar, MY BLOBBIS (WHO, BAR, MINE)

Every test in this section is **NOT TESTED**. The automated tests (`tests/m11c-hud-hotbar.test.ts`,
`tests/m11c-blobbis.test.ts`) and the images in `examples/m11c/` (headless Chrome, a mocked extension, a fake relay
inside the page) are evidence for development only and do not count as passes.

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| WHO-01 | Any island, no account | Play on a laptop. | A small "Guest" chip under the status card; it never covers the goal, the toasts' reading, the prompt or menus. | NOT TESTED | `browser-desktop-guest-hotbar-empty-hands.png` |
| WHO-02 | WHO-01 on a phone in landscape | Play. | The chip is readable and does not cover the stick area, USE, the menu bar or the goal. | NOT TESTED | `browser-phone-*-guest-*.png` |
| WHO-03 | WHO-01 | Click or tap the chip. | SETTINGS opens on ACCOUNT: "Play freely without an account. Connect to discover your Blobbis from other worlds." No cloud save is promised. | NOT TESTED | `browser-*-account-from-chip-guest.png` |
| WHO-04 | A real NIP-07 extension (Brave, Alby, nos2x...) | CONNECT from the chip's page. | The chip says "Connected"; ACCOUNT says "Your island is still saved only on this device." Nothing is signed; no island is claimed. | NOT TESTED | the owner connected once in Brave before M11C and saw no prompt; see "Verifying the npub" in M11C |
| WHO-05 | WHO-04 | ADVANCED DETAILS; compare the npub with the extension's own (Brave Wallet / extension popup → account → copy npub or public key). | Both lines of the npub (and the hex key) match the extension's account exactly. | NOT TESTED | |
| WHO-06 | WHO-04 | Switch the account in the extension; CHECK THE ACCOUNT AGAIN. | The other account's npub; MY BLOBBIS shows that account's Blobbis only; a Blobbi chosen with the first account stops walking (the visiting Blobbi returns). | NOT TESTED | `tests/m11c-blobbis.test.ts` (switching) |
| WHO-07 | WHO-04 | Disable the extension; reload. | Still "Connected" (the public key is remembered), and ACCOUNT says the extension is not here right now. | NOT TESTED | |
| WHO-08 | Portuguese and Spanish | WHO-01..04 in each. | "Convidado"/"Invitado", "Conectado"; texts fit on a 667×375 phone. | NOT TESTED | `browser-phone-narrow-*-pt-BR.png`, `*-es.png` |
| BAR-01 | An island with the simple axe | Look at the bottom left. | One slot with the axe and "1"; "Empty hands" and "Q next tool" above it. No empty slots. | NOT TESTED | `browser-desktop-connected-hotbar-3-tools.png` |
| BAR-02 | Axe, pickaxe, hoe, watering can, rod | Press 1..5. | Each number takes that tool in hand (the Blobbi holds it); the same number again puts it away. Number pad digits work too. | NOT TESTED | `browser-desktop-hotbar-key-*.png` |
| BAR-03 | BAR-02 | Press Q repeatedly. | As before M11C: empty, each tool in turn, empty. The hotbar highlight follows. | NOT TESTED | `browser-desktop-hotbar-q.png` |
| BAR-04 | BAR-02 | Click slots with the mouse. | Same as the keys; clicks between slots never walk the Blobbi. | NOT TESTED | |
| BAR-05 | A phone, touch | Tap slots; walk with the stick; tap USE. | Comfortable 44 px slots; selection by tap; the stick, USE, the menu bar, the prompt and tips are never covered. | NOT TESTED | `browser-phone-*-hotbar-*.png` |
| BAR-06 | BAR-02 | Open the bag (I), the naming page of a new island, crafting; press 1..5. | The menu uses the keys (as before); the tool in hand never changes. | NOT TESTED | |
| BAR-07 | Any island | Press 0 (and Home). | HOME opens (it was key 1 before M11C); key 1 no longer opens HOME. | NOT TESTED | |
| BAR-08 | BAR-02 | Build mode (B), placing furniture, visiting another island. | The hotbar hides while the mode's own buttons show, and for a visitor. | NOT TESTED | |
| MINE-01 | WHO-04 with an account that owns V3 adult Blobbis (nostr-pet, Blobbi Island) | ACCOUNT → MY BLOBBIS. | "Looking for your Blobbis...", then the list: name, stage, generation, the pixel picture. | NOT TESTED | fake relay: `browser-*-my-blobbis.png` |
| MINE-02 | MINE-01 | Choose a V3 adult; close; play; reload. | It walks the island with its own name on the status card; the island, bag, buildings, quests and Carrier are unchanged; still there after a reload. Compare its look with nostr-pet. | NOT TESTED | `browser-*-hud-with-canonical-blobbi.png` |
| MINE-03 | An account with V1 or V2 Blobbis | Select one. | Listed with its colours and the notice "earlier generation... not ready yet"; it cannot be brought; nothing else is drawn in its place. | NOT TESTED | `browser-*-my-blobbis-v2-notice.png`, `-v1-notice.png` |
| MINE-04 | An account with a V3 egg or baby | Select it. | Listed with its colours; "only grown-up Blobbis can visit this world" for now. | NOT TESTED | `browser-*-my-blobbis-baby.png` |
| MINE-05 | An account with no Blobbis | MY BLOBBIS. | "No Blobbis were found for this account." Nothing is created; no redirect. | NOT TESTED | `browser-*-my-blobbis-empty*.png` |
| MINE-06 | Network offline | MY BLOBBIS. | "The Blobbi relays could not be reached right now..." within about 8 s, TRY AGAIN; play never waits. | NOT TESTED | `browser-desktop-my-blobbis-relays-down.png` |
| MINE-07 | MINE-02 | USE THE VISITING BLOBBI; then DISCONNECT with the canonical one chosen. | The visiting Blobbi returns each time; reconnecting the same account brings the chosen one back. | NOT TESTED | |
| MINE-08 | MINE-01 with a second device/app | Check the Blobbi in nostr-pet after playing. | Unchanged: Blobbi Pixel never published or edited anything (the extension never asked to sign). | NOT TESTED | the fake relay saw only REQ and CLOSE |

## M11C.5: the account invitation (INVITE)

All **NOT TESTED**; steps and expected results in [M11C.5](../milestones/M11C5.md) (INVITE-01..10). Automated:
`tests/m11c5-invite.test.ts`; images `examples/m11c5/`.

| ID | Status |
|---|---|
| INVITE-01 .. INVITE-10 | NOT TESTED |

## M11D.1: Baby Blobbis and the intro report (BABY, INTROFIX)

All **NOT TESTED**; steps and expected results in [M11D.1](../milestones/M11D1.md) (BABY-01..12, INTROFIX-01..03).
Automated: `tests/m11d1-baby.test.ts`, `tests/m11d1-intro.test.ts`; images `examples/m11d1/`; the dev-only lab page
`baby-lab.html`.

| ID | Status |
|---|---|
| BABY-01 .. BABY-12 | NOT TESTED |
| INTROFIX-01 .. INTROFIX-03 | NOT TESTED |

## Camera and regressions M1–M3 (CAM, REG)

| ID | Prerequisites | Steps | Expected result | Status | Notes |
|---|---|---|---|---|---|
| CAM-01 | — | Z through overview, exploration, close-up; the mouse wheel. | Each mode works; nothing in the world changes. | NOT TESTED | |
| CAM-02 | Indoors | Each camera mode. | The Blobbi at native 12/24/48 px. | NOT TESTED | |
| REG-01 | Turtle Variant B | Look at the head, flippers, shell. | Unchanged from M3.4. | NOT TESTED | |
| REG-06 | Existing turtle and manta worlds | Load them after the whale work. | Exactly as before: same species, terrain, growth, resources and finds. | NOT TESTED | Automated: pinned in `tests/whale-world.test.ts` |
| REG-02 | — | Look at the Blobbi. | The canonical V3 look. | NOT TESTED | M3.4 |
| REG-03 | — | Walk at 2× and 4×. | Smooth, no jitter. | NOT TESTED | |
| REG-04 | — | P: plant a tree. | The M1 sapling grows. | NOT TESTED | M1 |
| REG-05 | Lab tabs | Open the World and Blobbi tabs; regenerate. | The procedural lab still works. | NOT TESTED | |
