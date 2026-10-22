/**
 * Smooth movement on screen: the camera and the Blobbi move by screen pixels at rest (not by whole world pixels, which
 * at 4× and 6× made the world jump 4 or 6 pixels on some frames and stand still on others), the Blobbi is drawn
 * between its last two steps (so every refresh rate and a frame a little early or late move it evenly), its shadow
 * moves with it, and the canvas covers whole device pixels at any pixel ratio.
 */
import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { SimClock } from '../src/sim/clock';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer } from '../src/render/view-renderer';
import { ViewCamera, blobbiScreenAnchor, gridSteps, onGrid, worldBounds, type CameraModeId, type ViewRect } from '../src/render/view-camera';
import { canvasBacking } from '../src/render/backing';
import { paletteFor } from '../src/world/generate';
import { cameraScene } from '../scripts/camera-scene';

const rest = (scale: number, originX: number, originY: number): ViewRect => ({ mode: 'closeup', scale, originX, originY, screenW: 960, screenH: 540, transitioning: false });

describe('the grid the view rests on', () => {
  it('moves by screen pixels at a whole scale, by world pixels in the canoe and below 1×', () => {
    expect([1, 2, 4, 6].map((s) => gridSteps(s))).toEqual([1, 2, 4, 6]);
    expect([1, 2, 4, 6].map((s) => gridSteps(s, 'world'))).toEqual([1, 1, 1, 1]);
    expect(gridSteps(0.75)).toBe(1);
    expect(gridSteps(2.5)).toBe(1);
    expect(onGrid(10.4, 1)).toBe(10);
    expect(onGrid(10.4, 4)).toBe(10.5);
    expect(onGrid(10.1, 6) * 6).toBeCloseTo(61, 9);
  });

  it('puts the anchor on exact screen pixels, and on the classic pixel whenever everything is on whole world pixels', () => {
    for (const s of [1, 2, 4, 5, 6])
      for (let k = 0; k < 40; k++) {
        // An origin on screen pixels (k/s is not exact in floating point for s = 6), the Blobbi anywhere.
        const v = rest(s, 100 + k / s, 50 + (3 * k) / s);
        const x = 120 + k * 0.37;
        const y = 80 + k * 0.29;
        const a = blobbiScreenAnchor(x, y, v);
        expect(Number.isInteger(a.x) && Number.isInteger(a.y)).toBe(true);
        // It is where the Blobbi rounded to the screen grid falls, exactly.
        expect(a.x).toBe(Math.round((Math.round(x * s) / s - v.originX) * s) + Math.floor(s / 2));
        // On whole world pixels: the formula used before the screen grid (centre column, bottom row of the block).
        const w = rest(s, 100 + k, 50 + k);
        const ix = 120 + k;
        const iy = 80 + k;
        const old = { x: Math.floor((ix - w.originX) * s + s / 2), y: Math.floor((iy - w.originY) * s + s - 1) };
        expect(blobbiScreenAnchor(ix, iy, w)).toEqual(old);
        expect(blobbiScreenAnchor(ix, iy, w, 'world')).toEqual(old);
      }
  });

  it('keeps to whole world pixels while the scale eases between modes', () => {
    const v: ViewRect = { ...rest(3.2, 100.3, 50.7), transitioning: true };
    expect(blobbiScreenAnchor(120.4, 80.6, v)).toEqual({ x: Math.floor((120 - 100.3) * 3.2 + 1.6), y: Math.floor((81 - 50.7) * 3.2 + 2.2) });
  });
});

