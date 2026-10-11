# M7 — Living Worlds: development log

Status: in progress, uncommitted. M4, M5 and M6 are uncommitted and NOT manually approved; M4–M7 will be validated
together. Nothing is pushed, deployed or published; no other repository is modified; no Nostr event is created.

Labels: IMPLEMENTED · PROTOTYPE · DESIGNED ONLY · PLANNED · NOT TESTED.

## Plan

| Priority | Work |
|---|---|
| P0 | Island growth with stable coordinates; save schema 9; migration never grows |
| P1 | Growth progression and UI; five biomes; Carrier reactions; growth reveal |
| P2 | One additional species playable (properly), species-aware growth geometry |
| P3 | Local world visiting with teleport handoff, read-only visitor permissions, return home |
| P4 | Local world discovery interface; polish |
| — | Docs (REPORT-M7, this log, ROADMAP), then the full documentation pass the user asked for |

## Journal

### A note carried over from M6

My project memory says port 5199's localStorage holds a pre-existing `seed=blobbi` save that is not mine and must not
be opened in Play mode there. During M6's browser checks I did open that world in Play mode on port 5199, so that
record was very likely migrated to schema 8 and rewritten by autosave. Migration keeps its contents (bag, buildings,
progress), but it is no longer byte-identical to the original. Reported in REPORT-M7. From now on: browser tests use
another port and a test seed only.

### Batch 1 — Island growth (P0) — IMPLEMENTED
- `src/world/growth.ts`: `growWorld(base, stage, version)`, pure and versioned (`GROWTH_VERSION = 1`).
  - The grown coastline is the base `Island` record with a ring factor and extra coast lobes (`cape`
    `CoastFeature`s), drawn with the base terrain's own edge wobble.
  - An allowed radius is measured per angle, so the land stays inside the shell and a ring of plates plus the lip
    stays visible.
  - Only shell-ring pixels (class RIM) become land. The old coastline's edge band becomes plain grass where it is now
    inland; nothing else in the base changes.
  - New objects are appended, so existing indices never move. Each stage's objects are placed on that stage's
    terrain, so stage s is an exact prefix of stage s+1.
  - Variant 0 (no free shell) cannot grow.
- Stages, with lobe bearings from the world seed:
  1. "The shore widens": shore-turf ring + flower meadow.
  2. "Groves and stones": little woodland + rocky garden.
  3. "The deep green": mushroom grove + outer shore.
- Land added on every seed tested: Variant B (the default) +19–20 %, A +33 %, C +9 %. The invariant check passed
  for 6 seeds × 3 variants.
- New terrain classes MOSS, GRAVEL and CLOVER: walkable, buildable and farmable, each with its own painter and map
  colour.
- The shell painter takes the grown coast (`land`) only for its covered/soil test. The plate layout still follows
  the base island, so the visible plates keep their exact places. Head and flipper sprites are pixel-identical
  (tested).
- `LiveWorld` reads the save first and stands on `growWorld(base, stage)`. Everything base-derived is computed on a
  stage-0 collision map and navigation grid, so it is bit-identical at every stage (tested): resources, discoveries
  (with base resources as the avoid list), places and the listening spot.
- Grown land adds:
  - resources per biome (`g:<region>:<kind>:<n>`), kept only where reachable;
  - a named place per region;
  - one discovery per biome (a separate list: pressed bloom, carved acorn cap, geode, sea glass, glowcap), each with
    a new lore note.
- Save schema 9 adds:
  - `growth`: stage, version, history and region ids;
  - `species` and `generator`.
  - Older records load at stage 0, so migration never grows an island, even with a stray `growth` field.
  - An unknown growth version makes the world read-only (no store) instead of regrowing it differently or
    overwriting it.
- Tests: `tests/growth.test.ts`, 15 tests. Older suites updated for schema 9.

### Batch 2 — Progression, panel, reveal (P1) — IMPLEMENTED
- `src/game/growth-progress.ts`: each next stage needs island harmony, a story quest (shelter, home, carrier), care
  (fed + petted), harvests, building and decorating, and finds. All are lifetime counts, so progress never goes
  backwards; there are no timers. Ready ≠ grown: the island grows only when the player chooses.
- `LiveWorld.growIsland()` saves the next stage and its history entry. The playground rebuilds the world from the save
  (exactly as a reload) and keeps the Blobbi where it stood.
- The reveal (`startReveal`): new land spreads from the old coast, ordered by a flood fill. The renderer blends the
  previous stage's static layer into the new one pixel by pixel, and new plants appear as the front reaches them.
  - Sparkles and leaves run along the front.
  - The Carrier blinks, the Blobbi gets excited, and the `grow` sound (a swell plus chimes) starts the music's
    special mood.
  - The camera pulls back to overview and returns (not with reduced motion).
  - Ends with a notice.
- Growth panel (`src/ui/screens/growth.ts`, L, and ISLAND GROWTH in the Carrier panel):
  - stage, a progress bar, each requirement marked DONE or with its count, what the next stage adds;
  - the grown regions (NEW / VISITED) and the stage ladder;
  - LET THE ISLAND GROW, with a confirmation.
