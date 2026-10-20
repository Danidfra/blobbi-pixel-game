/**
 * The World Travel menu (src/ui/screens/travel.ts): Y opens it from play and the menu bar has a button for a finger;
 * the cards show Home and Island with each app's icon (or their emblem until it loads); VISIT starts the trip once;
 * the words follow whether the Blobbi comes along; the islands in this browser are one button away. Also the icon
 * files the cards and the page refer to, and the icons' reduction to card size.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LiveWorld } from '../src/sim/live-world';
import { memoryStore } from '../src/game/persistence';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { GameUI, OPEN_KEYS } from '../src/ui/game-ui';
import { TravelScreen, CARD_ICON, type Companion, type TravelHooks } from '../src/ui/screens/travel';
import { WorldsScreen } from '../src/ui/screens/worlds';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { blobbiWorlds, type BlobbiWorld } from '../src/game/blobbi-worlds';
import { WorldIcons, downscale } from '../src/ui/world-icons';
import { rgba } from '../src/core/color';
import { Gfx } from '../src/ui/gfx';
import { pngSize } from './helpers/png';
import { loadLocale, setLocale, type Locale } from '../src/i18n';

const live = () => {
  const l = new LiveWorld(generateWhaleWorld('island-travel-1', { carrierSeed: 'w', generatedHouse: false }), 'blobbi-9', 16, { store: memoryStore() });
  l.brain.enabled = false;
  return l;
};

function setup(o: { companion?: Companion; icons?: WorldIcons; touch?: boolean } = {}) {
  const l = live();
  const ui = new GameUI(() => l, () => paletteFor('cozy'));
  const screen = new TravelScreen();
  const worlds = new WorldsScreen();
  ui.register(screen);
  ui.register(worlds);
  ui.touchMode = !!o.touch;
  const gone: BlobbiWorld[] = [];
  let departing = false;
  const icons = o.icons ?? new WorldIcons(() => Promise.reject(new Error('no page')));
  const hooks: TravelHooks = {
    worlds: () => blobbiWorlds(),
    name: () => 'Dotado',
    companion: () => o.companion ?? 'stays',
    go: (w) => {
      if (departing) return 'busy';
      departing = true;
      gone.push(w);
      return 'started';
    },
    departing: () => departing,
    icon: (w, size) => icons.get(w.icon, size),
  };
  screen.hooks = hooks;
  return { l, ui, screen, worlds, gone, setDeparting: (v: boolean) => (departing = v) };
}
const render = (ui: GameUI, w = 1280, h = 720) => {
  const screen = new PixelBuffer(w, h);
  ui.render(screen, 0);
  return screen;
};
/** Every hit region's tip or a press on it, to find the cards and buttons. */
const hits = (ui: GameUI) => (ui as unknown as { hits: { x: number; y: number; w: number; h: number; tip?: string; action: (x: number, y: number) => void }[] }).hits;

describe('reaching the menu', () => {
  it('Y opens World Travel from play, and Escape or Y closes it', () => {
    const { ui } = setup();
    expect(OPEN_KEYS.KeyY).toBe('travel');
    expect(ui.handleKey('KeyY')).toBe(true);
    expect(ui.capturing).toBe(true);
    expect(ui.handleKey('KeyY')).toBe(true);
    expect(ui.capturing).toBe(false);
    ui.handleKey('KeyY');
    ui.handleKey('Escape');
    expect(ui.capturing).toBe(false);
  });

  it('the menu bar has a WORLDS button, for a mouse and for a finger, inside the screen', () => {
    for (const touch of [false, true]) {
      const { ui } = setup({ touch });
      const screen = render(ui, touch ? 390 : 1280, touch ? 844 : 720);
      const worldsHit = hits(ui).find((h) => {
        h.action(0, 0);
        const opened = ui.capturing && (ui as unknown as { screen: { id: string } | null }).screen?.id === 'travel';
        ui.close();
        return opened;
      });
      expect(worldsHit, touch ? 'touch' : 'mouse').toBeDefined();
      expect(worldsHit!.x).toBeGreaterThanOrEqual(0);
      expect(worldsHit!.x + worldsHit!.w).toBeLessThanOrEqual(screen.width);
      expect(worldsHit!.y + worldsHit!.h).toBeLessThanOrEqual(screen.height);
    }
  });

  it('the islands in this browser are one button away, and keep their own screen', () => {
    const { ui } = setup();
    ui.open('travel');
    render(ui);
    const islands = hits(ui).find((h) => {
      h.action(0, 0);
      const id = (ui as unknown as { screen: { id: string } | null }).screen?.id;
      if (id === 'worlds') return true;
      ui.open('travel');
      render(ui);
      return false;
    });
    expect(islands).toBeDefined();
  });
});

