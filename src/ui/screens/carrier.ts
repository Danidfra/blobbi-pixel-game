/**
 * THE CARRIER PANEL (E at the shore by the turtle's head, once the Carrier is known): the gentle interactions on
 * the left (listen, greet, observe, offer, rest), and on the right the island's harmony, the bond, the Carrier's
 * likes once discovered, and the island's growth stage (M7: ISLAND GROWTH opens the growth panel).
 */
import { HARMONY_LEVELS, observationsFor } from '../../game/carrier';
import { MAX_GROWTH_STAGE } from '../../world/growth';
import { ALL_ITEMS, itemLabel } from '../../game/items';
import { itemIcon } from '../icons';
import { Gfx, UI } from '../gfx';
import { hex } from '../../core/color';
import { isConfirm, moveSelection, type GameUI, type Screen } from '../game-ui';
import { t, upper } from '../../i18n';

type Row = { label: string; hint: string; run: (ui: GameUI) => void };

export class CarrierScreen implements Screen {
  readonly id = 'carrier' as const;
  index = 0;
  /** The offer picker: open, and which stack. */
  offering = false;
  offerIndex = 0;

  title(): string {
    return t('carrierPanel.title');
  }

  opened(): void {
    this.index = 0;
    this.offering = false;
  }

  /** Foods and flowers in the bag (what can be offered). */
  offerable(ui: GameUI): string[] {
    const live = ui.live!;
    return live.inventory
      .entries()
      .map((e) => e.item)
      .filter((id) => {
        const d = ALL_ITEMS.find((x) => x.id === id);
        return !!d && (!!d.food || id.includes('flower'));
      });
  }

  private rows(): Row[] {
    const done = (ui: GameUI, ok: boolean, fallback: string) => {
      const text = ui.live!.bubble?.text ?? fallback;
      ui.say(text, ok);
    };
    return [
      { label: t('carrierPanel.listen'), hint: '', run: (ui) => (ui.live!.listen(), done(ui, true, t('carrierPanel.hums'))) },
      { label: t('carrierPanel.greet'), hint: '', run: (ui) => done(ui, ui.live!.greetCarrier() || true, t('carrierPanel.hello')) },
      { label: t('carrierPanel.observe'), hint: '', run: (ui) => done(ui, !!ui.live!.observeCarrier(), t('carrierPanel.nothingNew')) },
      { label: t('carrierPanel.offer'), hint: '', run: (ui) => (this.offerable(ui).length ? ((this.offering = true), (this.offerIndex = 0)) : ui.say(t('carrierPanel.nothingToOffer'), false)) },
      { label: t('carrierPanel.rest'), hint: '', run: (ui) => (ui.live!.restByCarrier(), ui.close()) },
      { label: t('carrierPanel.growth'), hint: '', run: (ui) => ui.open('growth') },
    ];
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    if (this.offering) {
      const list = this.offerable(ui);
      const moved = moveSelection(code, this.offerIndex, list.length, 6);
      if (moved !== null) {
        this.offerIndex = moved;
        return true;
      }
      if (isConfirm(code) && list[this.offerIndex]) {
        const ok = ui.live!.offerToCarrier(list[this.offerIndex]);
        ui.say(ui.live!.bubble?.text ?? t(ok ? 'carrierPanel.offered' : 'carrierPanel.notTaken'), ok);
        this.offering = false;
        return true;
      }
      if (code === 'Backspace' || code === 'KeyX') {
        this.offering = false;
        return true;
      }
      return false;
    }
    const rows = this.rows();
    const moved = moveSelection(code, this.index, rows.length, 1);
    if (moved !== null) {
      this.index = moved;
      return true;
    }
    if (isConfirm(code)) {
      rows[this.index].run(ui);
      return true;
    }
    return false;
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const live = ui.live!;
    const palette = ui.palette();
    // Left: the interactions, or the offer picker.
    if (!this.offering) {
      this.rows().forEach((r, i) => {
        g.button(r.label, x, y + 2 + i * 14, () => ((this.index = i), r.run(ui)), { w: 104, primary: i === this.index });
      });
      g.para(t('carrierPanel.gentle'), x, y + 88, 104, UI.muted, 5);
    } else {
      g.text(upper(t('carrierPanel.offerWhat')), x, y + 2, UI.accent);
      const list = this.offerable(ui);
      list.forEach((item, i) => {
        const sx = x + (i % 6) * 17;
        const sy = y + 12 + Math.floor(i / 6) * 17;
        g.slot(sx, sy, 16, itemIcon(item, palette), live.inventory.count(item), { selected: i === this.offerIndex });
        g.hit(sx, sy, 16, 16, () => {
          if (this.offerIndex === i) {
            const ok = live.offerToCarrier(item);
            ui.say(live.bubble?.text ?? t('carrierPanel.offered'), ok);
            this.offering = false;
          } else this.offerIndex = i;
        }, itemLabel(item));
      });
      const sel = list[this.offerIndex];
      if (sel) g.text(upper(itemLabel(sel)).slice(0, 26), x, y + 14 + Math.ceil(list.length / 6) * 17, UI.ink);
      g.button(t('common.back'), x, y + h - 14, () => (this.offering = false), { w: 48 });
    }
    // Right: harmony, bond, likes, observations, growth.
    const rx = x + 112;
    const rw = w - 112;
    const hm = live.harmony();
    let cy = y + 2;
    g.text(upper(t('carrierPanel.harmony', { name: hm.name })), rx, cy, UI.accent);
    cy += 8;
    g.bar(rx, cy, rw - 24, hm.value / 100, hex('#7ee0b8'));
    g.text(`${hm.value}`, rx + rw - 20, cy + 1, UI.ink);
    cy += 8;
    // The level ladder, with a marker on the current one (not colour alone).
    HARMONY_LEVELS.forEach((l, i) => g.text(`${i === hm.level ? '*' : ' '}${upper(l.name)}`, rx + (i % 3) * 58, cy + Math.floor(i / 3) * 7, i === hm.level ? UI.accent : UI.muted));
    cy += 16;
    const p = hm.parts;
    g.text(upper(t('carrierPanel.parts', { bond: Math.round(p.bond), care: Math.round(p.care), wonder: Math.round(p.wonder), time: Math.round(p.time) })), rx, cy, UI.muted);
    cy += 9;
    g.para(t('carrierPanel.harmonyNote'), rx, cy, rw, UI.muted, 2);
    cy += 16;
    const c = live.carrier;
    g.text(upper(t('carrierPanel.observed', { n: c.observations.length, of: observationsFor(live.species).length, offers: c.counts.offer })), rx, cy, UI.ink);
    cy += 9;
    // Its likes appear once offered.
    const likes = live.carrierLikes;
    const known = likes.filter((l) => c.likesFound.includes(l));
    g.text(upper(t('carrierPanel.likes', { list: known.length ? known.map((l) => itemLabel(l)).join(', ') : t('carrierPanel.tryOffering') })).slice(0, 48), rx, cy, UI.ink);
    cy += 11;
    // The island's real growth (M7, world/growth.ts): its stage and what the next one needs (see the growth panel).
    const r = live.growthReadiness();
    g.text(upper(t('carrierPanel.stage', { n: live.growth.stage, of: MAX_GROWTH_STAGE })), rx, cy, UI.accent);
    cy += 8;
    g.para(r.blocked ?? (r.next ? t('carrierPanel.next', { name: r.name ?? '', pct: Math.round(r.progress * 100) }) : t('carrierPanel.grownAll')), rx, cy, rw, UI.muted, 4);
  }
}

