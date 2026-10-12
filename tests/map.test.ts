import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { memoryStore } from '../src/game/persistence';
import { MapScreen, mapImage, mapMarkers, mapTransform } from '../src/ui/screens/map';
import { JournalScreen } from '../src/ui/screens/journal';
import { GameUI } from '../src/ui/game-ui';
import { Gfx } from '../src/ui/gfx';
import { paletteFor } from '../src/world/generate';
import { carrierKey, neighbours, parseCarrierKey, GENERATOR_VERSION } from '../src/game/archipelago';
import { stand } from '../src/dev/scripted-play';

const world = generateTurtleWorld('turtle-0');
const ui = (live: LiveWorld) => {
  const u = new GameUI(() => live, () => paletteFor('cozy'));
  u.register(new MapScreen());
  u.register(new JournalScreen());
  return u;
};

describe('map coordinates', () => {
  it('fits the world in the area, centred, and maps back', () => {
    const m = mapTransform(704, 576, 196, 140);
    expect(704 * m.scale).toBeLessThanOrEqual(196);
    expect(576 * m.scale).toBeLessThanOrEqual(140);
    const c = m.toMap(352, 288);
    expect(Math.abs(c.x - 98)).toBeLessThanOrEqual(1);
    expect(Math.abs(c.y - 70)).toBeLessThanOrEqual(1);
    for (const [x, y] of [[0, 0], [100, 400], [703, 575]]) {
      const p = m.toMap(x, y);
      const back = m.toWorld(p.x, p.y);
      expect(Math.abs(back.x - x)).toBeLessThan(1 / m.scale + 1);
      expect(Math.abs(back.y - y)).toBeLessThan(1 / m.scale + 1);
    }
  });

  it('draws the island deterministically, sea at the corners, land in the middle', () => {
    const a = mapImage(world, 196, 140);
    const b = mapImage(world, 196, 140);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(a.get(0, 0)).not.toBe(a.get(98, 70));
  });
});

describe('places', () => {
  it('are found from the world alone, on standable ground, the same every time', () => {
    const a = new LiveWorld(world, 'blobbi-9', 16);
    const b = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    expect(a.places.map((p) => [p.id, p.x, p.y])).toEqual(b.places.map((p) => [p.id, p.x, p.y]));
    expect(a.places.length).toBeGreaterThanOrEqual(4);
    expect(a.places.map((p) => p.id)).toContain('head');
    for (const p of a.places) expect(a.islandCollision.canStand(p.x, p.y, a.blobbi.footRx, a.blobbi.footRy)).toBe(true);
  });

  it('visiting one adds it (with a notice), and it is saved', () => {
    const store = memoryStore();
    const live = new LiveWorld(world, 'blobbi-9', 16, { store });
    live.brain.enabled = false;
    const p = live.places.find((q) => q.id === 'pond') ?? live.places[1];
    stand(live, p.x, p.y, 'down');
    live.update(1 / 60, IDLE_INPUT);
    expect(live.visited.has(p.id)).toBe(true);
    expect(live.notices.some((n) => n.heading === 'New place' && n.title === p.name)).toBe(true);
    live.save();
    const again = new LiveWorld(world, 'blobbi-9', 16, { store });
    expect(again.visited.has(p.id)).toBe(true);
  });
});

describe('map markers never reveal secrets', () => {
  it('shows the Blobbi, and only visited places and found discoveries', () => {
    const live = new LiveWorld(world, 'blobbi-9', 16);
    const marks = () => mapMarkers(ui(live));
    expect(marks().filter((m) => m.kind === 'you')).toHaveLength(1);
    expect(marks().filter((m) => m.kind === 'place' || m.kind === 'find')).toHaveLength(0);
    live.visited.add(live.places[0].id);
    live.found.add(live.discoveries[0].id);
    expect(marks().filter((m) => m.kind === 'place')).toHaveLength(1);
    expect(marks().filter((m) => m.kind === 'find')).toHaveLength(1);
    // Hidden discoveries never appear, whatever else is on the map.
    for (const d of live.hiddenDiscoveries) expect(marks().some((m) => m.x === d.x && m.y === d.y)).toBe(false);
  });

  it('marks the goal only when it is a known place (listening to the Carrier)', () => {
    const live = new LiveWorld(world, 'blobbi-9', 16);
    expect(mapMarkers(ui(live)).some((m) => m.kind === 'goal')).toBe(false);
    for (const id of ['arrive', 'meet', 'gather', 'axe', 'wood', 'materials', 'shelter', 'enter-home', 'first-furniture', 'plot', 'plant', 'water', 'harvest', 'feed', 'home', 'cook', 'mystery']) live.objectives.completed[id] = 0;
    const goal = mapMarkers(ui(live)).find((m) => m.kind === 'goal');
    expect(goal).toBeDefined();
    expect({ x: goal!.x, y: goal!.y }).toEqual(live.listenSpot);
  });
});

describe('map and journal screens', () => {
  it('the map draws, picks a visited place by keyboard and walks there', () => {
    const live = new LiveWorld(world, 'blobbi-9', 16);
    const u = ui(live);
    const target = live.places.find((p) => p.id !== 'head')!;
    live.visited.add(target.id);
    u.open('map');
    const g = new Gfx(304, 184);
    (u as unknown as { screen: MapScreen }).screen.draw(g, u, 4, 15, 296, 157);
    expect(g.hits.length).toBeGreaterThan(1);
    u.handleKey('Enter');
    expect(u.capturing).toBe(false);
    expect(live.brain.target).not.toBeNull();
  });

  it('N opens the map; the journal lists places and Carrier observations, unknown ones as ???', () => {
    const live = new LiveWorld(world, 'blobbi-9', 16);
    const u = ui(live);
    u.handleKey('KeyN');
    expect(u.screen?.id).toBe('map');
    u.handleKey('Escape');
    u.open('journal');
    const j = u.screen as JournalScreen;
    j.tab = 'places';
    expect(j.rows(u).every((r) => r.label === '???')).toBe(true);
    live.visited.add(live.places[0].id);
    expect(j.rows(u)[0].label).toBe(live.places[0].name);
    j.tab = 'carrier';
    expect(j.rows(u).every((r) => r.label === '???')).toBe(true);
    live.carrier.observations.push('eye');
    expect(j.rows(u).some((r) => r.label !== '???')).toBe(true);
  });
});

describe('archipelago model (architecture only)', () => {
  it('neighbours are a pure function of the home Carrier, spread out, with ids that round-trip', () => {
    const home = { species: 'turtle' as const, seed: 'turtle-0', generator: GENERATOR_VERSION };
    const a = neighbours(home);
    expect(neighbours(home)).toEqual(a);
    expect(a).toHaveLength(6);
    expect(neighbours({ ...home, seed: 'turtle-1' })).not.toEqual(a);
    for (const n of a) {
      expect(parseCarrierKey(carrierKey(n.carrier))).toEqual(n.carrier);
      expect(n.distance).toBeGreaterThanOrEqual(1);
    }
    expect(parseCarrierKey('dragon:x@1')).toBeNull();
  });
});
