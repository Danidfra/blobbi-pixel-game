/**
 * M11C.1: the Guest / Connected chip, the ACCOUNT page copy, and the tool hotbar (slots, number keys, Q, clicks,
 * taps, touch sizes, locked tools, focus and menu conflicts). The hotbar only ever calls the world's own equip and
 * unequip, so it can never grant a tool.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { ITEMS, TOOLS } from '../src/game/items';
import { TOOL_ITEMS } from '../src/content/tools';
import { GameUI, OPEN_KEYS, type Screen } from '../src/ui/game-ui';
import { HOTBAR_MAX, TOUCH_SLOT, hotbarIndexForKey, hotbarSlots, isTypingTarget, nextToolInCycle, selectHotbarSlot } from '../src/ui/hotbar';
import { identityChip } from '../src/ui/hud';
import { SettingsScreen } from '../src/ui/screens/settings';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { ViewCamera, worldBounds } from '../src/render/view-camera';
import { DEFAULT_LIVE_OPTIONS, LiveRenderer } from '../src/render/live-render';
import { en } from '../src/i18n/messages/en';
import { ptBR } from '../src/i18n/messages/pt-BR';
import { es } from '../src/i18n/messages/es';
import { loadLocale, setLocale, t } from '../src/i18n';
import type { AccountPort, AccountSnapshot } from '../src/nostr/port';

const palette = paletteFor('cozy');
const COPPER_AXE = 'blobbi-pixel:tool:copper-axe';
const ROD = 'blobbi-pixel:tool:fishing-rod';
const ALL_FIVE = [ITEMS.axe.id, ITEMS.pickaxe.id, ITEMS.hoe.id, ITEMS.wateringCan?.id ?? 'blobbi-pixel:tool:watering-can', ROD];

function setup() {
  const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
  live.brain.enabled = false;
  const ui = new GameUI(() => live, () => palette);
  const screen = new PixelBuffer(960, 540);
  return { live, ui, screen, draw: (time = 0) => ui.render(screen, time) };
}
const centre = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2] as const;
const hotbarRegions = (ui: GameUI) => ui.regions.filter((r) => !r.inert && ui.hotbarBox && r.y >= ui.hotbarBox.y && r.y < ui.hotbarBox.y + ui.hotbarBox.h && r.x >= ui.hotbarBox.x && r.x < ui.hotbarBox.x + ui.hotbarBox.w);

afterEach(() => setLocale('en'));

describe('the hotbar slots', () => {
  it('shows only the kinds of tool the bag holds, in a fixed order, numbered from 1, never more than five', () => {
    const bag = new Map<string, number>();
    const count = (id: string) => bag.get(id) ?? 0;
    expect(hotbarSlots(count, null)).toEqual([]); // no tools: no hotbar (no empty slots)
    bag.set(ROD, 1);
    bag.set(ITEMS.axe.id, 1);
    expect(hotbarSlots(count, null).map((s) => [s.item, s.key])).toEqual([[ITEMS.axe.id, 1], [ROD, 2]]);
    for (const id of TOOLS) bag.set(id, 1); // every tool, simple and copper
    const all = hotbarSlots(count, null);
    expect(all.length).toBe(HOTBAR_MAX);
    expect(all.map((s) => s.kind)).toEqual(['axe', 'pickaxe', 'hoe', 'watering-can', 'fishing-rod']);
  });

  it('two tools of a kind share a slot: the one in hand, else the better one', () => {
    const bag = new Map([[ITEMS.axe.id, 1], [COPPER_AXE, 1]]);
    const count = (id: string) => bag.get(id) ?? 0;
    expect(hotbarSlots(count, null)[0].item).toBe(COPPER_AXE);
    expect(hotbarSlots(count, ITEMS.axe.id)[0].item).toBe(ITEMS.axe.id);
  });

  it('a locked (not owned) tool never appears, and choosing never adds a tool', () => {
    const { live } = setup();
    live.inventory.add(ITEMS.axe.id, 1);
    const before = TOOLS.map((id) => live.inventory.count(id));
    expect(hotbarSlots((id) => live.inventory.count(id), null).map((s) => s.item)).toEqual([ITEMS.axe.id]);
    expect(selectHotbarSlot(live, 1)).toBe('none'); // slot 2 does not exist
    expect(selectHotbarSlot(live, 4)).toBe('none');
    expect(live.equipped).toBe(null);
    expect(TOOLS.map((id) => live.inventory.count(id))).toEqual(before);
  });

  it('the canoe and materials are not tools (no slot), whatever the bag holds', () => {
    const { live } = setup();
    for (const d of TOOL_ITEMS) live.inventory.add(d.id, 1);
    for (const s of hotbarSlots((id) => live.inventory.count(id), null)) expect(TOOLS).toContain(s.item);
    expect(hotbarSlots((id) => live.inventory.count(id), null).some((s) => s.item.includes('canoe') || s.item.includes('ore'))).toBe(false);
  });
});

describe('number keys and Q', () => {
  it('1 to 5 (main row and number pad) pick slots; 0, 6 and letters do not', () => {
    expect([1, 2, 3, 4, 5].map((n) => hotbarIndexForKey(`Digit${n}`))).toEqual([0, 1, 2, 3, 4]);
    expect([1, 2, 3, 4, 5].map((n) => hotbarIndexForKey(`Numpad${n}`))).toEqual([0, 1, 2, 3, 4]);
    for (const k of ['Digit0', 'Digit6', 'Numpad0', 'KeyQ', 'KeyE', 'Digit']) expect(hotbarIndexForKey(k)).toBe(null);
  });

  it('a number equips its slot; the same number again puts the tool away', () => {
    const { live } = setup();
    for (const id of ALL_FIVE) live.inventory.add(id, 1);
    expect(selectHotbarSlot(live, hotbarIndexForKey('Digit3')!)).toBe('equipped');
    expect(live.equipped).toBe(ITEMS.hoe.id);
    expect(selectHotbarSlot(live, hotbarIndexForKey('Digit1')!)).toBe('equipped');
    expect(live.equipped).toBe(ITEMS.axe.id);
    expect(selectHotbarSlot(live, hotbarIndexForKey('Digit1')!)).toBe('put-away');
    expect(live.equipped).toBe(null);
  });

  it('Q keeps its old cycle: empty, each owned tool in order, empty', () => {
    const bag = new Map([[ITEMS.axe.id, 1], [ROD, 1]]);
    const count = (id: string) => bag.get(id) ?? 0;
    const seen: (string | null)[] = [];
    let hand: string | null = null;
    for (let i = 0; i < 4; i++) seen.push((hand = nextToolInCycle(count, hand)));
    expect(seen).toEqual([ITEMS.axe.id, ROD, null, ITEMS.axe.id]);
    expect(nextToolInCycle(() => 0, null)).toBe(null); // no tools: Q leaves the hands empty
  });

  it('the HOME screen moved from 1 to 0 (and Home): number 1 is the hotbar now', () => {
    expect(OPEN_KEYS.Digit1).toBeUndefined();
    expect(OPEN_KEYS.Digit0).toBe('home');
    expect(OPEN_KEYS.Home).toBe('home');
    for (const n of [1, 2, 3, 4, 5]) expect(OPEN_KEYS[`Digit${n}`]).toBeUndefined();
  });

  it('a key aimed at a text field, a select or an editable element never picks a tool', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'textarea' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: 'CANVAS' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it('with a menu open, number keys are the menu\'s (the bag, the naming page): the hand never changes', () => {
    const { live, ui } = setup();
    live.inventory.add(ITEMS.axe.id, 1);
    const typed: string[] = [];
    const naming: Screen = { id: 'journal', title: () => 'x', draw: () => {}, key: (code) => (typed.push(code), true) };
    ui.register(naming);
    ui.open('journal');
    // The playground asks the UI first; a captured key never reaches the hotbar.
    expect(ui.handleKey('Digit1')).toBe(true);
    expect(typed).toEqual(['Digit1']);
    expect(live.equipped).toBe(null);
  });
});

describe('the hotbar on screen', () => {
  it('is drawn bottom left with one region per slot; a click equips, a second click puts away', () => {
    const { live, ui, draw } = setup();
    live.inventory.add(ITEMS.axe.id, 1);
    live.inventory.add(ITEMS.pickaxe.id, 1);
    draw();
    expect(ui.hotbarBox).not.toBe(null);
    expect(ui.hotbarBox!.x).toBeLessThan(40);
    const slots = hotbarRegions(ui);
    expect(slots.length).toBe(2);
    expect(ui.handlePointer(...centre(slots[1]))).toBe(true);
    expect(live.equipped).toBe(ITEMS.pickaxe.id);
    draw();
    expect(ui.handlePointer(...centre(hotbarRegions(ui)[1]))).toBe(true);
    expect(live.equipped).toBe(null);
  });

  it('a press between slots is the hotbar\'s (it never walks the Blobbi), and nothing shows without tools', () => {
    const { live, ui, draw } = setup();
    draw();
    expect(ui.hotbarBox).toBe(null);
    live.inventory.add(ITEMS.axe.id, 1);
    live.inventory.add(ITEMS.hoe.id, 1);
    draw();
    const b = ui.hotbarBox!;
    expect(ui.handlePointer(b.x + 1, b.y + 1)).toBe(true); // the card's corner: inert, used
    expect(live.equipped).toBe(null);
  });

  it('touch slots are at least 44 screen pixels and stay clear of the menu bar', () => {
    const { live, ui } = setup();
    for (const id of ALL_FIVE) live.inventory.add(id, 1);
    ui.touchMode = true;
    const phone = new PixelBuffer(667, 375);
    ui.render(phone, 0);
    const slots = hotbarRegions(ui);
    expect(slots.length).toBe(5);
    for (const r of slots) {
      expect(r.w).toBeGreaterThanOrEqual(44);
      expect(r.h).toBeGreaterThanOrEqual(44);
    }
    expect(TOUCH_SLOT * 2).toBeGreaterThanOrEqual(44);
    const b = ui.hotbarBox!;
    expect(b.x + b.w).toBeLessThanOrEqual(phone.width);
    expect(b.y).toBeGreaterThanOrEqual(0);
    // No menu bar button lies under the hotbar.
    const menu = ui.regions.filter((r) => !slots.includes(r) && !r.inert);
    for (const r of menu) expect(r.x < b.x + b.w && b.x < r.x + r.w && r.y < b.y + b.h && b.y < r.y + r.h, JSON.stringify(r)).toBe(false);
    // A tap on the third slot picks the hoe.
    expect(ui.handlePointer(...centre(slots[2]))).toBe(true);
    expect(live.equipped).toBe(ITEMS.hoe.id);
  });

  it('respects the safe area insets', () => {
    const { live, ui } = setup();
    live.inventory.add(ITEMS.axe.id, 1);
    ui.touchMode = true;
    ui.insets = { top: 0, right: 0, bottom: 20, left: 30 };
    const phone = new PixelBuffer(844, 390);
    ui.render(phone, 0);
    expect(ui.hotbarBox!.x).toBeGreaterThanOrEqual(30);
    expect(ui.hotbarBox!.y + ui.hotbarBox!.h).toBeLessThanOrEqual(390 - 20);
  });

  it('is hidden while a menu is open, while building, and for a visitor', () => {
    const { live, ui, draw } = setup();
    live.inventory.add(ITEMS.axe.id, 1);
    ui.register(new SettingsScreen());
    ui.open('settings');
    draw();
    expect(ui.hotbarBox).toBe(null);
    ui.close();
    live.setBuildMode('shelter');
    draw();
    expect(ui.hotbarBox).toBe(null);
    live.setBuildMode(null);
    draw();
    expect(ui.hotbarBox).not.toBe(null);
    const visitor = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { visitor: true });
    const vui = new GameUI(() => visitor, () => palette);
    vui.render(new PixelBuffer(960, 540), 0);
    expect(vui.hotbarBox).toBe(null);
    expect(vui.pickTool(0)).toBe(false);
  });

  it('a hotbar frame costs little: the card is cached until the hand or the bag changes', () => {
    const { live, draw } = setup();
    for (const id of ALL_FIVE) live.inventory.add(id, 1);
    draw();
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) draw(i * 0.016);
    const per = (performance.now() - t0) / 200;
    expect(per).toBeLessThan(8); // the whole UI layer (menu bar, hotbar, tips) on a 960x540 frame
  });
});

describe('who is playing', () => {
  it('the chip says Guest or Connected in every language (not by colour alone)', async () => {
    await loadLocale('pt-BR');
    await loadLocale('es');
    for (const [locale, guest, connected] of [['en', 'Guest', 'Connected'], ['pt-BR', 'Convidado', 'Conectado'], ['es', 'Invitado', 'Conectado']] as const) {
      setLocale(locale);
      expect(t('hud.guest')).toBe(guest);
      expect(t('hud.connected')).toBe(connected);
    }
    setLocale('en');
    const g = identityChip(false, 2);
    const c = identityChip(true, 2);
    expect(g.data.join()).not.toBe(c.data.join());
    expect(g.height).toBe(22);
  });

  it('the view draws the chip under the status card when asked, and reports where (for a click or a tap)', () => {
    const { live } = setup();
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const camera = new ViewCamera('exploration');
    const bounds = worldBounds(live.world);
    const rect = camera.update(0, live.cameraTarget(), 960, 540, bounds, true);
    view.render(rect, camera.restScale('exploration', 960, 540, bounds), 0, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI });
    expect(view.identityBox).toBe(null);
    view.render(rect, 1, 0, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, identity: 'guest' });
    const b = view.identityBox!;
    expect(b).not.toBe(null);
    expect(b.x).toBeLessThan(10);
    expect(view.onIdentity(b.x + 2, b.y + 2)).toBe(true);
    expect(view.onIdentity(500, 300)).toBe(false);
  });

  it('the chip opens SETTINGS straight on the ACCOUNT page (the playground calls showPage then open)', () => {
    const { ui } = setup();
    const settings = new SettingsScreen();
    ui.register(settings);
    expect(settings.page).toBe('game');
    settings.showPage('account');
    expect(ui.open('settings')).toBe(true);
    expect(ui.capturing).toBe(true);
    expect(settings.page).toBe('account');
  });

  it('the ACCOUNT copy: the guest invitation and the device-only save, in three languages, never an em dash', () => {
    const want = {
      en: ['Play freely without an account.', 'Connect to discover your Blobbis from other worlds.', 'Your island is still saved only on this device.'],
      'pt-BR': ['Jogue livremente sem uma conta.', 'Conecte-se para encontrar seus Blobbis de outros mundos.', 'Sua ilha ainda está salva apenas neste dispositivo.'],
      es: ['Juega libremente sin una cuenta.', 'Conéctate para encontrar tus Blobbis de otros mundos.', 'Tu isla todavía está guardada solo en este dispositivo.'],
    };
    for (const [cat, w] of [[en, want.en], [ptBR, want['pt-BR']], [es, want.es]] as const) {
      expect([cat['account.pitch'], cat['account.optional'], cat['account.localOnly']]).toEqual(w);
      for (const k of ['hud.guest', 'hud.connected', 'hotbar.emptyHands', 'hotbar.qHint', 'account.pitch', 'account.optional', 'account.localOnly', 'account.nothingPosted', 'account.verifyHint', 'account.signerAway'] as const) expect(cat[k], k).not.toMatch(/—/);
      // No promise of cloud saves.
      expect(`${cat['account.pitch']} ${cat['account.optional']}`).not.toMatch(/cloud|nuvem|nube|sync/i);
    }
  });

  it('the ACCOUNT page shows the whole npub to compare, and says when the extension is gone', () => {
    const snap = (o: Partial<AccountSnapshot>): AccountSnapshot => ({ status: 'connected', pubkey: '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e', npub: 'npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg', npubShort: 'npub10elf…jptg', method: 'nip07', displayName: 'Ana', profile: 'found', profileAt: 1, problem: null, signerAvailable: false, relays: [], ...o });
    let s = snap({});
    const port: AccountPort = { snapshot: () => s, connect: async () => {}, disconnect: () => {}, refreshProfile: async () => {} };
    const { ui } = setup();
    const settings = new SettingsScreen();
    settings.account = port;
    ui.register(settings);
    const texts: string[] = [];
    const g = { text: (x: string) => (texts.push(x), 0), heading: (x: string) => (texts.push(x), 40), para: (x: string) => (texts.push(x), 8), measure: (x: string) => x.length * 4, button: (x: string) => (texts.push(x), 40) };
    settings.showPage('account');
    settings.advanced = true;
    (settings as unknown as { drawAccount: (g: unknown, ui: GameUI, x: number, y: number, w: number) => void }).drawAccount(g, ui, 0, 0, 290);
    const all = texts.join('|');
    expect(all).toContain(s.npub!.slice(0, 32));
    expect(all).toContain(s.npub!.slice(32));
    expect(all).toContain(t('account.signerAway'));
    expect(all).toContain(t('account.localOnly'));
    texts.length = 0;
    s = snap({ signerAvailable: true });
    (settings as unknown as { drawAccount: (g: unknown, ui: GameUI, x: number, y: number, w: number) => void }).drawAccount(g, ui, 0, 0, 290);
    expect(texts.join('|')).not.toContain(t('account.signerAway'));
  });
});
