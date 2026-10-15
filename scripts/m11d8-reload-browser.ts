// M11D.8 BROWSER CHECK: seamless world entry, end to end through the real page (`main.ts`), fully offline.
//
// Needs the dev server on 5245 (`npx vite --port 5245 --strictPort --host 127.0.0.1`) and the MUTED lab browser on
// 9333 with its own scratch profile (`node scripts/lab-browser.mjs start <scratchDir>`). A DISPOSABLE key, its Pudding
// (V3 Baby) and Mochi (V3 adult), and two Blobbonaut profiles (kind 11125, Standalone's shape: current_companion
// Pudding, then a newer one naming Mochi) are made and signed here for each run; the key reaches the page only as the
// player would paste it, never printed. Every WebSocket is a stub that answers a REQ by kind from these events
// (localStorage `m11d8:profile` = pudding | mochi | none picks the profile; `m11d8:relays` = down never connects) and
// records every frame: any EVENT the page tried to send would show. Screenshots: examples/m11d8-entry/.
//   npx tsx scripts/m11d8-entry-browser.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nsecEncode } from 'nostr-tools/nip19';
import { buildEggTags, getCanonicalBlobbiD, getCanonicalBlobbonautD } from '@blobbi-kit/core';
import { babyStateTemplate } from '../src/nostr/canonical-events';

const PORT = 5245;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = 'examples/m11d8-reload';
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
const pudding = finalizeEvent(babyStateTemplate({ owner, petId: 'a1b2c3d4e5', name: 'Pudding', bornAt: now - 7200 }, now - 3600), sk);
const mochi = finalizeEvent({ kind: 31124, created_at: now - 3000, content: '', tags: buildEggTags(owner, 'b1b2c3d4e5', now - 3000, 'Mochi', { visualGeneration: 'v3' }).map((t) => (t[0] === 'stage' ? ['stage', 'adult'] : t)) }, sk);
const profile = (current: string, at: number) =>
  finalizeEvent({ kind: 11125, created_at: at, content: '', tags: [['d', getCanonicalBlobbonautD(owner)], ['b', 'blobbi:ecosystem:v1'], ['has', getCanonicalBlobbiD(owner, 'a1b2c3d4e5')], ['has', getCanonicalBlobbiD(owner, 'b1b2c3d4e5')], ['current_companion', current], ['client', 'Blobbi']] }, sk);
const PROFILES = { pudding: profile(getCanonicalBlobbiD(owner, 'a1b2c3d4e5'), now - 1000), mochi: profile(getCanonicalBlobbiD(owner, 'b1b2c3d4e5'), now - 500) };
const nsec = nsecEncode(sk);

const relayStub = `window.__wsUrls = []; window.__wsSent = []; const BLOBBIS = ${JSON.stringify([pudding, mochi])}; const PROFILES = ${JSON.stringify(PROFILES)};
const SETTING = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const DOWN = SETTING('m11d8:relays', 'up') === 'down'; const PICK = SETTING('m11d8:profile', 'pudding'); const DELAY = Number(SETTING('m11d8:delay', '30'));
window.WebSocket = class { constructor(url) { window.__wsUrls.push(String(url)); this.url = String(url); this.readyState = 0; this.l = {}; setTimeout(() => { if (DOWN) { this.readyState = 3; this.emit('error', new Event('error')); this.emit('close', new CloseEvent('close')); } else { this.readyState = 1; this.emit('open', new Event('open')); } }, 20); }
  emit(t, ev) { this['on' + t]?.(ev); for (const f of this.l[t] ?? []) f(ev); }
  addEventListener(t, f) { (this.l[t] ??= []).push(f); } removeEventListener(t, f) { this.l[t] = (this.l[t] ?? []).filter((g) => g !== f); }
  send(d) { window.__wsSent.push(String(d)); const m = JSON.parse(d); if (m[0] === 'REQ') { const f = m[2] ?? {}; const kinds = f.kinds ?? []; const out = kinds.includes(31124) ? BLOBBIS : kinds.includes(11125) && PROFILES[PICK] ? [PROFILES[PICK]] : []; setTimeout(() => { for (const e of out) this.emit('message', new MessageEvent('message', { data: JSON.stringify(['EVENT', m[1], e]) })); this.emit('message', new MessageEvent('message', { data: JSON.stringify(['EOSE', m[1]]) })); }, DELAY); } }
  close() { this.readyState = 3; }
  get CONNECTING() { return 0; } get OPEN() { return 1; } get CLOSING() { return 2; } get CLOSED() { return 3; } };
window.WebSocket.CONNECTING = 0; window.WebSocket.OPEN = 1; window.WebSocket.CLOSING = 2; window.WebSocket.CLOSED = 3;`;
const muted = `try { localStorage.setItem('blobbi-pixel-lab:audio', JSON.stringify({ master: 0, music: 0, sfx: 0, ambient: 0, muted: true, musicOn: false, reduced: false })); localStorage.setItem('blobbi-pixel-lab:locale', 'en'); } catch {}`;

