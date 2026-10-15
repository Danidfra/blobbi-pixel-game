// M11D.8.4 BROWSER CHECK: the first-load inconsistency, through the real page (`main.ts`) and the real relay client.
//
// Manual report: Boca rosa walked Breezy Glade, Moon was set as companion in Ditto; the first load went in with Boca
// rosa, a refresh then asked "who comes along?". This check puts the page in that state (a disposable key, Boca rosa
// stamped 30 minutes ago, Moon's profile 10 minutes ago) and reloads it repeatedly from the SAME stored state, with all
// relays answering and with one relay that never answers (`m11d84:hang`), and with an unstamped (pre-M11D.8.3) choice.
// Every outcome must be the same on every load. Run it against any build: `PORT=5246 OUT=... npx tsx <this>` points it
// at another dev server (the previous commit, to see the old behaviour). Stub relays, muted lab browser, no EVENT.
//   npx tsx scripts/m11d8-4-startup-browser.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nsecEncode } from 'nostr-tools/nip19';
import { buildEggTags, getCanonicalBlobbiD, getCanonicalBlobbonautD } from '@blobbi-kit/core';
import { babyStateTemplate } from '../src/nostr/canonical-events';

const PORT = Number(process.env.PORT ?? 5245);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = process.env.OUT ?? 'examples/m11d8-4-startup';
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
const moon = finalizeEvent({ kind: 31124, created_at: now - 3000, content: '', tags: buildEggTags(owner, '0a0a0a0a0a', now - 3000, 'Moon', { visualGeneration: 'v3' }).map((t) => (t[0] === 'stage' ? ['stage', 'adult'] : t)) }, sk);
/** A Blobbonaut profile (kind 11125, Standalone's and Ditto's shape) naming `current`, published at `at` (seconds). */
const profile = (current: string, at: number) =>
  finalizeEvent({ kind: 11125, created_at: at, content: '', tags: [['d', getCanonicalBlobbonautD(owner)], ['b', 'blobbi:ecosystem:v1'], ['has', getCanonicalBlobbiD(owner, 'b0cab0cab0')], ['has', getCanonicalBlobbiD(owner, '0a0a0a0a0a')], ['current_companion', current], ['client', 'Blobbi']] }, sk);
const MOON_D = getCanonicalBlobbiD(owner, '0a0a0a0a0a');
const nsec = nsecEncode(sk);

const relayStub = `window.__wsUrls = []; window.__wsSent = []; const BLOBBIS = ${JSON.stringify([boca, moon])};
const SETTING = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const DOWN = SETTING('m11d8:relays', 'up') === 'down'; const DELAY = Number(SETTING('m11d8:delay', '30')); const HANG = SETTING('m11d84:hang', ''); const PROFILE = (() => { try { return JSON.parse(SETTING('m11d83:profile', 'null')); } catch { return null; } })();
window.WebSocket = class { constructor(url) { window.__wsUrls.push(String(url)); this.url = String(url); this.readyState = 0; this.l = {}; setTimeout(() => { if (DOWN) { this.readyState = 3; this.emit('error', new Event('error')); this.emit('close', new CloseEvent('close')); } else { this.readyState = 1; this.emit('open', new Event('open')); } }, 20); }
  emit(t, ev) { this['on' + t]?.(ev); for (const f of this.l[t] ?? []) f(ev); }
  addEventListener(t, f) { (this.l[t] ??= []).push(f); } removeEventListener(t, f) { this.l[t] = (this.l[t] ?? []).filter((g) => g !== f); }
  send(d) { window.__wsSent.push(String(d)); const m = JSON.parse(d); if (m[0] === 'REQ' && HANG && this.url.includes(HANG)) return; if (m[0] === 'REQ') { const f = m[2] ?? {}; const kinds = f.kinds ?? []; const out = kinds.includes(31124) ? BLOBBIS : kinds.includes(11125) && PROFILE ? [PROFILE] : []; setTimeout(() => { for (const e of out) this.emit('message', new MessageEvent('message', { data: JSON.stringify(['EVENT', m[1], e]) })); this.emit('message', new MessageEvent('message', { data: JSON.stringify(['EOSE', m[1]]) })); }, DELAY); } }
  close() { this.readyState = 3; }
  get CONNECTING() { return 0; } get OPEN() { return 1; } get CLOSING() { return 2; } get CLOSED() { return 3; } };
window.WebSocket.CONNECTING = 0; window.WebSocket.OPEN = 1; window.WebSocket.CLOSING = 2; window.WebSocket.CLOSED = 3;`;
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
  return { send, evaluate, shoot, waitFor, load, close, events };
}
type Tab = Awaited<ReturnType<typeof tab>>;

