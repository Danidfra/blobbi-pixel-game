# M7: Living Worlds — report

**Status:** IMPLEMENTED — AWAITING MANUAL VALIDATION. M4, M5, M6 and M7 are all uncommitted. Nothing is pushed,
deployed or published, no other repository is modified, and no Nostr event is created.

The day-by-day record is in `M7-DEVELOPMENT-LOG.md`.

## 0. A disclosure first

During M6's browser checks I opened the `seed=blobbi` world in Play mode on port 5199. My notes say that origin's
storage held a pre-existing save there that was not mine. Loading migrates a save to the current schema, and autosave
then rewrites it, so that record is very likely now a schema 8 record. Its contents are carried over by the migration
(bag, buildings, progress), but it is no longer byte-identical to what was there. I cannot restore the original. For
M7, browser testing used a separate port (5200, its own empty storage) and test seeds only.

## 1. Implemented features

| Feature | Status | Where |
|---|---|---|
| Procedural island growth: 3 stages, new land over the carrier's free surface, deterministic, versioned | IMPLEMENTED | `src/world/growth.ts` |
| Stable coordinates: land only ever added; existing objects keep index and place; the turtle untouched | IMPLEMENTED (tested) | `growWorld`, `tests/growth.test.ts` |
| Five biomes: flower meadow, little woodland, rocky garden, shore turf, mushroom grove, each with vegetation, resources, a place and a discovery | IMPLEMENTED | `BIOMES`, `growth-content.ts`, `content/discoveries.ts` |
| Growth progression (harmony, quest, care, harvests, building, finds), never automatic | IMPLEMENTED | `src/game/growth-progress.ts` |
| Growth panel (L, and from the Carrier panel) and a "ready" notice | IMPLEMENTED | `src/ui/screens/growth.ts` |
| Growth reveal: land spreading from the old coast, plants appearing, sparkles, Carrier blink, camera pull-back, sound and music | IMPLEMENTED | `LiveWorld.startReveal`, `LiveRenderer` |
| Carrier growth geometry per species (turtle: round its shell; manta: along its wings) | IMPLEMENTED | `planV1` |
| Playable manta world (terrain, navigation, resources, building, farming, housing, saving, cameras, animated wings) | IMPLEMENTED | `src/carriers/manta-world.ts`, `creature-render.ts` |
| Local world visiting with teleport handoff, read-only visitor, return home | IMPLEMENTED (local prototype) | `src/game/visiting.ts`, playground |
| World discovery screen (Y): name, species, stage, owner, preview, VISIT / RETURN HOME | IMPLEMENTED | `src/ui/screens/worlds.ts` |
| Save schema 9: growth (stage, version, history, regions), species, generator | IMPLEMENTED | `src/game/persistence.ts` |
| Dev tools: growth stage, grow with reveal, requirements, reset, inspect world, visit test worlds, visit, return | IMPLEMENTED (dev builds only) | `src/dev/dev-tools.ts` |

## 2. Growth stages

| Stage | Name | Adds | Requirements (all lifetime counts) |
|---|---|---|---|
| 1 | The shore widens | shore-turf ring + flower meadow | harmony 15; Build a shelter; care 6; harvests 3; built 3; finds 1 |
| 2 | Groves and stones | little woodland + rocky garden | harmony 35; Make it home; care 15; harvests 10; built 7; finds 3 |
| 3 | The deep green | mushroom grove + outer shore | harmony 55; Listen to the Carrier; care 30; harvests 20; built 12; finds 5 |

Land added by stage 3:

| Carrier | Land added |
|---|---|
| Turtle, Variant B (default) | about +20 % (seeds 0, 1, 2, 3, 7, and an island seed) |
| Turtle, Variant A | +33 % |
| Turtle, Variant C | +9 % |
| Manta | +51 % |
| Turtle, Variant 0 | cannot grow (no free shell) |

## 3. Architecture

### Growth

