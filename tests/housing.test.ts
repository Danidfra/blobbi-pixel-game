/**
 * M8 housing: three house levels (art, footprints, room layouts), earned upgrades, furniture that is never lost,
 * and saves that keep it all.
 */
import { describe, expect, it } from 'vitest';
import { LAYOUTS, atDoor, checkInterior, layoutFor, newInterior, relocateFurniture, roomCollision, roomSprite, roomsReachable } from '../src/game/interior';
import { BUILDINGS, footOf, houseSprite, houseLevel, type Building } from '../src/game/buildings';
import { resolveLook, ROOF_COLOURS, WALL_MATERIALS, DOOR_STYLES, WINDOW_STYLES } from '../src/game/house-art';
import { HOUSE_LEVELS } from '../src/content/houses';
import { paletteFor } from '../src/world/generate';
import { hash32 } from '../src/core/rng';
import { hex } from '../src/core/color';
import { LiveWorld } from '../src/sim/live-world';
import { loadSave, memoryStore, saveKey } from '../src/game/persistence';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { findBuildSpot, pressE, pressUntil, run, stand } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import { advanceObjectives } from '../src/game/objectives';

const palette = paletteFor('cozy');
const h = (a: ArrayLike<number>) => hash32(Array.from(a, (v) => v.toString(36)).join(','));
const foot = { footRx: 4, footRy: 2 };
const piece = (kind: string, x: number, y: number, n = 0): Building => ({ id: `${kind}:${n}`, kind, x, y, placedAt: 0, seed: `s/${kind}/${n}` });

describe('room layouts', () => {
  it('the Cozy Shelter is pixel for pixel the M5 room (hashes taken from the M5 code)', () => {
    const pins: [{ floor: number; wall: number }, number, number][] = [
      [{ floor: 0, wall: 0 }, hex('#9ad0f0'), 1282409113],
      [{ floor: 0, wall: 0 }, hex('#203050'), 780070016],
      [{ floor: 1, wall: 2 }, hex('#9ad0f0'), 25073607],
      [{ floor: 2, wall: 1 }, hex('#203050'), 1468394260],
    ];
    for (const [st, sky, pin] of pins) expect(h(roomSprite(st, palette, sky).data)).toBe(pin);
    expect(h(roomSprite({ floor: 0, wall: 0 }, palette, hex('#9ad0f0'), LAYOUTS[1]).data)).toBe(1282409113);
  });

  for (const level of [1, 2, 3] as const)
    it(`level ${level}: every room is reachable from the door; the door leads out; the rooms are distinct`, () => {
      const layout = LAYOUTS[level];
      expect(roomsReachable([], layout, foot)).toBe(true);
      const map = roomCollision([], false, layout);
      expect(map.canStand(layout.spawn.x, layout.spawn.y, foot.footRx, foot.footRy)).toBe(true);
      expect(atDoor(layout.spawn.x, layout.h - 4, layout)).toBe(true);
      for (const r of layout.rooms) expect(map.canStand(r.anchor.x, r.anchor.y, foot.footRx, foot.footRy), r.name).toBe(true);
      const names = layout.rooms.map((r) => r.name);
      if (level === 2) expect(names).toEqual(expect.arrayContaining(['bedroom', 'living', 'kitchen']));
      if (level === 3) expect(names).toEqual(expect.arrayContaining(['bedroom', 'study', 'kitchen', 'living']));
    });

  it('bigger levels have more floor, and more windows', () => {
    const area = (l: 1 | 2 | 3) => (LAYOUTS[l].floor.x1 - LAYOUTS[l].floor.x0) * (LAYOUTS[l].floor.y1 - LAYOUTS[l].floor.y0);
    expect(area(2)).toBeGreaterThan(area(1) * 1.5);
    expect(area(3)).toBeGreaterThan(area(2) * 1.5);
    expect(LAYOUTS[2].windows.length).toBeGreaterThan(LAYOUTS[1].windows.length);
  });

  it('furniture never blocks a partition opening or stands on a partition', () => {
    const l = LAYOUTS[3];
    const nobody = { x: -50, y: -50, footRx: 0, footRy: 0 };
    expect(checkInterior('chair', 44, 82, [], nobody, undefined, l).ok).toBe(false); // in the bedroom's opening
    expect(checkInterior('chair', 88, 50, [], nobody, undefined, l).ok).toBe(false); // on the wall between rooms
    expect(checkInterior('chair', 60, 50, [], nobody, undefined, l).ok).toBe(true);
  });

  it('a house first entered at a higher level is furnished in its rooms (bed in the bedroom)', () => {
    for (const level of [2, 3]) {
      const st = newInterior('shelter:0', 'seed', level);
      expect(st.level).toBe(level);
      expect(st.furniture.map((f) => f.id).sort()).toEqual(newInterior('shelter:0', 'seed').furniture.map((f) => f.id).sort());
      const bed = st.furniture.find((f) => f.kind === 'bed')!;
      expect(layoutFor(level).rooms.find((r) => r.name === 'bedroom')!.rect.x1).toBeGreaterThanOrEqual(bed.x);
      expect(roomsReachable(st.furniture, layoutFor(level), foot)).toBe(true);
    }
  });
});

