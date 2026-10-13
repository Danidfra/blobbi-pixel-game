/**
 * M11D.1, THE INTRO REPORT ("on an existing Brave profile the Carrier's emergence starts too far along or finishes
 * too quickly; a new game in another browser plays normally"). What can and cannot change the intro's pace:
 *
 * - its clock: real frame time, each frame capped at 0.1 s, starting at 0 for every new island (a long-open tab, a
 *   stalled first frame or an existing save never jump it ahead);
 * - its form: the reduced-motion timing, chosen ONLY by the reduced-motion setting. That form shows exactly the
 *   symptom (the Carrier's shadow already there at the first frame, a one-second surfacing instead of four);
 * - the setting: before M11D.1 changing ANY setting stored the reduced-motion value of that moment for good, so one
 *   profile could keep the reduced intro silently while another browser played the full one. Fixed: the stored value
 *   counts only when the player toggled it (records from before keep their value).
 */
import { describe, expect, it } from 'vitest';
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer } from '../src/render/live-render';
import { ViewRenderer } from '../src/render/view-renderer';
import { memoryStore, saveKey } from '../src/game/persistence';
import { IntroCinematic } from '../src/cinematic/intro';
import { introPreviewWorld } from '../src/cinematic/preview';
import { fullTiming, reducedTiming } from '../src/cinematic/script';
import { DEFAULT_SETTINGS, readStoredSettings, reducedMotionChosen, settingsRecord } from '../src/ui/game-ui';

describe('the intro clock', () => {
  function intro(reducedMotion: boolean, store = memoryStore()) {
    const live = new LiveWorld(introPreviewWorld('turtle'), 'blobbi-9', 16, { store });
    const renderer = new LiveRenderer(live);
    const view = new ViewRenderer(live, renderer);
    return new IntroCinematic({ live, renderer, view }, { reducedMotion });
  }

  it('starts at zero and a huge first frame (a tab open for hours) advances it by at most 0.1 s', () => {
    const i = intro(false);
    expect(i.elapsed).toBe(0);
    i.frame(3600, 160, 90);
    expect(i.elapsed).toBeLessThanOrEqual(0.1);
    i.frame(-5, 160, 90); // a clock that goes backwards never rewinds or jumps
    expect(i.elapsed).toBeLessThanOrEqual(0.1);
  });

  it('is not changed by what the browser already holds: an existing save, settings, other islands', () => {
    const fresh = intro(false);
    const store = memoryStore({ 'blobbi-pixel-lab:settings': JSON.stringify({ sound: false, textSize: 'large' }), 'blobbi-pixel-lab:active-world': 'x' });
    const old = new LiveWorld(introPreviewWorld('manta'), 'blobbi-9', 16, { store });
    old.save();
    expect(store.get(saveKey(old.identity))).toBeTruthy();
    const existing = intro(false, store);
    expect(existing.duration).toBe(fresh.duration);
    for (let k = 0; k < 20; k++) {
      fresh.frame(1 / 30, 160, 90);
      existing.frame(1 / 30, 160, 90);
    }
    expect(existing.elapsed).toBe(fresh.elapsed);
  });

  it("only the reduced form shows the report's symptom: the shadow already in at the start, a one-second surfacing", () => {
    const full = fullTiming('turtle');
    const reduced = reducedTiming();
    expect(full.shadowIn[0]).toBeGreaterThan(0.5); // the full intro begins on empty sea, the shadow rising after
    expect(full.surfacing[1] - full.surfacing[0]).toBeGreaterThanOrEqual(4);
    expect(reduced.shadowIn[1]).toBeLessThan(0.05); // already there on the first frame
    expect(reduced.surfacing[1] - reduced.surfacing[0]).toBeLessThanOrEqual(1);
    expect(intro(true).duration).toBeLessThan(intro(false).duration);
  });
});

describe('reduced motion follows the system until the player chooses', () => {
  it('changing another setting no longer freezes the system value of that moment', () => {
    // The system asked for reduced motion; the player turned the sound off: the record leaves reduced motion out.
    const stored = settingsRecord({ ...DEFAULT_SETTINGS, reducedMotion: true, sound: false }, false);
    expect(stored.reducedMotion).toBeUndefined();
    expect(reducedMotionChosen(stored)).toBe(false);
    // Later the system no longer asks for it: the full intro plays.
    expect(readStoredSettings(JSON.parse(JSON.stringify(stored)), DEFAULT_SETTINGS, false).settings.reducedMotion).toBe(false);
    expect(readStoredSettings(JSON.parse(JSON.stringify(stored)), DEFAULT_SETTINGS, true).settings.reducedMotion).toBe(true);
    expect(readStoredSettings(JSON.parse(JSON.stringify(stored)), DEFAULT_SETTINGS, false).settings.sound).toBe(false);
  });

  it("the player's own toggle is kept whatever the system says", () => {
    const on = settingsRecord({ ...DEFAULT_SETTINGS, reducedMotion: true }, true);
    expect(readStoredSettings(on, DEFAULT_SETTINGS, false)).toEqual({ settings: expect.objectContaining({ reducedMotion: true }), chosen: true });
    const off = settingsRecord({ ...DEFAULT_SETTINGS, reducedMotion: false }, true);
    expect(readStoredSettings(off, DEFAULT_SETTINGS, true).settings.reducedMotion).toBe(false);
  });

  it('a record from before M11D.1 keeps its stored value (it may be a real accessibility choice)', () => {
    expect(readStoredSettings({ daylight: true, reducedMotion: true }, DEFAULT_SETTINGS, false).settings.reducedMotion).toBe(true);
    expect(readStoredSettings({ daylight: true, reducedMotion: false }, DEFAULT_SETTINGS, true).settings.reducedMotion).toBe(false);
    // No value at all: the system's.
    expect(readStoredSettings({ goals: false }, DEFAULT_SETTINGS, true)).toEqual({ settings: expect.objectContaining({ reducedMotion: true, goals: false }), chosen: false });
  });
});
