/**
 * KEEPER SHOTS (Living Home): the three Keeper encounters rendered headless at fixed moments: the cairn at every
 * growth stage in its place on the island, the bunny leading, digging and showing its find, the songbird with its
 * ribbon and the ribbon left at the feeder's foot. Deterministic (the same world, the same clock).
 *
 *   npx tsx scripts/keeper-shots.ts <label>
 *
 * Writes out/keeper/<label>/*.png (ignored by git) and hashes.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { IDLE_INPUT, LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer, type ViewUiOptions } from '../src/render/view-renderer';
import type { ViewRect } from '../src/render/view-camera';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { memoryStore } from '../src/game/persistence';
import { DAY_SECONDS, START_HOUR, rainAt } from '../src/game/daylight';
import { BUILDINGS } from '../src/game/buildings';
import { LAND_REACH, BUNNY_APPROACH_AFTER, BUNNY_DIG, bunnyLeads, birdCarriesRibbon, patience, reach, type LandKind, type LandSighting } from '../src/game/land-life';
import { findBuildSpot, pressE, run, stand } from '../src/dev/scripted-play';
import { PixelBuffer } from '../src/core/pixel';
import { hash32 } from '../src/core/rng';
import { toPng } from '../src/node/png';

const label = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'run';
const dir = `out/keeper/${label}`;
mkdirSync(dir, { recursive: true });
const make = () => generateTurtleWorld('keeper-shots', { turtleSeed: 'lt', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });
const at = (hour: number, day = 0) => day * DAY_SECONDS + (((hour - START_HOUR + 24) % 24) / 24) * DAY_SECONDS;
function grown(stage: number): LiveWorld {
  const store = memoryStore();
  const probe = new LiveWorld(make(), 'blobbi-9', 16, { store });
  probe.growth = { stage, version: 3, history: [], regions: [] };
  probe.save();
  const live = new LiveWorld(make(), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  live.weather = 'dry';
  return live;
}
const hashes: Record<string, number> = {};
const save = (name: string, b: PixelBuffer) => {
  writeFileSync(`${dir}/${name}.png`, toPng(b));
  hashes[name] = hash32(Array.from(b.data, (c) => c.toString(36)).join(','));
};
const scaled = (b: PixelBuffer, k: number): PixelBuffer => {
  const o = new PixelBuffer(b.width * k, b.height * k);
  for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) o.set(x, y, b.get(Math.floor(x / k), Math.floor(y / k)));
  return o;
};
const quiet: ViewUiOptions = { hud: false, indicator: false, goals: false, prompt: false, lighting: true, uiScale: 2 };
function around(live: LiveWorld, x: number, y: number, w: number, h: number, k: number): PixelBuffer {
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const rect: ViewRect = { mode: 'exploration', scale: 1, originX: Math.round(x - w / 2), originY: Math.round(y - h / 2), screenW: w, screenH: h, transitioning: false };
  return scaled(view.render(rect, 1, live.clock.time, DEFAULT_LIVE_OPTIONS, quiet).clone(), k);
}
const still = (live: LiveWorld, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) live.update(1 / 60, IDLE_INPUT);
};

// ── A. The cairn at every stage, where it stands ─────────────────────────────────────────────────────────────────
for (const stage of [0, 1, 2, 3, 4]) {
  const live = grown(stage);
  live.timeOffset = at(0, 11);
  const c = live.cairn!;
  stand(live, c.x, c.y + 9, 'up');
  save(`cairn-stage${stage}-x6`, around(live, c.x, c.y - 6, 48, 40, 6));
  if (stage === 2) {
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    still(live, 0.6);
    save(`cairn-found-x4`, around(live, c.x, c.y - 10, 80, 56, 4));
  }
  console.log(`cairn stage ${stage} at ${c.x},${c.y} prompt "${live.prompt()}"`);
}

// ── B. The bunny: beside, leading, digging, showing ──────────────────────────────────────────────────────────────
function moment(live: LiveWorld, kind: LandKind, pick: (s: LandSighting) => boolean, from = at(10)): { t: number; s: LandSighting } {
  const perches = (live as unknown as { perches: () => { x: number; y: number }[] }).perches();
  for (let t = from; t < from + DAY_SECONDS * 6; t += 0.5) {
    const h = ((START_HOUR + (t / DAY_SECONDS) * 24) % 24 + 24) % 24;
    if (h < 8 || h > 17 || rainAt(live.world.seed, t) > 0) continue;
    const s = live.land.at(t, 0, perches).find((x) => x.kind === kind && x.age < 3 && pick(x));
    if (s) return { t, s };
  }
  throw new Error(`no ${kind}`);
}
function arrange(live: LiveWorld, t: number, p: { x: number; y: number }, d: number): void {
  live.timeOffset = t - live.clock.time;
  const { footRx: rx, footRy: ry } = live.blobbi;
  for (const a of [Math.PI, 0, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
    const spot = live.collision.nearestFree(Math.round(p.x + Math.cos(a) * d), Math.round(p.y + Math.sin(a) * d), rx, ry);
    if (spot && Math.abs(Math.hypot(spot.x - p.x, spot.y - p.y) - d) < 6) {
      stand(live, spot.x, spot.y, 'down');
      return;
    }
  }
  throw new Error('no spot');
}
type Mood = { phase: string; dig: { x: number; y: number } | null };
const mood = (live: LiveWorld, id: string) => (live as unknown as { landMoods: Map<string, Mood> }).landMoods.get(id);
const untilPhase = (live: LiveWorld, id: string, phase: string, seconds: number) => {
  for (let i = 0; i < seconds * 60 && mood(live, id)?.phase !== phase; i++) live.update(1 / 60, IDLE_INPUT);
  return mood(live, id)?.phase === phase;
};
{
  const live = grown(2);
  const { t, s } = moment(live, 'bunny', (x) => x.traits.bold > 0.6 && bunnyLeads(x.seed));
  arrange(live, t, s.home, 120);
  live.update(1 / 60, IDLE_INPUT);
  const v = live.landViews.find((x) => x.id === s.id)!;
  arrange(live, live.worldTime, v, reach(LAND_REACH.bunnyWatch, s.traits) - 5);
  const b = live.blobbi;
  const shot = (name: string) => save(name, around(live, b.x, b.y - 4, 72, 48, 5));
  if (!untilPhase(live, s.id, 'beside', BUNNY_APPROACH_AFTER * patience(s.traits) + 8)) throw new Error('no beside');
  still(live, 1);
  shot('bunny-1-beside-x5');
  untilPhase(live, s.id, 'leading', 6);
  still(live, 0.5);
  shot('bunny-2-leading-x5');
  untilPhase(live, s.id, 'digging', 8);
  still(live, BUNNY_DIG * 0.5);
  shot('bunny-3-digging-x5');
  untilPhase(live, s.id, 'showing', 6);
  still(live, 1.2);
  shot('bunny-4-showing-x5');
  const spot = live.hiddenDiscoveries.find((d) => d.id === 'keeper:button');
  console.log(`bunny ${s.id} dig at ${JSON.stringify(mood(live, s.id)?.dig)} shown ${!!spot}`);
}

// ── C. The songbird with a ribbon, and the ribbon left at the feeder ─────────────────────────────────────────────
{
  const live = grown(2);
  live.inventory.add(BUILDINGS['bird-feeder'].item!, 1);
  if (!findBuildSpot(live, 'bird-feeder')) throw new Error('no feeder spot');
  live.startPlacing(BUILDINGS['bird-feeder'].item!);
  pressE(live);
  run(live, 150);
  const f = live.buildings.find((x) => x.kind === 'bird-feeder')!;
  for (const d of live.hiddenDiscoveries) live.found.add(d.id);
  const { t, s } = moment(live, 'songbird', (x) => x.traits.bold > 0.35 && birdCarriesRibbon(x.seed));
  // Landed, too far for a song yet: the ribbon in its beak; then close and still: the song, and the ribbon left.
  arrange(live, t, s.home, 60);
  still(live, 2.5);
  const shot = (name: string) => save(name, around(live, f.x, f.y - 8, 56, 44, 6));
  shot('bird-1-ribbon-x6');
  arrange(live, live.worldTime, s.home, 30);
  still(live, 4);
  shot('bird-2-singing-left-x6');
  console.log(`bird ${s.id} pose ${live.landViews.find((x) => x.id === s.id)?.pose} ribbon on ground ${live.hiddenDiscoveries.some((d) => d.id === 'keeper:ribbon')}`);
}
writeFileSync(`${dir}/hashes.json`, JSON.stringify(hashes, null, 2));
console.log(`wrote ${Object.keys(hashes).length} images to ${dir}/`);