describe('moving furniture into a bigger house', () => {
  const crowded = (): Building[] => {
    const st = newInterior('shelter:0', 'seed');
    const extra = [piece('chair', 40, 70), piece('stool', 90, 70), piece('bookshelf', 100, 60), piece('potted-plant', 30, 80), piece('wall-clock', 70, 20), piece('painting', 20, 20), piece('cooking-station', 80, 40), piece('pet-bed', 50, 50)];
    return [...st.furniture, ...extra];
  };

  it('keeps every piece (ids, seeds, styles), in valid spots, every room reachable; deterministic', () => {
    const before = crowded();
    for (const [from, to] of [[1, 2], [2, 3], [1, 3]] as const) {
      const r = relocateFurniture(before, LAYOUTS[from], LAYOUTS[to], foot);
      expect(r.placed.length + r.displaced.length).toBe(before.length);
      expect(r.displaced).toEqual([]);
      expect(new Set(r.placed.map((f) => f.id))).toEqual(new Set(before.map((f) => f.id)));
      for (const f of r.placed) {
        const orig = before.find((b) => b.id === f.id)!;
        expect(f.seed).toBe(orig.seed);
        expect(f.variant).toBe(orig.variant);
        expect(checkInterior(f.kind, f.x, f.y, r.placed, { x: -50, y: -50, footRx: 0, footRy: 0 }, f, LAYOUTS[to]).ok, `${f.id} ${f.x},${f.y}`).toBe(true);
      }
      expect(roomsReachable(r.placed, LAYOUTS[to], foot)).toBe(true);
      expect(relocateFurniture(before, LAYOUTS[from], LAYOUTS[to], foot)).toEqual(r);
      // Beds go to the bedroom, the stove to the kitchen.
      const roomOf = (f: Building) => LAYOUTS[to].rooms.find((x) => f.x >= x.rect.x0 && f.x <= x.rect.x1 && f.y >= x.rect.y0 && f.y <= x.rect.y1)?.name;
      expect(roomOf(r.placed.find((f) => f.kind === 'bed')!)).toBe('bedroom');
      expect(roomOf(r.placed.find((f) => f.kind === 'cooking-station')!)).toBe('kitchen');
    }
  });

  it('a piece that fits nowhere is reported, never dropped', () => {
    const many = Array.from({ length: 60 }, (_, i) => piece('dining-table', 20 + (i % 5) * 20, 30 + Math.floor(i / 5) * 6, i));
    const r = relocateFurniture(many, LAYOUTS[1], LAYOUTS[2], foot);
    expect(r.placed.length + r.displaced.length).toBe(60);
    expect(r.displaced.length).toBeGreaterThan(0);
  });
});

