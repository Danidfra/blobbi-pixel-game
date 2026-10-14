/**
 * M11C.5: the gentle account invitation. Never immediate; only after active play, a Blobbi interaction and early
 * quests; never over menus, speech, notices, timed actions or the first tips; never when connected; once per session,
 * a cooldown after every showing (also across a reload), a permanent opt-out; EXPLORE ACCOUNTS only opens the page
 * (no signer request, no network, no publishing), and no island save changes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountInvite, COOLDOWN_MS, IDLE_AFTER, INVITE_KEY, MIN_ACTIVE_SECONDS, SHOW_SECONDS, eligible, engaged, isBusy, loadInvite, newInviteRecord, type BusyState, type InviteWorld } from '../src/ui/account-invite';
import { memoryStore, saveKey } from '../src/game/persistence';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { GameUI } from '../src/ui/game-ui';
import { SettingsScreen } from '../src/ui/screens/settings';
import { ITEMS } from '../src/game/items';
import { en } from '../src/i18n/messages/en';
import { ptBR } from '../src/i18n/messages/pt-BR';
import { es } from '../src/i18n/messages/es';

const calm: BusyState = { menuOpen: false, bubble: false, notice: false, action: false, tip: null, intro: false };
const fond = (): InviteWorld => ({ visitor: false, tally: { petted: 1, fed: 0, played: 0, mealsFed: 0 }, objectives: { completed: { meet: 1, arrive: 2, gather: 3 } } });
const fresh = (): InviteWorld => ({ visitor: false, tally: { petted: 0, fed: 0, played: 0, mealsFed: 0 }, objectives: { completed: {} } });

/** Play `seconds` of active time in 0.5 s frames. */
function play(inv: AccountInvite, seconds: number, o: Partial<{ world: InviteWorld; busy: boolean; inputAge: number; running: boolean }> = {}) {
  for (let t = 0; t < seconds; t += 0.5) inv.update(0.5, { running: o.running ?? true, inputAge: o.inputAge ?? 1, world: o.world ?? fond(), busy: o.busy ?? false });
}

afterEach(() => vi.restoreAllMocks());

