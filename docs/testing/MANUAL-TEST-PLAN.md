# Manual test plan

This plan brings together the manual checklists from the M4–M7 reports and M8 phase 0 (the playable whale)
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
| TITLE-01 | Any | Open the game (a plain link opens Play). Use arrows, Enter and Esc; open MY ISLANDS and ABOUT. | The title appears; every entry responds; Esc goes back. | NOT TESTED | M8 |
| TITLE-02 | A fresh browser profile (no saves) | Open the game. | WELCOME with BEGIN, SETTINGS, ABOUT; no CONTINUE; opening the game creates no save by itself. | NOT TESTED | M8 |
| TITLE-03 | WELCOME | BEGIN; move between the three Carriers (keys, mouse, tap). | Three animated cards (turtle, manta, whale) each with a name and a personality line; the chosen one is raised with a yellow frame and a mark; NEXT names it; a second tap on the chosen card goes on. | NOT TESTED | M8 |
| TITLE-04 | A save | CONTINUE. | The most recently played island opens; the Blobbi arrives by teleport (TELE-02); no intro. | NOT TESTED | |
| TITLE-05 | Carrier chosen | Type a name (letters, digits, space); Backspace; SURPRISE ME; on a phone TYPE A NAME. | The name shows with a caret and a count up to 16; unsupported characters never appear; SURPRISE ME suggests a name; a phone keyboard opens for TYPE A NAME. | NOT TESTED | M8 |
| TITLE-06 | Name page | CREATE ISLAND (press it twice quickly). | "THE SEA STIRS…", then the intro of the chosen Carrier on the new island, ending directly in play on that island. Exactly one new island in MY ISLANDS, with the typed name (or a generated one when left empty). | NOT TESTED | M8 |
| TITLE-07 | A saved island | ABOUT → WATCH THE WHALE INTRO; let it end or skip it. | The intro plays on a preview island; afterwards the title returns; the saved island is unchanged. | NOT TESTED | M8 |
| TITLE-08 | Saves exist | NEW ISLAND → … → CREATE. | Same steps as the first time; earlier islands remain listed in MY ISLANDS. | NOT TESTED | M8 |

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
