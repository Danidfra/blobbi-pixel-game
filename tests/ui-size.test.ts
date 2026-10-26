/**
 * P1.2A: the interface size (`src/ui/ui-size.ts`). A browser new to the game starts at Normal on phones, tablets and
 * computers alike, until the player picks a size in SETTINGS; a pick is kept through reloads and changes to other
 * settings. Every size stored before P1.2A (Normal included) is kept as the player's own, and so is a returning
 * browser's Normal; the old manual MENU SCALE is dropped.
 *
 * `boot` replays what the playground does on each page load (`main.ts`, settings): read the record, keep the
 * reduced-motion choice, size the interface, and write a record at once when there was none. The default no longer
 * depends on the screen (phase 2 measured Small on phones: smaller text for almost no room), so a page load is the
 * same on a phone, a tablet and a computer.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, GameUI, PANEL_H, PANEL_W, readStoredSettings, settingsRecord, type TextSize, type UiSettings } from '../src/ui/game-ui';
import { DEFAULT_TEXT_SIZE, InterfaceSize, playedBefore, storedTextSize } from '../src/ui/ui-size';
import { WORLD_INDEX_KEY } from '../src/game/worlds';
import { saveKey } from '../src/game/persistence';

const SETTINGS_KEY = 'blobbi-pixel-lab:settings';

/** One browser's localStorage. */
const browser = (init: Record<string, unknown> = {}) => new Map<string, string>(Object.entries(init).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));

/** One page load, as the playground does it; returns the live session (settings, size, and "the player changed a setting"). */
function boot(store: Map<string, string>) {
  let settings: UiSettings = { ...DEFAULT_SETTINGS };
  let reducedChosen = false;
  const raw = store.get(SETTINGS_KEY);
  const record: unknown = raw ? JSON.parse(raw) : null;
  if (record) ({ settings, chosen: reducedChosen } = readStoredSettings(record, settings, false));
  const size = new InterfaceSize(() => settings, record, playedBefore([...store.keys()]));
  const save = () => store.set(SETTINGS_KEY, JSON.stringify(settingsRecord(settings, reducedChosen, size.chosen)));
  if (!record) save();
  return {
    size,
    get settings() {
      return settings;
    },
    /** A SETTINGS row was used (`settingsScreen.onChange`). */
    change(f: (s: UiSettings) => void) {
      f(settings);
      size.settingsChanged();
      save();
    },
  };
}
const stored = (store: Map<string, string>) => JSON.parse(store.get(SETTINGS_KEY)!) as Record<string, unknown>;

describe('the default size for a browser new to the game', () => {
  it('is Normal (phones, tablets and computers alike)', () => {
    expect(DEFAULT_TEXT_SIZE).toBe('normal');
  });

  it('fresh install (mobile, tablet or desktop): Normal, not chosen, written as the default', () => {
    const store = browser();
    const page = boot(store);
    expect(page.settings.textSize).toBe('normal');
    expect(page.size.chosen).toBe(false);
    expect(stored(store)).toMatchObject({ textSizeChosen: false });
    expect(stored(store)).not.toHaveProperty('textSize');
  });

  it('a phase 1 record (Small by default, never picked) now reads Normal', () => {
    const page = boot(browser({ [SETTINGS_KEY]: { sound: true, textSizeChosen: false, reducedMotionChosen: false } }));
    expect(page.settings.textSize).toBe('normal');
    expect(page.size.chosen).toBe(false);
  });

  it('a new player keeps the default after playing and reloading (the first record tells it apart)', () => {
    const store = browser();
    boot(store);
    store.set(saveKey('turtle:abc'), '{}');
    store.set(WORLD_INDEX_KEY, '{"turtle:abc":1}');
    const again = boot(store);
    expect(again.settings.textSize).toBe('normal');
    expect(again.size.chosen).toBe(false);
  });
});