describe('when the invitation may appear', () => {
  it('never at the start: ten minutes of active play first', () => {
    let connected = false;
    const inv = new AccountInvite(memoryStore(), () => connected, () => 1e12);
    play(inv, 60);
    expect(inv.visible).toBe(false);
    play(inv, MIN_ACTIVE_SECONDS - 61);
    expect(inv.visible).toBe(false);
    play(inv, 2);
    expect(inv.visible).toBe(true);
    void connected;
  });

  it('only active time counts: an idle player, a paused world (menu, intro, hidden tab) and huge frame gaps do not', () => {
    const inv = new AccountInvite(memoryStore(), () => false, () => 1e12);
    play(inv, 2000, { inputAge: IDLE_AFTER + 1 });
    play(inv, 2000, { running: false });
    inv.update(5, { running: true, inputAge: 0, world: fond(), busy: false }); // a frame after a tab sleep
    expect(inv.record.activeSeconds).toBe(0);
    play(inv, 10);
    expect(inv.record.activeSeconds).toBeCloseTo(10, 5);
  });

  it('needs a Blobbi interaction and three main quests, as a real early island has', () => {
    expect(engaged(fresh())).toBe(false);
    expect(engaged({ ...fond(), tally: { petted: 0, fed: 0, played: 0, mealsFed: 0 } })).toBe(false);
    expect(engaged({ ...fond(), objectives: { completed: { meet: 1, arrive: 2, 'side-cozy': 3 } } })).toBe(false); // side quests do not count
    expect(engaged(fond())).toBe(true);
    expect(engaged({ ...fond(), tally: { petted: 0, fed: 2, played: 0, mealsFed: 0 } })).toBe(true);
    const inv = new AccountInvite(memoryStore(), () => false, () => 1e12);
    play(inv, MIN_ACTIVE_SECONDS + 60, { world: fresh() });
    expect(inv.visible).toBe(false);
    play(inv, 1, { world: fond() });
    expect(inv.visible).toBe(true);
  });

  it('a real LiveWorld reaches it: pet the Blobbi and finish the first quests', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    expect(engaged(live)).toBe(false);
    live.pet();
    for (const id of ['meet', 'arrive', 'gather']) live.objectives.completed[id] ??= live.worldTime;
    expect(engaged(live)).toBe(true);
  });

  it('waits for a calm moment: menus, speech and the Carrier, notices, timed actions, the intro and the first tips', () => {
    for (const k of ['menuOpen', 'bubble', 'notice', 'action', 'intro'] as const) expect(isBusy({ ...calm, [k]: true }), k).toBe(true);
    for (const tip of ['move', 'blobbi', 'gather', 'bag', 'craft', 'tool', 'build']) expect(isBusy({ ...calm, tip }), tip).toBe(true);
    for (const tip of ['farm', 'grow', 'cook', 'carrier', 'home']) expect(isBusy({ ...calm, tip }), tip).toBe(false);
    expect(isBusy(calm)).toBe(false);
    const inv = new AccountInvite(memoryStore(), () => false, () => 1e12);
    play(inv, MIN_ACTIVE_SECONDS + 30, { busy: true });
    expect(inv.visible).toBe(false); // time still counts while busy, but it never appears
    play(inv, 0.5);
    expect(inv.visible).toBe(true);
  });

  it('never for a connected player or a visitor; connecting while it shows makes it leave', () => {
    let connected = true;
    const inv = new AccountInvite(memoryStore(), () => connected, () => 1e12);
    play(inv, MIN_ACTIVE_SECONDS + 30);
    expect(inv.visible).toBe(false);
    play(inv, 1, { world: { ...fond(), visitor: true } });
    expect(inv.visible).toBe(false);
    connected = false;
    play(inv, 1);
    expect(inv.visible).toBe(true);
    connected = true;
    play(inv, 0.5);
    expect(inv.visible).toBe(false);
  });
});

describe('answers, frequency and memory', () => {
  const ready = (store = memoryStore(), now = () => 1e12) => {
    const inv = new AccountInvite(store, () => false, now);
    play(inv, MIN_ACTIVE_SECONDS + 1);
    expect(inv.visible).toBe(true);
    return inv;
  };

  it('MAYBE LATER dismisses it; never again this session; after a reload only once the cooldown has passed', () => {
    const store = memoryStore();
    let now = 1e12;
    const inv = ready(store, () => now);
    inv.answer('later');
    expect(inv.visible).toBe(false);
    expect(loadInvite(store).answer).toBe('later');
    now += COOLDOWN_MS * 10;
    play(inv, 100);
    expect(inv.visible).toBe(false); // once per session
    now = 1e12 + COOLDOWN_MS - 1;
    const reloaded = new AccountInvite(store, () => false, () => now);
    play(reloaded, 100);
    expect(reloaded.visible).toBe(false); // cooldown
    now = 1e12 + COOLDOWN_MS + 1;
    play(reloaded, 1);
    expect(reloaded.visible).toBe(true);
  });

  it('a reload while it shows (no answer) also waits for the cooldown: it is not shown again right away', () => {
    const store = memoryStore();
    ready(store);
    const reloaded = new AccountInvite(store, () => false, () => 1e12 + 60_000);
    play(reloaded, 100);
    expect(reloaded.visible).toBe(false);
    expect(reloaded.record.activeSeconds).toBeGreaterThanOrEqual(MIN_ACTIVE_SECONDS); // the active time was kept
  });

  it('"Don\'t show this again" is permanent (with either button), across reloads and cooldowns', () => {
    for (const how of ['later', 'explore'] as const) {
      const store = memoryStore();
      const inv = ready(store);
      inv.optOutTicked = true;
      inv.answer(how);
      expect(loadInvite(store).optOut).toBe(true);
      const later = new AccountInvite(store, () => false, () => 1e12 + COOLDOWN_MS * 100);
      play(later, 100);
      expect(later.visible).toBe(false);
    }
  });

  it('left alone, it leaves by itself after a while of play (counted as maybe later)', () => {
    const store = memoryStore();
    const inv = ready(store);
    play(inv, SHOW_SECONDS - 1, { busy: true }); // busy time does not count
    expect(inv.visible).toBe(true);
    play(inv, SHOW_SECONDS);
    expect(inv.visible).toBe(false);
    expect(loadInvite(store).answer).toBe('later');
  });

  it('a damaged or old record is read as new (never throws)', () => {
    const store = memoryStore();
    for (const raw of ['{', 'null', '{"version":9}', '{"version":1,"activeSeconds":-5,"optOut":"yes","shownAt":"x"}']) {
      store.set(INVITE_KEY, raw);
      expect(loadInvite(store)).toEqual(newInviteRecord());
    }
    expect(eligible(newInviteRecord(), { now: 0, shownThisSession: false, connected: false, world: null })).toBe(false);
  });
});

