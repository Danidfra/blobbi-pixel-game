// M11D.8.3 BROWSER CHECK: smart Blobbi selection, end to end through the real page (`main.ts`), fully offline.
//
// Needs the dev server on 5245 (`npx vite --port 5245 --strictPort --host 127.0.0.1`) and the MUTED lab browser on
// 9333 with its own scratch profile (`node scripts/lab-browser.mjs start <profileDir>`). A DISPOSABLE key, its Boca rosa
// (V3 Baby) and Moon (V3 adult) are made and signed here; Blobbonaut profiles (kind 11125, Standalone's and Ditto's
// shape) naming one of them are signed WHEN the check needs them, at the time it needs (localStorage `m11d83:profile`
// holds the event the stub relays answer with). Every WebSocket is a stub that answers a REQ by kind and records every
// frame: any EVENT the page tried to send would show. "Time passing" between choices is simulated by moving the
// device's own choice stamp back (`selectedAt`, in the page's localStorage): no real waiting, no fake remote times
// in the future. Screenshots: examples/m11d8-3-selection/.
//   npx tsx scripts/m11d8-3-selection-browser.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nsecEncode } from 'nostr-tools/nip19';
import { buildEggTags, getCanonicalBlobbiD, getCanonicalBlobbonautD } from '@blobbi-kit/core';
import { babyStateTemplate } from '../src/nostr/canonical-events';

