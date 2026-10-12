// PERFORMANCE IN THE BROWSER (M10): real frame intervals (FPS and percentiles), long tasks, the JS heap and the
// game's own per-phase timings, in Chrome, for the same scenes as scripts/perf-scenes.ts.
//
// Needs: `npx vite --port 5211` and a Chrome started with a FRESH profile and remote debugging, for example
//   "Google Chrome" --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/blobbi-perf --window-size=1280,800
// Then: node scripts/perf-browser.mjs <label> [--throttle 4] [--seconds 6] [--port 5211] [--no-upclose] [--no-canoe]
// Results: a table and docs/testing/perf/browser-<label>.json. CPU throttling is a PROXY for a slower machine,
// not a measurement of one.
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) ?? 'run';
const throttle = Number(args[args.indexOf('--throttle') + 1]) || 1;
const seconds = Number(args[args.indexOf('--seconds') + 1]) || 6;
const port = Number(args[args.indexOf('--port') + 1]) || 5211;
// --no-upclose: for code before M10 (no fourth camera mode).
const modes = args.includes('--no-upclose') ? ['exploration', 'overview', 'closeup'] : ['exploration', 'overview', 'closeup', 'upclose'];
// --no-canoe: for code before M10 phase B (no canoe).
const canoe = !args.includes('--no-canoe') && !args.includes('--no-upclose');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(url, width, height) {
  const target = await (await fetch('http://localhost:9333/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Performance.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(3000);
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const key = async (code, k = '') => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k || code, windowsVirtualKeyCode: { Enter: 13, Escape: 27 }[code] ?? 0 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k || code });
    await sleep(80);
  };
  return { send, evaluate, key, close: () => ws.close(), targetId: target.id };
}

/** Measure the page for `seconds`: frame intervals, long tasks, heap, and the game's own timings. */
const MEASURE = (secs) => `
  const intervals = []; let last = 0; let done = false; const longs = [];
  const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push(e.duration); });
  try { obs.observe({ type: 'longtask', buffered: false }); } catch {}
  const heap0 = performance.memory?.usedJSHeapSize ?? 0;
  await new Promise((resolve) => { const step = (t) => { if (last) intervals.push(t - last); last = t; if (!done) requestAnimationFrame(step); }; requestAnimationFrame(step); setTimeout(() => { done = true; resolve(); }, ${secs * 1000}); });
  obs.disconnect();
  const heap1 = performance.memory?.usedJSHeapSize ?? 0;
  const s = [...intervals].sort((a, b) => a - b);
  const p = (q) => s[Math.min(s.length - 1, Math.floor((s.length - 1) * q))];
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const v = window.__blobbi.view()?.timings;
  return { frames: intervals.length, fps: 1000 / mean, p50: p(0.5), p95: p(0.95), p99: p(0.99), max: s.at(-1), longTasks: longs.length, longTaskMs: longs.reduce((a, b) => a + b, 0), heapStartMB: heap0 / 1048576, heapEndMB: heap1 / 1048576, viewMs: v ? v.total : null };`;

