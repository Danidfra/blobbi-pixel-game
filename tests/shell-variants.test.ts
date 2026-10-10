import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { renderWorld, turtleBodyForWorld } from '../src/render/compose';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { LiveRenderer, Camera, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { T, WALKABLE, isLandClass } from '../src/world/types';
import { DEFAULT_SHELL_VARIANT, type ShellVariant } from '../src/carrier/types';
import { onShell, shellGrowth, variantCanvas } from '../src/carrier/turtle-carrier';
import { paintShellSurface, shellPlates, SHELL_REGION } from '../src/carrier/shell-surface';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { alpha } from '../src/core/color';

const SEEDS = ['turtle-0', 'turtle-1', 'turtle-2', 'turtle-3'];
const VARIANTS = [1, 2, 3] as ShellVariant[];

describe('the default shell and Variant 0', () => {
  it('generateTurtleWorld returns Variant B by default; Variant 0 stays the M1 turtle at origin 0,0', () => {
    expect(DEFAULT_SHELL_VARIANT).toBe(2);
    for (const seed of SEEDS.slice(0, 2)) {
      const d = generateTurtleWorld(seed);
      const b = generateTurtleWorld(seed, { shellVariant: 2 });
      expect(d.carrier!.variant).toBe(2);
      expect(d.terrain.cls).toEqual(b.terrain.cls);
      expect(renderWorld(d).data).toEqual(renderWorld(b).data);
      const a = generateTurtleWorld(seed, { shellVariant: 0 });
      expect(a.carrier).toMatchObject({ species: 'turtle', variant: 0, origin: { x: 0, y: 0 }, growth: 1, canvas: { width: 704, height: 480 } });
      expect(a.carrier!.turtle).toEqual(a.turtle);
      expect(a.carrier!.coverage.measured).toBeGreaterThan(0.88);
      expect(a.options.height).toBe(480);
    }
  });
});

describe('the island frame inside the carrier (explicit, testable transform)', () => {
  it('keeps every island pixel, object, hub, path and plateau; the origin is a whole number of nav cells', () => {
    for (const seed of SEEDS) {
      const base = generateTurtleWorld(seed, { shellVariant: 0 });
      for (const v of VARIANTS) {
        const world = generateTurtleWorld(seed, { shellVariant: v });
        const c = world.carrier!;
        expect(c.variant).toBe(v);
        expect(c.origin.x).toBe(0);
        expect(c.origin.y % 4).toBe(0);
        expect(c.origin.y).toBeGreaterThan(0);
        expect(world.options.width).toBe(c.canvas.width);
        expect(world.options.height).toBe(c.canvas.height);
        const { x: ox, y: oy } = c.origin;
        const bt = base.terrain;
        const wt = world.terrain;
        let walkableBase = 0;
        let walkableWorld = 0;
        for (let y = 0; y < bt.height; y++)
          for (let x = 0; x < bt.width; x++) {
            const i = y * bt.width + x;
            const j = (y + oy) * wt.width + (x + ox);
            if (bt.dist[i] <= 0 || isLandClass(bt.cls[i])) {
              if (bt.cls[i] !== wt.cls[j]) throw new Error(`${seed} v${v}: class ${bt.cls[i]} became ${wt.cls[j]} at ${x},${y}`);
              expect(wt.dist[j]).toBe(bt.dist[i]);
              expect(wt.elevation[j]).toBe(bt.elevation[i]);
            }
            if (WALKABLE.has(bt.cls[i])) walkableBase++;
          }
        for (let i = 0; i < wt.cls.length; i++) {
          if (WALKABLE.has(wt.cls[i])) walkableWorld++;
          if (WALKABLE.has(wt.cls[i]) && wt.dist[i] > 0) throw new Error(`walkable pixel off the island at ${i % wt.width},${Math.floor(i / wt.width)}`);
        }
        expect(walkableWorld).toBe(walkableBase);
        expect(world.objects).toEqual(base.objects.map((o) => ({ ...o, x: o.x + ox, y: o.y + oy })));
        expect(world.hubs).toEqual(base.hubs.map((h) => ({ ...h, x: h.x + ox, y: h.y + oy })));
        expect(world.paths.map((p) => p.points)).toEqual(base.paths.map((p) => p.points.map((q) => ({ x: q.x + ox, y: q.y + oy }))));
        expect(world.islands[0].cx).toBe(base.islands[0].cx + ox);
        expect(world.islands[0].cy).toBe(base.islands[0].cy + oy);
        if (base.islands[0].plateau) expect(world.islands[0].plateau!.cy).toBe(base.islands[0].plateau.cy + oy);
        else expect(world.islands[0].plateau).toBeNull();
        expect(world.islands[0].radius).toBe(base.islands[0].radius);
      }
    }
  });

  it('runs the same simulation: the autonomous Blobbi follows the identical path, shifted by the origin', () => {
    for (const seed of ['turtle-0', 'turtle-3']) {
      for (const v of VARIANTS) {
        const base = new LiveWorld(generateTurtleWorld(seed, { shellVariant: 0 }), 'blobbi-9', 16);
        const world = generateTurtleWorld(seed, { shellVariant: v });
        const live = new LiveWorld(world, 'blobbi-9', 16);
        const oy = world.carrier!.origin.y;
        expect(live.nav.freeCount()).toBe(base.nav.freeCount());
        expect(live.blobbi.x).toBe(base.blobbi.x);
        expect(live.blobbi.y).toBe(base.blobbi.y + oy);
        const trace: string[] = [];
        const traceBase: string[] = [];
        for (let i = 0; i < 60 * 30; i++) {
          const input = i >= 60 * 8 && i < 60 * 10 ? { ...IDLE_INPUT, right: true, down: i < 60 * 9 } : IDLE_INPUT;
          live.update(1 / 60, input);
          base.update(1 / 60, input);
          if (i % 15 === 0) {
            trace.push(`${live.blobbi.x.toFixed(3)},${(live.blobbi.y - oy).toFixed(3)},${live.brain.state},${live.blobbi.animator.state.direction}`);
            traceBase.push(`${base.blobbi.x.toFixed(3)},${base.blobbi.y.toFixed(3)},${base.brain.state},${base.blobbi.animator.state.direction}`);
          }
        }
        expect(trace).toEqual(traceBase);
        expect(live.brain.state).not.toBe('manual');
      }
    }
  });
});

describe('the enlarged shell', () => {
  it('grows to the requested coverage; the shell contains the island and the whole ring is RIM, nothing else', () => {
    for (const seed of SEEDS) {
      let lastMargin = 0;
      for (const v of [3, 2, 1] as ShellVariant[]) {
        const world = generateTurtleWorld(seed, { shellVariant: v });
        const c = world.carrier!;
        expect(Math.abs(c.coverage.measured - c.coverage.target!)).toBeLessThan(0.025);
        expect(c.growth).toBeGreaterThan(1);
        const a = world.turtle!;
        const { width, height, cls, dist } = world.terrain;
        let rim = 0;
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const i = y * width + x;
            const shell = onShell(a, x, y);
            if (dist[i] <= 0) {
              if (!shell) throw new Error(`land outside the shell at ${x},${y}`);
              continue;
            }
            if (shell) {
              if (cls[i] !== T.RIM) throw new Error(`shell pixel ${x},${y} is class ${cls[i]}`);
              rim++;
            } else expect(cls[i]).not.toBe(T.RIM);
          }
        const layout = shellPlates(a, world.islands[0], world.options.scale);
        expect(layout.marginMean).toBeGreaterThan(lastMargin);
        lastMargin = layout.marginMean;
        expect(rim).toBeGreaterThan(layout.marginMean * 2 * Math.PI * a.meanRadius * 0.5);
        // The head, flippers and tail stay inside the canvas, the head below the shell on the neck.
        expect(a.head.cy + a.head.ry).toBeLessThan(height - 1);
        expect(a.cy - a.ry - a.rimWidth - a.tail.length).toBeGreaterThan(1);
        for (const f of a.flippers) {
          expect(f.cx - f.rx).toBeGreaterThan(0);
          expect(f.cx + f.rx).toBeLessThan(width);
        }
        expect(a.head.cy).toBeGreaterThan(a.cy + a.ry + a.rimWidth);
      }
    }
    expect(shellGrowth(190, 155, 8, 0.6)).toBeGreaterThan(shellGrowth(190, 155, 8, 0.8));
    expect(variantCanvas(1, { width: 704, height: 480 }, 1.6).height).toBeGreaterThan(variantCanvas(3, { width: 704, height: 480 }, 1.6).height);
  });

  it('paints a deterministic plate surface: seams, plates, soil, lip and moss in the ring, every RIM pixel covered', () => {
    for (const seed of SEEDS.slice(0, 3)) {
      for (const v of VARIANTS) {
        const world = generateTurtleWorld(seed, { shellVariant: v });
        const a = world.turtle!;
        const ctx = { island: world.islands[0], palette: paletteFor(world.options.palette), seed: world.carrier!.seed, scale: world.options.scale };
        const b1 = new PixelBuffer(world.options.width, world.options.height);
        const b2 = new PixelBuffer(world.options.width, world.options.height);
        const r1 = paintShellSurface(b1, a, ctx);
        const r2 = paintShellSurface(b2, a, ctx);
        expect(b1.data).toEqual(b2.data);
        expect(r1.region).toEqual(r2.region);
        const counts = new Map<number, number>();
        let moss = 0;
        let ring = 0;
        for (let i = 0; i < r1.region.length; i++) {
          const reg = r1.region[i];
          if (reg === SHELL_REGION.OUT || reg === SHELL_REGION.HIDDEN) continue;
          ring++;
          counts.set(reg, (counts.get(reg) ?? 0) + 1);
          if (r1.moss[i]) moss++;
        }
        for (const reg of [SHELL_REGION.SOIL, SHELL_REGION.PLATE, SHELL_REGION.SEAM, SHELL_REGION.LIP]) expect(counts.get(reg) ?? 0).toBeGreaterThan(ring * 0.01);
        expect(counts.get(SHELL_REGION.PLATE)! / ring).toBeGreaterThan(0.4);
        expect(moss / ring).toBeGreaterThan(0.005);
        expect(moss / ring).toBeLessThan(0.25);
        expect(r1.layout.count).toBeGreaterThanOrEqual(16);
        expect(r1.layout.rows).toBe(v === 3 ? 1 : 2);
        // The painted world: every RIM pixel is an opaque body pixel (never bare water).
        const img = renderWorld(world);
        const { cls } = world.terrain;
        for (let i = 0; i < cls.length; i++) if (cls[i] === T.RIM && !alpha(b1.data[i])) throw new Error(`uncovered RIM pixel at ${i % img.width},${Math.floor(i / img.width)}`);
        // Seams are a thin network: about one plate boundary per plate, so seam pixels are a small share.
        expect(counts.get(SHELL_REGION.SEAM)! / ring).toBeLessThan(0.2);
      }
    }
  });

  it('animates the same head and flippers in place: a live frame shows the resting head where the anatomy says', () => {
    for (const v of [0, 1, 2, 3] as ShellVariant[]) {
      const world = generateTurtleWorld('turtle-1', { shellVariant: v });
      const live = new LiveWorld(world, 'blobbi-9', 16);
      const renderer = new LiveRenderer(live);
      const body = turtleBodyForWorld(world);
      const camera = new Camera();
      const viewW = 200;
      const viewH = 160;
      camera.follow(world.turtle!.head.cx, world.turtle!.head.cy, viewW, viewH, world.options.width, world.options.height, 0, true);
      const frame = renderer.render(viewW, viewH, camera.x, camera.y, 0, { ...DEFAULT_LIVE_OPTIONS, animateWind: false });
      let same = 0;
      let all = 0;
      const head = body.head.buffer;
      for (let y = 0; y < head.height; y++)
        for (let x = 0; x < head.width; x++) {
          const c = head.get(x, y);
          if (!alpha(c)) continue;
          all++;
          if (frame.get(body.head.x + x - camera.x, body.head.y + y - camera.y) === c) same++;
        }
      expect(same / all).toBeGreaterThan(0.97);
    }
  });
});
