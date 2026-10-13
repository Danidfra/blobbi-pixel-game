// M11B BROWSER SCREENSHOTS: the real game in Chrome (desktop 1280x720 and phone 844x390): the account page as a
// guest and connected (a MOCKED NIP-07 extension; every wss:// connection is blocked, so no relay is ever contacted
// and nothing can be published), and, as the milestone grows, the language and text-size settings and translated
// screens. Needs `npx vite --port 5211` and Chrome with remote debugging on 9333 (see scripts/perf-browser.mjs).
// Clears the origin's localStorage first. Writes examples/m11b/browser-*.png.
//   node scripts/m11b-browser-shots.mjs [scenario...]
import { mkdirSync, writeFileSync } from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 5211;
const origin = `http://127.0.0.1:${port}`;
// NIP-19's example public key: a mock account, never a real login.
export const MOCK_PUBKEY = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';

export async function open(width, height, mobile, { nostr = false, storage = {} } = {}) {
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
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  // No relay is ever reached from these screenshots: WebSocket is replaced (before any page script) by a stub that
  // never connects and records every frame a page would send (CDP's URL blocking does not cover WebSockets).
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__wsUrls = []; window.__wsSent = []; window.WebSocket = class { constructor(url) { window.__wsUrls.push(String(url)); this.readyState = 3; setTimeout(() => { this.onerror?.(new Event('error')); this.onclose?.(new CloseEvent('close')); for (const l of this.l?.error ?? []) l(new Event('error')); for (const l of this.l?.close ?? []) l(new CloseEvent('close')); }, 10); } addEventListener(t, f) { (this.l ??= {})[t] = [...(this.l[t] ?? []), f]; } removeEventListener() {} send(d) { window.__wsSent.push(String(d)); } close() {} }; window.WebSocket.CONNECTING = 0; window.WebSocket.OPEN = 1; window.WebSocket.CLOSING = 2; window.WebSocket.CLOSED = 3;`,
  });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (nostr)
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__nostrCalls = []; window.nostr = { getPublicKey: async () => (window.__nostrCalls.push('getPublicKey'), '${MOCK_PUBKEY}'), signEvent: async () => { window.__nostrCalls.push('signEvent'); throw new Error('mock: never sign'); } };`,
    });
  await send('Page.navigate', { url: `${origin}/` });
  await sleep(1500);
  await send('Storage.clearDataForOrigin', { origin, storageTypes: 'local_storage' });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  for (const [k, v] of Object.entries(storage)) await evaluate(`localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)})`);
  await send('Page.reload');
  await sleep(3000);
  const key = async (code, k = '') => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k || code, windowsVirtualKeyCode: { Enter: 13, Escape: 27, Tab: 9, ArrowDown: 40, ArrowUp: 38 }[code] ?? 0 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k || code });
    await sleep(150);
  };
  const click = async (x, y) => {
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    await sleep(150);
  };
  const shot = async (name) => {
    await sleep(600);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    mkdirSync('examples/m11b', { recursive: true });
    writeFileSync(`examples/m11b/browser-${name}.png`, Buffer.from(r.data, 'base64'));
  };
  return { send, evaluate, key, click, shot, close: async () => (ws.close(), fetch(`http://localhost:9333/json/close/${target.id}`)) };
}

const VIEWPORTS = [['desktop', 1280, 720, false], ['phone', 844, 390, true]];

const scenarios = {
  /** The ACCOUNT page from the title's SETTINGS: a guest without a signer, then connected with a mocked extension. */
  async account() {
    for (const [vp, W, H, mobile] of VIEWPORTS) {
      const guest = await open(W, H, mobile);
      await guest.key('ArrowDown');
      await guest.key('Enter'); // SETTINGS
      await guest.key('Tab');
      await guest.key('Tab'); // ACCOUNT
      await guest.shot(`${vp}-account-guest-no-signer`);
      await guest.key('Enter'); // CONNECT: no extension here
      await guest.shot(`${vp}-account-no-signer-message`);
      await guest.close();

      const page = await open(W, H, mobile, { nostr: true });
      await page.key('ArrowDown');
      await page.key('Enter');
      await page.key('Tab');
      await page.key('Tab');
      await page.shot(`${vp}-account-disconnected`);
      await page.key('Enter'); // CONNECT (the mock answers; relays are blocked)
      await sleep(7000); // the profile read gives up after 6 s (relays out of reach)
      await page.shot(`${vp}-account-connected-no-profile`);
      await page.key('ArrowDown');
      await page.key('ArrowDown');
      await page.key('Enter'); // ADVANCED DETAILS
      await page.shot(`${vp}-account-advanced`);
      const calls = await page.evaluate('return window.__nostrCalls');
      const record = await page.evaluate("return localStorage.getItem('blobbi-pixel-lab:account')");
      console.log(vp, 'extension calls:', JSON.stringify(calls), 'record:', record);
      console.log(vp, 'sockets opened:', JSON.stringify(await page.evaluate('return window.__wsUrls')), 'frames sent:', JSON.stringify(await page.evaluate('return window.__wsSent')));
      await page.close();

      // A remembered account with a cached profile name (as after an earlier visit).
      const named = await open(W, H, mobile, {
        nostr: true,
        storage: { 'blobbi-pixel-lab:account': JSON.stringify({ version: 1, pubkey: MOCK_PUBKEY, method: 'nip07', connectedAt: Date.now(), profile: { name: 'Ana Clara', at: Date.now() } }) },
      });
      await named.key('ArrowDown');
      await named.key('Enter');
      await named.key('Tab');
      await named.key('Tab');
      await named.shot(`${vp}-account-connected`);
      console.log(vp, 'calls after reload:', JSON.stringify(await named.evaluate('return window.__nostrCalls')));
      await named.close();
    }
  },
};