const PORT = 5245;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = 'examples/m11d8-3-selection';
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
const DOWN = SETTING('m11d8:relays', 'up') === 'down'; const DELAY = Number(SETTING('m11d8:delay', '30')); const PROFILE = (() => { try { return JSON.parse(SETTING('m11d83:profile', 'null')); } catch { return null; } })();
window.WebSocket = class { constructor(url) { window.__wsUrls.push(String(url)); this.url = String(url); this.readyState = 0; this.l = {}; setTimeout(() => { if (DOWN) { this.readyState = 3; this.emit('error', new Event('error')); this.emit('close', new CloseEvent('close')); } else { this.readyState = 1; this.emit('open', new Event('open')); } }, 20); }
  emit(t, ev) { this['on' + t]?.(ev); for (const f of this.l[t] ?? []) f(ev); }
  addEventListener(t, f) { (this.l[t] ??= []).push(f); } removeEventListener(t, f) { this.l[t] = (this.l[t] ?? []).filter((g) => g !== f); }
  send(d) { window.__wsSent.push(String(d)); const m = JSON.parse(d); if (m[0] === 'REQ') { const f = m[2] ?? {}; const kinds = f.kinds ?? []; const out = kinds.includes(31124) ? BLOBBIS : kinds.includes(11125) && PROFILE ? [PROFILE] : []; setTimeout(() => { for (const e of out) this.emit('message', new MessageEvent('message', { data: JSON.stringify(['EVENT', m[1], e]) })); this.emit('message', new MessageEvent('message', { data: JSON.stringify(['EOSE', m[1]]) })); }, DELAY); } }
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

const where = (p: Tab) => p.evaluate("const t = window.__blobbi.title(); const l = window.__blobbi.live(); return { title: t.active, page: t.page, island: l ? l.identity : null, seed: l ? l.blobbi.seed : null, name: l ? (l.blobbi.name ?? null) : null, intro: !!window.__blobbi.intro(), account: window.__blobbi.account().snapshot().status, loading: window.__blobbi.entry().active };");
/** Wait for the automatic entry to settle (it reads the relays for at most a few seconds). */
const settle = (p: Tab) => p.waitFor("!window.__blobbi.title().active || ['switch', 'arrived', 'islands'].includes(window.__blobbi.title().page)", 9000);
const SEL = 'blobbi-pixel-lab:selected-blobbi';
/** The device's stored choice, as the page keeps it. */
const localChoice = (p: Tab) => p.evaluate(`const r = JSON.parse(localStorage.getItem('${SEL}') ?? 'null'); return r ? { seed: r.source.seed, at: r.selectedAt ?? null, by: r.selectedBy ?? null } : null;`);
/** Simulate time passing since the device's choice: move its stamp back by `minutes` (nothing else changes). */
const backdateLocal = (p: Tab, minutes: number) => p.evaluate(`const r = JSON.parse(localStorage.getItem('${SEL}')); r.selectedAt = Date.now() - ${minutes} * 60000; localStorage.setItem('${SEL}', JSON.stringify(r));`);
/** A choice made before M11D.8.3: no stamp at all. */
const stripLocalStamp = (p: Tab) => p.evaluate(`const r = JSON.parse(localStorage.getItem('${SEL}')); delete r.selectedAt; delete r.selectedBy; localStorage.setItem('${SEL}', JSON.stringify(r));`);
const remote = (p: Tab, d: string | null, atSeconds: number) => setting(p, 'm11d83:profile', d ? JSON.stringify(profile(d, atSeconds)) : null);
const worldSave = (p: Tab, island: string) => p.evaluate(`const s = JSON.parse(localStorage.getItem('blobbi-pixel-lab:save:v1:' + ${JSON.stringify(island)}) ?? 'null'); return s ? JSON.stringify({ version: s.version, world: s.world, buildings: s.buildings, plots: s.plots, interiors: s.interiors, containers: s.containers, objectives: s.objectives }) : null;`);
const nowS = () => Math.floor(Date.now() / 1000);

const p = await tab();
try {
  // ── Setup: restore the disposable identity (Boca rosa and Moon are found), make Dewy Shell with Boca rosa ──
  await fresh(p);
  await remote(p, null, 0);
  await p.load();
  await p.evaluate("await window.__blobbi.openIdentity('restore');");
  await p.evaluate(`window.__blobbi.identity().setLoaded(${JSON.stringify(nsec)});`);
  await p.evaluate("window.__blobbi.identity().index = 2; window.__blobbi.ui().handleKey('Enter');");
  await p.waitFor("window.__blobbi.identity().page === 'restorePreview'");
  await p.evaluate("window.__blobbi.ui().handleKey('Enter');");
  await p.waitFor("window.__blobbi.identity().page === 'restoreDone' && window.__blobbi.identity().search && window.__blobbi.identity().search.status !== 'looking'");
  await p.evaluate("window.__blobbi.ui().handleKey('Enter');"); // CONTINUE WITH BOCA ROSA
  await sleep(400);
  await p.evaluate("const t = window.__blobbi.title(); t.chooseCarrier(0); t.key('Enter');");
  await sleep(300);
  await p.evaluate("window.__blobbi.title().key('Enter');"); // CONTINUE WITH BOCA ROSA (companion page)
  await p.waitFor('!!window.__blobbi.intro()', 15000);
  for (let i = 0; i < 60 && (await p.evaluate('return !!window.__blobbi.intro();')); i++) {
    await p.evaluate('window.__blobbi.intro() && window.__blobbi.intro().requestSkip && window.__blobbi.intro().requestSkip();');
    await sleep(1000);
  }
  await p.waitFor('!window.__blobbi.title().active && !window.__blobbi.intro()', 20000);
  await sleep(1500);
  const made = await where(p);
  const island = made.island!;
  const bocaSeed = made.seed;
  const choice0 = await localChoice(p);
  check(!made.title && !!island && choice0?.by === 'player' && typeof choice0.at === 'number', `setup: Dewy Shell with Boca rosa, playing; the choice is the player's, stamped (${JSON.stringify(choice0)})`);
  const saveBefore = await worldSave(p, island);

  // ── 1-4. Boca rosa chosen here 20 min ago; Moon chosen in another app 10 min ago; reload: Moon comes along ──
  await backdateLocal(p, 20);
  const remoteA = nowS() - 600;
  await remote(p, MOON_D, remoteA);
  await p.load();
  await settle(p);
  const a = await where(p);
  const choiceA = await localChoice(p);
  check(!a.title && a.island === island && a.seed !== bocaSeed && !a.loading, `A. the newer remote choice: Moon comes along, no question, same island (${JSON.stringify(a)})`);
  check(choiceA?.by === 'remote' && choiceA.at === remoteA * 1000, `A. the device's choice is now Moon, stamped with the REMOTE choice's own time, not now (${JSON.stringify(choiceA)})`);
  const moonSeed = a.seed;
  await p.shoot('A-moon-came-along');
  // A reload with nothing changed: the same Blobbi, straight in, the stamp untouched (D).
  await p.load();
  await settle(p);
  const d = await where(p);
  check(!d.title && d.seed === moonSeed && JSON.stringify(await localChoice(p)) === JSON.stringify(choiceA), `D. a reload: Moon again, straight in, the stamp unchanged (${JSON.stringify(await localChoice(p))})`);
  const saveAfter = await worldSave(p, island);
  const differing = saveBefore && saveAfter ? Object.keys(JSON.parse(saveBefore)).filter((k) => JSON.stringify(JSON.parse(saveBefore)[k]) !== JSON.stringify(JSON.parse(saveAfter)[k])) : ['(no save)'];
  check(saveBefore !== null && saveBefore === saveAfter, `the island's buildings, plots, rooms, containers and quests are exactly as before the visitor changed (the bag changes only by play)${differing.length ? `: differs in ${differing.join(', ')}` : ''}`);

  // ── 5-7. Boca rosa chosen here, explicitly (MY BLOBBIS); reload: Boca rosa stays ──
  await p.evaluate("window.__blobbi.ui().open('blobbis');");
  await p.waitFor("window.__blobbi.ui().screen && window.__blobbi.account().blobbis().status === 'ready'", 10000);
  await p.evaluate("const ui = window.__blobbi.ui(); const items = window.__blobbi.account().blobbis().items; ui.screen.index = items.findIndex((b) => b.name === 'Boca rosa'); ui.handleKey('Enter');");
  await sleep(500);
  const choiceB = await localChoice(p);
  check(choiceB?.seed === bocaSeed && choiceB.by === 'player' && choiceB.at! > choiceA!.at!, `B. Boca rosa chosen here: the player's choice, stamped now (${JSON.stringify(choiceB)})`);
  await p.evaluate("window.__blobbi.ui().close();");
  await sleep(2500);
  await p.load();
  await settle(p);
  const b = await where(p);
  check(!b.title && b.seed === bocaSeed && b.island === island, `B. a reload: the local choice is newer than the remote one: Boca rosa stays, no question (${JSON.stringify(b)})`);

  // ── 8-10. Moon chosen again in another app, later: Moon is preferred again ──
  await backdateLocal(p, 20);
  await remote(p, MOON_D, nowS() - 60);
  await p.load();
  await settle(p);
  const e = await where(p);
  check(!e.title && e.seed === moonSeed, `E. a newer remote choice again: Moon comes along again, no question (${JSON.stringify(e)})`);

  // ── Ambiguity keeps the question: a future-dated remote choice; a near-equal one; a choice with no stamp ──
  await p.evaluate("window.__blobbi.ui().open('blobbis');");
  await p.waitFor("window.__blobbi.ui().screen && window.__blobbi.account().blobbis().status === 'ready'", 10000);
  await p.evaluate("const ui = window.__blobbi.ui(); const items = window.__blobbi.account().blobbis().items; ui.screen.index = items.findIndex((b) => b.name === 'Boca rosa'); ui.handleKey('Enter'); ui.close();");
  await sleep(2500);
  await remote(p, MOON_D, nowS() + 3600);
  await p.load();
  await settle(p);
  const future = await where(p);
  check(future.title && future.page === 'switch', `a remote choice dated in the future: cannot be ordered, "who comes along?" (${JSON.stringify(future)})`);
  await p.shoot('ambiguous-who-comes-along');
  await p.evaluate("const t = window.__blobbi.title(); t.index = 1; t.key('Enter');"); // CONTINUE WITH BOCA ROSA
  await sleep(1500);
  const stayed = await where(p);
  const choiceS = await localChoice(p);
  check(!stayed.title && stayed.seed === bocaSeed && choiceS?.by === 'player', `CONTINUE WITH: in with Boca rosa; the choice is stamped as the player's (${JSON.stringify(choiceS)})`);
  await p.load();
  await settle(p);
  const again = await where(p);
  check(!again.title && again.seed === bocaSeed, `a reload: the remembered answer holds, no question (${JSON.stringify(again)})`);
  // Near-equal times (the same minute): asked. Companion sync: the choice above was made over the future-dated profile
  // (`over`), which no older profile can override (choice order v1, rule 6a), and relays would keep that newer one
  // anyway; so, as for the unstamped case below, the record is made to say it was chosen without seeing a profile.
  await p.evaluate(`const r = JSON.parse(localStorage.getItem('${SEL}')); delete r.over; localStorage.setItem('${SEL}', JSON.stringify(r));`);
  await remote(p, MOON_D, Math.floor(choiceS!.at! / 1000) + 10);
  await setting(p, 'blobbi-pixel-lab:entry-choice', null);
  await p.load();
  await settle(p);
  const near = await where(p);
  check(near.title && near.page === 'switch', `two choices within the same minute: "who comes along?" (${JSON.stringify(near)})`);
  // A choice made before M11D.8.3 (no stamp) against an older remote choice: asked, never assumed old.
  await p.evaluate("const t = window.__blobbi.title(); t.index = 1; t.key('Enter');");
  await sleep(1000);
  await stripLocalStamp(p);
  await setting(p, 'blobbi-pixel-lab:entry-choice', null);
  await remote(p, MOON_D, nowS() - 86400);
  await p.load();
  await settle(p);
  const legacy = await where(p);
  check(legacy.title && legacy.page === 'switch', `a choice with no stamp (before M11D.8.3) and a remote choice from yesterday: still asked (${JSON.stringify(legacy)})`);
  await p.evaluate("const t = window.__blobbi.title(); t.index = 0; t.key('Enter');"); // BRING MOON
  await sleep(1500);
  const brought = await where(p);
  check(!brought.title && brought.seed === moonSeed && (await localChoice(p))?.by === 'player', `BRING MOON: in with Moon, the player's choice, stamped (${JSON.stringify(await localChoice(p))})`);

  // ── Offline: the device's choice, no question ──
  await setting(p, 'm11d8:relays', 'down');
  await p.load();
  await settle(p);
  const off = await where(p);
  check(!off.title && off.seed === moonSeed, `offline: in with the device's choice (${JSON.stringify(off)})`);
  await setting(p, 'm11d8:relays', null);
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
