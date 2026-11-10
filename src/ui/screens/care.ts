/**
 * THE BLOBBI PANEL: who it is, how it is doing (fed, energy, joy), how close you are (friendship), what it likes
 * (favourites appear once tried), and quick actions (feed, pet, rest). Opening it never changes anything.
 */
import { BUILDINGS } from '../../game/buildings';
import { describeSource } from '../../blobbi/source';
import { FRIEND_LEVELS, FRIEND_TITLES, friendLevel, toNextLevel } from '../../game/friendship';
import { isHungry, isTired, mood, isGrubby } from '../../game/care';
import { itemLabel } from '../../game/items';
import { itemIcon } from '../icons';
import { Gfx, UI } from '../gfx';
import { hex } from '../../core/color';
import type { GameUI, Screen } from '../game-ui';
import { buildingNoun } from '../../content/text';
import { t, upper } from '../../i18n';
import type { SharedCareSnapshot } from '../../game/shared-care';
import type { BlobbiSource } from '../../blobbi/source';

/** The shared (canonical) care of the Blobbi walking here, read only; the host wires the reader (phase 6). */
export interface SharedCareHooks {
  snapshot(): SharedCareSnapshot;
  nowSec(): number;
  refresh(source: BlobbiSource): void;
}

export class CareScreen implements Screen {
  readonly id = 'care' as const;
  /** The shared care reader, when the host offers one; without it the panel says the stats are not shared. */
  shared: SharedCareHooks | null = null;

  opened(ui: GameUI): void {
    if (ui.live) this.shared?.refresh(ui.live.blobbi.source);
  }

  title(ui: GameUI): string {
    return t('care.title', { source: describeSource(ui.live!.blobbi.source) }).slice(0, 60);
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    const live = ui.live!;
    if (code === 'KeyF') live.feed() ? ui.say(live.bubble?.text ?? t('care.yum')) : ui.say(live.bubble?.text ?? t('care.noFood'), false);
    else if (code === 'KeyH') live.pet() ? ui.say(t('care.lovesAttention')) : ui.say(t('care.happyYouAreHere'));
    else if (code === 'KeyR') (live.rest(), ui.close());
    else return false;
    return true;
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const live = ui.live!;
    const c = live.care;
    const comp = live.companion;
    let cy = y + 2;
    // These are the island's own needs (what the Blobbi does here), not the Blobbi's shared care stats: say so.
    g.text(upper(t('care.localNeeds')), x, cy + 1, UI.muted);
    cy += 9;
    const bar = (label: string, v: number, colour: number, note = '') => {
      g.text(upper(label), x, cy + 1, UI.muted);
      g.bar(x + 44, cy, 90, v / 100, colour);
      g.text(upper(`${Math.round(v)}${note ? '  ' + note : ''}`), x + 140, cy + 1, note ? UI.bad : UI.ink);
      cy += 10;
    };
    bar(t('care.fed'), c.hunger, hex('#ffb13b'), isHungry(c) ? t('care.hungry') : '');
    bar(t('care.energy'), c.energy, hex('#7ab8ff'), isTired(c) ? t('care.tired') : '');
    bar(t('care.joy'), c.happiness, hex('#ff7cc4'));
    bar(t('care.clean'), c.hygiene, hex('#7fd0c4'), isGrubby(c) ? t('care.grubby') : '');
    const m = mood(c);
    g.text(upper(`${t('care.feeling', { mood: t(`mood.${m ?? 'calm'}`) })}${live.brain.state === 'rest' ? `  ${t('care.asleep')}` : ''}`), x, cy + 1, UI.ink);
    cy += 14;
    // Friendship.
    const lv = friendLevel(comp.friendship);
    g.text(upper(t('care.friendship', { n: lv, title: FRIEND_TITLES[lv - 1] })), x, cy, UI.accent);
    cy += 8;
    const lo = FRIEND_LEVELS[lv - 1];
    const hi = FRIEND_LEVELS[lv] ?? lo;
    g.bar(x, cy, 134, hi > lo ? (comp.friendship - lo) / (hi - lo) : 1, hex('#ff6b9a'));
    g.text(upper(toNextLevel(comp.friendship) ? t('care.toNext', { n: toNextLevel(comp.friendship) }) : t('care.max')), x + 140, cy + 1, UI.muted);
    cy += 12;
    // Tastes: favourite foods are revealed by trying them; the favourite thing at friendship level 2.
    g.text(upper(t('care.favouriteFoods')), x, cy, UI.muted);
    cy += 8;
    for (const f of live.tastes.foods) {
      const known = comp.tasted.has(f);
      if (known) g.buf.blit(itemIcon(f, ui.palette()), x, cy - 2);
      g.text(upper(known ? itemLabel(f) : t('care.tryFeeding')), x + (known ? 18 : 0), cy + 2, known ? UI.good : UI.muted);
      cy += 14;
    }
    g.text(upper(t('care.lovesToVisit', { what: lv >= 2 ? (BUILDINGS[live.tastes.thing] ? buildingNoun(live.tastes.thing).name : live.tastes.thing) : t('care.friendship2') })), x, cy, lv >= 2 ? UI.good : UI.muted);
    cy += 10;
    g.text(upper(t('care.foodsTried', { n: comp.tasted.size })), x, cy, UI.muted);
    // Actions.
    const bx = x + w - 92;
    let by = y + 2;
    for (const [label, key] of [[`${t('care.feed')} (F)`, 'KeyF'], [`${t('care.pet')} (H)`, 'KeyH'], [`${t(live.brain.state === 'rest' ? 'care.wake' : 'care.rest')} (R)`, 'KeyR']] as const) {
      g.button(label, bx, by, () => this.key(key, false, ui), { w: 90, primary: key === 'KeyF' });
      by += 14;
    }
    by += 6 + g.para(t('care.note'), bx, by + 6, 90, UI.muted, 9);
    this.drawShared(g, bx, by + 6, Math.max(0, y + h - (by + 6)));
  }