const logs: string[] = [];
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
    if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.args.map((a: { value?: unknown }) => String(a.value)).join(' '));
  });
  const send = (method: string, params: object = {}) => new Promise<Reply>((r) => (pending.set(++id, r), ws.send(JSON.stringify({ id, method, params }))));
  const evaluate = async (body: string): Promise<any> => (await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const shoot = async (name: string) => {
    await sleep(500);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/browser-${name}.png`, Buffer.from(r.result!.data!, 'base64'));
  };
  const waitFor = async (expr: string, ms = 15000) => {
    for (let i = 0; i < ms / 100; i++) {
      if (await evaluate(`try { return !!(${expr}); } catch { return false; }`)) return true;
      await sleep(100);
    }
    return false;
  };
  // Every EVENT frame any page load tried to send, counted before the page goes away.
  let sentEvents = 0;
  const countEvents = async () => (sentEvents += Number((await evaluate("return (window.__wsSent ?? []).filter((f) => f.startsWith('[\"EVENT')).length;")) ?? 0));
  const load = async (hash = '') => {
    await countEvents();
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(200);
    await send('Page.navigate', { url: `${ORIGIN}/${hash}` });
    await waitFor('window.__blobbi && window.__blobbi.title()');
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: relayStub });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: muted });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${ORIGIN}/` });
  await sleep(1500);
  const close = () => fetch(`http://127.0.0.1:9333/json/close/${target.id}`).catch(() => {});
  const events = async () => (await countEvents(), sentEvents);
  const reload = async (ignoreCache: boolean) => {
    await countEvents();
    await send('Page.reload', { ignoreCache });
    await sleep(300);
    await waitFor('window.__blobbi && window.__blobbi.title()');
  };
  return { send, evaluate, shoot, waitFor, load, close, events, reload };
}
type Tab = Awaited<ReturnType<typeof tab>>;

const fresh = async (p: Tab) => {
  await p.send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'indexeddb,local_storage' }); // this scratch profile's own origin only
  await p.load();
};
const setting = (p: Tab, k: string, v: string | null) => p.evaluate(v === null ? `localStorage.removeItem('${k}');` : `localStorage.setItem('${k}', '${v}');`);
const where = (p: Tab) => p.evaluate("const t = window.__blobbi.title(); const l = window.__blobbi.live(); return { title: t.active, page: t.page, island: l ? l.identity : null, seed: l ? l.blobbi.seed : null, intro: !!window.__blobbi.intro(), account: window.__blobbi.account().snapshot().status };");
/** Wait for the automatic entry to settle (it reads the relays for at most a few seconds). */
const settle = (p: Tab) => p.waitFor("!window.__blobbi.title().active || ['switch', 'arrived', 'islands'].includes(window.__blobbi.title().page)", 9000);

