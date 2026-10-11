# M6 — Living Archipelago: development log

Status: in progress, uncommitted. M4 and M5 are uncommitted and NOT manually approved; M4, M5 and M6 will be
validated together. Nothing is pushed, deployed or published; no other repository is modified; no Nostr kind is
created or published.

## Plan

| Priority | Batch | Parts |
|---|---|---|
| P0 | 1. Teleportation controller, departure/arrival effect, camera choreography, dev controls | A |
| P0 | 2. Audio engine (Web Audio), synthesized SFX, ambience, procedural music, settings | B |
| P0 | 3. UI: title screen and world selection, HUD redesign, menu design system, touch joystick, accessibility | C, I |
| P1 | 4. World Carrier interactions, bond, island harmony, growth data model | D |
| P1 | 5. Island map, places and observations journal | F1, F2 |
| P2 | 6. Two new World Carrier species: species-aware generation, previews, test worlds | E |
| P3 | 7. Architecture: Nostr multiplayer, cross-game Blobbi, World Carrier design, audio design | F3, G, H |
| — | 8. Report, roadmap, final validation | L |

Labels used in the report: IMPLEMENTED · PROTOTYPE · DESIGNED ONLY · NOT IMPLEMENTED.

## Journal

### Start
- Baseline: M3.4 committed (`9d0c99f`); M4 + M5 uncommitted; 300 tests passing; save schema 7.

### Batch 1 — Teleportation (P0, Part A) — IMPLEMENTED
- `src/game/teleport.ts`: `TeleportController`. States present / departing / absent / arriving, plus
  `leaveBlobbi`, `enterBlobbi`, `cancelTransition`, `reverse` and `getPresenceState`.
  - Everything visual is a pure function of (transition seed, sim time): the visible fraction, eyes, squash, shadow,
    camera lift and particles. No particle objects exist, so nothing needs cleaning up.
  - Time is world sim time, so menus and hidden tabs pause a transition instead of breaking it.
  - Presence is never saved, so a reload is always present.
  - Reduced motion is fixed per transition (0.6× duration, 16 instead of 44 pixels, no camera lift).
- `LiveWorld`: movement, actions and autonomy are locked while not present.
  - Events go out as `teleport-*` sound hooks; the Blobbi reacts 'happy' with a hop on arrival.
  - `enterBlobbi(at)` lands on the nearest free ground; `cameraTarget(viewHeight)` lifts the camera by up to 20% of
    the view.
- `src/render/teleport-render.ts`, drawn by the ViewRenderer in screen space, so it works in every camera mode:
  - squash, then a dithered band of light along the cut;
  - top→bottom dissolve and bottom→top rebuild;
  - a rim glow and a dithered ground shadow;
  - world-pixel-sized particles with trails, smaller far up the sky. Altitude is compressed up close so the climb
    stays on screen.
  - Only the lids change: the identity is otherwise canonical, and a test checks that the pixels below the cut equal
    the canonical sprite.
- Settings: REDUCED MOTION (the default follows `prefers-reduced-motion`; persisted per browser).
- Dev tools: Depart, Arrive, Round trip, Cancel, Reverse, Arrive by house, Arrive far, and the reduced-motion
  preview; the inspector shows presence.
- `scripts/teleport.ts` writes frames to examples/living-archipelago (closeup, exploration, overview, reduced) and
  close crops. I inspected the frames and iterated three times:
  1. Particles were too small.
  2. The arriving cluster was off screen in close-up, so altitude is now compressed.
  3. Contrast on bright grass was too low, so the halo now applies at small scales.
- Tests: `tests/teleport.test.ts`, 16 tests. 316/316 pass overall.

### Batch 2 — Audio (P0, Part B) — IMPLEMENTED
- `src/audio/sfx.ts`: 54 synthesized effects as data, each a few voices (oscillator or filtered noise, glide,
  soft envelope).
  - Covers footsteps by surface, doors, tools and farming, crafting, cooking, failure, recipe discovery, UI,
    quests, discoveries, the Blobbi (eat, pet, happy, curious, sleep, wake, friendship), the Carrier (hum,
    breath, call), ambient life (bird, cricket, owl, splash) and nine teleport phases.
  - Each effect has a gap for anti-spam. No samples.
