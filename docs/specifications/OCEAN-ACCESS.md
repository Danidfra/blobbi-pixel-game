# Specification: Ocean access (the landing)

## 1. Purpose
Every island must eventually reach the sea: fishing, the canoe and everything at sea depend on it. Before M10 phase C
this depended on luck — a manta's island never reached the water at all (its own body lies 20–50 px wide between the
land and the sea), and turtle and whale islands did on some seeds only. Ocean access is now an invariant of world
generation.

## 2. Status
**IMPLEMENTED** (M10 phase C, growth version 4). **NOT TESTED** by a person.

## 3. The invariant
From the island's first growth (`OCEAN_ACCESS_STAGE` = 1, "The shore widens"), every island of every Carrier, for
every seed, has a **landing** — a shore spot where:

1. the Blobbi can stand, connected on foot to the island's hub;
2. facing the water (one of the four directions), open water lies within the canoe's launch reach (8–28 px);
3. the canoe fits there (`SeaNav.canFloat`) and keeps `ANATOMY_MARGIN` (4 px) from everything the Carrier's flippers,
   wings, flukes and head sweep (`movingPartsMask`);
4. from there the canoe can paddle out past the Carrier's whole outline into open sea (`departs`);
5. the Blobbi can step back ashore at the same spot (it stands within a step of the moored hull);
6. the way never crosses protected anatomy (below), and only covers the carrying surface (shell ring or back);
7. nothing procedural blocks it: natural objects on its ground are cleared for good (`WorldGrowth.landingClear`), and
   a keeper piece (sign, well) is never covered;
8. it is chosen from the world's own geometry, never from fixed coordinates or a lucky seed.

A young island (stage 0) may not reach the sea yet; that is part of the progression ("Help your island grow").

## 4. How it is generated (`src/world/landing.ts`)
- **Candidates**: every edge pixel of the carrying surface (`RIM` on a turtle, `SKIN` on a creature) with open water
  just beyond it in one of the four directions, not swept by a moving part.
- **The tongue**: from the edge, a straight strip inward, a lip of the Carrier's edge kept in front of its tip (3 px on
  a turtle, 2 on a creature), 2 × 6 px × scale wide with a rounded tip, flared root and a breathing width. It may cross at
  most `MAX_CROSS` (14 px × scale) of the edge margin that `suitableSurface` keeps free, then runs over the suitable
  surface to the access stage's land (at most `MAX_TONGUE`, 110 px × scale). Every pixel across its width must be
  carrying surface or land, not swept, not protected.
- **The launch**: the Blobbi stands `STAND_IN` (6 px) inside the tip, facing the water; the launch spot is found with
  the game's own rule (`launchFrom`), then checked for the anatomy margin and a way out to sea.
- **Choice**: the shortest tongue wins; each natural object (tree, bush, rock, stump, mushroom) under it adds the cost
  of 40 px, a keeper piece rules the place out. Ties go to scan order: deterministic.
- **Painting** (each stage from the access stage on, after the stage's objects are placed): only carrying-surface
  pixels become land — shore turf (`CLOVER`) inside, a grass edge along its sides, sand (manta) or moss (whale) at its
  tip; the old coast band at its root becomes inland turf. The landing belongs to no growth region (region cells, and
  so their resources, places and discoveries, are exactly version 3's). Once land, a landing pixel keeps its class
  (later lobes and the Sanctuary keep their own ground where they grow over it, but never turn it back into a shore
  band). A turtle's shell surface draws its soil band along the landing (`growth.landingField`).

## 5. Protected anatomy (`protectedAnatomy`)
| Carrier | Never on the landing's way |
|---|---|
| Turtle | Within 10 px × scale of any of its skin (head, neck, flippers, tail); within 40 px × scale of the head or the tail: a landing is on a flank of the shell. |
| Whale | Ahead of the blowholes (the head) or behind the knuckles (the tail stock): outside `growRange`. Its flippers and flukes are moving parts. |
| Manta | Its head-to-tail axis (within 0.3 of its half-span): the cephalic fins in front, the tail behind. Its wings beat (moving parts). |
| All | Anything `movingPartsMask` covers, with a 4 px margin for the canoe; never the creature's head (50 px × scale). |

## 6. Existing islands
A world grown with growth version 1–3 to stage 1 or beyond is **upgraded to version 4 on load** (`LiveWorld.upgradedGrowth`):
version 4 is version 3 plus the landing — the same objects (pinned by tests), the same land and classes except
carrying-surface pixels that become land and a strip of old shore band at the landing's root — so nothing the player
made or saw moves. Each stage keeps the version it was grown with for its objects (missing history entries are filled
with the old version). The player is told once: "The shore: a path to the sea has opened!". A visitor never upgrades a
record.

## 7. Feedback
- Before any shore reaches the sea (`LiveWorld.seaReachable`): a cast or a launch at the far sea says "the ocean is still
  out of reach", and at most once a minute a notice: "help your island grow to open a path to the shore! (L)". The canoe
  recipe says so too.
- After: "too far to cast here. the landing reaches the sea" (and the landing is a place on the map: N).
- The moment the island first reaches the sea (its first growth, or the upgrade): "The shore: a path to the sea has opened!".

## 8. Evidence
- `tests/ocean-access.test.ts`: six seeds per Carrier at stages 1 and 4 — stand, reach, launch, margin, departure, back
  ashore, no protected anatomy, no lost land; plus determinism and the manta/whale placement rules.
- `tests/growth.test.ts`, `tests/growth-stage4.test.ts`: version 4 = version 3 plus the landing (objects identical); old
  saves upgraded once, objects and land kept.
- `tests/canoe.test.ts`: on every Carrier at stages 1–4, launched, paddled round, back to the landing and ashore.
- `scripts/m10c-access-scan.ts` (30 seeds per Carrier): the landing works at stages 1 and 4 for 30/30 turtles, 30/30
  mantas, 30/30 whales; no island reaches the sea at stage 0. The general analysis (`findOceanAccess`, sampled every
  2 px) agrees on 89 of 90 stage-1 islands; it misses one manta landing between its samples.

## 9. Known limitations
- The landing is a straight strip in one of four directions (the canoe launches straight ahead): readable, but simpler
  than the rest of the coast. On a turtle where the land already nearly reaches the lip, it is only a few pixels.
- The general access analysis samples every 2 px; the guarantee itself is checked exactly by the landing.

## 10. Source files
`src/world/landing.ts`, `src/world/growth.ts` (version 4), `src/game/ocean-access.ts`, `src/sim/live-world.ts`
(`upgradedGrowth`, `landingStand`, `seaReachable`, `seaTooFar`, `announceSeaPath`), `src/sim/collision.ts`
(`landingClear`), `src/carrier/shell-surface.ts` (`landingField`).
