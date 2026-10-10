# M3.2: Pickaxe, large-rock mining, renewable resources, 32 px scale lab

Scope: `blobbi-pixel-game`, 2026-10-10. M3.1 passed the user's gameplay test
and is committed locally as `da248e7`. M3.2 passed the user's manual gameplay
test except for one interaction bug (section 9), which is fixed; M3.2 is
committed locally. M3 is not marked complete. Nothing was pushed.

Images:

- `examples/mining/turtle-0-mining.png`: the pickaxe icon at 1-4×, the
  Blobbi holding it facing front, back, left and right (hidden in the far
  hand), a large rock, raise, strike, rubble with the stones, the rock
  whole again, a stick picked up and grown back.
- `examples/fidelity32/scale-comparison-32px.png` and `.json`: the 32 px
  comparison (six seeds × three poses × five strategies beside the kit's
  own render), with per-case and mean scores.

## 1. The pickaxe

- Item `blobbi-pixel:tool:simple-pickaxe`, tool type `pickaxe`, interaction
  `mine`, stack 1 (`src/game/items.ts`).
- Recipe: 2 wood + 2 sticks + 3 stones, atomic like the axe
  (`src/game/crafting.ts`). Craft with the panel button or V.
- Procedural pixel art: a second template table in the equipment layer
  (`src/game/equipment.ts`): wooden handle, curved two-pointed steel head,
  six orientations, the same outline, grip, mirroring and scaling rules.
  It is held in the anatomical left hand exactly like the axe (viewer's
  right from the front, viewer's left from the back, visible facing left,
  hidden in the far hand facing right). No change to the axe.
- Q now cycles the hand through empty and every owned tool. The icon shows
  in the panel and beside the frame counter.

## 2. Large-rock mining

`src/game/rocks.ts`. World rocks at least 14 px wide are minable (five on
turtle-0, sizes 14-19); smaller ones are scenery ("too small to mine").
With the pickaxe equipped, E on a large rock in front starts the same swing
as the axe (raise, strike, recover, 0.32 s, hit at 0.18 s): stone dust and a
spark at the impact, a `mine n/4` bubble. The fourth landed hit breaks the
rock: 3 to 5 stones by size and seed (what fits under the stone limit), and
the rock draws as rubble. Rubble keeps the rock's footprint, so collision
and navigation never change. After 300 s of world time the same rock is
whole again and can be mined again. The E order is: build mode, collect a
resource in reach, chop (axe), mine (pickaxe), the ordinary interaction.

## 3. Renewable resources

Collected sticks, stones and seeds grow back on their own spot after 120,
180 and 150 s of world time, checked once a second, in generation order. A
node does not grow back under a building or under the Blobbi's feet (it
waits). Trees (M2.2) and large rocks regrow too, so every essential
resource is renewable and a world can no longer run dry.

## 4. Saves and coordinates

Save schema 4 adds `collectedAt` (world time each node was taken) and
`rocks` (hits and break time per rock placement index). Schemas 1-3
migrate: their collected nodes get the record's world time as their
collection time (they grow back a full respawn period after loading) and
no rock has been hit. Buildings, trees, the inventory and the equipped tool
load as before; unknown future versions are ignored whole. All new state is
keyed by stable ids or placement indices and measured in world time; no
coordinate moved.

## 5. The 32 px scale lab (isolated)

`src/blobbi/scale-lab.ts` and `scripts/scale-comparison.ts`. Gameplay never
imports the lab; the gameplay sprite is unchanged and its pinned hashes
still pass. Every strategy is drawn on the gameplay sprite's own canvas and
anchor and scored against the kit's anti-aliased render on that canvas
(resvg): silhouette IoU (reference solid at ≥ 50% alpha), mean RGB error
where both are solid, ink IoU (dark pixels inside the reference's
silhouette: eyes, mouths, brows), and colour count.

Means over six seeds × front, happy and side:

| Strategy | Silhouette IoU | Colour error | Ink IoU | Colours |
|---|---|---|---|---|
| direct (the game today) | 0.898 | 29.4 | 0.464 | 40 |
| 6 gradient bands | 0.898 | 27.1 | 0.472 | 46 |
| no outline | 0.954 | 27.2 | 0.464 | 39 |
| supersample 2× | 0.884 | 26.6 | 0.524 | 28 |
| 16 px sprite ×2 | 0.794 | 54.9 | 0.129 | 25 |

Reading:

- **Drawing at 32 px is the big win.** Scaling the 16 px sprite up is far
  worse on every measure; a 32 px Blobbi should always be rasterized at 32.
- **Six bands** lowers colour error by about 8% with an identical silhouette
  and face, for six more colours. It is the lowest-risk improvement.
