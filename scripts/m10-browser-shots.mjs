// M10 BROWSER SCREENSHOTS: the real game in Chrome (desktop and phone sizes) for the visual validation of fishing,
// the open sea, the up-close camera and marine life. Needs `npx vite --port 5211` and Chrome with remote debugging on
// 9333 and a fresh profile (see scripts/perf-browser.mjs). Writes examples/m10/browser-*.png.
//   node scripts/m10-browser-shots.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 5211;

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


mkdirSync('examples/m10', { recursive: true });
for (const [vp, W, H] of [['desktop', 1280, 720], ['phone', 844, 390]]) {
  const page = await open(`http://127.0.0.1:${port}/`, W, H);
  const shot = async (name) => {
    await sleep(500);
    const r = await page.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`examples/m10/browser-${vp}-${name}.png`, Buffer.from(r.data, 'base64'));
  };
  // A new turtle island (first-time flow), intro skipped; grown to stage 2 (the land reaches the water), reloaded.
  await page.key('Enter');
  await sleep(300);
  await page.key('Enter');
  await sleep(300);
  await page.key('Enter');
  await sleep(4000);
  await page.key('Escape');
  await sleep(1500);
  await page.evaluate(`const l = window.__blobbi.live(); l.growth = { stage: 2, version: 3, history: [], regions: [] }; l.save();`);
  await page.send('Page.reload');
  await sleep(4000);
  await page.key('Enter');
  await sleep(3000);
  // The open sea, zoomed out.
  await page.evaluate(`window.__blobbi.camera().setMode('overview')`);
  await shot('overview-sea');
  // Fishing, facing each way, up close and in close-up.
  const fishSetup = (dir) => `
    const l = window.__blobbi.live();
    l.inventory.add('blobbi-pixel:tool:fishing-rod', 1); l.equip('blobbi-pixel:tool:fishing-rod');
    l.brain.enabled = false; l.fishing = null;
    const { width, height } = l.world.terrain;
    let done = false;
    for (let y = 10; y < height - 10 && !done; y += 3) for (let x = 10; x < width - 10 && !done; x += 3) {
      if (!l.collision.canStand(x, y, l.blobbi.footRx, l.blobbi.footRy)) continue;
      l.blobbi.x = x; l.blobbi.y = y; l.blobbi.animator.state.direction = '${dir}';
      const t = l.fishTarget();
      if (t && t.water === 'sea' && Math.hypot(t.x - x, t.y - y) >= 18) done = l.fish();
    }
    return done;`;
  for (const dir of ['down', 'up', 'left', 'right']) {
    await page.evaluate(`window.__blobbi.camera().setMode('closeup', true)`);
    const ok = await page.evaluate(fishSetup(dir));
    if (!ok) continue;
    await sleep(1600);
    await shot(`fishing-${dir}-closeup`);
  }
  await page.evaluate(`window.__blobbi.camera().setMode('upclose', true)`);
  await sleep(800);
  await shot('fishing-right-upclose');
  // Up close, walking about.
  await page.evaluate(`const l = window.__blobbi.live(); l.fishing = null; l.unequip?.(); const h = l.world.hubs[0]; l.blobbi.x = h.x; l.blobbi.y = h.y;`);
  await sleep(1200);
  await shot('upclose');
  // The seal: the next time it surfaces, the Blobbi at the shore beside it.
  const seal = await page.evaluate(`
    const l = window.__blobbi.live();
    for (let t = l.worldTime; t < l.worldTime + 6000; t += 0.5) {
      const s = l.marine.at(t).find((x) => x.kind === 'seal' && x.age > 3 && x.span - x.age > 10);
      if (s) { l.timeOffset += t - l.worldTime; l.blobbi.x = s.shore.x; l.blobbi.y = s.shore.y; l.blobbi.animator.state.direction = s.y > s.shore.y ? 'down' : s.x > s.shore.x ? 'right' : s.x < s.shore.x ? 'left' : 'up'; return true; }
    }
    return false;`);
  if (seal) {
    await page.evaluate(`window.__blobbi.camera().setMode('closeup', true)`);
    await sleep(900);
    await shot('seal-closeup');
  }
  page.close();
  await fetch(`http://localhost:9333/json/close/${page.targetId}`).catch(() => {});
}
