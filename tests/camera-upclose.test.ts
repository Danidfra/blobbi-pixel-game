/**
 * M10 "up close", the fourth camera mode: 6× (whole blocks, never blurred), the Blobbi natively at 72 px, following
 * without jitter (tests/walk-stability), inside the world's and the room's bounds, the same HUD as every mode, a camera
 * indicator a finger can tap, and every interaction the same as in any other mode.
 */
import { describe, expect, it } from 'vitest';
import { ViewCamera, CAMERA_MODES, CAMERA_CYCLE, blobbiScreenSize, isCameraMode, worldBounds, UPCLOSE_MIN_VIEW } from '../src/render/view-camera';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { LiveWorld } from '../src/sim/live-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { memoryStore } from '../src/game/persistence';
import { findBuildSpot, pressE, run } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';

const scene = () => {
  const live = new LiveWorld(generateWhaleWorld('upclose', { carrierSeed: 'w', generatedHouse: false }), 'blobbi-9', 16, { store: memoryStore() });
  live.brain.enabled = false;
  return live;
};

describe('up close', () => {
  it('is the fourth mode of the cycle, a whole 6× (5× or 4× only on a very short screen)', () => {
    expect(CAMERA_CYCLE.at(-1)).toBe('upclose');
    expect(isCameraMode('upclose')).toBe(true);
    expect(CAMERA_MODES.upclose.scale).toBe(6);
    const cam = new ViewCamera('upclose');
    const b = worldBounds(scene().world);
    expect(cam.restScale('upclose', 1280, 720, b)).toBe(6);
    expect(cam.restScale('upclose', 1920, 1080, b)).toBe(6);
    expect(cam.restScale('upclose', 844, 390, b)).toBe(6);
    expect(cam.restScale('upclose', 568, 320, b)).toBe(5);
    expect(cam.restScale('upclose', 400, 240, b)).toBe(4);
    for (const H of [240, 320, 390, 720]) expect(H / cam.restScale('upclose', 800, H, b)).toBeGreaterThanOrEqual(Math.min(UPCLOSE_MIN_VIEW, H / 4));
  });

  it('draws the Blobbi natively at 72 px (its proportion to the world unchanged)', () => {
    expect(blobbiScreenSize(16, 'upclose', 6)).toBe(72);
    const live = scene();
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const cam = new ViewCamera('upclose');
    const b = worldBounds(live.world);
    const v = cam.update(0, live.cameraTarget(), 1280, 720, b, true);
    view.render(v, 6, live.clock.time, DEFAULT_LIVE_OPTIONS, DEFAULT_VIEW_UI);
    expect(view.lastBlobbi!.size).toBe(72);
    expect(view.lastBlobbi!.ratio).toBe(1);
    // A native raster, not a magnified sprite: it has pixels a 6× magnification of the 16 px sprite could not.
    expect(view.lastBlobbi!.sprite.buffer.height).toBeGreaterThan(72);
  });

  it('stays within the world at its corners and within the room indoors, on whole screen pixels', () => {
    const live = scene();
    const b = worldBounds(live.world);
    for (const [x, y] of [[2, 2], [b.width - 3, 2], [2, b.height - 3], [b.width - 3, b.height - 3]]) {
      const cam = new ViewCamera('upclose');
      const v = cam.update(0, { x, y, size: 16 }, 1280, 720, b, true);
      expect(v.originX).toBeGreaterThanOrEqual(0);
      expect(v.originY).toBeGreaterThanOrEqual(0);
      expect(v.originX + 1280 / 6).toBeLessThanOrEqual(b.width + 1);
      expect(v.originY + 720 / 6).toBeLessThanOrEqual(b.height + 1);
      // On whole screen pixels: every world pixel a whole 6×6 block.
      expect(Number.isInteger(Math.round(v.originX * 6 * 1e6) / 1e6) && Number.isInteger(Math.round(v.originY * 6 * 1e6) / 1e6)).toBe(true);
    }
    // Indoors: the room's bounds (a room smaller than the screen is centred, never scrolled past).
    live.inventory.add(ITEMS.wood.id, 6);
    live.inventory.add(ITEMS.stone.id, 3);
    live.objectives.completed.materials = 0;
    findBuildSpot(live, 'shelter');
    live.setBuildMode('shelter');
    pressE(live);
    run(live, 60 * 26);
    live.enterInterior(live.home()!);
    run(live, 2);
    const room = live.sceneBounds()!;
    const cam = new ViewCamera('upclose');
    for (const W of [1280, 600]) {
      const v = cam.update(0, live.cameraTarget(), W, 720, room, true);
      if (room.width * 6 <= W) expect(v.originX).toBeCloseTo(Math.round(((room.width - W / 6) / 2) * 6) / 6, 9); // centred to the screen pixel
      else {
        expect(v.originX).toBeGreaterThanOrEqual(0);
        expect(v.originX + W / 6).toBeLessThanOrEqual(room.width + 1);
      }
    }
  });

  it('the same HUD as every other mode (M10 phase B); the indicator can be tapped', () => {
    const live = scene();
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const b = worldBounds(live.world);
    const hud = (mode: 'overview' | 'exploration' | 'closeup' | 'upclose', W: number, H: number) => {
      const cam = new ViewCamera(mode);
      const v = cam.update(0, live.cameraTarget(), W, H, b, true);
      const ui = { ...DEFAULT_VIEW_UI, lighting: false, indicator: false, goals: false, prompt: false };
      const bare = view.render(v, cam.restScale(mode, W, H, b), live.clock.time, DEFAULT_LIVE_OPTIONS, { ...ui, hud: false }).clone();
      const screen = view.render(v, cam.restScale(mode, W, H, b), live.clock.time, DEFAULT_LIVE_OPTIONS, ui);
      // The status card: what the HUD draws over the world in the top-left corner, the same in every mode.
      const box = (view as unknown as { hudBox: { right: number; bottom: number } }).hudBox;
      const px: string[] = [];
      for (let y = 0; y < box.bottom; y++) for (let x = 0; x < box.right; x++) if (screen.get(x, y) !== bare.get(x, y)) px.push(`${x},${y}:${screen.get(x, y)}`);
      return { box, px };
    };
    for (const [W, H] of [[1280, 720], [844, 390]]) {
      const ref = hud('exploration', W, H);
      for (const mode of ['overview', 'closeup', 'upclose'] as const) {
        const h = hud(mode, W, H);
        expect(h.box).toEqual(ref.box);
        // Every card pixel of the reference is drawn identically (world pixels showing through may differ).
        const drawn = new Set(h.px);
        expect(ref.px.filter((p) => !drawn.has(p)).length).toBeLessThan(ref.px.length * 0.02);
      }
    }
    const cam = new ViewCamera('upclose');
    const v = cam.update(0, live.cameraTarget(), 1280, 720, b, true);
    view.render(v, 6, live.clock.time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, lighting: false });
    const ib = view.indicatorBox!;
    expect(view.onIndicator(ib.x + ib.w / 2, ib.y + ib.h / 2)).toBe(true);
    expect(view.onIndicator(640, 360)).toBe(false);
  });

  it('interactions work as in any mode: picking something up, the prompt, reach', () => {
    const live = scene();
    const node = live.resources[0];
    live.blobbi.x = node.x;
    live.blobbi.y = node.y + 3;
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const cam = new ViewCamera('upclose');
    const v = cam.update(0, live.cameraTarget(), 844, 390, worldBounds(live.world), true);
    view.render(v, 6, live.clock.time, DEFAULT_LIVE_OPTIONS, DEFAULT_VIEW_UI);
    expect(String(live.prompt())).toMatch(/^E {2}pick up/);
    const before = live.resources.length;
    pressE(live);
    run(live, 30);
    expect(live.resources.length).toBe(before - 1);
  });
});