describe('the card on screen', () => {
  const palette = paletteFor('cozy');
  function setup(w = 1280, h = 720, touch = false) {
    const store = memoryStore();
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store });
    live.brain.enabled = false;
    const ui = new GameUI(() => live, () => palette);
    ui.touchMode = touch;
    const settings = new SettingsScreen();
    ui.register(settings);
    const inv = new AccountInvite(memoryStore(), () => false, () => 1e12);
    play(inv, MIN_ACTIVE_SECONDS + 1);
    ui.invite = inv;
    let explored = 0;
    ui.onInviteExplore = () => (explored++, settings.showPage('account'), ui.open('settings'));
    const screen = new PixelBuffer(w, h);
    return { live, ui, inv, screen, store, draw: () => ui.render(screen, 0), explored: () => explored, settings };
  }
  const centre = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2] as const;
  const inside = (b: { x: number; y: number; w: number; h: number }) => (r: { x: number; y: number }) => r.x >= b.x && r.y >= b.y && r.x < b.x + b.w && r.y < b.y + b.h;
  type R = { x: number; y: number; w: number; h: number };
  /** The card's three controls by position: MAYBE LATER is the rightmost, EXPLORE the leftmost on its row, the tick box the other. */
  const controls = (ui: GameUI) => {
    const rs = ui.regions.filter((r) => !r.inert).filter(inside(ui.inviteBox!)) as R[];
    const later = rs.reduce((a, b) => (b.x > a.x ? b : a));
    const explore = rs.filter((r) => r.y === later.y && r !== later).reduce((a, b) => (b.x < a.x ? b : a));
    const tick = rs.find((r) => r !== later && r !== explore)!;
    return { rs, later, explore, tick };
  };

  it('desktop: a floating card at the bottom right; EXPLORE ACCOUNTS opens ACCOUNT without asking the signer or the network', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const wsSpy = vi.fn();
    vi.stubGlobal('WebSocket', wsSpy);
    const { ui, inv, draw, explored, settings, screen } = setup();
    const connect = vi.fn();
    settings.account = { snapshot: () => ({ status: 'guest', pubkey: null, npub: null, npubShort: null, method: null, displayName: null, profile: 'idle', profileAt: null, problem: null, signerAvailable: true, relays: [] }), connect, disconnect: vi.fn(), refreshProfile: async () => {} };
    draw();
    const box = ui.inviteBox!;
    expect(box).not.toBe(null);
    expect(box.x + box.w).toBeLessThanOrEqual(screen.width);
    expect(box.x).toBeGreaterThan(screen.width / 2);
    const { rs, explore } = controls(ui);
    expect(rs.length).toBe(3); // the tick box, EXPLORE ACCOUNTS, MAYBE LATER
    expect(ui.handlePointer(...centre(explore))).toBe(true);
    expect(explored()).toBe(1);
    expect(inv.visible).toBe(false);
    expect(ui.capturing).toBe(true);
    expect(settings.page).toBe('account');
    expect(connect).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(wsSpy).not.toHaveBeenCalled();
  });

  it('the tick box and MAYBE LATER; a press on the card never walks the Blobbi', () => {
    const { ui, inv, draw } = setup();
    draw();
    const box = ui.inviteBox!;
    expect(ui.handlePointer(box.x + 1, box.y + 1)).toBe(true); // inert corner
    expect(inv.visible).toBe(true);
    ui.handlePointer(...centre(controls(ui).tick));
    expect(inv.optOutTicked).toBe(true);
    draw();
    ui.handlePointer(...centre(controls(ui).later));
    expect(inv.visible).toBe(false);
    expect(inv.record.optOut).toBe(true);
  });

  it('never drawn over a menu (the world pauses for the menu; the card waits)', () => {
    const { ui, inv, draw } = setup();
    ui.open('settings');
    draw();
    expect(ui.inviteBox).toBe(null);
    expect(inv.visible).toBe(true);
    ui.close();
    draw();
    expect(ui.inviteBox).not.toBe(null);
  });

  it('phone: a bottom card inside the screen, above the menu bar and the hotbar, no overlap', () => {
    for (const [w, h] of [[667, 375], [844, 390]]) {
      const { ui, live, draw, screen } = setup(w, h, true);
      live.inventory.add(ITEMS.axe.id, 1);
      ui.hudBottom = 100; // the status card and the Guest chip end here on these phones
      draw();
      const box = ui.inviteBox!;
      expect(box.y).toBeGreaterThanOrEqual(100);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(screen.width);
      expect(box.y).toBeGreaterThanOrEqual(0);
      const hb = ui.hotbarBox!;
      const overlaps = (a: typeof box, b: typeof box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlaps(box, hb)).toBe(false);
      for (const r of ui.regions.filter((r) => !r.inert && !inside(box)(r))) expect(overlaps(box, r), JSON.stringify(r)).toBe(false);
    }
  });

  it('the island save is byte-identical before and after the whole invitation (it is not part of any save)', () => {
    const { live, ui, inv, draw, store } = setup();
    live.save();
    const before = store.get(saveKey(live.identity));
    draw();
    inv.optOutTicked = true;
    inv.answer('later');
    draw();
    live.save();
    expect(store.get(saveKey(live.identity))).toBe(before);
    expect(store.get(INVITE_KEY)).toBe(null); // its record lives in its own store (the browser's), never the island's
    void ui;
  });
});

