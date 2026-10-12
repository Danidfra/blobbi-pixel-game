# Cinematic direction: the opening

Status: **IMPLEMENTED** (M8 cinematic session, 2026-10-11; reworked the same day after the first manual review) as
a reusable, previewable feature; **NOT TESTED** by a person at real speed; not yet attached to the start of play.
The behaviour-level specification is [Intro cinematic](../specifications/INTRO-CINEMATIC.md). Frames:
`examples/intro-cinematic/` (`npx tsx scripts/intro-cinematic.ts`).

## What it says, without saying it

The ocean is wide and old. Something enormous and gentle moves beneath it. It surfaces: an animal, a turtle, a manta,
a whale, with nothing on its back. Then a patch of soil appears there, and spreads, and greens, and trees come up,
and a small world exists where there was a shell. A Blobbi arrives on it the way Blobbis arrive, looks around at
its new home, notices you, and is glad. Then: *Every little world has a story. This one begins with you.*

**Mystery → discovery → creation → life → welcome.** It must feel magical, peaceful and alive. It never explains
where Carriers or Blobbis come from, never shows the whole world, never names anything. The island is not a thing
to own: the player watches it be born on a living creature.

## The scene board

| | Scene | Picture | Camera | Sound |
|---|---|---|---|---|
| A | The ocean (5–6 s) | A fade from the title's dusk into water with no edge. A dark shape fades in under the surface and glides into view, head first. | The reveal scale (1×, or a quarter step down to 0.5× so the whole animal fits), panning against the Carrier's course, whole world pixels every frame. | Sea and wind, the score's `mystery` mood, the Carrier's call from beneath. |
| B | The Carrier (6 s) | The shape breaks the surface behind a front of foam, in its own order per species, **bare**: a turtle's whole plated shell, a manta's disc and wings, a whale's grey back; its wake and shallow bands appear with it. Then its own moment. | Still, framed whole (wing tips, fins and flukes included). | Splashes, the Carrier's breath; the turtle's hum; the whale's blow with its spout. |
| C | The island (7.8 s) | A patch of fresh soil appears at the centre of the carrying surface and spreads outward in the land's own proportions, two more patches joining it, the edge wandering: soil first, then the real ground. The camera pushes in to 2× as life comes: trees, bushes, rocks, flowers and the house sparkle in behind a second front. | The whole-Carrier framing holds while the land forms; then a log-eased zoom to 2× on the island; the view drifts up a little before the arrival (the game's own lift). | `grow` as the first patch appears, `plant` as the later patches join, a chime as the land completes, birds with the life; the score moves to `day`. |
| D | The Blobbi (8.2 s) | The existing teleport arrival at the island's heart: the cluster high above, pixels falling, the shadow, the bottom-to-top rebuild, eyes opening, the smile and hop. Then 4×: it turns one way, the other way (looking around), faces you (surprised), then smiles, hops and says "hello!" in a bubble sized for the close-up. | 2× for the arrival with the sky in view, then a zoom to 4×, then still. | The arrival's own sounds (incoming, rebuild, arrived), `curious`, `happy`; the score's `special` mood at the hello. |
| E | The beginning (5 s) | The two lines type out on a band of dusk, the first in ink, the second in the accent yellow. | A zoom back to exactly the exploration camera's rest framing on the Blobbi: the game's first frame. | A soft chime. |

Reduced motion: the same board as cuts (the Carrier whole and bare, its island forming at the same framing, then
the gameplay framing for the arrival and everything after), a one-second surfacing, a quick formation, the
teleport's own short arrival, no hops, 19.5 s.

## Species rhythm, one framework

The timeline, camera engine, compositor, formation, performance and sound cues are shared. What differs is data:

| | Course | Enters from | Surfaces | Bare | Its own moment |
|---|---|---|---|---|---|
| Turtle | south | the top | dome first, then the rim, head and flippers | the whole shell plated, with a seed-sized patch of soil and moss at its centre (the real plate seams, painted as if the land were that patch) | a blink and a glance toward where its island will be, then a second blink |
| Manta | south | the top | the disc first, then out along the wings; tips and whip last | its full disc, chevrons, spots and wings | its wing beat never stops; its chime as it surfaces |
| Whale | east | the left, a long shadow | snout first, back along the spine, the flukes last | its grey back from snout to tail stock, fins, flukes, knobs and barnacles | its spout and the blink after it, on its own 11 s breath; its song |

