/**
 * INPUT GUARDS (review 2026-11-26): system shortcuts never act in the game, letting go of Cmd lets go of held keys,
 * and only the main mouse button (or a touch, or a pen) presses. The page's handlers call these; a source check
 * keeps them wired.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isSystemShortcut, releasesHeldKeys } from '../src/ui/input-guards';

const none = { metaKey: false, ctrlKey: false, altKey: false };

describe('input guards', () => {
  it('Cmd, Ctrl or Alt with a key is the system\'s; a plain or shifted key is the game\'s', () => {
    expect(isSystemShortcut(none)).toBe(false);
    expect(isSystemShortcut({ ...none, metaKey: true })).toBe(true);
    expect(isSystemShortcut({ ...none, ctrlKey: true })).toBe(true);
    expect(isSystemShortcut({ ...none, altKey: true })).toBe(true);
  });

  it('letting go of either Cmd key lets go of the held keys; other keys do not', () => {
    expect(releasesHeldKeys('MetaLeft')).toBe(true);
    expect(releasesHeldKeys('MetaRight')).toBe(true);
    expect(releasesHeldKeys('KeyA')).toBe(false);
    expect(releasesHeldKeys('ShiftLeft')).toBe(false);
  });

  it('the page uses them', () => {
    const main = readFileSync('src/playground/main.ts', 'utf8');
    expect(main).toContain('isSystemShortcut(e)');
    expect(main).toContain('releasesHeldKeys(e.code)');
  });
});