describe('sizes stored before P1.2A are kept as the player chose them', () => {
  for (const size of ['small', 'normal', 'large'] as TextSize[]) {
    it(`an existing record with ${size} keeps ${size}, untouched`, () => {
      const store = browser({ [SETTINGS_KEY]: { daylight: true, goals: true, sound: false, textSize: size, reducedMotionChosen: false } });
      const page = boot(store);
      expect(page.settings.textSize).toBe(size);
      expect(page.size.chosen).toBe(true);
      expect(page.settings.sound).toBe(false);
      // Nothing is rewritten on load: the record stays exactly as it was until the player changes something.
      expect(stored(store)).not.toHaveProperty('textSizeChosen');
    });
  }

  it('the pre-M11B large HUD text is still the large size, kept', () => {
    const page = boot(browser({ [SETTINGS_KEY]: { largeText: true } }));
    expect(page.settings.textSize).toBe('large');
    expect(page.size.chosen).toBe(true);
  });

  it('a record with no size at all (written before M11B) keeps Normal', () => {
    const page = boot(browser({ [SETTINGS_KEY]: { daylight: false } }));
    expect(page.settings.textSize).toBe('normal');
    expect(page.size.chosen).toBe(true);
    expect(page.settings.daylight).toBe(false);
  });

  it('a browser that has played but never stored settings keeps Normal, and is written as chosen', () => {
    for (const k of [WORLD_INDEX_KEY, saveKey('manta:xyz')]) {
      const store = browser({ [k]: '{}' });
      const page = boot(store);
      expect(page.settings.textSize).toBe('normal');
      expect(page.size.chosen).toBe(true);
      expect(stored(store)).toMatchObject({ textSize: 'normal', textSizeChosen: true });
    }
  });

  it('only a save or the islands list counts as having played', () => {
    expect(playedBefore([])).toBe(false);
    expect(playedBefore(['blobbi-pixel-lab:touch-hint', 'blobbi-pixel-lab:audio', 'blobbi-pixel-lab:locale'])).toBe(false);
    expect(playedBefore([WORLD_INDEX_KEY])).toBe(true);
    expect(playedBefore([saveKey('turtle:1')])).toBe(true);
  });

  it('storedTextSize reads every record shape', () => {
    expect(storedTextSize(null, false)).toBeNull();
    expect(storedTextSize(null, true)).toBe('normal');
    expect(storedTextSize('nonsense', false)).toBeNull();
    expect(storedTextSize({ textSizeChosen: false, textSize: 'large' }, true)).toBeNull();
    expect(storedTextSize({ textSizeChosen: true, textSize: 'small' }, false)).toBe('small');
    expect(storedTextSize({ textSize: 'huge' }, false)).toBe('normal');
  });
});

describe('only a size change is a size choice', () => {
  it('changing unrelated settings leaves the size the default, not chosen', () => {
    const store = browser();
    const page = boot(store);
    page.change((s) => (s.sound = false));
    page.change((s) => (s.daylight = false));
    page.change((s) => (s.reducedMotion = true));
    page.change((s) => (s.goals = false));
    expect(page.size.chosen).toBe(false);
    expect(page.settings.textSize).toBe('normal');
    expect(stored(store)).toMatchObject({ sound: false, daylight: false, goals: false, textSizeChosen: false });
    expect(stored(store)).not.toHaveProperty('textSize');
  });

  it('picking Small is chosen, stored and kept on reload', () => {
    const store = browser();
    const page = boot(store);
    page.change((s) => (s.textSize = 'small'));
    expect(page.size.chosen).toBe(true);
    expect(stored(store)).toMatchObject({ textSize: 'small', textSizeChosen: true });
    const again = boot(store);
    expect(again.settings.textSize).toBe('small');
    expect(again.size.chosen).toBe(true);
  });

  it('picking a size and coming back to Normal is still a choice', () => {
    const store = browser();
    const page = boot(store);
    page.change((s) => (s.textSize = 'large'));
    page.change((s) => (s.textSize = 'normal'));
    expect(page.size.chosen).toBe(true);
    expect(stored(store)).toMatchObject({ textSize: 'normal', textSizeChosen: true });
  });

  it('a chosen size survives later unrelated changes and reloads', () => {
    const store = browser();
    const page = boot(store);
    page.change((s) => (s.textSize = 'large'));
    page.change((s) => (s.sound = false));
    const again = boot(store);
    again.change((s) => (s.goals = false));
    expect(boot(store).settings.textSize).toBe('large');
  });

  it('the reduced-motion choice and the size choice are independent', () => {
    const store = browser();
    const page = boot(store);
    page.change((s) => (s.textSize = 'large'));
    const r = readStoredSettings(stored(store), DEFAULT_SETTINGS, true);
    expect(r.chosen).toBe(false);
    expect(r.settings.reducedMotion).toBe(true);
  });
});

describe('the old manual MENU SCALE', () => {
  it('is dropped on read and never written again; menus fit the screen', () => {
    const store = browser({ [SETTINGS_KEY]: { scale: 1, textSize: 'normal', goals: false } });
    const page = boot(store);
    expect(page.settings).not.toHaveProperty('scale');
    expect(page.settings.goals).toBe(false);
    const ui = new GameUI(() => null, () => ({}) as never);
    ui.settings = page.settings;
    // At 1920×1080 the panel fits 3× (the Normal cap), not the stored 1×.
    expect(ui.scaleFor(1920, 1080)).toBe(Math.min(3, Math.floor(Math.min((1920 - 4) / PANEL_W, (1080 - 4) / PANEL_H))));
    page.change((s) => (s.sound = false));
    expect(stored(store)).not.toHaveProperty('scale');
    expect(stored(store)).toMatchObject({ textSize: 'normal', textSizeChosen: true });
  });

  it('every stored value (0 to 3, or junk) reads the same as none', () => {
    for (const scale of [0, 1, 2, 3, 7, 'x']) {
      const r = readStoredSettings({ scale, textSize: 'small' }, DEFAULT_SETTINGS, false);
      expect(r.settings).not.toHaveProperty('scale');
      expect(r.settings.textSize).toBe('small');
    }
  });
});
