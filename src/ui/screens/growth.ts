/**
 * THE GROWTH PANEL (L, or from the Carrier panel): the island's growth stage, progress toward the next one with every
 * requirement (each marked DONE or with its count, never by colour alone), what the next stage adds, and the new
 * land already grown. When the island is ready, LET THE ISLAND GROW asks once more, then grows it (the playground
 * rebuilds the world from the save and plays the reveal). Nothing grows by itself.
 */
import { BIOMES, GROWTH_STAGES } from '../../world/growth';
import { Gfx, UI } from '../gfx';
import { hex } from '../../core/color';
import { isConfirm, type GameUI, type Screen } from '../game-ui';
import type { GrowthReadiness } from '../../game/growth-progress';

/** What a press on the growth button says while the island is not ready: how many needs are left, and the first. */
export function notReadyMessage(r: GrowthReadiness): string {
  const left = r.requirements.filter((q) => q.have < q.need);
  if (r.blocked || !left.length) return 'not ready yet: see what the island still needs';
  const q = left[0];
  return `not ready yet: ${left.length} still needed, e.g. ${q.label.toLowerCase()} ${Math.min(q.have, q.need)}/${q.need}`;
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
    return `Island growth  stage ${ui.live!.growth.stage} of 3`;
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
      g.text('THE ISLAND HAS GROWN AS FAR AS IT CAN (FOR NOW)', x, cy, UI.accent);
      cy += 12;
    } else {
      g.text(`NEXT: STAGE ${r.next}  ${r.name!.toUpperCase()}`, x, cy, UI.accent);
      cy += 9;
      g.bar(x, cy, lw - 26, r.progress, hex('#7ee0b8'));
      g.text(`${Math.round(r.progress * 100)}%`, x + lw - 22, cy + 1, UI.ink);
      cy += 9;
      for (const q of r.requirements) {
        const done = q.have >= q.need;
        g.text(done ? 'DONE' : `${Math.min(q.have, q.need)}/${q.need}`, x, cy, done ? UI.good : UI.muted);
        g.text(q.label.toUpperCase().slice(0, 30), x + 24, cy, done ? UI.ink : UI.muted);
        cy += 8;
      }
      cy += 3;
      g.text('WILL ADD', x, cy, UI.accent);
      g.text(r.unlocks.join(' + ').toUpperCase().slice(0, 34), x + 36, cy, UI.ink);
      cy += 11;
      const label = this.confirming ? 'SURE? ENTER TO GROW' : r.ready ? 'LET THE ISLAND GROW' : 'NOT READY YET';
      // Not ready: the button stays muted, and a press says what is still missing (never closes the panel).
      g.button(label, x, cy, () => this.grow(ui), { w: lw, primary: r.ready, enabled: r.ready, whyNot: () => this.grow(ui) });
      cy += 14;
      g.para('Nothing grows by itself and nothing is lost by waiting: the island only grows when you choose. Existing land, buildings and crops never move.', x, cy, lw, UI.muted, 4);
    }
    // Right: the land that has grown so far.
    const rx = x + lw + 8;
    const rw = w - lw - 8;
    let ry = y + 2;
    g.text('GROWN LAND', rx, ry, UI.accent);
    ry += 9;
    const grown = live.world.growth;
    if (!grown) ry += g.para('None yet. The island is as it was born. Growth adds new land round it: meadows, groves, stones, shore and moss.', rx, ry, rw, UI.muted, 5);
    else
      for (const reg of grown.regions) {
        const place = live.places.find((p) => p.id === `region:${reg.id}`);
        const seen = place && live.visited.has(place.id);
        g.text(`S${reg.stage} ${BIOMES[reg.biome].name.toUpperCase()}`, rx, ry, UI.ink);
        g.text(seen ? 'VISITED' : 'NEW', rx + rw - 30, ry, seen ? UI.muted : UI.good);
        ry += 8;
      }
    ry += 4;
    g.text('STAGES', rx, ry, UI.accent);
    ry += 8;
    for (const s of GROWTH_STAGES) {
      const reached = live.growth.stage >= s.stage;
      g.text(`${reached ? '*' : ' '}${s.stage} ${s.name.toUpperCase()}`.slice(0, 30), rx, ry, reached ? UI.accent : UI.muted);
      ry += 8;
    }
    void h;
  }
}