- `src/audio/music.ts`: an original generative score.
  - Six moods: day (F major), night (A aeolian), rain (D dorian), indoor (C major music box), mystery
    (E lydian) and special (G major).
  - 16-bar form A A' B A'' with a density arc; one seeded motif per cycle; the lead snaps to chord tones on
    strong beats. The lead and bells are folded into sweet ranges (a test caught bells at MIDI 108).
  - `composeBar(mood, bar, seed)` is pure.
- `src/audio/engine.ts`: `AudioEngine`.
  - Buses: sfx, ui, ambient and music (with a soft feedback echo), into master, a compressor, then the
    output.
  - Settings: master, music, effects and ambience volumes; mute; music on/off; softer sound.
  - Lifecycle: nothing is created before the first gesture (`unlock`); `suspend` and `resume` for hidden
    tabs; works without Web Audio.
  - Voice budgets: 14 voices for effects, 24 for music. Noise beds (ocean, wind, rain, room) are created
    lazily. Music is scheduled bar by bar with lookahead.
  - OUTPUT_GAIN of 3 comes from offline measurement: music about -24 dBFS RMS, effects peaking -10 to
    -30 dBFS, no clipping.
- `src/audio/director.ts`: `GameAudio` reads the world and never writes it.
  - `moodFor` and `ambientMix` are pure.
  - Special moments: discovery, friendship and arrival take over for 22 s.
  - A new mood must hold for 3 s before the music changes, except going indoors and special moments.
  - The sea swells with a 9 s Carrier breath. Event rates: birds by day, crickets and owl at night, splash
    near the rim, Carrier calls.
- World hooks added: chop, mine, plant, water, pet, happy, sleep, wake, fail, recipe, and step-<surface>
  every 7 px walked (grass, path, sand, wood, shallow).
- GameUI `onSound`: ui-open, ui-close, ui-select, ui-confirm, ui-deny.
- Settings has GAME and SOUND pages. On the SOUND page LEFT and RIGHT change volumes. The audio mix is
  stored in `blobbi-pixel-lab:audio` (per browser, never in a save).
- `scripts/audio-preview.ts` renders WAVs of every mood and an effects reel (with an index) into the ignored
  `out/audio-preview`, and prints peak and RMS levels.
- Browser check, Chrome on the dev server (separate port, separate storage):
  - A real click created and unlocked the AudioContext; its state was `running`.
  - Driving frames scheduled music notes, played effects (steps, teleport), and brought the ocean and wind
    beds up.
  - The arrival switched the mood to `special`. No app errors.
  - I can't hear audio from here, so whether it actually sounds good needs a person to listen.
- Tests: `tests/audio.test.ts`, 19 tests with a fake AudioContext.

### Batch 3 — UI (P0, Part C) — IMPLEMENTED
- Title screen (`src/ui/title.ts`), drawn over a slowly drifting, dimmed view of the island:
  - Menu: CONTINUE or START, ISLANDS, NEW ISLAND (behind a confirmation page), SETTINGS, ABOUT.
  - Input: keyboard, mouse and touch. A non-colour selection mark (a triangle).
  - Leaving the title teleports the Blobbi in.
- Saved worlds (`src/game/worlds.ts`) are read-only over the saves:
  - `parseIdentity` turns a save key back into options; `worldName` gives stable friendly names ("Dewy Shell");
    a last-played index orders CONTINUE.
  - `newWorldSeeds` never picks an identity that already has a save.
  - **Bug found by test:** enlarged shells grow the frame, so the stored size is not the requested one, and
    reopening a world would have started a different world. `resolveFrame` finds the request that reproduces the
    exact identity, or refuses to open.
- HUD redesign (`src/ui/hud.ts`, design tokens in `DESIGN`): clipped-corner cards with a lit top edge.
  - **Status card:** portrait (the canonical sprite), name, friendship title or AWAY, three meters with
    icons + 10 segments + a steady "!" when low (never colour alone, nothing flashes), carried things.
  - **Other cards:** a time and weather chip (sun, dusk, moon, cloud, rain); a goal card with a progress bar; a
    tool chip with the key; item-gained toasts that merge repeats, slide in (not with reduced motion) and run on
    sim time, so they are deterministic and pause with menus.
- Menus: panels use the same cards. A 0.14 s slide-in on open (not with reduced motion), hover highlights on
  buttons and slots, and delayed tooltips (item name × quantity in the bag and chest).
