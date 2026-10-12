/**
 * M10 performance work changes how frames are made, never what they look like: the lighting tables give exactly the
 * per-pixel formula, and the split view no longer rasterizes a gameplay-size Blobbi it does not draw.
 */
import { describe, expect, it } from 'vitest';
import { applyLight, type LightSource } from '../src/game/daylight';
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { ViewCamera, worldBounds } from '../src/render/view-camera';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { memoryStore } from '../src/game/persistence';
import { stream } from '../src/core/rng';

/** The M9 formula, pixel by pixel, as the reference. */
function reference(data: Uint32Array, width: number, height: number, ox: number, oy: number, light: { dark: number; warm: number }, rain: number, lights: readonly LightSource[]): void {
  const dark = Math.min(0.5, light.dark + rain * 0.12);
  const warm = light.warm;
  if (dark < 0.01 && warm < 0.01) return;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const c = data[i];
      if (c >>> 24 === 0) continue;
      let f = 1;
      for (const l of lights) {
        const dx = x + ox - l.x;
        const dy = (y + oy - l.y) * 1.3;
        const d2 = dx * dx + dy * dy;
        if (d2 < l.radius * l.radius) f = Math.min(f, Math.sqrt(d2) / l.radius);
      }
      const d = dark * f;
      const glow = (1 - f) * light.dark * 1.2;
      let r = c & 0xff;
      let g = (c >>> 8) & 0xff;
      let b = (c >>> 16) & 0xff;
      r = r * (1 - d * 1.05) * (1 + warm * 0.1) + glow * 40;
      g = g * (1 - d * 0.9) * (1 - warm * 0.03) + glow * 28;
      b = b * (1 - d * 0.45) * (1 - warm * 0.18) + d * 40;
      data[i] = ((c & 0xff000000) | (Math.min(255, Math.max(0, b)) << 16) | (Math.min(255, Math.max(0, g)) << 8) | Math.min(255, Math.max(0, r))) >>> 0;
    }
}

describe('lighting tables', () => {
  it('give exactly the per-pixel formula, with and without lamps, at night, dusk and in rain', () => {
    const rnd = stream('light-test');
    const W = 97;
    const H = 61;
    const base = new Uint32Array(W * H);
    for (let i = 0; i < base.length; i++) base[i] = (rnd.next() < 0.1 ? 0 : 0xff000000 | Math.floor(rnd.next() * 0xffffff)) >>> 0;
    const lamps: LightSource[] = [{ x: 30, y: 20, radius: 18 } as LightSource, { x: 80, y: 55, radius: 9 } as LightSource];
    for (const [light, rain, lights] of [
      [{ dark: 0.45, warm: 0 }, 0, []],
      [{ dark: 0.45, warm: 0 }, 0, lamps],
      [{ dark: 0.12, warm: 0.6 }, 0, lamps],
      [{ dark: 0, warm: 0 }, 1, []],
      [{ dark: 0.3, warm: 0.2 }, 0.7, lamps],
    ] as const) {
      const a = base.slice();
      const b = base.slice();
      applyLight(a, W, H, 5, 3, light, rain, lights);
      reference(b, W, H, 5, 3, light, rain, lights);
      expect(Array.from(a)).toEqual(Array.from(b));
    }
  });
});

describe('the split view', () => {
  it('rasterizes only the native-size Blobbi it draws, not the gameplay-size one', () => {
    const live = new LiveWorld(generateTurtleWorld('perf-split', { turtleSeed: 't', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false }), 'blobbi-9', 16, { store: memoryStore() });
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const cam = new ViewCamera('exploration');
    const b = worldBounds(live.world);
    const rest = cam.restScale(cam.mode, 1280, 720, b);
    expect(view.nativeSize(rest, 'exploration')).not.toBe(live.blobbi.size);
    live.blobbiCache.clear();
    for (let i = 0; i < 30; i++) {
      live.update(1 / 60, { up: false, down: false, left: false, right: i % 10 < 5, interact: false, plant: false });
      const v = cam.update(1 / 60, live.cameraTarget(720 / rest), 1280, 720, b, false, 1 / 60);
      view.render(v, rest, live.clock.time, DEFAULT_LIVE_OPTIONS, DEFAULT_VIEW_UI);
    }
    // Only the status card's portrait (one rest pose at the gameplay size), however many poses were drawn.
    expect(live.blobbiCache.size).toBeLessThanOrEqual(1);
  });
});
