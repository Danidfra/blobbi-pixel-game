// M11D.3 BROWSER SCREENSHOTS: the main menu, a first adventure with the egg's birth, the safe return to the menu,
// the "A new adventure?" confirmation, a second island (with the Blobbi kept), the island list, the quick arrival of
// a Blobbi on an island it knows, and LOGIN WITH NOSTR (no extension; a MOCKED extension). Headless Chrome, desktop
// 1280x720 and a phone 844x390 in Portuguese. WebSocket is stubbed (no relay), nothing can be published.
// Needs `npx vite --port 5211` and Chrome with remote debugging on 9333. Writes examples/m11d3/browser-*.png.
//   node scripts/m11d3-browser-shots.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { open } from './m11b-browser-shots.mjs';

const OUT = 'examples/m11d3';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shoot(p, name) {
  const r = await p.send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/browser-${name}.png`, Buffer.from(r.data, 'base64'));
}
const titleState = (p) => p.evaluate('const t = window.__blobbi.title(); return { active: t.active, page: t.page, items: t.items().map((i) => i.label) };');
const walker = (p) => p.evaluate("const l = window.__blobbi.live(); return { island: l.identity.slice(0, 26), seed: l.blobbi.seed, stage: l.blobbi.identity.stage, presence: l.teleport.state, pace: l.teleport.pace, egg: l.egg };");
const records = (p) => p.evaluate("return { local: localStorage.getItem('blobbi-pixel-lab:local-blobbis'), visits: localStorage.getItem('blobbi-pixel-lab:island-visits'), selection: localStorage.getItem('blobbi-pixel-lab:selected-blobbi'), saves: Object.keys(localStorage).filter((k) => k.includes(':save:')).length };");
/** Wait until the intro cinematic reaches cinematic time `t` (seconds), then shoot. */
async function introAt(p, t, name) {
  for (let i = 0; i < 400; i++) {
    const e = await p.evaluate('const i = window.__blobbi.intro(); return i ? i.elapsed : -1;');
    if (e < 0 || e >= t) break;
    await sleep(100);
  }
  await shoot(p, name);
}
/** Choose a title row by its label. */
async function choose(p, label) {
  const s = await titleState(p);
  const i = s.items.indexOf(label);
  if (i < 0) throw new Error(`no ${label} in ${s.items.join(', ')}`);
  await p.evaluate(`window.__blobbi.title().index = ${i};`);
  await p.key('Enter');
  await sleep(250);
}

// ── Desktop, English: a whole first adventure, then a second one, the islands, the menu ──────────────────
{
  const p = await open(1280, 720, false, { storage: { 'blobbi-pixel-lab:locale': 'en' } });
  await sleep(800);
  await shoot(p, 'desktop-welcome');
  console.log('welcome', JSON.stringify(await titleState(p)));
  await choose(p, 'NEW ADVENTURE');
  await p.key('Enter'); // the turtle
  await sleep(300);
  await choose(p, 'CREATE ISLAND'); // no Blobbi yet: a new one is met (an egg)
  await sleep(1500);
  const timing = await p.evaluate('const t = window.__blobbi.intro().timing; return { arrival: t.arrival, egg: t.egg, looks: t.looks, happy: t.happy, end: t.end };');
  console.log('birth timing', JSON.stringify(timing));
  console.log('during the intro', JSON.stringify(await walker(p)), JSON.stringify(await records(p)));
  await introAt(p, timing.arrival + 1.2, 'desktop-birth-1-egg-materialising');
  await introAt(p, timing.egg.rock + 0.7, 'desktop-birth-2-egg-rocking');
  await introAt(p, timing.egg.cracks[1] + 0.3, 'desktop-birth-3-cracks');
  await introAt(p, timing.egg.hatch + 0.15, 'desktop-birth-4-hatch');
  await introAt(p, timing.looks[0] + 0.4, 'desktop-birth-5-looks-around');
  await introAt(p, timing.happy + 0.6, 'desktop-birth-6-hello');
  await introAt(p, timing.end + 1, 'desktop-birth-7-play');
  await sleep(1500);
  console.log('after the birth', JSON.stringify(await walker(p)), JSON.stringify(await records(p)));
  await shoot(p, 'desktop-playing-with-the-new-baby');
  // SETTINGS > MAIN MENU: the island is saved and the title comes back.
  await p.key('Escape');
  await sleep(300);
  const rows = await p.evaluate("return window.__blobbi.ui().screen.rows(window.__blobbi.ui()).map((r) => r.label);");
  await p.evaluate(`window.__blobbi.ui().screen.index = ${rows.length - 1};`);
  await shoot(p, 'desktop-settings-main-menu');
  await p.key('Enter');
  await sleep(800);
  console.log('main menu', JSON.stringify(await titleState(p)));
  await shoot(p, 'desktop-main-menu');
  await choose(p, 'NEW ADVENTURE');
  await shoot(p, 'desktop-new-adventure-confirm');
  await choose(p, 'BACK TO MY ISLAND');
  await choose(p, 'NEW ADVENTURE');
  await choose(p, 'START A NEW ADVENTURE');
  await p.key('ArrowRight'); // the manta
  await p.key('Enter');
  await sleep(300);
  await choose(p, 'CREATE ISLAND');
  await shoot(p, 'desktop-who-lives-here');
  console.log('companion', JSON.stringify(await titleState(p)));
  await choose(p, 'CONTINUE WITH YOUR BABY BLOBBI');
  await sleep(2500);
  await p.key('Escape'); // skip this intro (no birth: the Baby was born already)
  await sleep(4500);
  console.log('second island', JSON.stringify(await walker(p)), JSON.stringify(await records(p)));
  await shoot(p, 'desktop-second-island');
  // Back to the menu; CONTINUE ADVENTURE now chooses between the two islands.
  await p.key('Escape');
  await sleep(300);
  const rows2 = await p.evaluate("return window.__blobbi.ui().screen.rows(window.__blobbi.ui()).map((r) => r.label);");
  await p.evaluate(`window.__blobbi.ui().screen.index = ${rows2.length - 1};`);
  await p.key('Enter');
  await sleep(800);
  await choose(p, 'CONTINUE ADVENTURE');
  await sleep(300);
  await shoot(p, 'desktop-choose-island');
  console.log('islands', JSON.stringify(await titleState(p)));
  await p.key('ArrowDown');
  await p.key('Enter'); // the first island again: the Baby has been there, a quick arrival
  await sleep(400);
  console.log('back on the first island', JSON.stringify(await walker(p)));
  await sleep(700);
  await shoot(p, 'desktop-quick-arrival');
  await sleep(2500);
  console.log('arrived', JSON.stringify(await walker(p)), JSON.stringify(await records(p)));
  console.log('sockets', JSON.stringify(await p.evaluate('return window.__wsSent')));
  console.log('secret-looking', await p.evaluate("return Object.values(localStorage).some((v) => /nsec1|ncryptsec|secret|private/i.test(v))"));
  await p.close();
}

// ── LOGIN WITH NOSTR: without an extension, then with a mocked one ───────────────────────────────────────
{
  const p = await open(1280, 720, false, { storage: { 'blobbi-pixel-lab:locale': 'en' } });
  await sleep(800);
  await choose(p, 'LOGIN WITH NOSTR');
  await shoot(p, 'desktop-login-no-extension');
  await p.close();
  const q = await open(1280, 720, false, { nostr: true, storage: { 'blobbi-pixel-lab:locale': 'en' } });
  await sleep(800);
  await choose(q, 'LOGIN WITH NOSTR');
  await shoot(q, 'desktop-login-connect');
  await choose(q, 'CONNECT');
  await sleep(1500);
  await shoot(q, 'desktop-login-connected-choices');
  console.log('login', JSON.stringify(await titleState(q)), JSON.stringify(await q.evaluate('return window.__nostrCalls')));
  await q.close();
}

// ── Phone, Portuguese: the welcome, and the confirmation copy ────────────────────────────────────────────
{
  const p = await open(844, 390, true, { storage: { 'blobbi-pixel-lab:locale': 'pt-BR' } });
  await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await sleep(800);
  await shoot(p, 'phone-pt-BR-welcome');
  await choose(p, 'NOVA AVENTURA');
  await p.key('Enter');
  await sleep(300);
  await choose(p, 'CRIAR ILHA');
  await sleep(2000);
  await p.key('Escape'); // skip the birth
  await sleep(4500);
  console.log('phone after skipping the birth', JSON.stringify(await walker(p)), JSON.stringify(await records(p)));
  await p.key('Escape');
  await sleep(300);
  const rows = await p.evaluate("return window.__blobbi.ui().screen.rows(window.__blobbi.ui()).map((r) => r.label);");
  await p.evaluate(`window.__blobbi.ui().screen.index = ${rows.length - 1};`);
  await p.key('Enter');
  await sleep(800);
  await shoot(p, 'phone-pt-BR-main-menu');
  await choose(p, 'NOVA AVENTURA');
  await shoot(p, 'phone-pt-BR-new-adventure-confirm');
  await p.close();
}
