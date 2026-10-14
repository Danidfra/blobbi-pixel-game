// M11D.5 BROWSER CHECKS AND SCREENSHOTS (headless Chrome started MUTED by `node scripts/lab-browser.mjs start`, dev
// server on 5211). A new adventure: the birth, then the naming question; the island grows with the Baby on it (it
// stays a Baby, its shadow its own size); the account flow with the two backup cards, the Recovery Key saved as a
// real download and checked back from that file, consent and the rehearsal registration (an in-browser relay:
// nothing leaves the device), the Nostr reveal; a restore from the Recovery Key in a fresh profile; the invitation.
// Every tab is closed when the script ends, even on failure (the harness tracks them).
// Writes examples/m11d5/browser-*.png.   node scripts/m11d5-browser-shots.mjs <downloadDir>
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { open, closeAllTabs } from './m11b-browser-shots.mjs';

const OUT = 'examples/m11d5';
const DOWNLOADS = resolve(process.argv[2] ?? '.lab-downloads');
mkdirSync(DOWNLOADS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shoot(p, name) {
  const r = await p.send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/browser-${name}.png`, Buffer.from(r.data, 'base64'));
}
const idPage = (p) => p.evaluate('return window.__blobbi.identity().page;');
async function waitFor(p, expr, ms = 20000) {
  for (let i = 0; i < ms / 100; i++) {
    if (await p.evaluate(`return !!(${expr});`)) return true;
    await sleep(100);
  }
  return false;
}
const press = async (p, n, screen = 'identity') => {
  await p.evaluate(`window.__blobbi.${screen}().index = ${n};`);
  await p.key('Enter');
  await sleep(300);
};
const audit = (p) =>
  p.evaluate(`
    const ls = Object.entries(localStorage).map(([k, v]) => k + '=' + v).join('\\n');
    return {
      localStorageHasSecretLooking: /nsec1|ncryptsec|"secret"|privateKey/i.test(ls),
      guestBlobbis: JSON.parse(localStorage.getItem('blobbi-pixel-lab:guest-blobbis') || 'null'),
      audio: JSON.parse(localStorage.getItem('blobbi-pixel-lab:audio') || 'null'),
      sockets: window.__wsUrls, frames: window.__wsSent.length,
    };`);

try {
  // ── A new adventure: birth, then the naming question ───────────────────────────────────────────────────────
  {
    const p = await open(1280, 720, false, { storage: { 'blobbi-pixel-lab:locale': 'en' } });
    await p.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS });
    await sleep(600);
    await p.key('Enter'); // NEW ADVENTURE
    await sleep(200);
    await p.key('Enter'); // the turtle
    await sleep(200);
    await p.key('Enter'); // CREATE ISLAND
    await waitFor(p, '!!window.__blobbi.intro()', 15000); // the birth begins (the identity is reserved first)
    await waitFor(p, '!window.__blobbi.intro()', 90000);
    const asked = await waitFor(p, "window.__blobbi.ui().screen && window.__blobbi.ui().screen.id === 'naming'", 15000);
    console.log('naming asked after the birth:', asked);
    await sleep(800);
    await shoot(p, 'desktop-1-naming-question');
    await p.evaluate("window.__blobbi.naming().setName('Momo');");
    await press(p, 1, 'naming'); // THAT'S THE NAME!
    await sleep(500);
    await shoot(p, 'desktop-2-naming-happy');
    await press(p, 0, 'naming'); // LET'S PLAY
    await sleep(400);
    await shoot(p, 'desktop-3-momo-reacts');
    const before = await p.evaluate('const b = window.__blobbi.live().blobbi; return { stage: b.identity.stage, d: b.source.d, footRx: b.footRx, shadowRx: b.shadowRx };');
    console.log('the Baby before growth', JSON.stringify(before));
    // ── The island grows with the Baby on it ──
    for (const stage of [1, 2]) {
      await p.evaluate(`window.__blobbi.devGrow(${stage});`);
      await sleep(5500);
      const after = await p.evaluate('const l = window.__blobbi.live(); const b = l.blobbi; return { growth: l.world.growth && l.world.growth.stage, stage: b.identity.stage, d: b.source.d, footRx: b.footRx, shadowRx: b.shadowRx };');
      console.log('after growth', JSON.stringify(after));
    }
    await shoot(p, 'desktop-4-baby-after-growth');
    // The shadow up close (the closest zoom).
    await p.evaluate("window.__blobbi.camera().setMode('upclose');");
    await sleep(700);
    await shoot(p, 'desktop-5-baby-shadow-close');
    console.log('stored', JSON.stringify(await audit(p)));

    // ── The account flow: the two backups, the Recovery Key ──
    await p.evaluate("await window.__blobbi.openIdentity('activate');");
    await sleep(500);
    await shoot(p, 'desktop-6-flow-intro');
    await press(p, 0); // LET'S DO IT (named: no name page)
    console.log('after intro', await idPage(p));
    await shoot(p, 'desktop-7-flow-two-cards');
    await press(p, 0); // RECOVERY KEY
    await shoot(p, 'desktop-8-recovery-key-explained');
    await press(p, 0); // tick: I understand
    await shoot(p, 'desktop-9-recovery-key-acknowledged');
    await press(p, 1); // SAVE MY RECOVERY KEY (a real download)
    await sleep(1500);
    await shoot(p, 'desktop-10-recovery-key-offered');
    const file = readdirSync(DOWNLOADS).find((f) => f.endsWith('.nsec.txt'));
    console.log('downloaded', file);
    const text = readFileSync(join(DOWNLOADS, file), 'utf8');
    console.log('file has one nsec line:', (text.match(/nsec1[02-9ac-hj-np-z]{58}/g) || []).length === 1, 'no ncryptsec:', !/ncryptsec/.test(text));
    console.log('screen keeps no key:', !(await p.evaluate("return /nsec1/.test(JSON.stringify(window.__blobbi.identity()));")));
    await press(p, 2); // I SAVED IT: LET'S CHECK IT
    await p.evaluate(`window.__blobbi.identity().setLoaded(${JSON.stringify(text)});`);
    await shoot(p, 'desktop-11-verify-recovery-key');
    await press(p, 2); // CHECK IT
    await waitFor(p, "window.__blobbi.identity().page === 'consent'");
    await shoot(p, 'desktop-12-consent-after-check');
    console.log('before consent: frames', (await audit(p)).frames);
    await press(p, 0); // SHARE MOMO
    await waitFor(p, "window.__blobbi.identity().page === 'reveal'");
    await sleep(800);
    await shoot(p, 'desktop-13-nostr-reveal');
    console.log('after registration', JSON.stringify(await audit(p)));
    await press(p, 0);
    // The protected path's page, for the record.
    await p.evaluate("const s = window.__blobbi.identity(); s.go('password');");
    await p.evaluate("window.__blobbi.ui().open('identity');");
    await sleep(300);
    await shoot(p, 'desktop-14-protected-key-page');
    await p.key('Escape');
    // ── The invitation (forced visible for the picture; its timing is unit tested) ──
    await p.evaluate("localStorage.setItem('blobbi-pixel-lab:locale', 'es');");
    await p.close();
  }

  // ── A fresh browser: bring Momo back from the Recovery Key (no password) ──────────────────────────────────────
  {
    const p = await open(1280, 720, false, { storage: { 'blobbi-pixel-lab:locale': 'pt-BR' } });
    await p.send('Storage.clearDataForOrigin', { origin: 'http://127.0.0.1:5211', storageTypes: 'indexeddb,local_storage' });
    await p.evaluate("localStorage.setItem('blobbi-pixel-lab:locale', 'pt-BR');");
    await p.send('Page.reload');
    await sleep(3500);
    const file = readdirSync(DOWNLOADS).find((f) => f.endsWith('.nsec.txt'));
    const text = readFileSync(join(DOWNLOADS, file), 'utf8');
    await p.evaluate("await window.__blobbi.openIdentity('restore');");
    await p.evaluate(`window.__blobbi.identity().setLoaded(${JSON.stringify(text)});`);
    await sleep(300);
    await shoot(p, 'desktop-pt-BR-15-restore-recovery-key');
    await press(p, 2); // OLHAR DENTRO (no password row)
    await waitFor(p, "window.__blobbi.identity().page === 'restorePreview'");
    await shoot(p, 'desktop-pt-BR-16-restore-preview');
    await press(p, 0);
    await waitFor(p, "window.__blobbi.identity().page === 'restoreDone'");
    await sleep(600);
    await shoot(p, 'desktop-pt-BR-17-restore-done');
    console.log('restored', JSON.stringify(await audit(p)));
    await p.close();
  }

  // ── Phone screens: the two cards and the naming question; the Spanish invitation ─────────────────────────────
  {
    const p = await open(844, 390, true, { storage: { 'blobbi-pixel-lab:locale': 'es' } });
    await sleep(600);
    await p.key('Enter');
    await sleep(200);
    await p.key('Enter');
    await sleep(200);
    await p.key('Enter');
    await waitFor(p, '!!window.__blobbi.intro()', 15000); // the birth begins (the identity is reserved first)
    await waitFor(p, '!window.__blobbi.intro()', 90000);
    await waitFor(p, "window.__blobbi.ui().screen && window.__blobbi.ui().screen.id === 'naming'", 15000);
    await sleep(600);
    await shoot(p, 'phone-es-18-naming');
    await press(p, 2, 'naming'); // MÁS TARDE
    await sleep(400);
    await shoot(p, 'phone-es-19-naming-later');
    await p.evaluate("await window.__blobbi.openIdentity('activate');");
    await press(p, 0);
    await press(p, 1); // ESCRIBIR? (the name page: continue with the suggested name)
    await sleep(300);
    await shoot(p, 'phone-es-20-two-cards');
    await p.key('Escape');
    await p.evaluate('const i = window.__blobbi.invite(); i.visible = true;');
    await sleep(600);
    await shoot(p, 'phone-es-21-invitation');
    await p.close();
  }
} finally {
  await closeAllTabs();
}
