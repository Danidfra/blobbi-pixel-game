// M11C BROWSER SCREENSHOTS: the real game in headless Chrome (desktop 1280x720, phone 844x390 and a narrow phone
// 667x375): the Guest / Connected chip, the tool hotbar (keys, clicks, taps), the ACCOUNT page opened from the chip,
// and (phase 2) MY BLOBBIS with mocked relay answers. A MOCKED NIP-07 extension; WebSocket is stubbed before any page
// code (see m11b-browser-shots.mjs), so no relay is contacted and nothing can be published.
// Needs `npx vite --port 5211` and Chrome with remote debugging on 9333. Writes examples/m11c/browser-*.png.
//   node scripts/m11c-browser-shots.mjs [scenario...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { MOCK_PUBKEY, open as openM11b } from './m11b-browser-shots.mjs';

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

export { open, island, pagePoint, scenarios, ACCOUNT, sleep };

if (import.meta.url === `file://${process.argv[1]}`) {
  const wanted = process.argv.slice(2);
  for (const name of wanted.length ? wanted : Object.keys(scenarios)) {
    console.log('scenario', name);
    await scenarios[name]();
  }
}