describe('copy', () => {
  it('M11D.5 replaced the copy: the Blobbi\'s own curiosity; no em dash; no promise of island sync or of every game', () => {
    expect([en['invite.title'], en['invite.explore'], en['invite.later'], en['invite.never']]).toEqual(['{name} is curious about the world beyond the island!', 'Discover other worlds', 'Keep playing', "Don't show this again"]);
    expect([ptBR['invite.title'], ptBR['invite.explore'], ptBR['invite.later'], ptBR['invite.never']]).toEqual(['{name} está curioso para conhecer outros mundos!', 'Descobrir outros mundos', 'Continuar jogando', 'Não mostrar novamente']);
    expect([es['invite.title'], es['invite.explore'], es['invite.later'], es['invite.never']]).toEqual(['¡{name} tiene curiosidad por conocer otros mundos!', 'Descubrir otros mundos', 'Seguir jugando', 'No volver a mostrar']);
    expect(en['invite.body']).toBe('Your Blobbi can visit other connected places and join you in new adventures.');
    for (const cat of [en, ptBR, es] as Record<string, unknown>[])
      for (const k of ['invite.title', 'invite.body', 'invite.explore', 'invite.later', 'invite.never']) {
        expect(String(cat[k]), k).not.toMatch(/—/);
        expect(String(cat[k]), k).not.toMatch(/sync|sincroniz|island along|ilha com você|isla contigo|every game|todos os jogos|todos los juegos/i);
      }
  });
});
