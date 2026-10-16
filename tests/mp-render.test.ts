/**
 * The other players on screen (multiplayer prototype): a remote Blobbi is drawn where it stands, from its own seed
 * and stage, behind or in front of this player's Blobbi by depth, half of its pixels at half alpha, none at zero,
 * and nothing at all without remotes (the frame is exactly as before).
 */
import { describe, expect, it } from 'vitest';
import { ViewCamera, worldBounds } from '../src/render/view-camera';
import { ViewRenderer, DEFAULT_VIEW_UI, blitAtFaded } from '../src/render/view-renderer';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { memoryStore } from '../src/game/persistence';
import { PixelBuffer } from '../src/core/pixel';
import type { RemoteView } from '../src/game/multiplayer/remote-players';

const W = 640;
const H = 400;
function setup() {
  const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store: memoryStore() });
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const cam = new ViewCamera('exploration');
  const b = worldBounds(live.world);
  const v = cam.update(0, live.cameraTarget(), W, H, b, true);
  const rest = cam.restScale('exploration', W, H, b);
  const ui = { ...DEFAULT_VIEW_UI, hud: false, lighting: false, indicator: false, goals: false, prompt: false };
  const draw = () => view.render(v, rest, live.clock.time, DEFAULT_LIVE_OPTIONS, ui).clone();
  return { live, view, draw };
}
const remote = (live: LiveWorld, dx: number, extra: Partial<RemoteView> = {}): RemoteView => ({ id: 'bob-1', name: 'Bob', seed: 'blobbi-42', stage: 'adult', x: live.blobbi.x + dx, y: live.blobbi.y, view: 'front', facing: 1, moving: false, face: 'happy', alpha: 1, ...extra });
const diff = (a: PixelBuffer, b: PixelBuffer) => {
  let n = 0;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++;
  return n;
};

describe('remote Blobbis on screen', () => {
  it('no remotes: the frame is unchanged', () => {
    const { view, draw } = setup();
    const a = draw();
    view.remotes = [];
    expect(diff(a, draw())).toBe(0);
  });

  it('a remote is drawn beside this Blobbi; at half alpha about half as many pixels; at zero none', () => {
    const { live, view, draw } = setup();
    const bare = draw();
    view.remotes = [remote(live, 40)];
    const full = diff(bare, draw());
    expect(full).toBeGreaterThan(50);
    view.remotes = [remote(live, 40, { alpha: 0.5 })];
    const half = diff(bare, draw());
    expect(half).toBeGreaterThan(full * 0.3);
    expect(half).toBeLessThan(full * 0.7);
    view.remotes = [remote(live, 40, { alpha: 0 })];
    expect(diff(bare, draw())).toBe(0);
  });

  it('a different seed draws a different Blobbi', () => {
    const { live, view, draw } = setup();
    view.remotes = [remote(live, 40, { seed: 'blobbi-1' })];
    const one = draw();
    view.remotes = [remote(live, 40, { seed: 'blobbi-77' })];
    expect(diff(one, draw())).toBeGreaterThan(0);
  });

  it('the dithered fade keeps the sprite inside its box', () => {
    const dst = new PixelBuffer(8, 8);
    const src = new PixelBuffer(4, 4);
    src.data.fill(0xff0000ff);
    blitAtFaded(dst, { buffer: src, anchorX: 2, anchorY: 3 } as never, 4, 4, 1, 0.5);
    let n = 0;
    for (let i = 0; i < dst.data.length; i++) if (dst.data[i] !== 0) n++;
    expect(n).toBe(8);
  });
});
