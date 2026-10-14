// M11D.7 BROWSER CHECK: a restored identity stays the player's (the Pudding reproduction), fully offline.
//
// Needs the dev server on 5243 (`npx vite --port 5243 --strictPort`) and the MUTED lab browser on 9333 with its own
// scratch profile (`node scripts/lab-browser.mjs start <scratchDir>`). A DISPOSABLE key and its Pudding (the kit's
// canonical V3 Baby event, signed here) are made for each run; the key is passed to the page as the player would
// paste it and is never printed. Every WebSocket is a stub in the page: it answers a REQ for kind 31124 with that one
// event (or never connects, "relays down") and records every frame, so nothing reaches a relay and any EVENT a page
// tried to send would show. Screenshots go to examples/m11d7-restore/.   npx tsx scripts/m11d7-restore-browser.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nsecEncode } from 'nostr-tools/nip19';
import { babyStateTemplate, canonicalD } from '../src/nostr/canonical-events';

const PORT = 5243;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = 'examples/m11d7-restore';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: string[] = [];
const check = (ok: boolean, what: string) => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${what}`;
  results.push(line);
  console.log(line);
};

const sk = generateSecretKey();
const owner = getPublicKey(sk);
const PET = 'c0ffee1234';
const d = canonicalD(owner, PET);
const event = finalizeEvent(babyStateTemplate({ owner, petId: PET, name: 'Pudding', bornAt: Math.floor(Date.now() / 1000) - 3600 }, Math.floor(Date.now() / 1000) - 600), sk);
const nsec = nsecEncode(sk);

const relayStub = `window.__wsUrls = []; window.__wsSent = []; const EVENTS = ${JSON.stringify([event])}; const DOWN = (() => { try { return localStorage.getItem('m11d7:relays') === 'down'; } catch { return false; } })();
window.WebSocket = class { constructor(url) { window.__wsUrls.push(String(url)); this.url = String(url); this.readyState = 0; this.l = {}; setTimeout(() => { if (DOWN) { this.readyState = 3; this.emit('error', new Event('error')); this.emit('close', new CloseEvent('close')); } else { this.readyState = 1; this.emit('open', new Event('open')); } }, 20); }
  emit(t, ev) { this['on' + t]?.(ev); for (const f of this.l[t] ?? []) f(ev); }
  addEventListener(t, f) { (this.l[t] ??= []).push(f); } removeEventListener(t, f) { this.l[t] = (this.l[t] ?? []).filter((g) => g !== f); }
  send(d) { window.__wsSent.push(String(d)); const m = JSON.parse(d); if (m[0] === 'REQ') { const f = m[2] ?? {}; const out = (f.kinds ?? []).includes(31124) ? EVENTS : []; setTimeout(() => { for (const e of out) this.emit('message', new MessageEvent('message', { data: JSON.stringify(['EVENT', m[1], e]) })); this.emit('message', new MessageEvent('message', { data: JSON.stringify(['EOSE', m[1]]) })); }, 30); } }
  close() { this.readyState = 3; }
  get CONNECTING() { return 0; } get OPEN() { return 1; } get CLOSING() { return 2; } get CLOSED() { return 3; } };
window.WebSocket.CONNECTING = 0; window.WebSocket.OPEN = 1; window.WebSocket.CLOSING = 2; window.WebSocket.CLOSED = 3;`;
const muted = `try { localStorage.setItem('blobbi-pixel-lab:audio', JSON.stringify({ master: 0, music: 0, sfx: 0, ambient: 0, muted: true, musicOn: false, reduced: false })); localStorage.setItem('blobbi-pixel-lab:locale', 'en'); } catch {}`;

async function tab() {
  const target = (await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json()) as { id: string; webSocketDebuggerUrl: string };
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map<number, (v: { result?: { result?: { value?: unknown }; data?: string }; error?: unknown }) => void>();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.id && pending.has(m.id)) (pending.get(m.id)!(m), pending.delete(m.id));
  });
  const send = (method: string, params: object = {}) => new Promise<{ result?: { result?: { value?: unknown }; data?: string }; error?: unknown }>((r) => (pending.set(++id, r), ws.send(JSON.stringify({ id, method, params }))));
  const evaluate = async (body: string): Promise<any> => (await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const shoot = async (name: string) => {
    await sleep(500);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/browser-${name}.png`, Buffer.from(r.result!.data!, 'base64'));
  };
  const waitFor = async (expr: string, ms = 15000) => {
    for (let i = 0; i < ms / 100; i++) {
      if (await evaluate(`return !!(${expr});`)) return true;
      await sleep(100);
    }
    return false;
  };
  const load = async () => {
    await send('Page.reload');
    await sleep(500);
    await waitFor('window.__blobbi && window.__blobbi.title()');
    await sleep(1500);
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: relayStub });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: muted });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${ORIGIN}/` });
  await sleep(1500);
  const close = () => fetch(`http://127.0.0.1:9333/json/close/${target.id}`).catch(() => {});
  return { send, evaluate, shoot, waitFor, load, close };
}

