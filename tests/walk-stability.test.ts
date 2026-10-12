import { describe, expect, it } from 'vitest';
import { buildCanonicalSprite } from '../src/blobbi/canonical';
import { buildBlobbiSprite, REST_POSE, type BlobbiPose } from '../src/blobbi/sprite';
import { blobbiIdentity } from '../src/blobbi/identity';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewCamera, worldBounds, type CameraModeId } from '../src/render/view-camera';
import { ViewRenderer } from '../src/render/view-renderer';

const SEEDS = ['blobbi-9', 'abc123', 'blobbi-3'];
const walkFrames = (seed: string, view: BlobbiPose['view'], size: number, snapRig?: boolean) =>
  [0, 1, 2, 3, 4, 5].map((w) => buildCanonicalSprite(blobbiIdentity(seed).genome, { ...REST_POSE, view, walk: w as BlobbiPose['walk'] }, size, snapRig === undefined ? {} : { snapRig }));

/** Pixels that differ between consecutive walk frames above the legs (the top 65% of the Blobbi), over a cycle. */
function upperBodyChurn(frames: ReturnType<typeof walkFrames>, size: number): number {
  let n = 0;
  for (let i = 0; i < frames.length; i++) {
    const a = frames[i];
    const b = frames[(i + 1) % frames.length];
    for (let y = 0; y < a.buffer.height; y++) {
      if (y - a.anchorY >= -size * 0.35) continue;
      for (let x = 0; x < a.buffer.width; x++) if (a.buffer.get(x, y) !== b.buffer.get(x, y)) n++;
    }
  }
  return n;
}

describe('walking at small sizes: no shaking', () => {
  it('reproduces the cause: the raw raster of the kit walk churns the upper body at 12-16 px', () => {
    // The kit's body sway and bounce move the body less than a pixel at these sizes, yet tens of pixels flip.
    for (const size of [12, 14, 16]) expect(upperBodyChurn(walkFrames('blobbi-9', 'front', size, false), size)).toBeGreaterThan(50);
  });

  it('holds the body, face and silhouette still above the legs in the front and back views (12, 14, 16, 24, 32 px)', () => {
    for (const seed of SEEDS)
      for (const view of ['front', 'back'] as const)
        for (const size of [12, 14, 16, 24, 32]) expect(upperBodyChurn(walkFrames(seed, view, size), size), `${seed} ${view} ${size}`).toBe(0);
  });

  it('in the side view only the swinging arm moves above the legs, by whole pixels', () => {
    for (const seed of SEEDS)
      for (const size of [12, 14, 16]) {
        const churn = upperBodyChurn(walkFrames(seed, 'side', size), size);
        const raw = upperBodyChurn(walkFrames(seed, 'side', size, false), size);
        expect(churn, `${seed} ${size}`).toBeLessThan(raw / 2);
        expect(churn).toBeLessThanOrEqual(48);
      }
  });

  it('keeps the walk: the feet still step in every view and size, the anchor never moves', () => {
    for (const seed of SEEDS)
      for (const view of ['front', 'side', 'back'] as const)
        for (const size of [12, 14, 16, 24, 32, 48]) {
          const frames = walkFrames(seed, view, size);
          expect(new Set(frames.map((f) => `${f.anchorX},${f.anchorY},${f.buffer.width},${f.buffer.height}`)).size).toBe(1);
          const distinct = new Set(frames.map((f) => f.buffer.data.join(','))).size;
          expect(distinct, `${seed} ${view} ${size}`).toBeGreaterThan(1);
          // Some foot still touches the ground line in every frame (no floating cycle).
          for (const f of frames) {
            let lowest = -1;
            for (let y = 0; y < f.buffer.height; y++) for (let x = 0; x < f.buffer.width; x++) if (f.buffer.get(x, y) >>> 24) lowest = Math.max(lowest, y);
            expect(Math.abs(lowest - f.anchorY)).toBeLessThanOrEqual(1);
          }
        }
  });

  it('at the close-up size (48 px) only the arms and tuft swing above the legs: the body, face and outline hold', () => {
    // At 48 px the arms and tuft move a whole pixel or more and are drawn as the kit moves them; the body's sway is
    // still under a pixel and holds. Measured over three seeds: 46-308 changed pixels against 544-1011 raw.
    for (const seed of SEEDS)
      for (const view of ['front', 'side', 'back'] as const) {
        const churn = upperBodyChurn(walkFrames(seed, view, 48), 48);
        const raw = upperBodyChurn(walkFrames(seed, view, 48, false), 48);
        expect(churn, `${seed} ${view}`).toBeLessThan(raw / 2.5);
      }
  });

  it('leaves standing, expressions and the 64 px sway alone (motion of a pixel or more is drawn as is)', () => {
    const id = blobbiIdentity('blobbi-9');
    for (const size of [12, 16, 64]) {
      const standing = { ...REST_POSE, expression: 'happy' as const };
      expect(buildCanonicalSprite(id.genome, standing, size).buffer.data).toEqual(buildCanonicalSprite(id.genome, standing, size, { snapRig: false }).buffer.data);
    }
    // At 64 px the body's real sway stays: the upper body still changes through the cycle.
    expect(upperBodyChurn(walkFrames('blobbi-9', 'front', 64), 64)).toBeGreaterThan(500);
  });
});