- **Inputs.** `growWorld(base, stage, version)` is a pure function of the stage-0 world and the stage.
- **Coastline.** The grown coastline is the base `Island` record with a ring factor and extra coast lobes (`cape`
  features), evaluated with the base terrain's own edge noise, so the new coast looks like the old one.
- **Limit.** A per-angle limit keeps land on the carrier's free surface:
  - turtle: shell-ring pixels, keeping a ring of plates and the lip visible;
  - manta: back pixels at least 6 × scale from the body's edge.
- **Objects.** New objects are appended. Each stage's objects are placed on that stage's terrain, so stage s is an
  exact prefix of stage s+1.
- **What may change.** Only free-surface pixels become land. The old coast band, where it is now inland, becomes plain
  grass (on the manta, its beach too). Both are walkable before and after.
- **Base-derived content.** `LiveWorld` reads the save first and stands on the grown world. Everything base-derived is
  computed on a stage-0 collision map and navigation grid: resources, discoveries (with base resources as the avoid
  list), places and the listening spot. It is bit-identical at every stage (tested). Grown land adds its own
  resources (`g:<region>:<kind>:<n>`, kept only where reachable), places (`region:<id>`) and discoveries.
- **Growing.** Growth is applied by saving the next stage and rebuilding the world from the save, the same path as a
  reload, so a grown world after a reload is exactly the grown world before it.

### Generator versioning

- `GROWTH_VERSION = 1` is recorded in the save, with a history entry per stage.
- `growWorld` refuses an unknown version.
- A save with an unknown growth version is opened read-only: no store, so it is never overwritten and never regrown
  differently.
- `generator` (the base world generator, `m6.0`) and `species` are recorded for compatibility. Future growth versions
  must keep the old branch.

### Carrier geometry

- **Turtle.** The animal is untouched: the head, neck, flippers, face, expressions and animation sprites are
  pixel-identical (tested), and the Variant B shell keeps its exact plate layout. The shell painter takes the grown
  coast only for its covered and soil test (`ShellSurfaceContext.land`), so the soil band follows the new coast while
  every visible plate stays where it was. Growth means the island covers more of the shell, from about 70 % to about
  85 %; the shell does not grow, because that would change the canvas and the carrier's identity.
- **Manta.** A still core (|u| ≤ 0.74) carries the land; the wing tips and whip animate around it. Its growth runs
  out along the wings.
- **Whale.** Its ridge geometry is designed (M6) and not playable.

### Species support

| Species | Status |
|---|---|
| Turtle | playable (default), grows |
| Manta | playable (new in M7), grows |
| Whale | PROTOTYPE: animated dev preview; its ridge island is too narrow for building and farming |

### World visiting and permissions

- **Separation.** `WorldRef` (identity, params, name, owner), `PlayerId` (local id), the Blobbi (`BlobbiSource`,
  unchanged), ownership (an owners index), `VisitorPermissions` (READ_ONLY / OWNER), `VisitTransport` (local
  storage, read-only), and persistence (the host save is only read; the home save is written only at home).
- **Session.** `VisitSession` switches worlds only while the Blobbi is absent (the teleport is the handoff). The URL
  and world settings never change during a visit, so a reload comes home.
- **The visitor.** Carries an empty bag of its own and keeps no store. It may walk, look, open doors, listen and
  read. It may not gather, farm, build, move, craft, use chests, the kitchen or workbench, feed, offer, equip or grow.
  The host's quests neither advance nor pay rewards.

## 4. Save changes (schema 9)

- **New fields:**
  - `growth`: `{ stage, version, history: [{ stage, worldTime, version }], regions }`;
  - `species`: `'turtle' | 'manta' | 'whale'`;
  - `generator`.
- **Migration.** Every older record (1–8) loads at stage 0, even one carrying a stray `growth` field. A migration
  never grows an island; growth happens only when the player chooses it in the growth panel.
- **Unchanged.** Existing terrain, constructions and coordinates (island-frame building coordinates, as before).
- **Visit state.** The visit itself is never saved.

## 5. Tests

