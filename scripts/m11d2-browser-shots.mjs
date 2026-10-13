// M11D.2 BROWSER SCREENSHOTS: world forms, departure and arrival, Baby particles and tools, in the real game
// (headless Chrome, desktop 1280x720 and phone 844x390). MY BLOBBIS with a V1 Baby, a V2 Adult, a V3 Baby and a V3
// Adult from a FAKE relay inside the page (fixtures signed by the M11C harness's throwaway key); the "new form"
// explanation in three languages; TRY THIS FORM; the swap animation frame by frame; NOT NOW; disconnecting (the visitor
// arrives). Nothing is published: every frame the page sends, every extension call and every stored key is logged.
// Needs `npx vite --port 5211` and Chrome with remote debugging on 9333. Writes examples/m11d2/browser-*.png.
//   node scripts/m11d2-browser-shots.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { fixture, myBlobbis, sleep } from './m11c-browser-shots.mjs';

const OUT = 'examples/m11d2';
const COLLECTION = [
  fixture('00000000d1', 'Old Bean', 'v1', 'baby', 1_760_000_600),
  fixture('00000000d2', 'Biscuit', 'v2', 'adult', 1_760_000_500),
  fixture('00000000d3', 'Little Bean', 'v3', 'baby', 1_760_000_400),
  fixture('00000000d4', 'Mochi', 'v3', 'adult', 1_760_000_300),
];

async function shoot(p, name) {
  const r = await p.send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/browser-${name}.png`, Buffer.from(r.data, 'base64'));
}
const walker = (p) => p.evaluate('const l = window.__blobbi.live(); const b = l.blobbi; return { seed: b.seed.slice(0, 40), stage: b.identity.stage, presence: l.teleport.state, swap: l.swap ? l.swap.phase : null, view: b.animator.pose(l.clock.time).view, x: Math.round(b.x), y: Math.round(b.y) };');

for (const [vp, W, H, mobile, locale] of [['desktop', 1280, 720, false, 'en'], ['phone', 844, 390, true, 'en'], ['phone-pt-BR', 844, 390, true, 'pt-BR'], ['phone-es', 844, 390, true, 'es']]) {
  const p = await myBlobbis(W, H, mobile, COLLECTION, { locale });
  await sleep(600);
  await shoot(p, `${vp}-my-blobbis-v1-baby-world-form`);
  await p.key('Enter'); // the V1 Baby: the new form is explained first
  await sleep(500);
  await shoot(p, `${vp}-world-form-explained`);
  if (vp !== 'desktop') {
    await p.close();
    continue;
  }
  await p.key('Backspace'); // NOT NOW
  await sleep(300);
  console.log(vp, 'after NOT NOW:', JSON.stringify(await walker(p)));
  await p.key('Enter');
  await sleep(300);
  await p.key('Enter'); // TRY THIS FORM
  await sleep(300);
  await shoot(p, `${vp}-world-form-chosen`);
  await p.key('KeyZ'); // menus capture keys: closing first
  await p.key('Escape');
  await p.key('KeyZ'); // close-up, to see the effect large
  // The swap plays now that the world runs again: frames through departure and arrival.
  for (const [ms, name] of [[300, 'swap-1-facing-player'], [900, 'swap-2-dissolving'], [1500, 'swap-3-gone'], [1500, 'swap-4-arriving'], [1200, 'swap-5-rebuilt'], [1200, 'swap-6-arrived']]) {
    await sleep(ms);
    await shoot(p, `${vp}-${name}`);
    console.log(vp, name, JSON.stringify(await walker(p)));
  }
  await sleep(800);
  await p.key('KeyH'); // pet: hearts rise from the Baby's own head
  await sleep(250);
  await shoot(p, `${vp}-world-form-baby-pet-hearts`);
  await p.key('Digit1');
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'ArrowDown', key: 'ArrowDown' });
  await sleep(250);
  await shoot(p, `${vp}-world-form-baby-axe-front`);
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ArrowDown', key: 'ArrowDown' });
  await p.key('Digit5');
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'ArrowLeft', key: 'ArrowLeft' });
  await sleep(250);
  await shoot(p, `${vp}-world-form-baby-rod-side`);
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ArrowLeft', key: 'ArrowLeft' });
  // The V2 Adult: the explanation again (another Blobbi), then its arrival as an adult world form.
  const chip = await p.evaluate("const v = document.getElementById('view'); const r = v.getBoundingClientRect(); const b = window.__blobbi.view().identityBox; const k = r.width / v.width; return { x: r.left + (b.x + b.w / 2) * k, y: r.top + (b.y + b.h / 2) * k };");
  await p.click(chip.x, chip.y);
  await sleep(300);
  await p.key('Enter'); // MY BLOBBIS
  await sleep(1200);
  await p.key('ArrowDown');
  await p.key('Enter');
  await sleep(300);
  await shoot(p, `${vp}-world-form-explained-v2-adult`);
  await p.key('Enter'); // TRY THIS FORM
  await p.key('Escape');
  await sleep(1900);
  await shoot(p, `${vp}-swap-baby-leaving`);
  await sleep(4800);
  await shoot(p, `${vp}-v2-adult-world-form-arrived`);
  console.log(vp, 'v2 adult:', JSON.stringify(await walker(p)));
  await p.key('KeyH');
  await sleep(250);
  await shoot(p, `${vp}-adult-pet-hearts`);
  // Disconnect: the visitor arrives the same way.
  await p.evaluate('window.__blobbi.account().disconnect()');
  await sleep(1300);
  await shoot(p, `${vp}-disconnect-leaving`);
  await sleep(6000);
  console.log(vp, 'after disconnect:', JSON.stringify(await walker(p)));
  await shoot(p, `${vp}-disconnect-visitor-arrived`);
  const sent = await p.evaluate('return window.__wsSent');
  console.log(vp, 'frames sent:', JSON.stringify([...new Set(sent.map((f) => JSON.parse(f)[0]))]), 'any EVENT:', sent.some((f) => JSON.parse(f)[0] === 'EVENT'));
  console.log(vp, 'extension calls:', JSON.stringify(await p.evaluate('return window.__nostrCalls')));
  console.log(vp, 'stored keys:', JSON.stringify(await p.evaluate('return Object.keys(localStorage).sort()')));
  console.log(vp, 'anything secret-looking stored:', await p.evaluate("return Object.values(localStorage).some((v) => /nsec1|ncryptsec|secret|private/i.test(v))"));
  console.log(vp, 'selection:', await p.evaluate("return localStorage.getItem('blobbi-pixel-lab:selected-blobbi')"));
  console.log(vp, 'world forms:', await p.evaluate("return localStorage.getItem('blobbi-pixel-lab:world-forms')"));
  const saves = await p.evaluate("return Object.keys(localStorage).filter((k) => k.includes(':save:')).map((k) => /world-form|00000000d/.test(localStorage.getItem(k)))");
  console.log(vp, 'island saves mention a Blobbi:', JSON.stringify(saves));
  await p.close();
}