/** A new island in a language, past the intro, with the story's first chapter done (a home to show). */
async function islandIn(W, H, mobile, locale, extra = {}) {
  const p = await open(W, H, mobile, { storage: { 'blobbi-pixel-lab:locale': locale, ...extra } });
  await p.key('Enter'); // BEGIN
  await sleep(300);
  await p.key('Enter'); // the turtle
  await sleep(300);
  await p.key('Enter'); // CREATE ISLAND
  await sleep(15000);
  await p.key('Escape'); // skip the rest of the intro
  await sleep(2500);
  await p.evaluate(`const l = window.__blobbi.live(); for (const id of ['meet','arrive','gather','axe','wood','materials']) l.objectives.completed[id] = 0; l.inventory.add('blobbi-pixel:material:wood', 6); l.inventory.add('blobbi-pixel:resource:stone', 5); l.inventory.add('blobbi-pixel:resource:stick', 4); l.inventory.add('blobbi-pixel:food:carrot', 3); l.pinQuest?.('improve'); l.save();`);
  await sleep(800);
  return p;
}

Object.assign(scenarios, {
  /** The title in English, Portuguese and Spanish (desktop), the language and text size settings. */
  async menus() {
    for (const locale of ['en', 'pt-BR', 'es']) {
      const p = await open(1280, 720, false, { storage: { 'blobbi-pixel-lab:locale': locale } });
      await p.shot(`desktop-menu-${locale}`);
      if (locale === 'pt-BR') {
        await p.key('ArrowDown');
        await p.key('Enter'); // SETTINGS
        await p.shot('desktop-settings-language-pt-BR');
        await p.key('ArrowDown');
        await p.key('ArrowRight'); // TEXT SIZE: large
        await p.shot('desktop-settings-text-size-large-pt-BR');
        await p.key('ArrowRight'); // small
        await p.shot('desktop-settings-text-size-small-pt-BR');
        await p.key('ArrowRight'); // normal again
      }
      await p.close();
    }
    const phone = await open(844, 390, true, { storage: { 'blobbi-pixel-lab:locale': 'es' } });
    await phone.shot('phone-menu-es');
    await phone.key('Enter'); // EMPEZAR
    await sleep(400);
    await phone.shot('phone-carrier-es');
    await phone.close();
  },
  /** Playing in Portuguese: HUD (desktop and phone), journal, crafting, a dialogue bubble and a notice. */
  async playing() {
    for (const [vp, W, H, mobile] of VIEWPORTS) {
      const p = await islandIn(W, H, mobile, 'pt-BR');
      await p.shot(`${vp}-hud-pt-BR`);
      await p.key('KeyJ');
      await sleep(400);
      await p.shot(`${vp}-journal-pt-BR`);
      await p.key('Escape');
      await p.key('KeyK');
      await sleep(400);
      await p.shot(`${vp}-crafting-pt-BR`);
      await p.key('Escape');
      await p.key('KeyI');
      await sleep(400);
      await p.shot(`${vp}-bag-pt-BR`);
      await p.key('Escape');
      // A dialogue: the Blobbi says something, and a notice comes.
      await p.evaluate(`const l = window.__blobbi.live(); l.feed('blobbi-pixel:food:carrot'); l.notices.push({ heading: 'x', title: 'y', text: 'z', until: l.clock.time + 5 }); l.notices.pop();`);
      await p.evaluate(`const l = window.__blobbi.live(); l.objectives.completed['shelter'] = 0; l.save();`);
      await sleep(900);
      await p.shot(`${vp}-dialogue-pt-BR`);
      await p.close();
    }
    const es = await islandIn(844, 390, true, 'es');
    await es.shot('phone-hud-es');
    await es.key('KeyJ');
    await sleep(400);
    await es.shot('phone-journal-es');
    await es.close();
  },
  /** Large text on a desktop and a phone (the HUD grows; menus where the window has room). */
  async large() {
    for (const [vp, W, H, mobile] of [['desktop-wide', 1920, 1080, false], ...VIEWPORTS]) {
      const p = await islandIn(W, H, mobile, 'pt-BR', { 'blobbi-pixel-lab:settings': JSON.stringify({ textSize: 'large' }) });
      await p.shot(`${vp}-hud-large-pt-BR`);
      await p.key('KeyJ');
      await sleep(400);
      await p.shot(`${vp}-journal-large-pt-BR`);
      await p.close();
    }
  },
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const wanted = process.argv.slice(2);
  for (const name of wanted.length ? wanted : Object.keys(scenarios)) {
    console.log('scenario', name);
    await scenarios[name]();
  }
}
