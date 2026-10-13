/**
 * THE GROWTH PANEL (L, or from the Carrier panel): the island's growth stage, progress toward the next one with every
 * requirement (each marked DONE or with its count, never by colour alone), what the next stage adds, and the new
 * land already grown. When the island is ready, LET THE ISLAND GROW asks once more, then grows it (the playground
 * rebuilds the world from the save and plays the reveal). Nothing grows by itself.
 */
import { BIOMES, GROWTH_STAGES, MAX_GROWTH_STAGE } from '../../world/growth';
import { Gfx, UI } from '../gfx';
import { hex } from '../../core/color';
import { isConfirm, type GameUI, type Screen } from '../game-ui';
import { fitText } from './crafting';
import type { GrowthReadiness } from '../../game/growth-progress';
import { t, upper } from '../../i18n';

/** What a press on the growth button says while the island is not ready: how many needs are left, and the first. */
export function notReadyMessage(r: GrowthReadiness): string {
  const left = r.requirements.filter((q) => q.have < q.need);
  if (r.blocked || !left.length) return t('growth.notReady');
  const q = left[0];
  return t('growth.notReadyLeft', { count: left.length, what: q.label.toLocaleLowerCase(), have: Math.min(q.have, q.need), need: q.need });
}

export class GrowthScreen implements Screen {
  readonly id = 'growth' as const;
  /** The confirmation step before growing. */
  confirming = false;
  /**
   * Called to grow (the playground rebuilds the world and plays the reveal). Returns false when the island did not
   * grow (the caller has said why with `ui.say`), and the panel then stays open so the reason can be read.
   */
  onGrow: (() => boolean) | null = null;

  title(ui: GameUI): string {
    return t('growth.title', { n: ui.live!.growth.stage, of: MAX_GROWTH_STAGE });
  }

  opened(): void {
    this.confirming = false;
  }

  private grow(ui: GameUI): void {
    const r = ui.live!.growthReadiness();
    if (!r.ready) {
      ui.say(notReadyMessage(r), false);
      return;
    }
    if (!this.confirming) {
      this.confirming = true;
      return;
    }
    this.confirming = false;
    const grown = this.onGrow ? this.onGrow() : ui.live!.growIsland() !== null;
    if (grown) ui.close();
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    if (isConfirm(code)) {
      this.grow(ui);
      return true;
    }
    if (code === 'Backspace' && this.confirming) {
      this.confirming = false;
      return true;
    }
    return false;
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const live = ui.live!;
    const r = live.growthReadiness();
    const lw = 150;
    let cy = y + 2;
    if (r.blocked) {
      g.para(r.blocked, x, cy, w, UI.muted);
      return;
    }
    if (!r.next) {
      g.text(upper(t('growth.grownAll')), x, cy, UI.accent);
      cy += 12;
    } else {
      g.text(upper(t('growth.next', { n: r.next, name: r.name! })), x, cy, UI.accent);
      cy += 9;
      g.bar(x, cy, lw - 26, r.progress, hex('#7ee0b8'));
      g.text(`${Math.round(r.progress * 100)}%`, x + lw - 22, cy + 1, UI.ink);
      cy += 9;
      for (const q of r.requirements) {
        const done = q.have >= q.need;
        g.text(done ? upper(t('growth.done')) : `${Math.min(q.have, q.need)}/${q.need}`, x, cy, done ? UI.good : UI.muted);
        g.text(fitText(g, upper(q.label), lw - 26), x + 24, cy, done ? UI.ink : UI.muted);
        cy += 8;
      }
      cy += 3;
      const addW = g.text(upper(t('growth.willAdd')), x, cy, UI.accent) + 5;
      g.text(fitText(g, upper(r.unlocks.join(' + ')), lw - addW), x + addW, cy, UI.ink);
      cy += 11;
      const label = t(this.confirming ? 'growth.sure' : r.ready ? 'growth.grow' : 'growth.notReadyButton');
      // Not ready: the button stays muted, and a press says what is still missing (never closes the panel).
      g.button(label, x, cy, () => this.grow(ui), { w: lw, primary: r.ready, enabled: r.ready, whyNot: () => this.grow(ui) });
      cy += 14;
      g.para(t('growth.note'), x, cy, lw, UI.muted, 3);
    }
    // Right: the land that has grown so far.
    const rx = x + lw + 8;
    const rw = w - lw - 8;
    let ry = y + 2;
    g.text(upper(t('growth.grownLand')), rx, ry, UI.accent);
    ry += 9;
    const grown = live.world.growth;
    if (!grown) ry += g.para(t('growth.noneYet'), rx, ry, rw, UI.muted, 5);
    else
      for (const reg of grown.regions) {
        const place = live.places.find((p) => p.id === `region:${reg.id}`);
        const seen = place && live.visited.has(place.id);
        const tag = upper(t(seen ? 'growth.visited' : 'growth.new'));
        const tagW = g.measure(tag);
        g.text(fitText(g, upper(`${reg.stage} ${BIOMES[reg.biome].name}`), rw - tagW - 4), rx, ry, UI.ink);
        g.text(tag, rx + rw - tagW, ry, seen ? UI.muted : UI.good);
        ry += 8;
      }
    ry += 4;
    g.text(upper(t('growth.stages')), rx, ry, UI.accent);
    ry += 8;
    for (const s of GROWTH_STAGES) {
      const reached = live.growth.stage >= s.stage;
      g.text(fitText(g, upper(`${reached ? '*' : ' '}${s.stage} ${s.name}`), rw), rx, ry, reached ? UI.accent : UI.muted);
      ry += 8;
    }
    void h;
  }
}
