# Touch controls

How a phone or tablet player moves and acts (P1.1, 2026-10-23). One movement system: the touch stick feeds the same
`LiveInput` directions as WASD and the arrow keys (`readInput` in `src/playground/main.ts`).

## The stick and USE (`src/ui/touch.ts`)

- A finger down on the world (not on a menu, the hotbar, a field or the camera indicator) starts a floating stick
  there. Past `DEAD_ZONE` it walks the Blobbi at its angle (8 ways); a short tap without a drag walks to the tapped
  spot instead. Past the rim the base follows the finger.
- The USE button (bottom right, above the menu bar) presses E.
- The stick ends on `pointerup`; it is cancelled without walking on `pointercancel`, `lostpointercapture`, the window
  losing focus, the page being hidden, and a menu opening (`TouchControls.cancel`), so it never stays held.
- The canvas has `touch-action: none`, no text selection, no long-press callout and no tap flash; the page has
  `overscroll-behavior: none` (no pull-to-refresh while dragging).

## Touch mode

`touch.enabled` turns on from the start on a touch screen (`(hover: none) and (pointer: coarse)`), or at the first
touch on anything else (a laptop with a touch screen). It shows USE, makes the menu bar larger, and words the tips
for touch ("Drag anywhere on the island to walk"). A mouse-and-keyboard computer never enters it.

## The joystick hint (`src/ui/joystick-hint.ts`)

A translucent resting stick near the bottom-left corner, drawn only in touch mode during play (not under a menu, the
title or the intro). It is a picture, not a control: a thumb on it starts the ordinary floating stick right there.

| State | Look |
|---|---|
| New player (never walked with the stick) | fades in to its full translucent look, four small arrows, the knob nudging right, up, left, down in turn (none with reduced motion) |
| Any movement input (stick, key, tap to walk) | the nudging stops for the session |
| Stick held | the hint steps aside (the stick itself is drawn) |
| Walked `LEARN_PX` with the stick | learned: fades to `LEARNED_ALPHA`, remembered in `blobbi-pixel-lab:touch-hint` |
| Learned, no movement for `IDLE_AFTER_S` | eases back to `IDLE_ALPHA`; the nudging never returns |
| Returning player (learned in this browser) | starts at `IDLE_ALPHA`, no arrows, no nudging |

Every level change is a linear fade over `FADE_S`. Placement (`hintAnchor`): inside the safe-area insets, then above
anything already there (menu bar, hotbar, mode bar, tip, invitation, camera indicator, `GameUI.occupied`); not drawn
when there is no clear spot below the status card.

Checks: `tests/joystick-hint.test.ts`, and `npx tsx scripts/touch-hint-browser.ts` (emulated phones, muted lab
browser).
