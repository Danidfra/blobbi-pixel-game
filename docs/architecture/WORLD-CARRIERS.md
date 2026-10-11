# World Carriers

A World Carrier is the giant, peaceful creature whose back carries the island. This page describes the code as of
M7. The M6 design document it supersedes is kept verbatim at
[WORLD-CARRIER-DESIGN-M6](../milestones/reports/WORLD-CARRIER-DESIGN-M6.md) (some of its statements are outdated:
the manta is now playable and the island now grows).

## 1. Species

| Species | Status | World | Source |
|---|---|---|---|
| Turtle (Shell Carrier) | **IMPLEMENTED**, playable, default | `generateTurtleWorld` | `src/turtle/turtle.ts`, `src/carrier/`, `src/world/turtle-world.ts` |
| Manta (Wing Carrier) | **IMPLEMENTED**, playable (M7) | `generateMantaWorld` | `src/carriers/manta.ts`, `manta-world.ts`, `creature-render.ts` |
| Whale (Ridge Carrier) | **PROTOTYPE**: animated dev preview only | none | `src/carriers/whale.ts` |

Species facts (personality, movement, environment, island, growth, sounds, lore) are data in
`src/carriers/species.ts`.

## 2. The turtle

- Genome from its seed (proportions, facets, markings, colours) → anatomy in world pixels → body drawn once; the head
  (with blink and glance variants) and the four flippers are separate sprites the live renderer moves.
- Shell variants 0–3 (`src/carrier/types.ts`); **Variant B (2) is the default**, chosen by the user on 2026-10-10.
  Variants 1–3 enlarge the shell around the same island and embed the island frame by `carrier.origin`; part sprites
  stay pixel-identical (`tests/__snapshots__/turtle-anatomy-hashes.json`).
- The shell surface (plates, seams, soil band, moss, lip) is painted procedurally (`src/carrier/shell-surface.ts`).
  Since M7 it takes an optional grown coastline (`land`) for its covered and soil test only; the plate layout follows
  the base island, so visible plates never move.

## 3. The manta (M7)

- A wide diamond with swept wing tips, cephalic horns at the head (south), a tail whip (north), pale shoulder chevrons
  and its own spots.
- The **still core** (|u| ≤ 0.74 of the half-span, `MANTA_CORE`) carries the island and is the world's underlay;
  the wing tips beyond it and the whip are 12 precomputed frames of one 3.6 s wing-beat, each with its own foam.
- Its island is wide and flat with a sand beach; its growth runs out along the wings.

## 4. The Carrier as a companion (M6) — IMPLEMENTED

Source: `src/game/carrier.ts`, `src/ui/screens/carrier.ts`, `LiveWorld` (listen, greet, observe, offer, rest,
breathing).

| Interaction | How | Bond | Answer |
|---|---|---|---|
| Listen | E at the shore by the head (first time: the quest) | +1 | blink, glance (turtle), the hum's words (warmer with harmony) |
| Greet | Carrier panel | +2 once a day | blink and glance |
| Observe | Carrier panel | +3 per new observation (turtle 8, manta 6; some by day or night only) | |
| Offer | a food or a flower | +3 once a day, +6 for one of its two favourites (from its seed) | |
| Rest | a nap on the shore by the head | +2 once a day | |
| Breathing | stand still by the head for 6 s | +3 once a day | |

The turtle answers only with its existing blink and glance animations; its anatomy, face, head, neck, flippers and
shell variant never change. **Harmony** (0–100; quiet, settling, content, thriving, in harmony) is built only from
monotonic inputs (bond, lifetime tallies, finds, days), so it can never fall.

## 5. Growth geometry (M7) — IMPLEMENTED

| Species | How the land grows | Land at stage 3 |
|---|---|---|
| Turtle (Variant B) | over the shell's free ring, all round (a coastal ring and four lobes), keeping a band of plates and the lip; the turtle itself does not grow | about +20 % |
| Turtle (Variant A / C) | idem | +33 % / +9 % |
| Turtle (Variant 0) | cannot grow (no free shell) | — |
| Manta | over its still back, out along the wings (east and west lobes); a cut edge becomes beach | +51 % |
| Whale | DESIGNED ONLY: lengthening toward the tail (`whaleIslandAt`) | — |

Why the turtle does not physically grow: enlarging the shell would change the carrier canvas, the island frame's
offset and the approved Variant B shell. Land coverage grows inside the shell instead (about 70 % → 85 %).

## 6. Design-only remnants

- The Carrier "age" model (young, grown, great, ancient; `growthStage` in `src/game/carrier.ts`) is an M6 data model
  kept for archipelago records; it is **DESIGNED ONLY** and not what the growth panel shows.
- The archipelago (`src/game/archipelago.ts`: `CarrierRef`, `neighbours`) is a **DESIGNED ONLY** data model.

## 7. What must never happen

An existing world's terrain, carrier, shell variant or placements changing; harmony or bond going down; a Carrier
being sad, hurt or in danger because of the player; growth applied without the player choosing it.
