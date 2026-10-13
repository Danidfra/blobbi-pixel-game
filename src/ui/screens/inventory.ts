/**
 * THE BAG: every stack by category, an icon grid, the selected item's details and what can be done with it
 * (equip a tool, feed a food, choose a seed, place furniture, read a found note). Reads the live inventory; never
 * holds a copy of it.
 */
import { ALL_ITEMS, MENU_CATEGORIES, MENU_LABEL, foodEffect, itemById, itemDescription, itemLabel, menuCategory, toolTier, type MenuCategory } from '../../game/items';
import { cropForSeed } from '../../game/farming';
import { sentence } from '../../i18n';
import { itemIcon } from '../icons';
import { Gfx, UI } from '../gfx';
import { isConfirm, moveSelection, type GameUI, type Screen } from '../game-ui';
import { itemNoun, cropNoun } from '../../content/text';
import { t, upper } from '../../i18n';

type Tab = 'all' | MenuCategory;
const TABS: readonly Tab[] = ['all', ...MENU_CATEGORIES];
/** Tab names in the current language (the menu labels are content text, translated in place). */
const tabLabel = (tab: Tab): string => (tab === 'all' ? t('bag.all') : MENU_LABEL[tab]);
const ORDER = new Map(ALL_ITEMS.map((d, i) => [d.id, i]));

export const COLS = 8;
const SLOT = 18;

/** The stacks shown on a tab: category order, then registry order. */
export function bagEntries(ui: GameUI, tab: Tab): { item: string; quantity: number }[] {
  const live = ui.live;
  if (!live) return [];
  return live.inventory
    .entries()
    .filter((e) => tab === 'all' || menuCategory(e.item) === tab)
    .sort((a, b) => MENU_CATEGORIES.indexOf(menuCategory(a.item)) - MENU_CATEGORIES.indexOf(menuCategory(b.item)) || (ORDER.get(a.item) ?? 1e9) - (ORDER.get(b.item) ?? 1e9) || (a.item < b.item ? -1 : 1));
}

/** What the primary action on an item is, if any. */
export function primaryAction(ui: GameUI, item: string): { label: string; run: () => void } | null {
  const live = ui.live;
  if (!live) return null;
  const def = itemById(item);
  if (!def) return null;
  if (def.tool) {
    if (live.equipped === item) return { label: t('bag.unequip'), run: () => (live.unequip(), ui.say(t('bag.backInBag', itemNoun(item)))) };
    return { label: t('bag.equip'), run: () => (live.equip(item) ? ui.say(t('bag.inHand', itemNoun(item))) : ui.say(t('bag.cannotEquip'), false)) };
  }
  if (def.food) return { label: t('bag.feed'), run: () => (live.feed(item) ? ui.say(t('bag.ate', itemNoun(item))) : ui.say(live.bubble?.text ?? t('bag.notNow'), false)) };
  const crop = cropForSeed(item);
  if (crop) return { label: t('bag.plant'), run: () => ((live.selectedCrop = crop), ui.say(t('bag.plantsNext', cropNoun(crop))), ui.close()) };
  if (def.place) return { label: t('bag.place'), run: () => (live.startPlacing(item) ? ui.close() : ui.say(live.bubble?.text ?? t('bag.cannotPlace'), false)) };
  if (def.category === 'special' && live.readable(item)) return { label: t('bag.read'), run: () => ui.openNote(item) };
  return null;
}

export class InventoryScreen implements Screen {
  readonly id = 'inventory' as const;
  tab: Tab = 'all';
  index = 0;
  private scroll = 0;

  title(ui: GameUI): string {
    const live = ui.live!;
    return t('bag.title', { kinds: live.inventory.entries().length, items: live.inventory.total() });
  }

  opened(): void {
    this.index = 0;
    this.scroll = 0;
  }