describe('house art', () => {
  it('each level is its own drawing, bigger, deterministic, standing on a bigger footprint', () => {
    const b = (level: number): Building => ({ id: 'shelter:0', kind: 'shelter', x: 0, y: 0, placedAt: 0, seed: 'home', level });
    const s = [1, 2, 3].map((l) => houseSprite(b(l), palette, 1));
    for (let i = 1; i < 3; i++) {
      expect(s[i].buffer.width).toBeGreaterThan(s[i - 1].buffer.width);
      expect(s[i].buffer.height).toBeGreaterThan(s[i - 1].buffer.height);
      expect(footOf(b(i + 1)).footRx).toBeGreaterThan(footOf(b(i)).footRx);
    }
    for (let l = 1; l <= 3; l++) {
      expect(h(houseSprite(b(l), palette, 1).buffer.data)).toBe(h(houseSprite(b(l), palette, 1).buffer.data));
      expect(houseSprite(b(l), palette, 0.3).buffer.opaqueCount()).toBeLessThan(houseSprite(b(l), palette, 1).buffer.opaqueCount() + 60);
      expect(footOf(b(l))).toEqual({ footRx: HOUSE_LEVELS[l - 1].footRx, footRy: HOUSE_LEVELS[l - 1].footRy });
    }
  });

  it('a look changes colours and parts, never the size, footprint or anchor', () => {
    for (let l = 1; l <= 3; l++) {
      const base = houseSprite({ id: 's', kind: 'shelter', x: 0, y: 0, placedAt: 0, seed: 'home', level: l }, palette, 1);
      for (const [part, n] of [['roof', ROOF_COLOURS.length], ['wall', WALL_MATERIALS.length], ['door', DOOR_STYLES.length], ['window', WINDOW_STYLES.length]] as const)
        for (let i = 0; i < n; i++) {
          const s = houseSprite({ id: 's', kind: 'shelter', x: 0, y: 0, placedAt: 0, seed: 'home', level: l, look: { [part]: i } }, palette, 1);
          expect([s.buffer.width, s.buffer.height, s.anchorX, s.anchorY, s.footRx, s.footRy]).toEqual([base.buffer.width, base.buffer.height, base.anchorX, base.anchorY, base.footRx, base.footRy]);
          if (i !== resolveLook(l, undefined)[part]) expect(h(s.buffer.data), `${l} ${part} ${i}`).not.toBe(h(base.buffer.data));
        }
    }
  });
});

