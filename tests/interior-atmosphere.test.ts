/**
 * INTERIOR ATMOSPHERE: the daylight through a room's windows follows the hour (quantized, cached), rain shows in the
 * glass, stars at night; all pure functions of (seed, world time), on the pixel grid, never over the frame's cross.
 * The default light paints the M5 room unchanged (the pins in housing.test.ts stay valid).
 */
import { describe, expect, it } from 'vitest';
import { hex } from '../src/core/color';
import { hash32 } from '../src/core/rng';
import { PixelBuffer } from '../src/core/pixel';
import { DAY_SECONDS, FULL_ROOM_LIGHT, START_HOUR, rainAt, roomLightAt, roomLightKey, type RoomLight } from '../src/game/daylight';
import { LAYOUTS, roomSprite, sunlitFloor } from '../src/game/interior';
import { blanketOf, drawWindowRain, drawWindowStars } from '../src/render/interior-render';
import { buildingSprite } from '../src/game/buildings';
import { ART, FABRICS } from '../src/game/furniture-art';
import { PLACEABLE_CONTENT } from '../src/content/placeables';
import { paletteFor } from '../src/world/generate';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { IDLE_INPUT, LiveWorld, MAX_MOTES } from '../src/sim/live-world';
import { memoryStore } from '../src/game/persistence';
import { findBuildSpot, pressE, run } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';

const SEED = 'atmosphere-island';
const palette = paletteFor('island');
const L1 = LAYOUTS[1];
const WIN = L1.windows[0];
const at = (hour: number, day = 0) => day * DAY_SECONDS + (((hour - START_HOUR + 24) % 24) / 24) * DAY_SECONDS;
const h = (b: PixelBuffer) => hash32(Array.from(b.data, (c) => c.toString(36)).join(','));
const clearDay = (hour: number) => {
  for (let d = 0; d < 40; d++) if (rainAt(SEED, at(hour, d)) === 0) return d;
  throw new Error('no clear day');
};
const rainyDay = () => {
  for (let d = 0; d < 40; d++) if (rainAt(SEED, at(14.5, d)) >= 0.99) return d;
  throw new Error('no rainy day');
};
const sunlit = (light: RoomLight) => {
  const px: { x: number; y: number }[] = [];
  for (let y = L1.wallH; y < L1.h; y++) for (let x = 0; x < L1.w; x++) if (sunlitFloor(L1, light, x, y)) px.push({ x, y });
  return px;
};
const centreX = (px: { x: number }[]) => px.reduce((s, p) => s + p.x, 0) / px.length;

describe('the light in a room', () => {
  it('follows the hour, quantized: full at noon, gone at night, half and gold at dawn and dusk, leaning with the sun', () => {
    const noon = roomLightAt(SEED, at(12, clearDay(12)));
    expect(noon).toEqual({ shaft: 1, warm: 0, lean: 0, rain: 0, night: false });
    const night = roomLightAt(SEED, at(23));
    expect(night).toEqual({ shaft: 0, warm: 0, lean: 0, rain: 0, night: true });
    const dawn = roomLightAt(SEED, at(6.25));
    expect(dawn.shaft).toBeGreaterThan(0.125);
    expect(dawn.shaft).toBeLessThan(0.875);
    expect(dawn.warm).toBeGreaterThan(0);
    expect(dawn.night).toBe(false);
    const dusk = roomLightAt(SEED, at(19));
    expect(dusk.shaft).toBeGreaterThan(0);
    expect(dusk.shaft).toBeLessThan(1);
    expect(dusk.warm).toBeGreaterThan(0);
    // Quantized: eighths, quarters.
    for (const l of [dawn, dusk]) {
      expect(Number.isInteger(l.shaft * 8)).toBe(true);
      expect(Number.isInteger(l.warm * 4)).toBe(true);
      expect(Number.isInteger(l.lean * 4)).toBe(true);
    }
    // The sun's side: morning light leans right, noon straight, evening left.
    expect(roomLightAt(SEED, at(7.5, clearDay(7.5))).lean).toBeGreaterThan(0);
    expect(roomLightAt(SEED, at(17, clearDay(17))).lean).toBeLessThan(0);
    expect(roomLightAt(SEED, at(7, clearDay(7)))).toEqual(FULL_ROOM_LIGHT);
    // A whole day at one-second steps passes through a few dozen states, not thousands.
    const keys = new Set<string>();
    for (let t = 0; t < DAY_SECONDS; t++) keys.add(roomLightKey(roomLightAt(SEED, at(START_HOUR, clearDay(12)) + t)));
    expect(keys.size).toBeGreaterThan(6);
    expect(keys.size).toBeLessThan(80);
  });

  it('rain outside greys the window and thins the daylight', () => {
    const wet = roomLightAt(SEED, at(14.5, rainyDay()));
    const dry = roomLightAt(SEED, at(14.5, clearDay(14.5)));
    expect(wet.rain).toBeGreaterThanOrEqual(0.75);
    expect(dry.rain).toBe(0);
    expect(wet.shaft).toBeLessThan(dry.shaft);
    expect(wet.shaft).toBeGreaterThan(0);
    const style = { floor: 0, wall: 0 };
    const sky = hex('#9ad0f0');
    const wetRoom = roomSprite(style, palette, sky, L1, wet);
    const dryRoom = roomSprite(style, palette, sky, L1, dry);
    // The glass (a corner pixel, off the frame and the glint) is greyed; the wall beside it is not.
    expect(wetRoom.get(WIN.x0, WIN.y1)).not.toBe(dryRoom.get(WIN.x0, WIN.y1));
    expect(dryRoom.get(WIN.x0, WIN.y1)).toBe(sky);
    expect(wetRoom.get(WIN.x0 - 3, WIN.y1)).toBe(dryRoom.get(WIN.x0 - 3, WIN.y1));
  });
});

