/**
 * WORLDS (Y): the islands this browser knows, to browse and visit (M7, local prototype). Each shows its name, its
 * World Carrier's species, its growth stage, its owner, and a small map preview (generated from its seed the first
 * time it is selected). VISIT starts the trip (the Blobbi teleports away, arrives there as a read-only visitor);
 * RETURN HOME brings it back. Other players' worlds (Nostr discovery) are designed, not available yet: the list
 * comes from a transport, so a network transport can fill it the same way later.
 */
import { t, upper } from '../../i18n';
import { PixelBuffer } from '../../core/pixel';
import { Gfx, UI } from '../gfx';
import { isConfirm, moveSelection, type GameUI, type Screen } from '../game-ui';
import type { WorldRef } from '../../game/visiting';
import type { WorldDescription } from '../../world/types';
import { mapImage } from './map';

export interface WorldsHooks {
  /** Worlds that can be visited now (never the current one). */
  list(): WorldRef[];
  /** The growth stage a world's save records (0 when none). */
  stageOf(ref: WorldRef): number;
  /** Generate a world for its preview (cached by the screen). */
  generate(ref: WorldRef): WorldDescription;
  /** The local player's id (owner labels). */
  player(): string;
  visit(ref: WorldRef): void;
  goHome(): void;
  /** Visiting now, and where. */
  visiting(): string | null;
}

export class WorldsScreen implements Screen {
  readonly id = 'worlds' as const;
  index = 0;
  hooks: WorldsHooks | null = null;
  private previews = new Map<string, PixelBuffer>();

  title(): string {
    return t('worlds.title');
  }

  opened(): void {
    this.index = 0;
  }

  private act(ui: GameUI): void {
    const h = this.hooks;
    if (!h) return;
    if (h.visiting()) {
      h.goHome();
      ui.close();
      return;
    }
    const ref = h.list()[this.index];
    if (!ref) return;
    if (ui.live?.interior) {
      ui.say(t('worlds.stepOutside'), false);
      return;
    }
    h.visit(ref);
    ui.close();
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    const n = this.hooks?.list().length ?? 0;
    const moved = moveSelection(code, this.index, n, 1);
    if (moved !== null) {
      this.index = moved;
      return true;
    }
    if (isConfirm(code)) {
      this.act(ui);
      return true;
    }
    return false;
  }

  private preview(ref: WorldRef): PixelBuffer {
    let p = this.previews.get(ref.identity);
    if (!p) {
      p = mapImage(this.hooks!.generate(ref), 120, 90);
      this.previews.set(ref.identity, p);
    }
    return p;
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const hooks = this.hooks;
    if (!hooks) {
      g.para(t('worlds.unavailable'), x, y + 2, w, UI.muted);
      return;
    }
    const away = hooks.visiting();
    if (away) {
      g.text(upper(t('worlds.visiting', { name: away })), x, y + 2, UI.accent);
      g.para(t('worlds.visitorNote'), x, y + 12, 150, UI.muted, 6);
      g.button(t('worlds.returnHome'), x, y + 60, () => this.act(ui), { w: 110, primary: true });
      return;
    }
    const list = hooks.list();
    this.index = Math.max(0, Math.min(this.index, list.length - 1));
    if (!list.length) {
      g.para(t('worlds.none'), x, y + 2, w, UI.muted, 6);
      return;
    }
    const lw = 156;
    list.slice(0, 8).forEach((ref, i) => {
      const ry = y + 2 + i * 17;
      const sel = i === this.index;
      g.box(x, ry, lw, 16, sel ? UI.slotHi : UI.panel, sel ? UI.accent : null);
      g.text(upper(ref.name), x + 3, ry + 2, sel ? UI.accent : UI.ink);
      const species = t(ref.params.kind === 'manta' ? 'carrier.manta.short' : ref.params.kind === 'whale' ? 'carrier.whale.short' : 'carrier.turtle.short');
      const owner = t(ref.owner === hooks.player() ? 'worlds.yours' : ref.owner ? 'worlds.anotherPlayer' : 'worlds.thisBrowser');
      g.text(upper(t('worlds.row', { species, n: hooks.stageOf(ref), owner })), x + 3, ry + 9, UI.muted);
      g.hit(x, ry, lw, 16, () => (this.index === i ? this.act(ui) : (this.index = i)), t('worlds.visitTip'));
    });
    const sel = list[this.index];
    const px = x + lw + 6;
    if (sel) {
      g.buf.blit(this.preview(sel), px, y + 2);
      g.buf.strokeRect(px - 1, y + 1, 122, 92, UI.line);
      g.button(t('worlds.visit'), px, y + 98, () => this.act(ui), { w: 60, primary: true });
      g.para(t('worlds.visitNote'), px, y + 112, w - lw - 6, UI.muted, 5);
    }
    g.para(t('worlds.otherPlayers'), x, y + h - 8, w, UI.muted, 1);
  }
}
