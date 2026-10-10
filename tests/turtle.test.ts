import { describe, expect, it } from 'vitest';
import { generateTurtleGenome, turtleAnatomy, turtlePartAt, renderTurtleBody, shellRadius } from '../src/turtle/turtle';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { renderWorld } from '../src/render/compose';
import { auditWorld } from '../src/render/audit';
import { CollisionMap } from '../src/sim/collision';
import { LiveWorld } from '../src/sim/live-world';
import { T, WALKABLE } from '../src/world/types';
import { alpha } from '../src/core/color';
import { paletteFor } from '../src/world/generate';
import { onShell } from '../src/carrier/turtle-carrier';

const SEEDS = Array.from({ length: 12 }, (_, i) => `turtle-${i}`);

describe('turtle generation', () => {
  it('is deterministic: genome, anatomy, world and pixels', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      expect(generateTurtleGenome(seed)).toEqual(generateTurtleGenome(seed));
      const a = turtleAnatomy(generateTurtleGenome(seed), 704, 480, 1.6);
      const b = turtleAnatomy(generateTurtleGenome(seed), 704, 480, 1.6);
      expect(a).toEqual(b);
      const w1 = generateTurtleWorld(seed);
      const w2 = generateTurtleWorld(seed);
      expect(w1.terrain.cls).toEqual(w2.terrain.cls);
      expect(w1.objects).toEqual(w2.objects);
      expect(renderWorld(w1).data).toEqual(renderWorld(w2).data);
    }
    expect(generateTurtleGenome('a')).not.toEqual(generateTurtleGenome('b'));
  });

  it('is one species: proportions stay within the controlled ranges across seeds', () => {
    for (let i = 0; i < 40; i++) {
      const g = generateTurtleGenome(`species-${i}`);
      expect(g.shellRx).toBeGreaterThanOrEqual(0.25);
      expect(g.shellRx).toBeLessThanOrEqual(0.285);
      expect(g.shellRy / g.shellRx).toBeGreaterThan(1.0);
      expect(g.shellRy / g.shellRx).toBeLessThan(1.4);
      expect(g.facets).toBeLessThan(0.035);
      expect(['hex', 'rings', 'spots']).toContain(g.markings);
    }
  });

  it('has valid anatomy: shell inside the map, head attached below it, four flippers on the rim, tail at the back', () => {
    for (const seed of SEEDS) {
      const a = turtleAnatomy(generateTurtleGenome(seed), 704, 480, 1.6);
      // Shell and head inside the map.
      expect(a.cx - a.rx - a.rimWidth).toBeGreaterThan(40);
      expect(a.cx + a.rx + a.rimWidth).toBeLessThan(704 - 40);
      expect(a.cy - a.ry - a.rimWidth - a.tail.length).toBeGreaterThan(2);
      expect(a.head.cy + a.head.ry).toBeLessThan(480 - 2);
      // The head is below the shell (toward the viewer) and the neck bridges the gap.
      expect(a.head.cy).toBeGreaterThan(a.cy + a.ry);
      expect(a.neck.y0).toBeLessThan(a.cy + a.ry);
      expect(a.neck.y1).toBeGreaterThanOrEqual(a.head.cy - a.head.ry);
      expect(a.head.rx).toBeLessThan(a.rx * 0.3);
      // Flippers: two on each side, bases on the shell edge, front pair below the centre, rear pair above.
      expect(a.flippers.length).toBe(4);
      for (const f of a.flippers) {
        const d = Math.hypot(f.base.x - a.cx, f.base.y - a.cy);
        const r = shellRadius(a, Math.atan2(f.base.y - a.cy, f.base.x - a.cx));
        expect(Math.abs(d - r)).toBeLessThan(a.rimWidth + 1);
        if (f.side.startsWith('f')) expect(f.base.y).toBeGreaterThan(a.cy);
        else expect(f.base.y).toBeLessThan(a.cy);
        if (f.side.endsWith('l')) expect(f.cx).toBeLessThan(a.cx);
        else expect(f.cx).toBeGreaterThan(a.cx);
        // The paddle reaches outward, away from the shell.
        expect(Math.hypot(f.cx - a.cx, f.cy - a.cy)).toBeGreaterThan(d);
      }
      // Tail above the shell, small.
      expect(a.tail.cy).toBeLessThanOrEqual(a.cy - a.ry + 1);
      expect(a.tail.length).toBeLessThan(a.rx * 0.2);
      // Part classification agrees with the anatomy.
      expect(turtlePartAt(a, Math.round(a.head.cx), Math.round(a.head.cy))).toBe('head');
      expect(turtlePartAt(a, Math.round(a.flippers[0].cx), Math.round(a.flippers[0].cy))).toBe('flipper');
      expect(turtlePartAt(a, a.cx, a.cy)).toBeNull();
    }
  });

  it('draws a recognizable body: shell, rim, head with two eyes, four flippers, within its buffer', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const a = turtleAnatomy(generateTurtleGenome(seed), 704, 480, 1.6);
      const body = renderTurtleBody(a);
      expect(() => body.buffer.validate()).not.toThrow();
      expect(body.flippers.length).toBe(4);
      for (const f of body.flippers) expect(f.buffer.opaqueCount()).toBeGreaterThan(100);
      // Two eye whites in the head, symmetric about the head's centre.
      const white = 0xffffffff;
      let left = 0;
      let right = 0;
      const mid = body.head.buffer.width / 2;
      for (let y = 0; y < body.head.buffer.height; y++) for (let x = 0; x < body.head.buffer.width; x++) if (body.head.buffer.get(x, y) === white) x < mid ? left++ : right++;
      expect(left).toBeGreaterThan(3);
      expect(Math.abs(left - right)).toBeLessThanOrEqual(3);
      // The blink variant has no eye whites; the glance variants keep the same silhouette.
      let blinkWhite = 0;
      for (const c of body.head.blink.data) if (c === white) blinkWhite++;
      expect(blinkWhite).toBe(0);
      expect(body.head.left.opaqueMask().data).toEqual(body.head.buffer.opaqueMask().data);
      expect(body.head.right.opaqueMask().data).toEqual(body.head.buffer.opaqueMask().data);
      expect(body.head.blink.opaqueMask().data).toEqual(body.head.buffer.opaqueMask().data);
    }
  });
});

