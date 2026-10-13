// M10 PHASE C BROWSER SCREENSHOTS: the real game in Chrome, desktop and phone: the new player's title (BEGIN), the
// Carrier choice, the returning player's title (CONTINUE), the islands page, the goal box with "Help your island grow",
// and a pinned side quest on the HUD at every camera zoom. Needs `npx vite --port 5211` and Chrome with remote
// debugging on 9333 (see scripts/perf-browser.mjs). Clears the origin's localStorage first. Writes
// examples/m10c/browser-*.png.
//   node scripts/m10c-browser-shots.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 5211;

async function open(url, width, height, mobile) {
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
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
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
    await sleep(120);
  };
  return { send, evaluate, key, close: () => ws.close(), targetId: target.id };
}

mkdirSync('examples/m10c', { recursive: true });
for (const [vp, W, H, mobile] of [['desktop', 1280, 720, false], ['phone', 844, 390, true]]) {
  const page = await open(`http://127.0.0.1:${port}/`, W, H, mobile);
  await page.send('Storage.clearDataForOrigin', { origin: `http://127.0.0.1:${port}`, storageTypes: 'local_storage' });
  await page.send('Page.reload');
  await sleep(3500);
  const shot = async (name) => {
    await sleep(700);
    const r = await page.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`examples/m10c/browser-${vp}-${name}.png`, Buffer.from(r.data, 'base64'));
  };
  // A new player: BEGIN and SETTINGS.
  await shot('menu-new');
  await page.key('Enter'); // BEGIN
  await sleep(400);
  await shot('carrier');
  await page.key('Enter'); // the turtle
  await sleep(300);
  await page.key('Enter'); // CREATE ISLAND
  await sleep(16000);
  await page.key('Escape'); // skip the rest of the intro
  await sleep(2500);
  // The story so far, as a save would hold it: the growth quest is the goal.
  await page.evaluate(`const l = window.__blobbi.live(); for (const id of ['meet','arrive','gather','axe','wood','materials','shelter','enter-home','first-furniture','plot','plant','water','harvest','feed','home','cook','mystery']) l.objectives.completed[id] = 0; l.save();`);
  await sleep(1500);
  await page.evaluate(`window.__blobbi.camera().setMode('exploration', true)`);
  await shot('growth-goal');
  // A pinned side quest under the main goal, at every zoom.
  await page.evaluate(`const l = window.__blobbi.live(); l.pinQuest('improve'); l.save();`);
  for (const mode of ['overview', 'exploration', 'closeup', 'upclose']) {
    await page.evaluate(`window.__blobbi.camera().setMode('${mode}', true)`);
    await shot(`pinned-${mode}`);
  }
  // A returning player: CONTINUE and SETTINGS; then the islands page.
  await page.send('Page.reload');
  await sleep(4000);
  await shot('menu-returning');
  await page.key('ArrowDown');
  await page.key('ArrowDown');
  await page.key('Enter'); // ISLANDS
  await sleep(400);
  await shot('islands');
  page.close();
  await fetch(`http://localhost:9333/json/close/${page.targetId}`).catch(() => {});
}