describe('the canvas covers whole device pixels', () => {
  it('changes nothing at a whole pixel ratio', () => {
    for (const dpr of [1, 2, 3]) expect(canvasBacking(960, 540, dpr)).toEqual({ width: 960, height: 540, cssWidth: 960, cssHeight: 540, devicePerPixel: dpr });
    // A box a fraction of a pixel wide keeps whole canvas pixels, shown one to one.
    expect(canvasBacking(959.5, 540.4, 2)).toMatchObject({ width: 959, height: 540, cssWidth: 959, cssHeight: 540 });
  });

  it('by default a fractional ratio keeps the CSS-sized canvas (the menus keep their scale)', () => {
    expect(canvasBacking(915, 412, 2.625)).toEqual({ width: 915, height: 412, cssWidth: 915, cssHeight: 412, devicePerPixel: 3 });
  });

  it('asked for whole device pixels: every canvas pixel is a whole number of them, the box filled to under one', () => {
    for (const dpr of [1.1, 1.25, 1.5, 1.75, 2.25, 2.625, 2.75, 3.5])
      for (const [w, h] of [[1280, 720], [412, 915], [915, 412], [1366, 768]]) {
        const b = canvasBacking(w, h, dpr, { wholeDevicePixels: true });
        expect(Number.isInteger(b.devicePerPixel) && b.devicePerPixel >= 1).toBe(true);
        expect(b.devicePerPixel).toBe(Math.max(1, Math.round(dpr)));
        // CSS size × ratio = canvas pixels × whole device pixels.
        expect(b.cssWidth * dpr).toBeCloseTo(b.width * b.devicePerPixel, 6);
        expect(b.cssHeight * dpr).toBeCloseTo(b.height * b.devicePerPixel, 6);
        expect(b.cssWidth).toBeLessThanOrEqual(w + 1e-9);
        expect(w - b.cssWidth).toBeLessThan(b.devicePerPixel / dpr + 1e-9);
        // The canvas has ratio/round(ratio) canvas pixels per CSS pixel: between 0.75 (1.5 rounds up to 2) and 1.5.
        expect(b.width / w).toBeGreaterThan(0.74);
        expect(b.width / w).toBeLessThan(1.5);
        expect(b.width / w).toBeCloseTo(dpr / b.devicePerPixel, 2);
      }
  });

  it('survives a missing or odd pixel ratio', () => {
    expect(canvasBacking(800, 600, 0).width).toBe(800);
    expect(canvasBacking(800, 600, Number.NaN).width).toBe(800);
    expect(canvasBacking(0, 0, 1.5, { wholeDevicePixels: true })).toMatchObject({ width: 1, height: 1 });
  });
});

describe('drawing between steps', () => {
  it('the clock tells how far into the next step real time has run', () => {
    const c = new SimClock();
    expect(c.fraction).toBe(0);
    c.advance(1 / 120);
    expect(c.fraction).toBeCloseTo(0.5, 9);
    expect(c.advance(1 / 120)).toBe(1);
    expect(c.fraction).toBeLessThan(1e-9);
    c.paused = true;
    c.advance(0.01);
    expect(c.fraction).toBeLessThan(1e-9);
  });

  it('the Blobbi is drawn between its last two steps; a jump and the canoe never are; the simulation never moves', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    expect(live.interpolatedBlobbi()).toEqual({ x: live.blobbi.x, y: live.blobbi.y });
    live.update(1 / 60, { ...IDLE_INPUT, right: true });
    const from = live.blobbi.x;
    live.update(1 / 60, { ...IDLE_INPUT, right: true });
    const to = live.blobbi.x;
    expect(to).toBeGreaterThan(from);
    live.update(1 / 120, { ...IDLE_INPUT, right: true }); // half a step: no step runs
    expect(live.blobbi.x).toBe(to);
    expect(live.interpolatedBlobbi().x).toBeCloseTo(from + (to - from) * 0.5, 9);
    expect(live.blobbi.x).toBe(to);
    // Nothing reads where it is drawn: the next step starts from where it stands.
    live.drawnAt = live.interpolatedBlobbi();
    expect(live.drawnBlobbi()).toBe(live.drawnAt);
    live.update(1 / 120, { ...IDLE_INPUT, right: true });
    expect(live.blobbi.x - to).toBeCloseTo(to - from, 9);
    // A jump (a door, a teleport) is drawn where it lands.
    live.blobbi.x += 40;
    expect(live.interpolatedBlobbi().x).toBe(live.blobbi.x);
  });

  it('the camera target carries the grid: screen pixels on foot, world pixels in the canoe', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    expect(live.cameraTarget().grid).toBe('screen');
    expect(live.onWorldGrid).toBe(false);
    live.boarding = { from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, start: 0, into: true };
    expect(live.onWorldGrid).toBe(true);
    expect(live.cameraTarget().grid).toBe('world');
  });
});

