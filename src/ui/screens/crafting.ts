/**
 * CRAFTING: every known recipe by group, what it needs (have / need), where it is made, and a Craft button; the
 * Build tab lists the buildings and decorations B builds in place. Locked recipes stay hidden until a quest
 * teaches them (the tab says how many are left to discover), so a new player is not handed everything at once —
 * except (M10 phase C) a recipe whose teaching quest is open now: it shows LOCKED, with what to do to unlock it
 * (`LiveWorld.recipeLockHint`, from the quest's own data), and cannot be made yet. Discovery quests stay a surprise.
 */
import { RECIPES, canCraft, type Recipe, type RecipeGroup } from '../../game/crafting';
import { BUILDINGS, BUILDING_KINDS } from '../../game/buildings';
import { itemById, itemDescription, itemLabel } from '../../game/items';
import { CANOE_ITEM } from '../../content/tools';
import { itemIcon } from '../icons';
import { Gfx, UI } from '../gfx';
import { isConfirm, moveSelection, type GameUI, type Screen } from '../game-ui';

type Tab = RecipeGroup | 'build';
const CRAFT_TABS: readonly Tab[] = ['tools', 'materials', 'furniture', 'outdoor', 'build'];
const TAB_LABEL: Record<Tab, string> = { tools: 'Tools', materials: 'Materials', furniture: 'Furniture', outdoor: 'Outdoor', build: 'Build', meals: 'Meals' };
const ROW = 12;

interface Entry {
  label: string;
  icon: string | null;
  recipe?: Recipe;
  build?: string;
  /** Locked: how to unlock it (the recipe is shown, never made). */
  locked?: string;
}

export class CraftingScreen implements Screen {
  readonly id: 'crafting' | 'cooking';
  readonly tabs: readonly Tab[];
  tab: Tab;
  target?: import('../../game/buildings').Building | null;

  constructor(kind: 'crafting' | 'cooking' = 'crafting') {
    this.id = kind;
    this.tabs = kind === 'cooking' ? ['meals'] : CRAFT_TABS;
    this.tab = this.tabs[0];
  }
  index = 0;
  /** Recipes for this group are shown even when locked (tests and dev tools). */
  showLocked = false;

  title(ui: GameUI): string {
    if (this.id === 'cooking') return 'Cooking  at the stove';
    return ui.live!.nearStation('workbench') ? 'Crafting  at the workbench' : 'Crafting';
  }

  opened(ui: GameUI): void {
    this.index = 0;
    if (this.id === 'crafting' && ui.live?.nearStation('workbench') && this.tab === 'tools') this.tab = 'furniture';
  }

  entries(ui: GameUI, tab: Tab = this.tab): Entry[] {
    const live = ui.live!;
    if (tab === 'build')
      return BUILDING_KINDS.filter((k) => live.unlocked().has(k)).map((k) => ({ label: BUILDINGS[k].label, icon: BUILDINGS[k].item, build: k }));
    const group = RECIPES.filter((r) => r.group === tab);
    const known = group.filter((r) => this.showLocked || live.recipeKnown(r)).map((r) => ({ label: r.label, icon: r.output.item, recipe: r }));
    // Recipes the open quests are about to teach: shown locked, after the known ones.
    const teased = this.showLocked ? [] : group.flatMap((r) => {
      const hint = live.recipeLockHint(r);
      return hint ? [{ label: r.label, icon: r.output.item, recipe: r, locked: hint }] : [];
    });
    return [...known, ...teased];
  }

  hidden(ui: GameUI, tab: Tab): number {
    if (tab === 'build') return BUILDING_KINDS.filter((k) => !ui.live!.unlocked().has(k)).length;
    return RECIPES.filter((r) => r.group === tab && !ui.live!.recipeKnown(r) && !ui.live!.recipeLockHint(r)).length;
  }

