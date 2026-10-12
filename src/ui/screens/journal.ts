/**
 * THE JOURNAL: quests (main story, side quests, discoveries, the island request) with their story, how to do
 * them, progress and reward; the notes found so far; the discoveries found (the rest as hints). Reading the
 * journal changes nothing in the world.
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

type Tab = 'quests' | 'notes' | 'finds' | 'fish' | 'places' | 'carrier';
const TABS: readonly Tab[] = ['quests', 'notes', 'finds', 'fish', 'places', 'carrier'];
const ROW = 10;
const TERRAIN_HINT: Record<string, string> = { beach: 'somewhere on the beach', forest: 'under the trees', meadow: 'in a meadow', grass: 'out on the grass', plateau: 'up on high ground', pond: 'near the pond' };

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
    return `Journal  ${Object.keys(live.objectives.completed).length}/${QUESTS.length} quests  ${(live.objectives.lore ?? []).length}/${LORE.length} notes  ${live.found.size}/${DISCOVERY_CONTENT.length} finds  ${live.caught.size}/${FISH_CONTENT.length} fish  ${live.visited.size}/${live.places.length} places`;
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
      if (req) out.push({ label: `Request: ${req.request.title} ${req.have}/${req.need}`, colour: UI.good, request: true });
      for (const q of activeQuests(st)) out.push({ label: `${q.type === 'main' ? `${q.chapter}.` : q.type === 'side' ? 'Side' : 'Find'} ${q.title}`, colour: q.type === 'main' ? UI.accent : UI.ink, quest: q });
      for (const id of Object.keys(st.completed)) {
        const q = objectiveById(id);
        if (q) out.push({ label: `done: ${q.title}`, colour: UI.muted, quest: q });
      }
      return out;
    }
    if (this.tab === 'notes') return (st.lore ?? []).map((id) => ({ label: loreById(id)?.title ?? id, colour: UI.ink, note: id }));
    // Places: the visited ones by name; the rest stay unnamed (how many is no secret, where is).
    if (this.tab === 'places') return live.places.map((p) => (live.visited.has(p.id) ? { label: p.name, colour: UI.ink, place: p } : { label: '???', colour: UI.muted }));
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
    const moved = moveSelection(code, this.index, this.rows(ui).length, 1);
    if (moved !== null) {
      this.index = moved;
      return true;
    }
    return isConfirm(code);
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const live = ui.live!;
    let tx = x;
    for (const tab of TABS) tx += g.button(tab.toUpperCase(), tx, y, () => ((this.tab = tab), (this.index = 0)), { primary: this.tab === tab }) + 1;
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
      g.text(r.label.toUpperCase().slice(0, 32), x + 2, ry + 2, r.colour);
      g.hit(x, ry, listW, ROW - 1, () => (this.index = i));
    }
    if (!rows.length) g.para(this.tab === 'notes' ? 'No notes yet. Explore, listen, and read what you find.' : 'Nothing yet.', x + 2, ly + 2, listW - 4, UI.muted);
    const hidden = (rows[this.index] && !rows[this.index].place && !rows[this.index].observation && (this.tab === 'places' || this.tab === 'carrier')) as boolean;
    const dx = x + listW + 4;
    const dw = x + w - dx;
    g.box(dx, ly, dw, h - 14, UI.panel, UI.line);
    const r = rows[this.index];
    if (!r) return;
    let cy = ly + 4;
    const para = (t: string, c: number = UI.ink, lines = 12) => (cy += g.para(t, dx + 4, cy, dw - 8, c, lines) + 4);
    if (hidden) {
      para(this.tab === 'places' ? 'A place not visited yet. Walk around the island: the map fills in as you go.' : 'Something about the Carrier not noticed yet. Visit it by day and by night, and OBSERVE.', UI.muted);
      return;
    }
    if (r.place) {
      para(r.place.name, UI.accent, 2);
      para(r.place.note);
      para('On the map (N): a diamond. Pick it there and Blobbi walks back.', UI.muted);
      return;
    }
    if (r.observation) {
      para('The World Carrier', UI.accent, 2);
      para(r.observation.note);
      if (r.observation.when) para(`Noticed ${r.observation.when === 'night' ? 'at night' : 'by day'}.`, UI.muted);
      return;
    }
    if (r.request) {
      const p = requestProgress(live.objectives, live.tally)!;
      para('Island request', UI.accent);
      para(p.request.title);
      para(`Progress ${p.have}/${p.need}. No hurry: it waits for you.`, UI.muted);
      para(`Reward: ${p.request.reward.text}`, UI.good);
    } else if (r.quest) {
      const q = r.quest;
      const done = q.id in live.objectives.completed;
      para(q.title, UI.accent, 2);
      para(q.story);
      if (!done) {
        para(q.hint, UI.muted);
        const p = goalProgress(q.goal, live.questContext());
        if (p.need > 1) para(`Progress ${p.have}/${p.need}`, UI.good);
      }
      para(`${done ? 'Got' : 'Reward'}: ${q.reward.text}`, UI.good);
    } else if (r.note) {
      const note = loreById(r.note)!;
      para(note.title, UI.accent, 2);
      para(note.text, UI.ink, 14);
    } else if (r.find) {
      const found = live.found.has(r.find.id);
      if (found) {
        g.buf.blit(itemIcon(r.find.item.id, ui.palette()).scaled(2), dx + 4, cy);
        cy += 30;
        para(r.find.item.label, UI.accent);
        para(r.find.item.description);
      } else {
        para('Not found yet', UI.muted);
        // Finds at sea are met, not dug up: no beach to search.
        para(r.find.id.startsWith('sea:') ? 'Something waits out on the sea round the Carrier, or in it.' : `Something is hidden ${TERRAIN_HINT[r.find.terrain]}.`, UI.muted);
      }
    } else if (r.fish) {
      const f = r.fish;
      if (live.caught.has(f.item.id)) {
        g.buf.blit(itemIcon(f.item.id, ui.palette()).scaled(2), dx + 4, cy);
        cy += 30;
        para(f.item.label, UI.accent);
        para(f.item.description);
      } else para('Not caught yet', UI.muted);
      const where = f.hint ?? (f.water === 'pond' ? 'the island pond' : f.water === 'sea' ? 'the sea' : 'the sea or a pond');
      para(`Where: ${where}.`, UI.muted);
    }
  }
}
