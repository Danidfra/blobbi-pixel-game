import { describe, expect, it } from 'vitest';
import { blobbiIdentity } from '../src/blobbi/identity';
import { buildBlobbiSprite, EXPRESSIONS, REST_POSE, type BlobbiPose } from '../src/blobbi/sprite';
import { BlobbiAnimator, BLINK_DURATION, TURN_DURATION } from '../src/blobbi/animation';
import { generateWorld } from '../src/world/generate';
import { LiveWorld, IDLE_INPUT, type LiveInput } from '../src/sim/live-world';
import { LiveRenderer, Camera, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { CollisionMap } from '../src/sim/collision';
import { SimClock } from '../src/sim/clock';
import { generateTree } from '../src/objects/tree';
import { COZY } from '../src/core/palette';
import { T } from '../src/world/types';

const SEEDS = ['abc123', 'pattern-0', 'horns-1', 'ears-2', 'tail-3', 'blobbi', 'pip-0001', 'momo-4242'];

describe('pixel blobbi', () => {
  it('is deterministic: the same seed and pose give the same pixels', () => {
    for (const seed of SEEDS) {
      const a = buildBlobbiSprite(blobbiIdentity(seed), REST_POSE, 24);
      const b = buildBlobbiSprite(blobbiIdentity(seed), REST_POSE, 24);
      expect(a.buffer.data).toEqual(b.buffer.data);
    }
  });

  it('reads identity from the kit genome: colours and traits differ between seeds', () => {
    const ids = SEEDS.map(blobbiIdentity);
    expect(new Set(ids.map((i) => i.body.mid)).size).toBeGreaterThan(4);
    expect(new Set(ids.map((i) => `${i.antenna.count}${i.pattern.kind}${i.mark.kind}${i.tail.kind}`)).size).toBeGreaterThan(4);
  });

  it('keeps one identity across the four directions: same colours, same traits, similar mass', () => {
    for (const seed of SEEDS) {
      const id = blobbiIdentity(seed);
      const views: BlobbiPose[] = [
        { ...REST_POSE, view: 'front' },
        { ...REST_POSE, view: 'back' },
        { ...REST_POSE, view: 'side', facing: 1 },
        { ...REST_POSE, view: 'side', facing: -1 },
      ];
      const sprites = views.map((p) => buildBlobbiSprite(id, p, 24));
      // Every view carries paint (the fidelity suite checks the anatomy and colours against the kit palette).
      for (const s of sprites) expect(s.buffer.opaqueCount()).toBeGreaterThan(40);
      // Front and back share a height; the back is at most the arms narrower; the side is narrower, same height.
      const b = sprites.map((s) => s.buffer.bounds()!);
      expect(Math.abs(b[0].h - b[1].h)).toBeLessThanOrEqual(2);
      expect(b[1].w).toBeLessThanOrEqual(b[0].w);
      expect(b[0].w - b[1].w).toBeLessThanOrEqual(8);
      expect(b[2].w).toBeLessThan(b[0].w);
      expect(Math.abs(b[2].h - b[0].h)).toBeLessThanOrEqual(3);
      // Left is the mirror of right in silhouette (not in lighting).
      const right = sprites[2].buffer.opaqueMask();
      const left = sprites[3].buffer.opaqueMask();
      let mismatch = 0;
      for (let y = 0; y < right.height; y++) for (let x = 0; x < right.width; x++) if (right.get(x, y) !== left.get(right.width - 1 - x, y)) mismatch++;
      expect(mismatch / right.count()).toBeLessThan(0.2); // pixel rounding of off-centre features
    }
  });

  it('every pose at every size has valid geometry', () => {
    const id = blobbiIdentity('abc123');
    for (const size of [10, 14, 18, 24, 32, 48, 64]) {
      for (const expression of EXPRESSIONS) {
        for (const lid of [0, 1, 2] as const) {
          for (const walk of [-1, 0, 2, 4] as const) {
            const s = buildBlobbiSprite(id, { ...REST_POSE, expression, lid, walk, view: walk >= 0 ? 'side' : 'front' }, size);
            expect(s.buffer.opaqueCount()).toBeGreaterThan(10);
            expect(() => s.buffer.validate()).not.toThrow();
            expect(s.anchorX).toBeGreaterThanOrEqual(0);
            expect(s.anchorX).toBeLessThan(s.buffer.width);
            expect(s.anchorY).toBeLessThanOrEqual(s.buffer.height);
            const b = s.buffer.bounds()!;
            // Nothing escapes the buffer: the bounds are inside and the standing height is near the nominal size.
            expect(b.y).toBeGreaterThanOrEqual(0);
            expect(b.h).toBeGreaterThanOrEqual(size * 0.8);
            expect(b.h).toBeLessThanOrEqual(size * 1.5 + 4);
          }
        }
      }
    }
  });

  it('expressions and blinks change the face, nothing else', () => {
    const id = blobbiIdentity('pattern-0');
    const neutral = buildBlobbiSprite(id, REST_POSE, 24);
    for (const expression of EXPRESSIONS.filter((e) => e !== 'neutral')) {
      const s = buildBlobbiSprite(id, { ...REST_POSE, expression }, 24);
      expect(s.buffer.data).not.toEqual(neutral.buffer.data);
      let changed = 0;
      for (let i = 0; i < s.buffer.data.length; i++) if (s.buffer.data[i] !== neutral.buffer.data[i]) changed++;
      expect(changed).toBeLessThan(neutral.buffer.opaqueCount() * 0.3);
    }
    const blink = buildBlobbiSprite(id, { ...REST_POSE, lid: 2 }, 24);
    expect(blink.buffer.data).not.toEqual(neutral.buffer.data);
  });
});

describe('animator', () => {
  it('walks through four phases, breathes when idle, blinks on the seed schedule, deterministically', () => {
    const run = () => {
      const a = new BlobbiAnimator('anim');
      const phases = new Set<number>();
      let blinks = 0;
      let lastLid = 0;
      const dt = 1 / 60;
      let t = 0;
      for (let i = 0; i < 60 * 6; i++) {
        a.step(dt, t, { moving: i < 180, direction: 'right' });
        const p = a.pose(t);
        if (i < 180) phases.add(p.walk);
        if (p.lid === 2 && lastLid !== 2) blinks++;
        lastLid = p.lid;
        t += dt;
      }
      return { phases: [...phases].sort(), blinks, breath: a.pose(t).breath, poseKey: JSON.stringify(a.pose(t)) };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(a.phases).toEqual([0, 1, 2, 3, 4, 5]);
    expect(a.blinks).toBeGreaterThanOrEqual(1);
  });

  it('turns through a side frame when reversing direction, and faces the right way', () => {
    const a = new BlobbiAnimator('turn');
    const dt = 1 / 60;
    a.step(dt, 0, { moving: true, direction: 'down' });
    expect(a.pose(0).view).toBe('front');
    a.step(dt, dt, { moving: true, direction: 'up' });
    expect(a.pose(dt).view).toBe('side');
    a.step(dt, TURN_DURATION + 0.05, { moving: true, direction: 'up' });
    expect(a.pose(TURN_DURATION + 0.05).view).toBe('back');
    a.step(dt, 1, { moving: true, direction: 'left' });
    expect(a.pose(1)).toMatchObject({ view: 'side', facing: -1 });
    a.step(dt, 2, { moving: false, direction: 'right' });
    expect(a.pose(2)).toMatchObject({ view: 'side', facing: -1 }); // reversing: still turning through the old facing
    a.step(dt, 2 + TURN_DURATION + 0.05, { moving: false, direction: 'right' });
    expect(a.pose(2 + TURN_DURATION + 0.05)).toMatchObject({ view: 'side', facing: 1, walk: -1 });
  });

  it('reactions set an expression for their duration, then clear', () => {
    const a = new BlobbiAnimator('react');
    a.step(1 / 60, 0, { moving: false, direction: 'down' });
    a.react('happy', 0, 1);
    expect(a.pose(0.5).expression).toBe('happy');
    expect(a.hop(0.1)).toBeLessThan(0);
    a.step(1 / 60, 1.1, { moving: false, direction: 'down' });
    expect(a.pose(1.1).expression).toBe('neutral');
    expect(a.hop(1.1)).toBe(0);
    expect(BLINK_DURATION).toBeGreaterThan(0);
  });
});

describe('simulation clock', () => {
  it('advances in fixed steps and caps a stall', () => {
    const c = new SimClock();
    expect(c.advance(1 / 60)).toBe(1);
    expect(c.advance(1 / 30)).toBe(2);
    expect(c.advance(2)).toBe(6);
    c.paused = true;
    expect(c.advance(1)).toBe(0);
    c.paused = false;
    c.speed = 2;
    expect(c.advance(1 / 60)).toBe(2);
  });
});

describe('collision', () => {
  const world = generateWorld('collide');
  const live = new LiveWorld(world, 'abc123');
  const map = live.collision;

  it('blocks water and object footprints, allows grass, sand, paths, bridges', () => {
    const { width, cls } = world.terrain;
    let waterBlocked = 0;
    let waterTotal = 0;
    let grassFree = 0;
    let grassTotal = 0;
    for (let i = 0; i < cls.length; i++) {
      if (cls[i] <= T.FOAM) {
        waterTotal++;
        if (map.blocked[i]) waterBlocked++;
      } else if (cls[i] === T.GRASS || cls[i] === T.PATH) {
        grassTotal++;
        if (!map.blocked[i]) grassFree++;
      }
    }
    expect(waterBlocked / waterTotal).toBeGreaterThan(0.98); // bridge decks are the exception
    expect(grassFree / grassTotal).toBeGreaterThan(0.6); // footprints and cliff rims take the rest
    for (const b of world.bridges) {
      const mx = Math.floor((b.x0 + b.x1) / 2);
      const my = Math.floor((b.y0 + b.y1) / 2);
      expect(map.blocked[my * width + mx]).toBe(0);
    }
    for (const o of world.objects) {
      if (o.kind === 'tree' || o.kind === 'house') expect(map.blocked[o.y * width + o.x]).toBe(1);
    }
  });

  it('move slides along obstacles and never ends in a blocked spot', () => {
    const b = live.blobbi;
    let x = b.x;
    let y = b.y;
    const rng = (() => {
      let s = 7;
      return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
    })();
    for (let i = 0; i < 2000; i++) {
      const r = map.move(x, y, rng() * 3, rng() * 3, b.footRx, b.footRy);
      x = r.x;
      y = r.y;
      expect(map.canStand(x, y, b.footRx, b.footRy)).toBe(true);
    }
  });

  it('crossing a bridge: walking along its deck is never blocked', () => {
    const w = generateWorld('bridge-walk');
    const l = new LiveWorld(w, 'abc123');
    expect(w.bridges.length).toBeGreaterThan(0);
    const b = w.bridges[0];
    const half = 1;
    if (b.axis === 'h') for (let x = b.x0; x <= b.x1; x++) expect(l.collision.canStand(x + 0.5, b.y0 + 0.5, half, 1)).toBe(true);
    else for (let y = b.y0; y <= b.y1; y++) expect(l.collision.canStand(b.x0 + 0.5, y + 0.5, 1, half)).toBe(true);
  });

  it('fromWorld with extra solids blocks them', () => {
    const w = generateWorld('extra');
    const l = new LiveWorld(w, 'abc123');
    const tree = w.objects.find((o) => o.kind === 'tree')!;
    const m = CollisionMap.fromWorld(w, (p) => l.spriteOf(p), [{ ...tree, x: tree.x + 40, y: tree.y }]);
    expect(m.isBlocked(tree.x + 40, tree.y) || m.isBlocked(tree.x, tree.y)).toBe(true);
  });
});

describe('live world', () => {
  const script = (steps: number, input: Partial<LiveInput>) => Array.from({ length: steps }, (_, i) => ({ ...IDLE_INPUT, ...input, interact: i === 0 && !!input.interact, plant: i === 0 && !!input.plant }));

  it('replays deterministically: the same inputs give the same state and pixels', () => {
    const run = () => {
      const world = generateWorld('replay');
      const live = new LiveWorld(world, 'abc123');
      const renderer = new LiveRenderer(live);
      const inputs = [...script(90, { right: true }), ...script(30, { down: true }), ...script(5, { interact: true }), ...script(60, {}), ...script(5, { plant: true }), ...script(120, {})];
      for (const inp of inputs) live.update(1 / 60, inp);
      const frame = renderer.render(160, 120, live.blobbi.x - 80, live.blobbi.y - 60, live.clock.time, DEFAULT_LIVE_OPTIONS);
      return { x: live.blobbi.x, y: live.blobbi.y, t: live.clock.time, particles: live.particles.particles.map((p) => [p.kind, p.x, p.y]), planted: live.planted.length, pixels: frame.data.slice() };
    };
    const a = run();
    const b = run();
    expect(a.x).toBe(b.x);
    expect(a.t).toBeCloseTo(310 / 60, 6);
    expect(a.particles).toEqual(b.particles);
    expect(a.pixels).toEqual(b.pixels);
    expect(a.planted).toBe(b.planted);
  });

  it('the blobbi moves when walked and stays on walkable ground', () => {
    const world = generateWorld('walk');
    const live = new LiveWorld(world, 'abc123');
    const start = { x: live.blobbi.x, y: live.blobbi.y };
    for (const inp of script(60, { right: true })) live.update(1 / 60, inp);
    expect(live.blobbi.x).not.toBe(start.x);
    expect(live.collision.canStand(live.blobbi.x, live.blobbi.y, live.blobbi.footRx, live.blobbi.footRy)).toBe(true);
    expect(live.blobbi.animator.state.direction).toBe('right');
  });

  it('interactions react and spawn particles; planting adds a growing tree', () => {
    const world = generateWorld('interact');
    const live = new LiveWorld(world, 'abc123');
    // Walk toward the nearest tree until facing it, then interact.
    const tree = world.objects.filter((o) => o.kind === 'tree').sort((a, b) => Math.hypot(a.x - live.blobbi.x, a.y - live.blobbi.y) - Math.hypot(b.x - live.blobbi.x, b.y - live.blobbi.y))[0];
    for (let i = 0; i < 600 && !live.facingObject(); i++) {
      const dx = tree.x - live.blobbi.x;
      const dy = tree.y - live.blobbi.y;
      live.update(1 / 60, { ...IDLE_INPUT, right: dx > 2, left: dx < -2, down: dy > 2, up: dy < -2 });
    }
    expect(live.facingObject()).not.toBeNull();
    const before = live.particles.particles.length;
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    expect(live.particles.particles.length).toBeGreaterThan(before);
    expect(live.blobbi.animator.state.reaction).not.toBeNull();
    // Planting: walk off into the open, then plant; grows with the clock, becomes solid at 30%.
    live.growDuration = 2;
    for (let i = 0; i < 240 && live.planted.length === 0; i++) {
      live.update(1 / 60, { ...IDLE_INPUT, down: i % 2 === 0, left: i % 2 === 1 });
      if (i % 10 === 9) live.update(1 / 60, { ...IDLE_INPUT, plant: true });
    }
    expect(live.planted.length).toBe(1);
    const g0 = live.growthOf(live.planted[0]);
    for (const inp of script(120, {})) live.update(1 / 60, inp);
    expect(live.growthOf(live.planted[0])).toBeGreaterThan(g0);
    expect(live.planted[0].solid).toBe(true);
  });

  it('renders at viewport size with the camera clamped to the world', () => {
    const world = generateWorld('cam');
    const live = new LiveWorld(world, 'abc123');
    const renderer = new LiveRenderer(live);
    const cam = new Camera();
    cam.follow(-100, -100, 200, 150, world.options.width, world.options.height, 1, true);
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
    cam.follow(10000, 10000, 200, 150, world.options.width, world.options.height, 1, true);
    expect(cam.x).toBe(world.options.width - 200);
    cam.follow(0, 0, 1000, 1000, world.options.width, world.options.height, 1, true);
    expect(cam.x).toBeLessThan(0); // centred: the world is smaller than the view
    const frame = renderer.render(200, 150, cam.x, cam.y, 0, { ...DEFAULT_LIVE_OPTIONS, debugCollision: true });
    expect(frame.width).toBe(200);
    expect(frame.height).toBe(150);
    expect(() => frame.validate()).not.toThrow();
  });
});

describe('growth', () => {
  it('is reproducible and keeps the mature morphology at every age', () => {
    for (const seed of ['oak-1', 'fir-2', 'elm-3', 'yew-4']) {
      const mature = generateTree({ seed, size: 30, palette: COZY, growth: 1 });
      let prevH = 0;
      for (const g of [0, 0.05, 0.1, 0.2, 0.3, 0.45, 0.6, 0.75, 0.9, 1]) {
        const a = generateTree({ seed, size: 30, palette: COZY, growth: g });
        const b = generateTree({ seed, size: 30, palette: COZY, growth: g });
        expect(a.buffer.data).toEqual(b.buffer.data);
        expect(() => a.buffer.validate()).not.toThrow();
        const h = a.buffer.bounds()!.h;
        expect(h).toBeGreaterThanOrEqual(prevH - 1); // never shrinks
        prevH = h;
        if (g >= 0.3) {
          expect(a.variation.trunk).toBe(mature.variation.trunk);
          expect(a.variation.foliage).toBe(mature.variation.foliage);
          // A layered canopy is drawn round until it is 24 px tall (tiers need pixels); every other kind is itself throughout.
          if (g >= 0.8 || mature.variation.canopy !== 'layered') expect(a.variation.canopy).toBe(mature.variation.canopy);
        }
        if (g < 0.85) expect(a.variation.fruit).toBe(false);
      }
      expect(generateTree({ seed, size: 30, palette: COZY, growth: 0 }).buffer.bounds()!.h).toBeLessThan(8);
      expect(generateTree({ seed, size: 30, palette: COZY }).buffer.data).toEqual(mature.buffer.data);
    }
  });
});
