/**
 * The turtle's small start (shell Variant S, M8 cinematic session): new turtle worlds begin as a giant animal
 * carrying a small island with most of the shell free to grow over; worlds made before keep their variant and
 * regenerate byte for byte.
 */
import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { growWorld, canGrow } from '../src/world/growth';
import { DEFAULT_SHELL_VARIANT, NEW_WORLD_SHELL_VARIANT, SHELL_VARIANTS, isShellVariant, type ShellVariant } from '../src/carrier/types';
import { shellRadius } from '../src/turtle/turtle';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { memoryStore, saveKey, worldIdentity, loadSave } from '../src/game/persistence';
import { parseIdentity, resolveFrame } from '../src/game/worlds';
import { findBuildSpot } from '../src/dev/scripted-play';
import { isLand } from '../src/cinematic/layers';
import { introPreviewWorld } from '../src/cinematic/preview';
import { hash32 } from '../src/core/rng';
import { T, WALKABLE } from '../src/world/types';
import { BUILDINGS } from '../src/game/buildings';
import { ITEMS } from '../src/game/items';

const h = (a: ArrayLike<number>) => hash32(Array.from(a, (v) => v.toString(36)).join(','));
const landPixels = (cls: Uint8Array) => cls.reduce((n, c) => n + (isLand(c) ? 1 : 0), 0);
const shellTop = (cls: Uint8Array) => cls.reduce((n, c) => n + (isLand(c) || c === T.RIM ? 1 : 0), 0);

/** Pinned on 2026-10-11, before Variant S existed: the terrain and objects of variants 0-3, and their stage 3. */
const PINS: Record<string, { cls: number; objects: number; land: number; stage3cls: number; stage3objects: number; canvas: string }> = {
  'turtle-0|0': { cls: 3507519042, objects: 93239402, land: 97936, stage3cls: 3507519042, stage3objects: 321, canvas: '704x480' },
  'turtle-0|1': { cls: 445105505, objects: 1092571949, land: 97936, stage3cls: 787511723, stage3objects: 436, canvas: '704x608' },
  'turtle-0|2': { cls: 2633986431, objects: 2560567079, land: 97936, stage3cls: 2517543883, stage3objects: 366, canvas: '704x576' },
  'turtle-0|3': { cls: 2861150116, objects: 374187950, land: 97936, stage3cls: 1306656796, stage3objects: 330, canvas: '704x544' },
  'turtle-7|0': { cls: 3178264707, objects: 3970156888, land: 100508, stage3cls: 3178264707, stage3objects: 331, canvas: '704x480' },
  'turtle-7|1': { cls: 4276005066, objects: 1006627131, land: 100508, stage3cls: 2645045868, stage3objects: 428, canvas: '704x608' },
  'turtle-7|2': { cls: 3317429878, objects: 3906228145, land: 100508, stage3cls: 3007865741, stage3objects: 370, canvas: '704x576' },
  'turtle-7|3': { cls: 923142604, objects: 4285990371, land: 100508, stage3cls: 737302948, stage3objects: 337, canvas: '704x544' },
};

