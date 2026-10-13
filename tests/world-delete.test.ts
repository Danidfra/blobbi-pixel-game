import { describe, expect, it } from 'vitest';
import { ConfirmGate, CONFIRM_ARM_SECONDS, deleteWorld } from '../src/game/world-delete';
import { saveKey } from '../src/game/persistence';
import { WORLD_INDEX_KEY, type WorldEntry } from '../src/game/worlds';
import { OWNERS_KEY } from '../src/game/visiting';
import { TitleScreen, type TitleActions } from '../src/ui/title';
import { PixelBuffer } from '../src/core/pixel';

function store(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return { map, get: (k: string) => map.get(k) ?? null, set: (k: string, v: string) => void map.set(k, v), remove: (k: string) => void map.delete(k) };
}

const entry = (identity: string, name: string): WorldEntry => ({ identity, name, params: { seed: identity, kind: 'whale', width: 1, height: 1, scale: 1.6, palette: 'cozy', density: 1, islands: 1 }, day: 3, quests: 4, buildings: 2, lastPlayed: 0 });

describe('deleting a world', () => {
  it('removes exactly that world: its save and its index entries, nothing else', () => {
    const s = store({
      [saveKey('a')]: '{"a":1}',
      [saveKey('b')]: '{"b":1}',
      [WORLD_INDEX_KEY]: JSON.stringify({ a: 1, b: 2 }),
      [OWNERS_KEY]: JSON.stringify({ a: 'local:me', b: 'local:me' }),
      unrelated: 'x',
    });
    expect(deleteWorld(s, 'a')).toBe(true);
    expect(s.get(saveKey('a'))).toBeNull();
    expect(s.get(saveKey('b'))).toBe('{"b":1}');
    expect(JSON.parse(s.get(WORLD_INDEX_KEY)!)).toEqual({ b: 2 });
    expect(JSON.parse(s.get(OWNERS_KEY)!)).toEqual({ b: 'local:me' });
    expect(s.get('unrelated')).toBe('x');
    expect(deleteWorld(s, 'missing')).toBe(false);
  });

  it('leaves a malformed index alone', () => {
    const s = store({ [saveKey('a')]: '{}', [WORLD_INDEX_KEY]: '{broken' });
    deleteWorld(s, 'a');
    expect(s.get(WORLD_INDEX_KEY)).toBe('{broken');
  });
});

describe('the confirmation gate', () => {
  it('refuses the confirming press until it has been shown for a moment', () => {
    const g = new ConfirmGate<string>();
    expect(g.confirm(10)).toBeNull(); // nothing asked
    g.open('island', 10);
    expect(g.confirm(10)).toBeNull(); // the same press (a double click) does nothing
    expect(g.confirm(10 + CONFIRM_ARM_SECONDS / 2)).toBeNull();
    expect(g.pending).toBe(true);
    expect(g.confirm(10 + CONFIRM_ARM_SECONDS)).toBe('island');
    expect(g.pending).toBe(false);
    expect(g.confirm(20)).toBeNull(); // answered once
  });

  it('cancel forgets the question', () => {
    const g = new ConfirmGate<string>();
    g.open('x', 0);
    g.cancel();
    expect(g.confirm(5)).toBeNull();
  });
});

describe('deleting from ISLANDS', () => {
  function title(worlds: WorldEntry[]) {
    const deleted: string[] = [];
    const actions: TitleActions = {
      worlds: () => worlds.filter((w) => !deleted.includes(w.identity)),
      current: () => ({ identity: '', name: '', saved: false }),
      continueGame: () => {},
      openWorld: () => {},
      settings: () => {},
      deleteWorld: (w) => deleted.push(w.identity),
    };
    const t = new TitleScreen(actions);
    const frame = new PixelBuffer(640, 360);
    const draw = (time: number) => t.render(frame, time);
    return { t, deleted, draw };
  }
  const press = (t: TitleScreen, label: string, region: { x: number; y: number; w: number; h: number }) => {
    void label;
    t.pointer(region.x + 1, region.y + 1);
  };

  it('asks on its own page, defaults to KEEP IT, and only deletes after a pause', () => {
    const { t, deleted, draw } = title([entry('a', 'Mossy Cove'), entry('b', 'Quiet Isle')]);
    draw(0);
    t.key('ArrowDown');
    t.key('ArrowDown'); // ISLANDS (after CONTINUE and SETTINGS)
    t.key('Enter');
    expect(t.page).toBe('islands');
    draw(1);
    t.key('KeyX'); // delete the selected (first) island: it only asks
    expect(t.page).toBe('delete');
    expect(t.confirm.subject?.identity).toBe('a');
    expect(t.index).toBe(0); // KEEP IT
    draw(1);
    t.key('Enter'); // KEEP IT
    expect(t.page).toBe('islands');
    expect(deleted).toEqual([]);
    // Ask again, choose DELETE straight away: refused while the question is new.
    draw(2);
    t.key('Delete');
    draw(2.01);
    t.key('ArrowRight');
    t.key('Enter');
    expect(deleted).toEqual([]);
    expect(t.page).toBe('delete');
    draw(2 + CONFIRM_ARM_SECONDS + 0.05);
    t.key('Enter');
    expect(deleted).toEqual(['a']);
    expect(t.page).toBe('islands');
  });

  it('a double tap on DELETE never deletes: the first tap asks, the second lands on the question', () => {
    const { t, deleted, draw } = title([entry('a', 'Mossy Cove')]);
    t.key('ArrowDown');
    t.key('ArrowDown'); // ISLANDS
    t.key('Enter');
    draw(0);
    const buttons = (t as unknown as { hits: { x: number; y: number; w: number; h: number }[] }).hits;
    const del = buttons.at(-2)!; // the row's DELETE button (BACK is last)
    press(t, 'DELETE', del);
    expect(t.page).toBe('delete');
    draw(0.05);
    press(t, 'DELETE', del); // the same spot, a moment later
    draw(0.1);
    for (const h of (t as unknown as { hits: { x: number; y: number; w: number; h: number }[] }).hits) press(t, '', h); // even every button at once
    expect(deleted).toEqual([]);
  });

  it('Escape cancels the question', () => {
    const { t, deleted, draw } = title([entry('a', 'Mossy Cove')]);
    t.key('ArrowDown');
    t.key('ArrowDown'); // ISLANDS
    t.key('Enter');
    draw(0);
    t.key('KeyX');
    draw(5);
    t.key('Escape');
    expect(t.page).toBe('islands');
    expect(t.confirm.pending).toBe(false);
    expect(deleted).toEqual([]);
  });
});
