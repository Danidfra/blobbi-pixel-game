import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateWorld } from '../src/world/generate';
import { LiveWorld, IDLE_INPUT, type LiveInput } from '../src/sim/live-world';
import { findPath } from '../src/sim/brain';

const run = (live: LiveWorld, steps: number, input: Partial<LiveInput> = {}) => {
  for (let i = 0; i < steps; i++) live.update(1 / 60, { ...IDLE_INPUT, ...input, interact: false, plant: false });
};

describe('autonomy', () => {
  it('pathfinding reaches a far free cell, and following the path with the real movement arrives', () => {
    const world = generateTurtleWorld('turtle-2');
    const live = new LiveWorld(world, 'blobbi-9', 16);
    const b = live.blobbi;
    const hub = world.hubs[0];
    const target = { x: hub.x + 120, y: hub.y - 60 };
    const path = findPath(live.nav, { x: b.x, y: b.y }, target);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(1);
    // Every waypoint is standable ground.
    const badWaypoints = path!.filter((p) => !live.collision.canStand(p.x, p.y, b.footRx, b.footRy)).map((p) => `${p.x},${p.y}`);
    expect(badWaypoints).toEqual([]);
    // Follow it as the brain does: steer to the next waypoint through the sliding collision. It must arrive
    // within twice the straight-line time and never stand on blocked ground.
    let x = b.x;
    let y = b.y;
    let next = 1;
    const speed = 30;
    const dt = 1 / 60;
    let length = 0;
    for (let i = 1; i < path!.length; i++) length += Math.hypot(path![i].x - path![i - 1].x, path![i].y - path![i - 1].y);
    const budget = Math.ceil(((length / speed) * 2.5) / dt) + 60;
    let steps = 0;
    while (next < path!.length && steps++ < budget) {
      const wp = path![next];
      const dx = wp.x - x;
      const dy = wp.y - y;
      const d = Math.hypot(dx, dy);
      if (d < 1.5) {
        next++;
        continue;
      }
      const m = live.collision.move(x, y, (dx / d) * speed * dt, (dy / d) * speed * dt, b.footRx, b.footRy);
      x = m.x;
      y = m.y;
      if (!live.collision.canStand(x, y, b.footRx, b.footRy)) throw new Error(`off ground at ${x.toFixed(2)},${y.toFixed(2)} (step ${steps}, waypoint ${next}/${path!.length}, start ${b.x},${b.y} standable ${live.collision.canStand(b.x, b.y, b.footRx, b.footRy)})`);
    }
    expect(next).toBe(path!.length);
    const end = path![path!.length - 1];
    expect(Math.hypot(x - end.x, y - end.y)).toBeLessThan(3);
    // No path into the sea.
    expect(findPath(live.nav, { x: b.x, y: b.y }, { x: 10, y: 10 })).toBeNull();
  });

  it('wanders, idles, inspects and rests on its own, visits several places and never leaves walkable ground', () => {
    for (const seed of ['turtle-0', 'turtle-3']) {
      const world = generateTurtleWorld(seed);
      const live = new LiveWorld(world, 'blobbi-19', 16);
      const states = new Set<string>();
      const targets = new Set<string>();
      let off = 0;
      let moved = 0;
      const start = { x: live.blobbi.x, y: live.blobbi.y };
      for (let i = 0; i < 60 * 120; i++) {
        live.update(1 / 60, IDLE_INPUT);
        const b = live.blobbi;
        states.add(live.brain.state);
        if (live.brain.target) targets.add(`${Math.round(live.brain.target.x)},${Math.round(live.brain.target.y)}`);
        if (!live.collision.canStand(b.x, b.y, b.footRx, b.footRy)) off++;
        if (b.animator.state.moving) moved++;
      }
      expect(off).toBe(0);
      expect(states.has('wander')).toBe(true);
      expect(states.has('idle')).toBe(true);
      expect(targets.size).toBeGreaterThanOrEqual(4);
      expect(moved).toBeGreaterThan(60 * 10);
      expect(Math.hypot(live.blobbi.x - start.x, live.blobbi.y - start.y) + targets.size).toBeGreaterThan(5);
    }
  });

  it('is deterministic: two runs with no input are identical', () => {
    const a = new LiveWorld(generateTurtleWorld('turtle-4'), 'blobbi-9', 16);
    const b = new LiveWorld(generateTurtleWorld('turtle-4'), 'blobbi-9', 16);
    run(a, 60 * 40);
    run(b, 60 * 40);
    expect([a.blobbi.x, a.blobbi.y, a.brain.state, a.brain.target]).toEqual([b.blobbi.x, b.blobbi.y, b.brain.state, b.brain.target]);
  });

  it('manual input takes over at once and autonomy resumes about five seconds after the last input', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-5'), 'blobbi-9', 16);
    run(live, 60 * 4);
    const before = { x: live.blobbi.x, y: live.blobbi.y };
    // Press right for one second: manual state, moving right.
    run(live, 60, { right: true });
    expect(live.brain.state).toBe('manual');
    expect(live.blobbi.x).toBeGreaterThan(before.x);
    expect(live.blobbi.animator.state.direction).toBe('right');
    // Release: still manual for ~5 s, standing still.
    const released = { x: live.blobbi.x, y: live.blobbi.y };
    run(live, 60 * 4);
    expect(live.brain.state).toBe('manual');
    expect(live.blobbi.x).toBe(released.x);
    expect(live.blobbi.y).toBe(released.y);
    expect(live.brain.manualLeft(live.clock.time)).toBeGreaterThan(0);
    expect(live.brain.manualLeft(live.clock.time)).toBeLessThan(1.5);
    // After the timeout, autonomy resumes.
    run(live, 60 * 3);
    expect(live.brain.state).not.toBe('manual');
    expect(live.brain.manualLeft(live.clock.time)).toBe(0);
    // Disabled autonomy stays idle after manual control.
    live.brain.enabled = false;
    run(live, 60, { left: true });
    run(live, 60 * 7);
    expect(live.brain.state).toBe('manual');
  });

  it('works on the island worlds too', () => {
    const live = new LiveWorld(generateWorld('island-brain', { width: 448, height: 288, scale: 1 }), 'abc123', 16);
    let off = 0;
    for (let i = 0; i < 60 * 40; i++) {
      live.update(1 / 60, IDLE_INPUT);
      if (!live.collision.canStand(live.blobbi.x, live.blobbi.y, live.blobbi.footRx, live.blobbi.footRy)) off++;
    }
    expect(off).toBe(0);
    expect(live.brain.state).not.toBe('manual');
  });
});
