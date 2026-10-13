// M11D.1 BROWSER SCREENSHOTS: Baby Blobbis in the real game, headless Chrome (desktop 1280x720, phone 844x390).
// MY BLOBBIS with a V3 Baby, a V1 Baby, an adult and an egg (a FAKE relay inside the page, fixtures signed by a
// throwaway key made by the M11C harness: see m11c-browser-shots.mjs); choosing the Baby; the Baby on the island at
// several camera sizes, walking (the hop) with a tool, the rod; disconnecting (the visitor walks) and connecting
// again (the Baby comes back); a reload. Nothing is published: every frame the page sends is logged.
// Needs `npx vite --port 5211` and Chrome with remote debugging on 9333. Writes examples/m11d1/browser-*.png.
//   node scripts/m11d1-browser-shots.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { fixture, myBlobbis, sleep, TEST_PUBKEY } from './m11c-browser-shots.mjs';

const OUT = 'examples/m11d1';
const COLLECTION = [
  fixture('00000000b1', 'Little Bean', 'v3', 'baby', 1_760_000_600),
  fixture('00000000b2', 'Mochi', 'v3', 'adult', 1_760_000_500),
  fixture('00000000b3', 'Old Bean', 'v1', 'baby', 1_760_000_400),
  fixture('00000000b4', 'Sunny', 'v3', 'egg', 1_760_000_300),
];

async function shoot(p, name) {
  await sleep(600);
  const r = await p.send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/browser-${name}.png`, Buffer.from(r.data, 'base64'));
}

/** Hold a key for `ms` and take a screenshot while it is still held. */
async function holdAndShoot(p, code, ms, name) {
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code });
  await sleep(ms);
  const r = await p.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/browser-${name}.png`, Buffer.from(r.data, 'base64'));
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code });
  await sleep(300);
}

const walker = (p) => p.evaluate('const b = window.__blobbi.live().blobbi; return { seed: b.seed.slice(0, 12), stage: b.identity.stage, foot: [b.footRx, b.footRy] };');

for (const [vp, W, H, mobile] of [['desktop', 1280, 720, false], ['phone', 844, 390, true]]) {
  const p = await myBlobbis(W, H, mobile, COLLECTION);
  await shoot(p, `${vp}-my-blobbis-v3-baby`);
  await p.key('ArrowDown');
  await p.key('ArrowDown');
  await shoot(p, `${vp}-my-blobbis-v1-baby`);
  await p.key('ArrowDown');
  await shoot(p, `${vp}-my-blobbis-egg`);
  await p.key('ArrowUp');
  await p.key('ArrowUp');
  await p.key('ArrowUp');
  console.log(vp, 'before choosing:', JSON.stringify(await walker(p)));
  await p.key('Enter'); // bring Little Bean
  await shoot(p, `${vp}-my-blobbis-baby-chosen`);
  await p.key('Escape');
  await sleep(800);
  console.log(vp, 'after choosing:', JSON.stringify(await walker(p)), 'record:', await p.evaluate("return localStorage.getItem('blobbi-pixel-lab:selected-blobbi')"));
  await shoot(p, `${vp}-baby-on-island`);
  if (!mobile) {
    await p.key('Digit1'); // the axe
    await holdAndShoot(p, 'ArrowLeft', 700, `${vp}-baby-walking-axe`);
    await p.key('KeyZ'); // closer
    await sleep(800);
    await holdAndShoot(p, 'ArrowRight', 500, `${vp}-baby-close-walking-axe`);
    await holdAndShoot(p, 'ArrowDown', 300, `${vp}-baby-close-front-axe`);
    await p.key('Digit5'); // the rod
    await shoot(p, `${vp}-baby-close-rod`);
    await p.key('KeyZ');
    await sleep(800);
    await shoot(p, `${vp}-baby-upclose-rod`);
    await p.key('Digit3'); // the hoe
    await holdAndShoot(p, 'ArrowUp', 300, `${vp}-baby-upclose-back-hoe`);
  }
  // Disconnect: the visitor walks; connect again: the Baby comes back (choice kept beside the island).
  await p.evaluate('window.__blobbi.account().disconnect()');
  await sleep(600);
  console.log(vp, 'after disconnect:', JSON.stringify(await walker(p)));
  await shoot(p, `${vp}-disconnected-visitor-walks`);
  await p.evaluate('await window.__blobbi.account().connect()');
  await sleep(1500);
  console.log(vp, 'after connecting again:', JSON.stringify(await walker(p)));
  const sent = await p.evaluate('return window.__wsSent');
  console.log(vp, 'frames sent:', JSON.stringify([...new Set(sent.map((f) => JSON.parse(f)[0]))]), 'any EVENT sent:', sent.some((f) => JSON.parse(f)[0] === 'EVENT'));
  console.log(vp, 'extension calls:', JSON.stringify(await p.evaluate('return window.__nostrCalls')));
  const saves = await p.evaluate("return Object.keys(localStorage).filter((k) => k.includes('save')).map((k) => [k, localStorage.getItem(k).includes('" + TEST_PUBKEY + "'), localStorage.getItem(k).includes('baby')])");
  console.log(vp, 'island saves mention the owner / a baby:', JSON.stringify(saves));
  if (!mobile) {
    await p.send('Page.reload');
    await sleep(4000);
    await p.key('Enter'); // CONTINUE
    await sleep(3000);
    console.log(vp, 'after reload:', JSON.stringify(await walker(p)));
    await shoot(p, `${vp}-after-reload`);
  }
  await p.close();
}
