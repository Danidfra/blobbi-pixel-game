/**
 * Headless performance measurement of the living world at realistic viewport
 * sizes: simulation step cost, frame render cost and the worst frame.
 *   npx tsx scripts/perf.ts
 */
import { generateWorld } from '../src/world/generate';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { LiveRenderer, Camera, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
for (const [w, h, label] of [[427, 274, '1280x820 @3x'], [640, 410, '1280x820 @2x'], [448, 288, 'full default world'], [640, 448, '640x448 world @2x of 1280px']] as const) {
  const world = generateWorld('perf-world', label.includes('640x448') ? { width: 640, height: 448, islands: 4 } : {});
  const live = new LiveWorld(world, 'abc123');
  const r = new LiveRenderer(live);
  const cam = new Camera();
  // warm up caches
  for (let i = 0; i < 120; i++) { live.update(1 / 60, { ...IDLE_INPUT, right: i % 40 < 20, down: i % 40 >= 20 }); cam.follow(live.blobbi.x, live.blobbi.y, w, h, world.options.width, world.options.height, 1 / 60); r.render(w, h, cam.x, cam.y, live.clock.time, DEFAULT_LIVE_OPTIONS); }
  const N = 600; let sim = 0, ren = 0, worst = 0;
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    live.update(1 / 60, { ...IDLE_INPUT, right: i % 60 < 30, up: i % 60 >= 30, interact: i % 90 === 0 });
    const t1 = performance.now();
    cam.follow(live.blobbi.x, live.blobbi.y, w, h, world.options.width, world.options.height, 1 / 60);
    r.render(w, h, cam.x, cam.y, live.clock.time, DEFAULT_LIVE_OPTIONS);
    const t2 = performance.now();
    sim += t1 - t0; ren += t2 - t1; worst = Math.max(worst, t2 - t0);
  }
  console.log(`${label.padEnd(28)} viewport ${w}x${h}: sim ${(sim / N).toFixed(3)} ms, render ${(ren / N).toFixed(3)} ms, worst frame ${worst.toFixed(2)} ms, drawn ${r.timings.drawn}, particles ${live.particles.particles.length}`);
}
