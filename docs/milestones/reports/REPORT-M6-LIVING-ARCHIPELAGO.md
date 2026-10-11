# M6: Living Archipelago — report

**Status:** implemented and uncommitted. M4, M5 and M6 await manual validation together. Nothing is pushed,
deployed or published. No other repository was modified: `nostr-games-inventory` was only read. No Nostr kind was
created and no event is signed or sent.

Labels: **IMPLEMENTED** · **PROTOTYPE** · **DESIGNED ONLY** · **NOT IMPLEMENTED**. The day-by-day record is in
`M6-DEVELOPMENT-LOG.md`.

## 1. Implemented

| Area | What | Where |
|---|---|---|
| Teleportation (A) | Controller with states present, departing, absent, arriving; `leaveBlobbi`, `enterBlobbi(at?)`, `cancelTransition`, `reverse`, `getPresenceState`. Departure: eyes shut, concentrate, squash, then a top→bottom dissolve with a band of light while pixels accelerate up. Arrival: a bright cluster high above, pixels falling with trails, a growing ground shadow, a bottom→top rebuild with eyes closed, then eyes open, a smile and a hop. Works in every camera mode (screen space from world positions). Gentle camera lift; reduced motion means shorter, fewer pixels, no camera move. Movement, actions and autonomy are locked while away. Presence is never saved. Sim-time based, so menus and hidden tabs pause it safely. Nine teleport sounds. Dev controls. | `src/game/teleport.ts`, `src/render/teleport-render.ts`, `LiveWorld`, dev tools |
| Audio (B) | Web Audio engine: buses, volumes, mute, music on/off, softer sound, gesture unlock, hidden-tab suspend, anti-spam gaps and voice budgets. 58 synthesized effects. Ambience beds and life. Six-mood original generative music. Settings SOUND page. | `src/audio/*`, `AUDIO-DESIGN.md` |
| UI (C) | Title screen (Continue/Start, Islands, New island with confirmation, Settings, About) over the drifting island. World selection from saves (read-only; new worlds never reuse a saved identity). Redesigned HUD (status card with portrait and icon meters, time and weather chip, goal card with progress, tool chip, item toasts). One card design system for HUD and menus; panel slide-in, hover and tooltips. Touch stick and USE button within safe areas. Reduced motion, large HUD text, focus ring, full keyboard, non-colour cues, no flashing. | `src/ui/title.ts`, `src/ui/hud.ts`, `src/ui/touch.ts`, `src/game/worlds.ts` |
| Carrier companion (D) | Listen, greet, observe (8 observations), offer (food or flowers; favourites from the Carrier's seed), rest by the head, notice its breathing. Bond. Non-punitive harmony (5 levels; never falls). Carrier panel. Save schema 8. | `src/game/carrier.ts`, `src/ui/screens/carrier.ts` |
| Exploration (F) | Island map (N): terrain, Blobbi, home, buildings, farm, visited places, found finds, the goal when it is a known place. Click to walk. Never reveals secrets. Named places with visit notices. Journal PLACES and CARRIER tabs. | `src/ui/screens/map.ts`, `src/game/places.ts` |
| Font | Added `'` `>` `<` `*` `=` (apostrophes used to render as gaps). | `src/render/live-render.ts` |

## 2. Prototype

| Area | What | Why not more |
|---|---|---|
| Whale and manta Carriers (E) | Deterministic, seed-based species. Separate layers: species, genome, cosmetics, anatomy, motion, animation. Genuinely different anatomy and motion (a fluke wave and spout; a wave along the wings). Their own island shapes (a ridge meadow with a spine path; a wide flat island with tide pools). Their own sounds and lore. An animated dev preview with growth stages. | World generation, collision, renderer parts and interactions are turtle-specific. Making them playable safely needs the species-generic layer designed in `WORLD-CARRIER-DESIGN.md` §3. Existing turtle worlds are untouched (tested). |

## 3. Architecture only (DESIGNED ONLY)

- **Carrier growth and island expansions.** The data model is implemented (`growthStage`, `applied: false`); nothing
  is ever applied to a world. Growth geometry for each species is in `WORLD-CARRIER-DESIGN.md` §4.
- **Archipelago model** (`src/game/archipelago.ts`): Carrier refs and keys, deterministic neighbours. Not saved,
  rendered or networked.
- **`ARCHITECTURE-NOSTR-MULTIPLAYER.md`** covers:
  - identities;
  - procedural sharing (seeds plus modifications);
  - discovery;
  - visiting permissions;
  - shared spaces;
  - relay and WebRTC transport;
  - a threat model;
  - NIP research;
  - labelled proposals, with no new kinds.
- **`ARCHITECTURE-CROSS-GAME-BLOBBI.md`** covers:
  - V3 identity reused, not redefined;
  - the handoff lifecycle over the teleport controller;
  - failure handling;
  - mapping to the existing `31632`/`31633`/`31634`/`1416`/`1417` inventory protocol, without competing with it;
  - security.

## 4. Tests

- **Totals:** `npm run check` passes: typecheck, **378/378 tests in 37 files**, build. Before M6 there were 300 tests; M6 adds 79 in 7 new files:

  | File | Tests |
  |---|---|
  | `teleport.test.ts` | 16 |
  | `audio.test.ts` | 19 |
  | `title.test.ts` | 13 |
  | `carrier.test.ts` | 12 |
  | `map.test.ts` | 9 |
  | `species.test.ts` | 8 |
  | `boundaries.test.ts` | 2 |
  | others | updated for schema 8 (camera, identity, crafting, living-island) |

- **What they cover:**
  - teleport lifecycle, cancel, reversal, visibility, movement lock, state preservation, camera, particle cleanup,
    reduced motion, paused (hidden) tabs, and no persistence or Nostr writes;
  - audio lifecycle with a fake AudioContext, anti-spam and budgets, settings persistence through the SOUND page,
    music determinism, form and key;
  - saved-world listing (read-only) and the exact-identity reopen;
  - title navigation, touch, the HUD's purity and its non-colour cues;
  - Carrier interactions, harmony never falling, growth never changing the world, schema 7→8 migration;
  - map coordinates and markers never revealing secrets;
  - species determinism and anatomy, the turtle untouched;
  - cross-game and network boundaries.
- **Changed existing tests:**
  - the save schema assertions (7→8, plus the `carrier` and `places` keys) in four suites;
  - an explicit 240 s timeout for `walk-stability`'s 24-track sweep, which takes about 42 s alone but went over
    60 s while another browser loaded the machine. Its assertions are unchanged.

## 5. Screenshots (`examples/living-archipelago/`)

| File | Shows |
|---|---|
| `teleport-closeup.png`, `-exploration`, `-overview`, `-closeup-reduced` | departure and arrival, 20 real frames each, plus close crops (`*-crop.png`) |
| `title.png` | the title and the islands list |
| `hud.png` | the new HUD with toasts and the tool chip |
| `panels.png` | the Carrier panel, the map, the journal's places, the sound settings |
| `carrier-{whale,manta}-{individuals,motion,growth}.png` | the prototype species |

All of these were rendered by the game's own renderers, and I looked at them while iterating.

## 6. Known limitations

- **Audio:** verified to run in Chrome (context unlocked, music scheduled, effects and beds playing) and measured
  offline, but not listened to by a person yet. The mix and taste need human ears (`out/audio-preview/*.wav`).
- **Teleport:** used by the title (arrival on play) and the dev tools. There is no player-facing "send Blobbi away"
  action yet; it is meant for future handoffs.
- **Whale and manta:** not playable (see §2). New test worlds can only be turtles.
- **Growth and expansions:** never applied.
- **Map:** shows the island only; inside a house the Blobbi is marked at its home and walking is disabled.
- **Touch:** tested with synthetic events and unit tests, not on a physical phone.
- **Font:** the HUD uses the existing 3×5 font. LARGE HUD TEXT scales it to 3×, and there is no other typeface.
- **Bundle:** 579 kB (200 kB gzipped), up from 513 kB; the dev tools are excluded (checked in `dist/`).

## 7. Manual validation

1. Run `npm run dev` and open the Play tab. The title screen appears. Use arrows, Enter and Esc; check ISLANDS and
   ABOUT. NEW ISLAND asks first and makes a new world; your other islands remain in ISLANDS.
2. CONTINUE: the Blobbi arrives from the sky (a falling cluster, a shadow, a bottom-to-top rebuild, eyes opening, a
   hop). Try Settings → REDUCED MOTION and use the dev tools' Depart, Arrive, Round trip, Cancel, Reverse, Arrive
   far, in each camera mode (Z).
3. Sound: press any key first (browsers need a gesture). Listen for footsteps by surface, tool sounds, UI clicks, the
   sea and birds by day, crickets at night (dev: +1 h), rain, indoors. Change volumes on Settings → SOUND (Tab, then
   LEFT and RIGHT); turn music off separately.
4. HUD: pick things up (toasts), equip a tool (chip), let a need drop (the "!"), check the time and weather chip. Try
   LARGE HUD TEXT.
5. Carrier: finish "Listen to the Carrier", then E at the shore opens the Carrier panel. Greet, observe, offer
   (favourites appear under LIKES), rest. Stand still by the head about 6 s. Harmony never drops.
6. Map (N): walk around to find places; click the map to walk there. Check the journal's PLACES and CARRIER tabs.
7. Touch (a phone, or the browser's device mode): drag on the world for the stick, tap to walk, use the big E.
8. Species preview: dev tools → Carrier species → Whale or Manta, New seed, Growth stage.
9. Check that your existing save loads unchanged (schema 7 migrates to 8: the Carrier bond starts fresh, everything
   else is as before).

## 8. Remaining backlog

- A species-generic Carrier layer so the whale and manta become playable.
- Applying growth with a migration plan.
- A player-facing teleport moment and cross-app handoff tokens.
- Local world-card visits (multiplayer step 1).
- Audio tuning by ear.
- Accessibility: a larger-font option for menus and a high-contrast palette.
- On-device mobile testing.
- Map indoors.
- Everything in ROADMAP "M7 and beyond".