- Touch (`src/ui/touch.ts`):
  - A floating stick: press and drag anywhere on the world, 8-way, with a dead zone; the base follows a long
    drag. A short tap still walks to the spot.
  - A large USE button, shown once touch is seen, kept inside the CSS safe-area insets (`viewport-fit=cover`).
  - `touch-action: none` on the canvas.
- Accessibility: REDUCED MOTION (defaults to the system preference), LARGE HUD TEXT (3×), the existing menu scale,
  a visible canvas focus ring, full keyboard navigation everywhere, icons on every meter, and no flashing.
- Browser check (Chrome, separate port and storage): the title renders, the ISLANDS page lists the saved world,
  and Enter opened it with the Blobbi arriving and the HUD reading AWAY during the teleport.
- Tests: `tests/title.test.ts`, 13 tests (worlds, title navigation, touch, HUD).
  - Full suite 348/348.
  - `walk-stability`'s 24-track sweep got an explicit 240 s timeout. It takes about 42 s alone but went over 60 s
    while the user's other browser was busy; its assertions are unchanged.
- Build: 558 kB (192 kB gzipped); the dev tools are still absent.

### Batch 4 — The Carrier as a companion (P1, Part D) — IMPLEMENTED (growth: DESIGNED, data model only)
- `src/game/carrier.ts`: bond, observations, offerings, harmony, and the growth model.
- `LiveWorld`:
  - `greetCarrier` counts once a day, and the turtle blinks and glances back with its existing animations.
  - `observeCarrier`: eight observations, one at a time, some only by day or only at night; kept for the journal.
  - `offerToCarrier`: food or flowers. Two favourites come from the Carrier's own seed; a favourite counts more and
    is remembered as "liked".
  - `restByCarrier`: a nap on the shore by the head.
  - Breathing is found, not pressed: standing still by the head for 6 s.
  - Listening now earns bond, and the hum's words warm with harmony.
- E at the shore listens the first time (the M5 quest). Once the 'carrier' quest is done it opens the Carrier panel
  (`src/ui/screens/carrier.ts`): interactions, an offer picker, harmony with a marked level ladder and its parts,
  observations, discovered likes, and the growth stage.
- **Harmony is non-punitive by construction.** It is built only from monotonic inputs (bond, lifetime tallies,
  finds, days), so removing buildings or neglecting needs never lowers it. A test checks 200 random monotone
  steps. Harmony feeds the audio (more birds and life) and the hum's words.
- **Growth** (young, grown, great, ancient) and four planned island expansions (meadow, grove, tide pools,
  terrace) are computed and shown, with `applied: false`. A test checks that after days of interactions the
  turtle, objects and terrain are identical to a fresh generation.
- No anatomy, face, shell or coordinate changed: the Carrier answers only with its existing blink and glance.
- Save schema 8 adds `carrier` and `places`. A schema 7 record migrates to a fresh bond; malformed fields are
  sanitised. The two older save tests were updated for the new version and keys.
- Tests: `tests/carrier.test.ts`, 12 tests.

### Batch 5 — Map and exploration (P1, Part F) — IMPLEMENTED (archipelago: DESIGNED)
- `src/game/places.ts`: named places found from the world alone (the Carrier's head, still pond, old grove, flower
  meadow, little cliff, tail end), each snapped to reachable ground. Visiting one gives a notice, adds it to the
  journal and the map, and is saved.
- Map (`src/ui/screens/map.ts`, key N, and MAP on the menu bar):
  - Terrain drawn small from the world; markers for the Blobbi, home, buildings, farm, visited places, found finds,
    and the goal when it is a known place.
  - Each marker has its own shape, with a legend. Labels avoid overlaps and have a dark backing.
  - Clicking the map or picking a place makes the Blobbi walk there.
  - Never shows unfound discoveries or unvisited places (tested).
- Journal: new PLACES and CARRIER tabs; unknown entries show as ???.
- Font: added `'` `>` `<` `*` `=`. Apostrophes used to render as gaps ("CARRIER S HEAD").
- `src/game/archipelago.ts` (architecture only): `CarrierRef`, `ArchipelagoEntry`, carrier keys, and deterministic
  `neighbours(home)`. Not saved, rendered or networked.
- Hits now receive the press point in panel pixels (the map uses it).
- `scripts/living-archipelago.ts` writes title.png, hud.png and panels.png (Carrier, map, journal places, sound
  settings), which I inspected.
