# M2.3: Visual equipment and interaction polish. Implementation report

Scope: `blobbi-pixel-game`, 2026-10-10. The axe the player crafts in M2.2 is
now a thing the Blobbi visibly holds, carries while walking, and swings at
a tree. M2.2 and M2.3 passed the user's manual gameplay test (one
correction, see section 8) and are complete and committed locally.

Images (`examples/equipment/`):

- `axe-blobbi-9.png`: the icon at 1×, 2×, 3×; every orientation and its
  mirror; the Blobbi at 16 and 24 px standing in the four directions
  without and with the axe; the six walking frames per direction with the
  axe; the four swing phases per direction.
- `axe-swing-live.png`: live frames of a swing at a tree from the side and
  from below: rest, raise, strike with the impact, recovered.

The playground (http://127.0.0.1:5177, Play) shows the axe icon in the
panel once the axe is owned, the axe in the Blobbi's hand when equipped,
and the icon beside the counter in the frame.

## 1. The procedural axe

`src/game/equipment.ts`. The axe is a set of small hand-set pixel
templates, one per orientation, coloured at draw time from the world's
wood ramp (handle) and a fixed steel ramp (head), with a one-pixel outline
in the wood's or the steel's outline colour depending on which material it
borders. No randomness, no assets. Orientations:

| Orientation | Used for |
|---|---|
| `rest` | hanging at the side (front and back views) and the inventory icon |
| `lowered` | hanging head-down from the near hand (side views at rest) |
| `raised` | pulled back, higher and further behind (the swing's wind-up) |
| `strike` | horizontal forward, edge down (side views) |
| `strike-down` / `strike-up` | the strike toward or away from the viewer (front and back views) |

Each template marks its grip pixel; a template is mirrored for the other
hand and integer-scaled for bigger Blobbis (×1 at 16 px, ×2 at 24-40 px).
The largest is 9×9 px with its outline, which reads at the play zoom of 3.

## 2. Attachment: hands found on the canonical sprite

The Blobbi is still the canonical sprite, untouched. To attach a tool, the
rig draws the same pose once more with every part except the chosen arm
left out (an additive `skipParts` option on the canonical builder) and
takes the arm pixel farthest from the body's centre as the hand. Because
this is the kit's own arm in the kit's own walk cycle, the grip follows
the arm swing frame by frame and the views by their own geometry; nothing
is tuned per direction. The hand is cached per pose key. The hand used is
the right arm in the front and back views and the near arm in the side
views.

Per direction (`attachTool`):

- front: `rest` at the right hand, edge outward, drawn in front;
- back: `rest` behind the body at the viewer's left; raising or striking
  brings it above the head, in front, as `strike-up`;
- side: `lowered` from the near hand, head down and forward, mirrored for
  the left, in front; the strike is horizontal toward the tree.

The renderer adds one drawable just behind or just in front of the Blobbi
in the painter's order, offset by the hand and lifted with the hop, so the
axe is part of the character and never floats, slides or rotates on its
own.

## 3. The swing

A press of E with the axe on a grown tree starts a swing instead of
landing a hit at once: `raise` for 0.10 s, `strike` from 0.10 to 0.24 s,
`recover` to 0.32 s, then `idle`. The hit lands at 0.18 s, inside the
strike: that is when the trunk shakes, chips fly from the impact point
(the trunk's near side at hand height, or the base when striking up or
down) and the hit counts. Three landed hits fell the tree and award wood
exactly as in M2.2; wood is never awarded before the third landed hit. A
press during a swing is ignored, so there is no queue and no double hits.
The Blobbi's reaction has no hop during a swing (the felling still gets its
small happy hop).

## 4. Inventory icon

`toolIcon` is the resting axe. The Play panel shows it at 4× beside its
state ("in the bag" or "equipped (in hand)") once the axe is owned; the
frame's counter shows it at 1× beside the resource counts while equipped,
replacing the earlier text tag.

## 5. Architecture

- `EQUIPMENT`: tool id → visual definition (templates per orientation and
  the arm per view). A second tool is a second entry with its own
  templates; the rig, the attachment rule and the renderer need no change.
- `EquipmentRig`: hand finding and cache for one Blobbi identity and size;
  rebuilt when the Blobbi changes.
- `attachTool(item, pose, animation, rig, spriteOf, palette)` → sprite,
  offset, layer, orientation, mirroring.
- `LiveWorld.swing` and `equipmentAnimation(time)`: the animation state
  the renderer asks for; `SWING` holds the timings.
- The renderer knows only "one drawable before or after the Blobbi".

No generic animation engine, no bone system: templates, a hand per pose
and four states.

## 6. Preserved

Recipes, quantities, stack limits, regeneration, resource placement, world
generation, turtle anatomy, the Blobbi genome and sprite, autonomy,
navigation and the save format are unchanged. The M2.2 tests were adapted
only to the swing timing (a hit lands 0.18 s after the press; one press per
swing); all pass.

## 7. Tests

130 pass (`npm test`; 120 after M2.2), typecheck and build pass. New
`tests/equipment.test.ts` (10, including the left-hand regressions): the axe's materials, outline, grip, size,
mirroring, scaling, icon and determinism; a hand found (never guessed) at
arm height on the arm's side in every view and walk frame; per-direction
attachment (mirroring, layers, orientations) and that the four directions
are four different placements; the grip moving with the walk by small
steps; deterministic attachment across rigs; the axe visible in frames
only while equipped and in every direction, gone from the character but
not the bag when unequipped, deterministic frames; the swing's states and
timings, the hit landing inside the strike, a second press ignored, frames
differing across phases, no hop, wood only on the last landed hit; walking,
autonomy and resources as before with the axe equipped.

## 8. Correction after the gameplay test: one anatomical hand

Reported after the gameplay test: facing left or right, the axe seemed to
be on both sides of the character.

Investigation: the renderer draws exactly one equipment drawable per frame
(verified headless and in the browser by counting connected clusters of
steel pixels: one in every frame, all directions, turns, walking, swings).
The actual defect was anatomical: the layer chose an arm per view, not per
hand. The kit names arm parts by screen side in both the front and the
back view, so "right-arm" from the front was the Blobbi's left hand, but
"right-arm" from the back was its right hand, and "near-arm" in the side
views was whichever hand faced the camera. The tool changed hands with the
direction.

The rule now (`armForHand` in `src/game/equipment.ts`): the axe is in the
Blobbi's anatomical LEFT hand in every view.

| View | Arm part | Where the axe is |
|---|---|---|
| front | `right-arm` | visible, viewer's right (unchanged) |
| back | `left-arm` | visible, viewer's left, behind the body |
| facing screen-left | `near-arm` | visible, the upright carry (unchanged) |
| facing screen-right | `far-arm` | hidden: behind the body while it hangs or walks; drawn behind the body during a swing, so only what the strike carries past the silhouette shows |

Attachments gained `visible` and `arm`. Visibility is separate from
attachment and animation state, so the swing keeps its timing and the hit
still lands while facing right, without transferring the tool to the other
hand. Templates, orientations, proportions, the front appearance, crafting,
inventory, chopping and the Blobbi anatomy are unchanged. (An interim
head-down side pose tried before the rule was clarified was reverted.)

Regression tests (`tests/equipment.test.ts`): in live frames, front visible
on the viewer's right, back visible on the viewer's left, left visible,
right hidden, standing and through twelve walking steps each; chopping
while facing right keeps the arm `far-arm`, drawn behind, with the same
swing timing and the hit registered; the back view strikes from the
viewer's left; the arm mapping, layers and visibility per view and swing
state. Images: `examples/equipment/four-directions.png` (standing, walking
frames and swing phases per direction, by `scripts/four-directions.ts`, kept
as the visual regression tool), `four-directions-chop-live.png`, and the
before state `side-views-before-browser.png`.

## 9. What was reviewed

The user tested crafting, equipping, chopping and regrowth in play and
approved the M2.2 and M2.3 mechanics with the left-hand correction above.
The swing length (0.32 s), the head's size at 16 px and the corner icon
stand as delivered.

## Limitations

- One equipped slot and one tool visual; hands are found per pose at
  first use (a few extra rasters, cached).
- The strike does not change the Blobbi's own pose (the kit's arms are
  what they are); the motion is the tool's.
- Facing is not turned toward the tree by the swing; the player faces it as
  in M2.2.
