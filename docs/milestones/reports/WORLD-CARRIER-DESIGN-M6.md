# World Carriers: design

Status labels: **IMPLEMENTED** · **PROTOTYPE** · **DESIGNED ONLY** · **NOT IMPLEMENTED**

A World Carrier is a giant, peaceful sea creature whose back carries a Blobbi's island. The turtle has been the
playable Carrier since M1. M6 makes it a companion, adds two more species as prototypes, and fixes the data model
for growth and for an archipelago of Carriers.

## 1. Principles

1. **The Carrier is a being, not a platform.** It breathes, blinks, glances, hums. Interactions are gentle and it
   is never upset.
2. **Nothing punishes.** Bond and harmony only grow. Neglect costs nothing but the joy of noticing.
3. **Coordinates are sacred.** An existing world's terrain, turtle and placements never move. Growth is designed
   and shown, not applied, until a migration plan exists (§6).
4. **Determinism.** A Carrier is a pure function of (species, seed, generator version), and so is its island.

## 2. The turtle as a companion — IMPLEMENTED (M6 Batch 4)

| Interaction | How | Bond | The Carrier's answer |
|---|---|---|---|
| Listen | E at the shore by the head (first time: the quest) | +1 | blink, glance, the hum (words warm with harmony) |
| Greet | Carrier panel | +2, once a day | blink and glance toward the Blobbi |
| Observe | Carrier panel | +3 per new observation (8, some only by day or night) | blink (the eye observation) |
| Offer | Carrier panel, a food or a flower | +3 a day, +6 for a favourite (2 from its seed) | blink, ripples, a happy hum |
| Rest | Carrier panel | +2, once a day | a nap on the shore by the head |
| Notice breathing | stand still by the head for 6 s | +3, once a day | the island "rises and falls" |

The answers use only the turtle's existing animations: the blink and glance head variants, paddling flippers and
water ripples. Its anatomy, face, head, neck, flippers and shell variant B are untouched.

**Harmony** (0–100; quiet, settling, content, thriving, in harmony) is
`bond·0.8 (≤40) + care (≤25) + wonder (≤20) + time (≤15)`. Its inputs are only monotonic quantities (bond,
lifetime tallies of decorating, planting, harvesting and building, discoveries found, days lived), so harmony can
never fall: removing a building or neglecting needs does not lower it. Harmony currently changes flavour only: the
hum's lines, ambient life in the audio mix, and the Carrier's growth stage.

## 3. Species — turtle IMPLEMENTED, whale and manta PROTOTYPE

| | Turtle (Shell Carrier) | Whale (Ridge Carrier) | Manta (Wing Carrier) |
|---|---|---|---|
| Silhouette | round dome, round head, 4 paddles, short tail | long body, blunt barnacled head, very long fins, wide flukes | wide diamond, swept wing tips, cephalic horns, tail whip |
| Movement | paddles in rhythm; head bob, blink, glance | slow wave to the flukes; fins sway; spouts every 11 s | wave out along the wings; middle level; tail sways |
| Personality | patient, content, hums | gentle, deep-voiced, sings; travels far | curious, playful, quiet; circles; loves shallows |
| Environment | warm calm sea, warm currents | cool deep water, migrations | sunlit shallows and reefs |
| Island | oval on the dome, ringed by the rim | long narrow ridge meadow, a spine path, the spout ahead of it | wide flat disc island, sand fringe, tide pools at the wings |
| Sounds | `hum`, `carrier-call`, `carrier-breath` | `whale-song`, `whale-blow` | `manta-call`, `manta-glide` |
| Status | playable | animated dev preview | animated dev preview |

**Generation layers** (`src/carriers/*`). Each layer depends only on the ones above it:

1. **Species constants** — the code of `whale.ts` / `manta.ts`.
2. **Individual genome** — `generate*Genome(seed)`, from the `shape` stream.
3. **Cosmetics** — skin, pale fins, barnacles, chevrons, spots, from a separate `cosmetic` stream, so a cosmetic
   change never moves geometry.
4. **Geometry** — `*Anatomy(genome, w, h)`, in world pixels.
5. **Movement** — `*Pose(anatomy, t)`, pure.
6. **Animation** — `render*(anatomy, t, palette, stage)`.

Tests check determinism, that the anatomies differ (long, wide, round), that islands lie on their bodies, that heads
face south and tails north, and that the island stays still while the body moves.

**Why the new species are not playable yet.** World generation (terrain classes RIM and SKIN, shell variants),
collision, the live renderer's animated turtle parts, the listening spot and places all assume a turtle. A playable
whale or manta needs a species-generic Carrier layer:

1. `CarrierBody` interface: a terrain-class mask for land, rim and skin; animated part sprites; a "head spot" for
   listening; named landmarks.
2. A `generateCarrierWorld(species, seed)` that builds the island terrain inside the species' island mask with the
   existing island painter (sand, grass, paths, pond, cliff), then places objects as `generateWorld` does.
3. A world identity that includes `species=` (absent means turtle, so every existing identity and save stays
   valid).
4. Renderer hooks for each species' animated parts, in place of the turtle's.

That is M7 work. Until then, the species can be previewed in the dev tools ("Carrier species") and in
`examples/living-archipelago/carrier-*.png`. New test worlds can only be turtles.

## 4. Growth — DESIGNED ONLY (data model IMPLEMENTED, nothing applied)

| Stage | Needs (harmony, day) | Turtle | Whale | Manta |
|---|---|---|---|---|
| young | 0, 0 | as generated | as generated | as generated |
| grown | 35, 5 | rim meadow (bearing 300°) | island +12 % length toward the tail | island +14 % width toward the wings |
| great | 60, 15 | old grove, tide pools | +24 % length | +28 % width, new tide pools |
| ancient | 85, 40 | upper terrace | +36 % length | +42 % width |

- Stages are computed from harmony and days (both monotonic), so a stage is never lost.
- `growthStage()` returns `applied: false`.
- `whaleIslandAt` / `mantaIslandAt` give each stage's island ellipse; the preview renders stages.

**Turtle growth geometry.** The turtle grows by its shell variants: the existing `ShellFit` already enlarges the
shell around the same island while keeping every part sprite pixel-identical. Land added by growth goes only into
the new ring between the old and new shell edges, at the planned expansion bearings. Existing land, objects and
placements keep their coordinates, because the island frame's origin is a whole number of navigation cells (see
REPORT-SHELL.md).

**Before growth is ever applied:**

- the save stores the stage it was applied at;
- expansion terrain is generated in the new ring only;
- a migration test proves every saved placement keeps its coordinates and walkability;
- the player is shown what changed.

## 5. Archipelago — DESIGNED ONLY (data model IMPLEMENTED in `src/game/archipelago.ts`)

- `CarrierRef = { species, seed, generator }`, keyed `species:seed@generator`. That is enough to regenerate any
  Carrier anywhere.
- `ArchipelagoEntry` records how a Carrier is known (home, met, visited), since when, and its last-seen stage.
- `neighbours(home)` gives deterministic nearby Carriers (mostly turtles; mantas and whales further out, spread
  around the compass). Two players with the same home see the same neighbourhood without any server.
- Travel, visiting and sharing are in ARCHITECTURE-NOSTR-MULTIPLAYER.md.

## 6. What must never happen

- An existing world's terrain, turtle, shell variant or placements changing.
- Harmony or bond going down.
- A Carrier being sad, hurt or in danger because of the player.
- Growth applied without a migration plan and tests.
