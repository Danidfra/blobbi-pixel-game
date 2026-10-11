import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { memoryStore, saveKey } from '../src/game/persistence';
import { LocalVisitTransport, VisitSession, localPlayerId, readOnlyStore, OWNERS_KEY, READ_ONLY, type WorldRef } from '../src/game/visiting';
import { parseIdentity, worldName } from '../src/game/worlds';
import { ITEMS } from '../src/game/items';
import { RECIPES } from '../src/game/crafting';
import { findBuildSpot, run, stand } from '../src/dev/scripted-play';

const home = generateTurtleWorld('turtle-0');
const host = generateTurtleWorld('turtle-3');
const step = (live: LiveWorld, seconds: number) => run(live, Math.round(seconds * 60));

/** A store with a host world that has a shelter, a collected node and a full bag. */
function hostStore() {
  const store = memoryStore();
  const h = new LiveWorld(host, 'blobbi-1', 16, { store });
  h.brain.enabled = false;
  for (const it of [ITEMS.wood.id, ITEMS.stone.id, ITEMS.stick.id]) h.inventory.add(it, 50);
  for (const q of ['arrive', 'meet', 'gather', 'axe', 'wood']) h.objectives.completed[q] = 0;
  findBuildSpot(h, 'shelter');
  h.setBuildMode('shelter');
  h.placeBuilding()!.placedAt -= 1e6;
  h.collected.add(h.resources[0].id);
  h.save();
  return { store, h };
}

describe('visitor permissions: read-only by default', () => {
  it('a visitor sees the host world as saved, carries an empty bag, and never writes', () => {
    const { store, h } = hostStore();
    const before = store.get(saveKey(h.identity));
    const ro = readOnlyStore(store);
    const v = new LiveWorld(host, 'blobbi-9', 16, { store: ro, visitor: true });
    expect(v.visitor).toBe(true);
    expect(v.permissions).toEqual(READ_ONLY);
    expect(v.buildings.map((b) => b.id)).toEqual(h.buildings.map((b) => b.id)); // the host's island, as built
    expect(v.collected.has(h.resources[0].id)).toBe(true);
    expect(v.inventory.entries()).toEqual([]); // nothing of the host's comes along
    expect(v.blobbi.seed).not.toBe(h.blobbi.seed); // the visitor's own Blobbi
    for (let i = 0; i < 60 * 15; i++) v.update(1 / 60, { ...IDLE_INPUT, right: i % 120 < 60, interact: i % 30 === 0 });
    v.save();
    expect(v.inventory.entries()).toEqual([]); // no quest reward, nothing gathered
    expect(v.objectives.completed).toEqual(h.objectives.completed); // the host's story did not move
    expect(store.get(saveKey(h.identity))).toBe(before);
    expect(ro.attemptedWrites).toBe(0);
  });

  it('gathering, farming, building, crafting, chests and feeding are refused; walking and listening are not', () => {
    const { store } = hostStore();
    const v = new LiveWorld(host, 'blobbi-9', 16, { store: readOnlyStore(store), visitor: true });
    v.brain.enabled = false;
    const node = v.resources[0];
    stand(v, node.x, node.y + 4, 'up');
    expect(v.collect()).toBeNull();
    expect(v.chop()).toBe(false);
    expect(v.mine()).toBe(false);
    expect(v.tend()).toBe(false);
    v.setBuildMode('fence');
    expect(v.buildMode).toBeNull();
    expect(v.placeBuilding()).toBeNull();
    expect(v.startPlacing(ITEMS.wood.id)).toBe(false);
    expect(v.toggleManage()).toBe(false);
    expect(v.craftRecipe(RECIPES[0])).toBe(false);
    expect(v.feed(ITEMS.wood.id)).toBe(false);
    expect(v.growIsland(true)).toBeNull();
    const chest = v.buildings[0];
    expect(v.moveItems(chest, ITEMS.wood.id, 1, true)).toBe(0);
    expect(v.bubble?.text).toMatch(/visiting/);
    // Walking works.
    const x0 = v.blobbi.x;
    step(v, 0.5);
    v.update(0.5, { ...IDLE_INPUT, left: true });
    expect(v.blobbi.x).not.toBe(x0);
    // Listening to the Carrier works (it changes nothing that is saved: there is no store).
    stand(v, v.listenSpot!.x, v.listenSpot!.y, 'down');
    v.listen();
    expect(v.tally.talked).toBeGreaterThan(0);
  });
});