- A one-time notice when the island becomes ready ("The Carrier stirs").
- Dev tools (test worlds only, refused on any other seed): stage 0–3, grow with reveal, meet requirements, reset
  growth, inspect world (identity, carrier, growth history, regions, counts).
- `scripts/growth.ts` writes `examples/living-worlds/` growth-stages, growth-reveal and growth-regions, which I
  inspected.
  - The shore-turf band read as a seam stripe inside later land, so its tint and flecks were toned down.
  - The first lobes were too small, so I rebalanced: a thinner ring, wider lobes reaching to within 2.5 × scale px of
    the lip, and denser plants.

### Batch 3 — A playable second species: the manta (P2) — IMPLEMENTED (the whale stays PROTOTYPE)
- `src/carriers/manta-world.ts`: `generateMantaWorld(seed, { carrierSeed })` on a 1024×768 canvas, built with the
  shared pipeline.
  - The island is a wide oval fitted inside the manta's still core, with a sand beach (a manta island has one; a
    turtle island does not).
  - The core is SKIN, drawn from the body. Hubs, prow and wing paths, a plateau, meadows, object placement and
    ground dressing come from the shared generators.
  - Identity `kind=manta|carrier=<seed>`; turtle identities are unchanged (tested).
- The body was split from the scene (`mantaBody`). The still core (|u| ≤ 0.74 of the half-span) is the world's
  underlay. The wing tips beyond it and the tail whip are 12 precomputed frames of one wing-beat
  (`creature-render.ts`), carrying their own foam.
  - The still sea bands hug the core only.
  - Iterated on real frames three times: the island was too small (30k → 57k land px), the foam ring was left behind
    when a wing lifted, and the static bands showed boxy steps.
- Everything else works through the existing code paths:
  - collision, navigation (more than 90 % of walkable ground reachable from the hub), building, housing (shelter →
    interior), farming;
  - saving (species `manta`), every camera mode;
  - the Carrier panel, with its own six observations, the `manta-call` / `manta-glide` voices, and a dark-slate map
    colour.
- Species growth geometry: the manta's land grows out along its wings (east and west lobes, never toward the head or
  tail). The lobes may be cut at the limit (the cut edge becomes beach), and an old beach that ends up inland becomes
  grass. +51 % land at stage 3 (56.7k → 89.1k px).
  - A bug where a stray sand pixel cut a wedge out of a lobe was fixed: the limit march now crosses short gaps.
- The title's NEW ISLAND page offers A TURTLE ISLAND or A MANTA ISLAND; the sidebar's world kind gains "manta".
- The whale is not playable: its ridge island is too narrow to build and farm on. It stays the M6 animated preview.
- Tests: `tests/manta-world.test.ts`, 9 tests.

### Batch 4 — Local world visiting (P3) — IMPLEMENTED (local prototype)
- `src/game/visiting.ts`:
  - `WorldRef` (identity, params, name, owner), `PlayerId` (`local:<random>`, made once per browser), and
    `VisitorPermissions` (`READ_ONLY` vs `OWNER`).
  - `VisitTransport` with `LocalVisitTransport`, which reads this browser's saves through `readOnlyStore`.
  - `VisitSession`, a state machine (home → departing → visiting → returning → home) with the teleport as the handoff:
    the world switches only while the Blobbi is absent.
- `LiveWorld({ visitor: true })`:
  - reads the host save, carries an empty bag of its own with no tool, keeps no store, and never writes;
  - gathering, chopping, mining, farming, building, placing, managing, crafting, chests, the kitchen and workbench,
    feeding, offering, equipping and growing are refused with a gentle bubble;
  - walking, doors, looking, listening and reading still work;
  - the host's quests neither advance nor pay rewards. That bug was found in the browser: the visitor's bag had
    received 3 seeds from a host quest.
- Playground:
  - VISIT departs home (after saving it), builds the host world read-only, and arrives by teleport at the host's
    listening spot;
  - the HUD shows "VISITING … LOOK, DON'T TOUCH, Y: GO HOME";
  - RETURN HOME departs and arrives back at the spot it left from;
  - the URL and the playground's world settings never change during a visit, so a reload always comes home (checked
    in the browser).
  - Worlds a player plays are claimed in an owners index (`blobbi-pixel-lab:owners`).
- Tests: `tests/visiting.test.ts`, 7 tests (permissions, read-only, session, full round trip with the handoff,
  reload recovery, transport).

### Batch 5 — Local world discovery (P4) — IMPLEMENTED
- WORLDS screen (`src/ui/screens/worlds.ts`, Y): local worlds with name, species, growth stage, owner (yours / this
  browser / another player) and a map preview generated on first selection; VISIT and RETURN HOME.
- It is filled by the transport, ready for a network one, and says plainly that Nostr discovery is designed and not
  available.
- Dev tools:
  - "Make visit test worlds": a grown turtle with a shelter and a manta. New identities only; existing saves are left
    untouched.
  - "Visit next" and "Return home".
- Browser pass (Chrome, port 5200, its own empty storage, test seeds only):
  - grow, reveal, camera return;
  - Worlds screen; visit the manta, refused gathering;
  - Vite reload mid-visit came home; visit the grown turtle; return home with the same bag;
  - no console errors.
