// M11D.5, THE LAB BROWSER: the one way browser checks start and stop Chrome. Before this, checks ran a headless Chrome
// (remote debugging on 9333) WITHOUT muting it: a key press sent over CDP counts as a user gesture, so the game's
// music started, and a tab left open by a check that failed half way kept playing with no window anywhere.
//
//   node scripts/lab-browser.mjs start [profileDir]   headless, MUTED (--mute-audio), a dedicated profile, port 9333
//   node scripts/lab-browser.mjs stop                 closes every tab it owns, then ends only the Chrome it started
//   node scripts/lab-browser.mjs status               what it started and whether it still runs
//
// What it owns is written down when it starts (`.lab-browser.json`: the pid and the profile directory) and nothing else
// is ever touched: no other Chrome, no Brave, no personal profile or tab. A process is ended only when its command
// line names this very profile directory.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = 9333;
const STATE = resolve('.lab-browser.json');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const owned = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null);
/** The pids whose command line names our profile directory (Chrome and its helpers), and nothing else. */
function ourProcesses(profile) {
  const out = execFileSync('ps', ['-Ao', 'pid=,command='], { encoding: 'utf8' });
  return out
    .split('\n')
    .map((l) => l.trim().match(/^(\d+)\s+(.*)$/))
    .filter((m) => m && m[2].includes(`--user-data-dir=${profile}`))
    .map((m) => Number(m[1]));
}

async function start(profileArg) {
  const known = owned();
  if (known && ourProcesses(known.profile).length) return console.log('already running', known);
  const profile = resolve(profileArg ?? process.env.LAB_PROFILE ?? '.lab-browser-profile');
  mkdirSync(profile, { recursive: true });
  const child = spawn(CHROME, ['--headless=new', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1280,800', 'about:blank'], { detached: true, stdio: 'ignore' });
  child.unref();
  writeFileSync(STATE, JSON.stringify({ pid: child.pid, profile, port: PORT, startedAt: new Date().toISOString() }, null, 2));
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return console.log('started', owned());
    } catch {
      /* not yet */
    }
    await sleep(250);
  }
  console.log('started (not answering yet)', owned());
}

async function stop() {
  const known = owned();
  if (!known) return console.log('nothing started by lab-browser');
  // Close every page target first (so nothing plays while Chrome winds down), then end the owned processes.
  try {
    const targets = await (await fetch(`http://127.0.0.1:${known.port}/json/list`)).json();
    for (const t of targets) await fetch(`http://127.0.0.1:${known.port}/json/close/${t.id}`).catch(() => {});
    console.log('closed tabs', targets.length);
  } catch {
    console.log('no debugging endpoint answering');
  }
  for (const sig of ['SIGTERM', 'SIGKILL']) {
    const pids = ourProcesses(known.profile);
    if (!pids.length) break;
    for (const pid of pids) {
      try {
        process.kill(pid, sig);
      } catch {
        /* already gone */
      }
    }
    await sleep(1500);
  }
  const left = ourProcesses(known.profile);
  if (left.length) console.log('STILL RUNNING (left alone, please check):', left.join(' '));
  else {
    rmSync(STATE, { force: true });
    console.log('stopped');
  }
}

function status() {
  const known = owned();
  console.log(known ? { ...known, running: ourProcesses(known.profile) } : 'nothing started by lab-browser');
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'start') await start(arg);
else if (cmd === 'stop') await stop();
else status();
