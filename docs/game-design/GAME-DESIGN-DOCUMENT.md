# Game design document — Blobbi Pixel

Status labels: **IMPLEMENTED** (in code and covered by automated tests) · **PROTOTYPE** (in code, partial or
dev-only) · **DESIGNED ONLY** (written down, not in code) · **PLANNED** (intended, not designed in detail) ·
**NOT TESTED** (no human has validated it yet).

> Every gameplay feature from M4 onwards is IMPLEMENTED in code but **NOT TESTED by a person**. M4, M5, M6 and M7
> are awaiting manual validation (see [the milestones](../milestones/README.md) and
> [the manual test plan](../testing/MANUAL-TEST-PLAN.md)).

## 1. Vision

A cozy, procedural pixel-art life game. You and your Blobbi, a small round creature with its own canonical identity,
live on an island that rides on the back of a giant, peaceful sea creature: a **World Carrier**. You gather, farm,
build a home, cook and explore. You befriend the Blobbi and the Carrier, and the island slowly grows. Nothing can be
lost and nothing punishes; the game rewards attention, not pressure.

Pillars:

1. **Everything is procedural.** Terrain, plants, buildings, creatures and the Blobbi's pixels are generated from
   seeds and drawn pixel by pixel. There are no sprite packs.
2. **The Blobbi is canonical.** The pixel Blobbi is the Blobbi ecosystem's own V3 Blobbi (same genes as the
   Standalone), never a reinterpretation ([Blobbi identity](../architecture/BLOBBI-IDENTITY.md)).
3. **Cozy, never harsh.** Needs never kill, crops never die, harmony never falls, waiting costs nothing.
4. **The world is alive.** Wind, water, creatures, day and night, rain, a breathing Carrier, an autonomous Blobbi.
5. **Stable worlds.** Coordinates never move; saves migrate; growth only ever adds.

## 2. Core gameplay loop — IMPLEMENTED

```
explore ─► gather (sticks, stones, seeds, forage) ─► craft tools ─► chop, mine, till
   ▲                                                                  │
   │                                                                  ▼
 grow the island ◄─ harmony, quests ◄─ care for Blobbi ◄─ farm, cook ◄─ build a shelter, decorate, furnish
```

Short loop (minutes): pick things up, tend crops, feed and pet the Blobbi. Medium loop (a session): finish a quest,
build or furnish something, cook a new meal. Long loop (days of world time): the story chapters, friendship levels,
island harmony and growth stages. See [Gameplay systems](GAMEPLAY-SYSTEMS.md) and [Progression](PROGRESSION.md).

## 3. Player goals

- Make the island a home: a shelter, an interior, a farm, decorations — IMPLEMENTED.
- Befriend the Blobbi (friendship levels, its favourite foods) — IMPLEMENTED.
- Learn the island's story (16 main quests in two chapters, side quests, lore notes, discoveries) — IMPLEMENTED.
- Bond with the World Carrier and raise the island's harmony — IMPLEMENTED (M6).
- Grow the island in three stages into five new biomes — IMPLEMENTED (M7).
- Visit other islands — IMPLEMENTED as a local prototype (M7); with other players — DESIGNED ONLY.

## 4. The Blobbi's role — IMPLEMENTED

The Blobbi is the player's companion and avatar. It walks where the player steers it; when the player lets go it
lives on its own after five seconds (wander, look at things, rest, go home to sleep), with needs (fed, energy, joy),
moods and expressions from the kit's own V3 drawing. It holds tools in its hand, reacts to everything it does, and
teleports in and out of worlds. It never takes or changes anything on its own: autonomy is cosmetic.

## 5. World Carriers — turtle, manta and whale IMPLEMENTED

The island rests on a giant creature. The **turtle** (default) carries a round island on its shell (new turtle worlds
start with a small one at the shell's centre and grow over the plates, since the M8 cinematic session); the **manta**
(M7) carries a wide, flat island with beaches on its back and beats its wing tips; the **whale** (M8 phase 0) lies east-west
and carries a long ridge meadow with a mossy edge along its back, swaying its long fins and spouting now and then. The player can listen to, greet, observe, offer to and rest beside the Carrier; island
harmony (non-punitive) grows with care. See [World Carriers](../architecture/WORLD-CARRIERS.md).

## 6. Systems at a glance

| System | Status | Spec |
|---|---|---|
| Gathering and forage | IMPLEMENTED | [Inventory](../specifications/INVENTORY.md) |
| Inventory, chests | IMPLEMENTED | [Inventory](../specifications/INVENTORY.md) |
| Crafting, tools, upgrades | IMPLEMENTED | [Gameplay systems](GAMEPLAY-SYSTEMS.md) |
| Cooking | IMPLEMENTED | [Gameplay systems](GAMEPLAY-SYSTEMS.md) |
| Farming | IMPLEMENTED | [Farming](../specifications/FARMING.md) |
| Building, decorations, management | IMPLEMENTED | [Building](../specifications/BUILDING.md) |
| Housing (interiors, furniture) | IMPLEMENTED | [Housing](../specifications/HOUSING.md) |
| Quests, requests, lore, discoveries | IMPLEMENTED | [Quests](../specifications/QUESTS.md) |
| Friendship, care | IMPLEMENTED | [Gameplay systems](GAMEPLAY-SYSTEMS.md) |
| Exploration: map, places, journal | IMPLEMENTED | [Gameplay systems](GAMEPLAY-SYSTEMS.md) |
| Atmosphere: day and night, rain, creatures | IMPLEMENTED | [Gameplay systems](GAMEPLAY-SYSTEMS.md) |
| Audio: effects, ambience, music | IMPLEMENTED (not heard by a person) | [Audio](../specifications/AUDIO.md) |
| Teleportation | IMPLEMENTED | [Teleportation](../specifications/TELEPORTATION.md) |
| World growth and biomes | IMPLEMENTED | [World growth](../specifications/WORLD-GROWTH.md) |
| World visiting (local) | IMPLEMENTED (local prototype) | [World visiting](../specifications/WORLD-VISITING.md) |
| Fishing | IMPLEMENTED | [Gameplay systems](GAMEPLAY-SYSTEMS.md) |

## 7. Atmosphere — IMPLEMENTED

Day and night from saved world time (a day is 1200 world seconds), a light night tint, deterministic rain, birds,
butterflies, fireflies by lanterns, chimney smoke, wind in the trees, foam and waves, a breathing Carrier, and
synthesized ambience and music that follow the moment ([Audio](../specifications/AUDIO.md)). Light is
presentation only: nothing grows or behaves differently at night.

## 8. Discoveries and lore — IMPLEMENTED

Thirteen discoveries (eight on every island, five on grown land) and nineteen lore notes tell a warm, curious story:
the island moves; it rides a World Carrier; Keepers looked after it before you; a happy island makes its Carrier
calm. See [World lore](WORLD-LORE.md).

## 9. Future social gameplay — DESIGNED ONLY

Visiting friends' islands, sharing an island as a seed plus its changes, gentle real-time presence, and carrying a
Blobbi between Blobbi games. Designed in [Nostr multiplayer](../architecture/NOSTR-MULTIPLAYER.md) and
[Cross-game travel](../architecture/CROSS-GAME-TRAVEL.md); a local, single-browser prototype of visiting exists
(M7). No Nostr event is created by this game, and none will be without protocol review and approval.

## 10. What the game is not

No combat, no death, no currency or trading, no timers that punish, no in-app purchases, no data leaving the
browser.
