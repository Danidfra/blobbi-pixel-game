/**
 * WORLD TRAVEL (Y): the other Blobbi worlds, as cards with each app's own icon. VISIT starts the trip
 * (`src/game/travel-departure.ts`): the island is saved, the Blobbi teleports away while its owner's move is signed
 * and published from here, and the page goes to the other world. The words say what happens to the Blobbi: it comes
 * along (a move can be made here), or it stays where it is for now (no account, world travel off, the place not
 * confirmed, the signer not ready: the other world asks when it opens). The islands in this browser (M7's local
 * visiting) keep their own screen, reached from here.
 */
import { t, upper } from '../../i18n';
import { PixelBuffer } from '../../core/pixel';
import { hex } from '../../core/color';
import { UI, type Gfx } from '../gfx';
import { isConfirm, type GameUI, type Screen } from '../game-ui';
import { fromTemplate } from '../icons';
import type { BlobbiWorld } from '../../game/blobbi-worlds';

/** How the Blobbi takes part in the trip. */
export type Companion =
  /** A move can be made here: the Blobbi is in the destination by the time the page gets there. */
  | 'with'
  /** The extension has not confirmed the account: nothing can be signed now. */
  | 'signer'
  /** No account's own Blobbi travels (a guest, world travel off, the place not confirmed): it stays. */
  | 'stays';

export interface TravelHooks {
  worlds(): BlobbiWorld[];
  /** The walking Blobbi's name. */
  name(): string;
  companion(): Companion;
  /** Start the trip; 'busy' while one is under way, 'inside' when the Blobbi must step outside first. */
  go(world: BlobbiWorld): 'started' | 'busy' | 'inside';
  departing(): boolean;
  /** The world's icon at `size`, or null (the emblem is drawn). */
  icon(world: BlobbiWorld, size: number): PixelBuffer | null;
}

export const CARD_ICON = 32;

/** The emblem a card shows without its icon: the world's colours and a small glyph. */
const EMBLEMS: Record<BlobbiWorld['id'], readonly string[]> = {
  home: ['......aa......', '.....aaaa.....', '....aaaaaa....', '...aaaaaaaa...', '..aaaaaaaaaa..', '.aaaaaaaaaaaa.', '...bbbbbbbb...', '...bbbbbbbb...', '...bbbccbbb...', '...bbbccbbb...', '...bbbccbbb...', '...bbbccbbb...'],
  island: ['........dd....', '.......d..d...', '....dddd...d..', '...d...dd.....', '.......d......', '......ee......', '......ee......', '......ee......', '.....ee.......', '.....ee.......', '..ffffffffff..', '.ffffffffffff.'],
};
const EMBLEM_COLOURS = { a: '#e0607e', b: '#fff1dc', c: '#8a5a44', d: '#2fae5c', e: '#9a6b3e', f: '#f8dd91' };

export class TravelScreen implements Screen {
  readonly id = 'travel' as const;
  index = 0;
  hooks: TravelHooks | null = null;
  private emblems = new Map<string, PixelBuffer>();

  title(): string {
    return t('travel.menuTitle');
  }

  opened(): void {
    this.index = 0;
  }

  private act(ui: GameUI): void {
    const h = this.hooks;
    const world = h?.worlds()[this.index];
    if (!h || !world) return;
    const r = h.go(world);
    if (r === 'inside') ui.say(t('worlds.stepOutside'), false);
    else if (r === 'busy') ui.say(t('travel.menuBusy'), false);
    else ui.close();
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    const n = this.hooks?.worlds().length ?? 0;
    if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowUp' || code === 'KeyW') {
      this.index = (this.index + n - 1) % Math.max(1, n);
      return true;
    }
    if (code === 'ArrowRight' || code === 'KeyD' || code === 'ArrowDown' || code === 'KeyS' || code === 'Tab') {
      this.index = (this.index + 1) % Math.max(1, n);
      return true;
    }
    if (isConfirm(code)) {
      this.act(ui);
      return true;
    }
    return false;
  }

  private emblem(world: BlobbiWorld): PixelBuffer {
    let e = this.emblems.get(world.id);
    if (!e) {
      const glyph = fromTemplate(EMBLEMS[world.id], EMBLEM_COLOURS);
      const buf = new PixelBuffer(CARD_ICON, CARD_ICON);
      buf.fill(hex(world.colors[0]));
      buf.fillRect(0, CARD_ICON / 2, CARD_ICON, CARD_ICON / 2, hex(world.colors[1]));
      buf.blit(glyph, Math.floor((CARD_ICON - glyph.width) / 2), Math.floor((CARD_ICON - glyph.height) / 2));
      e = buf;
      this.emblems.set(world.id, e);
    }
    return e;
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const hooks = this.hooks;
    if (!hooks) {
      g.para(t('worlds.unavailable'), x, y + 2, w, UI.muted);
      return;
    }
    const name = hooks.name();
    const list = hooks.worlds();
    this.index = Math.max(0, Math.min(this.index, list.length - 1));
    g.para(t('travel.menuLead', { name }), x, y + 1, w, UI.muted, 1);
    const gap = 6;
    const cw = Math.floor((w - gap * (list.length - 1)) / Math.max(1, list.length));
    const ch = 80;
    const cy = y + 12;
    const departing = hooks.departing();
    list.forEach((world, i) => {
      const cx = x + i * (cw + gap);
      const sel = i === this.index;
      g.box(cx, cy, cw, ch, sel ? UI.slotHi : UI.panel, sel ? UI.accent : UI.line);
      const icon = hooks.icon(world, CARD_ICON) ?? this.emblem(world);
      g.buf.blit(icon, cx + 4, cy + 4);
      g.buf.strokeRect(cx + 3, cy + 3, CARD_ICON + 2, CARD_ICON + 2, sel ? UI.accent : UI.line);
      g.text(upper(world.name), cx + CARD_ICON + 9, cy + 6, sel ? UI.accent : UI.ink, 'title');
      g.para(t(`travel.world.${world.id}.tagline`), cx + CARD_ICON + 9, cy + 15, cw - CARD_ICON - 13, UI.muted, 3);
      g.para(t('travel.menuAddress', { host: hostOf(world.url) }), cx + 4, cy + 42, cw - 8, UI.muted, 1);
      g.button(departing ? t('travel.menuLeaving') : t('worlds.visit'), cx + 4, cy + ch - 15, () => ((this.index = i), this.act(ui)), { w: cw - 8, primary: sel, enabled: !departing });
      g.hit(cx, cy, cw, ch - 16, () => (this.index === i ? this.act(ui) : (this.index = i)), t('worlds.visitTip'));
    });
    const companion = hooks.companion();
    const note = companion === 'with' ? t('travel.menuWith', { name }) : companion === 'signer' ? t('travel.menuSigner', { name }) : t('travel.menuStays', { name });
    const ny = cy + ch + 5;
    g.para(note, x, ny, w - 4, companion === 'with' ? UI.good : UI.muted, 3);
    g.para(t('travel.menuEachApp'), x, ny + 19, w - 116, UI.muted, 2);
    g.button(t('travel.menuIslands'), x + w - 108, y + h - 13, () => ui.open('worlds'), { w: 108 });
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