- **The outline** is a style choice: it costs silhouette agreement (the
  reference has none) but carries the character against grass; no change
  recommended without a visual review.
- **Supersampling** scores best on colour and ink, but the sheet shows its
  cost: the majority reduction breaks eye highlights into plus-shaped
  marks and softens mouths. The feature-aware face of the direct raster
  reads better, so the numbers alone would mislead here.

Recommendation, not applied: try 6 bands for sizes of 32 px and up, behind
a visual review on the face gallery. Nothing in the game changed.

## 6. Preserved

Turtle, terrain, world generation, resource placement, the axe and
chopping, regrowth, buildings, equipment rules, autonomy and navigation are
unchanged. Autonomy never mines, crafts or switches tools (tested over 90 s
with a pickaxe in hand).

## 7. Tests

157 pass (`npm test`; 139 after M3.1, 151 before the small-rock fix),
typecheck and build pass. New
`tests/mining.test.ts` (10): the pickaxe item, recipe, stack and sprite,
left-hand attachment; four landed swings, rubble, stones, unchanged
footprint and nav grid, no second mining; small rocks, the axe not mining,
the stone limit; regrowth after 300 s and a second mining; respawn of a
collected node in world time and generation order; no respawn under a
building or the Blobbi; schema 4 round trip and schema 3 migration;
autonomy isolation; the pickaxe in the frame and hidden facing right.
`tests/scale-lab.test.ts` (2): every strategy on the gameplay canvas and
anchor, deterministic, `direct` equal to the gameplay sprite; the 2×
reduction and perfect self-scores. One M2.2 migration expectation was
updated for the new schema fields.

## 8. Review outcome

Manual gameplay test by the user (2026-10-10): passed, except "E on a small
rock with the pickaxe does nothing". Fixed in section 9. The 6-band
recommendation stays unapplied.

## 9. Fix: small rocks did nothing

**Symptom.** Approaching a small rock with the pickaxe and pressing E gave
no feedback, where "too small to mine" was expected.

**What was checked.** Rock classification (`size < 14`, correct), facing
and reach (`facingObject`: walking into every small rock of turtle-0/1/2
from all four sides, with lateral offsets, the small rock was the faced
object in 118 of 119 touching cases), collision (small rocks block like
large ones), and the E priority (collect, chop, mine, interact). In the
simulation the press always reached `mine()` and produced the bubble. The
logic was right; the press never reached it.

**Cause.** `LiveWorld.update()` handed edge-triggered keys (E, P) only to
the first fixed step of the frame. The clock runs 60 steps per second; a
display frame shorter than 1/60 s often runs no step at all, and a press on
such a frame was discarded. Measured by feeding `update()` real frame
cadences, 200 presses each: 60 Hz steady 0 lost, 60 Hz with jitter 14 lost,
120 Hz 100 lost, 144 Hz 116 lost. A large rock needs four presses and shows
a swing, so a lost press reads as "pressed twice"; a small rock answers a
single press with only a bubble (no swing, a neutral face), so a lost press
there looks like nothing at all.

**Fix.**
- `update()` keeps a press pending until a step consumes it (once); a
  paused world drops presses rather than replaying them on resume. The
  same fix covers chopping, mining, collecting, building, planting.
- The small-rock answer is more visible: the bubble stays 1.8 s, a puff of
  dust rises from the rock, the Blobbi gives a small surprised hop. Still
  no swing, no hit, no stones.
- The panel line reads "facing a small rock: too small to mine", and says
  when a resource in reach will be collected first.

**Unchanged on purpose.** The E priority (a resource in reach is collected
before a tool acts, M2.1) and every large-rock rule: four landed swings,
3-5 stones, 300 s rubble, footprint and navigation. Fixed 60 Hz steps keep
determinism: tests that step at 1/60 behave exactly as before.

**Regression tests** (`tests/mining.test.ts`, 6 new): a press on a
zero-step frame lands on the next step, once; every press answered at 120
and 144 Hz; walking into small rocks from every side gives the bubble,
dust and no swing; collect-first priority kept; large rocks still take
exactly four swings at 120 Hz; a paused press is dropped.

## 10. What to review

- Pickaxe look and the recipe (2 wood + 2 sticks + 3 stones).
- Four hits per rock, 3-5 stones, 300 s rubble.
- Respawn times (sticks 120 s, seeds 150 s, stones 180 s).
- Whether to adopt 6 bands at 32 px (section 5).

## Limitations

- World time only advances while the game runs, so nothing regrows in a
  closed tab.
- Small rocks are not minable (by design); loose stones are their stone
  source.
- The lab's reference alignment rounds the kit's width to whole pixels
  (under half a pixel of drift at the edges).
