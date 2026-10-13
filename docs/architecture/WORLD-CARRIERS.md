# World Carriers

A World Carrier is the giant, peaceful creature whose back carries the island. This page describes the code as of
M8 phase 0 (the playable whale). The M6 design document it supersedes is kept verbatim at
[WORLD-CARRIER-DESIGN-M6](../milestones/reports/WORLD-CARRIER-DESIGN-M6.md) (some of its statements are outdated:
the manta and the whale are now playable, the whale now lies east-west, and the island now grows).

## 1. Species

| Species | Status | World | Source |
|---|---|---|---|
| Turtle (Shell Carrier) | **IMPLEMENTED**, playable, default | `generateTurtleWorld` | `src/turtle/turtle.ts`, `src/carrier/`, `src/world/turtle-world.ts` |
| Manta (Wing Carrier) | **IMPLEMENTED**, playable (M7) | `generateMantaWorld` | `src/carriers/manta.ts`, `manta-world.ts`, `creature-render.ts` |
| Whale (Ridge Carrier) | **IMPLEMENTED**, playable (M8 phase 0) | `generateWhaleWorld` | `src/carriers/whale.ts`, `whale-world.ts`, `creature-render.ts` |

Species facts (personality, movement, environment, island, growth, sounds, lore, the title's one-line blurb) are data
in `src/carriers/species.ts`, which also draws each species' menu thumbnail (`speciesThumbnail`). A creature world
records its animal in `world.creature` (`src/carriers/creature.ts`: `MantaInfo` or `WhaleInfo`); a turtle world has
`world.turtle` instead. All three use the same terrain, path, placement, collision, navigation, building, farming,
housing, saving, camera and growth code: there is no species-specific game engine.

## 2. The turtle

- Genome from its seed (proportions, facets, markings, colours) → anatomy in world pixels → body drawn once; the head
  (with blink and glance variants) and the four flippers are separate sprites the live renderer moves.
- Shell variants 0–4 (`src/carrier/types.ts`). Variants 1–3 enlarge the shell around the same island and embed the
  island frame by `carrier.origin`; part sprites stay pixel-identical (`tests/__snapshots__/turtle-anatomy-hashes.json`).
  **Variant B (2)**, chosen by the user on 2026-10-10, stays the generator's implicit default and what every world
  made before 2026-10-11 keeps (the variant is part of the world identity). **Variant S (4, the small start)**
  generates a smaller island (72 % of the shell top's half-axes) in the same 704×480 frame and fits the shell around
  it to about 40 % coverage: a giant turtle carrying a small island, with most of its shell free to grow over. It
  is what the title's island creation (BEGIN; NEW ISLAND in development) and the intro cinematic's preview make (`NEW_WORLD_SHELL_VARIANT`); object sizes,
  the Blobbi, walkability and every system are unchanged, there are simply fewer objects. Pictures and numbers:
  `examples/turtle-start/` (`npx tsx scripts/turtle-start.ts`); tests: `tests/turtle-start.test.ts`.
- The shell surface (plates, seams, soil band, moss, lip) is painted procedurally (`src/carrier/shell-surface.ts`).
  Since M7 it takes an optional grown coastline (`land`) for its covered and soil test only; the plate layout follows
  the base island, so visible plates never move.

## 3. The manta (M7)

- A wide diamond with swept wing tips, cephalic horns at the head (south), a tail whip (north), pale shoulder chevrons
  and its own spots.
- The **still core** (|u| ≤ 0.74 of the half-span, `MANTA_CORE`) carries the island and is the world's underlay;
  the wing tips beyond it and the whip are 12 precomputed frames of one 3.6 s wing-beat, each with its own foam.
- Its island is wide and flat with a sand beach; its growth runs out along the wings.

## 4. The whale (M8 phase 0) — IMPLEMENTED

- **Anatomy** (`src/carriers/whale.ts`), written in the body's own frame (`s` along the spine from the snout, `u`
  across) and laid **east-west, head east**, so its long island fits a wide screen. A broad rostrum tapering to a
  rounded tip with knobs (tubercles) and barnacle clusters, a long mouth line along each side, eyes behind it, twin
  blowholes in a raised splash guard, two very long curved pectoral fins with knobbly leading edges, a dorsal ridge
  with a row of knuckles near the tail, and wide notched flukes. Shaded as a lit cylinder (light from the north).
- **Individuals** from the seed: length, girth, head bluntness, fin length, width and sweep, fluke span and notch,
  knuckle count (shape stream); skin colour, pale or dark fins, barnacle density, eye colour, mottling, number of
  knobs and scars (cosmetic stream; the M8 cosmetic draws come after the M6 ones, so older genomes keep their values).
- **Still trunk and moving parts**: the trunk (snout to tail stock) is the world's underlay; the two fins and the
  flukes are 16 frames of one 6.5 s beat, **one small sprite per part per frame** (each with its own foam) so a long
  animal costs no more memory than a wide one. Two drawn moments: the **spout** (a V-shaped plume from the
  blowholes every 11 s, rising, hanging and falling as drops) and a slow **blink** just after each breath.
- **World** (`src/carriers/whale-world.ts`, 1280×768): a young island sits forward on the back, behind the fins,
  fitted inside the trunk with a margin left to grow into, between the blowholes and the knuckles
  (`whaleGrowRange`). Its shore is a **mossy fringe** (`T.MOSS`, walkable; a whale's back has no beach), and that
  fringe is the whale's shore for shells and the "beach" discoveries. Paths run fore (to the head, where one listens)
  and aft along the spine, plus the overlook. The sea's bands wrap the trunk.
- **Voice**: `whale-song` as its call; `whale-blow` is heard exactly when the spout leaves the blowholes
  (`CARRIER_VOICES`, `src/audio/director.ts`). Eight whale observations (`WHALE_OBSERVATIONS`).

## 5. The Carrier as a companion (M6) — IMPLEMENTED

Source: `src/game/carrier.ts`, `src/ui/screens/carrier.ts`, `LiveWorld` (listen, greet, observe, offer, rest,
breathing).

| Interaction | How | Bond | Answer |
|---|---|---|---|
| Listen | E at the shore by the head (first time: the quest) | +1 | blink, glance (turtle), the hum's words (warmer with harmony) |
| Greet | Carrier panel | +2 once a day | blink and glance |
| Observe | Carrier panel | +3 per new observation (turtle 8, manta 6, whale 8; some by day or night only) | |
| Offer | a food or a flower | +3 once a day, +6 for one of its two favourites (from its seed) | |
| Rest | a nap on the shore by the head | +2 once a day | |
| Breathing | stand still by the head for 6 s | +3 once a day | |

The turtle answers only with its existing blink and glance animations; its anatomy, face, head, neck, flippers and
shell variant never change. **Harmony** (0–100; quiet, settling, content, thriving, in harmony) is built only from
monotonic inputs (bond, lifetime tallies, finds, days), so it can never fall.

## 6. Growth geometry (M7, whale M8 phase 0) — IMPLEMENTED

| Species | How the land grows | Land at stage 3 |
|---|---|---|
| Turtle (Variant S, new worlds) | the same plan over a much wider free ring: 36 % → 46 % → 52 % → 64 % of the shell top | about +77 % (+29 % at stage 1, +46 % at stage 2) |
| Turtle (Variant B, existing worlds) | over the shell's free ring, all round (a coastal ring and four lobes), keeping a band of plates and the lip; the turtle itself does not grow | about +20 % |
| Turtle (Variant A / C) | idem | +33 % / +9 % |
| Turtle (Variant 0) | cannot grow (no free shell) | — |
| Manta | over its still back, out along the wings (east and west lobes); a cut edge becomes beach | +51 % |
| Whale | over its back between the blowholes and the knuckles: first aft along the spine, then along both flanks behind the fins, last further aft; its lobes are broader and may reach further than the others' | about +80–100 % (three seeds measured: +81, +96, +97 %) |

Why the turtle does not physically grow: enlarging the shell would change the carrier canvas, the island frame's
offset and the approved Variant B shell. Land coverage grows inside the shell instead (about 70 % → 85 %).

## 7. Design-only remnants

- The Carrier "age" model (young, grown, great, ancient; `growthStage` in `src/game/carrier.ts`) is an M6 data model
  kept for archipelago records; it is **DESIGNED ONLY** and not what the growth panel shows.
- The archipelago (`src/game/archipelago.ts`: `CarrierRef`, `neighbours`) is a **DESIGNED ONLY** data model.

## 8. What must never happen

An existing world's terrain, carrier, shell variant or placements changing; harmony or bond going down; a Carrier
being sad, hurt or in danger because of the player; growth applied without the player choosing it.