- **Totals.** `npm run check`: typecheck, **409/409 tests in 40 files**, and build (619 kB, 215 kB gzipped; dev tools
  absent).
- **New in M7:** 31 tests.

  | File | Tests | What it covers |
  |---|---|---|
  | `growth.test.ts` | 15 | determinism, stable coordinates, the turtle untouched, base content identical, buildings / collected / bag preserved, navigation and farming on grown land, progression, migration, unknown version read-only |
  | `manta-world.test.ts` | 9 | generation, identity, land and beach, navigation, resources, Carrier, building, housing, farming, save, every camera mode, wing animation, growth geometry |
  | `visiting.test.ts` | 7 | read-only host, permissions, session, round trip with the teleport handoff, reload recovery, transport, player id |

- **Updated for schema 9 and M7:** camera, identity, crafting, living-island, carrier, audio (the `grow` effect)
  and species (the import guard now checks runtime imports).
- **Browser (Chrome, port 5200, test seeds)** — automated checks, not human approval:
  - growth with the reveal, the camera return and the notice;
  - Worlds screen, visit the manta, gathering refused;
  - reload mid-visit comes home; visit a grown turtle; return home with the bag unchanged;
  - no console errors.

## 6. Images (`examples/living-worlds/`)

| File | Shows |
|---|---|
| `growth-stages.png` | stages 0–3 |
| `growth-reveal.png` | the reveal, 8 frames |
| `growth-regions.png` | each region up close |
| `manta-overview.png`, `manta-exploration.png`, `manta-closeup-head.png`, `manta-wingbeat.png` | the manta world |

Scripts: `npx tsx scripts/growth.ts`, `npx tsx scripts/manta-world.ts`.

## 7. Known limitations

- **Turtle growth is modest** (about +20 % land on Variant B): the land can only grow over the shell ring without
  changing the approved shell. New regions are long strips at the coast rather than big new areas.
- **Grown land discoveries:** the five biomes have one discovery each; their quests are not part of the story.
- **Whale:** not playable.
- **Visiting** is local only: this browser's saves. The visitor's own Blobbi care is not carried; the visitor walks
  with the host world's companion needs, which are not saved.
- **Manta:** there is no sea fishing (the sea is beyond its body); pond fishing works.
- **Previews.** The Worlds preview generates the selected world once (up to about 1 s on first selection).
- **Map.** A manta world's map shows the still core; the wing tips are drawn only in the game.
- **No human validation yet:** gameplay feel, the growth pacing and audio taste need a person.

## 8. Manual validation checklist

1. Play a test world (dev tools: Test world). Dev → Meet requirements → Grow + reveal. Watch the land spread from the
   coast, plants appear, the camera pull back and return, and the "The island grew" notice.
2. Open L (growth): stage, progress, requirements, the next unlock and grown regions. Check that nothing grows without
   pressing LET THE ISLAND GROW and confirming.
3. Walk into each new region (map N shows them once visited). Gather there, till and plant, and build a fence on new
   land.
4. Reload: the island is still grown and everything is where it was.
5. Title → NEW ISLAND → A MANTA ISLAND. Play: walk, gather, build a shelter, go inside, farm, listen to the Carrier
   (manta observations), and watch the wings beat. Grow it (dev tools) and see the land grow toward the wings.
6. Dev → Make visit test worlds. Y opens WORLDS: check names, species, stage, owner and preview. VISIT: the Blobbi
   teleports away and arrives on the other island. Try to pick something up (refused), walk, listen. Y → RETURN HOME:
   back on the same spot, with the same bag.
7. During a visit, reload the page: you are home.
8. Check that an existing save from M6 or earlier loads at stage 0 with everything in place.

## 9. Remaining work

- A larger turtle growth path (a carefully migrated shell enlargement) if wanted.
- Biome quests.
- A playable whale.
- Carrying the visitor's own care, and visiting with a friend over a network (ARCHITECTURE-NOSTR-MULTIPLAYER.md:
  world cards, presence).
- Sea fishing on manta worlds.
- Map wing tips.
- Human validation of M4–M7.
