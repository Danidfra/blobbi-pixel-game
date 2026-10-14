// M11D.6 BROWSER CHECKS AND SCREENSHOTS (headless Chrome started MUTED by `node scripts/lab-browser.mjs start`, dev
// server on 5211, practice mode: every WebSocket is a stub, nothing reaches a relay).
//   A  (desktop, EN)  a new Blobbi, its Recovery Key checked back, consent (the discoverability words), the practice
//                     run: PRACTICE COMPLETE (never "shared"), the Blobbi untouched (no departure or arrival), the
//                     account not switched; SETTINGS > ACCOUNT says where it stands
//   C  (desktop, ES)  islands exist: restore from the Recovery Key, CONTINUE WITH <name> leads to the islands page
//   B  (PT-BR)        a fresh profile, no island: restore, "<name> voltou!" with the Blobbi itself, CONTINUAR COM
//                     <name>: straight into a new adventure, the restored Blobbi offered first (desktop and phone)
// Every tab is closed when the script ends, even on failure.   node scripts/m11d6-browser-shots.mjs <downloadDir>
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { open, closeAllTabs } from './m11b-browser-shots.mjs';

const OUT = 'examples/m11d6';
const DOWNLOADS = resolve(process.argv[2] ?? '.lab-downloads');
mkdirSync(DOWNLOADS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shoot(p, name) {
  await sleep(400);
  const r = await p.send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/browser-${name}.png`, Buffer.from(r.data, 'base64'));
}
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
const page = (p) => p.evaluate('return window.__blobbi.identity().page;');
const titlePage = (p) => p.evaluate('return { active: window.__blobbi.title().active, page: window.__blobbi.title().page, restored: window.__blobbi.title().restoredName };');
/** The Recovery Key file this run downloaded (the newest; older ones were removed at the start). */
const recoveryText = () => {
  const files = readdirSync(DOWNLOADS).filter((f) => f.endsWith('.nsec.txt')).map((f) => join(DOWNLOADS, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return readFileSync(files[0], 'utf8');
};
const results = [];
const check = (ok, what) => (results.push(`${ok ? 'PASS' : 'FAIL'}  ${what}`), console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`));

