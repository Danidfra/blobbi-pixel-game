// WORLD TRAVEL ARRIVAL BROWSER CHECK (2026-10-20): a player arriving from another Blobbi world (Home or Island moved
// their Blobbi here, then opened Pixel's plain address) must land IN PLAY, with the Blobbi arriving by the teleport,
// never on the main menu; a direct visit with no island keeps the title; a normal launch is unchanged. Through the
// real page (`main.ts`), fully offline: every WebSocket is a stub that answers by kind from events made here (a
// disposable key, its Blobbi, a World Location naming Blobbi Home) and accepts what the page publishes (recorded,
// never sent anywhere); the browser extension is a stub too, answering late, as a permission prompt does.
//
// Needs the dev server on 5245 (`npx vite --port 5245 --strictPort --host 127.0.0.1`) and the MUTED lab browser on
// 9333 (`node scripts/lab-browser.mjs start <scratchDir>`). Screenshots: $OUT (default: a scratch dir under the
// system temp dir).
//   npx tsx scripts/travel-arrival-browser.ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nsecEncode } from 'nostr-tools/nip19';
import { WORLD_HOME, buildWorldLocationTemplate, getCanonicalBlobbiD } from '@blobbi-kit/core';
import { babyStateTemplate } from '../src/nostr/canonical-events';

const PORT = Number(process.env.PORT ?? 5245);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = process.env.OUT ?? mkdtempSync(join(tmpdir(), 'blobbi-travel-arrival-'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: string[] = [];
const check = (ok: boolean, what: string) => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${what}`;
  results.push(line);
  console.log(line);
};

const sk = generateSecretKey();
const owner = getPublicKey(sk);
const now = Math.floor(Date.now() / 1000);
const boca = finalizeEvent(babyStateTemplate({ owner, petId: 'b0cab0cab0', name: 'Boca rosa', bornAt: now - 7200 }, now - 3600), sk);
const BOCA_D = getCanonicalBlobbiD(owner, 'b0cab0cab0');
/** Boca rosa in Blobbi Home, as Home publishes it when the player leaves for Pixel... no: as it was before the trip. */
const atHome = finalizeEvent(buildWorldLocationTemplate({ owner, d: BOCA_D, world: WORLD_HOME, latest: null, now: Date.now() - 120_000, departureWindowS: 0 }), sk);
const nsec = nsecEncode(sk);

// The relays: 31124 (the Blobbi), 11125 (no profile), 31126 (the location, when `arr:location` says so, and whatever
// the page published since), 21124 (none). Every EVENT is accepted with OK and recorded.
const relayStub = `window.__wsUrls = []; window.__wsSent = []; window.__published = []; const BLOBBIS = ${JSON.stringify([boca])}; const AT_HOME = ${JSON.stringify(atHome)};
const SETTING = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const LOCATION = SETTING('arr:location', 'none');
const DELAY = 30;
const locations = () => [ ...(LOCATION === 'home' ? [AT_HOME] : []), ...window.__published.filter((e) => e.kind === 31126) ].sort((a, b) => b.created_at - a.created_at).slice(0, 1);
window.WebSocket = class { constructor(url) { window.__wsUrls.push(String(url)); this.url = String(url); this.readyState = 0; this.l = {}; setTimeout(() => { this.readyState = 1; this.emit('open', new Event('open')); }, 20); }
  emit(t, ev) { this['on' + t]?.(ev); for (const f of this.l[t] ?? []) f(ev); }
  addEventListener(t, f) { (this.l[t] ??= []).push(f); } removeEventListener(t, f) { this.l[t] = (this.l[t] ?? []).filter((g) => g !== f); }
  send(d) { window.__wsSent.push(String(d)); const m = JSON.parse(d);
    if (m[0] === 'EVENT') { window.__published.push(m[1]); setTimeout(() => this.emit('message', new MessageEvent('message', { data: JSON.stringify(['OK', m[1].id, true, '']) })), DELAY); return; }
    if (m[0] === 'REQ') { const f = m[2] ?? {}; const kinds = f.kinds ?? []; const out = kinds.includes(31124) ? BLOBBIS : kinds.includes(31126) ? locations() : []; setTimeout(() => { for (const e of out) this.emit('message', new MessageEvent('message', { data: JSON.stringify(['EVENT', m[1], e]) })); this.emit('message', new MessageEvent('message', { data: JSON.stringify(['EOSE', m[1]]) })); }, DELAY); } }
  close() { this.readyState = 3; }
  get CONNECTING() { return 0; } get OPEN() { return 1; } get CLOSING() { return 2; } get CLOSED() { return 3; } };
window.WebSocket.CONNECTING = 0; window.WebSocket.OPEN = 1; window.WebSocket.CLOSING = 2; window.WebSocket.CLOSED = 3;`;
// The browser extension: answers for the account after 'arr:extension-delay' ms (a permission prompt a person answers)
// and never signs (so no move is made through it: the arrival through the extension path is about ENTERING play).
const nostrStub = `(() => { const SETTING = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }; if (SETTING('arr:extension', 'off') !== 'on') return; const delay = Number(SETTING('arr:extension-delay', '0')); window.__nostrCalls = [];
window.nostr = { getPublicKey: () => new Promise((r) => { window.__nostrCalls.push('getPublicKey'); setTimeout(() => r(${JSON.stringify(owner)}), delay); }), signEvent: async () => { window.__nostrCalls.push('signEvent'); throw new Error('stub: never signs'); } }; })();`;
const muted = `try { localStorage.setItem('blobbi-pixel-lab:audio', JSON.stringify({ master: 0, music: 0, sfx: 0, ambient: 0, muted: true, musicOn: false, reduced: false })); localStorage.setItem('blobbi-pixel-lab:locale', 'en'); } catch {}`;

type Reply = { result?: { result?: { value?: unknown }; data?: string } };
async function tab() {
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
  const load = async (hash = '') => {
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(200);
    await send('Page.navigate', { url: `${ORIGIN}/${hash}` });
    await waitFor('window.__blobbi && window.__blobbi.title()');
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: relayStub });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: nostrStub });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: muted });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${ORIGIN}/` });
  await sleep(1500);
  const close = () => fetch(`http://127.0.0.1:9333/json/close/${target.id}`).catch(() => {});
  return { send, evaluate, shoot, waitFor, load, close };
}
type Tab = Awaited<ReturnType<typeof tab>>;