describe('the cards', () => {
  it('shows Blobbi Home and Blobbi Island, in that order, and VISIT on the chosen one starts the trip and closes the menu', () => {
    const { ui, screen, gone } = setup();
    ui.open('travel');
    render(ui);
    expect(screen.index).toBe(0);
    ui.handleKey('ArrowRight');
    expect(screen.index).toBe(1);
    ui.handleKey('Enter');
    expect(gone.map((w) => w.id)).toEqual(['island']);
    expect(ui.capturing).toBe(false);
  });

  it('a tap on a card selects it, a second tap goes; a second trip is refused while one is under way', () => {
    const { ui, gone, screen } = setup();
    ui.open('travel');
    render(ui);
    const cards = hits(ui).filter((h) => h.tip === 'visit');
    expect(cards).toHaveLength(2);
    cards[1].action(0, 0);
    expect(screen.index).toBe(1);
    expect(gone).toEqual([]);
    cards[1].action(0, 0);
    expect(gone.map((w) => w.id)).toEqual(['island']);
    // Under way: the menu, opened again, refuses another
    ui.open('travel');
    render(ui);
    ui.handleKey('Enter');
    expect(gone).toHaveLength(1);
  });

  it('the words say whether the Blobbi comes along, stays, or waits for the extension', () => {
    const texts: Record<Companion, string> = { with: '', stays: '', signer: '' };
    for (const companion of ['with', 'stays', 'signer'] as const) {
      const { ui, screen } = setup({ companion });
      ui.open('travel');
      const g = new Gfx(300, 180, 1);
      const seen: string[] = [];
      const para = g.para.bind(g);
      g.para = (text, ...rest) => {
        seen.push(text);
        return para(text, ...rest);
      };
      screen.draw(g, ui, 4, 14, 296, 160);
      texts[companion] = seen.join(' ');
    }
    expect(texts.with).toMatch(/Dotado comes along/);
    expect(texts.stays).toMatch(/Dotado stays on this island/);
    expect(texts.signer).toMatch(/extension has not confirmed/);
  });
});

describe('the icons', () => {
  it('each world card points at an icon file this build ships, 192 px square, and the page ships its own icon set', () => {
    for (const w of blobbiWorlds()) {
      const file = join('public', w.icon);
      expect(existsSync(file), file).toBe(true);
      expect(pngSize(file)).toEqual([192, 192]);
    }
  });

  it('while an icon loads (or when it cannot), the card draws the world emblem; once it arrives, the icon at card size', async () => {
    const resolvers: ((b: PixelBuffer) => void)[] = [];
    const icons = new WorldIcons(() => new Promise((r) => void resolvers.push(r)));
    const { ui, screen } = setup({ icons });
    ui.open('travel');
    const g = new Gfx(300, 180, 1);
    const blits: PixelBuffer[] = [];
    const origBlit = g.buf.blit.bind(g.buf);
    g.buf.blit = (src: PixelBuffer, x: number, y: number) => {
      blits.push(src);
      origBlit(src, x, y);
    };
    screen.draw(g, ui, 4, 14, 296, 160);
    expect(blits).toHaveLength(2);
    expect(blits.every((b) => b.width === CARD_ICON && b.height === CARD_ICON)).toBe(true);
    const emblem = blits[0];
    // The source arrives: a plain 192 px square of one colour becomes a card icon of that colour
    const src = new PixelBuffer(192, 192);
    src.fill(rgba(10, 200, 30));
    expect(resolvers).toHaveLength(2);
    for (const r of resolvers) r(src);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    blits.length = 0;
    screen.draw(g, ui, 4, 14, 296, 160);
    expect(blits[0]).not.toBe(emblem);
    expect(blits[0].width).toBe(CARD_ICON);
    expect(blits[0].get(5, 5)).toBe(rgba(10, 200, 30));
  });

  it('reducing an icon averages whole areas, weighted by alpha (a transparent corner never darkens the edge)', () => {
    const src = new PixelBuffer(8, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) src.set(x, y, x < 4 ? rgba(255, 0, 0) : rgba(0, 0, 255));
    src.set(0, 0, 0);
    const out = downscale(src, 2);
    expect(out.get(0, 1)).toBe(rgba(255, 0, 0));
    expect(out.get(1, 0)).toBe(rgba(0, 0, 255));
    const corner = out.get(0, 0);
    expect(corner & 0xff).toBe(255); // still pure red
    expect((corner >>> 24) & 0xff).toBe(Math.round((15 * 255) / 16)); // a little see-through
  });
});

describe('every language', () => {
  it('draws the menu in English, Portuguese and Spanish without a missing key', async () => {
    await loadLocale('pt-BR');
    await loadLocale('es');
    for (const locale of ['en', 'pt-BR', 'es'] as Locale[]) {
      setLocale(locale);
      const { ui } = setup({ companion: 'with' });
      ui.open('travel');
      expect(() => render(ui)).not.toThrow();
    }
    setLocale('en');
  });
});