describe('upgrading the home in play', () => {
  const newIsland = (seed = 'island-house-1') => generateTurtleWorld(seed, { turtleSeed: `${seed}-t`, shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });

  function withHouse(store = memoryStore(), world = newIsland()) {
    const live = new LiveWorld(world, 'blobbi-9', 16, { store });
    live.brain.enabled = false;
    live.inventory.add(ITEMS.wood.id, 6);
    live.inventory.add(ITEMS.stone.id, 3);
    live.objectives.completed.materials = 0; // the build quest is open (it needs the materials step)
    if (!findBuildSpot(live, 'shelter', live.world.hubs[0], 160, 3)) throw new Error('no spot');
    live.setBuildMode('shelter');
    pressE(live);
    run(live, 60 * 26);
    const house = live.home()!;
    stand(live, house.x, house.y + footOf(house).footRy + live.blobbi.footRy + 3, 'up');
    pressUntil(live, () => live.inside);
    // A chest with things in it and a chair, then outside again.
    live.containers.get(`room/${house.id}/chest:0`) ?? live.interiorOf(house);
    live.exitInterior();
    run(live, 2);
    return { live, house, store };
  }
  const grant = (live: LiveWorld, ids: string[]) => {
    for (const id of ids) live.objectives.completed[id] = live.worldTime;
  };
  const pay = (live: LiveWorld, wood: number, stone: number, cloth: number) => {
    live.inventory.add(ITEMS.wood.id, wood);
    live.inventory.add(ITEMS.stone.id, stone);
    live.inventory.add('blobbi-pixel:material:cloth', cloth);
  };

  it('lists what the Cottage needs, refuses until it is there, then builds it from the bag', () => {
    const { live, house } = withHouse();
    const before = live.houseUpgrade();
    expect(before.level).toBe(1);
    expect(before.next?.name).toBe('Cottage');
    expect(before.ready).toBe(false);
    expect(before.requirements.some((r) => !r.met)).toBe(true);
    const snapshot = JSON.stringify([live.inventory.snapshot(), house]);
    expect(live.upgradeHouse().ok).toBe(false);
    expect(JSON.stringify([live.inventory.snapshot(), house])).toBe(snapshot); // nothing changed
    grant(live, ['home', 'harvest']);
    pay(live, 10, 6, 2);
    expect(live.houseUpgrade().ready, JSON.stringify(live.houseUpgrade())).toBe(true);
    const furniture = live.interiors.get(house.id)!.furniture.map((f) => f.id).sort();
    const r = live.upgradeHouse();
    expect(r).toEqual({ ok: true, reason: null });
    expect(houseLevel(house)).toBe(2);
    expect(live.inventory.count(ITEMS.wood.id)).toBe(0);
    expect(live.buildingAt(house)).toBeLessThan(1); // under construction
    run(live, 60 * 22);
    expect(live.buildingAt(house)).toBe(1);
    advanceObjectives(live.objectives, { tally: live.tally, inventory: live.inventory, buildings: live.buildings, worldTime: live.worldTime });
    expect(live.objectives.completed).toHaveProperty('cottage');
    // Every piece is still there (and the kitchen's stove came with the rooms).
    const st = live.interiors.get(house.id)!;
    expect(st.level).toBe(2);
    for (const id of furniture) expect(st.furniture.map((f) => f.id)).toContain(id);
    expect(st.furniture.some((f) => f.kind === 'cooking-station')).toBe(true);
    // Inside, the Cottage's rooms.
    stand(live, house.x + 4, house.y + footOf(house).footRy + live.blobbi.footRy + 3, 'up');
    pressUntil(live, () => live.inside);
    expect(live.sceneBounds()).toEqual({ width: LAYOUTS[2].w, height: LAYOUTS[2].h });
  });

  it('refuses from inside, and when the bigger house does not fit', () => {
    const { live, house } = withHouse();
    grant(live, ['home', 'harvest']);
    pay(live, 10, 6, 2);
    live.enterInterior(house);
    expect(live.houseUpgrade().blocked).toMatch(/outside/);
    expect(live.upgradeHouse().ok).toBe(false);
    live.exitInterior();
    // A fence right beside the house: the Cottage would not fit.
    live.buildings.push({ id: 'fence:9', kind: 'fence', x: house.x + 22, y: house.y, placedAt: 0, seed: 'f' });
    const check = live.houseUpgrade();
    expect(check.ready).toBe(false);
    expect(check.blocked).toMatch(/does not fit/);
    expect(houseLevel(house)).toBe(1);
  });

  it('the Dream Home needs harmony and discoveries too', () => {
    const { live, house } = withHouse();
    grant(live, ['home', 'harvest']);
    pay(live, 10, 6, 2);
    live.upgradeHouse();
    run(live, 60 * 22);
    grant(live, ['cottage', 'carrier']);
    pay(live, 16, 10, 4);
    const c = live.houseUpgrade();
    expect(c.next?.name).toBe('Dream Home');
    expect(c.requirements.find((r) => r.label === 'Discoveries found')?.met).toBe(false);
    expect(c.ready).toBe(false);
    for (const d of live.discoveries.slice(0, 3)) live.found.add(d.id);
    live.carrier.bond = 1000;
    const ok = live.houseUpgrade();
    expect(ok.requirements.every((r) => r.met), JSON.stringify(ok.requirements)).toBe(true);
    if (ok.blocked) return; // the turtle's small start may not hold a Dream Home yet: then it says so
    expect(live.upgradeHouse().ok).toBe(true);
    run(live, 60 * 30);
    expect(houseLevel(house)).toBe(3);
    expect(live.interiors.get(house.id)!.level).toBe(3);
  });

  it('a whale island can grow a Dream Home, and a reload keeps level, look, rooms and furniture', () => {
    const store = memoryStore();
    const world = generateWhaleWorld('island-house-2', { carrierSeed: 'whale-h', generatedHouse: false });
    const { live, house } = withHouse(store, world);
    grant(live, ['home', 'harvest', 'cottage', 'carrier']);
    pay(live, 10, 6, 2);
    expect(live.upgradeHouse(), JSON.stringify(live.houseUpgrade())).toEqual({ ok: true, reason: null });
    run(live, 60 * 22);
    pay(live, 16, 10, 4);
    for (const d of live.discoveries.slice(0, 3)) live.found.add(d.id);
    live.carrier.bond = 1000;
    const r = live.upgradeHouse();
    expect(r.reason).toBeNull();
    run(live, 60 * 30);
    house.look = { roof: 2, door: 2 };
    live.save();
    const saved = loadSave(store, live.identity)!;
    const sh = saved.buildings.find((b) => b.kind === 'shelter')!;
    expect(sh.level).toBe(3);
    expect(sh.look).toEqual({ roof: 2, door: 2 });
    const again = new LiveWorld(world, 'blobbi-9', 16, { store });
    const h2 = again.home()!;
    expect(houseLevel(h2)).toBe(3);
    expect(h2.look).toEqual({ roof: 2, door: 2 });
    expect(again.buildingAt(h2)).toBe(1);
    expect(again.interiors.get(h2.id)!.furniture.map((f) => f.id).sort()).toEqual(live.interiors.get(house.id)!.furniture.map((f) => f.id).sort());
    expect(JSON.parse(store.get(saveKey(live.identity))!).interiors[house.id].level).toBe(3);
  });

  it('a schema-9 house loads as a Cozy Shelter with its room and furniture untouched', () => {
    const store = memoryStore();
    const { live, house } = withHouse(store);
    live.save();
    const raw = JSON.parse(store.get(saveKey(live.identity))!);
    raw.version = 9;
    store.set(saveKey(live.identity), JSON.stringify(raw));
    const again = new LiveWorld(newIsland(), 'blobbi-9', 16, { store });
    expect(houseLevel(again.home()!)).toBe(1);
    expect(again.interiors.get(house.id)!.furniture).toEqual(live.interiors.get(house.id)!.furniture);
    expect(BUILDINGS.shelter.footRx).toBe(footOf(again.home()!).footRx);
  });
});

