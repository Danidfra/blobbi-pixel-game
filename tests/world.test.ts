import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/world/generate';
import { renderWorld, spriteFor } from '../src/render/compose';
import { auditWorld } from '../src/render/audit';
import { T, MAX_TERRAIN_CLASS } from '../src/world/types';
import { islandRadius, MAX_BULGE } from '../src/world/layout';
import type { Sprite } from '../src/core/pixel';

const SEEDS = Array.from({ length: 40 }, (_, i) => `scan-${i}`);
const cache = new Map<string, Sprite>();

describe('world generation', () => {
  it('is reproducible: the same seed gives the same description and the same pixels', () => {
    const a = generateWorld('repro');
    const b = generateWorld('repro');
    expect(a.islands).toEqual(b.islands);
    expect(a.bridges).toEqual(b.bridges);
    expect(a.objects).toEqual(b.objects);
    expect(a.terrain.cls).toEqual(b.terrain.cls);
    expect(renderWorld(a).data).toEqual(renderWorld(b).data);
  });

  it('different seeds give different worlds', () => {
    const a = generateWorld('one');
    const b = generateWorld('two');
    expect(a.islands).not.toEqual(b.islands);
    expect(renderWorld(a).data).not.toEqual(renderWorld(b).data);
  });

  it('placement does not depend on the palette (independent concerns)', () => {
    const a = generateWorld('pal', { palette: 'cozy' });
    const b = generateWorld('pal', { palette: 'autumn' });
    expect(a.objects.map((o) => [o.kind, o.x, o.y, o.size])).toEqual(b.objects.map((o) => [o.kind, o.x, o.y, o.size]));
    expect(a.terrain.cls).toEqual(b.terrain.cls);
  });

  it('every placement regenerates its exact sprite from its own seed (keyed, not chained)', () => {
    const w = generateWorld('keyed');
    const tree = w.objects.find((o) => o.kind === 'tree')!;
    const again = spriteFor(tree, 'cozy');
    const direct = spriteFor({ ...tree }, 'cozy');
    expect(again.buffer.data).toEqual(direct.buffer.data);
  });

  it('island silhouettes are blobby: the radius stays within the bulge budget', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      for (const isl of generateWorld(seed).islands) {
        for (let a = 0; a < Math.PI * 2; a += 0.05) {
          const r = islandRadius(isl, a) / isl.radius;
          expect(r).toBeGreaterThanOrEqual(2 - MAX_BULGE - 1e-9);
          expect(r).toBeLessThanOrEqual(MAX_BULGE + 1e-9);
        }
      }
    }
  });

  it('terrain has no invalid values and respects boundaries', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const w = generateWorld(seed);
      const { width, height, cls, dist, owner } = w.terrain;
      expect(cls.length).toBe(width * height);
      let bad = 0;
      for (let i = 0; i < dist.length; i++) {
        if (!Number.isFinite(dist[i]) || cls[i] > MAX_TERRAIN_CLASS) bad++;
        if (cls[i] >= T.GRASS_EDGE && owner[i] < 0) bad++;
      }
      expect(bad).toBe(0);
      // The map border is always water: islands never touch the edge.
      let landOnBorder = 0;
      for (let x = 0; x < width; x++) if (cls[x] >= T.GRASS_EDGE || cls[(height - 1) * width + x] >= T.GRASS_EDGE) landOnBorder++;
      for (let y = 0; y < height; y++) if (cls[y * width] >= T.GRASS_EDGE || cls[y * width + width - 1] >= T.GRASS_EDGE) landOnBorder++;
      expect(landOnBorder).toBe(0);
    }
  });

  it('objects stand on land, inside the map, with integer anchors, and never share a footprint', () => {
    for (const seed of SEEDS.slice(0, 15)) {
      const w = generateWorld(seed);
      const feet: { x: number; y: number; rx: number; ry: number }[] = [];
      const problems: string[] = [];
      for (const o of w.objects) {
        if (!Number.isInteger(o.x) || !Number.isInteger(o.y)) problems.push(`${o.kind} non-integer anchor`);
        if (o.x < 0 || o.y < 0 || o.x >= w.options.width || o.y >= w.options.height) problems.push(`${o.kind} outside map`);
        const c = w.terrain.cls[o.y * w.options.width + o.x];
        if (c < T.GRASS_EDGE) problems.push(`${o.kind} at ${o.x},${o.y} off land`);
        const s = spriteFor(o, 'cozy', cache);
        if (s.footRx > 0) {
          for (const f of feet) if (Math.abs(f.x - o.x) < f.rx + s.footRx && Math.abs(f.y - o.y) < f.ry + s.footRy) problems.push(`${o.kind} at ${o.x},${o.y} overlaps a footprint`);
          feet.push({ x: o.x, y: o.y, rx: s.footRx, ry: s.footRy });
        }
      }
      expect(problems).toEqual([]);
    }
  });

  it('bridges connect every island and span water', () => {
    const failures: string[] = [];
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      const audit = auditWorld(w);
      const structural = audit.issues.filter((i) => !i.includes('clipped'));
      if (structural.length) failures.push(`${seed}: ${structural.join('; ')}`);
      expect(w.bridges.length).toBe(w.islands.length - 1);
    }
    expect(failures).toEqual([]);
  });

  it('keeps objects clear of the map edge in nearly every seed', () => {
    let clipped = 0;
    for (const seed of SEEDS) if (auditWorld(generateWorld(seed)).issues.some((i) => i.includes('clipped'))) clipped++;
    expect(clipped).toBeLessThanOrEqual(2);
  });

  it('honours options: island count, size, density', () => {
    const one = generateWorld('opt', { islands: 1 });
    expect(one.islands.length).toBe(1);
    expect(one.bridges.length).toBe(0);
    const small = generateWorld('opt', { width: 320, height: 224 });
    expect(small.terrain.width).toBe(320);
    const sparse = generateWorld('opt', { density: 0.5 });
    const dense = generateWorld('opt', { density: 1.5 });
    expect(sparse.objects.length).toBeLessThan(dense.objects.length);
  });

  it('renders every layer toggle without error and layers actually change pixels', () => {
    const w = generateWorld('layers');
    const full = renderWorld(w);
    const noVeg = renderWorld(w, { vegetation: false });
    const noStruct = renderWorld(w, { structures: false });
    const noTerrain = renderWorld(w, { terrain: false });
    expect(full.data).not.toEqual(noVeg.data);
    expect(full.data).not.toEqual(noStruct.data);
    expect(full.data).not.toEqual(noTerrain.data);
    for (const b of [full, noVeg, noStruct, noTerrain]) expect(() => b.validate()).not.toThrow();
  });

  // KI-34 (fixed in M10 phase B): this used to time one run by the wall clock, so in the full parallel suite —
  // nine other test processes on the same cores — a busy moment doubled it (3.3 s measured; 0.5 s alone). It now
  // times this process's own CPU (vitest runs each file in its own process) and keeps the fastest of three runs,
  // which is what the budget is about: a real slowdown makes every run slow, interference only some.
  it('generates a default world quickly', () => {
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const c0 = process.cpuUsage();
      const w = generateWorld('perf');
      renderWorld(w);
      const c = process.cpuUsage(c0);
      best = Math.min(best, (c.user + c.system) / 1000);
    }
    expect(best).toBeLessThan(1500);
  });
});
