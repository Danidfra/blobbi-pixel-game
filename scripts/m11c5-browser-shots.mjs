// M11C.5 BROWSER SCREENSHOTS: the account invitation card on a desktop, a phone and a narrow phone, in English,
// Portuguese and Spanish, and the ACCOUNT page EXPLORE ACCOUNTS opens. The engagement is set up through the dev
// handle (ten minutes of active play would make the run long): the active-time counter, a pet and the first quests.
// Needs `npx vite --port 5211` and Chrome with remote debugging on 9333. Writes examples/m11c5/browser-*.png.
import { mkdirSync, renameSync, existsSync } from 'node:fs';
import { island, pagePoint, sleep } from './m11c-browser-shots.mjs';

async function engagedIsland(W, H, mobile, locale) {
  const p = await island(W, H, mobile, { locale, tools: ['blobbi-pixel:tool:simple-axe'] });
  if (mobile) {
    const at = await pagePoint(p, '({ x: v.width * 0.6, y: v.height * 0.45, w: 0, h: 0 })');
    await p.tap(at.x, at.y);
  }
  await p.evaluate(`const l = window.__blobbi.live(); l.pet(); for (const id of ['meet','arrive','gather']) l.objectives.completed[id] ??= 0; window.__blobbi.invite().record.activeSeconds = 601;`);
  await p.key('KeyW'); // a key: the player is active
  await sleep(5000); // the pet bubble and any notice pass first
  return p;
}

const shot = async (p, name) => {
  await p.shot(`_m11c5-${name}`);
  mkdirSync('examples/m11c5', { recursive: true });
  renameSync(`examples/m11c/browser-_m11c5-${name}.png`, `examples/m11c5/browser-${name}.png`);
};

for (const [vp, W, H, mobile, locale] of [['desktop', 1280, 720, false, 'en'], ['phone', 844, 390, true, 'en'], ['phone-narrow', 667, 375, true, 'pt-BR'], ['desktop', 1280, 720, false, 'es'], ['phone-narrow', 667, 375, true, 'es']]) {
  const p = await engagedIsland(W, H, mobile, locale);
  const visible = await p.evaluate('return window.__blobbi.invite().visible');
  console.log(vp, locale, 'invite visible:', visible, 'box:', JSON.stringify(await p.evaluate('return window.__blobbi.ui().inviteBox')));
  await shot(p, `${vp}-invite-${locale}`);
  if (locale === 'en') {
    const box = await p.evaluate('return window.__blobbi.ui().inviteBox');
    const btn = await pagePoint(p, `(() => { const ui = window.__blobbi.ui(); const b = ui.inviteBox; const rs = ui.regions.filter((r) => !r.inert && r.x >= b.x && r.y >= b.y && r.x < b.x + b.w && r.y < b.y + b.h); const later = rs.reduce((a, c) => (c.x > a.x ? c : a)); return rs.filter((r) => r.y === later.y && r !== later).reduce((a, c) => (c.x < a.x ? c : a)); })()`);
    if (mobile) await p.tap(btn.x, btn.y);
    else await p.click(btn.x, btn.y);
    await sleep(400);
    await shot(p, `${vp}-invite-explore-opens-account`);
    console.log(vp, 'after explore:', await p.evaluate('return [window.__blobbi.ui().screen?.id, window.__nostrCalls ?? null, window.__wsUrls.length, localStorage.getItem("blobbi-pixel-lab:account-invite")]'));
    void box;
  }
  await p.close();
}