const fresh = async (p: Tab) => {
  await p.send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'indexeddb,local_storage' }); // this scratch profile's own origin only
  await p.load();
};
const setting = (p: Tab, k: string, v: string | null) => p.evaluate(v === null ? `localStorage.removeItem('${k}');` : `localStorage.setItem('${k}', '${v}');`);


const where = (p: Tab) => p.evaluate("const t = window.__blobbi.title(); const l = window.__blobbi.live(); return { title: t.active, page: t.page, island: l ? l.identity : null, seed: l ? l.blobbi.seed : null };");
const settle = (p: Tab) => p.waitFor("!window.__blobbi.title().active || ['switch', 'arrived', 'islands'].includes(window.__blobbi.title().page) || (window.__blobbi.entry && !window.__blobbi.entry().active && window.__blobbi.title().active)", 15000);
const SEL = 'blobbi-pixel-lab:selected-blobbi';
const diagnostic = (p: Tab) => p.evaluate("return JSON.parse(localStorage.getItem('blobbi-pixel-lab:entry-diagnostic') ?? 'null');");
const remote = (p: Tab, d: string | null, atSeconds: number) => setting(p, 'm11d83:profile', d ? JSON.stringify(profile(d, atSeconds)) : null);
const nowS = () => Math.floor(Date.now() / 1000);
const N = Number(process.env.LOADS ?? 5);

