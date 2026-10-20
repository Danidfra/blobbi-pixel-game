// WORLD TRAVEL MENU BROWSER CHECK: the departure to another Blobbi world, end to end through the real page
// (`main.ts`), fully offline. A guest's new island; Y opens the menu (the cards with the other apps' icons, decoded
// by the page itself); VISIT on Blobbi Island plays the teleport departure, saves the island, and the page goes to the
// Island's address, which this run points at a local stand-in (`VITE_BLOBBI_WORLD_URL_ISLAND`; Home's too, so no
// press can reach a real site), with no move published (a guest's Blobbi stays). Nothing reaches the network: no account, no
// relay, and every destination is this machine.
//
// Starts its own dev server (5245) and the MUTED lab browser (scripts/lab-browser.mjs, its own scratch profile), and
// stops both. Screenshots go to $OUT (default: a scratch directory under the system temp dir).
//   npx tsx scripts/travel-menu-browser.ts
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5245;
const DEST_PORT = 5191;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DEST = `http://127.0.0.1:${DEST_PORT}/`;
const OUT = process.env.OUT ?? mkdtempSync(join(tmpdir(), 'blobbi-travel-menu-'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: string[] = [];
const check = (ok: boolean, what: string) => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${what}`;
  results.push(line);
  console.log(line);
};

// The stand-in destination: a page that shows what address it was opened at.
const arrivals: string[] = [];
const dest = createServer((req, res) => {
  arrivals.push(req.url ?? '');
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><title>Stand-in Island</title><p id="here">stand-in</p><script>document.title = "stand-in " + location.href;</script>');
});
await new Promise<void>((r) => dest.listen(DEST_PORT, '127.0.0.1', r));

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { env: { ...process.env, VITE_BLOBBI_WORLD_URL_ISLAND: DEST, VITE_BLOBBI_WORLD_URL_HOME: `http://127.0.0.1:${DEST_PORT}/home` }, stdio: 'ignore' });
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(ORIGIN)).ok) break;
  } catch {
    /* not up yet */
  }
  await sleep(200);
}
const profile = mkdtempSync(join(tmpdir(), 'blobbi-lab-profile-'));
execFileSync('node', ['scripts/lab-browser.mjs', 'start', profile], { stdio: 'inherit' });

const muted = `try { localStorage.setItem('blobbi-pixel-lab:audio', JSON.stringify({ master: 0, music: 0, sfx: 0, ambient: 0, muted: true, musicOn: false, reduced: false })); localStorage.setItem('blobbi-pixel-lab:locale', 'en'); } catch {}`;
// No relay is ever reached: a WebSocket that never opens (the guest flow asks for none anyway).
const noNet = `window.WebSocket = class { constructor() { setTimeout(() => this.onerror && this.onerror(new Event('error')), 10); } send() {} close() {} addEventListener() {} removeEventListener() {} };`;

