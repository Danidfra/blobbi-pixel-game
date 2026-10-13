/**
 * THE HOME PANEL (M8): the player's house. HOUSE shows its level and what the next one needs (every requirement with
 * a mark, never by colour alone) and upgrades it after a confirmation that says what it costs and what happens to
 * the furniture. LOOK and ROOMS (customisation) preview a change before it is applied.
 *
 * Opening it never changes anything; only UPGRADE → CONFIRM and APPLY do, through the live world's own methods.
 */
import { t, upper } from '../../i18n';
import { fitText } from './crafting';
import { Gfx, UI } from '../gfx';
import { isConfirm, type GameUI, type Screen } from '../game-ui';
import { houseLevel, houseSprite, type Building } from '../../game/buildings';
import { houseLevelInfo } from '../../content/houses';
import { countLabel } from '../../game/items';
import { ConfirmGate } from '../../game/world-delete';
import { PixelBuffer } from '../../core/pixel';
import { card, DESIGN } from '../hud';

export type HomeTab = 'house' | 'look' | 'rooms';

/** The confirmation's arming time: a held Enter or a double tap cannot confirm an upgrade. */
const ARM = 0.35;

export class HomeScreen implements Screen {
  readonly id = 'home' as const;
  tab: HomeTab = 'house';
  /** The upgrade waiting for CONFIRM. */
  readonly confirm = new ConfirmGate<number>(ARM);
  /** Extra tabs (customisation) draw and handle keys through these hooks. */
  readonly tabs: Partial<Record<Exclude<HomeTab, 'house'>, { draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void; key(code: string, ui: GameUI): boolean; opened?(ui: GameUI): void }>> = {};

  title(ui: GameUI): string {
    const house = ui.live?.home();
    return house ? t('home.titleWith', { name: houseLevelInfo(houseLevel(house)).name }) : t('home.title');
  }

  opened(ui: GameUI): void {
    this.confirm.cancel();
    for (const t of Object.values(this.tabs)) t.opened?.(ui);
  }

  private tabList(): HomeTab[] {
    return ['house', ...(Object.keys(this.tabs) as HomeTab[])];
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    if (code === 'Tab') {
      const list = this.tabList();
      this.tab = list[(list.indexOf(this.tab) + 1) % list.length];
      this.confirm.cancel();
      return true;
    }
    if (this.tab !== 'house') return this.tabs[this.tab]?.key(code, ui) ?? false;
    if (code === 'Escape' && this.confirm.pending) {
      this.confirm.cancel();
      return true;
    }
    if (isConfirm(code) || code === 'KeyE') {
      if (this.confirm.pending) this.doUpgrade(ui);
      else this.askUpgrade(ui);
      return true;
    }
    return false;
  }

  /** UPGRADE: ask first (nothing changes yet). */
  askUpgrade(ui: GameUI): void {
    const live = ui.live!;
    const c = live.houseUpgrade();
    if (!c.house) return ui.say(t('home.buildShelterB'), false);
    if (!c.next) return ui.say(t('home.grandest'), true);
    if (!c.ready) return ui.say(c.blocked ?? t('home.stillNeeded', { list: c.requirements.filter((r) => !r.met).map((r) => r.label.toLocaleLowerCase()).join(', ') }), false);
    this.confirm.open(c.next.level, ui.now);
  }

  /** CONFIRM: only once the question has been on screen for a moment. */
  doUpgrade(ui: GameUI): void {
    const level = this.confirm.confirm(ui.now);
    if (level === null) return;
    const r = ui.live!.upgradeHouse();
    if (r.ok) {
      ui.say(t('home.buildersBegin', { name: houseLevelInfo(level).name }));
      ui.close();
    } else ui.say(r.reason ?? t('bag.notNow'), false);
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const list = this.tabList();
    if (list.length > 1) {
      list.forEach((tab, i) => g.button(t(`home.tab.${tab}`), x + i * 62, y, () => ((this.tab = tab), this.confirm.cancel()), { w: 58, primary: this.tab === tab }));
      y += 15;
      h -= 15;
    }
    if (this.tab !== 'house') return this.tabs[this.tab]?.draw(g, ui, x, y, w, h);
    this.drawHouse(g, ui, x, y, w, h);
  }

  private drawHouse(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const live = ui.live!;
    const c = live.houseUpgrade();
    if (!c.house) {
      g.para(t('home.noHome'), x, y + 4, w, UI.ink);
      return;
    }
    const house = c.house;
    const now = houseLevelInfo(c.level);
    // Now and next, side by side, at twice the world's size.
    const pic = (b: Building, px: number, label: string, sub: string) => {
      const s = houseSprite(b, ui.palette(), 1, live.world.options.scale);
      const box = new PixelBuffer(64, 34);
      box.fill(ui.palette().grass.mid);
      box.blit(s.buffer, 32 - s.anchorX, 30 - s.anchorY);
      g.buf.blit(card(68, 38, DESIGN.accent), px, y);
      g.buf.blit(box.scaled(1), px + 2, y + 2);
      g.text(label, px, y + 41, UI.accent);
      g.text(sub, px, y + 48, UI.muted);
    };
    pic(house, x, upper(t('home.now', { name: now.name })), upper(t('home.levelOf', { n: c.level, of: 3 })));
    if (!c.next) {
      g.para(`${now.blurb} ${t('home.grandestMore')}`, x + 76, y + 2, w - 78, UI.ink);
      return;
    }
    pic({ ...house, level: c.next.level, upgradedAt: undefined }, x + 76, upper(t('home.next', { name: c.next.name })), upper(t('home.level', { n: c.next.level })));
    g.para(c.next.blurb, x + 152, y, w - 152, UI.ink, 6);
    let cy = y + 60;
    g.text(upper(t('home.toBuild')), x, cy, UI.accent);
    cy += 9;
    for (const r of c.requirements) {
      const mark = r.met ? 'OK' : '--';
      g.text(mark, x, cy, r.met ? UI.good : UI.bad);
      const amount = r.need !== undefined ? `  ${Math.min(r.have ?? 0, r.need)}/${r.need}` : '';
      g.text(fitText(g, upper(`${r.label}${amount}`), w - 110), x + 12, cy, r.met ? UI.ink : UI.muted);
      cy += 8;
    }
    if (c.blocked) cy += g.para(c.blocked, x, cy + 2, w - 100, UI.bad, 3) + 2;
    const bx = x + w - 92;
    const by = y + h - 30;
    if (this.confirm.pending) {
      const cost = c.next.cost.map((k) => countLabel(k.item, k.quantity)).join(', ');
      const moves = c.displaced ? t('home.displaced', { count: c.displaced }) : t('home.movesIn');
      g.box(x, by - 26, w - 96, 40, UI.bg, UI.accent);
      g.para(t('home.confirmText', { name: c.next.name, cost, moves }), x + 3, by - 23, w - 102, UI.ink, 5);
      g.button(t('home.confirm'), bx, by - 14, () => this.doUpgrade(ui), { w: 90, primary: true, enabled: this.confirm.armed(ui.now) });
      g.button(t('mode.cancel'), bx, by, () => this.confirm.cancel(), { w: 90 });
    } else {
      g.button(t('home.upgrade'), bx, by, () => this.askUpgrade(ui), { w: 90, primary: c.ready, enabled: c.ready, whyNot: () => this.askUpgrade(ui) });
      const notYet = upper(t('growth.notReadyButton'));
      if (!c.ready) g.text(notYet, bx + 90 - g.measure(notYet), by - 9, UI.muted);
    }
  }
}