const WALK_WORLD = generateTurtleWorld('turtle-0');

/**
 * Walk for a while under a following camera the way the page does, and record what the screen shows each frame. The
 * start is one where the Blobbi really walks the whole way (clear ground, far enough from the edges for the camera to
 * scroll freely): a walk that bumps into something is retried from the next spot.
 */
function walk(mode: CameraModeId, hz: number, dir: { x: number; y: number }, jitterMs = 0) {
  const start = clearStart(dir);
  return walkFrom(start.x, start.y, mode, hz, dir, jitterMs);
}

/**
 * Spots on 'turtle-0' from which the Blobbi walks 2.6 s in each direction without being stopped or slowed (found once
 * by searching the island; the world is deterministic). `clearStart` checks the walk really is clear, so a change to
 * the world that blocks one fails here, plainly, instead of measuring a Blobbi standing against a rock.
 */
const STARTS: Record<string, { x: number; y: number }> = { '1,0': { x: 238, y: 117 }, '0,1': { x: 447, y: 128 }, '1,1': { x: 436, y: 216 }, '-1,-1': { x: 513, y: 293 } };
const checked = new Set<string>();
function clearStart(dir: { x: number; y: number }): { x: number; y: number } {
  const key = `${dir.x},${dir.y}`;
  const start = STARTS[key];
  if (!start) throw new Error(`no start for ${key}`);
  if (checked.has(key)) return start;
  const live = new LiveWorld(WALK_WORLD, 'blobbi-9', 16);
  live.brain.enabled = false;
  live.blobbi.x = start.x;
  live.blobbi.y = start.y;
  const input = { ...IDLE_INPUT, right: dir.x > 0, left: dir.x < 0, down: dir.y > 0, up: dir.y < 0 };
  for (let i = 0; i < 160; i++) {
    const was = { x: live.blobbi.x, y: live.blobbi.y };
    live.update(1 / 60, input);
    // (it sets off over the first steps)
    if (i >= 5 && Math.hypot(live.blobbi.x - was.x, live.blobbi.y - was.y) <= (42 / 60) * 0.95) throw new Error(`the walk ${key} from ${start.x},${start.y} is no longer clear (step ${i})`);
  }
  checked.add(key);
  return start;
}

function walkFrom(x: number, y: number, mode: CameraModeId, hz: number, dir: { x: number; y: number }, jitterMs: number) {
  const world = WALK_WORLD;
  const live = new LiveWorld(world, 'blobbi-9', 16);
  live.brain.enabled = false;
  live.blobbi.x = x;
  live.blobbi.y = y;
  const camera = new ViewCamera(mode);
  const bounds = worldBounds(world);
  let seed = 7;
  const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5) * 2;
  let last = 0;
  const frames: { ox: number; oy: number; ax: number; ay: number; wx: number; wy: number }[] = [];
  const n = Math.round(hz * 2.5);
  for (let i = 0; i < n; i++) {
    const real = 1 / hz + (noise() * jitterMs) / 1000;
    const steps = live.update(real, { ...IDLE_INPUT, right: dir.x > 0, left: dir.x < 0, down: dir.y > 0, up: dir.y < 0 });
    live.drawnAt = live.interpolatedBlobbi();
    const drawnTime = live.clock.time + (live.clock.fraction - 1) * live.clock.dt;
    const followDt = i === 0 ? steps * live.clock.dt : Math.max(0, drawnTime - last);
    last = drawnTime;
    const v = camera.update(real, live.cameraTarget(), 960, 540, bounds, i === 0, followDt);
    const a = blobbiScreenAnchor(live.drawnAt.x, live.drawnAt.y, v);
    frames.push({ ox: Math.round(-v.originX * v.scale), oy: Math.round(-v.originY * v.scale), ax: a.x, ay: a.y, wx: live.blobbi.x, wy: live.blobbi.y });
  }
  // From the moment the camera has caught up (it eases in over the first half second).
  return frames.slice(Math.round(hz * 0.8));
}