/** The restore as the player does it (paste, LOOK INSIDE, RESTORE), then the page settles. */
async function restore(p: Awaited<ReturnType<typeof tab>>) {
  await p.evaluate("await window.__blobbi.openIdentity('restore');");
  await p.evaluate(`window.__blobbi.identity().setLoaded(${JSON.stringify(nsec)});`);
  await p.evaluate("const s = window.__blobbi.identity(); s.index = 2; window.__blobbi.ui().handleKey('Enter');"); // LOOK INSIDE
  await p.waitFor("window.__blobbi.identity().page === 'restorePreview'");
  await p.evaluate("window.__blobbi.ui().handleKey('Enter');"); // RESTORE
  await p.waitFor("window.__blobbi.identity().page === 'restoreDone' && window.__blobbi.identity().search && window.__blobbi.identity().search.status !== 'looking'");
}
const sentEvents = "return window.__wsSent.filter((f) => f.startsWith('[\"EVENT')).length;";
const fresh = async (p: Awaited<ReturnType<typeof tab>>, relays: 'up' | 'down') => {
  // Only this scratch profile's own origin, for a fresh start (no island, no vault, no account).
  await p.send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'indexeddb,local_storage' });
  await p.evaluate(`localStorage.setItem('m11d7:relays', '${relays}');`);
  await p.load();
};

const p = await tab();
try {
  // ── 1. Relays hold Pudding: restore from the raw Recovery Key in a fresh browser ──
  await fresh(p, 'up');
  const start = await p.evaluate("return { title: window.__blobbi.title().page, account: window.__blobbi.account().snapshot().status };");
  check(start.title === 'welcome' && start.account === 'guest', `a fresh browser: welcome page, no account (${JSON.stringify(start)})`);
  await restore(p);
  await p.shoot('1-restore-done-pudding-found');
  const done = await p.evaluate(`const s = window.__blobbi.identity(); const a = window.__blobbi.account().snapshot(); const g = JSON.parse(localStorage.getItem('blobbi-pixel-lab:guest-blobbis') ?? '{"blobbis":[]}').blobbis;
    return { search: s.search, account: { status: a.status, method: a.method, mine: a.pubkey === ${JSON.stringify(owner)} }, blobbis: g.map((b) => ({ d: b.d === ${JSON.stringify(d)}, name: b.name, shared: !!b.activatedAt })), nsecStored: Object.keys(localStorage).some((k) => (localStorage.getItem(k) ?? '').includes('nsec1')) };`);
  console.log('after restore', JSON.stringify(done));
  check(done.search?.status === 'found', 'Pudding was found in other worlds (read back from the stub relays)');
  check(done.account.status === 'connected' && done.account.method === 'vault' && done.account.mine, 'the restored identity is the account now');
  check(done.blobbis.length === 1 && done.blobbis[0].d && done.blobbis[0].name === 'Pudding' && done.blobbis[0].shared, 'one Blobbi here: Pudding, the same d, marked shared');
  check(!done.nsecStored, 'no nsec anywhere in localStorage');
  await p.evaluate("window.__blobbi.ui().handleKey('Enter');"); // CONTINUE WITH PUDDING
  await sleep(600);
  const t1 = await p.evaluate('const t = window.__blobbi.title(); return { active: t.active, page: t.page, restored: t.restoredName };');
  check(t1.active && t1.page === 'carrier' && t1.restored === 'Pudding', `CONTINUE leads into a new adventure for Pudding (${JSON.stringify(t1)})`);
  await p.shoot('2-new-adventure-carrier');
  await p.evaluate("const t = window.__blobbi.title(); t.chooseCarrier(0); t.key('Enter');"); // the Carrier, then CREATE ISLAND
  await sleep(500);
  const t2 = await p.evaluate("return { page: window.__blobbi.title().page };");
  check(t2.page === 'companion', `the companion page: Pudding offered (${JSON.stringify(t2)})`);
  await p.shoot('3-companion-bring-pudding');
  // ── Reload: the identity, Pudding and its shared state are remembered ──
  await p.load();
  const after = await p.evaluate(`const a = window.__blobbi.account().snapshot(); const svc = await window.__blobbi.identityService(); return { status: a.status, method: a.method, mine: a.pubkey === ${JSON.stringify(owner)}, share: await svc.shareStatus(${JSON.stringify(d)}), reserved: svc.reserved().length };`);
  check(after.status === 'connected' && after.method === 'vault' && after.mine && after.share === 'shared' && after.reserved === 1, `after a reload: still this identity, Pudding shared (${JSON.stringify(after)})`);
  await p.evaluate("const ui = window.__blobbi.ui(); ui.open('settings'); ui.screen.showPage && ui.screen.showPage('account');");
  await sleep(2500);
  await p.shoot('4-settings-account-after-reload');
  check((await p.evaluate(sentEvents)) === 0, 'no EVENT frame was ever sent');

  // ── 2. Relays down: the identity is restored and kept, nothing is made, the page says so ──
  await fresh(p, 'down');
  await restore(p);
  await p.shoot('5-restore-done-relays-down');
  const off = await p.evaluate(`const s = window.__blobbi.identity(); const a = window.__blobbi.account().snapshot(); const svc = await window.__blobbi.identityService(); return { search: s.search, status: a.status, mine: a.pubkey === ${JSON.stringify(owner)}, reserved: svc.reserved().length };`);
  check(off.search?.status === 'unavailable' && off.status === 'connected' && off.mine && off.reserved === 0, `relays down: honest offline page, identity kept, nothing made (${JSON.stringify(off)})`);
  check((await p.evaluate(sentEvents)) === 0, 'no EVENT frame was ever sent (relays down)');
} finally {
  await p.close();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/browser-check.txt`, `M11D.7 restore browser check (${new Date().toISOString()}), offline stub relays, disposable key\n${results.join('\n')}\n`);
}
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
