# M2.2: Basic crafting and tools. Implementation report

Scope: `blobbi-pixel-game`, 2026-10-10. One complete loop: gather sticks and
stones, craft a simple axe, equip it, chop a tree, obtain wood, watch the
tree regrow. M2.2 is implemented and awaits the user's manual gameplay
test; M2 is not marked complete.

Before M2.2, M2.1 (approved by the user) was checked again (110 tests,
typecheck, build) and committed locally as `89c2c10`. Nothing was pushed.
The M2.2 work is uncommitted in the working tree.

Images: `examples/crafting/turtle-0-crafting.png` (headless frames: the
gathered ingredients, the craft, the equipped axe facing a tree, the chops,
the felling with wood and leaves, the stump, the seedling and sapling, a
reload mid-regrowth, the tree grown again). The playground is at
http://127.0.0.1:5177 in Play mode.

## 1. Items and recipes

`src/game/items.ts` is the item registry: stable ids in the protocol's
`game:category:name` style, a category (resource, material, tool), a stack
limit, and for tools a type and the interactions it supports.

| Item | Id | Stack |
|---|---|---|
| stick, stone, seed | `blobbi-pixel:resource:*` | 50, 30, 20 |
| wood | `blobbi-pixel:material:wood` | 40 |
| simple axe | `blobbi-pixel:tool:simple-axe` (axe; chop) | 1 |

`src/game/crafting.ts` holds recipes as data; the first is the simple axe
from 3 sticks and 2 stones. `canCraft` reports what is missing and whether
the output would overflow its stack. `craft` is atomic: every ingredient
and the room for the output are checked first, then all ingredients are
removed and the output added; if anything unexpected fails midway the
removed ingredients are put back and nothing is produced. The axe's stack
of one means a second craft refuses without consuming anything: no
duplication by repeated presses, no half-consumed recipes.

In play: the Crafting block of the Play panel lists each recipe with
ingredient counts and whether it is ready; "Craft simple axe" (or C) crafts
with sparkles, a note, an excited hop and a bubble, or a bubble saying what
is missing. The result is saved at once.

## 2. Tools and equipping

The live world has one `equipped` slot holding a tool's item id. `equip`
requires the item to be a tool and in the bag; `unequip` clears it. "Equip
axe" (or Q) toggles. The equipped state is saved and restored, and never
restored for a tool that is no longer in the bag. The frame's counter shows
`[SIMPLE AXE]` while equipped. No durability.

## 3. Chopping

With the axe equipped, E on a tree in front (the M1 facing rule) is a chop.
Each press is one hit: the trunk shakes (the impulse system), wood chips
and a few leaves fly, the Blobbi hops, a bubble counts `chop 1/3`. The
third hit fells the tree: its canopy comes down as leaves, wood goes in the
bag (2 for small trees, 3 from size 30, sometimes one more by the tree's
seed; what does not fit under the limit stays uncollected with "bag full"),
and from that moment the tree draws as a stump. E on a stump or a regrowing
tree says how long until it regrows and does nothing else. Without the axe,
E is the M1 tree interaction (leaves, no wood). Picking up a resource in
reach still comes first on E, as in M2.1.

Trees never disappear: the placement, its seed, its size and its footprint
are untouched, so collision and navigation are exactly as before and the
same tree comes back as the same tree. A stump keeps the tree's footprint.

## 4. Regeneration

`src/game/trees.ts`: a felled tree is a stump for 20 s of world time, then
regrows over 240 s through the existing growth system (`spriteOf(tree,
growth)`: seedling, sapling, the scaled adult, fruit near maturity), and is
harvestable again at growth 1. World time is simulated seconds accumulated
across sessions (`timeOffset + clock.time`), never frames; it is written to
the save record on every event and every ten simulated seconds, and the
playground also saves when the tab is hidden or closed. A reload resumes the
regrowth from the saved world time, so the tree is at the stage it was.

## 5. Persistence

The save record moved to schema version 2 (same key namespace): the M2.1
fields plus `equipped`, `trees` (hit count and felling time per tree index,
only for trees ever chopped) and `worldTime`. Version 1 records are
migrated on read (no tool, no stumps, world time 0); unknown versions and
malformed tree entries are ignored. Reset clears all of it.

## 6. Autonomy

The brain's interactions still call the M1 `interact()` only. `collect`,
`chop`, `craftRecipe`, `equip` and `unequip` are reachable from the player's
input and the panel buttons alone, and each marks manual control. The test
runs two minutes of autonomy with an equipped axe and a full recipe in the
bag: the inventory snapshot, the tree states, the equipped slot and the
counters are unchanged while the Blobbi still inspects things.

## 7. Future compatibility

- Construction and farming: recipes are data with an output item; a
  building or a seed packet is another entry; the world time and the tree
  state machine are the pattern for crops.
- Cozy and survival modes: nothing here consumes time or health; a mode
  would add rules on top of the same actions.
- World growth: tree state is keyed by placement index within the island
  frame, which the growth requirements keep stable.
- Nostr inventory: item ids are protocol-style `d` tags; the snapshot is
  still the three pieces a kind:31633 event holds. Crafting is a local
  state change that a later layer publishes as a new inventory revision.

## 8. Tests

120 pass (`npm test`; 110 after M2.1), typecheck and build pass. New
`tests/crafting.test.ts` (10): item ids, tool interactions and limits;
recipe validation with missing lists; atomic consumption, exact amounts, no
duplication, output stack; crafting and equipping in the world with
feedback and persistence; chopping needs the axe, three hits, wood,
stump, no second harvest, tree identity preserved; wood stack limit;
regeneration phases in world time through the growth stages and a second
harvest; reload keeps the axe, the equipped state, stumps, chop hits and
world time, regrowth continues; version 1 migration and bad records;
autonomy isolation. Two M2.1 assertions were updated for the autosave and
the key namespace; everything else is unchanged.

## 9. What to review

- Three hits per tree and the wood yield.
- Stump 20 s, regrowth 240 s of world time.
- E priority: resource in reach, then chop, then the ordinary interaction.
- The crafting panel against an in-frame menu.
- Chop feedback (shake, chips, leaves, hop) at play zoom.

## Limitations

- Planted trees (P) cannot be chopped; they are session-only.
- One equipped slot; tools have no durability.
- Chop hits persist per tree but there is no visual of partial damage.
- World time only advances while the tab runs the simulation; a closed tab
  does not regrow trees.
