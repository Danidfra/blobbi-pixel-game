# Known issues

Issues known at the end of M7 (2026-10-11), found in the code, in automated runs or while writing these docs. None
of them comes from a person's playtest, because none has happened yet ([manual test plan](MANUAL-TEST-PLAN.md)).

Severity: **High** (can lose player data) · **Medium** (wrong or confusing in play) · **Low** (cosmetic or a missing
nicety).

| ID | Severity | Area | Issue | Where | Suggested fix |
|---|---|---|---|---|---|
| KI-01 | High | Saves | The sidebar button "Reset resources & inventory" (`#progress-reset`) deletes the current world's save immediately, with no confirmation. It is in the production build too. | `index.html`, `src/playground/main.ts` (`progress-reset`), `LiveWorld.resetProgress` | Ask for confirmation, or keep it on the dev server only. |
| KI-02 | High | Saves | A save with a newer schema than the code (version > 9) is ignored when loading (`loadSave` returns null), the world starts fresh, and the next autosave overwrites it. Only matters when going back to older code. | `src/game/persistence.ts` (`loadSave`) | Open such a world read-only, as an unknown growth version already does. |
| KI-03 | Medium | Saves (disclosure) | During M6 development the pre-existing `seed=blobbi` world on the dev server at port 5199 was opened in Play mode, so its save was most likely migrated to schema 8 (the Carrier bond started fresh; nothing else changes in that migration). It has since loaded under schema 9 too if played again. | browser localStorage on `localhost:5199` | Check that world by hand; there is no backup. |
| KI-04 | Medium | Content | Several lore notes (carriers, keepers, carrier-stone, where-to, restoring, treasure, carving) speak of the turtle, also on manta worlds. | `src/content/lore.ts` | Species-aware note text. |
| KI-05 | Low | Quests | The "Collector" quest asks for 8 finds; it was written before the 5 grown-land discoveries, which also count, so it can complete before all 8 base finds. | `src/content/quests.ts` (`discover-all`) | Count base discoveries only, or reword. |
| KI-06 | Medium | Fishing | On manta worlds the sea is usually out of the cast's reach (the line only carries over the rim and shore band, and the manta's skin lies between the beach and the sea), so only ponds can be fished. | `LiveWorld.fishTarget` | Let the line carry over `SKIN`, or add a fishing spot on the wings. |
| KI-07 | Medium | Visiting | A visitor walks with the host world's companion state; the visitor's own needs and care are not carried over (and nothing is saved). | `src/playground/main.ts` (`startVisit`), `LiveWorld` | Carry the visitor's needs into the host world. |
| KI-08 | Low | Map | On manta worlds the map draws the island and the manta's core only, not the wing tips. | `src/ui/screens/map.ts` | Draw the creature outline. |
| KI-09 | Low | Growth | Turtle growth is modest (about +20 % land on Variant B), because the shell is never changed. | `src/world/growth.ts` | A versioned shell enlargement with a migration (not designed yet). |
| KI-10 | Low | Visiting | The first preview of each world in WORLDS takes up to about a second to generate. | `src/ui/screens/worlds.ts` | Generate previews in idle time or cache them. |
| KI-11 | Medium | Audio | Audio has never been heard by a person; levels were measured offline and the engine was checked in Chrome only. | `src/audio/*`, `scripts/audio-preview.ts` | Tune by ear (AUDIO-01…06). |
| KI-12 | Medium | Touch | Touch controls were checked in the browser's device mode only, never on a phone or tablet. | `src/ui/touch.ts` | TOUCH-01 on real devices. |
| KI-13 | Low | Carrier | `src/game/carrier.ts` still holds the M6 Carrier "age" model; it is labelled design-only and no longer shown, but it is a second, unused notion of growth. | `src/game/carrier.ts` | Remove or merge with real growth. |

## Fixed during the documentation pass

- The Carrier panel showed the M6 design-only growth model; it now shows the real island growth.
- `src/carriers/species.ts` described the manta as a prototype; it is playable since M7.
- `docs/game-design/GAMEPLAY-SYSTEMS.md` began with a second-level heading.

## Reporting a new issue

Add a row with the next ID, a severity, the code location and, if found by a manual test, the test ID (for example
"found in GROW-04"). When an issue is fixed, move it to a "Fixed" list with the date and remove it from the table.
