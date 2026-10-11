import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { LiveRenderer } from '../src/render/live-render';
import { ViewRenderer } from '../src/render/view-renderer';
import { ViewCamera, CAMERA_CYCLE, worldBounds } from '../src/render/view-camera';
import { ARRIVE, DEPART, SKY, TeleportController } from '../src/game/teleport';
import { teleportSprite } from '../src/render/teleport-render';
import { memoryStore, saveKey } from '../src/game/persistence';
import { ITEMS } from '../src/game/items';

const world = generateTurtleWorld('turtle-0');
const step = (live: LiveWorld, seconds: number, input = {}) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) live.update(1 / 60, { ...IDLE_INPUT, ...input });
};
const NO_UI = { hud: false, indicator: false, uiScale: 2 };

describe('teleport controller', () => {
  it('runs present → departing → absent → arriving → present', () => {
    const t = new TeleportController('s');
    expect(t.getPresenceState()).toBe('present');
    expect(t.enterBlobbi(0)).toBe(false); // already here
    expect(t.leaveBlobbi(0)).toBe(true);
    expect(t.state).toBe('departing');
    expect(t.leaveBlobbi(0.1)).toBe(false); // no overlapping departures
    const events: string[] = [];
    for (let now = 0; now <= DEPART.end + 0.1; now += 1 / 60) events.push(...t.step(now));
    expect(t.state).toBe('absent');
    expect(events).toEqual(['gather', 'dissolve', 'whoosh', 'gone']);
    expect(t.visible(10)).toBe(0);
    expect(t.enterBlobbi(10)).toBe(true);
    const back: string[] = [];
    for (let now = 10; now <= 10 + ARRIVE.end + 0.1; now += 1 / 60) back.push(...t.step(now));
    expect(t.state).toBe('present');
    expect(back).toEqual(['incoming', 'rebuild', 'arrived']);
  });

  it('dissolves from the top and is fully gone only at the end of departure', () => {
    const t = new TeleportController('s');
    t.leaveBlobbi(0);
    expect(t.visible(DEPART.dissolveStart - 0.01)).toBe(1);
    const mid = t.visible((DEPART.dissolveStart + DEPART.dissolveEnd) / 2);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    t.step(DEPART.end - 0.05);
    expect(t.state).toBe('departing');
    t.step(DEPART.end);
    expect(t.state).toBe('absent');
  });

  it('closes the eyes while concentrating and rebuilding, opens them before the end', () => {
    const t = new TeleportController('s');
    t.leaveBlobbi(0);
    expect(t.eyesClosed(0.05)).toBe(false);
    expect(t.eyesClosed(0.5)).toBe(true);
    expect(t.squash(0.6)).toBeGreaterThan(0);
    t.step(DEPART.end);
    t.enterBlobbi(5);
    expect(t.eyesClosed(5 + ARRIVE.rebuildStart + 0.3)).toBe(true);
    expect(t.eyesClosed(5 + ARRIVE.openEyes + 0.05)).toBe(false);
  });

  it('departing pixels rise and accelerate; arriving ones fall from the sky', () => {
    const t = new TeleportController('s');
    t.leaveBlobbi(0);
    const a = t.particles(1.6);
    const b = t.particles(1.75);
    expect(a.length).toBeGreaterThan(5);
    const meanZ = (ps: { z: number }[]) => ps.reduce((s, p) => s + p.z, 0) / ps.length;
    expect(meanZ(b)).toBeGreaterThan(meanZ(a));
    for (const p of a) expect(p.trail.every((z) => z <= p.z + 1e-9)).toBe(true); // trails hang below a rising pixel
    t.step(DEPART.end);
    t.enterBlobbi(10);
    const early = t.particles(10.3);
    expect(early.length).toBeGreaterThan(0);
    expect(Math.min(...early.map((p) => p.z))).toBeGreaterThan(SKY * 0.6); // the cluster starts high above
    const later = t.particles(10 + 1.5);
    expect(meanZ(later)).toBeLessThan(meanZ(early));
    for (const p of later) expect(p.trail.every((z) => z >= p.z - 1e-9)).toBe(true); // trails above a falling pixel
  });

  it('leaves no particles once a transition ends or is cancelled', () => {
    const t = new TeleportController('s');
    t.leaveBlobbi(0);
    t.step(DEPART.end + 0.01);
    expect(t.particles(DEPART.end + 0.01)).toEqual([]);
    t.enterBlobbi(5);
    expect(t.particles(5.5).length).toBeGreaterThan(0);
    t.cancelTransition();
    expect(t.state).toBe('present');
    expect(t.particles(5.6)).toEqual([]);
    expect(t.step(5.6)).toEqual(['cancelled']);
  });

  it('reverses mid-way without the sprite jumping', () => {
    const t = new TeleportController('s');
    t.leaveBlobbi(0);
    const now = (DEPART.dissolveStart + DEPART.dissolveEnd) / 2;
    const before = t.visible(now);
    expect(t.reverse(now)).toBe(true);
    expect(t.state).toBe('arriving');
    expect(Math.abs(t.visible(now) - before)).toBeLessThan(0.02);
    expect(t.step(now)).toEqual(['reversed']);
    // And back again: an arrival reversed by leaveBlobbi.
    const later = now + 0.3;
    const v = t.visible(later);
    expect(t.leaveBlobbi(later)).toBe(true);
    expect(t.state).toBe('departing');
    expect(Math.abs(t.visible(later) - v)).toBeLessThan(0.02);
  });

  it('is deterministic for a seed', () => {
    const run = () => {
      const t = new TeleportController('seed-a');
      t.leaveBlobbi(0);
      return JSON.stringify(t.particles(1.5));
    };
    expect(run()).toBe(run());
  });

  it('reduced motion: shorter, fewer pixels, no camera movement; fixed per transition', () => {
    const full = new TeleportController('s');
    const calm = new TeleportController('s');
    calm.reducedMotion = true;
    full.leaveBlobbi(0);
    calm.leaveBlobbi(0);
    expect(calm.particles(1.0).length).toBeLessThan(full.particles(1.6).length);
    for (let now = 0; now < 3; now += 0.1) expect(calm.cameraLift(now)).toBe(0);
    calm.step(DEPART.end * 0.6 + 0.01);
    expect(calm.state).toBe('absent');
    // Toggling mid-transition never jumps the one running.
    full.reducedMotion = true;
    expect(full.visible(0.7)).toBe(1);
    expect(full.visible(DEPART.dissolveEnd)).toBe(0);
    expect(full.cameraLift(DEPART.end - 0.1)).toBeGreaterThan(0);
  });
});

