# The ocean, later: boats, navigation, travel, fishing regions and diving

**Status: DESIGNED ONLY.** Nothing on this page is implemented. M10 phase A built the foundations it relies on
(a seamless open sea, marine life as a pure function of time, a rod with a real cast, a fourth camera scale); this
page records where the next phases plug in, so they extend those systems instead of adding parallel ones.

## 1. What exists (M10 phase A)

| Piece | Where | What later phases may rely on |
|---|---|---|
| Open sea | `src/render/open-sea.ts` (`OpenSea`) | Deep water and wave strokes for **any** world coordinate, inside or outside the world, deterministic from the world seed, in 128 px tiles kept for the largest view. A sea larger than the island needs no new renderer. |
| Marine life | `src/game/marine-life.ts` (`MarineLife.at(t, near, radius)`), `src/render/marine-render.ts` | Creatures are a pure function of (seed, world time); the `near`/`radius` query already limits work to what the camera sees. Spot pools (`shallow`, `open`, `deep`, `sealSpots`) are derived from terrain. |
| Sea discoveries | `SEA_DISCOVERIES` in `src/content/discoveries.ts`, `LiveWorld.greetMarine` | Meetings at sea are discoveries like finds on land: `found` ids (`sea:*`), a keepsake, a journal note. |
| Fishing | `LiveWorld.fishTarget`, `fish`, `CAST`; `src/render/fishing-line.ts` | Water class per cast (`sea` / `pond`), a deterministic catch per cast from `FISH_CONTENT` weights, a rod tip known in every orientation. |
| Camera | `src/render/view-camera.ts` | Four integer scales; the view is a rectangle of world pixels and may lie beyond the world (the sea fills it). |
| World coordinates | `WorldDescription`, `LiveWorld` | The Carrier's world is a bounded canvas; positions are world pixels. |

## 2. Boats (extension points)

- **A boat is a building with a water footprint**, not a new entity system: a `BUILDINGS` entry with
  `where: 'water'` and a `placementCheck` rule that requires SHALLOW/WATER under the footprint and standable shore
  within reach (the same shape as the seal's `sealSpots` search).
- **Boarding** is a scene change like entering a house (`enterInterior`/`exitInterior`): the Blobbi's position
  becomes the boat's, collision becomes the sea's (water walkable, land blocked — the inverse of the island's
  `CollisionMap`), and the camera follows the boat.
- **Drawing**: a drawable in the live frame like any building; its wake uses the `OpenSea` stroke colour.

## 3. Free navigation (extension points)

- The island stays a bounded world; the sea around it is unbounded but **stateless**: `OpenSea` and `MarineLife`
  already answer for any coordinate. A sailing view needs only a camera whose bounds are not clamped to the world
  (`ViewCamera.view` clamps today; a `free` flag on the mode would skip the clamp).
- Positions far from the island stay in world pixels (floats); tiles and marine spots are keyed by tile/cell
  coordinates and so are unbounded already.
- Collision at sea: a `SeaCollision` with the same interface as `CollisionMap` (`canStand`) that treats every
  non-world pixel as water.

## 4. Travel between Carriers

- Visiting already moves a Blobbi between local worlds through the teleport handoff (`src/game/visiting.ts`). Sailing
  to another Carrier would end in the same handoff: reaching another Carrier's position loads its world (read-only
  for a visitor, as today). Where other Carriers *are* would be a pure function of seeds and world time (like the
  marine schedule), never a shared or persistent simulation. See [cross-game travel](CROSS-GAME-TRAVEL.md).

## 5. Fishing regions

- `fishTarget` returns `water: 'sea' | 'pond'`; a region is a refinement of that value from position: shallows near
  the island, open water, the deep (the same pools `MarineLife` computes), and later open-sea zones by distance from
  the island. `FISH_CONTENT` entries would gain a `region` weight table; the deterministic catch draw stays as is.
- Fishing from a boat uses the same `fish()` with the boat's position; the rod and line code is position-agnostic.

## 6. Underwater exploration and side-view diving

- **A dive is another scene**, like a room: its own renderer (a side view, not the top-down terrain), its own
  collision, entered and left through a transition at a dive spot. The `InteriorRenderer` / `LiveWorld.interior`
  pattern (a scene with its own collision, nav, particles and bounds; `sceneBounds()` for the camera) is the model.
- Marine life in a dive would read the same `MarineLife` schedule (a creature seen from above at time *t* is the
  same one met below at time *t*), drawn with side-view sprites.
- Sea-floor finds would be `SEA_DISCOVERIES`-style content with a dive-spot placement rule.

## 7. Constraints for whoever builds these

- Deterministic from seeds and world time; no server, no multiplayer, no persistent ocean simulation.
- Save only what the player did (boats placed, finds, catches), as schema additions with defaults for older saves.
- Keep the Blobbi canonical (V3 proportions, native rasters) in every new scene and camera scale.
- Measure with `scripts/perf-scenes.ts` and `scripts/perf-browser.mjs` before and after.
