/**
 * BUNNY ENCOUNTER SHOTS (playtest fix): the encounter as a player has it, for a bold and a shy bunny, rendered
 * headless at its moments: the walk-up (the bunny at its routine), stopped (it sits up and watches; the prompt line
 * says to keep still), curious (a hop closer), coming over, beside (the heart, the Blobbi glad). Deterministic.
 *
 *   npx tsx scripts/bunny-shots.ts <label>
 *
 * Writes out/bunny/<label>/ (ignored by git):
 *   <bold|shy>-<moment>-x6.png        the scene round the Blobbi, 6 screen pixels per world pixel
 *   desktop-<bold|shy>-<moment>.png   a 1280×720 exploration view with the HUD and the prompt
 *   phone-<bold|shy>-beside.png       an 844×390 view, the same
 *   hashes.json                       a hash per image
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { IDLE_INPUT, LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI, type ViewUiOptions } from '../src/render/view-renderer';
import { ViewCamera, worldBounds, type ViewRect } from '../src/render/view-camera';
import { memoryStore } from '../src/game/persistence';
import { DAY_SECONDS, START_HOUR, rainAt } from '../src/game/daylight';
import { stand } from '../src/dev/scripted-play';
import { PixelBuffer } from '../src/core/pixel';
import { hash32 } from '../src/core/rng';
import { toPng } from '../src/node/png';
import type { LandSighting } from '../src/game/land-life';

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) ?? 'run';
const dir = `out/bunny/${label}`;
mkdirSync(dir, { recursive: true });
const at = (hour: number, day = 0) => day * DAY_SECONDS + (((hour - START_HOUR + 24) % 24) / 24) * DAY_SECONDS;
const make = () => generateTurtleWorld('play-test', { turtleSeed: 'lt', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });

const store = memoryStore();
const probe = new LiveWorld(make(), 'blobbi-9', 16, { store });
probe.growth = { stage: 2, version: 3, history: [], regions: [] };
probe.save();
const live = new LiveWorld(make(), 'blobbi-9', 16, { store });
live.brain.enabled = false;
live.weather = 'dry';
live.resources = [];

const hashes: Record<string, unknown> = {};
const frameHash = (b: PixelBuffer) => hash32(Array.from(b.data, (c) => c.toString(36)).join(','));
const save = (name: string, b: PixelBuffer) => {
  writeFileSync(`${dir}/${name}.png`, toPng(b));
  hashes[name] = frameHash(b);
};
const scaled = (b: PixelBuffer, k: number): PixelBuffer => {
  const o = new PixelBuffer(b.width * k, b.height * k);
  for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) o.set(x, y, b.get(Math.floor(x / k), Math.floor(y / k)));
  return o;
};
const view = new ViewRenderer(live, new LiveRenderer(live));
const quiet: ViewUiOptions = { hud: false, indicator: false, goals: false, prompt: false, lighting: true, uiScale: 2 };
function around(x: number, y: number, w: number, h: number, k: number): PixelBuffer {
  const rect: ViewRect = { mode: 'exploration', scale: 1, originX: Math.round(x - w / 2), originY: Math.round(y - h / 2), screenW: w, screenH: h, transitioning: false };
  return scaled(view.render(rect, 1, live.clock.time, DEFAULT_LIVE_OPTIONS, quiet).clone(), k);
}
function screen(w: number, h: number, name: string): void {
  const bounds = worldBounds(live.world);
  const cam = new ViewCamera('exploration');
  const rest = cam.restScale('exploration', w, h, bounds);
  const v = cam.update(1 / 60, live.cameraTarget(h / rest), w, h, bounds, true, 1 / 60);
  save(name, view.render(v, rest, live.clock.time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, bottom: 40 }).clone());
}
const step = (n: number) => {
  for (let i = 0; i < n; i++) live.update(1 / 60, IDLE_INPUT);
};
type Mood = { phase: string };
const mood = (id: string) => (live as unknown as { landMoods: Map<string, Mood> }).landMoods.get(id);
const sight = (id: string) => live.landViews.find((v) => v.id === id);

/** Bunny appearances on clear days, young, each once. */
function* bunnies(): Generator<{ t: number; s: LandSighting }> {
  const seen = new Set<string>();
  for (let t = at(9); t < at(9) + DAY_SECONDS * 2; t += 2) {
    const h = ((START_HOUR + (t / DAY_SECONDS) * 24) % 24 + 24) % 24;
    if (h < 8 || h > 17 || rainAt(live.world.seed, t) > 0) continue;
    const s = live.land.at(t, 0, []).find((x) => x.kind === 'bunny' && x.age < 4 && !seen.has(x.id));
    if (!s) continue;
    seen.add(s.id);
    yield { t, s };
  }
}

