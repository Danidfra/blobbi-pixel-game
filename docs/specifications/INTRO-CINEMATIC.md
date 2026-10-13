# Specification: Intro cinematic

Design rationale and the scene board: [Cinematic direction](../game-design/CINEMATIC-DIRECTION.md).

## 1. Purpose
A reusable, species-aware opening of about half a minute that shows, without exposition, the birth of a small living
world: a vast ocean, a World Carrier surfacing bare, an island forming on its back and coming alive, a Blobbi arriving
on it by the game's own teleport, noticing you and saying hello, then "Every little world has a story. This one begins
with you." It ends on the game's own exploration camera, where play (and the tutorial's first tip) begins.

## 2. Status
**IMPLEMENTED** (M8 cinematic session, 2026-10-11; reworked the same day after the first manual review: bare
Carrier, island formation, teleport arrival, the manta's wing framing, a smaller starting island for new turtles),
**NOT TESTED by a person at real speed**. **Integrated in M8**: making a new island (WELCOME → BEGIN, or NEW
ISLAND) saves the island with its intro pending and plays this cinematic on the real world (`startWorldIntro` in
`src/playground/main.ts`); it ends directly in play and is marked seen or skipped in the save (`intro`, schema 10).
A reload during it keeps the island and plays it again on the next opening; existing islands never replay it.
ABOUT → WATCH THE … INTRO replays it on a preview island (no store). The dev tools and the `#intro=` link (dev server
only) still preview it.

## 3. Player-facing behaviour
Five scenes, one timeline for all three species (`fullTiming`, `src/cinematic/script.ts`; seconds for the turtle
and the manta, the whale's ocean scene is one second longer):

| Scene | Seconds | What happens |
|---|---|---|
| A. The ocean | 0–5 | A fade from the title's dusk into open water that continues past the world's edge. The camera drifts against the Carrier's course, so a dark shape glides into view under the surface, head first (the turtle and the manta from the top, swimming south; the whale from the left, swimming east). |
| B. The Carrier | 5–11 | Framed whole, moving parts included, the shape breaks the surface behind a front of foam in its own order (turtle: dome, rim, head, flippers; manta: disc, then out along the wings; whale: snout, then back to the flukes) and is seen **bare**: no island, the animal alone (a turtle's whole plated shell, a seed-sized patch of soil and moss at its centre). Then the turtle blinks and glances toward where its island will be; the manta's wings keep beating; the whale's spout and blink come on their own cycle. |
| C. The island | 11–18.8 | 11.3–15.3: the land forms from a first patch at the centre of the carrying surface outward, two more patches joining, the edge wandering, fresh soil first and the real ground behind it. 15.0–16.2: a zoom to 2× on the island's heart. 14.8–18.4: life (plants, rocks, the house, their shadows) sparkles in along a second front. |
| D. The Blobbi | 18.8–27 | 18.8: the existing teleport arrival at the Blobbi's spot (the camera lifted toward the sky as in play): the cluster above, falling pixels, the shadow, the bottom-to-top rebuild, the eyes open, the smile and hop (22.4). 22.6–23.6: a zoom to 4×. 22.8 / 23.8: it turns one way, then the other (looking around). 24.8: faces you, surprised. 25.8: happy, a hop, "hello!" in a bubble sized for the close-up. |
| E. The beginning | 27–32 | The camera eases back to the exploration camera's own rest framing on the Blobbi (27–28.2); the two lines type out on a band of dusk (27.6, 29.3); the cinematic ends on the game's first frame. |

- **Skip:** any key, a click or a tap ends it at once. A hint ("ANY KEY OR TAP  SKIP") shows from 1.2 s until scene E.
- **Reduced motion:** 19.5 s, cuts instead of pans and zooms (the bare Carrier whole, its island forming at the same
  framing, then the gameplay framing), a one-second surfacing, a quick formation, the teleport's own short
  arrival (2.16 s, no camera lift), no hops, the same message.
- **Sound:** the sea and wind beds; the Carrier's own call from beneath, splashes and its breath as it surfaces (the
  whale's blow with its spout); `grow` as the first patch appears, `plant` as the later patches join, a chime as
  the land completes, birds with the life; the arrival's own `teleport-incoming`, `teleport-rebuild`,
  `teleport-arrived`; the Blobbi's `curious` and `happy`; a soft chime for the message; the generative score in
  `mystery` for the ocean, `day` from the first patch, `special` at the hello. Nothing sounds before the browser's
  first gesture; mute and the volumes apply.

## 4. Controls
Skip: any key (`keydown`), `pointerdown` (mouse, pen, touch). Dev tools (dev server): **Intro cinematic → Turtle /
Manta / Whale**, with a *reduced motion* checkbox; the link `#mode=play&intro=whale` (`&reduced=1`) plays it on load.
There is no production control yet (§2).

## 5. Data structures
- `IntroCinematic` (`src/cinematic/intro.ts`): constructor `({ live, renderer, view }, options)`; `frame(dt, W, H)`
  → the screen `PixelBuffer`; `skip()`; `dispose()`; `handoffView(W, H)`; `viewAt(t, W, H)`; `surfacing(t)`,
  `landProgress(t)`, `vegProgress(t)`; `done`, `scene`, `elapsed`, `duration`, `lastView`, `lastScreen` (the view
  renderer's own buffer), `timing`, `species`, `audio`, `formation`, `subject`.
- `IntroOptions`: `species?` (the live world's own is used), `reducedMotion?`, `audio?: AudioEngine | null`,
  `renderOptions?`, `uiScale?`, `onComplete?(result)`, `onSkip?()`.
- `IntroResult`: `{ skipped, cameraMode: 'exploration', elapsed, species, worldIdentity }`.
- `IntroTiming` (`script.ts`): scene starts and every moment inside them (`surfacing`, `carrierBeat`, `landForming`,
  `lifeForming`, `islandZoom`, `arrival`, `closeUp`, `looks`, `notices`, `happy`, `settle`, `line1`, `line2`);
  `surfacingOrder`, `travelDirection`, `carrierSounds`, `INTRO_MESSAGE`.
- `layers.ts`: `bareCarrierLayer(world)` (the world as the animal alone: the terrain painter over a bare terrain,
  with a bare underlay: a creature's drawn core, or the turtle's shell painted with a seed-sized island record),
  `terrainOnlyLayer(world, underlay)`, `formation(world, bare, land)` → `{ order, set, land, patches }`,
  `revealSubject(world, bounds, parts)`, `revealScale(W, H, subject)`, `isLand`.
- `sea.ts`: `OpenSea`, `movingPartsMask`, `composeIntroFrame(screen, view, world, sea, palette, time, state,
  scratch)` with `SubmergeState` (`shadow`, `progress`, `order`, `parts`, `staticLayer`, `bare`, `land`, `form`,
  `formSet`, `landProgress`, `vegProgress`), `SOIL_BAND`, `VEG_BAND`, `FULLY_GROWN`, `FULLY_SURFACED`.
- `IntroAudio` (`audio.ts`); `introPreviewWorld(kind)` (`preview.ts`: the turtle one on shell Variant S).

## 6. State transitions
`frame` → started (snapshots the Blobbi animator's volatile fields, the teleport's presence and its reduced-motion
flag, the turtle's blink schedule and the bubble; sets the Blobbi absent and calm) → scenes by `t`: the teleport is
begun with `enterBlobbi(worldTime)` at `timing.arrival` and stepped with the cinematic's clock each frame → **done**
at `timing.end` (`onComplete({ skipped: false })`), or at `skip()` (`onSkip`, then `onComplete({ skipped: true })`),
or at `dispose()` (no callbacks). Done is final; `frame` keeps returning the last frame; `dispose` frees the buffers
and makes `frame` throw.

The world is drawn at `clock.time − duration + t`, so the natural end lands on the game's own clock: water, wings,
fins, the Blobbi's reactions and the arrival's end continue without a jump (tests compare the handoff frame with
the game's first frame pixel for pixel below the message band). The simulation is **never stepped**: no world
time passes, no object moves, no growth stage changes.

## 7. Persistence
Nothing. The cinematic reads the live world and writes only: the Blobbi animator's volatile state (facing, gaze,
reaction, blink and glance schedules, mood baseline), the teleport controller (`absent` → arriving → `present`;
forced `present` on a skip or cancel, its reduced-motion flag restored), `live.turtleAnim` (blink and glance,
restored at the end) and `live.bubble` (cleared). Settled at the end so every value is in the game's clock domain
and the complete real world is shown. The preview world is a `LiveWorld` with `store: null`: it never reads or
writes a save (tests check the store stays empty, and that a run changes nothing the simulation owns).

## 8. Edge cases
- A stalled frame (`dt` > 0.1 s) advances the cinematic by 0.1 s at most: a long pause never jumps a scene.
- A resize between frames is honoured at once (segments are computed per screen size); the handoff view is
  recomputed for the new size.
- The reveal frames the whole animal (the still body plus every pixel its moving parts can reach), at 1× or a
  quarter step down to 0.5× (below the game's overview floor of 0.75×, so a manta's wing tips are never cut; every
  screen pixel is still one world pixel).
- Under the water, a moving part is the animal wherever it is drawn: over the deep and over the sea's own foam,
  shallow and water bands round the still body (a manta's wings cross those bands just outside the disc; a whale's
  fins and a turtle's flippers cross theirs). Only a part's wake, and water with nothing drawn on it, is painted as
  the sea. (The first compositor painted every band pixel as water, which cut each manta wing with a vertical
  strip of open sea at the disc's edge while it was submerged, leaving the tips as detached pieces: the second
  wing-clipping report.)
- The manta's whip is generated past the top of its world canvas (to y ≈ −129 on the preview seed) and is cut
  there by the world itself, in play as in the cinematic; the cinematic does not alter world geometry
  ([known issues](../testing/KNOWN-ISSUES.md) KI-23).
- The turtle's bare shell is painted with its real seeded seams in two rows over the whole dome; the ring just
  outside the real island differs a little from the final shell (its outer row sits further out), and forms with
  the land.
- Screens narrower than the message: the font scale steps down (3×, 2×, 1×) until the longest line fits.
- The whale's spout is on its existing 11 s cycle: it is seen during scenes B–C, not at a fixed beat.
- `lastScreen` aliases the view renderer's buffer: a host that keeps a frame clones it.

## 9. Failure handling
Unknown sound names are ignored; a null engine is silent; `skip` and `dispose` are idempotent; `frame` after
`dispose` throws (programming error). If the host loses the cinematic without disposing it, the Blobbi may be left
`absent` until the game's own teleport logic or a reload; hosts must call `skip` or `dispose`.

## 10. Source files
`src/cinematic/intro.ts` (timeline, camera, arrival, performance, overlays, handoff), `src/cinematic/script.ts`
(species data, timings, surfacing orders), `src/cinematic/layers.ts` (the bare Carrier, the terrain alone, the
formation order, the reveal subject), `src/cinematic/sea.ts` (open water beyond the edge, the shape beneath, the
foam front, the island forming, life appearing), `src/cinematic/audio.ts` (cues), `src/cinematic/preview.ts`
(preview worlds), `src/playground/main.ts` (`startIntroPreview`, skip wiring, `#intro=`), `src/dev/dev-tools.ts`
(buttons), `scripts/intro-cinematic.ts` (frames and contact sheets). The small start: `src/carrier/types.ts`
(Variant S, `NEW_WORLD_SHELL_VARIANT`), `src/carrier/turtle-carrier.ts`, `src/world/turtle-world.ts`
(`generateTurtleBase`), `scripts/turtle-start.ts`.

## 11. Automated tests
`tests/cinematic.test.ts` (24): timings and scene order (emergence before formation before life before the
arrival before the greeting); species surfacing orders; the moving-parts mask; open water identical to the terrain
painter's and the live renderer's rules; the bare picture (every land pixel is the animal, open water untouched),
the formation (first patch on land near the land's centre, later patches delayed, order 0 at the patch and 1 at
the edge, never over a moving part, a whale's patches between blowholes and knuckles, a turtle's shell plated
when bare); the bare Carrier shown with no land, a small patch, the whole island, then life, with the island's rows
equal to the game's own render once life is complete; the reveal framing holding every moving-part pixel at four
screen sizes and the manta's wing tips drawn (the first clipping regression); the manta's wings whole under the
water at three screen sizes, under the shadow and half-way through the surfacing (less than 2 % of the wing pixels
beyond the disc, at the drawn beat frame, showing an open-sea colour; the second clipping regression, 46 % before
the fix); a full run per species (sizes, scales
0.5–4, whole-pixel origins at rest, all five scenes, nothing the simulation owns changed, store empty, teleport
present, a valid animator state, the last view equal to the exploration camera's snap, the frame below the band
identical to the game's first frame); the Blobbi absent until the arrival (no particles, `visible` 0), the existing
teleport reused (particles, event order, the game's smile and hop); the performance (side, other side, surprised
front, happy front with "hello!" and a wide bubble, beats at least half a second apart); determinism; skip at eight
phases (callback order, settled state, untouched world, the Blobbi present and drawn on the complete island,
dispose); cancel without callbacks; reduced motion (no transitions, no hops, the short arrival, flag restored);
resize mid-run; the frame clamp; sound cues per species (existing names only, the voice, the formation and
arrival cues, mystery → day → special) and silence without an engine; preview worlds.

`tests/turtle-start.test.ts` (7): variants 0–3 byte-identical to hashes pinned before Variant S existed (terrain,
objects, land, stage 3); a Variant B save untouched beside a Variant S world of the same seeds, both identities
parsing and reopening; Variant S deterministic, about half the land of B at about 40 % coverage, the turtle about
as big, the same object sizes and fewer objects, the frame unchanged; land centred and well inside the shell, head
and flippers skin; three meaningful stages (+25 %, +40 %, +65 % or more) each containing the last, a plate ring
left at stage 3, the share of the shell between the manta's and the whale's; playable (standing at the hub, over
90 % of standable pixels reachable, resources on land, a shelter placed); the preview world on Variant S.

## 12. Known limitations
Not seen or heard by a person at real speed (the frames in `examples/intro-cinematic/` and scripted headless-Chrome
passes are the only checks); not attached to START or NEW ISLAND; the whale's spout timing is its own; the manta's
whip is cut by its world canvas; the lab's default world (no `variant` in the link) stays on Variant B; one
message, English, capitals. See [known issues](../testing/KNOWN-ISSUES.md) KI-19 … KI-26.

## 13. Extension points
A new species needs an entry in `surfacingOrder` and `travelDirection` (the formation measures the land itself);
scene lengths are one `IntroTiming` per presentation; the message is `INTRO_MESSAGE`; the host integration is
`new IntroCinematic(ctx, { onComplete })` + `frame` per animation frame + `skip` on input, then
`viewCamera.setMode(result.cameraMode, true)` and a snapped update.

## M11D.3: the first birth

For a genuinely new (local, unborn) Blobbi the Blobbi scene becomes a birth: its own kit egg arrives by the arrival's
particles, rocks, cracks and hatches, then the usual performance (`birthTiming`, `IntroOptions.birth`); about 37 s,
21.5 s with reduced motion. Without a birth the timing is exactly as before. A local presentation: no canonical stage
is stated or changed. See [M11D.3](../milestones/M11D3.md) §8.