- Tests: `tests/map.test.ts`, 9 tests.

### Batch 6 — Two new World Carrier species (P2, Part E) — PROTOTYPE (deterministic generation + animated preview)
- `src/carriers/common.ts`: smooth outlines, polygon masks, body shading (the lab's banded rule), value noise,
  the island top (a wobbly coastline clipped to the body, lit ground, a species fringe, ground features, plants
  from the object generators), a calm sea, and a soft wake.
- `src/carriers/whale.ts`, the Ridge Carrier:
  - Body: a long body with a blunt barnacled head facing the viewer, eyes at the sides, and twin blowholes that
    spout every 11 s.
  - Fins and flukes: very long pectoral fins with tubercles (pale on some individuals) and wide notched flukes.
  - Island: a long, narrow ridge meadow with a path down the spine, and a knuckled ridge behind it.
  - Motion: the flukes rise and fall (foreshortened), the fins sway and the spout cycles.
  - Growth: the island lengthens toward the tail and never toward the blowholes.
- `src/carriers/manta.ts`, the Wing Carrier:
  - Body: a wide diamond with swept wing tips, cephalic horns at the head, and a tail whip behind.
  - Markings: tapered pale shoulder chevrons and its own spots.
  - Island: wide and flat on the disc, with a sand fringe and tide pools where it meets the wings.
  - Motion: a wave out along the wings (tips rise and fall, the middle and the island stay level), and the tail
    sways.
  - Growth: the island widens toward the wings.
- Generation is separated into species constants, genome (`shape` stream), cosmetics (`cosmetic` stream), anatomy,
  pose and render. Everything is a pure function of (seed, size, time, stage).
- `src/carriers/species.ts`: personality, movement, environment, island, growth, sounds and lore for turtle, whale
  and manta. New synthesized sounds: whale-song, whale-blow, manta-call, manta-glide.
- **Not playable.** World generation, terrain classes, collision, the renderer's animated parts and the Carrier
  interactions are turtle-specific. A playable whale or manta world needs a species-generic carrier layer (designed in
  WORLD-CARRIER-DESIGN.md). Doing that now would risk the existing turtle worlds, so the brief's fallback applies: a
  polished dev preview.
  - Dev tools "Carrier species" shows an animated canvas: species, new seed, growth stage.
  - A test asserts `src/world` and `LiveWorld` never import `src/carriers`, and that the turtle-0 identity is unchanged.
- Iterated on real frames four times:
  1. The fins were sticks: widened.
  2. The sea noise was too busy, and the wake ring looked like a sticker outline.
  3. The manta's head and tail were mirrored, and its island hid the chevrons.
  4. The chevron slabs were blocky (now tapered), and the wing motion was invisible (amplitude doubled).
- `scripts/carriers.ts` writes individuals, motion and growth sheets for each species.
- Tests: `tests/species.test.ts`, 8 tests.

### Batch 7 — Architecture (P3, Parts F3, G, H) — DESIGNED ONLY
- `ARCHITECTURE-NOSTR-MULTIPLAYER.md`: identities, procedural sharing (seeds plus modifications), discovery,
  visiting permissions, shared spaces, transport (relays versus WebRTC), threat model, NIP research, labelled
  proposals, and no kinds claimed.
- `ARCHITECTURE-CROSS-GAME-BLOBBI.md`: V3 identity reused, the handoff lifecycle over the teleport controller,
  failures, mapping to `nostr-games-inventory` (31632/31633/31634/1416/1417; that repository was read only), and
  security.
- `WORLD-CARRIER-DESIGN.md` and `AUDIO-DESIGN.md`.

### Batch 8 — Validation and report
- `tests/boundaries.test.ts`: no network or signing code anywhere in `src`; saves belong to worlds, not Blobbis.
- Two older suites updated for schema 8 (crafting's migrated-record shape, living-island's version).
- `npm run check`: typecheck, 378/378 tests (37 files), build 579 kB (200 kB gzipped). Dev tools are absent from
  `dist/`.
- Final browser pass (Chrome, separate port and storage): title, CONTINUE, the arrival, walking, then N opens the
  map. No app errors.
- `REPORT-M6-LIVING-ARCHIPELAGO.md` and ROADMAP updated. Nothing committed, pushed or published.