describe('the visit session (teleport handoff)', () => {
  it('switches only when the Blobbi is gone, both ways, and recovers from a cancelled departure', () => {
    const s = new VisitSession();
    const ref: WorldRef = { identity: 'x', params: parseIdentity('seed=s|kind=turtle|turtle=t|variant=2|704x576|scale=1.6|palette=cozy|density=1|islands=1')!, name: 'X', owner: null };
    expect(s.arrive('absent')).toBe(false); // not departing
    expect(s.go(ref, { x: 1, y: 2 })).toBe(true);
    expect(s.go(ref, { x: 1, y: 2 })).toBe(false); // one trip at a time
    expect(s.arrive('departing')).toBe(false); // still visible: no switch
    expect(s.arrive('absent')).toBe(true);
    expect(s.visiting).toBe(true);
    expect(s.arriveHome('absent')).toBe(false); // not returning yet
    expect(s.goHome()).toBe(true);
    expect(s.arriveHome('arriving')).toBe(false);
    expect(s.arriveHome('absent')).toBe(true);
    expect(s.phase).toBe('home');
    expect(s.homeSpot).toEqual({ x: 1, y: 2 });
    s.go(ref, { x: 0, y: 0 });
    s.abort();
    expect(s.phase).toBe('home');
  });

  it('a full round trip: depart home, arrive as a visitor, explore, return; home is unchanged and the Blobbi is the same', () => {
    const { store } = hostStore();
    const homeStore = memoryStore();
    let live = new LiveWorld(home, 'blobbi-9', 16, { store: homeStore });
    live.inventory.add(ITEMS.wood.id, 7);
    live.save();
    const homeBefore = homeStore.get(saveKey(live.identity));
    const identity = live.blobbi.identity;
    const s = new VisitSession();
    const ref: WorldRef = { identity: 'host', params: parseIdentity('seed=s|kind=turtle|turtle=t|variant=2|704x576|scale=1.6|palette=cozy|density=1|islands=1')!, name: 'Host', owner: null };
    s.go(ref, { x: live.blobbi.x, y: live.blobbi.y });
    live.leaveBlobbi();
    step(live, 4);
    expect(s.arrive(live.getPresenceState())).toBe(true);
    live = new LiveWorld(host, 'blobbi-9', 16, { store: readOnlyStore(store), visitor: true });
    live.teleport.state = 'absent';
    live.enterBlobbi(live.listenSpot!);
    step(live, 4);
    expect(live.getPresenceState()).toBe('present');
    expect(live.blobbi.identity).toEqual(identity); // the same Blobbi, gene for gene
    expect(live.inventory.count(ITEMS.wood.id)).toBe(0); // its own bag stayed home
    step(live, 3);
    expect(s.goHome()).toBe(true);
    live.leaveBlobbi();
    step(live, 4);
    expect(s.arriveHome(live.getPresenceState())).toBe(true);
    live = new LiveWorld(home, 'blobbi-9', 16, { store: homeStore });
    expect(live.inventory.count(ITEMS.wood.id)).toBe(7);
    expect(homeStore.get(saveKey(live.identity))).toBe(homeBefore);
  });

  it('a reload in the middle of a visit comes home (the visit is never saved)', () => {
    const homeStore = memoryStore();
    const a = new LiveWorld(home, 'blobbi-9', 16, { store: homeStore });
    a.save();
    const keys = [...homeStore.data.keys()];
    // ... a visit happens elsewhere, then the page reloads: only the home world is opened, as always.
    const b = new LiveWorld(home, 'blobbi-9', 16, { store: homeStore });
    expect(b.visitor).toBe(false);
    expect(b.getPresenceState()).toBe('present');
    expect([...homeStore.data.keys()]).toEqual(keys);
  });
});

describe('local discovery transport', () => {
  it('lists other saved worlds (turtle and manta), never the current one, with owners from the index', () => {
    const store = memoryStore();
    const worlds = [home, host, generateMantaWorld('manta-world-0')];
    const ids = worlds.map((w) => {
      const l = new LiveWorld(w, 'blobbi-9', 16, { store });
      l.save();
      return l.identity;
    });
    store.set(OWNERS_KEY, JSON.stringify({ [ids[1]]: 'local:me' }));
    const t = new LocalVisitTransport(() => [...store.data.keys()], (k) => store.get(k), () => ids[0]);
    const list = t.list();
    expect(list.map((r) => r.identity).sort()).toEqual([ids[1], ids[2]].sort());
    expect(list.find((r) => r.identity === ids[1])!.owner).toBe('local:me');
    expect(list.find((r) => r.identity === ids[2])!.params.kind).toBe('manta');
    expect(list.find((r) => r.identity === ids[2])!.name).toBe(worldName(ids[2]));
    const ro = t.open(list[0]) as ReturnType<typeof readOnlyStore>;
    ro.set('k', 'v');
    expect(store.get('k')).toBeNull();
  });

  it('the local player id is made once and kept', () => {
    const m = new Map<string, string>();
    const get = (k: string) => m.get(k) ?? null;
    const set = (k: string, v: string) => void m.set(k, v);
    const a = localPlayerId(get, set, () => 'abc');
    const b = localPlayerId(get, set, () => 'zzz');
    expect(a).toBe('local:abc');
    expect(b).toBe(a);
  });
});