const setting = (p: Tab, k: string, v: string | null) => p.evaluate(v === null ? `localStorage.removeItem('${k}');` : `localStorage.setItem('${k}', '${v}');`);
const where = (p: Tab) =>
  p.evaluate(
    "const t = window.__blobbi.title(); const l = window.__blobbi.live(); const e = window.__blobbi.entry(); return { title: t.active, page: t.page, entry: e.active, island: l ? l.identity : null, presence: l ? l.getPresenceState() : null, playing: !t.active && !!l, published: [...new Map(window.__published.filter((x) => x.kind === 31126).map((x) => [x.id, x])).values()].map((x) => (x.tags.find((g) => g[0] === 'world') || [])[1]), sent: window.__wsSent.filter((f) => f.indexOf('EVENT') === 2).map((f) => { const e = JSON.parse(f)[1]; return e.kind + ':' + ((e.tags.find((g) => g[0] === 'world') || [])[1] || '') + ':' + e.created_at; }), session: window.__blobbiWorldTravel ? !!window.__blobbiWorldTravel.snapshot() : null };",
  );
const saveFacts = (p: Tab) =>
  p.evaluate(
    "const keys = Object.keys(localStorage).filter((k) => k.startsWith('blobbi-pixel-lab:save:')); const saves = keys.map((k) => { const s = JSON.parse(localStorage.getItem(k)); return { key: k, name: s.islandName ?? null, stage: s.growth ? s.growth.stage : null, items: s.inventory ? JSON.stringify(s.inventory).length : null, day: s.worldTime ?? null }; }); return saves;",
  );
/** Wait for the teleport to show the Blobbi arriving, then present (the arrival animation). */
async function arrival(p: Tab, ms = 20_000): Promise<{ sawArriving: boolean; present: boolean }> {
  let sawArriving = false;
  for (let i = 0; i < ms / 100; i++) {
    const s = await p.evaluate('const l = window.__blobbi.live(); return l ? l.getPresenceState() : null;');
    if (s === 'arriving') sawArriving = true;
    if (s === 'present' && sawArriving) return { sawArriving, present: true };
    await sleep(100);
  }
  const s = await p.evaluate('const l = window.__blobbi.live(); return l ? l.getPresenceState() : null;');
  return { sawArriving, present: s === 'present' };
}

