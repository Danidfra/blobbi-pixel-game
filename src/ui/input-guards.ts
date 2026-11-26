/**
 * INPUT GUARDS: which presses are the game's (keys and pointers). Pure, so the rules are tested without a page (the handlers that use
 * them live in src/playground/main.ts).
 */

/** The modifier state of a key event (KeyboardEvent has these). */
export interface Modifiers {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

/**
 * A key pressed with Cmd, Ctrl or Alt belongs to the browser or the system (Cmd+F find, Cmd+C copy, Ctrl+R reload,
 * Cmd+Z undo), never to the game: without this, Cmd+F fed the Blobbi and Cmd+C crafted an axe. Shift stays the
 * game's (it changes some menu keys).
 */
export const isSystemShortcut = (e: Modifiers): boolean => e.metaKey || e.ctrlKey || e.altKey;

/**
 * macOS sends no keyup for a key released while Cmd is held (Cmd+A, Cmd+S): letting go of Cmd lets go of every key
 * held, or the Blobbi would walk on by itself.
 */
export const releasesHeldKeys = (code: string): boolean => code === 'MetaLeft' || code === 'MetaRight';

/** The pointer event fields that tell a primary press from the others. */
export interface PointerPress {
  pointerType: string;
  button: number;
}

/**
 * A press that acts in the game: any touch or pen contact, or the main mouse button. A right or middle click is the
 * browser's (its context menu, auto-scroll), never a tap on a menu button or a walk-to.
 */
export const isPrimaryPress = (e: PointerPress): boolean => e.pointerType !== 'mouse' || e.button === 0;
