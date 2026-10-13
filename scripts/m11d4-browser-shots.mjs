// M11D.4 BROWSER CHECKS AND SCREENSHOTS: a Blobbi's true beginning in the real game (headless Chrome, dev server on
// 5211, CDP on 9333). A new adventure as a guest: the identity reserved in the real IndexedDB vault, the egg and the
// Baby from it; the account flow (benefits, name, password, the backup file, checking it by loading it back, consent,
// registration in REHEARSAL mode: an in-browser relay, nothing leaves the device, then the Nostr reveal); restoring
// the backup in a fresh browser profile; the owner question with a MOCKED extension. Every check of storage is
// logged: no plaintext secret in localStorage, the vault's wrapping key not extractable, the records sealed.
// Writes examples/m11d4/browser-*.png.   node scripts/m11d4-browser-shots.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { open } from './m11b-browser-shots.mjs';

const OUT = 'examples/m11d4';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shoot(p, name) {
  const r = await p.send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/browser-${name}.png`, Buffer.from(r.data, 'base64'));
}
const page = (p) => p.evaluate('const s = window.__blobbi.identity(); return s.page;');
async function waitPage(p, want, ms = 20000) {
  for (let i = 0; i < ms / 100; i++) {
    if ((await page(p)) === want) return true;
    await sleep(100);
  }
  return false;
}
/** Press the identity screen's n-th enabled button. */
const press = async (p, n) => {
  await p.evaluate(`window.__blobbi.identity().index = ${n};`);
  await p.key('Enter');
  await sleep(300);
};
const storageAudit = (p) =>
  p.evaluate(`
    const ls = Object.entries(localStorage).map(([k, v]) => k + '=' + v).join('\\n');
    // Never create the vault database by looking: only open it when it already exists.
    const exists = (await indexedDB.databases()).some((d) => d.name === 'blobbi-pixel-vault');
    const db = exists ? await new Promise((res) => { const r = indexedDB.open('blobbi-pixel-vault'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }) : null;
    const stores = db ? [...db.objectStoreNames] : [];
    let records = [], key = null;
    if (db && stores.includes('keys')) {
      records = await new Promise((res) => { const tx = db.transaction('keys'); const q = tx.objectStore('keys').getAll(); q.onsuccess = () => res(q.result); });
      key = await new Promise((res) => { const tx = db.transaction('meta'); const q = tx.objectStore('meta').get('wrap'); q.onsuccess = () => res(q.result); });
    }
    return {
      localStorageHasSecretLooking: /nsec1|ncryptsec|"secret"|privateKey/i.test(ls),
      vaultRecords: records.map((r) => ({ pubkey: r.pubkey.slice(0, 12), sealedBytes: r.data.length, origin: r.origin, backupVerified: !!r.backupVerifiedAt })),
      wrappingKey: key ? { type: key.type, extractable: key.extractable, algorithm: key.algorithm.name, usages: key.usages } : null,
      guestBlobbis: JSON.parse(localStorage.getItem('blobbi-pixel-lab:guest-blobbis') || 'null'),
      selection: JSON.parse(localStorage.getItem('blobbi-pixel-lab:selected-blobbi') || 'null'),
      account: JSON.parse(localStorage.getItem('blobbi-pixel-lab:account') || 'null'),
      activation: Object.values((JSON.parse(localStorage.getItem('blobbi-pixel-lab:activation') || '{"runs":{}}').runs)).map((r) => ({ stage: r.stage, mode: r.mode, kinds: [r.blobbi && r.blobbi.kind, r.profile && r.profile.kind] })),
    };`);

let backupText = null;
// ── A guest's new adventure, the birth, and the whole account flow ──────────────────────────────────────────────
{
  const p = await open(1280, 720, false, { storage: { 'blobbi-pixel-lab:locale': 'en' } });
  // A broken vault database left by an earlier run (stores missing) is repaired by the game itself; start clean anyway.
  await sleep(600);
  await p.key('Enter'); // NEW ADVENTURE
  await sleep(200);
  await p.key('Enter'); // the turtle
  await sleep(200);
  await p.key('Enter'); // CREATE ISLAND
  await p.key('Enter'); // a second press (the M11D.3 bug): must not skip the birth
  await sleep(2500);
  const birth = await p.evaluate('const i = window.__blobbi.intro(); return i ? { birth: i.birth, elapsed: i.elapsed, egg: i.timing.egg } : null;');
  console.log('intro after a double press', JSON.stringify(birth));
  const walker = await p.evaluate('const b = window.__blobbi.live().blobbi; return { kind: b.source.kind, d: b.source.d, seed: b.seed.slice(0, 16), stage: b.identity.stage };');
  console.log('the new Blobbi', JSON.stringify(walker));
  for (let i = 0; i < 400; i++) {
    const e = await p.evaluate('const i = window.__blobbi.intro(); return i ? i.elapsed : -1;');
    if (e < 0 || e >= birth.egg.rock + 0.6) break;
    await sleep(100);
  }
  await shoot(p, 'desktop-birth-egg-from-reserved-identity');
  for (let i = 0; i < 600; i++) {
    if (!(await p.evaluate('return !!window.__blobbi.intro();'))) break;
    await sleep(100);
  }
  await sleep(1500);
  console.log('after birth', JSON.stringify(await storageAudit(p)));
  await shoot(p, 'desktop-playing-with-reserved-baby');
  // SETTINGS > ACCOUNT: "Save <name> for other worlds"
  await p.key('Escape');
  await sleep(300);
  await p.evaluate("window.__blobbi.ui().screen.showPage('account');");
  await sleep(300);
  await shoot(p, 'desktop-account-page-guest');
  await p.evaluate("await window.__blobbi.openIdentity('activate');");
  await sleep(400);
  await shoot(p, 'desktop-flow-1-benefits');
  await press(p, 0); // LET'S DO IT
  await p.evaluate("window.__blobbi.identity().setField('name', 'Mochi');");
  await shoot(p, 'desktop-flow-2-name');
  await press(p, 1); // CONTINUE
  await p.evaluate("const s = window.__blobbi.identity(); s.setField('password', 'bubbles and stars'); s.setField('password2', 'bubbles and stars');");
  await shoot(p, 'desktop-flow-3-secret-backup');
  await press(p, 2); // CREATE MY BACKUP
  await waitPage(p, 'save');
  backupText = await p.evaluate('return window.__blobbi.identity().backupFile.text;');
  await shoot(p, 'desktop-flow-4-backup-ready');
  await press(p, 0); // SAVE THE BACKUP FILE (offered to the browser)
  await shoot(p, 'desktop-flow-5-backup-offered');
  await press(p, 2); // I SAVED IT: LET'S CHECK IT
  await p.evaluate(`const s = window.__blobbi.identity(); s.setLoaded(${JSON.stringify(backupText)}); s.setField('backupPassword', 'not the password');`);
  await press(p, 3); // CHECK IT (wrong password)
  await sleep(1500);
  await shoot(p, 'desktop-flow-6-check-wrong-password');
  await p.evaluate("window.__blobbi.identity().setField('backupPassword', 'bubbles and stars');");
  await press(p, 3);
  await waitPage(p, 'consent');
  await shoot(p, 'desktop-flow-7-consent');
  console.log('before consent', JSON.stringify((await storageAudit(p)).activation));
  await press(p, 0); // SHARE MOCHI
  await waitPage(p, 'reveal');
  await shoot(p, 'desktop-flow-8-nostr-reveal');
  const audit = await storageAudit(p);
  console.log('after registration', JSON.stringify(audit));
  console.log('sockets opened', JSON.stringify(await p.evaluate('return window.__wsUrls')), 'frames', JSON.stringify(await p.evaluate('return window.__wsSent.map((f) => JSON.parse(f)[0])')));
  console.log('the same Blobbi in place', JSON.stringify(await p.evaluate('const l = window.__blobbi.live(); return { d: l.blobbi.source.d, presence: l.teleport.state, swap: l.swap };')));
  await press(p, 0); // WONDERFUL!
  await sleep(500);
  await shoot(p, 'desktop-after-registration');
  await p.close();
}

// ── A fresh browser: bring the Blobbi back from its backup ─────────────────────────────────────────────────────
{
  const p = await open(1280, 720, false, { storage: { 'blobbi-pixel-lab:locale': 'pt-BR' } });
  // A truly fresh browser: the vault (IndexedDB) wiped too, not only localStorage.
  await p.send('Storage.clearDataForOrigin', { origin: 'http://127.0.0.1:5211', storageTypes: 'indexeddb,local_storage' });
  await p.evaluate("localStorage.setItem('blobbi-pixel-lab:locale', 'pt-BR');");
  await p.send('Page.reload');
  await sleep(3500);
  console.log('fresh vault before restore', JSON.stringify((await storageAudit(p)).vaultRecords));
  await p.evaluate("await window.__blobbi.openIdentity('restore');");
  await sleep(300);
  await shoot(p, 'desktop-pt-BR-restore');
  await p.evaluate(`const s = window.__blobbi.identity(); s.setLoaded(${JSON.stringify(backupText)}); s.setField('backupPassword', 'bubbles and stars');`);
  await press(p, 3); // LOOK INSIDE
  await waitPage(p, 'restorePreview');
  await shoot(p, 'desktop-pt-BR-restore-preview');
  console.log('preview stored nothing', JSON.stringify((await storageAudit(p)).vaultRecords));
  await press(p, 0); // RESTORE
  await waitPage(p, 'restoreDone');
  await shoot(p, 'desktop-pt-BR-restore-done');
  console.log('restored', JSON.stringify(await storageAudit(p)));
  await p.close();
}

// ── Connected with a (mocked) extension: whose new Blobbi? ───────────────────────────────────────────────────────
{
  const p = await open(1280, 720, false, { nostr: true, storage: { 'blobbi-pixel-lab:locale': 'es', 'blobbi-pixel-lab:account': JSON.stringify({ version: 1, pubkey: '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e', method: 'nip07', connectedAt: 1, profile: { name: 'Ana', at: 1 } }) } });
  await sleep(600);
  await p.key('Enter'); // NUEVA AVENTURA
  await sleep(200);
  await p.key('Enter');
  await sleep(200);
  await p.key('Enter'); // CREAR ISLA
  await sleep(300);
  await shoot(p, 'desktop-es-whose-blobbi');
  console.log('owner page', JSON.stringify(await p.evaluate('const t = window.__blobbi.title(); return { page: t.page, items: t.items().map((i) => i.label) };')));
  await p.close();
}