describe('walking under a following camera: an even scroll', () => {
  const DIRS = { right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, diagonal: { x: 1, y: 1 }, upLeft: { x: -1, y: -1 } } as const;

  it('at 60 Hz the world scrolls every frame by about the same amount: no frozen frames, no block-sized jumps', () => {
    for (const mode of ['closeup', 'upclose'] as const)
      for (const [name, dir] of Object.entries(DIRS))
        for (const jitter of [0, 1.5]) {
          const f = walk(mode, 60, dir, jitter);
          for (const axis of ['x', 'y'] as const) {
            if (!(axis === 'x' ? dir.x : dir.y)) continue;
            const d = f.slice(1).map((p, i) => (axis === 'x' ? p.ox - f[i].ox : p.oy - f[i].oy));
            const mean = d.reduce((a, b) => a + b, 0) / d.length;
            const label = `${mode} ${name} ${axis} jitter ${jitter}`;
            // Never backwards, never still for a frame, never far off the mean: a pixel of rounding, and on the rare
            // frame where the camera's lag settles by a screen pixel (the Blobbi creeps one pixel on screen), one more.
            // Before the screen grid these frames scrolled 0 or a whole block (4 or 6 pixels).
            for (const x of d) {
              expect(x * Math.sign(mean), label).toBeGreaterThan(0);
              expect(Math.abs(x - mean), label).toBeLessThanOrEqual(2);
            }
            expect(d.filter((x) => Math.abs(x - mean) > 1.5).length, label).toBeLessThanOrEqual(3);
          }
        }
  }, 120_000);

  it('at 120, 144 and 75 Hz it never scrolls backwards and never by more than a step can carry', () => {
    for (const mode of ['exploration', 'closeup', 'upclose'] as const)
      for (const hz of [75, 120, 144])
        for (const [name, dir] of Object.entries(DIRS)) {
          const f = walk(mode, hz, dir);
          const scale = { exploration: 2, closeup: 4, upclose: 6 }[mode];
          // 42 world px/s; one display frame carries at most that much, rounded up, plus one pixel of rounding.
          const most = Math.ceil((42 * scale) / hz) + 1;
          for (const axis of ['x', 'y'] as const) {
            const sign = -(axis === 'x' ? dir.x : dir.y);
            if (!sign) continue;
            for (let i = 1; i < f.length; i++) {
              const step = axis === 'x' ? f[i].ox - f[i - 1].ox : f[i].oy - f[i - 1].oy;
              expect(step * sign, `${mode} ${hz} Hz ${name} ${axis} ${i}`).toBeGreaterThanOrEqual(0);
              expect(Math.abs(step), `${mode} ${hz} Hz ${name} ${axis} ${i}`).toBeLessThanOrEqual(most);
            }
          }
        }
  }, 120_000);

  it('the Blobbi holds still on screen while it walks steadily, and the walking speed is unchanged', () => {
    for (const mode of ['closeup', 'upclose'] as const)
      for (const [name, dir] of Object.entries(DIRS)) {
        const f = walk(mode, 60, dir);
        const scale = mode === 'closeup' ? 4 : 6;
        // A pixel at a time while the camera's lag finishes settling, then still.
        const moves = f.slice(1).filter((p, i) => p.ax !== f[i].ax || p.ay !== f[i].ay);
        expect(moves.length, `${mode} ${name}`).toBeLessThanOrEqual(6);
        for (let i = 1; i < f.length; i++) expect(Math.abs(f[i].ax - f[i - 1].ax) + Math.abs(f[i].ay - f[i - 1].ay), `${mode} ${name}`).toBeLessThanOrEqual(2);
        expect(f.slice(-60).every((p) => p.ax === f.at(-1)!.ax && p.ay === f.at(-1)!.ay), `${mode} ${name} still at the end`).toBe(true);
        // What the world scrolled plus what the Blobbi moved on screen is what it walked (screen pixels, ± rounding).
        const walkedX = (f.at(-1)!.wx - f[0].wx) * scale;
        const shownX = -(f.at(-1)!.ox - f[0].ox) + (f.at(-1)!.ax - f[0].ax);
        expect(Math.abs(shownX - walkedX), `${mode} ${name}`).toBeLessThanOrEqual(scale);
        // 42 world pixels a second, or 42/√2 per axis on a diagonal.
        const perAxis = dir.x && dir.y ? 42 / Math.SQRT2 : 42;
        const seconds = (f.length - 1) / 60;
        if (dir.x) expect(Math.abs(f.at(-1)!.wx - f[0].wx) / seconds, `${mode} ${name}`).toBeCloseTo(perAxis, 0);
      }
  }, 120_000);
});