try {
  for (const f of readdirSync(DOWNLOADS)) if (f.endsWith('.nsec.txt')) rmSync(join(DOWNLOADS, f)); // disposable test keys of earlier runs
  // ── A: a new Blobbi, its backup, the practice run ────────────────────────────────────────────────────────────
  {
    const p = await open(1280, 720, false, { storage: { 'blobbi-pixel-lab:locale': 'en' } });
    await p.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS });
    await sleep(600);
    await p.key('Enter'); // NEW ADVENTURE
    await sleep(200);
    await p.key('Enter'); // the Carrier
    await sleep(200);
    await p.key('Enter'); // CREATE ISLAND
    await waitFor(p, '!!window.__blobbi.intro()', 15000);
    await waitFor(p, '!window.__blobbi.intro()', 90000);
    await waitFor(p, "window.__blobbi.ui().screen && window.__blobbi.ui().screen.id === 'naming'", 15000);
    await p.evaluate("window.__blobbi.naming().setName('Momo');");
    await press(p, 1, 'naming'); // THAT'S THE NAME!
    await press(p, 0, 'naming'); // LET'S PLAY
    await p.evaluate("await window.__blobbi.openIdentity('activate');");
    await press(p, 0); // LET'S DO IT
    await sleep(300);
    check((await page(p)) === 'choose', 'a named Blobbi without a checked backup goes to the two backups');
    await press(p, 0); // RECOVERY KEY
    await press(p, 0); // I understand
    await press(p, 1); // SAVE MY RECOVERY KEY
    await sleep(1500);
    await press(p, 2); // I SAVED IT: LET'S CHECK IT
    await p.evaluate(`window.__blobbi.identity().setLoaded(${JSON.stringify(recoveryText())});`);
    await press(p, 2); // CHECK IT
    await waitFor(p, "window.__blobbi.identity().page === 'consent'");
    await shoot(p, 'desktop-1-consent-discoverable');
    const before = await p.evaluate('const b = window.__blobbi.live().blobbi; return { seed: b.seed, d: b.source.d, stage: b.identity.stage, x: b.x, y: b.y };');
    await press(p, 0); // SHARE MOMO (practice: nothing leaves the page)
    await waitFor(p, "window.__blobbi.identity().page === 'reveal'");
    await sleep(800);
    await shoot(p, 'desktop-2-practice-complete');
    const after = await p.evaluate(`const l = window.__blobbi.live(); const b = l.blobbi; const g = JSON.parse(localStorage.getItem('blobbi-pixel-lab:guest-blobbis')).blobbis.find((x) => x.d === b.source.d);
      return { seed: b.seed, d: b.source.d, stage: b.identity.stage, x: b.x, y: b.y, swap: l.swap, presence: l.getPresenceState(), activatedAt: g.activatedAt, practicedAt: g.practicedAt, account: window.__blobbi.account().snapshot().status, frames: window.__wsSent.length, sockets: window.__wsUrls.filter((u) => !u.includes('127.0.0.1:5211')).length };`);
    console.log('after practice', JSON.stringify(after));
    check(after.seed === before.seed && after.d === before.d && after.stage === 'baby' && after.x === before.x && after.y === before.y, 'the same Blobbi, in place, still a Baby');
    check(after.swap === null && after.presence === 'present', 'no departure, no arrival');
    check(after.activatedAt === null && typeof after.practicedAt === 'number', 'practice marks it practiced, never registered');
    check(after.account !== 'connected', 'practice does not switch the account');
    check(after.sockets === 0, 'no socket to any relay (only the dev server\'s own)');
    await press(p, 0); // WONDERFUL
    await p.evaluate("const ui = window.__blobbi.ui(); ui.open('settings'); ui.screen.showPage('account');");
    await sleep(2500); // the status is asked of the identity service
    await p.evaluate("window.__blobbi.ui().screen.index = 0;");
    await shoot(p, 'desktop-3-account-status-practiced');
    await p.key('Escape');

    // ── C: islands exist; restore (the identity is already here), CONTINUE WITH MOMO: the islands page ──
    await p.evaluate("localStorage.setItem('blobbi-pixel-lab:locale', 'es');");
    await p.send('Page.reload');
    await sleep(3500);
    await p.evaluate("await window.__blobbi.openIdentity('restore');");
    await p.evaluate(`window.__blobbi.identity().setLoaded(${JSON.stringify(recoveryText())});`);
    await press(p, 2); // LOOK INSIDE
    await waitFor(p, "window.__blobbi.identity().page === 'restorePreview'");
    await press(p, 0); // RESTORE
    await waitFor(p, "window.__blobbi.identity().page === 'restoreDone'");
    await sleep(600);
    await shoot(p, 'desktop-es-4-restore-done-with-islands');
    await press(p, 0); // SEGUIR CON MOMO
    await sleep(500);
    const c = await titlePage(p);
    check(c.active && c.page === 'islands' && c.restored === 'Momo', `with islands, CONTINUE leads to the islands page (${JSON.stringify(c)})`);
    await shoot(p, 'desktop-es-5-islands-after-restore');
    await p.close();
  }

  // ── B: a fresh profile with no island: restore, then straight into a new adventure with the restored Blobbi ──
  {
    const p = await open(1280, 720, false, { storage: { 'blobbi-pixel-lab:locale': 'pt-BR' } });
    await p.send('Storage.clearDataForOrigin', { origin: 'http://127.0.0.1:5211', storageTypes: 'indexeddb,local_storage' });
    await p.evaluate("localStorage.setItem('blobbi-pixel-lab:locale', 'pt-BR');");
    await p.send('Page.reload');
    await sleep(3500);
    await p.evaluate("await window.__blobbi.openIdentity('restore');");
    await p.evaluate(`window.__blobbi.identity().setLoaded(${JSON.stringify(recoveryText())});`);
    await press(p, 2);
    await waitFor(p, "window.__blobbi.identity().page === 'restorePreview'");
    await press(p, 0);
    await waitFor(p, "window.__blobbi.identity().page === 'restoreDone'");
    await sleep(600);
    await shoot(p, 'desktop-pt-BR-6-restore-done-no-island');
    await p.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
    await sleep(800);
    await shoot(p, 'phone-pt-BR-7-restore-done');
    await p.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await sleep(500);
    const before = await p.evaluate("return JSON.parse(localStorage.getItem('blobbi-pixel-lab:guest-blobbis'));");
    await press(p, 0); // CONTINUAR COM MOMO
    await sleep(500);
    const t = await titlePage(p);
    check(t.active && t.page === 'carrier' && t.restored === 'Momo', `no island: straight into a new adventure (${JSON.stringify(t)})`);
    await shoot(p, 'desktop-pt-BR-8-new-adventure-carrier');
    await p.key('Enter'); // the Carrier
    await sleep(300);
    await p.key('Enter'); // CREATE ISLAND (name page): on to who lives there
    await sleep(300);
    const comp = await p.evaluate('const t = window.__blobbi.title(); return { page: t.page, pending: t.pendingCreate };');
    check(comp.page === 'companion' && comp.pending === null, 'the companion is asked; no island made by itself');
    await shoot(p, 'desktop-pt-BR-9-continue-with-momo-first');
    const g = before.blobbis[0];
    const src = await p.evaluate('const b = window.__blobbi.live().blobbi; return { d: b.source.d, stage: b.identity.stage };');
    check(src.d === g.d && src.stage === 'baby' && g.name === 'Momo', 'the restored Blobbi is the one chosen: same d, a Baby, its name');
    const ls = await p.evaluate('return Object.entries(localStorage).map(([k, v]) => k + "=" + v).join("\\n");');
    check(!/nsec1|ncryptsec|"secret"|privateKey/i.test(ls), 'nothing secret-looking in localStorage');
    await p.close();
  }
} finally {
  await closeAllTabs();
  writeFileSync(`${OUT}/browser-checks.txt`, results.join('\n') + '\n');
}
