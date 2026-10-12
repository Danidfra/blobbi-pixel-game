# System overview

Vite + TypeScript, Canvas 2D over a software pixel buffer, Vitest. `npm run check` = typecheck + tests + build.
Runtime dependencies: `@blobbi-kit/renderer` (the V3 genome and SVG drawing) and `@blobbi-kit/core` (V3 identity
derivation, pinned exact). Everything else is dev-only. This page describes the code as it is (M7); proposals are
labelled **DESIGNED ONLY**.

## 1. Pipeline

```
seeds ─► world generation (src/world, src/carrier, src/carriers) ─► WorldDescription (plain data)
                                                                         │
                       growth (src/world/growth.ts): growWorld(base, stage) ─┤
                                                                         ▼
     sim (src/sim/live-world.ts): LiveWorld = world + everything that changes ─► save record (src/game/persistence.ts)
                                                                         │
     render (src/render): LiveRenderer (world pixels) ─► ViewRenderer (screen, native Blobbi, HUD) ─► canvas
     ui (src/ui): GameUI menus, title, HUD cards, touch      audio (src/audio): director ─► engine ─► Web Audio
```

Generation never reads rendering; rendering never writes the simulation; the camera and the UI never write the save
except through explicit player actions.

## 2. Modules

| Module | Responsibility |
|---|---|
| `src/core/` | `rng.ts` (cyrb128 + sfc32, keyed streams: `stream(seed, ...keys)`), `noise.ts`, `color.ts` (packed ABGR colours, OKLCH ramps), `palette.ts` (the shared five-shade ramps), `pixel.ts` (`PixelBuffer`, `Mask`, `Sprite`), `shade.ts` (one top-left light, banded shading), `math.ts`. |
| `src/world/` | `layout.ts` (island shapes: harmonics, capes and bays, plateau), `terrain.ts` (signed distance → terrain classes, elevation, paths), `bridges.ts`, `paths.ts`, `placement.ts` (objects), `generate.ts` (archipelago worlds), `turtle-world.ts` (the turtle world), `growth.ts` (M7 island growth), `types.ts` (`WorldDescription`, terrain classes `T`, `WALKABLE`). |
| `src/objects/` | Procedural objects: trees (with growth stages), bushes, flowers, grass, rocks, houses, bridges, fences, decor. |
| `src/turtle/turtle.ts`, `src/carrier/` | The turtle: genome, anatomy, body drawing; the World Carrier record, shell variants (B default), the enlarged-shell fit, the shell surface, embedding the island frame into the carrier canvas by one translation (`origin`). |
| `src/carriers/` | Creature carriers (M6/M7/M8 phase 0): shared drawing (`common.ts`), whale and manta (genome, anatomy, pose, render), `species.ts` (facts, menu thumbnails), `creature.ts` (what a world records about its animal), the playable manta and whale worlds (`manta-world.ts`, `whale-world.ts`), their rendering (`creature-render.ts`). |
| `src/blobbi/` | The canonical pixel Blobbi: `source.ts` (which seed), `identity.ts` (kit genome), `canonical.ts` + `svg-raster.ts` (the kit's SVG rasterized with pixel-art rules), `animation.ts` (pose state machine), `pose.ts`, `sprite.ts`; `native-sprite.ts` and `scale-lab.ts` kept for comparison only (never imported by gameplay). |
| `src/sim/` | `clock.ts` (fixed steps), `collision.ts` (walkability mask), `brain.ts` (nav grid, A*, autonomy), `particles.ts`, `live-world.ts` (the live world: input, interactions, gathering, tools, farming, building, interiors, care, quests, atmosphere, teleport, growth, visiting permissions, saving), `regrow.ts` (the growth button to the rebuilt world: grow, rebuild from the save, reveal). |
| `src/game/` | Gameplay rules as mostly pure modules: items, inventory, crafting, resources, trees, rocks, equipment, buildings, decorations, furniture art, interior, containers, farming, care, friendship, objectives (quests), daylight, discoveries, places, carrier (bond, harmony), teleport, growth progress and content, worlds (saved-world listing), visiting, archipelago (data model), persistence, blobbi selection; M8: `house-art.ts` (the three house levels and their looks), `interior.ts` (room layouts per level, furniture relocation), `tutorial.ts` (tips), `island-name.ts`, `world-delete.ts` (delete with confirmation). |
| `src/content/` | Data catalogues: crops, forage, placeables, meals, quests, lore, discoveries, tools; M8: houses (levels, costs), home styles (unlocks), guide (pages). Plain data registered at load. |
| `src/render/` | `paint-terrain.ts`, `compose.ts` (static picture, carrier underlays), `live-render.ts` (static layer + animated water + dynamic objects; growth reveal; carrier parts), `interior-render.ts`, `view-camera.ts` and `view-renderer.ts` (multi-scale view, native Blobbi, HUD), `teleport-render.ts`, `placement-overlay.ts`, `audit.ts`. |
| `src/ui/` | `game-ui.ts` (screen host, input capture, hit regions), `gfx.ts`, `hud.ts` (HUD cards, design tokens, toasts), `title.ts`, `touch.ts`, `icons.ts`, `screens/*` (inventory, storage, crafting/cooking, journal, care, settings, carrier, map, growth, worlds; M8: home with home-style, guide). The title runs the first-time flow (M8). |
| `src/audio/` | `sfx.ts` (effects as data), `music.ts` (generative score), `engine.ts` (Web Audio), `director.ts` (what plays when). |
| `src/dev/` | `dev-tools.ts` (dev server only; dynamically imported under `import.meta.env.DEV`, absent from builds), `scripted-play.ts` (tests and scripts). |
| `src/node/` | PNG and GIF writers for scripts. |
| `src/playground/` | The lab and game shell: plain DOM + Canvas 2D (`main.ts`, `styles.css`). |
| `scripts/` | Headless image, audio and catalogue scripts (see §8). |
| `tests/` | Vitest suites (see [Testing](../testing/MANUAL-TEST-PLAN.md) for the manual side). |

## 3. Data ownership

| Data | Owner | Where it lives |
|---|---|---|
| Terrain, generated objects, the carrier | the world's seeds (regenerated, never saved) | `WorldDescription` |
| Grown land | the world's seeds + the saved growth stage and version | `growWorld`, save `growth` |
| Everything the player did to a world (collected nodes, felled trees, mined rocks, buildings, plots, interiors, chests, the bag, care, companion, quests, tally, Carrier bond, visited places) | the local world (`owner: 'local-world'`), keyed by world identity, **never by a Blobbi** | save record ([Save and persistence](SAVE-AND-PERSISTENCE.md)) |
| Which Blobbi the player chose | the player (per browser) | `blobbi-pixel-lab:selected-blobbi` (`src/game/blobbi-selection.ts`) |
| Settings, audio mix, camera mode, last-played index, owners index, local player id | the player (per browser) | separate localStorage keys |
| Presence (teleport state), a visit in progress, the camera, UI state | nobody: never saved | memory |

## 4. State management and simulation

- `LiveWorld` holds all mutable game state; it advances in fixed steps (`SimClock`, dt 1/60 s) with a speed factor and
  pause. Real time only decides how many steps run. Menus pause the world (the playground stops stepping while a
  screen captures input).
- World time (`timeOffset + clock.time`) is persisted, so crops, regrowth, construction and day and night continue
  across reloads. Growth, crops, trees and rocks are pure functions of world time.
- Scenes: the island or a house interior; `collision`, `nav`, `brain` and `particles` are getters that switch with the
  scene.
- Input: `LiveInput` (directions, interact, plant) per step; edge-triggered presses are buffered until a step consumes
  them. The brain produces the same kind of intent when the player is idle.
- Sound hooks: `live.sounds` is drained each frame by the playground into the audio director.

## 5. Determinism

- All variation comes from keyed RNG streams (`core/rng.ts`); nothing calls `Math.random()` in generation or
  simulation (the audio engine's own variation uses a seeded RNG too).
- A new feature draws from a new stream key so older sequences never shift (for example forage after the M2 nodes,
  growth objects after the base objects, grown-land resources with their own ids).
- Same seeds → same world bytes; same inputs at the same steps → same states and pixels (tested in
  `tests/live.test.ts`, `tests/visual.test.ts`, `tests/growth.test.ts`, `tests/manta-world.test.ts`).
- Visual regression hashes are pinned in `tests/__snapshots__/`.

## 6. World coordinates

- Every gameplay coordinate on a turtle world lives in the **island frame** (the Variant 0 canvas). Enlarged shells
  embed the frame in a bigger canvas by one translation, `carrier.origin` (x 0, y a multiple of the 4 px nav cell).
- Buildings and plots are saved in island-frame coordinates (canvas minus origin), so a different canvas never moves
  them.
- Growth only adds land and appends objects; existing pixels' classes and existing objects' indices and positions
  never change (the old shore band becomes plain grass where it is now inland). See
  [Procedural generation](PROCEDURAL-GENERATION.md).
- Manta worlds have their own canvas (1024×768) and no origin translation.

## 7. Rendering

- `LiveRenderer` paints a static layer once per world (terrain, carrier underlay, object shadows, bridges), then per
  frame copies the visible rows, repaints animated water from precomputed lists, draws the turtle's head and flippers
  or the manta's wing tips and whip, plots and crops, objects in painter's order with wind sway, the Blobbi,
  particles and text.
- `ViewRenderer` composes the screen: the world magnified by whole pixels (overview 1×, exploration 2×, close-up 4×),
  the Blobbi and its tool rasterized natively at 12/24/48 px between what stands behind and in front of it, the
  teleport effect, then the HUD at a UI scale. The camera is presentation only.
- Lighting (day and night, rain) is applied to the world and the Blobbi as a tint when enabled.
- Interiors use `InteriorRenderer` with the same contract.

## 8. Scripts (headless, write images or files)

| Script | Writes |
|---|---|
| `scripts/living-island.ts`, `scripts/living-world.ts` | M4, M5 images (`examples/living-island/`, `examples/living-world/`) |
| `scripts/teleport.ts`, `scripts/living-archipelago.ts`, `scripts/carriers.ts` | M6 images (`examples/living-archipelago/`) |
| `scripts/growth.ts`, `scripts/manta-world.ts` | M7 images (`examples/living-worlds/`) |
| `scripts/audio-preview.ts` | WAV previews and levels (`out/audio-preview/`) |
| `scripts/content-catalog.ts` | `docs/game-design/CONTENT-CATALOG.md` |
| `scripts/check-docs.ts` | checks every documentation link and source path |
| older: `render-turtles.ts`, `autonomy-run.ts`, `compare.ts`, `references.ts`, `face-sheet.ts`, `camera-modes.ts`, … | lab images |

## 9. The playground

`npm run dev` opens the lab with six modes: **World** (static generator), **Play** (the game: title screen, the
living world, menus, dev tools on the dev server), **Blobbi** (appearance gallery and animated preview), **Growth**
(one tree's growth), **Gallery** (many seeds, audited) and **Fidelity** (the kit's canonical drawing beside the
pixel raster). The seed, mode and Blobbi live in the URL hash.

## 10. Networking boundary

There is **no networking** in this codebase: no fetch, WebSocket, WebRTC, signing or Nostr library (enforced by
`tests/boundaries.test.ts`). Visiting other worlds goes through a `VisitTransport` interface whose only
implementation reads this browser's own saves. Multiplayer and cross-game travel are
[DESIGNED ONLY](NOSTR-MULTIPLAYER.md).
