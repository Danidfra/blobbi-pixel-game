/**
 * THE INTERFACE SIZE (P1.2A): which text size (`small` / `normal` / `large`, the one size setting there is) a
 * browser starts with, and when it becomes the player's own.
 *
 * - Every browser new to the game starts at Normal: phones, tablets and computers alike. (Phase 1 started phones at
 *   Small; measured in phase 2, Small only trimmed the text from a 9 to a 7 pixel cap height and saved about two
 *   points of HUD, so it is now the player's choice only.)
 * - Once the player picks a size in SETTINGS it is theirs: the settings record says so with `textSizeChosen: true`,
 *   and changes to other settings never set it. `textSizeChosen: false` means "the default", so a later change of
 *   the default reaches players who never picked a size, and never those who did.
 * - Records written before P1.2A have no marker: their size (Normal included, or none at all) is the player's,
 *   kept as it was. A browser without a record that has played before (a save or the islands list) keeps Normal as
 *   chosen, the size it always had.
 *
 * Pure: the record and the storage keys are handed in.
 */
import { readSettings, type TextSize } from './game-ui';
import { WORLD_INDEX_KEY } from '../game/worlds';
import { saveKey } from '../game/persistence';

/** A phone or a tablet (no hover, a finger): the query the playground uses for touch mode. */
export const TOUCH_SCREEN_QUERY = '(hover: none) and (pointer: coarse)';

/** The size a browser starts with before the player picks one, on every screen. */
export const DEFAULT_TEXT_SIZE: TextSize = 'normal';

/** Whether this browser has played before (an island saved or listed). */
export function playedBefore(keys: readonly string[]): boolean {
  const saves = saveKey('');
  return keys.some((k) => k === WORLD_INDEX_KEY || k.startsWith(saves));
}

/** The player's own size in a settings record (or a returning browser's Normal), or null: the default. */
export function storedTextSize(record: unknown, played: boolean): TextSize | null {
  if (!record || typeof record !== 'object') return played ? 'normal' : null;
  if ((record as Record<string, unknown>).textSizeChosen === false) return null;
  return readSettings(record).textSize;
}

/** The size for one page's life: the player's, or the default until they pick one. The playground keeps one. */
export class InterfaceSize {
  /** The player picked the size (or kept one from before P1.2A). */
  chosen: boolean;
  private last: TextSize;

  constructor(
    private readonly settings: () => { textSize: TextSize },
    record: unknown,
    played: boolean,
  ) {
    const stored = storedTextSize(record, played);
    this.chosen = stored !== null;
    this.settings().textSize = stored ?? DEFAULT_TEXT_SIZE;
    this.last = this.settings().textSize;
  }

  /** After any settings change: a new size is the player's pick; any other change leaves the size as it was. */
  settingsChanged(): void {
    if (this.settings().textSize !== this.last) this.chosen = true;
    this.last = this.settings().textSize;
  }
}
