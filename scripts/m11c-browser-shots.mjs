// M11C BROWSER SCREENSHOTS: the real game in headless Chrome (desktop 1280x720, phone 844x390 and a narrow phone
// 667x375): the Guest / Connected chip, the tool hotbar (keys, clicks, taps), the ACCOUNT page opened from the chip,
// and (phase 2) MY BLOBBIS with mocked relay answers. A MOCKED NIP-07 extension; WebSocket is stubbed before any page
// code (see m11b-browser-shots.mjs), so no relay is contacted and nothing can be published.
// Needs `npx vite --port 5211` and Chrome with remote debugging on 9333. Writes examples/m11c/browser-*.png.
//   node scripts/m11c-browser-shots.mjs [scenario...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { MOCK_PUBKEY, open as openM11b } from './m11b-browser-shots.mjs';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { buildEggTags } from '@blobbi-kit/core';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = 'examples/m11c';
const TOOLS = ['simple-axe', 'simple-pickaxe', 'simple-hoe', 'watering-can', 'fishing-rod'].map((t) => `blobbi-pixel:tool:${t}`);
const ACCOUNT = (name = 'Ana Clara') => JSON.stringify({ version: 1, pubkey: MOCK_PUBKEY, method: 'nip07', connectedAt: Date.now(), profile: { name, at: Date.now() } });

