/**
 * STORAGE: the bag and a chest side by side. Pick a stack on either side and move it across: all of it (Enter,
 * or pressing the slot again), one (Space), or half (H). "Store matching" puts every stack the chest already
 * holds into it (quick stacking). Every move is one `LiveWorld.moveItems` call, so nothing can be duplicated.
 */
import { ALL_ITEMS, itemLabel, menuCategory, MENU_CATEGORIES } from '../../game/items';
import { BUILDINGS, type Building } from '../../game/buildings';
import { itemIcon } from '../icons';
import { Gfx, UI } from '../gfx';
import { isConfirm, moveSelection, type GameUI, type Screen } from '../game-ui';

const COLS = 5;
const SLOT = 18;
const ORDER = new Map(ALL_ITEMS.map((d, i) => [d.id, i]));
const sorted = (entries: { item: string; quantity: number }[]) =>
  entries.sort((a, b) => MENU_CATEGORIES.indexOf(menuCategory(a.item)) - MENU_CATEGORIES.indexOf(menuCategory(b.item)) || (ORDER.get(a.item) ?? 1e9) - (ORDER.get(b.item) ?? 1e9));

export class StorageScreen implements Screen {
  readonly id = 'storage' as const;
  target: Building | null = null;
  side: 'bag' | 'chest' = 'bag';
  index = 0;

  title(ui: GameUI): string {
    const c = this.target ? ui.live!.containerFor(this.target) : null;
    return `${this.target ? BUILDINGS[this.target.kind].label : 'Storage'}  ${c ? `${c.inventory.entries().length}/${c.capacity} stacks` : ''}`;
  }

  opened(): void {
    this.side = 'bag';
    this.index = 0;
  }

  private lists(ui: GameUI) {
    const live = ui.live!;
    const chest = this.target ? live.containerFor(this.target) : null;
    return { bag: sorted(live.inventory.entries()), chest: chest ? sorted(chest.inventory.entries()) : [] };
  }

  /** Move `how` of the selected stack across. */
  move(ui: GameUI, how: 'all' | 'one' | 'half'): void {
    const live = ui.live!;
    if (!this.target) return;
    const list = this.lists(ui)[this.side];
    const e = list[this.index];
    if (!e) return;
    const n = how === 'all' ? e.quantity : how === 'one' ? 1 : Math.max(1, Math.floor(e.quantity / 2));
    const moved = live.moveItems(this.target, e.item, n, this.side === 'bag');
    if (moved) ui.say(`${moved} ${itemLabel(e.item)} ${this.side === 'bag' ? 'stored' : 'taken'}`);
    else ui.say(this.side === 'bag' ? 'the chest is full' : 'no room in the bag', false);
    const after = this.lists(ui)[this.side];
    this.index = Math.min(this.index, Math.max(0, after.length - 1));
  }

  /** Put every bag stack the chest already holds into it. */
  storeMatching(ui: GameUI): void {
    const live = ui.live!;
    if (!this.target) return;
    const c = live.containerFor(this.target)!;
    let total = 0;
    for (const e of live.inventory.entries()) if (c.inventory.count(e.item) > 0) total += live.moveItems(this.target, e.item, e.quantity, true);
    ui.say(total ? `${total} items stored` : 'nothing matching to store', total > 0);
  }