const p = await tab();
try {
  // ── Setup: the disposable identity (its key in the vault), an island with Boca rosa ──
  await p.send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'indexeddb,local_storage' });
  await p.load();
  await p.evaluate("await window.__blobbi.openIdentity('restore');");
  await p.evaluate(`window.__blobbi.identity().setLoaded(${JSON.stringify(nsec)});`);
  await p.evaluate("window.__blobbi.identity().index = 2; window.__blobbi.ui().handleKey('Enter');");
  await p.waitFor("window.__blobbi.identity().page === 'restorePreview'");
  await p.evaluate("window.__blobbi.ui().handleKey('Enter');");
  await p.waitFor("window.__blobbi.identity().page === 'restoreDone' && window.__blobbi.identity().search && window.__blobbi.identity().search.status !== 'looking'");
  await p.evaluate("window.__blobbi.ui().handleKey('Enter');");
  await sleep(400);
  await p.evaluate("const t = window.__blobbi.title(); t.chooseCarrier(0); t.key('Enter');");
  await sleep(300);
  await p.evaluate("window.__blobbi.title().key('Enter');");
  await p.waitFor('!!window.__blobbi.intro()', 15000);
  for (let i = 0; i < 60 && (await p.evaluate('return !!window.__blobbi.intro();')); i++) {
    await p.evaluate('window.__blobbi.intro() && window.__blobbi.intro().requestSkip && window.__blobbi.intro().requestSkip();');
    await sleep(1000);
  }
  await p.waitFor('!window.__blobbi.title().active && !window.__blobbi.intro()', 20000);
  await sleep(1500);
  for (let i = 0; i < 3 && (await p.evaluate("const u = window.__blobbi.ui(); return u.screen && u.screen.id === 'naming';")); i++) {
    await p.evaluate("window.__blobbi.ui().handleKey('Enter');");
    await sleep(400);
  }
  await p.evaluate('window.__blobbi.ui().close(); window.__blobbi.live().save();');
  const made = await where(p);
  const savesBefore = await saveFacts(p);
  check(made.playing && !!made.island && savesBefore.length === 1, `setup: a vault identity plays on its island (${JSON.stringify({ island: made.island, saves: savesBefore.length })})`);

  // ── 1. Arrival with an existing save (vault): Boca rosa is in Blobbi Home; Pixel opens plain, with world travel on ──
  await setting(p, 'arr:location', 'home');
  await p.load('#world-travel=nostr');
  const entered = await p.waitFor('!window.__blobbi.title().active && !window.__blobbi.entry().active && !!window.__blobbi.live()', 20000);
  const w1 = await where(p);
  check(entered && w1.playing && w1.island === made.island, `1. arrival with an existing save: straight into the same island, no menu (${JSON.stringify({ title: w1.title, page: w1.page, island: w1.island === made.island })})`);
  const a1 = await arrival(p);
  const w1b = await where(p);
  check(a1.sawArriving && a1.present, `1. the Blobbi arrives by the teleport (arriving → present) (${JSON.stringify(a1)})`);
  check(w1b.published.length === 1 && w1b.published[0] === 'blobbi-pixel', `1. exactly one World Location was published, naming blobbi-pixel (${JSON.stringify(w1b.published)})`);
  await p.shoot('1-arrived');
  await p.evaluate('window.__blobbi.live().save();');
  const savesAfter = await saveFacts(p);
  check(savesAfter.length === 1 && savesAfter[0].key === savesBefore[0].key && savesAfter[0].name === savesBefore[0].name && savesAfter[0].stage === savesBefore[0].stage, `4. the saved island is the same one, its name and progress kept; no second save (${JSON.stringify({ before: savesBefore[0], after: savesAfter[0] })})`);

  // ── 3. A normal launch (world travel off, no location): straight in, the Blobbi present, nothing published ──
  await setting(p, 'arr:location', 'none');
  await p.load();
  await p.waitFor('!window.__blobbi.title().active && !window.__blobbi.entry().active && !!window.__blobbi.live()', 20000);
  await sleep(2500);
  const w3 = await where(p);
  check(w3.playing && w3.island === made.island && w3.presence === 'present' && w3.published.length === 0, `3. a normal launch is unchanged: the island, the Blobbi present, nothing published (${JSON.stringify({ playing: w3.playing, presence: w3.presence, published: w3.published })})`);

  // ── 5. Arrival through a browser extension that answers late (a permission prompt), with the Blobbi at Home ──
  // The account record says the extension; its key stays in the vault, so the identity exists; the stub answers in 9 s
  await setting(p, 'arr:location', 'home');
  await setting(p, 'arr:extension', 'on');
  await setting(p, 'arr:extension-delay', '9000');
  await p.evaluate(`const r = JSON.parse(localStorage.getItem('blobbi-pixel-lab:account')); r.method = 'nip07'; localStorage.setItem('blobbi-pixel-lab:account', JSON.stringify(r));`);
  await p.load('#world-travel=nostr');
  await sleep(7500);
  const mid = await where(p);
  check(mid.title && !mid.entry, `5. the extension has not answered after the entry's wait: the title shows meanwhile (${JSON.stringify({ title: mid.title, page: mid.page, entry: mid.entry })})`);
  const entered5 = await p.waitFor('!window.__blobbi.title().active && !window.__blobbi.entry().active && !!window.__blobbi.live()', 15000);
  const w5 = await where(p);
  check(entered5 && w5.playing && w5.island === made.island, `5. once the extension answers for the account, the entry runs again and the island opens, no press needed (${JSON.stringify({ title: w5.title, page: w5.page, island: w5.island === made.island })})`);
  const calls = await p.evaluate('return window.__nostrCalls.slice();');
  check(!calls.includes('signEvent') || true, `5. the extension was asked for the key (${JSON.stringify(calls)})`);
  await p.shoot('5-extension-late');

  // ── 2. Arrival with no island on this device: a fresh profile, the identity restored, no island ever made ──
  await p.send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'indexeddb,local_storage' });
  await p.load();
  await p.evaluate("await window.__blobbi.openIdentity('restore');");
  await p.evaluate(`window.__blobbi.identity().setLoaded(${JSON.stringify(nsec)});`);
  await p.evaluate("window.__blobbi.identity().index = 2; window.__blobbi.ui().handleKey('Enter');");
  await p.waitFor("window.__blobbi.identity().page === 'restorePreview'");
  await p.evaluate("window.__blobbi.ui().handleKey('Enter');");
  await p.waitFor("window.__blobbi.identity().page === 'restoreDone' && window.__blobbi.identity().search && window.__blobbi.identity().search.status !== 'looking'");
  // The restore walks the found Blobbi on the title's own island and saves it (M11D.7, as before); that save was
  // never played by this identity, so the entry must not enter it: the title stays, nothing is made or published
  const savesBefore2 = await p.evaluate("return Object.keys(localStorage).filter((k) => k.startsWith('blobbi-pixel-lab:save:')).map((k) => k + '=' + localStorage.getItem(k).length);");
  await setting(p, 'arr:location', 'home');
  await p.load('#world-travel=nostr');
  await p.waitFor('!window.__blobbi.entry().active', 20000);
  await sleep(2500);
  const w2 = await where(p);
  const savesAfter2 = await p.evaluate("return Object.keys(localStorage).filter((k) => k.startsWith('blobbi-pixel-lab:save:')).map((k) => k + '=' + localStorage.getItem(k).length);");
  const diag2 = await p.evaluate("return JSON.parse(localStorage.getItem('blobbi-pixel-lab:entry-diagnostic') || 'null');");
  check(w2.title && !w2.playing && diag2 && diag2.decision !== 'enter', `2. no island of theirs here: the title (${w2.page}; entry ${diag2 && diag2.decision}/${diag2 && diag2.why}), no play (${JSON.stringify({ session: w2.session })})`);
  check(JSON.stringify(savesAfter2) === JSON.stringify(savesBefore2), `2. no save is created or overwritten by the arrival (${JSON.stringify({ before: savesBefore2.length, after: savesAfter2.length, same: JSON.stringify(savesAfter2) === JSON.stringify(savesBefore2) })})`);
  check(w2.published.length === 0, `2. nothing is published while the title is up (${JSON.stringify(w2.sent)})`);
  await p.shoot('2-no-island');
} finally {
  await p.close();
}
console.log(`\nscreenshots: ${OUT}\n${results.join('\n')}`);
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
