# Specification: World visiting (local prototype)

## 1. Purpose
Let a Blobbi visit another island and come home, as a guest who may look but not touch — built on interfaces a future
network transport can use, with no networking today.

## 2. Status
**IMPLEMENTED** as a local, single-browser prototype (M7). Network visiting: **DESIGNED ONLY**
([Nostr multiplayer](../architecture/NOSTR-MULTIPLAYER.md)). **NOT TESTED** by a person.

## 3. Player-facing behaviour
- WORLDS (Y) lists this browser's other saved turtle and manta islands: name, species, growth stage, owner (yours /
  this browser / another player) and a map preview; VISIT starts a trip.
- The Blobbi teleports away (after the home world is saved), the host island is loaded read-only, and the Blobbi
  teleports in at the host's listening spot. The HUD shows "VISITING <NAME> · LOOK, DON'T TOUCH · Y: GO HOME".
- As a visitor: walk, look, open doors, listen to the Carrier, read. Gathering, chopping, mining, fishing, farming,
  building, placing, moving, restyling, crafting, chests, the kitchen and workbench, feeding, offering, equipping and
  growing are refused with a gentle bubble. The visitor carries an empty bag of its own; the host's quests do not move.
- WORLDS → RETURN HOME: the Blobbi teleports away and arrives home on the spot it left from, with its bag unchanged.
- A reload at any moment comes home (the URL never changes during a visit; the visit is not saved).

## 4. Controls
Y worlds · arrows, Enter (visit / return home) · dev tools: make visit test worlds, visit next, return home.

## 5. Data structures (`src/game/visiting.ts`)
`WorldRef` (identity, params, name, owner) · `PlayerId` (`local:<random>`, `blobbi-pixel-lab:player`) ·
`VisitorPermissions` (gather, farm, build, inventory, care; `READ_ONLY` / `OWNER`) · `VisitTransport` (`list`,
`open`) with `LocalVisitTransport` and `readOnlyStore` · `VisitSession` (`home`, `departing`, `visiting`,
`returning`; `homeSpot`) · the owners index `blobbi-pixel-lab:owners`.

## 6. State transitions
```
home ─go (VISIT)─► departing ─(Blobbi absent)─► visiting [host world, read-only] ─goHome─► returning ─(absent)─► home
departing ─(departure cancelled: present again)─► home (abort)
```
The world switches only while the Blobbi is absent, so it is never seen in two places.

## 7. Persistence
The home save is written before leaving and is never touched while away; the host's save is read through a read-only
store (writes are ignored and counted) and the visitor's world has no store at all. Nothing about the visit is saved.

## 8. Edge cases
The current world is never in the list; archipelago (`island`-kind) saves are not listed; a visit cannot start indoors
or mid-teleport; an owner is recorded the first time a player plays a world (dev-made test worlds show "this
browser").

## 9. Failure handling
Reloading during a visit returns home; a cancelled departure aborts the session; a host world that cannot be
reproduced (an unknown growth version) opens read-only like any visit.

## 10. Source files
`src/game/visiting.ts`, `src/ui/screens/worlds.ts`, `src/game/worlds.ts`, `LiveWorld` (`visitor`, `permissions`,
`denied`), `src/render/view-renderer.ts` (visiting chip), `src/playground/main.ts` (`startVisit`, `stepVisit`,
`arriveHere`, `worldFor`), `src/dev/dev-tools.ts`.

## 11. Automated tests
`tests/visiting.test.ts` (7: read-only host and empty bag, no writes, quests and rewards frozen, permission gates,
session state machine, full round trip with the teleport handoff and an unchanged home save, reload recovery,
transport listing and owners, player id), `tests/boundaries.test.ts` (no network code).

## 12. Known limitations
Local only (this browser's saves); the visitor walks with the host world's companion needs (unsaved); no messages or
gifts; previews take up to about a second to generate on first selection.

## 13. Extension points
A network `VisitTransport` (world cards, presence) per [Nostr multiplayer](../architecture/NOSTR-MULTIPLAYER.md)
§10, each step needing protocol review and approval; finer permissions (greet, co-build) are designed there.
