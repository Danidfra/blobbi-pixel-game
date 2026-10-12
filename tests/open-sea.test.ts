/**
 * M10 seamless ocean: zoomed out, the sea goes on past the world's edge — the terrain painter's own deep water and
 * the live renderer's own waves, so there is no rectangle — deterministic, cheap (tiles made once, bounded), on
 * every Carrier and at every zoom.
 */
import { describe, expect, it } from 'vitest';
import { OpenSea } from '../src/render/open-sea';
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { ViewCamera, worldBounds, type CameraModeId } from '../src/render/view-camera';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { memoryStore } from '../src/game/persistence';
import { paletteFor } from '../src/world/generate';
import { T } from '../src/world/types';
import { PixelBuffer } from '../src/core/pixel';

const WORLDS = [
  ['turtle', () => generateTurtleWorld('sea-test', { turtleSeed: 't', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false })],
  ['manta', () => generateMantaWorld('sea-test', { carrierSeed: 'm', generatedHouse: false })],
  ['whale', () => generateWhaleWorld('sea-test', { carrierSeed: 'w', generatedHouse: false })],
] as const;

for (const [name, make] of WORLDS)
  describe(`the open sea round a ${name}`, () => {
    const live = new LiveWorld(make(), 'blobbi-9', 16, { store: memoryStore() });
    const palette = paletteFor(live.world.options.palette);
    const sea = new OpenSea(live.world, palette);
    const { width, height, cls } = live.world.terrain;

    it("continues the world's own deep water across its edge (the terrain painter's rule, pixel for pixel)", () => {
      const lr = new LiveRenderer(live);
      let deep = 0;
      for (let x = 0; x < width; x++)
        for (const y of [0, height - 1])
          if (cls[y * width + x] === T.DEEP) {
            deep++;
            expect(lr.staticLayer.get(x, y)).toBe(sea.base(x, y));
          }
      expect(deep).toBeGreaterThan(width);
    });

    it('beyond the edge: still water from the same rule, waves only where a whole stroke lies outside', () => {
      const lr = new LiveRenderer(live);
      const time = 3.7;
      // The top-left corner, 60 world pixels each way.
      const frame = lr.render(120, 120, -60, -60, time, { ...DEFAULT_LIVE_OPTIONS, hud: false }).clone();
      let still = 0;
      let wave = 0;
      for (let y = 0; y < 120; y++)
        for (let x = 0; x < 120; x++) {
          const wx = x - 60;
          const wy = y - 60;
          if (wx >= 0 && wy >= 0) continue; // the world
          const c = frame.get(x, y);
          if (c === sea.base(wx, wy)) still++;
          else {
            expect(c).toBe(palette.water.mid); // a wave stroke, nothing else
            wave++;
          }
        }
      expect(still).toBeGreaterThan(wave * 5);
      expect(wave).toBeGreaterThan(0);
      // Not a flat fill: the streaks show.
      const colours = new Set<number>();
      for (let y = 0; y < 50; y++) for (let x = 0; x < 120; x++) colours.add(frame.get(x, y));
      expect(colours.size).toBeGreaterThanOrEqual(3);
    });

    it('is deterministic, and its waves drift with time', () => {
      const a = new LiveRenderer(live).render(100, 60, -80, -30, 2, DEFAULT_LIVE_OPTIONS).clone();
      const b = new LiveRenderer(new LiveWorld(make(), 'blobbi-9', 16, { store: memoryStore() })).render(100, 60, -80, -30, 2, DEFAULT_LIVE_OPTIONS).clone();
      expect(Array.from(a.data)).toEqual(Array.from(b.data));
      const later = new LiveRenderer(live).render(100, 60, -80, -30, 2.6, DEFAULT_LIVE_OPTIONS).clone();
      expect(Array.from(later.data)).not.toEqual(Array.from(a.data));
    });
  });

describe('the open sea in the view', () => {
  const live = new LiveWorld(WORLDS[2][1](), 'blobbi-9', 16, { store: memoryStore() });
  const view = new ViewRenderer(live, new LiveRenderer(live));
  for (const mode of ['overview', 'exploration', 'closeup'] as CameraModeId[])
    it(`${mode} on a very wide screen: no flat margin and no straight edge where the world ends`, () => {
      const cam = new ViewCamera(mode);
      const b = worldBounds(live.world);
      const v = cam.update(0, live.cameraTarget(), 2560, 1440, b, true);
      const screen = view.render(v, cam.restScale(mode, 2560, 1440, b), live.clock.time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, lighting: false, hud: false, indicator: false, goals: false, prompt: false });
      // The old margin colour never appears; every screen pixel is drawn.
      let empty = 0;
      for (const c of screen.data) if (c >>> 24 === 0 || c === 0xff16100d) empty++;
      expect(empty).toBe(0);
      // Across the world's left edge (where it is on screen) neighbouring screen columns differ no more than
      // columns inside the world do: no seam.
      const edgeX = Math.round((0 - v.originX) * v.scale);
      if (edgeX > 2 && edgeX < 2558) {
        const diff = (x: number) => {
          let n = 0;
          for (let y = 0; y < 1440; y += 2) if (screen.get(x, y) !== screen.get(x - 1, y)) n++;
          return n;
        };
        const across = diff(edgeX);
        const inside = Math.max(diff(edgeX + 7), diff(edgeX + 13), diff(edgeX - 9));
        expect(across).toBeLessThanOrEqual(inside + 6);
      }
    });
});

describe('the cost of the open sea', () => {
  it('makes each tile once and keeps a bounded number', () => {
    const live = new LiveWorld(WORLDS[0][1](), 'blobbi-9', 16, { store: memoryStore() });
    const sea = new OpenSea(live.world, paletteFor(live.world.options.palette));
    const frame = new PixelBuffer(400, 300);
    sea.paintBeyond(frame, -200, -150, 1);
    const first = sea.cached.made;
    sea.paintBeyond(frame, -200, -150, 2);
    expect(sea.cached.made).toBe(first);
    for (let k = 0; k < 80; k++) sea.paintBeyond(frame, -4000 + k * 400, -3000 + (k % 7) * 300, 1);
    expect(sea.cached.tiles).toBeLessThanOrEqual(100); // bounded by the view, however far it roams
    // A wider view keeps all of its own tiles: painting it again makes none.
    const wide = new PixelBuffer(2560, 1440);
    sea.paintBeyond(wide, -900, -340, 1);
    const made = sea.cached.made;
    sea.paintBeyond(wide, -900, -340, 1.5);
    expect(sea.cached.made).toBe(made);
  });
});
