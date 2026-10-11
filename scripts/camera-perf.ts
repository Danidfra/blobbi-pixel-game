/**
 * M3.3 rendering cost per camera mode, headless: the same walking session (moving, turning, swinging the pickaxe)
 * rendered through the multi-scale view at common screen sizes. Reports the mean and worst frame, the breakdown
 * (world render, magnify, native Blobbi, UI), world pixels rendered, and the native rasters built while warm.
 *   npx tsx scripts/camera-perf.ts
 */
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT, type LiveInput } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewCamera, CAMERA_CYCLE, worldBounds } from '../src/render/view-camera';
import { ViewRenderer } from '../src/render/view-renderer';
import { ITEMS } from '../src/game/items';

const world = generateTurtleWorld('turtle-0');
const input = (i: number): LiveInput => {
  const phase = Math.floor(i / 45) % 4;
  return { ...IDLE_INPUT, right: phase === 0, down: phase === 1, left: phase === 2, up: phase === 3, interact: i % 50 === 0 };
};
const rows: string[] = [];
for (const [W, H] of [[960, 540], [1280, 720], [1920, 1080]] as const) {
  for (const mode of CAMERA_CYCLE) {
    const live = new LiveWorld(world, 'blobbi-9', 16);
    live.brain.enabled = false;
    live.inventory.add(ITEMS.pickaxe.id, 1);
    live.equip(ITEMS.pickaxe.id);
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const camera = new ViewCamera(mode);
    const bounds = worldBounds(world);
    const rest = camera.restScale(mode, W, H, bounds);
    const frame = (i: number) => {
      live.update(1 / 60, input(i));
      const v = camera.update(1 / 60, { x: live.blobbi.x, y: live.blobbi.y, size: live.blobbi.size }, W, H, bounds, i === 0);
      return view.render(v, rest, live.clock.time, DEFAULT_LIVE_OPTIONS);
    };
    // Cold: the first 180 frames, while native poses are rasterized for the first time.
    let coldWorst = 0;
    let cold = 0;
    for (let i = 0; i < 180; i++) {
      const t0 = performance.now();
      frame(i);
      const dt = performance.now() - t0;
      cold += dt;
      coldWorst = Math.max(coldWorst, dt);
    }
    const native = view.native(view.nativeSize(rest, mode));
    const builtCold = native?.built ?? live.blobbiCache.size;
    // Warm: the same moves again.
    const N = 600;
    const sum = { total: 0, world: 0, compose: 0, blobbi: 0, ui: 0 };
    let worst = 0;
    for (let i = 0; i < N; i++) {
      frame(180 + i);
      const t = view.timings;
      sum.total += t.total;
      sum.world += t.world;
      sum.compose += t.compose;
      sum.blobbi += t.blobbi;
      sum.ui += t.ui;
      worst = Math.max(worst, t.total);
    }
    const f = (v: number) => (v / N).toFixed(2);
    rows.push(
      `| ${W}×${H} | ${mode} | ${rest}× | ${view.lastBlobbi!.size} px | ${view.timings.worldPixels} | ${f(sum.total)} | ${worst.toFixed(2)} | ${f(sum.world)} | ${f(sum.compose)} | ${f(sum.blobbi)} | ${f(sum.ui)} | ${(cold / 180).toFixed(2)} / ${coldWorst.toFixed(1)} | ${builtCold} |`,
    );
  }
}
console.log('| Screen | Mode | Scale | Blobbi | World px | Mean ms | Worst ms | World | Magnify | Blobbi | UI | Cold mean / worst | Poses rasterized |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(r);