describe('daylight on the floor', () => {
  it('is the M5 pool in the default light, pixel for pixel (the housing pins stay valid)', () => {
    const base = roomSprite({ floor: 0, wall: 0 }, palette, hex('#9ad0f0'), L1);
    expect(h(base)).toBe(1282409113);
    expect(h(roomSprite({ floor: 0, wall: 0 }, palette, hex('#9ad0f0'), L1, FULL_ROOM_LIGHT))).toBe(1282409113);
    expect(h(roomSprite({ floor: 0, wall: 0 }, palette, hex('#9ad0f0'), L1, roomLightAt(SEED, at(7, clearDay(7)))))).toBe(1282409113);
  });

  it('fades by ordered dither (full, half, a quarter, none) and leans with the hour', () => {
    const full = sunlit({ ...FULL_ROOM_LIGHT, lean: 0 });
    const half = sunlit({ ...FULL_ROOM_LIGHT, lean: 0, shaft: 0.5 });
    const quarter = sunlit({ ...FULL_ROOM_LIGHT, lean: 0, shaft: 0.25 });
    const none = sunlit({ ...FULL_ROOM_LIGHT, lean: 0, shaft: 0 });
    expect(full.length).toBeGreaterThan(300);
    expect(half.length / full.length).toBeGreaterThan(0.4);
    expect(half.length / full.length).toBeLessThan(0.6);
    expect(quarter.length / full.length).toBeGreaterThan(0.15);
    expect(quarter.length / full.length).toBeLessThan(0.35);
    expect(none.length).toBe(0);
    // Every lit pixel lies under the window's band, never above the floor.
    for (const p of full) {
      expect(p.y).toBeGreaterThanOrEqual(L1.wallH);
      expect(p.y).toBeLessThan(L1.wallH + 34);
    }
    const right = centreX(sunlit({ ...FULL_ROOM_LIGHT, lean: 1 }));
    const straight = centreX(full);
    const left = centreX(sunlit({ ...FULL_ROOM_LIGHT, lean: -1 }));
    expect(right).toBeGreaterThan(straight + 2);
    expect(left).toBeLessThan(straight - 2);
    // Warmth tints the pool: the same pixels, a different colour; a night room has no pool and no glint.
    const style = { floor: 0, wall: 0 };
    const sky = hex('#9ad0f0');
    const cool = roomSprite(style, palette, sky, L1, { ...FULL_ROOM_LIGHT, lean: 0 });
    const gold = roomSprite(style, palette, sky, L1, { ...FULL_ROOM_LIGHT, lean: 0, warm: 1 });
    const lit = full.find((p) => (p.x + p.y) % 2 === 0 && cool.get(p.x, p.y) !== cool.get(p.x, p.y + 1))!;
    expect(cool.get(lit.x, lit.y)).not.toBe(gold.get(lit.x, lit.y));
    const nightSky = hex('#1f2c4d');
    const night = roomSprite(style, palette, nightSky, L1, { shaft: 0, warm: 0, lean: 0, rain: 0, night: true });
    const day = roomSprite(style, palette, sky, L1, { ...FULL_ROOM_LIGHT, lean: 0 });
    expect(night.get(WIN.x0 + 2, WIN.y0 + 2)).toBe(nightSky);
    expect(day.get(WIN.x0 + 2, WIN.y0 + 2)).not.toBe(sky);
    // Away from the window the floor is the same by night and by day (the night tint is applied by the view, later).
    expect(night.get(20, 80)).toBe(day.get(20, 80));
  });
});

