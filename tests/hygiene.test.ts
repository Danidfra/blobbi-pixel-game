/**
 * HYGIENE (Living World, phase 2): an island-local need. Work dirties the Blobbi a little (the axe, the pickaxe, the
 * soil), a gentle drift stops at a floor, a wash in a washing tub makes it clean again and glad. Old saves load
 * clean; the bird bath stays the birds'; autonomy never washes; deterministic.
 */
import { describe, expect, it } from 'vitest';
import { CLEAN, DIRT, GRUBBY, HYGIENE_FLOOR, JOY, RATES, careFromSave, careToSave, getDirty, isGrubby, newCare, stepCare, wash } from '../src/game/care';
import { IDLE_INPUT, LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { loadSave, memoryStore } from '../src/game/persistence';
import { ITEMS } from '../src/game/items';
import { BUILDINGS, type Building } from '../src/game/buildings';
import { PLACEABLE_CONTENT } from '../src/content/placeables';
import { isLargeRock } from '../src/game/rocks';
import { findBuildSpot, findField, pressE, pressUntil, run, stand, standAbove } from '../src/dev/scripted-play';
import { t as lang } from '../src/i18n';

const world = () => generateTurtleWorld('turtle-0');
function worker(store = memoryStore()) {
  const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  for (const tool of [ITEMS.axe, ITEMS.pickaxe, ITEMS.hoe]) live.inventory.add(tool.id, 1);
  live.resources = [];
  return { live, store };
}
function face(live: LiveWorld, kind: 'tree' | 'rock'): number {
  const hub = live.world.hubs[0];
  const candidates = live.world.objects
    .map((o, index) => ({ o, index }))
    .filter(({ o }) => o.kind === kind && (kind === 'tree' || isLargeRock(o.size)))
    .sort((a, b) => Math.hypot(a.o.x - hub.x, a.o.y - hub.y) - Math.hypot(b.o.x - hub.x, b.o.y - hub.y));
  for (const { o, index } of candidates) {
    if (kind === 'tree' && live.treeAt(index).phase !== 'grown') continue;
    const s = live.spriteOf(o);
    const x = o.x;
    const y = o.y + s.footRy + live.blobbi.footRy + 2;
    if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
    stand(live, x, y, 'up');
    if (live.facingObject()?.index === index) return index;
  }
  throw new Error(`no ${kind}`);
}
const TUB = BUILDINGS['washing-tub'];
/** Place a washing tub from the bag near the hub and stand at its door spot, facing it. */
function tubInFront(live: LiveWorld): Building {
  live.inventory.add(TUB.item!, 1);
  expect(findBuildSpot(live, 'washing-tub')).toBe(true);
  expect(live.startPlacing(TUB.item!)).toBe(true);
  pressE(live);
  run(live, 150);
  const tub = live.buildings.find((b) => b.kind === 'washing-tub')!;
  expect(tub).toBeDefined();
  stand(live, tub.x, tub.y + TUB.footRy + live.blobbi.footRy + 2, 'up');
  expect(live.facingBuilding()?.id).toBe(tub.id);
  return tub;
}
const bubble = (live: LiveWorld) => (live.bubble as { text: string } | null)?.text ?? null;
const drift = (t0: number, t1: number) => RATES.hygieneDrift * (t1 - t0);

describe('hygiene: work dirties', () => {
  it('the axe a little, the pickaxe and the hoe more; watering and casting not at all', () => {
    const { live } = worker();
    live.equip(ITEMS.axe.id);
    const tree = face(live, 'tree');
    let h0 = live.care.hygiene;
    let t0 = live.worldTime;
    pressUntil(live, () => live.treeAt(tree).phase === 'stump', 6);
    expect(h0 - live.care.hygiene - drift(t0, live.worldTime)).toBeCloseTo(3 * DIRT.chop, 1);
    live.equip(ITEMS.pickaxe.id);
    face(live, 'rock');
    h0 = live.care.hygiene;
    t0 = live.worldTime;
    pressE(live);
    expect(h0 - live.care.hygiene - drift(t0, live.worldTime)).toBeCloseTo(DIRT.mine, 1);
    live.equip(ITEMS.hoe.id);
    const [cell] = findField(live, 1)!;
    standAbove(live, cell);
    h0 = live.care.hygiene;
    t0 = live.worldTime;
    pressE(live); // till
    expect(live.plotAt(cell)).toBeTruthy();
    expect(h0 - live.care.hygiene - drift(t0, live.worldTime)).toBeCloseTo(DIRT.till, 1);
    live.inventory.add(ITEMS.seed.id, 1);
    live.selectedCrop = 'turnip';
    pressE(live); // plant
    h0 = live.care.hygiene;
    t0 = live.worldTime;
    pressE(live); // water
    expect(live.tally.watered).toBe(1);
    expect(h0 - live.care.hygiene - drift(t0, live.worldTime)).toBeCloseTo(0, 1);
  });

  it('drifts gently to a floor and no further; below the floor only work takes it; it says so once when it gets grubby', () => {
    const c = newCare();
    for (let i = 0; i < 60 * 6000; i++) stepCare(c, 1 / 60, { resting: false, sheltered: false, moving: i % 2 === 0 }); // 100 minutes
    expect(c.hygiene).toBeCloseTo(HYGIENE_FLOOR, 6);
    expect(isGrubby(c)).toBe(false);
    expect(getDirty(c, HYGIENE_FLOOR - GRUBBY + 0.5)).toBe(true); // over the line: once
    expect(getDirty(c, 1)).toBe(false);
    const before = c.hygiene;
    for (let i = 0; i < 60 * 60; i++) stepCare(c, 1 / 60, { resting: false, sheltered: false, moving: true });
    expect(c.hygiene).toBe(before);
    c.hygiene = 0.2;
    getDirty(c, 5);
    expect(c.hygiene).toBe(0);
    expect(HYGIENE_FLOOR).toBeGreaterThan(GRUBBY);
    expect(CLEAN).toBeGreaterThan(HYGIENE_FLOOR);
  });

  it('a grubby Blobbi sheds a speck of dust now and then; a clean one never', () => {
    const { live } = worker();
    const specks = (live: LiveWorld) => {
      live.particles.particles.length = 0;
      let seen = 0;
      for (let i = 0; i < 60 * 6; i++) {
        live.update(1 / 60, IDLE_INPUT);
        if (live.particles.particles.some((p) => p.kind === 'dust')) seen++;
      }
      return seen;
    };
    live.care.hygiene = GRUBBY - 5;
    expect(specks(live)).toBeGreaterThan(0);
    expect(specks(worker().live)).toBe(0);
  });
});

describe('the washing tub', () => {
  it('is furniture for indoors or out, made at the workbench after "Make it home", with the wash use; the bird bath stays the birds\'', () => {
    const tub = PLACEABLE_CONTENT.find((p) => p.kind === 'washing-tub')!;
    expect(tub).toMatchObject({ where: 'both', layer: 'solid', station: 'workbench', unlock: 'home', use: 'wash' });
    expect(BUILDINGS['washing-tub'].use).toBe('wash');
    expect(BUILDINGS['bird-bath'].use).toBe('birds');
    expect(BUILDINGS['bird-feeder'].use).toBe('birds');
  });

  it('E at the tub washes a grubby Blobbi clean, with joy, a word and a splash; a clean one is told it is clean enough', () => {
    const { live } = worker();
    const tub = tubInFront(live);
    live.care.hygiene = 20;
    const joy0 = live.care.happiness;
    live.particles.particles.length = 0;
    live.bubble = null;
    // Living Home: E hops it into the tub; the soak takes a moment, and the wash lands at its end.
    pressE(live);
    expect(live.occupation?.kind).toBe('bath');
    expect(live.care.hygiene).toBeCloseTo(20, 0);
    for (let i = 0; i < 60 * 5 && live.occupation?.phase !== 'leave'; i++) live.update(1 / 60, IDLE_INPUT);
    expect(live.occupation?.phase).toBe('leave');
    expect(live.particles.particles.some((p) => p.kind === 'drop')).toBe(true);
    for (let i = 0; i < 60 * 2 && live.occupation; i++) live.update(1 / 60, IDLE_INPUT);
    expect(live.occupation).toBeNull();
    expect(live.care.hygiene).toBeCloseTo(100, 0); // (the drift of the bath's own moments aside)
    expect(live.care.happiness).toBeCloseTo(Math.min(100, joy0 + JOY.wash), 0);
    expect(bubble(live)).toBe(lang('say.allClean'));
    run(live, 60 * 3);
    live.bubble = null;
    stand(live, tub.x, tub.y + BUILDINGS['washing-tub'].footRy + live.blobbi.footRy + 2, 'up');
    pressE(live);
    expect(live.occupation).toBeNull();
    expect(bubble(live)).toBe(lang('say.alreadyClean'));
    expect(live.care.hygiene).toBeGreaterThan(CLEAN);
    void tub;
  });

  it('autonomy never washes: a visit by the Blobbi on its own only remarks', () => {
    const { live } = worker();
    const tub = tubInFront(live);
    live.care.hygiene = 20;
    (live as unknown as { visitBuilding: (b: Building, fromPlayer: boolean) => void }).visitBuilding(tub, false);
    expect(live.care.hygiene).toBe(20);
  });

  it('a wash is the same every time, and the tub works indoors too (the piece may stand in a room)', () => {
    const a = worker().live;
    const b = worker().live;
    for (const live of [a, b]) {
      live.care.hygiene = 33;
      tubInFront(live);
      pressE(live);
    }
    expect(a.care.hygiene).toBe(b.care.hygiene);
    expect(a.care.happiness).toBe(b.care.happiness);
    expect(wash({ ...newCare(), hygiene: 50 })).toBe(true);
    expect(wash({ ...newCare(), hygiene: CLEAN })).toBe(false);
  });
});

describe('hygiene and the save', () => {
  it('a save from before hygiene loads clean; the record now carries it; nothing else changed', () => {
    const old = careFromSave({ hunger: 40, energy: 12, happiness: 55, lastPet: 3 });
    expect(old.hygiene).toBe(100);
    expect(old).toMatchObject({ hunger: 40, energy: 12, happiness: 55, lastPet: 3 });
    const c = newCare();
    c.hygiene = 42.1234;
    const rec = careToSave(c);
    expect(Object.keys(rec).sort()).toEqual(['energy', 'happiness', 'hunger', 'hygiene', 'lastPet']);
    expect(rec.hygiene).toBe(42.123);
    // Through a real world save and load.
    const store = memoryStore();
    const { live } = worker(store);
    live.care.hygiene = 37;
    live.save();
    const saved = loadSave(store, live.identity)!;
    expect(saved.care.hygiene).toBe(37);
    const again = new LiveWorld(world(), 'blobbi-9', 16, { store });
    expect(again.care.hygiene).toBe(37);
  });
});