describe('walking under a following camera: no back-and-forth on screen', () => {
  /** Walk 2 s in a clear direction, then stand 2 s, rendering every display frame like the page does. */
  function track(mode: CameraModeId, hz: number, dir: 'right' | 'left' | 'up' | 'down') {
    const world = generateTurtleWorld('turtle-0');
    const live = new LiveWorld(world, 'blobbi-9', 16);
    live.brain.enabled = false;
    const dx = dir === 'right' ? 1 : dir === 'left' ? -1 : 0;
    const dy = dir === 'down' ? 1 : dir === 'up' ? -1 : 0;
    outer: for (let y = 150; y < 450; y += 3)
      for (let x = 150; x < 450; x += 3) {
        let ok = true;
        for (let k = 0; k <= 90 && ok; k += 2) ok = live.collision.canStand(x + k * dx, y + k * dy, live.blobbi.footRx, live.blobbi.footRy);
        if (ok) {
          live.blobbi.x = x;
          live.blobbi.y = y;
          break outer;
        }
      }
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const camera = new ViewCamera(mode);
    const bounds = worldBounds(world);
    const screen: number[] = [];
    const origin: number[] = [];
    for (let i = 0; i < hz * 4; i++) {
      const steps = live.update(1 / hz, { ...IDLE_INPUT, [dir]: i < hz * 2 });
      const v = camera.update(1 / hz, { x: live.blobbi.x, y: live.blobbi.y, size: live.blobbi.size }, 960, 540, bounds, i === 0, steps * live.clock.dt);
      view.render(v, camera.restScale(mode, 960, 540, bounds), live.clock.time, DEFAULT_LIVE_OPTIONS);
      const b = view.lastBlobbi!;
      screen.push(dx ? b.x : b.y);
      origin.push(dx ? v.originX : v.originY);
    }
    return { screen, origin, sign: dx + dy };
  }

  it('the Blobbi never steps against its walking direction on screen, and the world never scrolls backwards', () => {
    for (const mode of ['exploration', 'closeup'] as const)
      for (const hz of [60, 120, 144])
        for (const dir of ['right', 'left', 'down', 'up'] as const) {
          const { screen, origin, sign } = track(mode, hz, dir);
          for (let i = 2; i < screen.length; i++) {
            // While walking the Blobbi only ever moves forward on screen (or holds); once it stops it drifts back
            // to the centre, which is the other way, monotonically.
            if (i < hz * 2) expect((screen[i] - screen[i - 1]) * sign, `${mode} ${hz} Hz ${dir} frame ${i}`).toBeGreaterThanOrEqual(0);
            else expect((screen[i] - screen[i - 1]) * sign, `${mode} ${hz} Hz ${dir} settling ${i}`).toBeLessThanOrEqual(0);
            expect((origin[i] - origin[i - 1]) * sign, `${mode} ${hz} Hz ${dir} origin ${i}`).toBeGreaterThanOrEqual(0);
          }
        }
    // 24 tracks of up to 576 full-screen frames: ~40 s alone, more beside the rest of the suite.
  }, 240_000);

  it('up close (M10, 6×): the same — never a step backwards, never a backwards scroll', () => {
    for (const hz of [60, 144])
      for (const dir of ['right', 'left', 'down', 'up'] as const) {
        const { screen, origin, sign } = track('upclose', hz, dir);
        for (let i = 2; i < screen.length; i++) {
          if (i < hz * 2) expect((screen[i] - screen[i - 1]) * sign, `upclose ${hz} Hz ${dir} frame ${i}`).toBeGreaterThanOrEqual(0);
          else expect((screen[i] - screen[i - 1]) * sign, `upclose ${hz} Hz ${dir} settling ${i}`).toBeLessThanOrEqual(0);
          expect((origin[i] - origin[i - 1]) * sign, `upclose ${hz} Hz ${dir} origin ${i}`).toBeGreaterThanOrEqual(0);
        }
      }
  }, 240_000);

  it('settles with the Blobbi in the centre of the screen after it stops', () => {
    for (const mode of ['exploration', 'closeup', 'upclose'] as const) {
      const { screen } = track(mode, 60, 'right');
      expect(Math.abs(screen[screen.length - 1] - 480)).toBeLessThanOrEqual(6);
    }
  });
});