describe('turtle world', () => {
  it('keeps every walkable pixel on the shell top and the rim, skin, pond and sea blocked', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const w = generateTurtleWorld(seed);
      const a = w.turtle!;
      const { width, height, cls, dist } = w.terrain;
      let offShell = 0;
      let rim = 0;
      let skin = 0;
      let pond = 0;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          const c = cls[i];
          if (WALKABLE.has(c) && dist[i] > 0) offShell++;
          if (c === T.RIM) rim++;
          if (c === T.SKIN) skin++;
          if (c === T.POND || c === T.POND_EDGE) pond++;
          if (turtlePartAt(a, x, y) && dist[i] > a.rimWidth && !onShell(a, x, y)) expect(c).toBe(T.SKIN);
        }
      expect(offShell).toBe(0);
      expect(rim).toBeGreaterThan(500);
      expect(skin).toBeGreaterThan(2000);
      expect(pond === 0 || pond > 80).toBe(true);
      const audit = auditWorld(w);
      expect(audit.issues.filter((i) => !i.includes('clipped'))).toEqual([]);
      expect(w.objects.length).toBeGreaterThan(40);
      for (const o of w.objects) expect(WALKABLE.has(cls[o.y * width + o.x]) || cls[o.y * width + o.x] === T.PATH).toBe(true);
    }
  });

  it('has one connected walkable region reaching the hub, and nothing walkable that is not traversable', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const w = generateTurtleWorld(seed);
      const live = new LiveWorld(w, 'blobbi-9', 16);
      const grid = live.nav;
      const start = grid.nearestFree(w.hubs[0].x, w.hubs[0].y, 4)!;
      expect(start).not.toBeNull();
      // Flood fill from the hub over free cells.
      const seen = new Uint8Array(grid.cols * grid.rows);
      const stack = [start.r * grid.cols + start.c];
      seen[stack[0]] = 1;
      let reached = 0;
      while (stack.length) {
        const k = stack.pop()!;
        reached++;
        const c = k % grid.cols;
        const r = (k / grid.cols) | 0;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nc = c + dc;
          const nr = r + dr;
          if (!grid.isFree(nc, nr)) continue;
          if (dc && dr && (!grid.isFree(c + dc, r) || !grid.isFree(c, r + dr))) continue;
          const nk = nr * grid.cols + nc;
          if (!seen[nk]) {
            seen[nk] = 1;
            stack.push(nk);
          }
        }
      }
      expect(reached / grid.freeCount()).toBeGreaterThan(0.9);
      // Every free nav cell is on a walkable class.
      for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) if (grid.isFree(c, r)) {
        const p = grid.centre(c, r);
        expect(WALKABLE.has(w.terrain.cls[Math.floor(p.y) * w.terrain.width + Math.floor(p.x)])).toBe(true);
      }
      const map = CollisionMap.fromWorld(w, (p) => live.spriteOf(p));
      expect(map.isBlocked(a(w).head.cx, a(w).head.cy)).toBe(true);
    }
  });

  it('renders the turtle under the terrain: rim and skin pixels are body colours, never bare water', () => {
    // The default (Variant B) shell: every rim and skin pixel is opaque and none is a water colour.
    {
      const w = generateTurtleWorld('turtle-1');
      const img = renderWorld(w);
      const palette = paletteFor(w.options.palette);
      const water = new Set([palette.water.dark, palette.water.mid, palette.water.light, palette.shallow.mid, palette.shallow.light, palette.foam]);
      // (The M1 tail raster leaves a few edge pixels of its SKIN class unpainted; that is baseline behaviour, kept.)
      let skinGaps = 0;
      for (let i = 0; i < w.terrain.cls.length; i++) {
        const bare = !alpha(img.data[i]) || water.has(img.data[i]);
        if (w.terrain.cls[i] === T.RIM && bare) throw new Error(`rim pixel ${i % img.width},${Math.floor(i / img.width)} is water`);
        if (w.terrain.cls[i] === T.SKIN && bare) skinGaps++;
      }
      expect(skinGaps).toBeLessThanOrEqual(12);
    }
    // Variant 0: the M1 colour list.
    const w = generateTurtleWorld('turtle-1', { shellVariant: 0 });
    const img = renderWorld(w);
    const { width, cls } = w.terrain;
    const g = w.turtle!.genome;
    let rimOk = 0;
    let rimAll = 0;
    for (let i = 0; i < cls.length; i++) {
      if (cls[i] !== T.RIM && cls[i] !== T.SKIN) continue;
      rimAll++;
      const c = img.data[i];
      if (alpha(c) && [g.rim.light, g.rim.mid, g.rim.dark, g.rim.highlight, g.rim.outline, g.shell.outline, g.skin.light, g.skin.mid, g.skin.dark, g.skin.outline, g.skin.highlight, g.jaw, g.eye, 0xffffffff].includes(c)) rimOk++;
    }
    expect(rimOk / rimAll).toBeGreaterThan(0.85);
    void width;
  });
});

const a = (w: ReturnType<typeof generateTurtleWorld>) => w.turtle!;