describe('the small start: existing worlds unchanged', () => {
  it('regenerates variants 0-3 byte for byte, stage 3 included, and keeps Variant B as the implicit default', () => {
    expect(DEFAULT_SHELL_VARIANT).toBe(2);
    expect(NEW_WORLD_SHELL_VARIANT).toBe(4);
    for (const seed of ['turtle-0', 'turtle-7'])
      for (const v of [0, 1, 2, 3] as ShellVariant[]) {
        const w = generateTurtleWorld(seed, { shellVariant: v });
        // (Pinned with growth version 3, as M8 made them; version 4 adds only the landing: tests/growth.test.ts.)
        const g3 = v ? growWorld(w, 3, 3) : w;
        const pin = PINS[`${seed}|${v}`];
        expect({ cls: h(w.terrain.cls), objects: hash32(JSON.stringify(w.objects)), land: w.stats.landPixels, stage3cls: h(g3.terrain.cls), stage3objects: g3.objects.length, canvas: `${w.options.width}x${w.options.height}` }).toEqual(pin);
      }
    expect(h(generateTurtleWorld('turtle-0').terrain.cls)).toBe(PINS['turtle-0|2'].cls);
  });

  it('a Variant B save is untouched and still loads when a Variant S world of the same seeds exists', () => {
    const store = memoryStore();
    const b = new LiveWorld(generateTurtleWorld('turtle-0', { shellVariant: 2 }), 'blobbi-9', 16, { store });
    b.inventory.add(ITEMS.wood.id, 4);
    for (let k = 0; k < 120; k++) b.update(1 / 60, { ...IDLE_INPUT, right: k < 60 });
    b.save();
    const before = store.get(saveKey(b.identity));
    const s = new LiveWorld(generateTurtleWorld('turtle-0', { shellVariant: 4 }), 'blobbi-9', 16, { store });
    expect(s.identity).not.toBe(b.identity);
    expect(s.identity).toContain('variant=4');
    expect(b.identity).toContain('variant=2');
    expect(s.inventory.count(ITEMS.wood.id)).toBe(0); // its own, fresh world
    for (let k = 0; k < 120; k++) s.update(1 / 60, { ...IDLE_INPUT, left: k < 60 });
    s.save();
    expect(store.get(saveKey(b.identity))).toBe(before);
    const loaded = loadSave(store, b.identity)!;
    expect(loaded.inventory.items.find((e) => e.item === ITEMS.wood.id)?.quantity).toBe(4);
    // Reopening from the saved-world list: the identity parses, and the frame that reproduces it is found.
    const p = parseIdentity(s.identity)!;
    expect(p.shellVariant).toBe(4);
    expect(isShellVariant(p.shellVariant)).toBe(true);
    const frame = resolveFrame(s.identity, [{ width: 704, height: 448 }, { width: 704, height: 480 }], (size) => worldIdentity(generateTurtleWorld('turtle-0', { ...size, shellVariant: 4 })));
    expect(frame).toEqual({ width: 704, height: 480 });
  });
});

