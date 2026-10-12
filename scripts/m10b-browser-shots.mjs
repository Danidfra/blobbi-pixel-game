// M10 PHASE B BROWSER SCREENSHOTS: the real game in Chrome, desktop and phone: the original HUD at every camera zoom,
// the canoe (at the shore, aboard, paddling, fishing from it) and the journal's fish log. Needs `npx vite --port 5211`
// and Chrome with remote debugging on 9333 (see scripts/perf-browser.mjs). Writes examples/m10b/browser-*.png.
//   node scripts/m10b-browser-shots.mjs
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


mkdirSync('examples/m10b', { recursive: true });
for (const [vp, W, H] of [['desktop', 1280, 720], ['phone', 844, 390]]) {
  const page = await open(`http://127.0.0.1:${port}/`, W, H);
  await page.send('Storage.clearDataForOrigin', { origin: `http://127.0.0.1:${port}`, storageTypes: 'local_storage' });
  await page.send('Page.reload');
  await sleep(3000);
  const shot = async (name) => {
    await sleep(600);
    const r = await page.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`examples/m10b/browser-${vp}-${name}.png`, Buffer.from(r.data, 'base64'));
  };
  await page.key('Enter');
  await sleep(300);
  await page.key('Enter');
  await sleep(300);
  await page.key('Enter');
  await sleep(16000);
  await page.key('Escape');
  await sleep(1500);
  // Stage 2 (the land reaches the sea), reloaded as a save would be.
  await page.evaluate(`const l = window.__blobbi.live(); l.growth = { stage: 2, version: 3, history: [], regions: [] }; l.save();`);
  await page.send('Page.reload');
  await sleep(4000);
  await page.key('Enter');
  await sleep(3000);
  // The original HUD at every zoom.
  for (const mode of ['overview', 'exploration', 'closeup', 'upclose']) {
    await page.evaluate(`window.__blobbi.camera().setMode('${mode}', true)`);
    await shot(`hud-${mode}`);
  }
  // The canoe: to the shore nearest the hub, launch, aboard, out, fishing.
  await page.evaluate(`window.__blobbi.camera().setMode('closeup', true);
    const l = window.__blobbi.live(); l.brain.enabled = false; l.inventory.add('blobbi-pixel:vehicle:canoe', 1); l.nearbyMarine = () => null;
    const hub = l.world.hubs[0]; const { width, height } = l.world.terrain; let best = null;
    for (let y = 6; y < height - 6; y += 3) for (let x = 6; x < width - 6; x += 3) {
      if (!l.collision.canStand(x, y, 3, 2)) continue;
      for (const d of ['down', 'right', 'left', 'up']) { l.blobbi.x = x; l.blobbi.y = y; l.blobbi.animator.state.direction = d; if (l.launchSpot()) { const dist = Math.hypot(x - hub.x, y - hub.y); if (!best || dist < best.dist) best = { x, y, d, dist }; } }
    }
    l.blobbi.x = best.x; l.blobbi.y = best.y; l.blobbi.animator.state.direction = best.d;
    l.resources = l.resources.filter((n) => Math.hypot(n.x - best.x, n.y - best.y) > 20);
    for (const d of l.discoveries) if (Math.hypot(d.x - best.x, d.y - best.y) < 30) l.found.add(d.id);`);
  await shot('canoe-1-shore');
  await page.key('KeyE', 'e');
  await shot('canoe-2-launched');
  await page.key('KeyE', 'e');
  await sleep(700);
  await shot('canoe-3-aboard');
  await page.evaluate(`const l = window.__blobbi.live(); const b = l.boat; b.vy = -30;`);
  await page.evaluate(`const v = document.querySelector('#view'); v.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp', bubbles: true }));`);
  await sleep(2500);
  await page.evaluate(`const v = document.querySelector('#view'); v.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp', key: 'ArrowUp', bubbles: true })); window.__blobbi.camera().setMode('exploration');`);
  await shot('canoe-4-paddling');
  await page.evaluate(`window.__blobbi.camera().setMode('closeup'); const l = window.__blobbi.live(); l.inventory.add('blobbi-pixel:tool:fishing-rod', 1); l.equip('blobbi-pixel:tool:fishing-rod');
    for (const d of ['up', 'right', 'left', 'down']) { l.boat.heading = d; l.blobbi.animator.state.direction = d; if (l.fishTarget()) break; }
    l.fish(); if (l.fishing) l.fishing.biteAt = 1e9;`);
  await sleep(1500);
  await shot('canoe-5-fishing');
  // The journal's fish log.
  await page.evaluate(`const l = window.__blobbi.live(); l.fishing = null; l.caught.add('blobbi-pixel:food:mackerel'); l.caught.add('blobbi-pixel:food:minnow');`);
  await page.key('KeyJ', 'j');
  await sleep(400);
  await page.key('Tab', 'Tab');
  await page.key('Tab', 'Tab');
  await page.key('Tab', 'Tab');
  await shot('journal-fish-log');
  page.close();
  await fetch(`http://localhost:9333/json/close/${page.targetId}`).catch(() => {});
}