describe('the close-up Blobbi is a native 48 px raster', () => {
  it('each mode selects its own size, the caches never share a sprite, and switching back reuses the right one', () => {
    const world = generateTurtleWorld('turtle-0');
    const live = new LiveWorld(world, 'blobbi-9', 16);
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const bounds = worldBounds(world);
    const pose = live.blobbi.animator.pose(live.clock.time);
    const seen = new Map<CameraModeId, ReturnType<typeof buildBlobbiSprite>>();
    for (const mode of ['overview', 'exploration', 'closeup', 'overview', 'closeup'] as const) {
      const camera = new ViewCamera(mode);
      const v = camera.update(0, { x: live.blobbi.x, y: live.blobbi.y, size: 16 }, 960, 540, bounds, true);
      view.render(v, camera.restScale(mode, 960, 540, bounds), live.clock.time, DEFAULT_LIVE_OPTIONS);
      const drawn = view.lastBlobbi!;
      const expected = { overview: 12, exploration: 24, closeup: 48 }[mode];
      expect(drawn.size).toBe(expected);
      expect(drawn.ratio).toBe(1);
      expect(drawn.sprite.buffer.data).toEqual(buildBlobbiSprite(live.blobbi.identity, pose, expected).buffer.data);
      if (seen.has(mode)) expect(drawn.sprite).toBe(seen.get(mode)); // the same cached object for the same size
      seen.set(mode, drawn.sprite);
    }
    expect(seen.get('closeup')!.buffer.height).toBeGreaterThan(48);
    expect(seen.get('closeup')).not.toBe(seen.get('exploration'));
    expect(view.native(48)!.size).toBe(48);
    expect(view.native(24)!.size).toBe(24);
    expect(view.native(12)!.size).toBe(12);
  });

  it('is rasterized from the genome at 48 and 24 px: never the 12 px raster scaled up', () => {
    const id = blobbiIdentity('blobbi-9');
    const s12 = buildBlobbiSprite(id, REST_POSE, 12);
    for (const [size, k] of [[24, 2], [48, 4]] as const) {
      const native = buildBlobbiSprite(id, REST_POSE, size);
      const magnified = s12.buffer.scaled(k);
      expect(native.buffer.data.length === magnified.data.length && native.buffer.data.every((c, i) => c === magnified.data[i])).toBe(false);
      // A magnified sprite is made of k×k blocks of one colour; the native one mixes colours inside many of them.
      let mixed = 0;
      for (let y = 0; y + k <= native.buffer.height; y += k)
        for (let x = 0; x + k <= native.buffer.width; x += k) {
          const c = native.buffer.get(x, y);
          let uniform = true;
          for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) if (native.buffer.get(x + i, y + j) !== c) uniform = false;
          if (!uniform) mixed++;
        }
      expect(mixed, `${size}`).toBeGreaterThan(20);
      // The standing height in pixels is the requested one: crown to ground line spans about `size` rows.
      let top = Infinity;
      for (let y = 0; y < native.buffer.height; y++) for (let x = 0; x < native.buffer.width; x++) if (native.buffer.get(x, y) >>> 24) top = Math.min(top, y);
      expect(native.anchorY - top, `${size}`).toBeGreaterThanOrEqual(size);
      expect(native.anchorY - top, `${size}`).toBeLessThanOrEqual(Math.ceil(size * 1.2));
    }
  });
});
