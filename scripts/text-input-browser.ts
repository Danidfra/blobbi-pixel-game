// TEXT INPUT BROWSER CHECK: the text fields through the real page (`main.ts`) with real input events (CDP mouse,
// keys, typed text, touch), fully offline. The title's island name, the new Blobbi's name and the restore page's
// backup field: a click or a tap on the field types there (no button first), the field shows it has the keyboard,
// the caret goes where the click fell, select all and typing over work, the game's keys never move the Blobbi while
// a field has the keyboard, a pasted backup keeps its lines, a field's input and its text leave with the page, and on
// a phone-sized screen (pixel ratio 2.625, touch) a tap focuses the field and the canvas keeps its CSS size.
// The key pasted is a throwaway made here; nothing reaches the network (no relay, no account).
//
// Starts its own dev server (5247) and the MUTED lab browser (scripts/lab-browser.mjs, its own scratch profile), and
// stops both. Screenshots go to $OUT (default: a scratch directory under the system temp dir).
//   npx tsx scripts/text-input-browser.ts
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSecretKey } from 'nostr-tools/pure';
import { nsecEncode } from 'nostr-tools/nip19';

const PORT = 5247;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = process.env.OUT ?? mkdtempSync(join(tmpdir(), 'blobbi-text-input-'));
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
  await sleep(250);
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
const field = (name: string) => `document.querySelector('input.blobbi-field[data-field="${name}"]')`;
const rectOf = async (name: string): Promise<{ x: number; y: number; w: number; h: number } | null> => evaluate(`const el = ${field(name)}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height };`);
const active = () => evaluate('return document.activeElement && document.activeElement.dataset ? (document.activeElement.dataset.field || document.activeElement.id || document.activeElement.tagName) : null;');
const click = async (x: number, y: number, clickCount = 1) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount });
  await sleep(120);
};
// (A shortcut sent over CDP runs its editing command only when named: `commands`, as a real Cmd/Ctrl+A does by itself.)
const key = async (k: string, code: string, opts: { modifiers?: number; text?: string; keyCode?: number; commands?: string[] } = {}) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers: opts.modifiers ?? 0, text: opts.text, windowsVirtualKeyCode: opts.keyCode, nativeVirtualKeyCode: opts.keyCode, commands: opts.commands });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers: opts.modifiers ?? 0, windowsVirtualKeyCode: opts.keyCode, nativeVirtualKeyCode: opts.keyCode });
  await sleep(60);
};
const type = async (text: string) => {
  await send('Input.insertText', { text });
  await sleep(80);
};
const SELECT_ALL = process.platform === 'darwin' ? 4 : 2; // Meta on a Mac, Control elsewhere

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: muted });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: noNet });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${ORIGIN}/` });
  check(await waitFor('window.__blobbi && window.__blobbi.title()'), 'the page is up (dev aid present)');
  await send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'indexeddb,local_storage' });
  await send('Page.navigate', { url: `${ORIGIN}/` });
  await waitFor('window.__blobbi && window.__blobbi.title()');
  await sleep(800);

  // ── The title's island name: the field takes the keyboard by itself on a desktop ──
  await evaluate("const t = window.__blobbi.title(); t.newAdventure(); t.chooseCarrier(0);");
  check(await waitFor(`window.__blobbi.title().page === 'name' && ${field('title.name')}`), 'the name page lays an input over its name field');
  await sleep(300);
  check((await active()) === 'title.name', `the name field has the keyboard on its own (active: ${await active()})`);
  await type('Moon Isle');
  check((await evaluate('return window.__blobbi.title().name;')) === 'Moon Isle', 'typed text goes straight into the name');
  // Characters the font cannot draw are left out, the caret staying after what was typed.
  await type('é<');
  check((await evaluate('return window.__blobbi.title().name;')) === 'Moon Isle', 'characters the island name cannot hold are dropped');
  await shoot('1-title-name-focused');
  // Select all and type over.
  await key('a', 'KeyA', { modifiers: SELECT_ALL, keyCode: 65, commands: ['selectAll'] });
  const sel = await evaluate(`const el = ${field('title.name')}; return [el.selectionStart, el.selectionEnd];`);
  check(sel[0] === 0 && sel[1] === 9, `select all selects the whole name (${sel})`);
  await shoot('2-title-name-selected');
  await type('Pearl');
  check((await evaluate('return window.__blobbi.title().name;')) === 'Pearl', 'typing over a selection replaces it');
  // A click elsewhere gives the keys back to the game; a click on the field takes them again, caret where it fell.
  const r = (await rectOf('title.name'))!;
  check(!!r && r.w > 50 && r.h >= 12, `the input lies over the drawn field (${JSON.stringify(r)})`);
  // The input shows nothing of its own (the canvas draws the field), whatever the page's other input styles say.
  const look = await evaluate(`const cs = getComputedStyle(${field('title.name')}); return [cs.backgroundColor, cs.webkitTextFillColor, cs.borderTopWidth, parseFloat(cs.fontSize)];`);
  check(look[0] === 'rgba(0, 0, 0, 0)' && look[1] === 'rgba(0, 0, 0, 0)' && look[2] === '0px' && look[3] >= 16, `the input is see-through, borderless, 16 px (${look})`);
  // The canvas under it draws the name (the game's light ink inside the field's box).
  const ink = await evaluate(`const v = document.getElementById('view'); const k = v.width / v.getBoundingClientRect().width; const d = v.getContext('2d').getImageData(Math.round(${r.x} * k - v.getBoundingClientRect().left * k), Math.round(${r.y} * k), Math.round(${r.w} * k), Math.round(${r.h} * k)).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === 0xf4 && d[i + 1] === 0xef && d[i + 2] === 0xe4) n++; return n;`);
  check(ink > 30, `the name is drawn inside the field (${ink} ink pixels)`);
  await click(640, 12); // the banner at the top: nothing to press there
  check((await active()) !== 'title.name', `a click elsewhere leaves the field (active: ${await active()})`);
  await click(r.x + 2, r.y + r.h / 2);
  const caret0 = await evaluate(`const el = ${field('title.name')}; return [document.activeElement === el, el.selectionStart, el.selectionEnd];`);
  check(caret0[0] && caret0[1] === 0 && caret0[2] === 0, `a click at the field's start focuses it with the caret at 0 (${caret0})`);
  await click(r.x + r.w - 3, r.y + r.h / 2);
  const caretEnd = await evaluate(`const el = ${field('title.name')}; return [el.selectionStart, el.value.length];`);
  check(caretEnd[0] === caretEnd[1], `a click past the text puts the caret at its end (${caretEnd})`);
  await click(r.x + 6, r.y + r.h / 2, 2);
  const word = await evaluate(`const el = ${field('title.name')}; return [el.selectionStart, el.selectionEnd];`);
  check(word[0] === 0 && word[1] === 5, `a double click selects the word (${word})`);
  await key('ArrowRight', 'ArrowRight', { keyCode: 39 });
  await key('Backspace', 'Backspace', { keyCode: 8 });
  check((await evaluate('return window.__blobbi.title().name;')) === 'Pear', 'arrow keys and backspace edit where the caret is');
  // L changes the language on the title, but typed in the field it is a letter.
  await type('l');
  check((await evaluate("return [window.__blobbi.title().name, document.documentElement.lang];")).join() === 'Pearl,en', 'a letter typed in the field never works the menu (L stays a letter)');
  // Escape gives the keys back to the menu.
  await key('Escape', 'Escape', { keyCode: 27 });
  check((await active()) === 'view', `Escape gives the keys back to the game (active: ${await active()})`);
  // Enter in the field: CREATE ISLAND.
  await click(r.x + r.w - 3, r.y + r.h / 2);
  await key('Enter', 'Enter', { keyCode: 13, text: '\r' });
  await sleep(400);
  if (await evaluate("return window.__blobbi.title().page === 'companion';")) await evaluate("window.__blobbi.title().key('Enter');");
  check(await waitFor('!!window.__blobbi.intro() || !window.__blobbi.title().active', 15000), 'Enter in the name field creates the island');
  check(!(await evaluate(`return !!${field('title.name')};`)), 'the name field and its input are gone with the page');
  for (let i = 0; i < 60 && (await evaluate('return !!window.__blobbi.intro();')); i++) {
    await evaluate('window.__blobbi.intro() && window.__blobbi.intro().requestSkip && window.__blobbi.intro().requestSkip();');
    await sleep(1000);
  }
  check(await waitFor('!window.__blobbi.title().active && !window.__blobbi.intro() && window.__blobbi.live()', 20000), 'a guest plays on the new island');

  // ── The new Blobbi's name: asked after the birth; the suggested name selected, typing replaces it ──
  check(await waitFor("window.__blobbi.ui().screen && window.__blobbi.ui().screen.id === 'naming'", 30000), 'the naming question opens');
  await sleep(500);
  const naming = await evaluate(`const el = ${field('naming.name')}; return el && [document.activeElement === el, el.selectionStart, el.selectionEnd, el.value.length, el.type, el.getAttribute('autocapitalize')];`);
  check(!!naming && naming[0] && naming[1] === 0 && naming[2] === naming[3] && naming[3] > 0, `the name field has the keyboard with the suggested name selected (${naming})`);
  await shoot('3-naming-selected');
  const before = await evaluate('const b = window.__blobbi.live().blobbi; return [b.x, b.y];');
  // Movement keys typed into the field are letters; the Blobbi never moves.
  for (const [k, code, kc] of [['w', 'KeyW', 87], ['a', 'KeyA', 65], ['s', 'KeyS', 83], ['d', 'KeyD', 68]] as const) await key(k, code, { text: k, keyCode: kc });
  await key('ArrowLeft', 'ArrowLeft', { keyCode: 37 });
  await type(' Momo');
  await sleep(300);
  const after = await evaluate('const b = window.__blobbi.live().blobbi; return [b.x, b.y];');
  const typed = await evaluate("return window.__blobbi.naming().name;");
  check(typed === 'wasd Momo' || typed === 'was Momod', `W A S D type into the field (${JSON.stringify(typed)})`);
  check(before[0] === after[0] && before[1] === after[1], 'the Blobbi did not move while the field had the keys');
  await key('a', 'KeyA', { modifiers: SELECT_ALL, keyCode: 65, commands: ['selectAll'] });
  await type('Momo');
  await shoot('4-naming-typed');
  await key('Enter', 'Enter', { keyCode: 13, text: '\r' });
  check((await evaluate("return window.__blobbi.naming().page;")) === 'happy', 'Enter in the field keeps the name (THAT\'S THE NAME!)');
  check((await evaluate("return window.__blobbi.naming().name;")) === 'Momo', 'the name kept is the one typed');
  await evaluate('window.__blobbi.ui().close();');
  await sleep(200);

  // ── Restore: a backup pasted into its field keeps its lines; it is a password field; it leaves with the page ──
  await evaluate("window.__blobbi.openIdentity('restore');");
  check(await waitFor(field('identity.backup')), 'the restore page has a backup field');
  await sleep(300);
  const attrs = await evaluate(`const el = ${field('identity.backup')}; return [document.activeElement === el, el.type, el.autocomplete, el.getAttribute('autocorrect'), el.getAttribute('spellcheck'), el.getAttribute('autocapitalize')];`);
  check(attrs[0] && attrs[1] === 'password' && attrs[2] === 'off' && attrs[3] === 'off' && attrs[4] === 'false' && attrs[5] === 'none', `the backup field is a password field with no spelling help, and has the keyboard (${attrs})`);
  const nsec = nsecEncode(generateSecretKey()); // a throwaway key, made for this check
  const file = `A Blobbi recovery key\n\n${nsec}\n`;
  await evaluate(`const el = ${field('identity.backup')}; const dt = new DataTransfer(); dt.setData('text/plain', ${JSON.stringify(file)}); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));`);
  await sleep(200);
  const pasted = await evaluate(`const sc = window.__blobbi.identity(); const el = ${field('identity.backup')}; return [sc.loaded === ${JSON.stringify(file)}, sc.loadedKind(), /\\n/.test(el.value), el.value.length];`);
  check(pasted[0] && pasted[1] === 'nsec' && !pasted[2] && pasted[3] === file.length, `a pasted backup is kept exactly, lines and all, and read as a Recovery Key (${pasted.slice(1)})`);
  await shoot('5-restore-pasted');
  check(!(await evaluate(`return document.body.innerText.includes(${JSON.stringify(nsec)});`)), 'the key is nowhere in the page text');
  await key('Escape', 'Escape', { keyCode: 27 });
  check((await evaluate("const u = window.__blobbi.ui(); return u.screen && u.screen.id;")) === 'identity', 'Escape in the field leaves the field, not the page');
  await evaluate('window.__blobbi.ui().close();');
  await sleep(200);
  check(!(await evaluate("return [...document.querySelectorAll('input.blobbi-field')].length;")), 'closing the page removes every field input');
  check(!(await evaluate(`return [...document.querySelectorAll('input')].some((i) => i.value.includes('nsec1'));`)), 'no input of the page still holds the key');

  // ── A phone held sideways: pixel ratio 2.625, touch; a tap focuses the field ──
  await send('Emulation.setDeviceMetricsOverride', { width: 915, height: 412, deviceScaleFactor: 2.625, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await sleep(800);
  const canvas = await evaluate("const v = document.getElementById('view'); const r = v.getBoundingClientRect(); return { w: v.width, h: v.height, cssW: r.width, dpr: devicePixelRatio };");
  check(canvas.w === Math.floor(canvas.cssW) && canvas.cssW === Math.floor(canvas.cssW), `at ratio ${canvas.dpr} the canvas keeps its CSS size, shown one to one (${JSON.stringify(canvas)})`);
  await evaluate("window.__blobbi.openIdentity('restore');");
  await waitFor(field('identity.backup'));
  await sleep(400);
  check((await active()) !== 'identity.backup', 'on a touch screen no field takes the keyboard by itself');
  const m = (await rectOf('identity.backup'))!;
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: m.x + m.w / 2, y: m.y + m.h / 2 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  check((await active()) === 'identity.backup', `a tap on the field focuses its input (the phone's keyboard opens) (active: ${await active()})`);
  const font = await evaluate(`return parseFloat(getComputedStyle(${field('identity.backup')}).fontSize);`);
  check(font >= 16, `the input's font is at least 16 px (no zoom on focus on a phone) (${font})`);
  await type(nsec);
  check((await evaluate('return window.__blobbi.identity().loadedKind();')) === 'nsec', 'a key typed in reads as a Recovery Key');
  await shoot('6-phone-restore');
  await evaluate('window.__blobbi.ui().close();');
} catch (e) {
  check(false, `the check ran to the end (${(e as Error).message})`);
} finally {
  ws.close();
  execFileSync('node', ['scripts/lab-browser.mjs', 'stop'], { stdio: 'inherit' });
  vite.kill();
  const failed = results.filter((l) => l.startsWith('FAIL')).length;
  console.log(`\n${results.length - failed}/${results.length} passed; screenshots in ${OUT}`);
  process.exit(failed ? 1 : 0);
}