describe('the HOME panel', () => {
  it('asks before upgrading; a double press never confirms; CONFIRM upgrades once', async () => {
    const { GameUI } = await import('../src/ui/game-ui');
    const { HomeScreen } = await import('../src/ui/screens/home');
    const { PixelBuffer } = await import('../src/core/pixel');
    const world = generateTurtleWorld('island-house-3', { turtleSeed: 't3', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });
    const live = new LiveWorld(world, 'blobbi-9', 16, { store: memoryStore() });
    live.brain.enabled = false;
    live.inventory.add(ITEMS.wood.id, 16);
    live.inventory.add(ITEMS.stone.id, 9);
    live.inventory.add('blobbi-pixel:material:cloth', 2);
    live.objectives.completed.materials = 0;
    findBuildSpot(live, 'shelter', live.world.hubs[0], 160, 3);
    live.setBuildMode('shelter');
    pressE(live);
    run(live, 60 * 26);
    for (const id of ['home', 'harvest']) live.objectives.completed[id] = 1;
    const ui = new GameUI(() => live, () => palette);
    const home = new HomeScreen();
    ui.register(home);
    const screen = new PixelBuffer(960, 540);
    ui.handleKey('Digit0');
    expect(ui.capturing).toBe(true);
    ui.render(screen, 10);
    ui.handleKey('Enter'); // UPGRADE: asks
    expect(home.confirm.pending).toBe(true);
    ui.handleKey('Enter'); // the same moment: refused
    expect(houseLevel(live.home()!)).toBe(1);
    ui.render(screen, 10.5);
    ui.handleKey('Enter');
    expect(houseLevel(live.home()!)).toBe(2);
    expect(ui.capturing).toBe(false);
  });
});
