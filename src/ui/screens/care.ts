/**
 * THE BLOBBI PANEL: who it is, how it is doing (fed, energy, joy), how close you are (friendship), what it likes
 * (favourites appear once tried), and quick actions (feed, pet, rest). Opening it never changes anything.
 */
import { BUILDINGS } from '../../game/buildings';
import { describeSource } from '../../blobbi/source';
import { FRIEND_LEVELS, FRIEND_TITLES, friendLevel, toNextLevel } from '../../game/friendship';
import { isHungry, isTired, mood } from '../../game/care';
import { itemLabel } from '../../game/items';
import { itemIcon } from '../icons';
import { Gfx, UI } from '../gfx';
import { hex } from '../../core/color';
import type { GameUI, Screen } from '../game-ui';

export class CareScreen implements Screen {
  readonly id = 'care' as const;

  title(ui: GameUI): string {
    return `Blobbi  ${describeSource(ui.live!.blobbi.source)}`.slice(0, 60);
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    const live = ui.live!;
    if (code === 'KeyF') live.feed() ? ui.say(live.bubble?.text ?? 'yum') : ui.say(live.bubble?.text ?? 'no food', false);
    else if (code === 'KeyH') live.pet() ? ui.say('Blobbi loves the attention') : ui.say('Blobbi is happy you are here');
    else if (code === 'KeyR') (live.rest(), ui.close());
    else return false;
    return true;
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const live = ui.live!;
    const c = live.care;
    const comp = live.companion;
    let cy = y + 2;
    const bar = (label: string, v: number, colour: number, note = '') => {
      g.text(label, x, cy + 1, UI.muted);
      g.bar(x + 44, cy, 90, v / 100, colour);
      g.text(`${Math.round(v)}${note ? '  ' + note : ''}`.toUpperCase(), x + 140, cy + 1, note ? UI.bad : UI.ink);
      cy += 10;
    };
    bar('FED', c.hunger, hex('#ffb13b'), isHungry(c) ? 'hungry' : '');
    bar('ENERGY', c.energy, hex('#7ab8ff'), isTired(c) ? 'tired' : '');
    bar('JOY', c.happiness, hex('#ff7cc4'));
    const m = mood(c);
    g.text(`FEELING  ${(m ?? 'calm').toUpperCase()}${live.brain.state === 'rest' ? '  (ASLEEP)' : ''}`, x, cy + 1, UI.ink);
    cy += 14;
    // Friendship.
    const lv = friendLevel(comp.friendship);
    g.text(`FRIENDSHIP  LEVEL ${lv}: ${FRIEND_TITLES[lv - 1].toUpperCase()}`, x, cy, UI.accent);
    cy += 8;
    const lo = FRIEND_LEVELS[lv - 1];
    const hi = FRIEND_LEVELS[lv] ?? lo;
    g.bar(x, cy, 134, hi > lo ? (comp.friendship - lo) / (hi - lo) : 1, hex('#ff6b9a'));
    g.text(toNextLevel(comp.friendship) ? `${toNextLevel(comp.friendship)} TO NEXT` : 'MAX', x + 140, cy + 1, UI.muted);
    cy += 12;
    // Tastes: favourite foods are revealed by trying them; the favourite thing at friendship level 2.
    g.text('FAVOURITE FOODS', x, cy, UI.muted);
    cy += 8;
    for (const f of live.tastes.foods) {
      const known = comp.tasted.has(f);
      if (known) g.buf.blit(itemIcon(f, ui.palette()), x, cy - 2);
      g.text(known ? itemLabel(f).toUpperCase() : '??? (TRY FEEDING NEW THINGS)', x + (known ? 18 : 0), cy + 2, known ? UI.good : UI.muted);
      cy += 14;
    }
    g.text(`LOVES TO VISIT  ${lv >= 2 ? (BUILDINGS[live.tastes.thing]?.label ?? live.tastes.thing).toUpperCase() : '??? (FRIENDSHIP 2)'}`, x, cy, lv >= 2 ? UI.good : UI.muted);
    cy += 10;
    g.text(`FOODS TRIED  ${comp.tasted.size}`, x, cy, UI.muted);
    // Actions.
    const bx = x + w - 92;
    let by = y + 2;
    for (const [label, key] of [['FEED (F)', 'KeyF'], ['PET (H)', 'KeyH'], [live.brain.state === 'rest' ? 'WAKE (R)' : 'REST (R)', 'KeyR']] as const) {
      g.button(label, bx, by, () => this.key(key, false, ui), { w: 90, primary: key === 'KeyF' });
      by += 14;
    }
    g.para('Friendship grows with attention, food (favourites most), meals, rest and finished quests. It never goes down.', bx, by + 6, 90, UI.muted, 9);
    void h;
  }
}
