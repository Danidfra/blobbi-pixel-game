/**
 * DEVELOPMENT TOOLS for manual testing of the living world. Loaded only by the dev server
 * (`if (import.meta.env.DEV) import('../dev/dev-tools')` in the playground): the production build drops the import
 * and never contains this module.
 *
 * Every tool acts on the running world only when its button is pressed; nothing here runs on its own. The
 * destructive one (resetting quests) asks for a second click. "Test world" switches to a separate world seed, so
 * manual testing never touches a player's own save.
 */
import { ALL_ITEMS, ITEMS, itemPlural } from '../game/items';
import { CROPS, STAGE_NAMES, cropGrowth, isWet, needsWater } from '../game/farming';
import { activeQuests, newObjectives, newTally, QUESTS, requestProgress } from '../game/objectives';
import { BUILDINGS } from '../game/buildings';
import { clockLabel, DAY_SECONDS, hourAt } from '../game/daylight';
import { friendLevel } from '../game/friendship';
import type { Expression } from '../blobbi/pose';
import { SPECIES, renderSpeciesPreview } from '../carriers/species';
import { generateTurtleWorld } from '../world/turtle-world';
import { generateMantaWorld } from '../carriers/manta-world';
import { generateWhaleWorld } from '../carriers/whale-world';
import { LiveWorld } from '../sim/live-world';
import { localStore, saveKey, worldIdentity } from '../game/persistence';
import { findBuildSpot } from './scripted-play';
import { paletteFor } from '../world/generate';

const KITS: Record<string, [string, number][]> = {
  basics: [
    [ITEMS.stick.id, 20],
    [ITEMS.stone.id, 20],
    [ITEMS.wood.id, 30],
    [ITEMS.seed.id, 10],
    ['blobbi-pixel:resource:fibre', 20],
    ['blobbi-pixel:material:cloth', 15],
    ['blobbi-pixel:resource:shell', 10],
    ['blobbi-pixel:resource:herb', 10],
    ['blobbi-pixel:material:copper-ore', 10],
  ],
  seeds: ALL_ITEMS.filter((d) => d.category === 'seed').map((d) => [d.id, 5] as [string, number]),
  food: ALL_ITEMS.filter((d) => d.food).map((d) => [d.id, 3] as [string, number]),
  tools: ALL_ITEMS.filter((d) => d.tool).map((d) => [d.id, 1] as [string, number]),
  furniture: ALL_ITEMS.filter((d) => d.category === 'furniture').map((d) => [d.id, 2] as [string, number]),
};

export interface DevHooks {
  getLive: () => LiveWorld | null;
  refresh: () => void;
  /** Switch the playground to a separate test world (never the player's own save). */
  /** Switch to a test world (of a Carrier species, or the current kind). */
  openTestWorld: (kind?: 'turtle' | 'manta' | 'whale') => void;
  /** Rebuild the live world from its save (after a growth stage change), optionally playing the reveal. */
  rebuildWorld?: (reveal: boolean) => void;
  /** A short message on the game canvas (where the player is looking), for a refused dev action. */
  say?: (text: string) => void;
  /** Play the intro cinematic on a throwaway preview world of a species (never the player's own save). */
  previewIntro?: (kind: 'turtle' | 'manta' | 'whale', reduced: boolean) => void;
}

/** The dev growth buttons act only on a test world (its seed says so): a player's island never grows by a dev button. */
export const devGrowthAllowed = (seed: string): boolean => /test/.test(seed);