  act(ui: GameUI, e: Entry): void {
    const live = ui.live!;
    if (e.build) {
      live.setBuildMode(e.build);
      ui.close();
      return;
    }
    const r = e.recipe!;
    if (e.locked) {
      ui.say(e.locked, false);
      return;
    }
    if (live.craftRecipe(r)) ui.say(live.bubble?.text ?? `crafted ${itemLabel(r.output.item)}`);
    else ui.say(live.bubble?.text ?? 'cannot craft that yet', false);
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    if (code === 'KeyQ' || code === 'KeyE' || code === 'Tab') {
      this.tab = this.tabs[(this.tabs.indexOf(this.tab) + (code === 'KeyQ' ? -1 : 1) + this.tabs.length) % this.tabs.length];
      this.index = 0;
      return true;
    }
    const digit = /^Digit([1-5])$/.exec(code);
    if (digit && this.tabs[Number(digit[1]) - 1]) {
      this.tab = this.tabs[Number(digit[1]) - 1];
      this.index = 0;
      return true;
    }
    const list = this.entries(ui);
    const moved = moveSelection(code, this.index, list.length, 1);
    if (moved !== null) {
      this.index = moved;
      return true;
    }
    if (isConfirm(code)) {
      const e = list[this.index];
      if (e) this.act(ui, e);
      return true;
    }
    return false;
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const live = ui.live!;
    const palette = ui.palette();
    let tx = x;
    for (const tab of this.tabs) {
      const label = `${TAB_LABEL[tab]} ${this.entries(ui, tab).length}`.toUpperCase();
      tx += g.button(label, tx, y, () => ((this.tab = tab), (this.index = 0)), { primary: this.tab === tab }) + 1;
    }
    const list = this.entries(ui);
    this.index = Math.max(0, Math.min(this.index, list.length - 1));
    const listW = 118;
    const ly = y + 14;
    const rows = Math.floor((h - 26) / ROW);
    const scroll = Math.max(0, this.index - rows + 1);
    for (let i = scroll; i < Math.min(list.length, scroll + rows); i++) {
      const e = list[i];
      const ry = ly + (i - scroll) * ROW;
      const ok = !e.locked && (e.recipe ? canCraft(live.inventory, e.recipe).ok && live.nearStation(e.recipe.station) : live.canAfford(e.build!) || (!!BUILDINGS[e.build!].item && live.inventory.count(BUILDINGS[e.build!].item!) > 0));
      g.box(x, ry, listW, ROW - 1, i === this.index ? UI.slotHi : UI.panel, i === this.index ? UI.accent : null);
      if (e.icon) {
        const icon = itemIcon(e.icon, palette);
        const small = icon.height > 10 ? icon.scaled(1) : icon;
        g.buf.blit(small, x + 2, ry + Math.max(0, Math.floor((ROW - 1 - Math.min(10, small.height)) / 2)));
      }
      g.text(e.label.toUpperCase().slice(0, e.locked ? 15 : 22), x + 18, ry + 3, e.locked ? UI.line : ok ? UI.ink : UI.muted);
      if (e.locked) {
        // A small padlock and the word, at the row's end.
        const lx = x + listW - 31;
        g.buf.strokeRect(lx + 1, ry + 2, 3, 3, UI.muted);
        g.buf.fillRect(lx, ry + 4, 5, 4, UI.muted);
        g.text('LOCKED', lx + 7, ry + 3, UI.muted);
      }
      g.hit(x, ry, listW, ROW - 1, () => (this.index === i ? this.act(ui, e) : (this.index = i)));
    }
    const hidden = this.hidden(ui, this.tab);
    if (hidden) g.text(`${hidden} MORE TO DISCOVER`, x, y + h - 10, UI.muted);
    if (!list.length) g.para('Nothing here yet. Quests teach new recipes.', x + 2, ly + 4, listW - 4, UI.muted);
    // Details.
    const dx = x + listW + 4;
    const dw = x + w - dx;
    g.box(dx, ly, dw, h - 14, UI.panel, UI.line);
    const e = list[this.index];
    if (!e) return;
    if (e.icon) g.buf.blit(itemIcon(e.icon, palette).scaled(2), dx + 4, ly + 4);
    g.para(e.label, dx + 40, ly + 5, dw - 44, UI.accent, 2);
    let cy = ly + 38;
    const needs = e.recipe ? e.recipe.ingredients : BUILDINGS[e.build!].cost;
    if (e.locked) {
      g.text('LOCKED', dx + 40, ly + 20, UI.bad);
      cy += g.para(e.locked, dx + 4, cy, dw - 8, UI.accent, 2) + 3;
    }
    if (e.icon) cy += g.para(e.build ? BUILDINGS[e.build].purpose : itemDescription(e.icon), dx + 4, cy, dw - 8, UI.ink, 3) + 3;
    // The canoe needs the sea within reach (M10 phase C): until the island's first growth opens a way, say so.
    if (e.recipe && e.recipe.output.item === CANOE_ITEM.id && !live.seaReachable())
      cy += g.para('The ocean is still out of reach. Help your island grow to open a path to the shore!', dx + 4, cy, dw - 8, UI.muted, 3) + 3;
    g.text('NEEDS', dx + 4, cy, UI.muted);
    cy += 8;
    for (const n of needs) {
      const have = live.inventory.count(n.item);
      g.buf.blit(itemIcon(n.item, palette), dx + 4, cy - 2);
      g.text(`${have}/${n.quantity} ${itemLabel(n.item)}`.toUpperCase(), dx + 22, cy + 2, have >= n.quantity ? UI.good : UI.bad);
      cy += 14;
    }
    if (e.recipe) {
      const station = e.recipe.station ?? 'hand';
      if (station !== 'hand') g.text(`AT A ${station === 'workbench' ? 'WORKBENCH' : 'COOKING STATION'}${live.nearStation(station) ? '' : ' (NOT NEAR)'}`, dx + 4, cy, live.nearStation(station) ? UI.good : UI.bad);
      if (e.recipe.output.quantity > 1) g.text(`MAKES ${e.recipe.output.quantity}`, dx + 4, cy + 8, UI.muted);
    }
    if (e.recipe?.output && e.recipe.group === 'meals') {
      const f = itemById(e.recipe.output.item)?.food;
      if (f) g.text([`FED +${f.restores}`, f.energy ? `ENERGY +${f.energy}` : '', f.joy ? `JOY +${f.joy}` : ''].filter(Boolean).join(' '), dx + 4, ly + h - 14 - 26, UI.good);
    }
    if (e.locked) return; // nothing to press: it cannot be made yet
    g.button(e.build ? 'BUILD (ENTER)' : e.recipe?.group === 'meals' ? 'COOK (ENTER)' : 'CRAFT (ENTER)', dx + 4, ly + h - 14 - 15, () => this.act(ui, e), { primary: true });
  }
}