async function open(W, H, mobile, opts = {}) {
  const p = await openM11b(W, H, mobile, opts);
  const shot = async (name) => {
    await sleep(600);
    const r = await p.send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/browser-${name}.png`, Buffer.from(r.data, 'base64'));
  };
  /** A finger tap at canvas-page coordinates (switches the game to touch mode). */
  const tap = async (x, y) => {
    await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(200);
  };
  if (mobile) await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  return { ...p, shot, tap };
}

/** A new island past the intro, the first chapter done, with `tools` in the bag. */
async function island(W, H, mobile, { locale = 'en', tools = TOOLS, storage = {}, nostr = false, tips = false } = {}) {
  const p = await open(W, H, mobile, { nostr, storage: { 'blobbi-pixel-lab:locale': locale, ...storage } });
  await p.key('Enter'); // BEGIN
  await sleep(300);
  await p.key('Enter'); // the turtle
  await sleep(300);
  await p.key('Enter'); // CREATE ISLAND
  await sleep(15000);
  await p.key('Escape'); // skip the rest of the intro
  await sleep(2500);
  await p.evaluate(`const l = window.__blobbi.live(); for (const id of ['meet','arrive','gather','axe','wood','materials']) l.objectives.completed[id] = 0; l.inventory.add('blobbi-pixel:material:wood', 6); l.inventory.add('blobbi-pixel:resource:stone', 5); for (const t of ${JSON.stringify(tools)}) l.inventory.add(t, 1); ${tips ? '' : 'l.setTips?.(false);'} l.save();`);
  await sleep(800);
  return p;
}

/** Where a box the game drew last frame is, in page pixels (canvas pixels scaled by the canvas's CSS size). */
const pagePoint = (p, expr) => p.evaluate(`const v = document.getElementById('view'); const r = v.getBoundingClientRect(); const b = ${expr}; if (!b) return null; const k = r.width / v.width; return { x: r.left + (b.x + b.w / 2) * k, y: r.top + (b.y + b.h / 2) * k };`);

// ── Phase 2: a FAKE relay inside the page ────────────────────────────────────
// A throwaway key made here (never the player's, never in the game) signs fixture Blobbis shaped by the kit's own
// builder; the page's WebSocket is replaced by a stub that answers a REQ with those events and EOSE, and records every
// frame the game sends (only REQ and CLOSE are expected: never an EVENT).
const TEST_SECRET = generateSecretKey();
const TEST_PUBKEY = getPublicKey(TEST_SECRET);
const fixture = (pet, name, gen, stage, at) =>
  finalizeEvent({ kind: 31124, created_at: at, content: '', tags: buildEggTags(TEST_PUBKEY, pet, at, name, { visualGeneration: gen }).map((t) => (t[0] === 'stage' ? ['stage', stage] : t)) }, TEST_SECRET);
const COLLECTION = [
  fixture('00000000a1', 'Mochi', 'v3', 'adult', 1_760_000_500),
  fixture('00000000a2', 'Pistachio', 'v3', 'adult', 1_760_000_400),
  fixture('00000000a3', 'Biscuit', 'v2', 'adult', 1_760_000_300),
  fixture('00000000a4', 'Old Friend', 'v1', 'adult', 1_760_000_200),
  fixture('00000000a5', 'Little One', 'v3', 'baby', 1_760_000_100),
  fixture('00000000a6', 'Sunny', 'v3', 'egg', 1_760_000_050),
];
/** A page script: WebSocket answers REQ with `events` (or never opens when `down`), and records frames sent. */
const relayStub = (events, down = false) => `window.__wsUrls = []; window.__wsSent = []; const EVENTS = ${JSON.stringify(events)}; const DOWN = ${down};
window.WebSocket = class { constructor(url) { window.__wsUrls.push(String(url)); this.url = String(url); this.readyState = 0; this.l = {}; setTimeout(() => { if (DOWN) { this.readyState = 3; this.emit('error', new Event('error')); this.emit('close', new CloseEvent('close')); } else { this.readyState = 1; this.emit('open', new Event('open')); } }, 20); }
  emit(t, ev) { this['on' + t]?.(ev); for (const f of this.l[t] ?? []) f(ev); }
  addEventListener(t, f) { (this.l[t] ??= []).push(f); } removeEventListener(t, f) { this.l[t] = (this.l[t] ?? []).filter((g) => g !== f); }
  send(d) { window.__wsSent.push(String(d)); const m = JSON.parse(d); if (m[0] === 'REQ') { const f = m[2] ?? {}; const out = (f.kinds ?? []).includes(31124) ? EVENTS : []; setTimeout(() => { for (const e of out) this.emit('message', new MessageEvent('message', { data: JSON.stringify(['EVENT', m[1], e]) })); this.emit('message', new MessageEvent('message', { data: JSON.stringify(['EOSE', m[1]]) })); }, 30); } }
  close() { this.readyState = 3; }
  // Instance constants too: websocket-ts compares readyState with ws.OPEN (without them it re-buffers forever).
  get CONNECTING() { return 0; } get OPEN() { return 1; } get CLOSING() { return 2; } get CLOSED() { return 3; } };
window.WebSocket.CONNECTING = 0; window.WebSocket.OPEN = 1; window.WebSocket.CLOSING = 2; window.WebSocket.CLOSED = 3;`;
const ACCOUNT_TEST = () => JSON.stringify({ version: 1, pubkey: TEST_PUBKEY, method: 'nip07', connectedAt: Date.now(), profile: { name: 'Ana Clara', at: Date.now() } });

/** An island connected as the test account, its relays answering with `events`; MY BLOBBIS opened from the chip. */
async function myBlobbis(W, H, mobile, events, { locale = 'en', down = false } = {}) {
  const p = await island(W, H, mobile, { locale, nostr: true, storage: { 'blobbi-pixel-lab:account': ACCOUNT_TEST() } });
  // No socket has opened yet (the network library loads only when MY BLOBBIS reads): the fake relay goes in now.
  await p.evaluate(relayStub(events, down));
  await p.evaluate(`window.nostr.getPublicKey = async () => (window.__nostrCalls.push('getPublicKey'), '${TEST_PUBKEY}');`);
  if (mobile) {
    const at = await pagePoint(p, '({ x: v.width * 0.6, y: v.height * 0.45, w: 0, h: 0 })');
    await p.tap(at.x, at.y);
  }
  const chip = await pagePoint(p, 'window.__blobbi.view().identityBox');
  await p.click(chip.x, chip.y);
  await sleep(300);
  await p.key('Enter'); // MY BLOBBIS (the first button when connected)
  await sleep(1500);
  return p;
}

const scenarios = {
  /** Guest and Connected HUDs (desktop, phone), the hotbar's states, and the ACCOUNT page opened from the chip. */
  async hud() {
    for (const [vp, W, H, mobile] of [['desktop', 1280, 720, false], ['phone', 844, 390, true], ['phone-narrow', 667, 375, true]]) {
      const p = await island(W, H, mobile);
      if (mobile) {
        const at = await pagePoint(p, '({ x: v.width * 0.6, y: v.height * 0.45, w: 0, h: 0 })');
        await p.tap(at.x, at.y); // a touch: touch mode on (the Blobbi walks a little)
        await sleep(600);
      }
      await p.shot(`${vp}-guest-hotbar-empty-hands`);
      if (mobile) {
        const slot = await pagePoint(p, `(() => { const ui = window.__blobbi.ui(); const h = ui.regions.filter((r) => !r.inert && ui.hotbarBox && r.y >= ui.hotbarBox.y && r.y < ui.hotbarBox.y + ui.hotbarBox.h); return h[2]; })()`);
        await p.tap(slot.x, slot.y); // the third slot: the hoe
        await p.shot(`${vp}-hotbar-tap-slot-3`);
      } else {
        await p.key('Digit1');
        await p.shot(`${vp}-hotbar-key-1`);
        await p.key('Digit3');
        await p.shot(`${vp}-hotbar-key-3`);
        await p.key('KeyQ');
        await p.shot(`${vp}-hotbar-q`);
        await p.key('Digit4');
        await p.key('Digit4'); // the tool in hand again: put away
        await p.shot(`${vp}-hotbar-put-away`);
        console.log(vp, 'equipped after 4,4:', await p.evaluate('return window.__blobbi.live().equipped'));
      }
      const chip = await pagePoint(p, 'window.__blobbi.view().identityBox');
      if (mobile) await p.tap(chip.x, chip.y);
      else await p.click(chip.x, chip.y);
      await sleep(400);
      await p.shot(`${vp}-account-from-chip-guest`);
      await p.close();
    }
    for (const [vp, W, H, mobile] of [['desktop', 1280, 720, false], ['phone', 844, 390, true]]) {
      const p = await island(W, H, mobile, { nostr: true, storage: { 'blobbi-pixel-lab:account': ACCOUNT() }, tools: TOOLS.slice(0, 3) });
      await p.key('Digit2');
      await p.shot(`${vp}-connected-hotbar-3-tools`);
      const chip = await pagePoint(p, 'window.__blobbi.view().identityBox');
      await p.click(chip.x, chip.y);
      await sleep(400);
      await p.shot(`${vp}-account-from-chip-connected`);
      console.log(vp, 'extension calls:', JSON.stringify(await p.evaluate('return window.__nostrCalls')), 'frames sent:', JSON.stringify(await p.evaluate('return window.__wsSent')));
      await p.close();
    }
  },
  /** A tip card and a long prompt with the hotbar on a narrow phone (they must not overlap). */
  async tips() {
    const p = await island(667, 375, true, { locale: 'pt-BR', tips: true });
    const at = await pagePoint(p, '({ x: v.width * 0.6, y: v.height * 0.45, w: 0, h: 0 })');
    await p.tap(at.x, at.y);
    await sleep(800);
    await p.shot('phone-narrow-tip-and-hotbar-pt-BR');
    await p.close();
  },
  /** Portuguese and Spanish: the longer words in the chip, the hotbar label and the ACCOUNT page (phone). */
  async languages() {
    for (const locale of ['pt-BR', 'es']) {
      const p = await island(667, 375, true, { locale, nostr: true, storage: { 'blobbi-pixel-lab:account': ACCOUNT() } });
      const at = await pagePoint(p, '({ x: v.width * 0.6, y: v.height * 0.45, w: 0, h: 0 })');
      await p.tap(at.x, at.y);
      await p.key('Digit5');
      await p.shot(`phone-narrow-hud-${locale}`);
      const chip = await pagePoint(p, 'window.__blobbi.view().identityBox');
      await p.tap(chip.x, chip.y);
      await sleep(400);
      await p.shot(`phone-narrow-account-${locale}`);
      await p.close();
      const d = await island(1280, 720, false, { locale });
      await d.key('Digit5');
      await d.shot(`desktop-hud-${locale}`);
      await d.close();
    }
  },
};

Object.assign(scenarios, {
  /** MY BLOBBIS: a collection (V3 adults, V2, V1, a baby, an egg), choosing one, empty, relays down; desktop and phone. */
  async blobbis() {
    for (const [vp, W, H, mobile] of [['desktop', 1280, 720, false], ['phone', 844, 390, true]]) {
      const p = await myBlobbis(W, H, mobile, COLLECTION);
      await p.shot(`${vp}-my-blobbis`);
      await p.key('ArrowDown');
      await p.key('ArrowDown');
      await p.shot(`${vp}-my-blobbis-v2-notice`);
      await p.key('ArrowDown');
      await p.shot(`${vp}-my-blobbis-v1-notice`);
      await p.key('ArrowDown');
      await p.shot(`${vp}-my-blobbis-baby`);
      await p.key('ArrowUp');
      await p.key('ArrowUp');
      await p.key('ArrowUp');
      await p.key('ArrowUp');
      await p.key('Enter'); // bring Mochi
      await p.shot(`${vp}-my-blobbis-chosen`);
      await p.key('Escape');
      await sleep(800);
      await p.shot(`${vp}-hud-with-canonical-blobbi`);
      const sel = await p.evaluate("return localStorage.getItem('blobbi-pixel-lab:selected-blobbi')");
      const sent = await p.evaluate('return window.__wsSent');
      console.log(vp, 'selection:', sel);
      console.log(vp, 'frames sent:', JSON.stringify(sent.map((f) => JSON.parse(f)[0])), 'any EVENT sent:', sent.some((f) => JSON.parse(f)[0] === 'EVENT'));
      console.log(vp, 'extension calls:', JSON.stringify(await p.evaluate('return window.__nostrCalls')));
      const saves = await p.evaluate("return Object.keys(localStorage).filter((k) => k.includes('save')).map((k) => [k, localStorage.getItem(k).includes('" + TEST_PUBKEY + "')])");
      console.log(vp, 'island saves mention the Blobbi owner:', JSON.stringify(saves));
      await p.close();
    }
    const empty = await myBlobbis(1280, 720, false, []);
    await empty.shot('desktop-my-blobbis-empty');
    await empty.close();
    const emptyPhone = await myBlobbis(667, 375, true, [], { locale: 'pt-BR' });
    await emptyPhone.shot('phone-narrow-my-blobbis-empty-pt-BR');
    await emptyPhone.close();
    const down = await myBlobbis(1280, 720, false, COLLECTION, { down: true });
    await sleep(8000);
    await down.shot('desktop-my-blobbis-relays-down');
    await down.close();
    const es = await myBlobbis(667, 375, true, COLLECTION, { locale: 'es' });
    await es.key('ArrowDown');
    await es.key('ArrowDown');
    await es.shot('phone-narrow-my-blobbis-v2-notice-es');
    await es.close();
  },
});

export { open, island, pagePoint, scenarios, ACCOUNT, sleep, myBlobbis, COLLECTION, relayStub, TEST_PUBKEY };

if (import.meta.url === `file://${process.argv[1]}`) {
  const wanted = process.argv.slice(2);
  for (const name of wanted.length ? wanted : Object.keys(scenarios)) {
    console.log('scenario', name);
    await scenarios[name]();
  }
}
