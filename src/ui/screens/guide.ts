/**
 * THE PLAYER GUIDE (M8): short pages about every system the game has (`content/guide.ts`). A list of topics on the
 * left, the page on the right. UP/DOWN (or a click, or a tap) choose a topic; on Tips, ENTER turns tips on or off.
 */
import { Gfx, UI } from '../gfx';
import { isConfirm, moveSelection, type GameUI, type Screen } from '../game-ui';
import { GUIDE_PAGES } from '../../content/guide';
import { tutorialProgress } from '../../game/tutorial';
import { t, upper } from '../../i18n';

export class GuideScreen implements Screen {
  readonly id = 'guide' as const;
  index = 0;

  title(): string {
    return t('guide.title');
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    const moved = moveSelection(code, this.index, GUIDE_PAGES.length, 1);
    if (moved !== null) {
      this.index = moved;
      return true;
    }
    if (isConfirm(code) && GUIDE_PAGES[this.index].id === 'tips') {
      this.toggleTips(ui);
      return true;
    }
    return false;
  }

  private toggleTips(ui: GameUI): void {
    const live = ui.live;
    if (!live || live.visitor) return;
    live.setTips(live.tutorial.skipped);
    ui.say(t(live.tutorial.skipped ? 'guide.tipsOff' : 'guide.tipsOn'));
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const listW = 86;
    GUIDE_PAGES.forEach((p, i) => {
      const sel = i === this.index;
      const ry = y + i * 9;
      if (sel) g.box(x, ry - 1, listW, 9, UI.slotHi, UI.accent);
      g.text(upper(p.title), x + 3, ry + 1, sel ? UI.accent : UI.ink);
      g.hit(x, ry - 1, listW, 9, () => (this.index = i));
    });
    const page = GUIDE_PAGES[this.index];
    const px = x + listW + 8;
    const pw = w - listW - 8;
    g.text(upper(page.title), px, y, UI.accent);
    let cy = y + 10 + g.para(page.text, px, y + 10, pw, UI.ink, 18);
    if (page.id === 'tips' && ui.live && !ui.live.visitor) {
      const tut = ui.live.tutorial;
      const p = tutorialProgress(tut);
      g.text(upper(t('guide.tipsDone', { n: p.done, of: p.total })), px, cy + 4, UI.muted);
      g.button(t(tut.skipped ? 'guide.turnOn' : 'guide.turnOff'), px, cy + 14, () => this.toggleTips(ui), { w: 96, primary: tut.skipped });
      cy += 26;
    }
    void h;
  }
}