export function installDevTools(host: HTMLElement, hooks: DevHooks): void {
  const { getLive, refresh } = hooks;
  host.innerHTML = `
    <h2>Dev tools <small>(dev server only)</small></h2>
    <div class="row"><button data-dev="test-world">Test world</button><button data-dev="test-world-turtle">Turtle</button><button data-dev="test-world-manta">Manta</button><button data-dev="test-world-whale">Whale</button></div>
    <div class="row"><button data-dev="time-60">+1 min</button><button data-dev="time-600">+10 min</button><button data-dev="time-hour">+1 h</button><button data-dev="time-dawn">Morning</button></div>
    <div class="row"><button data-dev="kit-basics">Materials</button><button data-dev="kit-seeds">Seeds</button><button data-dev="kit-food">Food</button></div>
    <div class="row"><button data-dev="kit-tools">All tools</button><button data-dev="kit-furniture">Furniture</button><button data-dev="unlock">Unlock all</button></div>
    <div class="row"><button data-dev="hungry">Hungry</button><button data-dev="tired">Tired</button><button data-dev="sad">Sad</button><button data-dev="well">Well</button></div>
    <div class="row"><button data-dev="enter">Enter house</button><button data-dev="exit">Leave house</button><button data-dev="friend">+20 friend</button></div>
    <div class="row"><button data-dev="react-happy">Happy</button><button data-dev="react-excited">Excited</button><button data-dev="react-surprised">Surprised</button><button data-dev="react-sad">Sad face</button></div>
    <div class="row"><button data-dev="tp-leave">Depart</button><button data-dev="tp-enter">Arrive</button><button data-dev="tp-round">Round trip</button></div>
    <div class="row"><button data-dev="tp-cancel">Cancel</button><button data-dev="tp-reverse">Reverse</button><button data-dev="tp-here">Arrive by house</button><button data-dev="tp-far">Arrive far</button></div>
    <div class="row"><button data-dev="tp-reduced">Reduced motion preview</button></div>
    <div class="row"><button data-dev="reset-goals">Reset quests</button></div>
    <h3>Island growth <small>(test worlds only)</small></h3>
    <div class="row"><button data-dev="gr-0">Stage 0</button><button data-dev="gr-1">1</button><button data-dev="gr-2">2</button><button data-dev="gr-3">3</button><button data-dev="gr-next">Grow + reveal</button></div>
    <div class="row"><button data-dev="gr-ready">Meet requirements</button><button data-dev="gr-reset">Reset growth</button><button data-dev="gr-info">Inspect world</button></div>
    <pre id="dev-world-info" class="stats" style="display:none"></pre>
    <h3>Visiting <small>(local prototype)</small></h3>
    <div class="row"><button data-dev="vi-make">Make visit test worlds</button><button data-dev="vi-go">Visit next</button><button data-dev="vi-home">Return home</button></div>
    <h3>Intro cinematic <small>(preview world, nothing saved)</small></h3>
    <div class="row"><button data-dev="intro-turtle">Turtle</button><button data-dev="intro-manta">Manta</button><button data-dev="intro-whale">Whale</button><label class="check"><input id="dev-intro-reduced" type="checkbox" /> reduced motion</label></div>
    <h3>Carrier species <small>(preview)</small></h3>
    <div class="row"><button data-dev="sp-whale">Whale</button><button data-dev="sp-manta">Manta</button><button data-dev="sp-seed">New seed</button><button data-dev="sp-stage">Growth stage</button><button data-dev="sp-stop">Stop</button></div>
    <canvas id="dev-species" width="320" height="240" style="display:none;width:320px;image-rendering:pixelated"></canvas>
    <div id="dev-species-info" class="hint"></div>
    <div class="hint">Use the test world for experiments: it has its own save. Time skips move crops, regrowth, construction, day and night and requests (needs only change while the game runs). Unlock all completes every quest without granting its items.</div>
    <div id="dev-inspect" class="stats"></div>`;
  let armed = 0;
  host.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest('button');
    const action = button?.dataset.dev ?? '';
    if (action === 'test-world') {
      hooks.openTestWorld();
      return;
    }
    if (action.startsWith('intro-')) {
      hooks.previewIntro?.(action.slice(6) as 'turtle' | 'manta' | 'whale', (host.querySelector('#dev-intro-reduced') as HTMLInputElement | null)?.checked ?? false);
      return;
    }
    if (action.startsWith('test-world-')) {
      hooks.openTestWorld(action.slice(11) as 'turtle' | 'manta' | 'whale');
      return;
    }
    if (action.startsWith('vi-')) {
      visitTool(action.slice(3));
      return;
    }
    if (action.startsWith('gr-')) {
      const live = getLive();
      if (live) growthTool(live, action.slice(3));
      return;
    }
    if (action.startsWith('sp-')) {
      speciesTool(action.slice(3));
      return;
    }
    const live = getLive();
    if (!button || !live) return;
    const now = live.worldTime;
    if (action.startsWith('time-')) {
      const arg = action.slice(5);
      if (arg === 'hour') live.timeOffset += DAY_SECONDS / 24;
      else if (arg === 'dawn') live.timeOffset += ((((8 - hourAt(now)) % 24) + 24) % 24) * (DAY_SECONDS / 24);
      else live.timeOffset += Number(arg);
    } else if (action.startsWith('kit-')) for (const [item, n] of KITS[action.slice(4)] ?? []) live.inventory.add(item, n);
    else if (action === 'unlock') for (const q of QUESTS) live.objectives.completed[q.id] ??= now;
    else if (action === 'hungry') live.care.hunger = 20;
    else if (action === 'tired') live.care.energy = 20;
    else if (action === 'sad') live.care.happiness = 20;
    else if (action === 'well') Object.assign(live.care, { hunger: 100, energy: 100, happiness: 80 });
    else if (action === 'friend') live.addFriendship(20);
    else if (action === 'enter') {
      const shelter = live.buildings.find((b) => b.kind === 'shelter' && live.buildingAt(b) >= 1);
      if (shelter) live.enterInterior(shelter);
    } else if (action === 'exit') live.exitInterior();
    else if (action.startsWith('tp-')) {
      teleportTool(live, action.slice(3));
      refresh();
      return;
    } else if (action.startsWith('react-')) live.blobbi.animator.react(action.slice(6) as Expression, live.clock.time, 1.5, 3);
    else if (action === 'reset-goals') {
      if (performance.now() - armed > 3000) {
        armed = performance.now();
        button.textContent = 'Click again to reset quests';
        setTimeout(() => (button.textContent = 'Reset quests'), 3000);
        return;
      }
      armed = 0;
      button.textContent = 'Reset quests';
      live.objectives = newObjectives();
      live.tally = newTally();
    }
    live.save();
    refresh();
  });
  // Visit tools: two separate test worlds (new identities only: an existing save is never touched), then visit.
  const visitTool = (what: string) => {
    const ui = (window as unknown as { __blobbi?: { ui: () => { open: (id: string) => boolean; screen: unknown; handleKey: (c: string) => boolean } } }).__blobbi?.ui();
    if (what === 'make') {
      const store = localStore();
      if (!store) return;
      const made: string[] = [];
      for (const w of [generateTurtleWorld('visit-test-turtle', { turtleSeed: 'turtle-5' }), generateMantaWorld('visit-test-manta'), generateWhaleWorld('visit-test-whale')]) {
        const id = worldIdentity(w);
        if (store.get(saveKey(id))) continue; // already there: leave it exactly as it is
        const l = new LiveWorld(w, 'blobbi-1', 16, { store });
        for (const it of [ITEMS.wood.id, ITEMS.stone.id, ITEMS.stick.id]) l.inventory.add(it, 60);
        for (const q of ['arrive', 'meet', 'gather', 'axe', 'wood']) l.objectives.completed[q] = 0;
        if (findBuildSpot(l, 'shelter')) {
          l.setBuildMode('shelter');
          const b = l.placeBuilding();
          if (b) b.placedAt -= 1e6;
        }
        if (w.turtle) l.devSetGrowthStage(2);
        l.save();
        made.push(id);
      }
      worldInfo.style.display = 'block';
      worldInfo.textContent = made.length ? `made ${made.length} visit test world(s): open WORLDS (Y)` : 'the visit test worlds exist already (unchanged): open WORLDS (Y)';
      return;
    }
    if (what === 'go' && ui) {
      ui.open('worlds');
      ui.handleKey('Enter');
    }
    if (what === 'home' && ui) {
      ui.open('worlds');
      ui.handleKey('Enter');
    }
  };
  // Growth tools: only on a test world (its seed says so), so a player's island never grows by a dev button.
  const worldInfo = host.querySelector<HTMLElement>('#dev-world-info')!;
  const growthTool = (live: LiveWorld, what: string) => {
    if (what === 'info') {
      const g = live.world.growth;
      worldInfo.style.display = 'block';
      worldInfo.textContent = [
        `identity  ${live.identity}`,
        `seed      ${live.world.seed}  carrier ${live.world.carrier?.seed ?? '-'} variant ${live.world.carrier?.variant ?? '-'} origin ${JSON.stringify(live.world.carrier?.origin ?? null)}`,
        `growth    stage ${live.growth.stage} v${live.growth.version}  history ${live.growth.history.map((h) => `${h.stage}@${h.worldTime.toFixed(0)}`).join(' ') || '-'}${live.growthError ? `  ERROR ${live.growthError}` : ''}`,
        `land      ${live.world.stats.landPixels} px (base ${live.baseWorld.stats.landPixels}); objects ${live.world.objects.length} (base ${live.baseWorld.objects.length})`,
        ...(g ? g.regions.map((r, i) => `region    ${r.id} ${r.biome} ${g.area[i]} px bearing ${r.bearing === null ? 'ring' : ((r.bearing * 180) / Math.PI).toFixed(0)}`) : []),
        `resources ${live.allResources.length} (${live.allResources.filter((n) => n.id.startsWith('g:')).length} on grown land); finds ${live.discoveries.length}; places ${live.places.length}`,
      ].join('\n');
      return;
    }
    if (!devGrowthAllowed(live.world.seed)) {
      // Refused (a player's island is never grown by a dev button): say so where the player is looking, not only here.
      const why = 'Growth tools work on a test world only: press "Whale" (or "Turtle", "Manta", "Test world") at the top of the dev tools first. Your own island grows from the growth panel (L).';
      worldInfo.style.display = 'block';
      worldInfo.textContent = why;
      hooks.say?.('dev growth works on test worlds only: dev tools > Whale / Turtle / Manta');
      return;
    }
    if (what === 'ready') {
      Object.assign(live.tally, { fed: live.tally.fed + 40, harvested: live.tally.harvested + 30, built: live.tally.built + 15 });
      for (const q of ['shelter', 'home', 'carrier']) live.objectives.completed[q] ??= live.worldTime;
      live.carrier.bond += 80;
      for (const d of live.discoveries.slice(0, 6)) live.found.add(d.id);
      live.save();
      refresh();
      return;
    }
    if (what === 'next') {
      if (live.growIsland(true) !== null) hooks.rebuildWorld?.(true);
      return;
    }
    const stage = what === 'reset' ? 0 : Number(what);
    live.devSetGrowthStage(stage);
    // A higher stage plays the reveal (from the stage on screen) like a real growth, so the new land is noticed.
    hooks.rebuildWorld?.(true);
  };
  // Species preview: an animated canvas of a Carrier species (never a world; nothing is saved).
  const preview = { species: 'whale' as 'whale' | 'manta', seed: 0, stage: 0, timer: 0 as ReturnType<typeof setInterval> | 0, t: 0 };
  const speciesCanvas = host.querySelector<HTMLCanvasElement>('#dev-species')!;
  const speciesInfo = host.querySelector<HTMLElement>('#dev-species-info')!;
  const speciesTool = (what: string) => {
    if (what === 'stop') {
      if (preview.timer) clearInterval(preview.timer);
      preview.timer = 0;
      speciesCanvas.style.display = 'none';
      speciesInfo.textContent = '';
      return;
    }
    if (what === 'whale' || what === 'manta') preview.species = what;
    if (what === 'seed') preview.seed++;
    if (what === 'stage') preview.stage = (preview.stage + 1) % 4;
    speciesCanvas.style.display = 'block';
    const def = SPECIES[preview.species];
    speciesInfo.textContent = `${def.name} (${def.status}) seed ${preview.species}-${preview.seed}, growth stage ${preview.stage} (preview only). ${def.personality} ${def.movement}`;
    if (preview.timer) return;
    const ctx = speciesCanvas.getContext('2d')!;
    preview.timer = setInterval(() => {
      preview.t += 0.2;
      const buf = renderSpeciesPreview(preview.species, `${preview.species}-${preview.seed}`, 320, 240, preview.t, paletteFor('cozy'), preview.stage);
      const img = ctx.createImageData(320, 240);
      new Uint32Array(img.data.buffer).set(buf.data);
      ctx.putImageData(img, 0, 0);
    }, 200);
  };
  // Teleport tools: the round trip arrives as soon as the departure ends; a landing spot works from absent or present.
  let roundTrip = false;
  const teleportTool = (live: LiveWorld, what: string) => {
    const land = (at: { x: number; y: number }) => {
      if (live.getPresenceState() === 'present') {
        live.leaveBlobbi();
        pendingLanding = at;
      } else if (live.getPresenceState() === 'absent') live.enterBlobbi(at);
    };
    if (what === 'leave') live.leaveBlobbi();
    else if (what === 'enter') live.enterBlobbi();
    else if (what === 'round') roundTrip = live.leaveBlobbi() || roundTrip;
    else if (what === 'cancel') live.cancelTransition();
    else if (what === 'reverse') live.reverseTransition();
    else if (what === 'reduced') {
      // The playground copies the setting into the world each frame: flip the setting itself.
      const ui = (window as unknown as { __blobbi?: { ui: () => { settings: { reducedMotion: boolean } } } }).__blobbi?.ui();
      if (ui) ui.settings.reducedMotion = !ui.settings.reducedMotion;
      else live.teleport.reducedMotion = !live.teleport.reducedMotion;
    }
    else if (what === 'here') {
      const shelter = live.placedHere.find((b) => b.kind === 'shelter');
      land(shelter ? { x: shelter.x, y: shelter.y + BUILDINGS.shelter.footRy + 8 } : { x: live.blobbi.x + 30, y: live.blobbi.y });
    } else if (what === 'far') {
      const spots = live.discoveries.length ? live.discoveries : [{ x: live.blobbi.x - 60, y: live.blobbi.y + 40 }];
      const s = spots[Math.floor(live.clock.time * 7) % spots.length];
      land({ x: s.x, y: s.y + 10 });
    }
  };
  let pendingLanding: { x: number; y: number } | null = null;
  setInterval(() => {
    const live = getLive();
    if (!live || live.getPresenceState() !== 'absent') return;
    if (pendingLanding) {
      live.enterBlobbi(pendingLanding);
      pendingLanding = null;
    } else if (roundTrip) {
      roundTrip = false;
      live.enterBlobbi();
    }
  }, 100);
  const audioLine = () => {
    const a = (window as unknown as { __blobbi?: { audio?: () => { engine: { unlocked: boolean; mood: string | null; stats: Record<string, number> }; last: { hour: number; edge: number; mystery: boolean } | null } } }).__blobbi?.audio?.();
    if (!a) return 'audio     -';
    const e = a.engine;
    return `audio     ${e.unlocked ? 'running' : 'locked (press a key)'} mood ${e.mood ?? '-'}; played ${e.stats.played}, skipped ${e.stats.skipped}, notes ${e.stats.notes}${a.last ? `; edge ${a.last.edge.toFixed(2)}${a.last.mystery ? ' mystery' : ''}` : ''}`;
  };
  const inspect = host.querySelector<HTMLElement>('#dev-inspect')!;
  setInterval(() => {
    const live = getLive();
    if (!live) return;
    const t = live.worldTime;
    const c = live.care;
    const req = requestProgress(live.objectives, live.tally);
    const lines = [
      `world     ${t.toFixed(1)} s, ${clockLabel(t)} (offset ${live.timeOffset.toFixed(0)})`,
      `light     dark ${live.ambientLight().dark.toFixed(2)} rain ${live.rainNow().toFixed(2)}`,
      `needs     fed ${c.hunger.toFixed(1)} energy ${c.energy.toFixed(1)} joy ${c.happiness.toFixed(1)}`,
      `friend    ${live.companion.friendship} pts, level ${friendLevel(live.companion.friendship)}; likes ${live.tastes.foods.map((f) => itemPlural(f)).join(', ')}; thing ${live.tastes.thing}`,
      audioLine(),
      `presence  ${live.getPresenceState()}${live.teleport.reducedMotion ? ' (reduced motion)' : ''}`,
      `brain     ${live.brain.state} (${live.brain.restGoal}${live.brain.restAtShelter ? ', shelter' : ''}) ${live.brain.note}`,
      `scene     ${live.interior ? `inside ${live.interior.state.shelterId} (${live.interior.state.furniture.length} pieces)` : 'island'}`,
      `quests    active ${activeQuests(live.objectives).map((q) => q.id).join(' ')}`,
      `request   ${req ? `${req.request.id} ${req.have}/${req.need}` : `none (next at ${(live.objectives.nextRequestAt ?? 0).toFixed(0)} s)`}`,
      `finds     ${live.found.size}/${live.discoveries.length}: ${live.hiddenDiscoveries.map((d) => `${d.id}@${d.x},${d.y}`).join(' ')}`,
      `tally     ${Object.entries(live.tally).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' ')}`,
      ...[...live.containers.entries()].map(([k, cont]) => `chest     ${k}: ${cont.inventory.entries().map((e) => `${e.quantity} ${itemPlural(e.item)}`).join(', ') || 'empty'}`),
      ...live.placedHere.filter((b) => BUILDINGS[b.kind].use === 'herbs').map((b) => `planter   ${b.id}: ${live.herbsReady(b)} ready`),
      ...live.plots.map((p) => {
        if (!p.crop) return `${p.id.padEnd(8)} (${p.gx},${p.gy}) empty, ${p.harvests} harvests`;
        const def = CROPS[p.crop.kind];
        return `${p.id.padEnd(8)} (${p.gx},${p.gy}) ${p.crop.kind} ${STAGE_NAMES[live.cropStageOf(p)]} ${cropGrowth(p.crop, t).toFixed(1)}/${def.growSeconds}s ${isWet(p.crop, t) ? `wet ${(p.crop.wetUntil! - t).toFixed(0)}s` : needsWater(p.crop, t) ? 'DRY' : 'ripe'}${p.crop.picks ? ` picked ${p.crop.picks}` : ''}`;
      }),
    ];
    inspect.textContent = lines.join('\n');
  }, 500);
}
