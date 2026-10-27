/**
 * THE KEYBOARD LIFT (P1.2A): on a touch screen, while a text field of the game has the keyboard, the game's canvas is
 * moved up so that field sits in the middle of what the keyboard leaves visible.
 *
 * Why: the on-screen keyboard covers the bottom of the screen without resizing the page, and the game is one fixed,
 * unscrollable canvas, so nothing ever brings a field under the keyboard back into view. Measured on an iPhone held
 * sideways, in the installed web app: the layout viewport stays 390 CSS px tall while the visual viewport shrinks to
 * 98 (292 px of keyboard); in Safari 668 → 468. The visual viewport is what shows, so the field is centred in it
 * (98 px and a 22 px field: its top at 38), with room above and below for the phone's own selection handles and
 * paste menu, and clear of the safe area at the top.
 *
 * With no keyboard up (the visual viewport as tall as the page) a field already in view is left alone, and the canvas
 * goes back the moment no field has the keyboard. The page's text inputs and native buttons are laid out from the
 * canvas's on-screen box every frame, and pointers are read against it, so they all follow the lift. A computer (no
 * touch screen) is never lifted.
 */

/** A vertical band in CSS pixels of the page (top < bottom). */
export interface Band {
  top: number;
  bottom: number;
}

/** The least gap kept between the field and the visible edges when there is room for it (CSS px). */
export const LIFT_MARGIN = 8;
/** Less than this much of the page hidden at the bottom is no keyboard (rounding, a browser bar): CSS px. */
export const KEYBOARD_MIN = 60;

/**
 * How far to lift the game (CSS px, never negative) so a field whose unlifted band is `field` sits centred in what
 * shows: `visible` (the visual viewport, in page pixels), less the safe area at the top (`insetTop`) and at the bottom
 * of the page (`insetBottom`, under a keyboard usually), given the page's height `pageHeight`. Without a keyboard a
 * field that is comfortably in view is not moved; a field above the centre is never pushed down.
 */
export function keyboardLift(field: Band, visible: Band, pageHeight: number, insetTop = 0, insetBottom = 0, margin = LIFT_MARGIN): number {
  const top = Math.max(visible.top, insetTop);
  const bottom = Math.min(visible.bottom, pageHeight - insetBottom);
  const keyboard = pageHeight - visible.bottom >= KEYBOARD_MIN;
  if (!keyboard && field.top >= top + margin && field.bottom <= bottom - margin) return 0;
  const h = field.bottom - field.top;
  // Centred in the room there is (with less room than the field, its top stays in view).
  const target = top + Math.max(0, (bottom - top - h) / 2);
  return Math.max(0, Math.round(field.top - target));
}

/** What of the page is visible now: the visual viewport when the browser has one (a keyboard, a pan), else the window. */
export function visibleBand(win: { innerHeight: number; visualViewport?: { offsetTop: number; height: number } | null }): Band {
  const vv = win.visualViewport;
  return vv ? { top: vv.offsetTop, bottom: vv.offsetTop + vv.height } : { top: 0, bottom: win.innerHeight };
}
