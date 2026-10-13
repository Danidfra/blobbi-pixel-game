/**
 * THE JOURNAL: quests (main story, side quests, discoveries, the island request) with their story, how to do
 * them, progress and reward; the notes found so far; the discoveries found (the rest as hints). Reading the
 * journal changes nothing in the world — except pinning (M10 phase C): one active side quest can be pinned to the
 * goal box (PIN, or P), and unpinned the same way.
 */
import { activeQuests, goalProgress, objectiveById, QUESTS, requestProgress, type Objective } from '../../game/objectives';
import { LORE, loreById } from '../../content/lore';
import { ALL_DISCOVERIES as DISCOVERY_CONTENT } from '../../content/discoveries';
import { itemIcon } from '../icons';
import { Gfx, UI } from '../gfx';
import { isConfirm, moveSelection, type GameUI, type Screen } from '../game-ui';
import { observationsFor, type Observation } from '../../game/carrier';
import type { Place } from '../../game/places';
import { FISH_CONTENT } from '../../content/tools';
import { placeText } from '../../content/text';
import { sentence, t, upper, type MessageKey } from '../../i18n';
import { fitText } from './crafting';

type Tab = 'quests' | 'notes' | 'finds' | 'fish' | 'places' | 'carrier';
const TABS: readonly Tab[] = ['quests', 'notes', 'finds', 'fish', 'places', 'carrier'];
const ROW = 10;
const TAB_LABEL: Record<Tab, MessageKey> = { quests: 'journal.tab.quests', notes: 'journal.tab.notes', finds: 'journal.tab.finds', fish: 'journal.tab.fish', places: 'journal.tab.places', carrier: 'journal.tab.carrier' };

interface Row {
  label: string;
  colour: number;
  quest?: Objective;
  request?: boolean;
  note?: string;
  find?: (typeof DISCOVERY_CONTENT)[number];
  place?: Place;
  observation?: Observation;
  /** M10 phase B: a fish species in the fish log. */
  fish?: (typeof FISH_CONTENT)[number];
}

export class JournalScreen implements Screen {
  readonly id = 'journal' as const;
  tab: Tab = 'quests';
  index = 0;

  title(ui: GameUI): string {
    const live = ui.live!;
    return t('journal.title', { quests: `${Object.keys(live.objectives.completed).length}/${QUESTS.length}`, notes: `${(live.objectives.lore ?? []).length}/${LORE.length}`, finds: `${live.found.size}/${DISCOVERY_CONTENT.length}`, fish: `${live.caught.size}/${FISH_CONTENT.length}`, places: `${live.visited.size}/${live.places.length}` });
  }

  opened(ui: GameUI): void {
    this.index = 0;
    if (ui.noteToShow) {
      const note = ui.live?.noteFor(ui.noteToShow);
      ui.noteToShow = null;
      if (note) {
        this.tab = 'notes';
        this.index = Math.max(0, this.rows(ui).findIndex((r) => r.note === note));
      }
    }
  }

  rows(ui: GameUI): Row[] {
    const live = ui.live!;
    const st = live.objectives;
    if (this.tab === 'quests') {
      const out: Row[] = [];
      const req = requestProgress(st, live.tally);
      if (req) out.push({ label: t('journal.request', { title: req.request.title, have: req.have, need: req.need }), colour: UI.good, request: true });
      for (const q of activeQuests(st)) out.push({ label: `${q.type === 'main' ? `${q.chapter}.` : t(q.type === 'side' ? (live.pinnedQuest === q.id ? 'journal.pinned' : 'journal.side') : 'journal.find')} ${q.title}`, colour: q.type === 'main' ? UI.accent : live.pinnedQuest === q.id ? UI.good : UI.ink, quest: q });
      for (const id of Object.keys(st.completed)) {
        const q = objectiveById(id);
        if (q) out.push({ label: t('journal.done', { title: q.title }), colour: UI.muted, quest: q });
      }
      return out;
    }
    if (this.tab === 'notes') return (st.lore ?? []).map((id) => ({ label: loreById(id)?.title ?? id, colour: UI.ink, note: id }));
    // Places: the visited ones by name; the rest stay unnamed (how many is no secret, where is).
    if (this.tab === 'places') return live.places.map((p) => (live.visited.has(p.id) ? { label: placeText(p).name, colour: UI.ink, place: p } : { label: '???', colour: UI.muted }));
    // The Carrier: what the Blobbi has noticed about it, in the order noticed.
    if (this.tab === 'carrier') return observationsFor(live.species).map((o) => (live.carrier.observations.includes(o.id) ? { label: o.text, colour: UI.ink, observation: o } : { label: '???', colour: UI.muted }));
    // The fish log (M10 phase B): every species, the caught ones by name.
    if (this.tab === 'fish') return FISH_CONTENT.map((f) => ({ label: live.caught.has(f.item.id) ? f.item.label : '???', colour: live.caught.has(f.item.id) ? UI.ink : UI.muted, fish: f }));
    return DISCOVERY_CONTENT.map((d) => ({ label: live.found.has(d.id) ? d.item.label : '???', colour: live.found.has(d.id) ? UI.ink : UI.muted, find: d }));
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    if (code === 'KeyQ' || code === 'KeyE' || code === 'Tab') {
      this.tab = TABS[(TABS.indexOf(this.tab) + (code === 'KeyQ' ? -1 : 1) + TABS.length) % TABS.length];
      this.index = 0;
      return true;
    }
    // P pins the selected side quest to the goal box (or unpins it).
    if (code === 'KeyP' && this.tab === 'quests') {
      this.togglePin(ui);
      return true;
    }
    const moved = moveSelection(code, this.index, this.rows(ui).length, 1);
    if (moved !== null) {
      this.index = moved;
      return true;
    }
    return isConfirm(code);
  }