describe('the small start: Variant S', () => {
  const seeds = ['turtle-0', 'turtle-7', 'intro-preview'];

  it('is deterministic, a small island on a big shell, the same object sizes, and in the variant list', () => {
    expect(SHELL_VARIANTS[4]).toMatchObject({ id: 4, coverage: 0.4, islandScale: 0.72 });
    for (const seed of seeds) {
      const a = generateTurtleWorld(seed, { shellVariant: 4 });
      const b = generateTurtleWorld(seed, { shellVariant: 4 });
      expect(h(a.terrain.cls)).toBe(h(b.terrain.cls));
      expect(JSON.stringify(a.objects)).toBe(JSON.stringify(b.objects));
      const big = generateTurtleWorld(seed, { shellVariant: 2 });
      // The island: about half the land of a Variant B island, about 40% of its shell (B: 70%).
      const ratio = a.stats.landPixels / big.stats.landPixels;
      expect(ratio).toBeGreaterThan(0.42);
      expect(ratio).toBeLessThan(0.62);
      expect(a.carrier!.coverage.measured).toBeGreaterThan(0.36);
      expect(a.carrier!.coverage.measured).toBeLessThan(0.44);
      expect(big.carrier!.coverage.measured).toBeGreaterThan(0.66);
      // Most of the shell top is free: the island covers about a third of it.
      const share = landPixels(a.terrain.cls) / shellTop(a.terrain.cls);
      expect(share).toBeGreaterThan(0.3);
      expect(share).toBeLessThan(0.42);
      // The turtle itself is about as big as a Variant B turtle (slightly smaller), not a giant of a giant.
      expect(a.turtle!.rx / big.turtle!.rx).toBeGreaterThan(0.9);
      expect(a.turtle!.rx / big.turtle!.rx).toBeLessThan(1.02);
      expect(a.options.width).toBe(704);
      expect(Math.abs(a.options.height - big.options.height)).toBeLessThanOrEqual(32);
      // Objects keep their sizes (the world scale is the same); there are simply fewer of them.
      expect(a.options.scale).toBe(big.options.scale);
      for (const kind of ['tree', 'house', 'rock', 'bush']) {
        const sizesOf = (w: typeof a) => w.objects.filter((o) => o.kind === kind).map((o) => o.size);
        const small = sizesOf(a);
        const ref = sizesOf(big);
        if (!small.length || !ref.length) continue; // a seed without that kind on one of the two
        if (kind === 'tree') expect(small.length).toBeGreaterThan(0);
        expect(Math.min(...small)).toBeGreaterThanOrEqual(Math.min(...ref) - 2);
        expect(Math.max(...small)).toBeLessThanOrEqual(Math.max(...ref) + 2);
      }
      expect(a.objects.length).toBeLessThan(big.objects.length);
      expect(a.objects.length).toBeGreaterThan(80);
      // The island frame is still the 704×480 canvas, translated down by whole nav cells.
      expect(a.carrier!.frame).toEqual({ width: 704, height: 480 });
      expect(a.carrier!.origin.x).toBe(0);
      expect(a.carrier!.origin.y % 4).toBe(0);
    }
  });

  it('keeps the head, neck, flippers and tail off the land, and the island centred on the shell', () => {
    for (const seed of seeds) {
      const w = generateTurtleWorld(seed, { shellVariant: 4 });
      const a = w.turtle!;
      const { width, height, cls } = w.terrain;
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const c = cls[y * width + x];
          if (!isLand(c)) continue;
          n++;
          sx += x;
          sy += y;
          const dx = x + 0.5 - a.cx;
          const dy = y + 0.5 - a.cy;
          // Every land pixel lies well inside the shell (a ring of plates and the lip stay visible all round).
          expect(Math.hypot(dx, dy)).toBeLessThan(shellRadius(a, Math.atan2(dy, dx)) - 8);
        }
      expect(Math.abs(sx / n - a.cx)).toBeLessThan(6);
      expect(Math.abs(sy / n - a.cy)).toBeLessThan(10);
      // The flippers and the head are skin, as on every turtle.
      expect(cls[Math.round(a.head.cy) * width + Math.round(a.head.cx)]).toBe(T.SKIN);
      for (const f of a.flippers) expect(cls[Math.round(f.cy) * width + Math.round(f.cx)]).toBe(T.SKIN);
    }
  });

  it('grows in three meaningful stages toward the lip, like the manta and the whale, each containing the last', () => {
    for (const seed of seeds) {
      const base = generateTurtleWorld(seed, { shellVariant: 4 });
      expect(canGrow(base)).toBe(true);
      const stages = [0, 1, 2, 3].map((s) => (s ? growWorld(base, s) : base));
      const land = stages.map((w) => landPixels(w.terrain.cls));
      const top = shellTop(base.terrain.cls);
      // Noticeable, then more, then a developed island: +25% or more at stage 1, +40% at 2, +65% at 3.
      expect(land[1] / land[0]).toBeGreaterThan(1.25);
      expect(land[2] / land[0]).toBeGreaterThan(1.4);
      expect(land[3] / land[0]).toBeGreaterThan(1.65);
      // And still not the whole shell: a ring of plates stays visible at stage 3.
      expect(land[3] / top).toBeLessThan(0.72);
      expect(land[3] / top).toBeGreaterThan(0.55);
      const a = base.turtle!;
      const { width, cls } = stages[3].terrain;
      for (let k = 0; k < 72; k++) {
        const ang = (k / 72) * Math.PI * 2;
        const r = shellRadius(a, ang) + a.rimWidth - 2;
        expect(cls[Math.round(a.cy + Math.sin(ang) * r) * width + Math.round(a.cx + Math.cos(ang) * r)]).toBe(T.RIM);
      }
      // Each stage contains the last: land stays land, objects keep their index and position.
      for (let s = 1; s <= 3; s++) {
        const prev = stages[s - 1];
        const next = stages[s];
        for (let i = 0; i < prev.terrain.cls.length; i += 3) if (isLand(prev.terrain.cls[i])) expect(isLand(next.terrain.cls[i])).toBe(true);
        prev.objects.forEach((o, i) => expect(next.objects[i]).toMatchObject({ kind: o.kind, x: o.x, y: o.y, seed: o.seed }));
        expect(next.objects.length).toBeGreaterThan(prev.objects.length);
      }
      // Growth is deterministic.
      expect(h(growWorld(base, 3).terrain.cls)).toBe(h(stages[3].terrain.cls));
    }
    // The progression, against the other Carriers (their stage-0 share of the carrying surface is of the same order).
    const shareOf = (w: ReturnType<typeof generateMantaWorld>) => landPixels(w.terrain.cls) / w.terrain.cls.reduce((n, c) => n + (isLand(c) || c === T.SKIN ? 1 : 0), 0);
    const turtle = landPixels(generateTurtleWorld('intro-preview', { shellVariant: 4, turtleSeed: 'turtle-intro' }).terrain.cls) / shellTop(generateTurtleWorld('intro-preview', { shellVariant: 4, turtleSeed: 'turtle-intro' }).terrain.cls);
    const manta = shareOf(generateMantaWorld('intro-preview', { carrierSeed: 'manta-intro' }));
    const whale = shareOf(generateWhaleWorld('intro-preview', { carrierSeed: 'whale-intro' }));
    expect(turtle).toBeGreaterThan(whale * 0.8);
    expect(turtle).toBeLessThan(manta * 1.5);
  });

  it('is playable: the Blobbi stands at the hub, nearly all walkable land is reachable, resources and a shelter spot exist', () => {
    for (const seed of seeds) {
      const live = new LiveWorld(generateTurtleWorld(seed, { shellVariant: 4, turtleSeed: seed === 'intro-preview' ? 'turtle-intro' : undefined }), 'blobbi-9', 16);
      const b = live.blobbi;
      expect(live.collision.canStand(b.x, b.y, b.footRx, b.footRy)).toBe(true);
      expect(WALKABLE.has(live.world.terrain.cls[Math.round(b.y) * live.world.terrain.width + Math.round(b.x)])).toBe(true);
      // Reachability: a flood over standable pixels from the Blobbi covers nearly every standable pixel.
      const { width, height } = live.world.terrain;
      const stand = new Uint8Array(width * height);
      let standable = 0;
      for (let y = 0; y < height; y += 2)
        for (let x = 0; x < width; x += 2)
          if (live.collision.canStand(x, y, b.footRx, b.footRy)) {
            stand[y * width + x] = 1;
            standable++;
          }
      const seen = new Uint8Array(width * height);
      const start = (Math.round(b.y) & ~1) * width + (Math.round(b.x) & ~1);
      const queue = [start];
      seen[start] = 1;
      let reached = 0;
      while (queue.length) {
        const i = queue.pop()!;
        if (!stand[i]) continue;
        reached++;
        const x = i % width;
        const y = (i - x) / width;
        for (const [dx, dy] of [
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (!seen[j]) {
            seen[j] = 1;
            queue.push(j);
          }
        }
      }
      expect(standable).toBeGreaterThan(2000);
      expect(reached / standable).toBeGreaterThan(0.9);
      // Resources to gather, within the land.
      const nodes = live.allResources;
      expect(nodes.length).toBeGreaterThan(12);
      for (const n of nodes) expect(isLand(live.world.terrain.cls[Math.round(n.y) * width + Math.round(n.x)])).toBe(true);
      // Room to build the first shelter near the hub, and a plot to farm.
      for (const c of BUILDINGS.shelter.cost) live.inventory.add(c.item, c.quantity);
      live.setBuildMode('shelter');
      expect(findBuildSpot(live, 'shelter')).toBe(true);
      expect(live.placeBuilding()).not.toBeNull();
      live.setBuildMode(null);
    }
  });

  it('is what the title makes and what the cinematic shows', () => {
    const preview = introPreviewWorld('turtle');
    expect(preview.carrier?.variant).toBe(NEW_WORLD_SHELL_VARIANT);
    expect(worldIdentity(preview)).toContain('variant=4');
  });
});
