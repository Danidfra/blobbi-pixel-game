# Blobbi Pixel Game: roadmap

The original concept: each player inhabits an island carried on the back of a
giant living turtle. This repository is the experimental, playable prototype
that grows toward it one milestone at a time. Nothing here is a production
release.

Note: the ROADMAP.md referenced in the M1 brief was not present in the
repository or the Developer directory when M1 started; this file was created
from the brief's milestone description and records actual progress.

## M0: Procedural pixel art foundations (done, pending visual review notes)

Phases 1–4 of the lab: deterministic islands, vegetation and structures
drawn pixel by pixel; a living world with wind, water, particles, growth;
the canonical Adult V3 Blobbi rasterized with pixel-art rules; world scale;
facial fidelity. Reports: `REPORT.md` … `REPORT-4.md`.

M0 closing items (done at the start of M1):
- [x] Cross-eyed gaze: both irises now share one placement rule and one
      whole-pixel gaze shift; cheeks never paint over eye pixels
      (`tests/gaze.test.ts`).
- [x] Idle, walking and turning preserve the appearance: bounds and anchor
      stability tests through the walk cycle, breathing and turns
      (`tests/fidelity.test.ts`).
- [x] Gallery and gameplay draw through one function
      (`buildBlobbiSprite`); the Fidelity tab shows both sizes side by side.

## M1: The living turtle (implemented, awaiting visual review and approval)

Goal: a small living world that feels peaceful, charming and worth spending
time in. Report: `REPORT-M1.md`.

- [x] The turtle is the island: shell top as terrain, rim, head, neck,
      flippers and tail as anatomy, foam around the whole animal.
- [x] Procedural turtle variation from a turtle seed: shell proportions and
      facets, markings, head and flipper proportions, colours; one species.
- [x] More elaborate terrain on the shell: plateau with cliff and ramps,
      pond with a bank, flower meadows, clearings, forest floor, paths to the
      prow, the pond and the overlook.
- [x] Turtle animation: head bob, blinks, slow glances, flipper paddling,
      ripples; terrain coordinates never move.
- [x] Blobbi autonomy: nav grid and A*, wander / idle / inspect / rest,
      obstacle, water and cliff avoidance; WASD takes over, autonomy resumes
      after 5 s; same movement, collision and animation for both.
- [x] Playground: turtle world mode, world and turtle and Blobbi seeds,
      autonomy toggle, behaviour and destination in the statistics, path
      and nav-grid overlay, turtle gallery.
- [x] Tests: 93 passing, including turtle determinism and anatomy,
      walkable-terrain connectivity, placement, collision, navigation,
      manual override and resumption, coherent gaze, stable animation
      geometry.
- [ ] Visual review and approval by the user. M1 is not marked complete
      until then.

Known gaps to review: expression range of the turtle (one head design),
flipper animation is a 1 px paddle, the Blobbi has no sit/sleep pose for
resting beyond closed eyes, the plateau is one level.

## M2 and beyond (not started)

From the scope list: resource gathering, inventory, crafting, buildings
with interiors, farming gameplay, multiplayer, Nostr integration, Bitcoin
payments, combat. Each belongs to a later milestone and none is touched by
M1.