  /** The selected quest, if it is a side quest that can be pinned (active). */
  private pinnable(ui: GameUI): Objective | null {
    const q = this.rows(ui)[this.index]?.quest;
    const live = ui.live!;
    return q && q.type === 'side' && !(q.id in live.objectives.completed) ? q : null;
  }

  private togglePin(ui: GameUI): void {
    const live = ui.live!;
    const q = this.pinnable(ui);
    if (!q) return;
    if (live.pinnedQuest === q.id) {
      live.pinQuest(null);
      ui.say(t('journal.unpinned'));
    } else if (live.pinQuest(q.id)) ui.say(t('journal.pinnedToGoals'));
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const live = ui.live!;
    let tx = x;
    for (const tab of TABS) {
      const label = upper(t(TAB_LABEL[tab]));
      tx += g.button(label, tx, y, () => ((this.tab = tab), (this.index = 0)), { primary: this.tab === tab, w: g.measure(label) + 8 }) + 1;
    }
    const rows = this.rows(ui);
    this.index = Math.max(0, Math.min(this.index, rows.length - 1));
    const listW = 132;
    const ly = y + 14;
    const visible = Math.floor((h - 16) / ROW);
    const scroll = Math.max(0, this.index - visible + 1);
    for (let i = scroll; i < Math.min(rows.length, scroll + visible); i++) {
      const r = rows[i];
      const ry = ly + (i - scroll) * ROW;
      g.box(x, ry, listW, ROW - 1, i === this.index ? UI.slotHi : UI.panel, i === this.index ? UI.accent : null);
      g.text(fitText(g, upper(r.label), listW - 4), x + 2, ry + 2, r.colour);
      g.hit(x, ry, listW, ROW - 1, () => (this.index = i));
    }
    if (!rows.length) g.para(t(this.tab === 'notes' ? 'journal.noNotes' : 'journal.nothingYet'), x + 2, ly + 2, listW - 4, UI.muted);
    const hidden = (rows[this.index] && !rows[this.index].place && !rows[this.index].observation && (this.tab === 'places' || this.tab === 'carrier')) as boolean;
    const dx = x + listW + 4;
    const dw = x + w - dx;
    g.box(dx, ly, dw, h - 14, UI.panel, UI.line);
    const r = rows[this.index];
    if (!r) return;
    let cy = ly + 4;
    const para = (text: string, c: number = UI.ink, lines = 12) => (cy += g.para(text, dx + 4, cy, dw - 8, c, lines) + 4);
    if (hidden) {
      para(t(this.tab === 'places' ? 'journal.placeHidden' : 'journal.carrierHidden'), UI.muted);
      return;
    }
    if (r.place) {
      const pt = placeText(r.place);
      para(pt.name, UI.accent, 2);
      para(pt.note);
      para(t('journal.onTheMap'), UI.muted);
      return;
    }
    if (r.observation) {
      para(t('carrierPanel.title'), UI.accent, 2);
      para(r.observation.note);
      if (r.observation.when) para(t(r.observation.when === 'night' ? 'journal.noticedNight' : 'journal.noticedDay'), UI.muted);
      return;
    }
    if (r.request) {
      const p = requestProgress(live.objectives, live.tally)!;
      para(t('journal.islandRequest'), UI.accent);
      para(p.request.title);
      para(t('journal.requestProgress', { have: p.have, need: p.need }), UI.muted);
      para(t('journal.reward', { reward: p.request.reward.text }), UI.good);
    } else if (r.quest) {
      const q = r.quest;
      const done = q.id in live.objectives.completed;
      para(q.title, UI.accent, 2);
      para(q.story);
      if (!done) {
        para(q.hint, UI.muted);
        const p = goalProgress(q.goal, live.questContext());
        if (p.need > 1) para(t('journal.progress', { have: p.have, need: p.need }), UI.good);
      }
      para(t(done ? 'journal.got' : 'journal.reward', { reward: q.reward.text }), UI.good);
      // A side quest can be pinned to the goal box (one at a time).
      if (this.pinnable(ui)) {
        const pinned = live.pinnedQuest === q.id;
        g.button(`${t(pinned ? 'journal.unpin' : 'journal.pin')} (P)`, dx + 4, ly + h - 14 - 15, () => this.togglePin(ui), { primary: !pinned });
      }
    } else if (r.note) {
      const note = loreById(r.note)!;
      para(note.title, UI.accent, 2);
      para(note.text, UI.ink, 14);
    } else if (r.find) {
      const found = live.found.has(r.find.id);
      if (found) {
        g.buf.blit(itemIcon(r.find.item.id, ui.palette()).scaled(2), dx + 4, cy);
        cy += 30;
        para(sentence(r.find.item.label), UI.accent);
        para(r.find.item.description);
      } else {
        para(t('journal.notFound'), UI.muted);
        // Finds at sea are met, not dug up: no beach to search.
        para(r.find.id.startsWith('sea:') ? t('journal.seaHint') : t(`journal.hint.${r.find.terrain}`), UI.muted);
      }
    } else if (r.fish) {
      const f = r.fish;
      if (live.caught.has(f.item.id)) {
        g.buf.blit(itemIcon(f.item.id, ui.palette()).scaled(2), dx + 4, cy);
        cy += 30;
        para(sentence(f.item.label), UI.accent);
        para(f.item.description);
      } else para(t('journal.notCaught'), UI.muted);
      const where = f.hint ?? t(f.water === 'pond' ? 'journal.water.pond' : f.water === 'sea' ? 'journal.water.sea' : 'journal.water.both');
      para(t('journal.where', { where }), UI.muted);
    }
  }
}
