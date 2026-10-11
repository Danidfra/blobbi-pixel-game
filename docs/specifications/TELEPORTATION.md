# Specification: Teleportation

## 1. Purpose
A reusable presence lifecycle for the Blobbi — leaving a world and arriving in one — with a cinematic, cozy effect;
the handoff used by world visiting and designed for future cross-app travel.

## 2. Status
**IMPLEMENTED** (M6; used by the title screen and world visiting since M6/M7). **NOT TESTED** by a person.

## 3. Player-facing behaviour
- **Departure (about 2.6 s):** the Blobbi stops, shuts its eyes, concentrates and squashes slightly; it dissolves from
  top to bottom with a band of light while glowing pixels accelerate up into the sky; it is gone only at the end.
- **Arrival (about 3.6 s):** a bright cluster appears high above, pixels fall with short trails, a soft shadow grows
  on the ground, the Blobbi rebuilds from bottom to top with its eyes closed, then opens them, smiles and hops.
- The camera lifts a little to show the sky (up to a fifth of the view), then settles; with reduced motion the effect
  is 0.6× as long with fewer pixels and no camera movement.
- While not present the Blobbi cannot move, act or think (autonomy paused).
- Sounds for each phase ([Audio](AUDIO.md)).
- Used when play starts from the title (the Blobbi arrives), and to leave and arrive when visiting.

## 4. Controls
No player key; dev tools (dev server): Depart, Arrive, Round trip, Cancel, Reverse, Arrive by house, Arrive far,
reduced-motion preview.

## 5. Data structures
`TeleportController` (`src/game/teleport.ts`): `state` (`present`, `departing`, `absent`, `arriving`), start time,
transition count (seeds the particles), the per-transition time scale, `reducedMotion`. Everything visual is a pure
function of (transition, time): `visible`, `eyesClosed`, `squash`, `shadow`, `cameraLift`, `particles`.

## 6. State transitions
```
present ─leaveBlobbi─► departing ─(end)─► absent ─enterBlobbi─► arriving ─(end)─► present
departing ⇄ arriving by reverse (resumes from the same visible fraction); any transition ─cancelTransition─► present
```
No overlapping transitions (`leaveBlobbi` only when present; during an arrival it reverses).

## 7. Persistence
None: presence is never saved, so a reload always starts with the Blobbi present.

## 8. Edge cases
Menus and hidden tabs pause the transition (it runs on simulated time). Toggling reduced motion mid-transition does
not jump it (the scale is fixed when it begins). `enterBlobbi(at)` lands on the nearest free ground. Only the lids
change on the sprite; the identity stays canonical.

## 9. Failure handling
`cancelTransition` always returns to present (never left invisible); a reload is always present.

## 10. Source files
`src/game/teleport.ts`, `src/render/teleport-render.ts`, `LiveWorld.leaveBlobbi`, `enterBlobbi`,
`cancelTransition`, `reverseTransition`, `cameraTarget`, `src/render/view-renderer.ts`, `src/dev/dev-tools.ts`.

## 11. Automated tests
`tests/teleport.test.ts` (lifecycle, cancel, reverse, visibility, movement lock, state preservation, camera, particle
cleanup, reduced motion, paused tabs, no persistence, every camera mode, canonical pixels below the cut),
`tests/visiting.test.ts` (handoff), `tests/audio.test.ts` (sound hooks).

## 12. Known limitations
No player-facing "send away" action; the effect is tuned for the turtle palette's sky and grass (it works on the manta
too). Visually checked on rendered frames, not by a person in play.

## 13. Extension points
Cross-app handoff tokens ([Cross-game travel](../architecture/CROSS-GAME-TRAVEL.md), DESIGNED ONLY).
