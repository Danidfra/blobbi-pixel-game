// TOUCH HINT BROWSER CHECK (P1.1): the joystick hint through the real page (`main.ts`) on emulated phones, with real
// touch events (CDP), fully offline. On a phone held sideways, a new player sees the resting stick bottom left before
// any touch, its knob nudging; a drag from it walks the Blobbi with the ordinary stick, the hint steps aside, then
// fades and is remembered; it comes back gently after a while without moving, without nudging again; a reload keeps
// it learned; reduced motion never nudges; a cancelled touch, a lost focus or a menu opening never leave the stick
// held; nothing scrolls; it keeps clear of the menus on small and large phones and inside the safe area; a computer
// without touch sees none of it and its keys still walk.
//
// Starts its own dev server (5251) and the MUTED lab browser (scripts/lab-browser.mjs, its own scratch profile), and
// stops both. Screenshots go to $OUT (default: a scratch directory under the system temp dir).
//   npx tsx scripts/touch-hint-browser.ts
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5251;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = process.env.OUT ?? mkdtempSync(join(tmpdir(), 'blobbi-touch-hint-'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: string[] = [];
const check = (ok: boolean, what: string) => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${what}`;
  results.push(line);
  console.log(line);
};

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(ORIGIN)).ok) break;
  } catch {
    /* not up yet */
  }
  await sleep(200);
}
const profile = mkdtempSync(join(tmpdir(), 'blobbi-lab-profile-'));
execFileSync('node', ['scripts/lab-browser.mjs', 'start', profile], { stdio: 'inherit' });

const muted = `try { localStorage.setItem('blobbi-pixel-lab:audio', JSON.stringify({ master: 0, music: 0, sfx: 0, ambient: 0, muted: true, musicOn: false, reduced: false })); localStorage.setItem('blobbi-pixel-lab:locale', 'en'); } catch {}`;
const noNet = `window.WebSocket = class { constructor() { setTimeout(() => this.onerror && this.onerror(new Event('error')), 10); } send() {} close() {} addEventListener() {} removeEventListener() {} };`;

type Reply = { result?: { result?: { value?: unknown }; data?: string } };
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const evaluate = async (body: string): Promise<any> => (await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shoot = async (name: string) => {
  await sleep(200);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result!.data!, 'base64'));
};
const waitFor = async (expr: string, ms = 15000) => {
  for (let i = 0; i < ms / 100; i++) {
    if (await evaluate(`try { return !!(${expr}); } catch { return false; }`)) return true;
    await sleep(100);
  }
  return false;
};

const phone = async (width: number, height: number, dpr: number) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  // What a phone's media queries say (the lab browser on a computer says hover / fine otherwise).
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }, { name: 'any-hover', value: 'none' }, { name: 'any-pointer', value: 'coarse' }] });
};
const computer = async () => {
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'hover' }, { name: 'pointer', value: 'fine' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
};

/** A fresh browser (no save, no settings) on the title, then straight into a new island, the naming step taken. */
const freshPlay = async (opts: { clear?: boolean; reduced?: boolean } = {}) => {
  await send('Page.navigate', { url: `${ORIGIN}/` });
  await waitFor('window.__blobbi && window.__blobbi.title()');
  if (opts.clear !== false) {
    await send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'indexeddb,local_storage' });
    if (opts.reduced) await evaluate(`localStorage.setItem('blobbi-pixel-lab:settings', JSON.stringify({ reducedMotion: true, reducedMotionChosen: true }));`);
    await send('Page.navigate', { url: `${ORIGIN}/` });
    await waitFor('window.__blobbi && window.__blobbi.title()');
  }
  await sleep(800);
  if (await evaluate('return window.__blobbi.title().active;')) {
    await evaluate("const t = window.__blobbi.title(); if (t.page === 'main' || t.page === 'menu') { if (t.newAdventure) t.newAdventure(); } ");
    await evaluate("const t = window.__blobbi.title(); if (t.chooseCarrier) t.chooseCarrier(0); t.key('Enter');");
    await sleep(300);
    if (await evaluate("return window.__blobbi.title().page === 'name';")) await evaluate("window.__blobbi.title().key('Enter');");
    await sleep(300);
    if (await evaluate("return window.__blobbi.title().page === 'companion';")) await evaluate("window.__blobbi.title().key('Enter');");
  }
  await waitFor('!!window.__blobbi.intro() || !window.__blobbi.title().active', 15000);
  for (let i = 0; i < 60 && (await evaluate('return !!window.__blobbi.intro();')); i++) {
    await evaluate('window.__blobbi.intro() && window.__blobbi.intro().requestSkip && window.__blobbi.intro().requestSkip();');
    await sleep(1000);
  }
  const ok = await waitFor('!window.__blobbi.title().active && !window.__blobbi.intro() && window.__blobbi.live()', 20000);
  await sleep(1200);
  for (let i = 0; i < 3 && (await evaluate("const u = window.__blobbi.ui(); return u.screen && u.screen.id === 'naming';")); i++) {
    await evaluate("window.__blobbi.ui().handleKey('Enter');");
    await sleep(400);
  }
  await waitFor('!window.__blobbi.ui().capturing', 5000);
  await sleep(400);
  return ok;
};

/** Canvas pixels → CSS pixels of the page (the canvas fills its box, so a ratio each way). */
const toCss = async (x: number, y: number): Promise<{ x: number; y: number }> => evaluate(`const v = document.getElementById('view'); const r = v.getBoundingClientRect(); return { x: r.left + ${x} * r.width / v.width, y: r.top + ${y} * r.height / v.height };`);
const hintAt = (): Promise<{ x: number; y: number; r: number } | null> => evaluate('return window.__blobbi.hintAt();');
const blobbiAt = (): Promise<{ x: number; y: number }> => evaluate('const b = window.__blobbi.live().blobbi; return { x: b.x, y: b.y };');
const touchStart = (x: number, y: number) => send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
const touchMove = (x: number, y: number) => send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
const touchEnd = () => send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const touchCancel = () => send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
/** Put a finger down at (x, y) and slide it by (dx, dy) in a few moves, leaving it down. */
const press = async (x: number, y: number, dx: number, dy: number) => {
  await touchStart(x, y);
  for (let i = 1; i <= 6; i++) {
    await touchMove(x + (dx * i) / 6, y + (dy * i) / 6);
    await sleep(25);
  }
};
/** Overlaps between the hint's box and what the screen already shows bottom left (should be none). */
const overlaps = (): Promise<string[]> =>
  evaluate(`const at = window.__blobbi.hintAt(); if (!at) return ['no hint']; const u = window.__blobbi.ui(); const r = at.r; const boxes = [...u.occupied, window.__blobbi.view().indicatorBox].filter(Boolean); const v = document.getElementById('view'); const out = []; for (const b of boxes) if (at.x - r - 2 < b.x + b.w && b.x < at.x + r + 2 && at.y - r - 2 < b.y + b.h && b.y < at.y + r + 2) out.push(JSON.stringify(b)); if (at.x - r < 0 || at.y + r > v.height) out.push('off screen'); return out;`);

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: muted });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: noNet });

  // ── A phone held sideways (Pixel-like, 915×412 at 2.625), a player who never walked with the stick ──
  await phone(915, 412, 2.625);
  check(await freshPlay(), 'setup: a guest plays on a new island on a phone');
  check((await evaluate('return window.__blobbi.touch().enabled;')) === true, 'a touch screen is in touch mode before its first touch');
  check((await evaluate('return window.__blobbi.ui().touchMode;')) === true, 'the menus and tips speak touch from the start (no WASD in the first tip)');
  const at0 = await hintAt();
  check(!!at0, `the joystick hint is drawn before any touch (${JSON.stringify(at0)})`);
  const canvasH = await evaluate("return document.getElementById('view').height;");
  check(!!at0 && at0.x < 160 && at0.y > canvasH / 2, `it rests near the bottom-left corner (${JSON.stringify(at0)}, canvas height ${canvasH})`);
  check((await overlaps()).length === 0, `it covers nothing already on screen there (${await overlaps()})`);
  check((await evaluate('return window.__blobbi.joystickHint().demoing(false) && !window.__blobbi.joystickHint().learned;')) === true, 'a new player sees the knob nudge (the demonstration is on)');
  await sleep(2200);
  await shoot('1-phone-hint-new-player');
  check((await evaluate('return window.__blobbi.joystickHint().level;')) > 0.9, 'it has faded in to its full (translucent) look');
  check((await evaluate("return localStorage.getItem('blobbi-pixel-lab:touch-hint');")) === null, 'nothing is remembered before the stick is used');

  // ── The first drag: from the hint, to the right; the ordinary stick walks the Blobbi ──
  const c0 = await toCss(at0!.x, at0!.y);
  const before = await blobbiAt();
  await press(c0.x, c0.y, 40, 0);
  await sleep(150);
  check((await evaluate('return !!(window.__blobbi.touch().stick && window.__blobbi.touch().stick.active);')) === true, 'a drag from the hint is the ordinary floating stick');
  check((await evaluate('return window.__blobbi.joystickHint().demoing(false);')) === false, 'the nudging stops the moment the stick is touched');
  await shoot('2-phone-dragging');
  await sleep(900);
  let after = await blobbiAt();
  let way = 'right';
  if (Math.abs(after.x - before.x) <= 8) {
    // A new island each run: a tree may stand on the right; the same stick, the other way
    await touchEnd();
    await sleep(150);
    await press(c0.x, c0.y, -40, 0);
    await sleep(900);
    after = await blobbiAt();
    way = 'left';
  }
  check(Math.abs(after.x - before.x) > 8, `the Blobbi walks ${way} with the stick (${before.x.toFixed(1)} → ${after.x.toFixed(1)})`);
  await touchEnd();
  await sleep(120);
  check((await evaluate('return window.__blobbi.touch().stick;')) === null, 'lifting the finger ends the stick');
  check((await evaluate('return window.__blobbi.joystickHint().learned;')) === true, 'walking with the stick counts as learned');
  check(JSON.parse((await evaluate("return localStorage.getItem('blobbi-pixel-lab:touch-hint');")) ?? '{}').learned === true, 'learned is remembered in this browser (touch-hint)');
  await sleep(1400);
  const faded = await evaluate('return window.__blobbi.joystickHint().level;');
  check(faded < 0.45 && faded > 0.1, `after moving, the hint fades to a faint ring, still there (${faded.toFixed(2)})`);
  await shoot('3-phone-hint-learned');

  // ── A while without moving: it comes back gently, without nudging again ──
  let rose = 0;
  const levels: number[] = [];
  for (let i = 0; i < 30; i++) {
    levels.push(await evaluate('return window.__blobbi.joystickHint().level;'));
    await sleep(500);
  }
  rose = levels[levels.length - 1];
  check(rose > 0.55, `after 12 s without moving it is more visible again (${rose.toFixed(2)})`);
  const jumps = levels.slice(1).map((v, i) => Math.abs(v - levels[i]));
  check(Math.max(...jumps) < 0.5 && levels.every((v, i) => i === 0 || v >= levels[i - 1] - 1e-6), `it rises smoothly, never flashing (largest step ${Math.max(...jumps).toFixed(2)} per 0.5 s)`);
  check((await evaluate('return window.__blobbi.joystickHint().demoing(false);')) === false, 'the demonstration does not replay once learned');
  await shoot('4-phone-hint-idle');

  // ── A returning player (reload, same browser): learned, quiet from the start ──
  await freshPlay({ clear: false });
  check((await evaluate('return window.__blobbi.joystickHint().learned && !window.__blobbi.joystickHint().demoing(false);')) === true, 'after a reload the stick is still learned: no demonstration');
  check(!!(await hintAt()), 'the returning player still sees the quiet hint');

  // ── Touch cancelled by the browser: the stick ends, nothing walks to where it began ──
  const at1 = (await hintAt())!;
  const c1 = await toCss(at1.x, at1.y);
  await touchStart(c1.x + 60, c1.y - 40);
  await sleep(80);
  await touchCancel();
  await sleep(300);
  check((await evaluate('return window.__blobbi.touch().stick;')) === null, 'a cancelled touch leaves no stick behind');
  check((await evaluate('return window.__blobbi.live().walkingToClick;')) === false, 'a cancelled touch does not walk the Blobbi to where it began');

  // ── The page loses focus with a finger down: the stick is released ──
  await press(c1.x, c1.y, 0, -40);
  await sleep(100);
  check((await evaluate('return !!window.__blobbi.touch().stick;')) === true, 'a held stick (setup)');
  await evaluate("window.dispatchEvent(new Event('blur'));");
  await sleep(100);
  check((await evaluate('return window.__blobbi.touch().stick;')) === null, 'losing focus releases the stick (it never stays held)');
  check((await evaluate('return Object.values(window.__blobbi.touch().directions()).some(Boolean);')) === false, 'and the stick no longer walks the Blobbi');
  await touchEnd();

  // ── A menu opening while the stick is held: the stick ends, the hint is not drawn under the menu ──
  await press(c1.x, c1.y, 40, 0);
  await sleep(100);
  await evaluate("window.__blobbi.ui().open('inventory');");
  await sleep(200);
  check((await evaluate('return window.__blobbi.touch().stick;')) === null, 'a menu opening ends a held stick');
  await touchEnd();
  await sleep(100);
  await evaluate("window.__blobbi.ui().handleKey('Escape');");
  await sleep(300);
  check((await evaluate('return !window.__blobbi.ui().capturing && !window.__blobbi.touch().stick && !window.__blobbi.live().walkingToClick;')) === true, 'and nothing walks the Blobbi on when the menu closes');

  // ── A text field: the naming page has the keyboard; the hint and the stick stay out of it ──
  await evaluate("const n = window.__blobbi.naming(); n.start && n.start(); window.__blobbi.ui().open('naming');");
  await sleep(300);
  const fieldUp = await evaluate("return !!document.querySelector('input.blobbi-field');");
  if (fieldUp) {
    const box = await evaluate("const r = document.querySelector('input.blobbi-field').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };");
    await touchStart(box.x, box.y);
    await touchEnd();
    await sleep(200);
    check((await evaluate("return document.activeElement && document.activeElement.classList.contains('blobbi-field');")) === true, 'a tap on a text field still focuses it (the phone keyboard opens)');
    check((await evaluate('return window.__blobbi.touch().stick;')) === null, 'and makes no stick');
    await evaluate("window.__blobbi.ui().handleKey('Escape');");
    await sleep(300);
  } else check(true, 'no naming field to try here (the Blobbi was already named): skipped');
  await evaluate("const u = window.__blobbi.ui(); if (u.capturing) u.handleKey('Escape');");

  // ── Nothing scrolls or zooms the page ──
  const look = await evaluate("const v = document.getElementById('view'); const cs = getComputedStyle(v); return [cs.touchAction, cs.userSelect || cs.webkitUserSelect, getComputedStyle(document.body).overscrollBehaviorY, document.scrollingElement.scrollTop, window.visualViewport ? window.visualViewport.scale : 1];");
  check(look[0] === 'none' && look[1] === 'none' && look[2] === 'none' && look[3] === 0 && look[4] === 1, `no scrolling, selection or zoom from drags (${look})`);

  // ── Safe area: a notch on the left moves the hint in by as much ──
  const plain = (await hintAt())!;
  await evaluate('window.__blobbi.touch().insets = { top: 0, right: 0, bottom: 20, left: 60 };');
  await sleep(150);
  const inset = (await hintAt())!;
  const h = await evaluate("return document.getElementById('view').height;");
  check(inset.x - plain.x === 60 && inset.y + inset.r <= h - 20 && (await overlaps()).length === 0, `it stays inside the safe area and clear of the moved menus (${JSON.stringify(plain)} → ${JSON.stringify(inset)})`);
  await evaluate("window.dispatchEvent(new Event('resize'));");
  await sleep(200);

  // ── Small and large phones, sideways ──
  for (const [w, h, d, name] of [
    [667, 375, 2, 'small phone 667×375'],
    [932, 430, 3, 'large phone 932×430'],
  ] as const) {
    await phone(w, h, d);
    await sleep(700);
    const at = await hintAt();
    check(!!at && (await overlaps()).length === 0, `${name}: the hint is drawn, clear of everything (${JSON.stringify(at)} ${await overlaps()})`);
    await shoot(`5-${name.split(' ')[0]}-phone`);
  }

  // ── Reduced motion: a new player gets the still hint (arrows, no nudging) ──
  await phone(915, 412, 2.625);
  check(await freshPlay({ reduced: true }), 'setup: a new player with reduced motion');
  check((await evaluate('return window.__blobbi.ui().settings.reducedMotion;')) === true, 'reduced motion is on');
  check(!!(await hintAt()) && (await evaluate('return window.__blobbi.joystickHint().demoing(true);')) === false, 'reduced motion: the hint shows, the knob never nudges');
  await shoot('6-phone-reduced-motion');

  // ── A computer: no touch, no hint, the keys walk as before ──
  await computer();
  check(await freshPlay(), 'setup: a new island on a computer');
  check((await evaluate('return window.__blobbi.touch().enabled;')) === false, 'a computer without touch is not in touch mode');
  check((await hintAt()) === null, 'and never sees the joystick hint');
  await evaluate("document.getElementById('view').focus();");
  // A new island each run: the Blobbi may stand against a tree on one side, so D, and A if D is blocked.
  const walkKey = async (key: string, code: string, vk: number) => {
    const k0 = await blobbiAt();
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk });
    await sleep(700);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
    const k1 = await blobbiAt();
    return k1.x - k0.x;
  };
  const right = await walkKey('d', 'KeyD', 68);
  const left = right > 8 ? 0 : await walkKey('a', 'KeyA', 65);
  check(right > 8 || left < -8, `the keys still walk the Blobbi (D ${right.toFixed(1)} px${right > 8 ? '' : `, A ${left.toFixed(1)} px`})`);
  await shoot('7-computer');
} catch (e) {
  check(false, `the check ran to the end (${String(e)})`);
} finally {
  ws.close();
  execFileSync('node', ['scripts/lab-browser.mjs', 'stop', profile], { stdio: 'inherit' });
  vite.kill();
}
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed; screenshots in ${OUT}`);
process.exit(failed ? 1 : 0);