describe('the shadow moves with the Blobbi', () => {
  /** Screen pixels in a shadow colour around the anchor: their box relative to the anchor. */
  function shadowBox(screen: { get(x: number, y: number): number }, ax: number, ay: number, colours: Set<number>) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let y = ay - 30; y <= ay + 30; y++)
      for (let x = ax - 60; x <= ax + 60; x++)
        if (colours.has(screen.get(x, y))) {
          x0 = Math.min(x0, x - ax);
          y0 = Math.min(y0, y - ay);
          x1 = Math.max(x1, x - ax);
          y1 = Math.max(y1, y - ay);
        }
    return { x0, y0, x1, y1 };
  }

  it('between world pixels the shadow keeps its place under the Blobbi, and on whole pixels it is the classic one', () => {
    const live = cameraScene('turtle-0');
    live.bubble = null;
    live.unequip();
    const p = paletteFor(live.world.options.palette);
    const colours = new Set([p.shadowOnGrass, p.shadowOnSand, p.shadowOnWater]);
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const bx = Math.round(live.blobbi.x);
    const by = Math.round(live.blobbi.y);
    const ui = { hud: false, indicator: false, uiScale: 2 };
    for (const scale of [2, 4, 6]) {
      const v = rest(scale, onGrid(bx - 480 / scale, scale), onGrid(by - 270 / scale, scale));
      // The same view with the Blobbi far away: what is left in a shadow colour is other things' shadows.
      live.drawnAt = { x: bx + 400, y: by };
      const away = view.render(v, scale, live.clock.time, DEFAULT_LIVE_OPTIONS, ui).clone();
      const boxes: string[] = [];
      for (const dx of [0, 0.25, 0.5, -0.4]) {
        live.drawnAt = { x: bx + dx, y: by + dx / 2 };
        const screen = view.render(v, scale, live.clock.time, DEFAULT_LIVE_OPTIONS, ui);
        const b = view.lastBlobbi!;
        const own = { get: (x: number, y: number) => (screen.get(x, y) === away.get(x, y) ? -1 : screen.get(x, y)) };
        boxes.push(JSON.stringify(shadowBox(own, b.x, b.y, colours)));
      }
      // One shadow, one place relative to the Blobbi, at every sub-pixel position.
      expect(new Set(boxes).size, `${scale}×: ${boxes.join(' ')}`).toBe(1);
      expect(JSON.parse(boxes[0]).x0).toBeLessThan(0);
    }
    live.drawnAt = null;
  });

  it('a room has no ground shadow, even right after a frame on the island', () => {
    const live = cameraScene('turtle-0');
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const v = rest(4, onGrid(live.blobbi.x - 120, 4), onGrid(live.blobbi.y - 67.5, 4));
    view.render(v, 4, live.clock.time, DEFAULT_LIVE_OPTIONS, { hud: false, indicator: false, uiScale: 2 });
    expect(view['layers'].shadow!.length).toBeGreaterThan(0);
    live.enterInterior(live.home()!);
    live.update(1 / 30, IDLE_INPUT);
    const room = live.sceneBounds()!;
    const camera = new ViewCamera('closeup');
    view.render(camera.update(0, live.cameraTarget(), 960, 540, room, true), 4, live.clock.time, DEFAULT_LIVE_OPTIONS, { hud: false, indicator: false, uiScale: 2 });
    expect(view['layers'].shadow).toEqual([]);
  });
});