const p = await tab();
try {
  // ── Setup: restore the disposable identity (its Pudding is found), make an island with Pudding ──
  await fresh(p);
  await setting(p, 'm11d8:profile', 'pudding');
  await p.load();
  const first = await where(p);
  check(first.title && first.page === 'welcome' && first.account === 'guest', `1. a first-time visitor: the title (WELCOME), no account (${JSON.stringify(first)})`);
  await p.evaluate("await window.__blobbi.openIdentity('restore');");
  await p.evaluate(`window.__blobbi.identity().setLoaded(${JSON.stringify(nsec)});`);
  await p.evaluate("window.__blobbi.identity().index = 2; window.__blobbi.ui().handleKey('Enter');");
  await p.waitFor("window.__blobbi.identity().page === 'restorePreview'");
  await p.evaluate("window.__blobbi.ui().handleKey('Enter');");
  await p.waitFor("window.__blobbi.identity().page === 'restoreDone' && window.__blobbi.identity().search && window.__blobbi.identity().search.status !== 'looking'");
  await p.evaluate("window.__blobbi.ui().handleKey('Enter');"); // CONTINUE WITH PUDDING
  await sleep(400);
  await p.evaluate("const t = window.__blobbi.title(); t.chooseCarrier(0); t.key('Enter');"); // the Carrier, CREATE ISLAND
  await sleep(300);
  await p.evaluate("window.__blobbi.title().key('Enter');"); // CONTINUE WITH PUDDING (companion page)
  await p.waitFor('!!window.__blobbi.intro()', 15000);
  for (let i = 0; i < 60 && (await p.evaluate('return !!window.__blobbi.intro();')); i++) {
    await p.evaluate('window.__blobbi.intro() && window.__blobbi.intro().requestSkip && window.__blobbi.intro().requestSkip();');
    await sleep(1000);
  }
  await p.waitFor('!window.__blobbi.title().active && !window.__blobbi.intro()', 20000);
  await sleep(1500); // a moment of play (the island and the visit are saved)
  const made = await where(p);
  const island = made.island;
  const puddingSeed = made.seed;
  check(!made.title && !!island, `setup: an island with Pudding, playing (${JSON.stringify(made)})`);


  const N = Number(process.env.RELOADS ?? 12);
  const runs: Record<string, { ok: number; bad: string[] }> = {};
  for (const mode of (process.env.MODES ?? 'fast,slow,down,none').split(',')) {
    await setting(p, 'm11d8:relays', mode === 'down' ? 'down' : null);
    await setting(p, 'm11d8:profile', mode === 'none' ? 'none' : 'pudding');
    await setting(p, 'm11d8:delay', mode === 'slow' ? '3500' : mode === 'hang' ? '60000' : '30');
    runs[mode] = { ok: 0, bad: [] };
    for (let i = 0; i < N; i++) {
      logs.length = 0;
      await p.reload(i % 2 === 1);
      await settle(p);
      await sleep(200);
      const w = await where(p);
      const ok = !!w && !!island && !w.title && w.island === island && w.seed === puddingSeed && !w.intro;
      if (ok) runs[mode].ok++;
      else runs[mode].bad.push(`${i}: ${JSON.stringify(w)} ${logs.filter((l) => l.includes('[entry]')).join(' | ')}`);
    }
    check(runs[mode].ok === N, `${mode}: ${runs[mode].ok}/${N} reloads straight into the island with Pudding${runs[mode].bad.length ? '\n    ' + runs[mode].bad.join('\n    ') : ''}`);
  }
  await setting(p, 'm11d8:relays', null);
  await setting(p, 'm11d8:delay', null);
  // A reload from inside the island while ANOTHER Blobbi is current and the device's choice has no stamp (made
  // before M11D.8.3): still asked who comes along (not the bare title). (A stamped, newer choice would just go in.)
  await p.evaluate("const k = 'blobbi-pixel-lab:selected-blobbi'; const r = JSON.parse(localStorage.getItem(k)); delete r.selectedAt; delete r.selectedBy; localStorage.setItem(k, JSON.stringify(r));");
  await setting(p, 'm11d8:profile', 'mochi');
  const inside = await where(p);
  await p.reload(false);
  await settle(p);
  const asked = await where(p);
  check(!inside.title && asked.title && asked.page === 'switch', `reload from inside, another current Blobbi: "who comes along?" (${JSON.stringify(asked)})`);
  await setting(p, 'm11d8:profile', 'pudding');
  await p.reload(false);
  await settle(p);
  // The island's save, as kept before the next loads.
  const saveOf = () => p.evaluate(`return Object.keys(localStorage).filter((k) => k.startsWith('blobbi-pixel-lab:world:')).map((k) => k + '=' + localStorage.getItem(k).length).join(',');`);
  // #menu with the island's own address: the title stays.
  const here = await p.evaluate('return location.hash;');
  await p.load(`${here}&menu=1`);
  await sleep(5000);
  const menu = await where(p);
  check(menu.title && menu.page === 'main', `the island's own address with #menu: the title stays (${JSON.stringify(menu)})`);
  // A link to an island not saved here: the title (it offers to play it); the saved island is untouched.
  const before = await saveOf();
  await p.load('#seed=someone-elses-island&mode=play&kind=turtle&turtle=turtle-0&variant=2');
  await sleep(5000);
  const foreign = await where(p);
  const after = await saveOf();
  check(foreign.title && foreign.island !== island && before === after, `a link to an island not saved here: the title, the saved islands unchanged (${JSON.stringify(foreign)}; ${before === after ? 'same saves' : before + ' -> ' + after})`);
  // Time from navigation to play, with fast relays (local data enough; the read answers quickly).
  const t0 = Date.now();
  await p.load();
  await settle(p);
  const quick = await where(p);
  check(!!quick && !!island && !quick.title && quick.island === island, `a plain load: in after ${((Date.now() - t0) / 1000).toFixed(1)} s (${JSON.stringify(quick)})`);
  // SETTINGS > MAIN MENU, then reloads: the title every time (the player chose it); playing again clears it.
  await p.evaluate("window.__blobbi.ui().screens.get('settings').onMainMenu();");
  const chosen = [];
  for (let i = 0; i < 3; i++) {
    await p.reload(i === 1);
    await sleep(5000);
    chosen.push(await where(p));
  }
  check(chosen.every((w) => w.title && w.page === 'main'), `after SETTINGS > MAIN MENU, 3 reloads: the main menu each time (${JSON.stringify(chosen.map((w) => w.page))})`);
  await p.evaluate("const t = window.__blobbi.title(); t.index = 0; t.key('Enter');"); // CONTINUE
  await sleep(1500);
  const again = await where(p);
  await p.reload(false);
  await settle(p);
  const resumed = await where(p);
  check(!!again && !!resumed && !!island && !again.title && !resumed.title && resumed.island === island, `CONTINUE, then a reload: straight in again (${JSON.stringify(resumed)})`);
  const all = await p.events();
  check(all === 0, `no EVENT frame was ever sent, over every page load (${all})`);
} catch (e) {
  check(false, `the check stopped: ${(e as Error).message}`);
} finally {
  await p.close();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/browser-check.txt`, `M11D.8 repeated reload browser check (${new Date().toISOString()}), offline stub relays, disposable key\n${results.join('\n')}\n`);
}
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
