/**
 * THE NAMING PROMPT'S CALM PLAY (review 2026-11-26): a guest who put naming off is asked again after some calm play.
 * Time away from the tab is not calm play (regression: the first frame back carried the whole absence and opened
 * the prompt at once).
 */
import { describe, expect, it } from 'vitest';
import { nextNamingCalm } from '../src/game/guest-blobbis';

describe('calm play before the naming prompt', () => {
  it('adds calm frames, resets when not calm, and never counts a gap of a second or more', () => {
    let c = 0;
    for (let i = 0; i < 60; i++) c = nextNamingCalm(c, 1 / 60, true);
    expect(c).toBeCloseTo(1, 6);
    expect(nextNamingCalm(c, 45, true)).toBe(c); // back from a hidden tab
    expect(nextNamingCalm(c, 1 / 60, false)).toBe(0);
  });
});