  key(code: string, shift: boolean, ui: GameUI): boolean {
    const lists = this.lists(ui);
    if (code === 'Tab' || code === 'KeyQ' || code === 'KeyE') {
      this.side = this.side === 'bag' ? 'chest' : 'bag';
      this.index = 0;
      return true;
    }
    const list = lists[this.side];
    // Moving left from the chest's first column (or right from the bag's last) changes side.
    if ((code === 'ArrowLeft' || code === 'KeyA') && this.side === 'chest' && this.index % COLS === 0) {
      this.side = 'bag';
      this.index = Math.min(lists.bag.length - 1, this.index + COLS - 1);
      return true;
    }
    if ((code === 'ArrowRight' || code === 'KeyD') && this.side === 'bag' && (this.index % COLS === COLS - 1 || this.index === list.length - 1)) {
      this.side = 'chest';
      this.index = Math.max(0, Math.min(lists.chest.length - 1, this.index - (this.index % COLS)));
      return true;
    }
    const moved = moveSelection(code, this.index, list.length, COLS);
    if (moved !== null) {
      this.index = moved;
      return true;
    }
    if (code === 'Space') this.move(ui, shift ? 'half' : 'one');
    else if (code === 'KeyH') this.move(ui, 'half');
    else if (isConfirm(code)) this.move(ui, 'all');
    else if (code === 'KeyM') this.storeMatching(ui);
    else return false;
    return true;
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const palette = ui.palette();
    const live = ui.live!;
    const lists = this.lists(ui);
    const paneW = COLS * (SLOT + 2) + 4;
    const panes: ['bag' | 'chest', number, string][] = [
      ['bag', x, `BAG ${lists.bag.length}`],
      ['chest', x + w - paneW, `CHEST ${lists.chest.length}/${this.target ? live.containerFor(this.target)!.capacity : 0}`],
    ];
    for (const [side, px, label] of panes) {
      const list = lists[side];
      const active = this.side === side;
      g.box(px, y, paneW, h - 16, active ? UI.panel : UI.bg, active ? UI.accent : UI.line);
      g.text(label, px + 3, y + 3, active ? UI.accent : UI.muted);
      const rows = Math.floor((h - 30) / (SLOT + 2));
      const sel = active ? this.index : -1;
      const scroll = Math.max(0, Math.floor(Math.max(0, sel) / COLS) - rows + 1);
      for (let i = scroll * COLS; i < Math.min(list.length, (scroll + rows) * COLS); i++) {
        const e = list[i];
        const sx = px + 3 + (i % COLS) * (SLOT + 2);
        const sy = y + 11 + (Math.floor(i / COLS) - scroll) * (SLOT + 2);
        const limit = side === 'bag' ? live.inventory.limit(e.item) : 99;
        g.slot(sx, sy, SLOT, itemIcon(e.item, palette), e.quantity, { selected: i === sel, equipped: side === 'bag' && live.equipped === e.item, full: side === 'bag' && e.quantity >= limit });
        g.hit(sx, sy, SLOT, SLOT, () => {
          if (this.side === side && this.index === i) this.move(ui, 'all');
          else {
            this.side = side;
            this.index = i;
          }
        }, `${itemLabel(e.item)} x${e.quantity}`);
      }
      if (!list.length) g.para(side === 'bag' ? 'The bag is empty.' : 'Empty. Pick a stack in the bag and press Enter.', px + 4, y + 14, paneW - 8, UI.muted);
    }
    // Middle: the selected stack and the transfer buttons.
    const mx = x + paneW + 4;
    const mw = w - 2 * paneW - 8;
    const e = lists[this.side][this.index];
    if (e) {
      g.buf.blit(itemIcon(e.item, palette).scaled(2), mx + Math.floor(mw / 2) - 14, y + 4);
      g.para(itemLabel(e.item), mx, y + 36, mw, UI.accent, 2);
      g.text(`x${e.quantity}`, mx, y + 52, UI.ink);
    }
    const arrow = this.side === 'bag' ? 'STORE' : 'TAKE';
    let by = y + 62;
    for (const [label, how] of [[`${arrow} ALL`, 'all'], [`${arrow} HALF`, 'half'], [`${arrow} ONE`, 'one']] as const) {
      g.button(label, mx, by, () => this.move(ui, how), { enabled: !!e, primary: how === 'all', w: mw });
      by += 13;
    }
    g.button('STORE MATCHING', mx, by + 4, () => this.storeMatching(ui), { w: mw });
    g.text('ENTER ALL  SPACE ONE  H HALF  TAB SIDE  M MATCH', x, y + h - 10, UI.muted);
  }
}