describe('weather in the window', () => {
  const blank = () => {
    const b = new PixelBuffer(L1.w, L1.h);
    b.fill(hex('#102030'));
    return b;
  };
  const changed = (b: PixelBuffer) => {
    const px: { x: number; y: number }[] = [];
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (b.get(x, y) !== hex('#102030')) px.push({ x, y });
    return px;
  };
  const midX = Math.round((WIN.x0 + WIN.x1) / 2);
  const midY = Math.round((WIN.y0 + WIN.y1) / 2);

  it('rain streaks fall only inside the glass, never over the cross; the same moment draws the same rain; none when dry', () => {
    const a = blank();
    drawWindowRain(a, WIN, 1, 10.3, SEED, 0, 0);
    const px = changed(a);
    expect(px.length).toBeGreaterThan(2);
    expect(px.length).toBeLessThanOrEqual(2 * Math.ceil((WIN.x1 - WIN.x0 + 1) / 3));
    for (const p of px) {
      expect(p.x).toBeGreaterThanOrEqual(WIN.x0);
      expect(p.x).toBeLessThanOrEqual(WIN.x1);
      expect(p.y).toBeGreaterThanOrEqual(WIN.y0);
      expect(p.y).toBeLessThanOrEqual(WIN.y1);
      expect(p.x).not.toBe(midX);
      expect(p.y).not.toBe(midY);
    }
    const b = blank();
    drawWindowRain(b, WIN, 1, 10.3, SEED, 0, 0);
    expect(h(b)).toBe(h(a));
    const later = blank();
    drawWindowRain(later, WIN, 1, 10.3 + 1 / 24, SEED, 0, 0);
    expect(h(later)).not.toBe(h(a));
    const light = blank();
    drawWindowRain(light, WIN, 0.25, 10.3, SEED, 0, 0);
    expect(changed(light).length).toBeLessThan(px.length);
    const dry = blank();
    drawWindowRain(dry, WIN, 0, 10.3, SEED, 0, 0);
    expect(changed(dry).length).toBe(0);
    // A camera offset moves the streaks with the room.
    const moved = blank();
    drawWindowRain(moved, WIN, 1, 10.3, SEED, 5, 3);
    expect(changed(moved).map((p) => `${p.x + 5},${p.y + 3}`)).toEqual(px.map((p) => `${p.x},${p.y}`));
  });

  it('stars: at most three in the glass, off the cross, twinkling on a two-second step', () => {
    const seen = new Set<string>();
    const counts: number[] = [];
    for (let tick = 0; tick < 9; tick++) {
      const b = blank();
      drawWindowStars(b, WIN, hex('#1f2c4d'), tick * 2 + 0.5, SEED, 0, 0);
      const px = changed(b);
      counts.push(px.length);
      expect(px.length).toBeLessThanOrEqual(3);
      for (const p of px) {
        expect(p.x).toBeGreaterThanOrEqual(WIN.x0);
        expect(p.x).toBeLessThanOrEqual(WIN.x1);
        expect(p.y).toBeGreaterThanOrEqual(WIN.y0);
        expect(p.y).toBeLessThanOrEqual(WIN.y1);
        expect(p.x).not.toBe(midX);
        expect(p.y).not.toBe(midY);
        seen.add(`${p.x},${p.y}`);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
    expect(seen.size).toBeLessThanOrEqual(3);
    expect(new Set(counts).size).toBeGreaterThan(1);
    // Within one step the sky is still: the same frame twice.
    const a = blank();
    const b = blank();
    drawWindowStars(a, WIN, hex('#1f2c4d'), 4.1, SEED, 0, 0);
    drawWindowStars(b, WIN, hex('#1f2c4d'), 5.9, SEED, 0, 0);
    expect(h(a)).toBe(h(b));
  });
});

describe('dust motes in the daylight', () => {
  /** A Cozy Shelter built and entered on a fresh whale island (the same every time). */
  const indoors = (): LiveWorld => {
    const world = generateWhaleWorld('mote-island', { carrierSeed: 'mote-whale', generatedHouse: false });
    const live = new LiveWorld(world, 'blobbi-9', 16, { store: memoryStore() });
    live.brain.enabled = false;
    live.inventory.add(ITEMS.wood.id, 6);
    live.inventory.add(ITEMS.stone.id, 3);
    live.objectives.completed.materials = 0;
    findBuildSpot(live, 'shelter');
    live.setBuildMode('shelter');
    pressE(live);
    run(live, 60 * 26);
    expect(live.enterInterior(live.home()!)).toBe(true);
    live.brain.enabled = false;
    return live;
  };
  const seedOf = (live: LiveWorld) => live.world.seed;
  /** The world time offset that puts the room at `hour` on a clear (or a rainy) day, whatever the clock has run. */
  const dayWhen = (live: LiveWorld, hour: number, rain: boolean) => {
    for (let d = 1; d < 40; d++) {
      const r = rainAt(seedOf(live), at(hour, d));
      if (rain ? r >= 0.99 : r === 0) return at(hour, d) - live.clock.time;
    }
    throw new Error('no such day');
  };
  const motes = (live: LiveWorld) => live.particles.particles.filter((p) => p.kind === 'mote');

  it('drift in by day, never more than the cap, only in the window\'s light; none at night or in rain; none outdoors', () => {
    const live = indoors();
    live.timeOffset = dayWhen(live, 12, false);
    let most = 0;
    for (let i = 0; i < 60 * 30; i++) {
      live.update(1 / 60, IDLE_INPUT);
      most = Math.max(most, live.particles.count('mote'));
    }
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(MAX_MOTES);
    expect(live.particles.count('mote')).toBeGreaterThanOrEqual(3);
    const layout = LAYOUTS[1];
    for (const m of motes(live)) {
      expect(m.y).toBeGreaterThanOrEqual(layout.wallH);
      expect(m.y).toBeLessThan(layout.wallH + 40);
      expect(m.x).toBeGreaterThan(WIN.x0 - 20);
      expect(m.x).toBeLessThan(WIN.x1 + 20);
      expect(m.front).toBe(false);
    }
    // Night: the motes already there fade out within their lives and no new one comes.
    live.timeOffset = dayWhen(live, 23, false);
    for (let i = 0; i < 60 * 10; i++) live.update(1 / 60, IDLE_INPUT);
    expect(live.particles.count('mote')).toBe(0);
    // Rain: none either.
    live.timeOffset = dayWhen(live, 14.5, true);
    for (let i = 0; i < 60 * 10; i++) live.update(1 / 60, IDLE_INPUT);
    expect(live.particles.count('mote')).toBe(0);
    // Outdoors: the island's particles never hold a mote.
    live.exitInterior();
    live.timeOffset = dayWhen(live, 12, false);
    for (let i = 0; i < 60 * 10; i++) live.update(1 / 60, IDLE_INPUT);
    expect(live.particles.count('mote')).toBe(0);
  });

  it('draw from their own stream: a visit indoors leaves the island\'s birds, butterflies and fireflies exactly as they would have been', () => {
    // Two identical worlds; in one the motes are silenced. Both go indoors for the same while, then back out: the
    // island's ambient life after the visit must not differ by a pixel.
    const a = indoors();
    const b = indoors();
    (b as unknown as { stepRoomAtmosphere: () => void }).stepRoomAtmosphere = () => {};
    a.timeOffset = b.timeOffset = dayWhen(a, 12, false);
    for (let i = 0; i < 60 * 20; i++) {
      a.update(1 / 60, IDLE_INPUT);
      b.update(1 / 60, IDLE_INPUT);
    }
    expect(a.particles.count('mote')).toBeGreaterThan(0);
    expect(b.particles.count('mote')).toBe(0);
    a.exitInterior();
    b.exitInterior();
    const ambient = (live: LiveWorld) => live.particles.particles.filter((p) => p.kind === 'butterfly' || p.kind === 'bird' || p.kind === 'firefly').map((p) => [p.kind, p.x, p.y, p.vx, p.vy, p.age]);
    let seen = 0;
    for (let i = 0; i < 60 * 90; i++) {
      a.update(1 / 60, IDLE_INPUT);
      b.update(1 / 60, IDLE_INPUT);
      const sa = ambient(a);
      expect(sa).toEqual(ambient(b));
      seen = Math.max(seen, sa.length);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('are the same on every run (seeded), and never crowd out the room\'s other effects', () => {
    const a = indoors();
    const b = indoors();
    a.timeOffset = b.timeOffset = dayWhen(a, 12, false);
    for (let i = 0; i < 60 * 12; i++) {
      a.update(1 / 60, IDLE_INPUT);
      b.update(1 / 60, IDLE_INPUT);
    }
    expect(motes(a).map((m) => [m.x, m.y, m.age])).toEqual(motes(b).map((m) => [m.x, m.y, m.age]));
    expect(motes(a).length).toBeGreaterThan(0);
    // A heart (a reaction) still spawns and is drawn in front, beside the motes.
    a.particles.heart(60, 60);
    expect(a.particles.count('heart')).toBe(1);
    expect(a.particles.particles.length).toBeLessThanOrEqual(MAX_MOTES + 1);
  });
});

describe('furniture polish (bed, chest, workbench)', () => {
  const sprite = (kind: string, variant = 0) => buildingSprite({ id: `${kind}:0`, kind, x: 0, y: 0, placedAt: 0, seed: `polish/${kind}`, ...(variant ? { variant } : {}) }, palette, 1, 1.6);
  const opaque = (b: PixelBuffer) => {
    let n = 0;
    for (const c of b.data) if (c >>> 24) n++;
    return n;
  };

  it('keeps every sprite\'s size, anchor and footprint (so collision, placement and the room layouts stay as they were)', () => {
    const expected: Record<string, [number, number, number, number, number, number]> = {
      bed: [18, 16, 9, 11, 7, 4],
      chest: [13, 11, 6, 8, 5, 2],
      workbench: [17, 12, 8, 9, 7, 2],
      table: [13, 11, 6, 8, 5, 2],
      chair: [9, 13, 4, 10, 3, 2],
    };
    for (const [kind, [w, h, ax, ay, rx, ry]] of Object.entries(expected)) {
      const s = sprite(kind);
      expect([s.buffer.width, s.buffer.height, s.anchorX, s.anchorY, s.footRx, s.footRy], kind).toEqual([w, h, ax, ay, rx, ry]);
      // A solid piece: opaque over more than half its box (no holes that would read as a changed silhouette).
      expect(opaque(s.buffer) / (w * h), kind).toBeGreaterThan(0.55);
    }
    for (const kind of ['bed', 'chest', 'workbench']) expect(PLACEABLE_CONTENT.find((p) => p.kind === kind)?.variants ?? 1).toBe(kind === 'bed' ? FABRICS.length : 1);
  });

  it('the bed\'s blanket still starts at row 8 of the outlined sprite, in every colourway, so the sleeping Blobbi is tucked in as before', () => {
    for (let v = 0; v < FABRICS.length; v++) {
      const f = FABRICS[v];
      const s = sprite('bed', v);
      // Row 8: the blanket's folded top edge, all the way across the mattress.
      for (let x = 2; x <= 15; x++) expect(s.buffer.get(x, 8), `variant ${v} x ${x}`).toBe(f.light);
      // Row 7: sheet and pillow, no blanket.
      for (let x = 2; x <= 15; x++) expect([f.light, f.mid, f.dark], `variant ${v} x ${x}`).not.toContain(s.buffer.get(x, 7));
      // The blanket cut keeps rows 8 and below, nothing above.
      const cut = blanketOf(s);
      for (let y = 0; y < 8; y++) for (let x = 0; x < cut.buffer.width; x++) expect(cut.buffer.get(x, y) >>> 24).toBe(0);
      expect(cut.buffer.get(8, 8)).toBe(f.light);
      expect(cut.anchorY).toBe(s.anchorY);
    }
    // Colourways still differ from one another, and the art is a pure function of its inputs.
    const a = ART.bed({ seed: 's', palette, variant: 0 });
    expect(h(a)).toBe(h(ART.bed({ seed: 's', palette, variant: 0 })));
    expect(h(a)).not.toBe(h(ART.bed({ seed: 's', palette, variant: 1 })));
  });
});