const results = [];
for (const [vp, W, H] of [['1280x720', 1280, 720], ['844x390', 844, 390]]) {
  const page = await open(`http://127.0.0.1:${port}/`, W, H);
  // Every run starts from no saves (a canoe scene leaves the Blobbi afloat in the save; the next run must not
  // continue that island).
  await page.send('Storage.clearDataForOrigin', { origin: `http://127.0.0.1:${port}`, storageTypes: 'local_storage' });
  await page.send('Page.reload');
  await sleep(3000);
  if (throttle > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  // A new turtle island (first-time flow), intro skipped.
  await page.key('Enter');
  await sleep(300);
  await page.key('Enter');
  await sleep(300);
  await page.key('Enter');
  await sleep(4000 * throttle);
  await page.key('Escape');
  await sleep(1500);
  const scenes = [
    ['turtle-stage0-exploration', `window.__blobbi.camera().setMode('exploration')`],
    ['turtle-stage0-overview', `window.__blobbi.camera().setMode('overview')`],
    ['turtle-stage0-closeup', `window.__blobbi.camera().setMode('closeup')`],
    ...(modes.includes('upclose') ? [['turtle-stage0-upclose', `window.__blobbi.camera().setMode('upclose')`]] : []),
    // Rain: move the island's clock to its first rainy moment.
    ['rain-exploration', `window.__blobbi.camera().setMode('exploration'); const l = window.__blobbi.live(); for (let k = 0; k < 800 && l.rainNow() < 0.6; k++) l.timeOffset += 30;`],
    ['fishing-exploration', `const l = window.__blobbi.live(); l.inventory.add('blobbi-pixel:tool:fishing-rod', 1); l.equip('blobbi-pixel:tool:fishing-rod'); l.fishing = { start: l.clock.time, biteAt: 1e9, x: Math.round(l.blobbi.x), y: Math.round(l.blobbi.y + 30), water: 'sea' };`],
  ];
  for (const [name, setup] of scenes) {
    await page.evaluate(setup);
    await sleep(800);
    const r = await page.evaluate(MEASURE(seconds));
    results.push({ scene: name, viewport: vp, throttle, ...r });
    console.log(`${name.padEnd(28)} ${vp.padEnd(9)} x${throttle}  fps ${r.fps.toFixed(1).padStart(5)}  p50 ${r.p50.toFixed(1)}  p95 ${r.p95.toFixed(1)}  p99 ${r.p99.toFixed(1)}  max ${r.max.toFixed(0)}  long tasks ${r.longTasks} (${r.longTaskMs.toFixed(0)} ms)  heap ${r.heapStartMB.toFixed(1)}→${r.heapEndMB.toFixed(1)} MB  view ${r.viewMs?.toFixed(2)} ms`);
  }
  // Stage 4 (set and reloaded as a save would be), then whale-like overview cost on the same island.
  await page.evaluate(`const l = window.__blobbi.live(); l.fishing = null; l.growth = { stage: 4, version: 3, history: [], regions: [] }; l.save();`);
  await page.send('Page.reload');
  await sleep(4000 * throttle);
  await page.key('Enter');
  await sleep(3000);
  for (const mode of modes) {
    await page.evaluate(`window.__blobbi.camera().setMode('${mode}')`);
    await sleep(800);
    const r = await page.evaluate(MEASURE(seconds));
    results.push({ scene: `turtle-stage4-${mode}`, viewport: vp, throttle, ...r });
    console.log(`${`turtle-stage4-${mode}`.padEnd(28)} ${vp.padEnd(9)} x${throttle}  fps ${r.fps.toFixed(1).padStart(5)}  p50 ${r.p50.toFixed(1)}  p95 ${r.p95.toFixed(1)}  p99 ${r.p99.toFixed(1)}  max ${r.max.toFixed(0)}  long tasks ${r.longTasks} (${r.longTaskMs.toFixed(0)} ms)  heap ${r.heapStartMB.toFixed(1)}→${r.heapEndMB.toFixed(1)} MB  view ${r.viewMs?.toFixed(2)} ms`);
  }
  // M10 phase B (current code only): paddling the canoe round the Carrier, exploration.
  if (canoe) {
    await page.evaluate(`window.__blobbi.camera().setMode('exploration');
      const l = window.__blobbi.live(); l.inventory.add('blobbi-pixel:vehicle:canoe', 1); l.nearbyMarine = () => null;
      const { width, height } = l.world.terrain; let ok = false;
      for (let y = 6; y < height - 6 && !ok; y += 3) for (let x = 6; x < width - 6 && !ok; x += 3) {
        if (!l.collision.canStand(x, y, 3, 2)) continue;
        for (const d of ['down', 'right', 'left', 'up']) { l.blobbi.x = x; l.blobbi.y = y; l.blobbi.animator.state.direction = d; if (l.launchSpot()) { ok = true; break; } }
      }
      l.resources = []; l.launchCanoe(); l.boardCanoe();`);
    await sleep(1200);
    // Paddle with the arrow keys (held by the page's input) via a dispatched keydown on the view.
    await page.evaluate(`const v = document.querySelector('#view'); v.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp', bubbles: true }));`);
    await sleep(600);
    const r = await page.evaluate(MEASURE(seconds));
    await page.evaluate(`const v = document.querySelector('#view'); v.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp', key: 'ArrowUp', bubbles: true }));`);
    results.push({ scene: 'canoe-exploration', viewport: vp, throttle, ...r });
    console.log(`${'canoe-exploration'.padEnd(28)} ${vp.padEnd(9)} x${throttle}  fps ${r.fps.toFixed(1).padStart(5)}  p95 ${r.p95.toFixed(1)}  long tasks ${r.longTasks}  view ${r.viewMs?.toFixed(2)} ms`);
  }
  page.close();
  await fetch(`http://localhost:9333/json/close/${page.targetId}`).catch(() => {});
}
mkdirSync('docs/testing/perf', { recursive: true });
writeFileSync(`docs/testing/perf/browser-${label}${throttle > 1 ? `-x${throttle}` : ''}.json`, JSON.stringify({ label, throttle, seconds, date: new Date().toISOString().slice(0, 10), results }, null, 1));