/** The encounter with one bunny, shot at its moments; false when the scripted walker cannot reach it. */
function encounter(name: string, t: number, s: LandSighting): boolean {
  live.timeOffset = t + 3 - live.clock.time;
  const { footRx: rx, footRy: ry } = live.blobbi;
  const spot = live.collision.nearestFree(Math.round(s.home.x + 90), Math.round(s.home.y + 10), rx, ry);
  if (!spot) return false;
  stand(live, spot.x, spot.y, 'left');
  (live as unknown as { landMoods: Map<string, Mood> }).landMoods.clear();
  live.bubble = null;
  live.update(1 / 60, IDLE_INPUT);
  const mid = () => {
    const v = sight(s.id)!;
    return { x: (v.x + live.blobbi.x) / 2, y: (v.y + live.blobbi.y) / 2 - 4 };
  };
  const shot = (moment: string, desktop = true) => {
    const c = mid();
    save(`${name}-${moment}-x6`, around(c.x, c.y, 80, 50, 6));
    if (desktop) screen(1280, 720, `desktop-${name}-${moment}`);
  };
  // The walk-up: straight at it with the keys, until 40 px off.
  let walked = 0;
  for (let i = 0; i < 60 * 12; i++) {
    const v = sight(s.id);
    if (!v) return false;
    const dx = v.x - live.blobbi.x;
    const dy = v.y - live.blobbi.y;
    if (Math.hypot(dx, dy) <= 40) break;
    if (i === 30) shot('0-walking-up');
    live.update(1 / 60, { ...IDLE_INPUT, left: dx < -1, right: dx > 1, up: dy < -1, down: dy > 1 });
    walked++;
  }
  const v0 = sight(s.id);
  if (!v0 || Math.hypot(v0.x - live.blobbi.x, v0.y - live.blobbi.y) > 48) return false;
  step(12);
  if (mood(s.id)?.phase !== 'wary' && mood(s.id)?.phase !== 'curious') return false;
  shot('1-stopped-watching');
  const until = (phase: string, max: number) => {
    for (let i = 0; i < max * 60 && mood(s.id)?.phase !== phase; i++) step(1);
    return mood(s.id)?.phase === phase;
  };
  if (!until('curious', 8)) return false;
  step(70);
  shot('2-curious');
  if (!until('approaching', 10)) return false;
  step(25);
  shot('3-coming-over');
  if (!until('beside', 8)) return false;
  step(10);
  shot('4-beside');
  screen(844, 390, `phone-${name}-beside`);
  step(120);
  shot('5-settled', false);
  console.log(`${name.padEnd(5)} bunny ${s.id} bold ${s.traits.bold.toFixed(2)}: walked ${walked} frames, beside after ${(live.worldTime - t - 3).toFixed(1)} s`);
  return true;
}

let bold = false;
let shy = false;
for (const { t, s } of bunnies()) {
  if (!bold && s.traits.bold > 0.7) bold = encounter('bold', t, s);
  else if (!shy && s.traits.bold < 0.25) shy = encounter('shy', t, s);
  if (bold && shy) break;
}
if (!bold || !shy) throw new Error(`no encounter: bold ${bold}, shy ${shy}`);
writeFileSync(`${dir}/hashes.json`, JSON.stringify(hashes, null, 2));
console.log(`wrote ${Object.keys(hashes).length} images to ${dir}/`);