type Reply = { result?: { result?: { value?: unknown }; data?: string } };
const target = (await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json()) as { id: string; webSocketDebuggerUrl: string };
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map<number, (v: Reply) => void>();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id && pending.has(m.id)) (pending.get(m.id)!(m), pending.delete(m.id));
});
const send = (method: string, params: object = {}) => new Promise<Reply>((r) => (pending.set(++id, r), ws.send(JSON.stringify({ id, method, params }))));
const evaluate = async (body: string): Promise<any> => (await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shoot = async (name: string) => {
  await sleep(300);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result!.data!, 'base64'));
};
const waitFor = async (expr: string, ms = 15000) => {
  for (let i = 0; i < ms / 100; i++) {
    if (await evaluate(`try { return !!(${expr}); } catch { return false; }`)) return true;
    await sleep(100);
  }
  return false;
};

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: muted });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: noNet });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${ORIGIN}/` });
  check(await waitFor('window.__blobbi && window.__blobbi.title()'), 'the page is up (dev aid present)');
  await send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'indexeddb,local_storage' });
  await send('Page.navigate', { url: `${ORIGIN}/` });
  await waitFor('window.__blobbi && window.__blobbi.title()');
  await sleep(800);

  // ── A guest's new island ──
  await evaluate("const t = window.__blobbi.title(); t.newAdventure(); t.chooseCarrier(0); t.key('Enter');");
  await sleep(300);
  if (await evaluate("return window.__blobbi.title().page === 'name';")) await evaluate("window.__blobbi.title().key('Enter');");
  await sleep(300);
  if (await evaluate("return window.__blobbi.title().page === 'companion';")) await evaluate("window.__blobbi.title().key('Enter');");
  await waitFor('!!window.__blobbi.intro() || !window.__blobbi.title().active', 15000);
  for (let i = 0; i < 60 && (await evaluate('return !!window.__blobbi.intro();')); i++) {
    await evaluate('window.__blobbi.intro() && window.__blobbi.intro().requestSkip && window.__blobbi.intro().requestSkip();');
    await sleep(1000);
  }
  check(await waitFor('!window.__blobbi.title().active && !window.__blobbi.intro() && window.__blobbi.live()', 20000), 'setup: a guest plays on a new island');
  await sleep(1500);
  // The new Blobbi asks for its name first: the suggested one is taken
  for (let i = 0; i < 3 && (await evaluate("const u = window.__blobbi.ui(); return u.screen && u.screen.id === 'naming';")); i++) {
    await evaluate("window.__blobbi.ui().handleKey('Enter');");
    await sleep(400);
  }
  await evaluate('window.__blobbi.ui().close();');
  const island = await evaluate('return window.__blobbi.live().identity;');

  // ── Y opens World Travel; the cards carry the other apps' icons ──
  await evaluate("document.getElementById('view').dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyY', key: 'y', bubbles: true }));");
  await sleep(800); // the icons decode
  const open = await evaluate("const ui = window.__blobbi.ui(); return { capturing: ui.capturing, screen: ui.screen && ui.screen.id };");
  check(open.capturing && open.screen === 'travel', `Y opens the World Travel menu (${JSON.stringify(open)})`);
  await shoot('1-menu');
  const hits = await evaluate("return window.__blobbi.ui().hits.filter((h) => h.tip === 'visit').length;");
  check(hits === 2, `two world cards can be pressed (${hits})`);
  // The icons: the page decoded both images (a second render shows them, not the emblems)
  const icons = await evaluate(`const imgs = await Promise.all(['/icons/worlds/blobbi-home.png', '/icons/worlds/blobbi-island.png'].map((src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok([i.naturalWidth, i.naturalHeight]); i.onerror = () => ok(null); i.src = src; }))); return imgs;`);
  check(JSON.stringify(icons) === '[[192,192],[192,192]]', `both world icons load on this origin at 192 px (${JSON.stringify(icons)})`);

  // ── VISIT Blobbi Island: the departure plays, the island is saved, the page goes (nothing signed for a guest) ──
  await evaluate("const ui = window.__blobbi.ui(); ui.handleKey('ArrowRight'); ui.handleKey('Enter');");
  await sleep(100);
  const leaving = await evaluate("const ui = window.__blobbi.ui(); const l = window.__blobbi.live(); return { capturing: ui.capturing, presence: l.getPresenceState(), saved: Object.keys(localStorage).some((k) => k.startsWith('blobbi-pixel-lab:save:')) };");
  check(!leaving.capturing && leaving.presence === 'departing' && leaving.saved, `VISIT closes the menu, saves the island and starts the teleport departure (${JSON.stringify(leaving)})`);
  await sleep(1200);
  await shoot('2-departing');
  // A second press while leaving: refused (the menu says so), nothing else happens
  await evaluate("const ui = window.__blobbi.ui(); ui.open('travel'); ui.handleKey('Enter');");
  const busy = await evaluate("const ui = window.__blobbi.ui(); return { message: ui.message && ui.message.text, capturing: ui.capturing };");
  check(/under way/.test(busy.message ?? ''), `a second VISIT while leaving is refused (${JSON.stringify(busy)})`);
  await evaluate('window.__blobbi.ui().close();');
  // The page goes once the Blobbi is gone
  let href = '';
  for (let i = 0; i < 120; i++) {
    href = String((await evaluate('return location.href;')) ?? '');
    if (href.startsWith(DEST)) break;
    await sleep(100);
  }
  check(href === DEST, `the page went to the Island's address, with no fragment for a guest (${href})`);
  check(arrivals.length >= 1 && !arrivals.some((a) => a.includes('blobbi-travel')), `the stand-in was asked for its page; nothing rode in the address (${JSON.stringify(arrivals)})`);
  await shoot('3-arrived');

  // ── Back in Pixel: the island is there, the Blobbi present (a departure is never saved) ──
  await send('Page.navigate', { url: `${ORIGIN}/` });
  await waitFor('window.__blobbi && window.__blobbi.title()');
  await sleep(1500);
  const back = await evaluate("const t = window.__blobbi.title(); return { title: t.active, page: t.page, islands: t.actions ? null : null };");
  await evaluate("const t = window.__blobbi.title(); if (t.active) t.key('Enter');");
  await waitFor('!window.__blobbi.title().active && window.__blobbi.live()', 15000);
  await waitFor("window.__blobbi.live().getPresenceState() === 'present'", 10000);
  const again = await evaluate('const l = window.__blobbi.live(); return l ? { identity: l.identity, presence: l.getPresenceState() } : null;');
  check(!!again && again.identity === island && again.presence === 'present', `back in Pixel the same island loads and the Blobbi is present (${JSON.stringify(back)} → ${JSON.stringify(again)})`);
  await shoot('4-back');
} finally {
  await fetch(`http://127.0.0.1:9333/json/close/${target.id}`).catch(() => {});
  ws.close();
  execFileSync('node', ['scripts/lab-browser.mjs', 'stop'], { stdio: 'inherit' });
  vite.kill();
  dest.close();
}
console.log(`\nscreenshots: ${OUT}\n${results.join('\n')}`);
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