describe('teleport in the live world', () => {
  it('locks movement, actions and autonomy while away, and restores them after arrival', () => {
    const live = new LiveWorld(world, 'blobbi-9', 16);
    step(live, 1);
    const start = { x: live.blobbi.x, y: live.blobbi.y };
    live.leaveBlobbi();
    step(live, 1, { right: true });
    expect(live.blobbi.x).toBe(start.x);
    step(live, 3, { right: true, down: true });
    expect(live.getPresenceState()).toBe('absent');
    expect({ x: live.blobbi.x, y: live.blobbi.y }).toEqual(start);
    // The E key does nothing while away.
    const bag = JSON.stringify(live.inventory.entries());
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    step(live, 0.5);
    expect(JSON.stringify(live.inventory.entries())).toBe(bag);
    live.enterBlobbi();
    step(live, ARRIVE.end + 0.2);
    expect(live.getPresenceState()).toBe('present');
    expect(live.sounds).toContain('teleport-arrived');
    step(live, 0.5, { right: true });
    expect(live.blobbi.x).toBeGreaterThan(start.x);
  });

  it('preserves the bag, the equipped tool, care, identity and the world', () => {
    const live = new LiveWorld(world, 'blobbi-9', 16);
    live.inventory.add(ITEMS.wood.id, 5);
    const identity = live.blobbi.identity;
    const bag = JSON.stringify(live.inventory.entries());
    const time = live.worldTime;
    live.leaveBlobbi();
    step(live, DEPART.end + 0.5);
    live.enterBlobbi();
    step(live, ARRIVE.end + 0.2);
    expect(live.blobbi.identity).toBe(identity);
    expect(JSON.stringify(live.inventory.entries())).toBe(bag);
    expect(live.worldTime).toBeGreaterThan(time);
  });

  it('lands at a requested spot on free ground', () => {
    const live = new LiveWorld(world, 'blobbi-9', 16);
    live.leaveBlobbi();
    step(live, DEPART.end + 0.1);
    const target = { x: live.blobbi.x + 40, y: live.blobbi.y + 10 };
    expect(live.enterBlobbi(target)).toBe(true);
    expect(live.collision.canStand(live.blobbi.x, live.blobbi.y, live.blobbi.footRx, live.blobbi.footRy)).toBe(true);
    expect(Math.hypot(live.blobbi.x - target.x, live.blobbi.y - target.y)).toBeLessThan(20);
  });

  it('a paused world (open menu, hidden tab) pauses the transition', () => {
    const live = new LiveWorld(world, 'blobbi-9', 16);
    live.leaveBlobbi();
    step(live, 1);
    const v = live.teleport.visible(live.clock.time);
    live.clock.paused = true;
    step(live, 5);
    expect(live.getPresenceState()).toBe('departing');
    expect(live.teleport.visible(live.clock.time)).toBe(v);
    live.clock.paused = false;
    step(live, 3);
    expect(live.getPresenceState()).toBe('absent');
  });

  it('presence is never saved: a reload is always present, and nothing is written for it', () => {
    const store = memoryStore();
    const live = new LiveWorld(world, 'blobbi-9', 16, { store });
    live.leaveBlobbi();
    step(live, DEPART.end + 0.5);
    live.save();
    const raw = store.get(saveKey(live.identity)) ?? '';
    expect(raw.length).toBeGreaterThan(100);
    expect(raw).not.toMatch(/presence|teleport|absent/);
    const again = new LiveWorld(world, 'blobbi-9', 16, { store });
    expect(again.getPresenceState()).toBe('present');
  });

  it('draws in every camera mode: nothing when absent, a partial sprite mid-way, particles, then the whole Blobbi', () => {
    for (const mode of CAMERA_CYCLE) {
      const live = new LiveWorld(world, 'blobbi-9', 16);
      const view = new ViewRenderer(live, new LiveRenderer(live));
      const camera = new ViewCamera(mode);
      const bounds = worldBounds(world);
      const rest = camera.restScale(mode, 480, 270, bounds);
      const frame = () => view.render(camera.update(0, live.cameraTarget(270 / rest), 480, 270, bounds, true), rest, live.clock.time, { hud: false } as never, NO_UI);
      const present = frame().clone();
      live.leaveBlobbi();
      step(live, (DEPART.dissolveStart + DEPART.dissolveEnd) / 2);
      frame();
      expect(view.teleportAnchor).not.toBeNull();
      expect(view.teleportParticles).toBeGreaterThan(0);
      step(live, DEPART.end);
      expect(live.getPresenceState()).toBe('absent');
      frame();
      expect(view.teleportParticles).toBe(0);
      live.enterBlobbi();
      step(live, ARRIVE.end + 2);
      const back = frame();
      expect(view.teleportAnchor).toBeNull();
      expect(view.lastBlobbi).not.toBeNull();
      expect(back.width).toBe(present.width);
    }
  });

  it('the dissolve keeps the canonical pixels below the cut (identity preserved)', () => {
    const live = new LiveWorld(world, 'blobbi-9', 16);
    const sprite = live.blobbiSprite(live.blobbi.animator.pose(0));
    const t = new TeleportController('s');
    t.leaveBlobbi(0);
    const now = (DEPART.dissolveStart + DEPART.dissolveEnd) / 2;
    const shown = teleportSprite(sprite, t, now)!;
    const W = sprite.buffer.width;
    const H = sprite.buffer.height;
    // The bottom rows (well below the cut and its band) are exactly the canonical sprite.
    for (let y = H - 3; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = sprite.buffer.data[y * W + x];
        if (c >>> 24) expect(shown.buffer.data[(y + 1) * (W + 2) + x + 1]).toBe(c);
      }
    // The top row of the body is gone.
    let top = 0;
    while (top < H && !sprite.buffer.data.slice(top * W, top * W + W).some((c) => c >>> 24)) top++;
    for (let x = 0; x < W; x++) if (sprite.buffer.data[top * W + x] >>> 24) expect(shown.buffer.data[(top + 1) * (W + 2) + x + 1]).not.toBe(sprite.buffer.data[top * W + x]);
  });

  it('camera lifts during the choreography and settles back on the Blobbi', () => {
    const live = new LiveWorld(world, 'blobbi-9', 16);
    live.leaveBlobbi();
    step(live, DEPART.end + 0.2);
    expect(live.cameraTarget(100).y).toBeLessThan(live.blobbi.y);
    live.enterBlobbi();
    step(live, ARRIVE.end + 0.1);
    expect(live.cameraTarget(100).y).toBe(live.blobbi.y);
  });
});
