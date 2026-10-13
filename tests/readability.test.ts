/**
 * M11B readability: every menu, in every language, at phone and desktop scales and every text size, keeps its words
 * inside the panel and every button label inside its button; text is drawn at screen resolution with the readable
 * body font where a UI pixel allows it; the text size is kept and never touches the world camera.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { ITEMS } from '../src/game/items';
import { GameUI, PANEL_H, PANEL_W, readSettings, hudScale, type ScreenId, type TextSize } from '../src/ui/game-ui';
import { Gfx } from '../src/ui/gfx';
import { bodyChoice } from '../src/ui/surface';
import { InventoryScreen } from '../src/ui/screens/inventory';
import { CraftingScreen } from '../src/ui/screens/crafting';
import { JournalScreen } from '../src/ui/screens/journal';
import { CareScreen } from '../src/ui/screens/care';
import { CarrierScreen } from '../src/ui/screens/carrier';
import { MapScreen } from '../src/ui/screens/map';
import { GrowthScreen } from '../src/ui/screens/growth';
import { GuideScreen } from '../src/ui/screens/guide';
import { HomeScreen } from '../src/ui/screens/home';
import { installCustomisation } from '../src/ui/screens/home-style';
import { SettingsScreen } from '../src/ui/screens/settings';
import { StorageScreen } from '../src/ui/screens/storage';
import { WorldsScreen } from '../src/ui/screens/worlds';
import { loadLocale, setLocale, type Locale } from '../src/i18n';
import '../src/content/text';
import { CAMERA_CYCLE, CAMERA_MODES } from '../src/render/view-camera';
import { memoryStore } from '../src/game/persistence';

const palette = paletteFor('cozy');

// Every text and button drawn, with its extent in panel pixels (recorded by wrapping Gfx while a screen draws).
interface Drawn {
  text: string;
  x0: number;
  x1: number;
  kind: 'text' | 'button';
  w?: number;
}
let drawn: Drawn[] = [];
const original = { text: Gfx.prototype.text, button: Gfx.prototype.button };

beforeAll(async () => {
  await loadLocale('pt-BR');
  await loadLocale('es');
  Gfx.prototype.text = function (this: Gfx, t: string, x: number, y: number, ...rest: unknown[]) {
    const w = (original.text as (...a: unknown[]) => number).call(this, t, x, y, ...rest);
    drawn.push({ text: t, x0: x, x1: x + w, kind: 'text' });
    return w;
  } as typeof Gfx.prototype.text;
  Gfx.prototype.button = function (this: Gfx, label: string, x: number, y: number, action: () => void, opts: Parameters<Gfx['button']>[4] = {}) {
    const w = original.button.call(this, label, x, y, action, opts);
    drawn.push({ text: label, x0: x, x1: x + w, kind: 'button', w });
    return w;
  } as typeof Gfx.prototype.button;
});
afterAll(() => {
  Gfx.prototype.text = original.text;
  Gfx.prototype.button = original.button;
});
afterEach(() => setLocale('en'));

function setup(size: TextSize = 'normal') {
  const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
  live.brain.enabled = false;
  for (const id of [ITEMS.wood.id, ITEMS.stone.id, ITEMS.stick.id, ITEMS.axe.id, 'blobbi-pixel:food:carrot', 'blobbi-pixel:furniture:potted-plant']) live.inventory.add(id, 3);
  for (const id of ['meet', 'arrive', 'gather', 'axe', 'wood', 'materials']) live.objectives.completed[id] = 0;
  const ui = new GameUI(() => live, () => palette);
  ui.settings.textSize = size;
  const home = new HomeScreen();
  installCustomisation(home);
  const worlds = new WorldsScreen();
  for (const s of [new InventoryScreen(), new CraftingScreen(), new CraftingScreen('cooking'), new JournalScreen(), new CareScreen(), new CarrierScreen(), new MapScreen(), new GrowthScreen(), new GuideScreen(), home, new SettingsScreen(), new StorageScreen(), worlds]) ui.register(s);
  return { live, ui };
}

const SCREENS: ScreenId[] = ['inventory', 'crafting', 'cooking', 'journal', 'care', 'carrier', 'map', 'growth', 'guide', 'home', 'settings', 'worlds'];
const VIEWS: [string, number, number][] = [
  ['small phone', 667, 375],
  ['phone', 844, 390],
  ['desktop', 1280, 720],
];

describe('menus fit their words, in every language, at every size', () => {
  for (const locale of ['en', 'pt-BR', 'es'] as Locale[])
    for (const [name, w, h] of VIEWS)
      it(`${locale}, ${name} ${w}×${h}: no text outside the panel, no label wider than its button`, () => {
        setLocale(locale);
        const { ui } = setup();
        const screen = new PixelBuffer(w, h);
        const problems: string[] = [];
        let seen = 0;
        for (const id of SCREENS) {
          ui.open(id);
          drawn = [];
          ui.render(screen, 0);
          expect(drawn.length, `${id} drew its words`).toBeGreaterThan(id === "worlds" ? 0 : 3);
          seen += drawn.length;
          for (const d of drawn) {
            if (d.x0 < 0 || d.x1 > PANEL_W) problems.push(`${id}: "${d.text}" ${d.x0}..${d.x1}`);
            if (d.kind === 'button') {
              const g = new Gfx(1, 1, ui.scale);
              const label = d.text.toLocaleUpperCase(locale);
              if (g.measure(label) > d.w! - 2 && d.text.length > 1) problems.push(`${id}: button "${d.text}" ${g.measure(label)} > ${d.w! - 2}`);
            }
          }
          ui.close();
        }
        expect(seen).toBeGreaterThan(150);
        expect(problems).toEqual([]);
      });
});

describe('text size', () => {
  it('is a presentation preference: kept, migrated, never part of a save, never the world camera', () => {
    expect(readSettings({ textSize: 'large' }).textSize).toBe('large');
    expect(hudScale({ textSize: 'small' })).toBe(2);
    expect(hudScale({ textSize: 'normal' })).toBe(2);
    expect(hudScale({ textSize: 'large' })).toBe(3);
    const store = memoryStore();
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store });
    live.save();
    for (const v of store.data.values()) expect(v).not.toMatch(/textSize|largeText|locale/);
    expect(CAMERA_CYCLE.map((m) => CAMERA_MODES[m].scale)).toEqual([1, 2, 4, 6]); // the camera's zooms do not depend on it
  });

  it('larger text on a big screen: the menus grow; smaller text: a smaller body font', () => {
    const { ui } = setup('large');
    expect(ui.scaleFor(1920, 1080)).toBe(4);
    ui.settings.textSize = 'normal';
    expect(ui.scaleFor(1920, 1080)).toBe(3);
    expect(bodyChoice(3)!.font.spec.capRows * bodyChoice(3)!.m).toBe(14);
    expect(bodyChoice(3, true)!.font.spec.capRows * bodyChoice(3, true)!.m).toBe(9);
    expect(bodyChoice(2)!.font.spec.capRows).toBe(9); // phones: the larger body font
    expect(bodyChoice(1)).toBeNull(); // a tiny window: the 3×5 capitals, as before
  });

  it('every scale keeps a line of body text within the 7-pixel line pitch and 4 pixels a character', () => {
    for (const s of [1.5, 2, 2.5, 3, 4, 5, 6])
      for (const smaller of [false, true]) {
        const c = bodyChoice(s, smaller)!;
        expect(c.font.cellRows * c.m, `${s}`).toBeLessThanOrEqual(7 * s + 1);
        expect(c.font.maxAdvance * c.m, `${s}`).toBeLessThanOrEqual(4 * s);
      }
  });

  it('a panel at any text size still fits the screen', () => {
    for (const size of ['small', 'normal', 'large'] as TextSize[]) {
      const { ui } = setup(size);
      for (const [, w, h] of [...VIEWS, ['wide', 1920, 1080] as [string, number, number]]) {
        const s = ui.scaleFor(w, h);
        expect(PANEL_W * s, `${size} ${w}`).toBeLessThanOrEqual(w);
        expect(PANEL_H * s, `${size} ${h}`).toBeLessThanOrEqual(h);
      }
    }
  });
});