  selected(ui: GameUI): string | null {
    const list = bagEntries(ui, this.tab);
    return list[Math.min(this.index, list.length - 1)]?.item ?? null;
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    const list = bagEntries(ui, this.tab);
    if (code === 'KeyQ' || code === 'KeyE' || code === 'Tab') {
      const step = code === 'KeyQ' ? -1 : 1;
      this.tab = TABS[(TABS.indexOf(this.tab) + step + TABS.length) % TABS.length];
      this.index = 0;
      return true;
    }
    const digit = /^Digit([1-7])$/.exec(code);
    if (digit) {
      this.tab = TABS[Number(digit[1]) - 1];
      this.index = 0;
      return true;
    }
    const moved = moveSelection(code, this.index, list.length, COLS);
    if (moved !== null) {
      this.index = moved;
      return true;
    }
    if (isConfirm(code)) {
      const item = this.selected(ui);
      const action = item ? primaryAction(ui, item) : null;
      action?.run();
      return true;
    }
    return false;
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const live = ui.live!;
    const palette = ui.palette();
    // Tabs.
    let tx = x;
    TABS.forEach((tab, i) => {
      const n = bagEntries(ui, tab).length;
      const label = upper(`${tabLabel(tab)} ${n}`);
      tx += g.button(label, tx, y, () => ((this.tab = tab), (this.index = 0)), { primary: this.tab === tab, w: g.measure(label) + 5 }) + 1;
      void i;
    });
    // Grid.
    const list = bagEntries(ui, this.tab);
    this.index = Math.max(0, Math.min(this.index, list.length - 1));
    const gy = y + 14;
    // (A moored canoe's line takes the grid's last row.)
    const rows = Math.floor((h - 14 - (live.boat && !live.boat.aboard ? 16 : 0)) / (SLOT + 2));
    const row = Math.floor(this.index / COLS);
    if (row < this.scroll) this.scroll = row;
    if (row >= this.scroll + rows) this.scroll = row - rows + 1;
    for (let i = this.scroll * COLS; i < Math.min(list.length, (this.scroll + rows) * COLS); i++) {
      const e = list[i];
      const sx = x + (i % COLS) * (SLOT + 2);
      const sy = gy + (Math.floor(i / COLS) - this.scroll) * (SLOT + 2);
      g.slot(sx, sy, SLOT, itemIcon(e.item, palette), e.quantity, { selected: i === this.index, equipped: live.equipped === e.item, full: e.quantity >= live.inventory.limit(e.item) });
      g.hit(sx, sy, SLOT, SLOT, () => {
        if (this.index === i) primaryAction(ui, e.item)?.run();
        this.index = i;
      }, `${itemLabel(e.item)} ×${e.quantity}`);
    }
    if (!list.length) g.para(this.tab === 'all' ? t('bag.empty') : t('bag.emptyTab', { tab: tabLabel(this.tab).toLocaleLowerCase() }), x + 2, gy + 4, COLS * (SLOT + 2) - 4, UI.muted);
    if (list.length > rows * COLS) g.text(`${this.scroll + 1}-${Math.min(Math.ceil(list.length / COLS), this.scroll + rows)}/${Math.ceil(list.length / COLS)}`, x, y + h - 6, UI.muted);
    // The canoe, moored somewhere (M10 phase C): it can always be called back into the bag.
    if (live.boat && !live.boat.aboard) {
      const by = y + h - 16;
      const moored = upper(t('bag.canoeMoored'));
      g.text(moored, x, by + 3, UI.muted);
      g.button(t('bag.callBack'), x + g.measure(moored) + 6, by, () => (live.recallCanoe() ? ui.say(t('canoe.backInBag')) : ui.say(live.bubble?.text ?? t('bag.notNow'), false)));
    }
    // Details.
    const dx = x + COLS * (SLOT + 2) + 4;
    const dw = x + w - dx;
    g.box(dx, gy, dw, h - 14, UI.panel, UI.line);
    const item = this.selected(ui);
    if (!item) return;
    const def = itemById(item)!;
    const qty = live.inventory.count(item);
    const limit = live.inventory.limit(item);
    const icon = itemIcon(item, palette).scaled(2);
    g.buf.blit(icon, dx + 4, gy + 4);
    let ly = gy + 4;
    const lx = dx + 4 + Math.max(icon.width, 28) + 4;
    g.para(sentence(def.label), lx, ly, dx + dw - lx - 3, UI.accent, 2);
    ly += 15;
    g.text(upper(MENU_LABEL[menuCategory(item)]), lx, ly, UI.muted);
    ly += 8;
    g.text(`${qty} / ${limit}`, lx, ly, qty >= limit ? UI.accent : UI.ink);
    g.bar(lx, ly + 7, Math.min(48, dx + dw - lx - 4), qty / limit, qty >= limit ? UI.accent : UI.good);
    ly = Math.max(gy + 4 + icon.height + 4, ly + 15);
    ly += g.para(itemDescription(item), dx + 4, ly, dw - 8, UI.ink, 7) + 3;
    const food = foodEffect(item);
    if (food) {
      const parts = [`${t('care.fed')} +${food.restores}`, food.energy ? `${t('care.energy')} +${food.energy}` : '', food.joy ? `${t('care.joy')} +${food.joy}` : ''].filter(Boolean);
      g.text(upper(parts.join('  ')), dx + 4, ly, UI.good);
      ly += 8;
    }
    if (def.tool) {
      g.text(upper(`${t(live.equipped === item ? 'bag.inHandShort' : 'bag.inBagShort')}${toolTier(item) > 1 ? `  ${t('bag.tier', { n: toolTier(item) })}` : ''}`), dx + 4, ly, live.equipped === item ? UI.accent : UI.muted);
      ly += 8;
    }
    if (qty >= limit) g.text(upper(t('bag.stackFull')), dx + 4, ly, UI.accent);
    const action = primaryAction(ui, item);
    if (action) g.button(`${action.label} (ENTER)`, dx + 4, gy + h - 14 - 15, action.run, { primary: true });
  }
}
