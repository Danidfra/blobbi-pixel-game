# Text fields and the smooth camera

Two pieces of the frame that meet the browser directly (2026-10-22).

## Text fields: a real input over each drawn field

Menus are drawn on the canvas, so a text field is drawn too (`drawTextField` in `src/ui/text-field.ts`): its box,
the text (stars for secrets), the selection, a caret that holds still for half a second after a change and then
blinks (steady with reduced motion), and a two-line accent ring while focused. Drawing a field registers a
`FieldBox` on the `Gfx`; `GameUI.fields` and `TitleScreen.fields` hand the frame's boxes to the page.

`src/playground/text-inputs.ts` keeps one transparent native `<input>` laid exactly over each box, so clicks, taps,
the phone keyboard, selection, copy/paste, undo, IME and shortcuts are the browser's own. The input's value and
selection are mirrored into `fieldFocus`, which the canvas draws from.

- Keys: Enter runs the field's `onEnter` (submit or next field), Tab/Shift+Tab move between fields and then to the
  canvas, Esc returns to the canvas, Up/Down go back to the menu. Keys in a field never reach the game: the game's
  keyboard listener is on the canvas only.
- Focus: on desktop a newly shown field with `autofocus` takes focus when the canvas has it; on touch screens
  (`(hover: none) and (pointer: coarse)`) nothing takes focus by itself, so the keyboard opens only on a tap.
- Secrets (`kind: 'password' | 'secret'`) are `type=password` without autocorrect, autocapitalize or spellcheck.
  A `secret` field keeps the exact pasted text, line breaks included (a backup file pasted whole); its input shows a
  one-line copy. A field's input and value are dropped as soon as its page stops drawing it. Nothing logs values
  (`tests/text-fields.test.ts` checks the files for console calls).
- The page CSS uses a doubled class (`input.blobbi-field.blobbi-field`) to beat `styles.css`'s input rules.

Checks: `tests/text-fields.test.ts`, and `npx tsx scripts/text-input-browser.ts` in the muted lab browser.

## The camera: screen pixels at rest, drawn between steps

The simulation steps at a fixed 60 Hz (`SimClock`). Two things made walking jitter:

1. The camera origin and the Blobbi snapped to whole world pixels, so at 6× the world moved 0 or 6 screen pixels a
   frame, and diagonals moved as a staircase.
2. Nothing was drawn between steps, so displays above 60 Hz showed still frames, and frame-time wobble gave double
   jumps.

Now, at rest (no zoom transition, whole scale), `ViewCamera.view()` follows the Blobbi on the screen-pixel grid
(`gridSteps`, `onGrid`) and `blobbiScreenAnchor` places the Blobbi on the same grid. World pixels are still drawn as
whole blocks. `LiveWorld.interpolatedBlobbi()` draws the Blobbi between its last two steps by `clock.fraction`
(presentation only; long jumps such as teleports snap), and `main.ts` feeds the camera the same drawn time, so the
existing never-step-back rule holds. The shadow is handed to `ViewRenderer` (`SplitLayers.shadow`) and drawn with the
Blobbi. The canoe keeps whole world pixels (`onWorldGrid`). The intro cinematic ends on the same grid.

`src/render/backing.ts` can size the canvas in whole device pixels at fractional pixel ratios; it is off by default
because at a ratio of 2.625 in landscape the menus would drop from 2× to 1×.

Checks: `tests/camera-smoothness.test.ts` (60/75/120/144 Hz, four directions, frame wobble, shadow), `tests/camera.test.ts`.
