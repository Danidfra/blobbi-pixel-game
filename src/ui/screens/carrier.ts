/**
 * THE CARRIER PANEL (E at the shore by the turtle's head, once the Carrier is known): the gentle interactions on
 * the left (listen, greet, observe, offer, rest), and on the right the island's harmony, the bond, the Carrier's
 * likes once discovered, and the island's growth stage (M7: ISLAND GROWTH opens the growth panel).
 */
import { HARMONY_LEVELS, observationsFor } from '../../game/carrier';
import { ALL_ITEMS, itemLabel } from '../../game/items';
import { itemIcon } from '../icons';
import { Gfx, UI } from '../gfx';
import { hex } from '../../core/color';
import { isConfirm, moveSelection, type GameUI, type Screen } from '../game-ui';

type Row = { label: string; hint: string; run: (ui: GameUI) => void };

export class CarrierScreen implements Screen {
  readonly id = 'carrier' as const;
  index = 0;
  /** The offer picker: open, and which stack. */
  offering = false;
  offerIndex = 0;

  title(): string {
    return 'The World Carrier';
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
      { label: 'LISTEN', hint: 'the hum', run: (ui) => (ui.live!.listen(), done(ui, true, 'the island hums')) },
      { label: 'GREET', hint: 'once a day', run: (ui) => done(ui, ui.live!.greetCarrier() || true, 'hello!') },
      { label: 'OBSERVE', hint: 'one thing at a time', run: (ui) => done(ui, !!ui.live!.observeCarrier(), 'nothing new right now') },
      { label: 'OFFER SOMETHING', hint: 'food or flower', run: (ui) => (this.offerable(ui).length ? ((this.offering = true), (this.offerIndex = 0)) : ui.say('nothing to offer: food or flowers', false)) },
      { label: 'REST HERE', hint: 'a nap by the head', run: (ui) => (ui.live!.restByCarrier(), ui.close()) },
      { label: 'ISLAND GROWTH', hint: 'stage and progress', run: (ui) => ui.open('growth') },
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
        ui.say(ui.live!.bubble?.text ?? (ok ? 'offered' : 'not taken'), ok);
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
      g.para('Everything here is gentle: the Carrier is never upset, and nothing is lost by waiting.', x, y + 76, 104, UI.muted, 5);
    } else {
      g.text('OFFER WHAT?', x, y + 2, UI.accent);
      const list = this.offerable(ui);
      list.forEach((item, i) => {
        const sx = x + (i % 6) * 17;
        const sy = y + 12 + Math.floor(i / 6) * 17;
        g.slot(sx, sy, 16, itemIcon(item, palette), live.inventory.count(item), { selected: i === this.offerIndex });
        g.hit(sx, sy, 16, 16, () => {
          if (this.offerIndex === i) {
            const ok = live.offerToCarrier(item);
            ui.say(live.bubble?.text ?? 'offered', ok);
            this.offering = false;
          } else this.offerIndex = i;
        }, itemLabel(item));
      });
      const sel = list[this.offerIndex];
      if (sel) g.text(itemLabel(sel).toUpperCase().slice(0, 26), x, y + 14 + Math.ceil(list.length / 6) * 17, UI.ink);
      g.button('BACK', x, y + h - 14, () => (this.offering = false), { w: 40 });
    }
    // Right: harmony, bond, likes, observations, growth.
    const rx = x + 112;
    const rw = w - 112;
    const hm = live.harmony();
    let cy = y + 2;
    g.text(`ISLAND HARMONY  ${hm.name.toUpperCase()}`, rx, cy, UI.accent);
    cy += 8;
    g.bar(rx, cy, rw - 24, hm.value / 100, hex('#7ee0b8'));
    g.text(`${hm.value}`, rx + rw - 20, cy + 1, UI.ink);
    cy += 8;
    // The level ladder, with a marker on the current one (not colour alone).
    HARMONY_LEVELS.forEach((l, i) => g.text(`${i === hm.level ? '*' : ' '}${l.name.toUpperCase()}`, rx + (i % 3) * 58, cy + Math.floor(i / 3) * 7, i === hm.level ? UI.accent : UI.muted));
    cy += 16;
    const p = hm.parts;
    g.text(`BOND ${Math.round(p.bond)}  CARE ${Math.round(p.care)}  WONDER ${Math.round(p.wonder)}  TIME ${Math.round(p.time)}`, rx, cy, UI.muted);
    cy += 9;
    g.para('Harmony only grows: bond, care for the island, discoveries and days together.', rx, cy, rw, UI.muted, 2);
    cy += 16;
    const c = live.carrier;
    g.text(`OBSERVED ${c.observations.length}/${observationsFor(live.species).length}   OFFERINGS ${c.counts.offer}`, rx, cy, UI.ink);
    cy += 9;
    // Its likes appear once offered.
    const likes = live.carrierLikes;
    const known = likes.filter((l) => c.likesFound.includes(l));
    g.text(`LIKES  ${known.length ? known.map((l) => itemLabel(l).toUpperCase()).join(', ') : '??? (TRY OFFERING THINGS)'}`.slice(0, 48), rx, cy, UI.ink);
    cy += 11;
    // The island's real growth (M7, world/growth.ts): its stage and what the next one needs (see the growth panel).
    const r = live.growthReadiness();
    g.text(`ISLAND GROWTH  STAGE ${live.growth.stage} OF 3`, rx, cy, UI.accent);
    cy += 8;
    g.para(r.blocked ?? (r.next ? `Next: ${r.name} (${Math.round(r.progress * 100)}% ready). Open ISLAND GROWTH (L) for what it needs.` : 'The island has grown as far as it can for now.'), rx, cy, rw, UI.muted, 4);
  }
}