const p = await tab();
try {
  // ── Setup: restore the disposable identity, make Breezy Glade with Boca rosa ──
  await fresh(p);
  await remote(p, null, 0);
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
  const made = await where(p);
  const island = made.island!;
  const bocaSeed = made.seed!;
  check(!made.title && !!island, `setup: Breezy Glade with Boca rosa, playing`);
  // Boca rosa's choice, stamped 30 minutes ago; Moon set as companion elsewhere 10 minutes ago.
  const stamped = await p.evaluate(`const r = JSON.parse(localStorage.getItem('${SEL}')); r.selectedAt = Date.now() - 30 * 60000; r.selectedBy = 'player'; delete r.existedBy; return JSON.stringify(r);`);
  const moonAt = nowS() - 600;
  await remote(p, MOON_D, moonAt);
  // The island's visits as they were: Boca rosa came last (the manual starting state).
  const VISITS = 'blobbi-pixel-lab:island-visits';
  const visitsBoca = await p.evaluate(`return localStorage.getItem('${VISITS}');`);

  /** N loads from the SAME stored state (the selection put back before each), with `hang` relay hanging or none. */
  const repeat = async (_label: string, record: string, hang: string | null, visits: string = visitsBoca) => {
    await setting(p, 'm11d84:hang', hang);
    const seen: string[] = [];
    const reasons: string[] = [];
    for (let i = 0; i < N; i++) {
      await p.evaluate(`localStorage.setItem('${SEL}', ${JSON.stringify(record)}); localStorage.setItem('${VISITS}', ${JSON.stringify(visits)}); localStorage.removeItem('blobbi-pixel-lab:entry-choice');`);
      await p.load();
      await settle(p);
      const w = await where(p);
      const d = await diagnostic(p);
      seen.push(w.title ? `title:${w.page}` : w.seed === bocaSeed ? 'in:boca' : 'in:moon');
      reasons.push(d ? `${d.decision}/${d.current}${d.partial ? '+partial' : ''}/${d.order ?? '-'}/${d.reason ?? '-'}/${d.local}/${d.waitedMs}ms` : 'no diagnostic');
    }
    await setting(p, 'm11d84:hang', null);
    return { seen, reasons };
  };

  // 1. All relays answer: Moon comes along every time.
  const fast = await repeat('fast', stamped, null);
  // The state after Moon came along (her choice, stamped with the remote time): the offline step starts from it.
  const adopted = await p.evaluate(`return localStorage.getItem('${SEL}');`);
  const visitsMoon = await p.evaluate(`return localStorage.getItem('${VISITS}');`);
  check(fast.seen.every((s) => s === 'in:moon'), `stamped Boca rosa, Moon newer, all relays: ${fast.seen.join(', ')} | ${fast.reasons[0]}`);
  // 2. One relay never answers (the manual first load): the same outcome, every time.
  const slow = await repeat('hang', stamped, 'dreamith');
  check(slow.seen.every((s) => s === 'in:moon'), `the same, with one relay that never answers: ${slow.seen.join(', ')} | ${slow.reasons[0]}`);
  check(JSON.stringify(fast.seen) === JSON.stringify(slow.seen), `a slow relay changes nothing: identical outcomes`);
  await p.shoot('moon-came-along');
  // 3. The unstamped (pre-M11D.8.3) choice, Moon set before this device saw it: asked, every time, with the reason.
  const unstamped = JSON.stringify((({ selectedAt, selectedBy, existedBy, ...rest }) => rest)(JSON.parse(stamped)));
  const legacy = await repeat('legacy', unstamped, 'dreamith');
  check(legacy.seen.every((s) => s === 'title:switch'), `an unstamped Boca rosa, Moon set before: "who comes along?" every time: ${legacy.seen.join(', ')} | ${legacy.reasons[0]}`);
  // 4. After this device has seen the unstamped choice (its existed-by bound), Moon set again LATER: Moon comes along.
  const seenOnce = JSON.parse(await p.evaluate(`return localStorage.getItem('${SEL}');`));
  check(typeof seenOnce.existedBy === 'number' && !('selectedAt' in seenOnce), `the unstamped choice got its existed-by bound, and no stamp (${seenOnce.existedBy ? new Date(seenOnce.existedBy).toISOString() : 'none'})`);
  // Time passing: the bound was noted 20 minutes ago; Moon set again elsewhere 10 minutes ago.
  const bounded = JSON.stringify({ ...seenOnce, existedBy: Date.now() - 20 * 60000 });
  await remote(p, MOON_D, nowS() - 600);
  const later = await repeat('later', bounded, 'dreamith');
  check(later.seen.every((s) => s === 'in:moon'), `Moon set after the bound: Moon comes along every time: ${later.seen.join(', ')} | ${later.reasons[0]}`);
  // 5. Offline: Boca rosa, no question, no stamp written.
  await remote(p, MOON_D, moonAt);
  await setting(p, 'm11d8:relays', 'down');
  const off = await repeat('offline', adopted, null, visitsMoon);
  const after = await p.evaluate(`return localStorage.getItem('${SEL}');`);
  await setting(p, 'm11d8:relays', null);
  check(off.seen.every((s) => s === 'in:moon') && after === adopted, `offline: the device's Blobbi (Moon) every time, no question, the stored choice byte for byte unchanged: ${off.seen.join(', ')} | ${off.reasons[0]}`);
  const all = await p.events();
  check(all === 0, `no EVENT frame was ever sent, over every page load (${all})`);
} catch (e) {
  check(false, `the check stopped: ${(e as Error).message}`);
} finally {
  await p.close();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/browser-check.txt`, results.join('\n') + '\n');
  console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} PASS`);
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
}