The land then forms on each where its real island lies: at the turtle's shell centre, on the manta's still disc
(never its moving wing tips), on the whale's back between the blowholes and the knuckles. Nothing in any animal's
anatomy, animation or renderer was changed: the cinematic draws the same frames the game draws and recolours them.

## The birth of the island

Not a fade, not a wipe. Every forming pixel has an order: its distance from the first patch in the land's own
proportions, or from one of two later patches with a delay, whichever comes first, with a little noise so the
edge wanders. The land arrives as fresh earth (a dithered soil band about three world pixels wide at the island's
scale) and greens behind it; life (anything standing on the land, and its shadow) sparkles in along a second
front that trails the first. The formation is deterministic from the world seed and ends on the game's own
pixels. See the layers in [`src/cinematic/layers.ts`](../../src/cinematic/layers.ts).

**A new turtle starts small.** The first cinematic made the turtle's island cover most of its shell; the review
asked for a small, cozy start with room to grow, as the manta and the whale have. New turtle worlds now use shell
Variant S (the island about 40 % of the shell, growing to about 64 % by stage 3); existing worlds keep their
variant. Pictures and numbers: `examples/turtle-start/` (`npx tsx scripts/turtle-start.ts`); details in
[World Carriers](../architecture/WORLD-CARRIERS.md) and [World growth](../specifications/WORLD-GROWTH.md).

## Camera language

- The game's camera system is respected: integer scales at rest, origins on whole world pixels, log-eased zooms
  like the Z key's, nearest-neighbour always; no blur, no jitter, no sub-pixel drift.
- The reveal frames the **whole** animal: the still body plus every pixel its moving parts can reach, at 1× or a
  quarter step down (to 0.5× at the smallest) so a wide manta or a long whale is never cut at the screen's edge.
  (The first cinematic framed the game's overview subject, which leaves the manta's wing tips out: that was the
  first wing clipping. The second was under the water: the compositor painted the sea's own bands round the disc
  as water even where a wing was drawn over them, so each submerged wing was cut by a strip of sea just outside
  the disc and its tip floated detached. A moving part is now the animal wherever it is drawn.)
- Scale is shown by framing: the Carrier fills the frame; the island fills it at 2×; the Blobbi is the native 48 px
  drawing at 4×.
- The arrival uses the teleport's own camera lift (a fifth of the view toward the sky), eased in just before it.
- The last move settles into the exploration camera's own rest framing on the Blobbi, computed by the game's
  `ViewCamera`, and the world is drawn at `clock − duration + t`, so the cut to play is invisible.

## The Blobbi's performance

Only the existing systems: the `TeleportController`'s arrival (begun on the cinematic's clock, its events read every
frame for its sounds and the game's own smile and hop on landing), then the animator: a turn to one side and the
other with the gaze following (looking around), `surprised` facing front (noticing you), `happy` with a 3 px hop
and the speech bubble "hello!", the smile held through the message. Beats are at least a second apart. Canonical
V3 identity, seed-derived appearance, the native raster at 12/24/48 px: untouched. The Blobbi is absent (never
drawn) until its island exists.

## Audio progression

Existing engine, existing effects, existing moods. `mystery` (E lydian, floating) under the ocean and the
surfacing; `day` (F major) from the first patch of land; `special` (G major, the game's own "something happened"
music, as after a teleport arrival in play) at the hello. The Carrier's own voice and breath; `splash`; `grow`,
`plant`, `recipe` and `bird` for the formation; the teleport's `incoming`, `rebuild` and `arrived`; the Blobbi's
`curious` and `happy`; `friend`'s small chime for the message. Gains at or below 1 on the existing buses; silent
until the browser's first gesture; the game's director takes the beds and the music back on the first play frame.

## What it avoids

Exposition, lore facts, origins; combat-style camera moves; unskippable length (every input skips, the hint says
so); alpha-blended sprites, blur, non-pixel effects (every change is a whole-pixel recolour: the title's dusk fade,
the submerged tone, the foam dither, the soil band, the life sparkle, the message band); new art, new renderers,
new assets, a new spawning effect; stepping the simulation, changing a growth stage or touching a save.