  /**
   * The Blobbi's shared care (the five stats the Blobbi apps keep together: hunger, happiness, health, hygiene,
   * energy), read from the relays and shown as they stand by the apps' own decay; never changed here. A demo or
   * seed-only Blobbi has none; without an answer the panel says so rather than showing a number.
   */
  private drawShared(g: Gfx, x: number, y: number, h: number): void {
    const s = this.shared?.snapshot() ?? null;
    let cy = y;
    g.text(upper(t('care.shared')), x, cy, UI.accent);
    cy += 8;
    const status = s?.status ?? 'none';
    const care = s?.care ?? null;
    if (care && h >= 56) {
      const now = this.shared!.nowSec();
      const v = care.project(now);
      const rows: [string, keyof typeof v, number][] = [
        [t('care.hunger'), 'hunger', hex('#ffb13b')],
        [t('care.happiness'), 'happiness', hex('#ff7cc4')],
        [t('care.health'), 'health', hex('#8fe26f')],
        [t('care.hygiene'), 'hygiene', hex('#7fd0c4')],
        [t('care.energy'), 'energy', hex('#7ab8ff')],
      ];
      for (const [label, key, colour] of rows) {
        const known = care.stats[key] !== undefined;
        g.text(upper(label), x, cy + 1, UI.muted);
        g.bar(x + 42, cy, 30, known ? v[key] / 100 : 0, colour);
        g.text(known ? String(Math.round(v[key])) : '?', x + 75, cy + 1, status === 'ready' ? UI.ink : UI.muted);
        cy += 8;
      }
    }
    let line: string;
    if (status === 'none') line = t('care.sharedNone');
    else if (status === 'loading') line = t('care.sharedLoading');
    else if (status === 'unavailable') line = t('care.sharedOffline');
    else if (status === 'missing') line = t('care.sharedMissing');
    else {
      const minutes = s?.fetchedAt ? Math.floor((this.shared!.nowSec() - s.fetchedAt / 1000) / 60) : 0;
      line = minutes < 1 ? t('care.readNow') : t('care.readAgo', { n: minutes });
      if (care?.state === 'sleeping') line += `  ${t('care.asleep')}`;
    }
    if (s?.partial && (status === 'ready' || status === 'missing')) line += `  ${t('care.sharedPartial')}`;
    g.para(upper(line), x, cy + 1, 90, UI.muted, 2);
  }
}
