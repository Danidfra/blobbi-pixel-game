/**
 * THE PLAYGROUND. Plain DOM and Canvas 2D. Five modes share one sidebar:
 *   World    the static generator view (seed, options, layers, export)
 *   Play     the living world: a controllable Blobbi, wind, water, particles
 *   Blobbi   an appearance gallery and a four-direction animated preview
 *   Growth   one tree seed from seedling to maturity
 *   Gallery  many world seeds side by side, audited
 * The UI never touches generation; it calls the generators and shows what
 * comes back. The only randomness here is picking which seed to look at.
 */
import { generateWorld } from '../world/generate';
import { generateTurtleWorld, DEFAULT_TURTLE_OPTIONS } from '../world/turtle-world';
import { SHELL_VARIANTS, DEFAULT_SHELL_VARIANT, isShellVariant, type ShellVariant } from '../carrier/types';
import { renderWorld, type RenderOptions, DEFAULT_RENDER_OPTIONS } from '../render/compose';
import { auditWorld } from '../render/audit';
import type { WorldDescription, WorldOptions } from '../world/types';
import { DEFAULT_WORLD_OPTIONS } from '../world/types';
import { PALETTES, COZY } from '../core/palette';
import { PixelBuffer, type Sprite } from '../core/pixel';
import { hex } from '../core/color';
import { LiveWorld, type LiveInput } from '../sim/live-world';
import { localStore } from '../game/persistence';
import { RESOURCE_KINDS, RESOURCE_LABEL, RESOURCE_ITEM } from '../game/resources';
import { ITEMS, itemLabel } from '../game/items';
import { RECIPES, canCraft } from '../game/crafting';
import { toolIcon } from '../game/equipment';
import { BUILDINGS } from '../game/buildings';
import { paletteFor } from '../world/generate';
import { Camera, LiveRenderer, DEFAULT_LIVE_OPTIONS, type LiveRenderOptions } from '../render/live-render';
import { blobbiIdentity } from '../blobbi/identity';
import { buildCanonicalSprite, stateForPose, WALK_FRAMES, CANONICAL_STANDING_HEIGHT } from '../blobbi/canonical';
import { buildNativeSprite } from '../blobbi/native-sprite';
import { DOCUMENT_TRANSFORM, MOTION_STYLESHEET, buildBlobbiGeometry, deriveMorphology, normalizeState, renderBlobbiSvg } from '@blobbi-kit/renderer/procedural';
import { buildBlobbiSprite, EXPRESSIONS, REST_POSE, type BlobbiPose, type Expression } from '../blobbi/sprite';
import { BlobbiAnimator, type Direction } from '../blobbi/animation';
import { generateTree } from '../objects/tree';

// ─── State ───────────────────────────────────────────────────────────────────

type Mode = 'world' | 'play' | 'blobbi' | 'growth' | 'gallery' | 'fidelity';

interface State {
  seed: string;
  options: WorldOptions;
  render: RenderOptions;
  live: LiveRenderOptions;
  zoom: number;
  panX: number;
  panY: number;
  mode: Mode;
  galleryPrefix: string;
  galleryCount: number;
  blobbiSeed: string;
  blobbiSize: number;
  turtleSeed: string;
  shellVariant: ShellVariant;
  playZoom: number;
  speed: number;
  treeSeed: string;
  treeSize: number;
  growth: number;
  growing: boolean;
  previewMoving: boolean;
  previewExpression: Expression;
  fidelity: { seeds: string; expression: Expression; view: 'front' | 'side' | 'side-left' | 'back'; size: number; zoom: number; outline: boolean; native: boolean; animate: boolean; faces: boolean };
}

const params = new URLSearchParams(location.hash.slice(1));
const state: State = {
  seed: params.get('seed') ?? 'blobbi',
  options: { ...DEFAULT_WORLD_OPTIONS, kind: (params.get('kind') as 'island' | 'turtle') ?? 'turtle' },
  render: { ...DEFAULT_RENDER_OPTIONS },
  live: { ...DEFAULT_LIVE_OPTIONS },
  zoom: 2,
  panX: 0,
  panY: 0,
  mode: (params.get('mode') as Mode) ?? 'world',
  galleryPrefix: 'gallery',
  galleryCount: 12,
  blobbiSeed: params.get('blobbi') ?? 'blobbi-9',
  blobbiSize: 16,
  turtleSeed: params.get('turtle') ?? 'turtle-0',
  shellVariant: params.has('variant') && isShellVariant(Number(params.get('variant'))) ? (Number(params.get('variant')) as ShellVariant) : DEFAULT_SHELL_VARIANT,
  playZoom: 3,
  speed: 1,
  treeSeed: 'oak-1',
  treeSize: 30,
  growth: 0,
  growing: false,
  previewMoving: false,
  previewExpression: 'neutral',
  fidelity: { seeds: 'blobbi-0,blobbi-1,blobbi-9,blobbi-19', expression: 'neutral', view: 'front', size: 24, zoom: 6, outline: true, native: false, animate: false, faces: false },
};

let world: WorldDescription | null = null;
let image: PixelBuffer | null = null;
let offscreen: HTMLCanvasElement | null = null;
let renderMs = 0;
const spriteCache = new Map<string, Sprite>();

// ─── DOM ─────────────────────────────────────────────────────────────────────

const app = document.getElementById('app')!;
app.innerHTML = `
  <aside>
    <h1>Blobbi Pixel Lab <small>procedural top-down pixel art, from seeds only</small></h1>
    <div class="tabs" role="tablist">
      <button id="tab-world" role="tab">World</button>
      <button id="tab-play" role="tab">Play</button>
      <button id="tab-blobbi" role="tab">Blobbi</button>
      <button id="tab-growth" role="tab">Growth</button>
      <button id="tab-gallery" role="tab">Gallery</button>
      <button id="tab-fidelity" role="tab">Fidelity</button>
    </div>
    <section id="panel-seed">
      <h2>World seed</h2>
      <input id="seed" type="text" spellcheck="false" />
      <div class="row">
        <button id="randomize">Randomize</button>
        <button id="regenerate" class="primary">Regenerate</button>
      </div>
      <label>World <select id="world-kind"><option value="turtle">turtle (M1)</option><option value="island">islands (phases 1-3)</option></select></label>
      <label>Turtle seed <input id="turtle-seed" type="text" spellcheck="false" /></label>
      <div class="row"><button id="turtle-random">Random turtle</button></div>
      <label>Shell variant <select id="shell-variant"></select></label>
      <div class="hint">World Carrier shell variants: B (70%) is the default; 0 is the M1 turtle unchanged; A and C enlarge the visible shell to ≈60/80% island coverage. Island, collision, navigation and the Blobbi are identical in all four.</div>
      <label>Islands <select id="islands"><option value="0">auto (2–4)</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></label>
      <label>Palette <select id="palette"></select></label>
      <label>Density <input id="density" type="range" min="0.4" max="1.8" step="0.1" /><span id="density-value"></span></label>
      <label>Size <select id="size"><option value="704x448">704×448</option><option value="448x288">448×288</option><option value="576x352">576×352</option><option value="896x576">896×576</option></select></label>
      <label>World scale <select id="world-scale"><option value="1">1.0 (phase 1)</option><option value="1.3">1.3</option><option value="1.6">1.6</option><option value="2">2.0</option></select></label>
    </section>
    <section id="panel-view">
      <h2>View</h2>
      <div class="row">
        <button id="zoom-out">−</button>
        <button id="zoom-fit">Fit</button>
        <button id="zoom-in">+</button>
      </div>
      <div class="hint">zoom <span id="zoom-value"></span>× · drag to pan · wheel to zoom</div>
      <label class="check"><input id="layer-terrain" type="checkbox" /> terrain</label>
      <label class="check"><input id="layer-vegetation" type="checkbox" /> vegetation</label>
      <label class="check"><input id="layer-structures" type="checkbox" /> structures</label>
      <label class="check"><input id="layer-details" type="checkbox" /> details (flowers, tufts, decor)</label>
      <label class="check"><input id="layer-shadows" type="checkbox" /> shadows</label>
      <button id="export">Export PNG</button>
    </section>
    <section id="panel-play" class="hidden">
      <h2>Play</h2>
      <div class="row">
        <button id="play-toggle" class="primary">Pause</button>
        <button id="play-reset">Reset world</button>
      </div>
      <label>Speed <select id="play-speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
      <label>Zoom <select id="play-zoom"><option>2</option><option>3</option><option>4</option><option>5</option></select></label>
      <label>Blobbi seed <input id="blobbi-seed" type="text" spellcheck="false" /></label>
      <div class="row"><button id="blobbi-random">Random Blobbi</button></div>
      <label>Blobbi size <select id="blobbi-size"><option>12</option><option>14</option><option>16</option><option>18</option><option>20</option><option>24</option><option>32</option></select></label>
      <label class="check"><input id="live-water" type="checkbox" /> animate water</label>
      <label class="check"><input id="live-wind" type="checkbox" /> animate wind</label>
      <label class="check"><input id="live-shadows" type="checkbox" /> shadows</label>
      <label class="check"><input id="live-debug" type="checkbox" /> debug collision</label>
      <label class="check"><input id="live-autonomy" type="checkbox" /> autonomy (WASD takes over, resumes after 5 s)</label>
      <label class="check"><input id="live-path" type="checkbox" /> debug path and nav grid</label>
      <div class="hint">WASD / arrows move · E or Space collect a resource in reach, chop a tree with the axe, else interact · C craft · Q equip · B build · P plant a tree · click the view first</div>
      <h2>Inventory</h2>
      <div id="inventory" class="stats"></div>
      <div class="row" id="axe-icon-row" style="align-items:center;gap:8px"><canvas id="axe-icon" width="36" height="36"></canvas><span class="hint" id="axe-icon-label">simple axe</span></div>
      <h2>Crafting</h2>
      <div id="crafting" class="stats"></div>
      <div class="row"><button id="craft-axe" class="primary">Craft simple axe (C)</button><button id="equip-axe">Equip axe (Q)</button></div>
      <div class="hint">Simple axe: 3 sticks + 2 stones. With the axe equipped, face a tree and press E three times to fell it: wood goes in the bag, a stump stays, and the same tree regrows over four minutes of world time (continuing across reloads).</div>
      <h2>Building</h2>
      <div id="building" class="stats"></div>
      <div class="row"><button id="build-shelter" class="primary">Build shelter (B)</button></div>
      <div class="hint">Wooden shelter: 6 wood + 3 stone. B shows a preview in front of the Blobbi (green = fits, red = why not); E places it and the materials leave the bag; it is built over 24 s of world time and stays. Buildings keep their place on the island across reloads.</div>
      <div class="row"><button id="progress-reset">Reset resources &amp; inventory</button></div>
      <div class="hint">Sticks lie under trees, stones by rocks and on the forest floor, seeds by bushes and flowers. Collected resources and the inventory persist per world in this browser (versioned, keyed by seed, turtle, variant and size). Autonomy never collects.</div>
    </section>
    <section id="panel-blobbi" class="hidden">
      <h2>Blobbi</h2>
      <label>Seed <input id="blobbi-seed-2" type="text" spellcheck="false" /></label>
      <div class="row"><button id="blobbi-random-2">Random</button><button id="blobbi-use" class="primary">Use in Play</button></div>
      <label>Size <select id="blobbi-size-2"><option>14</option><option>18</option><option>24</option><option>32</option><option>48</option></select></label>
      <label>Expression <select id="preview-expression"></select></label>
      <label class="check"><input id="preview-moving" type="checkbox" /> walking</label>
      <label>Gallery prefix <input id="blobbi-prefix" type="text" spellcheck="false" value="blobbi" /></label>
      <div class="hint">Identity comes from the kit's V3 genome: the same seed is the same Blobbi in SVG and in pixels.</div>
    </section>
    <section id="panel-growth" class="hidden">
      <h2>Growth</h2>
      <label>Tree seed <input id="tree-seed" type="text" spellcheck="false" /></label>
      <div class="row"><button id="tree-random">Random tree</button></div>
      <label>Mature size <select id="tree-size"><option>20</option><option>26</option><option>30</option><option>36</option><option>44</option></select></label>
      <label>Growth <input id="growth" type="range" min="0" max="1" step="0.01" /><span id="growth-value"></span></label>
      <div class="row">
        <button id="grow-toggle" class="primary">Grow</button>
        <button id="grow-reset">Reset</button>
      </div>
      <div class="hint">The same seed at every age: trunk kind, canopy kind and blob layout are fixed; only development changes.</div>
    </section>
    <section id="panel-fidelity" class="hidden">
      <h2>Fidelity lab</h2>
      <label>Seeds <input id="fid-seeds" type="text" spellcheck="false" /></label>
      <label>Expression <select id="fid-expression"></select></label>
      <label>View <select id="fid-view"><option value="front">front</option><option value="side">side (right)</option><option value="side-left">side (left)</option><option value="back">back</option></select></label>
      <label>Pixel size <select id="fid-size"><option>12</option><option>16</option><option>20</option><option>24</option><option>32</option><option>48</option></select></label>
      <label>Zoom <select id="fid-zoom"><option>2</option><option>3</option><option>4</option><option>6</option><option>8</option><option>10</option></select></label>
      <label class="check"><input id="fid-outline" type="checkbox" /> pixel outline</label>
      <label class="check"><input id="fid-native" type="checkbox" /> show native sprite (approach A)</label>
      <label class="check"><input id="fid-animate" type="checkbox" /> animate (walk)</label>
      <label class="check"><input id="fid-faces" type="checkbox" /> face gallery (24 seeds)</label>
      <div class="hint">Left: the canonical Adult V3 (the kit's own SVG, drawn by the browser). Middle: the canonical pixel raster used in play. The bottom strip is the actual gameplay size at the play zoom.</div>
    </section>
    <section id="panel-gallery" class="hidden">
      <h2>Gallery</h2>
      <label>Prefix <input id="gallery-prefix" type="text" spellcheck="false" /></label>
      <label>Count <select id="gallery-count"><option>6</option><option>12</option><option>24</option><option>48</option></select></label>
      <button id="gallery-render" class="primary">Render gallery</button>
      <div class="hint">Click a world to open it. Tiles flagged ⚠ failed an audit (unbridged island, clipped object, object off land).</div>
    </section>
    <section>
      <h2>Statistics</h2>
      <div id="stats" class="stats"></div>
    </section>
  </aside>
  <main>
    <canvas id="view" tabindex="0"></canvas>
    <div id="gallery" class="hidden"></div>
    <div id="blobbi-view" class="hidden"></div>
    <div id="growth-view" class="hidden"></div>
    <div id="fidelity-view" class="hidden"></div>
  </main>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const view = $<HTMLCanvasElement>('view');
const ctx = view.getContext('2d')!;
const seedInput = $<HTMLInputElement>('seed');
const paletteSelect = $<HTMLSelectElement>('palette');
for (const name of Object.keys(PALETTES)) {
  const o = document.createElement('option');
  o.value = name;
  o.textContent = name;
  paletteSelect.append(o);
}
const exprSelect = $<HTMLSelectElement>('preview-expression');
for (const e of EXPRESSIONS) {
  const o = document.createElement('option');
  o.value = e;
  o.textContent = e;
  exprSelect.append(o);
}
const fidExprSelect = $<HTMLSelectElement>('fid-expression');
for (const e of EXPRESSIONS) {
  const o = document.createElement('option');
  o.value = e;
  o.textContent = e;
  fidExprSelect.append(o);
}
const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

function toCanvas(buf: PixelBuffer, reuse?: HTMLCanvasElement): HTMLCanvasElement {
  const c = reuse ?? document.createElement('canvas');
  if (c.width !== buf.width || c.height !== buf.height) {
    c.width = buf.width;
    c.height = buf.height;
  }
  const cctx = c.getContext('2d')!;
  const bytes = new Uint8ClampedArray(buf.data.buffer as ArrayBuffer, buf.data.byteOffset, buf.data.byteLength);
  cctx.putImageData(new ImageData(bytes, buf.width, buf.height), 0, 0);
  return c;
}

function saveHash(): void {
  location.hash = `seed=${encodeURIComponent(state.seed)}&mode=${state.mode}&blobbi=${encodeURIComponent(state.blobbiSeed)}&kind=${state.options.kind}&turtle=${encodeURIComponent(state.turtleSeed)}&variant=${state.shellVariant}`;
}

// ─── World mode ──────────────────────────────────────────────────────────────

/** The world for the current options: a turtle carrying the land, or the phase 1-3 archipelago. */
function makeWorld(seed: string): WorldDescription {
  if (state.options.kind === 'turtle') return generateTurtleWorld(seed, { ...state.options, turtleSeed: state.turtleSeed, shellVariant: state.shellVariant, width: state.options.width, height: Math.max(state.options.height, DEFAULT_TURTLE_OPTIONS.height) });
  return generateWorld(seed, state.options);
}

function regenerate(): void {
  world = makeWorld(state.seed);
  rerender();
  saveHash();
  if (live) startLive();
}

function rerender(): void {
  if (!world) return;
  const t0 = performance.now();
  image = renderWorld(world, state.render, spriteCache);
  renderMs = performance.now() - t0;
  offscreen = toCanvas(image);
  draw();
  showWorldStats();
}

function fitZoom(): void {
  if (!world) return;
  const z = Math.max(1, Math.floor(Math.min(view.width / world.options.width, view.height / world.options.height)));
  state.zoom = z;
  state.panX = Math.floor((view.width - world.options.width * z) / 2);
  state.panY = Math.floor((view.height - world.options.height * z) / 2);
  draw();
}

function draw(): void {
  if (state.mode !== 'world') return;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0d1016';
  ctx.fillRect(0, 0, view.width, view.height);
  if (!offscreen) return;
  ctx.drawImage(offscreen, state.panX, state.panY, offscreen.width * state.zoom, offscreen.height * state.zoom);
  $('zoom-value').textContent = String(state.zoom);
}

function showWorldStats(): void {
  if (!world || !image) return;
  const s = world.stats;
  const land = ((s.landPixels / (world.options.width * world.options.height)) * 100).toFixed(1);
  const kinds = Object.entries(s.objects)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `  ${k.padEnd(8)} ${n}`)
    .join('\n');
  const audit = auditWorld(world);
  $('stats').innerHTML =
    `seed      <b>${escapeHtml(world.seed)}</b>\n` +
    `size      ${world.options.width}×${world.options.height} px\n` +
    `islands   <b>${s.islands}</b>   bridges <b>${s.bridges}</b>${world.turtle ? `   turtle <b>${escapeHtml(world.turtle.genome.seed)}</b>` : ''}\n` +
    (world.carrier ? `carrier   <b>${world.carrier.species}</b> shell variant <b>${world.carrier.variant}</b>, island covers <b>${(world.carrier.coverage.measured * 100).toFixed(0)}%</b> of the shell, origin ${world.carrier.origin.x},${world.carrier.origin.y}\n` : '') +
    `land      ${land}%\n` +
    `objects   <b>${world.objects.length}</b>\n${kinds}\n` +
    `generate  ${s.generationMs.toFixed(1)} ms\n` +
    `render    ${renderMs.toFixed(1)} ms\n` +
    `audit     ${audit.ok ? 'ok' : `<span style="color:#ffb13b">${audit.issues.join('; ')}</span>`}`;
}

// ─── Play mode ───────────────────────────────────────────────────────────────

let live: LiveWorld | null = null;
let liveRenderer: LiveRenderer | null = null;
const camera = new Camera();
let liveCanvas: HTMLCanvasElement | null = null;
const keys = new Set<string>();
let interactPressed = false;
let plantPressed = false;
let lastFrameTime = 0;
const frameTimes: number[] = [];
const simTimes: number[] = [];
const renderTimes: number[] = [];
const uploadTimes: number[] = [];
let fps = 0;
let statsTimer = 0;
let rafId = 0;

function startLive(): void {
  if (!world) return;
  live = new LiveWorld(world, state.blobbiSeed, state.blobbiSize, { store: localStore() });
  liveRenderer = new LiveRenderer(live);
  drawAxeIcon();
  showInventory();
  live.clock.speed = state.speed;
  camera.follow(live.blobbi.x, live.blobbi.y, view.width / state.playZoom, view.height / state.playZoom, world.options.width, world.options.height, 0, true);
}

function stopLive(): void {
  live = null;
  liveRenderer = null;
  liveCanvas = null;
}

function readInput(): LiveInput {
  const input: LiveInput = {
    up: keys.has('ArrowUp') || keys.has('KeyW'),
    down: keys.has('ArrowDown') || keys.has('KeyS'),
    left: keys.has('ArrowLeft') || keys.has('KeyA'),
    right: keys.has('ArrowRight') || keys.has('KeyD'),
    interact: interactPressed,
    plant: plantPressed,
  };
  interactPressed = false;
  plantPressed = false;
  return input;
}

const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const max = (a: number[]) => (a.length ? Math.max(...a) : 0);
const push = (a: number[], v: number) => {
  a.push(v);
  if (a.length > 90) a.shift();
};

function playFrame(now: number): void {
  rafId = requestAnimationFrame(playFrame);
  if (state.mode !== 'play' || !live || !liveRenderer || !world) return;
  const real = lastFrameTime ? (now - lastFrameTime) / 1000 : 1 / 60;
  lastFrameTime = now;
  push(frameTimes, real * 1000);
  const t0 = performance.now();
  live.update(real, readInput());
  const t1 = performance.now();
  const zoom = state.playZoom;
  const viewW = Math.ceil(view.width / zoom);
  const viewH = Math.ceil(view.height / zoom);
  camera.follow(live.blobbi.x, live.blobbi.y - 6, viewW, viewH, world.options.width, world.options.height, real);
  const frame = liveRenderer.render(viewW, viewH, camera.x, camera.y, live.clock.time, state.live);
  const t2 = performance.now();
  liveCanvas = toCanvas(frame, liveCanvas ?? undefined);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(liveCanvas, 0, 0, viewW * zoom, viewH * zoom);
  const t3 = performance.now();
  push(simTimes, t1 - t0);
  push(renderTimes, t2 - t1);
  push(uploadTimes, t3 - t2);
  statsTimer += real;
  if (statsTimer > 0.25) {
    statsTimer = 0;
    fps = 1000 / Math.max(0.001, avg(frameTimes));
    showPlayStats();
  }
}

function showInventory(): void {
  if (!live) return;
  const inv = live.inventory;
  const near = live.nearestResource();
  $('inventory').innerHTML =
    RESOURCE_KINDS.map((k) => `${RESOURCE_LABEL[k].padEnd(9)} <b>${inv.count(RESOURCE_ITEM[k])}</b> / ${inv.limit(RESOURCE_ITEM[k])}`).join('\n') +
    `\nwood      <b>${inv.count(ITEMS.wood.id)}</b> / ${inv.limit(ITEMS.wood.id)}\naxe       <b>${inv.count(ITEMS.axe.id) ? (live.equipped === ITEMS.axe.id ? 'equipped' : 'in the bag') : 'none'}</b>` +
    `\nleft      ${live.resources.length} of ${live.allResources.length} on the ground   collected ${live.stats.collected} this session` +
    `\nin reach  ${near ? `<b>${near.kind}</b> (E to collect)` : '-'}   revision ${inv.revision}`;
  const lines = RECIPES.map((r) => {
    const check = canCraft(inv, r);
    const ings = r.ingredients.map((i) => `${inv.count(i.item) >= i.quantity ? '<b>' : ''}${i.quantity} ${itemLabel(i.item)} (${inv.count(i.item)})${inv.count(i.item) >= i.quantity ? '</b>' : ''}`).join(' + ');
    return `${r.label.padEnd(11)} ${ings} → ${check.ok ? '<b>ready</b>' : check.outputFull ? 'already own one' : 'missing ingredients'}`;
  });
  const facing = live.facingObject();
  let treeLine = '';
  if (facing && facing.placement.kind === 'tree' && facing.index < live.world.objects.length) {
    const c = live.treeAt(facing.index);
    if (c.phase === 'grown' || c.phase === 'chopping') treeLine = `facing a tree: ${live.equipped === ITEMS.axe.id ? `E to chop (${live.trees.get(facing.index)?.hits ?? 0}/3)` : 'equip the axe to chop'}`;
    else treeLine = `facing a ${c.phase === 'stump' ? 'stump' : 'regrowing tree'}, ${Math.ceil(c.remaining)} s to regrow`;
  }
  $('crafting').innerHTML = lines.join('\n') + `\nchops ${live.stats.chops}   felled ${live.stats.felled}   crafted ${live.stats.crafted}   world time ${live.worldTime.toFixed(0)} s` + (treeLine ? `\n${treeLine}` : '');
  $('craft-axe').toggleAttribute('disabled', !canCraft(inv, RECIPES[0]).ok);
  $('equip-axe').textContent = live.equipped === ITEMS.axe.id ? 'Unequip axe (Q)' : 'Equip axe (Q)';
  $('equip-axe').toggleAttribute('disabled', inv.count(ITEMS.axe.id) === 0);
  $('axe-icon-row').classList.toggle('hidden', inv.count(ITEMS.axe.id) === 0);
  $('axe-icon-label').textContent = live.equipped === ITEMS.axe.id ? 'simple axe, equipped (in hand)' : 'simple axe, in the bag';
  if (live.swing) $('crafting').innerHTML += `\nswing     ${live.equipmentAnimation(live.clock.time)}`;
}

function drawAxeIcon(): void {
  const c = $<HTMLCanvasElement>('axe-icon');
  const icon = toolIcon(ITEMS.axe.id, paletteFor(state.options.palette), 4);
  c.width = icon.buffer.width;
  c.height = icon.buffer.height;
  c.getContext('2d')!.drawImage(toCanvas(icon.buffer), 0, 0);
}

function showBuilding(): void {
  if (!live) return;
  const def = BUILDINGS.shelter;
  const cost = def.cost.map((c) => `${c.quantity} ${itemLabel(c.item)} (${live!.inventory.count(c.item)})`).join(' + ');
  const lines = [`shelter   ${cost} → ${live.canAfford('shelter') ? '<b>affordable</b>' : 'missing materials'}`, `built     ${live.buildings.length} building${live.buildings.length === 1 ? '' : 's'}` + live.buildings.map((b) => ` · ${b.kind} at ${b.x},${b.y} ${(live!.buildingAt(b) * 100).toFixed(0)}%`).join('')];
  if (live.buildMode) {
    const check = live.placementCheck();
    const spot = live.placementSpot();
    lines.push(`preview   <b>${check.ok ? 'fits' : check.problem}</b> at ${spot.x},${spot.y}   E to place, B to cancel`);
  }
  $('building').innerHTML = lines.join('\n');
  $('build-shelter').textContent = live.buildMode ? 'Cancel build (B)' : 'Build shelter (B)';
}

function toggleBuild(): void {
  if (!live) return;
  live.setBuildMode(live.buildMode ? null : 'shelter');
  showBuilding();
}

function craftAxe(): void {
  if (!live) return;
  live.craftRecipe(RECIPES[0]);
  showInventory();
}

function toggleAxe(): void {
  if (!live) return;
  if (live.equipped === ITEMS.axe.id) live.unequip();
  else live.equip(ITEMS.axe.id);
  showInventory();
}

function showPlayStats(): void {
  if (!live || !liveRenderer) return;
  showInventory();
  showBuilding();
  const b = live.blobbi;
  const t = liveRenderer.timings;
  $('stats').innerHTML =
    `fps       <b>${fps.toFixed(0)}</b>  frame ${avg(frameTimes).toFixed(1)} ms\n` +
    `worst     ${max(frameTimes).toFixed(1)} ms (last 90 frames)\n` +
    `sim       ${avg(simTimes).toFixed(2)} ms  render ${avg(renderTimes).toFixed(2)} ms\n` +
    `upload    ${avg(uploadTimes).toFixed(2)} ms  (copy ${t.copy.toFixed(2)} water ${t.water.toFixed(2)} objects ${t.objects.toFixed(2)})\n` +
    `clock     ${live.clock.time.toFixed(1)} s   step ${live.clock.step}   speed ${live.clock.speed}× ${live.clock.paused ? '(paused)' : ''}\n` +
    `blobbi    <b>${escapeHtml(b.seed)}</b>  at ${b.x.toFixed(0)},${b.y.toFixed(0)}  ${b.animator.state.direction}${b.animator.state.moving ? ' walking' : ''}\n` +
    `drawn     ${t.drawn} sprites   particles ${live.particles.particles.length}   planted ${live.planted.length}\n` +
    `caches    ${live.spriteCache.size} object sprites, ${live.blobbiCache.size} blobbi poses\n` +
    `facing    ${live.facingObject()?.placement.kind ?? '-'}\n` +
    `mind      <b>${live.brain.state}</b>${live.brain.manualActive ? ` (${live.brain.manualLeft(live.clock.time).toFixed(1)} s to autonomy)` : ''}  ${escapeHtml(live.brain.note)}\n` +
    `goal      ${live.brain.target ? `${Math.round(live.brain.target.x)},${Math.round(live.brain.target.y)} via ${live.brain.path.length} waypoints` : '-'}`;
}

view.addEventListener('keydown', (e) => {
  if (state.mode !== 'play') return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyE' || e.code === 'Space') interactPressed = true;
  if (e.code === 'KeyP') plantPressed = true;
  if (e.code === 'KeyC') craftAxe();
  if (e.code === 'KeyQ') toggleAxe();
  if (e.code === 'KeyB') toggleBuild();
});
window.addEventListener('beforeunload', () => live?.save());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) live?.save();
});
view.addEventListener('keyup', (e) => keys.delete(e.code));
view.addEventListener('blur', () => keys.clear());

$('play-toggle').addEventListener('click', () => {
  if (!live) return;
  live.clock.paused = !live.clock.paused;
  $('play-toggle').textContent = live.clock.paused ? 'Resume' : 'Pause';
  view.focus();
});
$('play-reset').addEventListener('click', () => {
  startLive();
  view.focus();
});
$('craft-axe').addEventListener('click', () => {
  craftAxe();
  view.focus();
});
$('equip-axe').addEventListener('click', () => {
  toggleAxe();
  view.focus();
});
$('build-shelter').addEventListener('click', () => {
  toggleBuild();
  view.focus();
});
$('progress-reset').addEventListener('click', () => {
  live?.resetProgress();
  showInventory();
  view.focus();
});
$('play-speed').addEventListener('change', (e) => {
  state.speed = Number((e.target as HTMLSelectElement).value);
  if (live) live.clock.speed = state.speed;
});
$('play-zoom').addEventListener('change', (e) => (state.playZoom = Number((e.target as HTMLSelectElement).value)));
$('blobbi-seed').addEventListener('change', (e) => setBlobbiSeed((e.target as HTMLInputElement).value.trim() || 'abc123'));
$('blobbi-random').addEventListener('click', () => setBlobbiSeed(randomSeed('blobbi')));
$('blobbi-size').addEventListener('change', (e) => {
  state.blobbiSize = Number((e.target as HTMLSelectElement).value);
  live?.setBlobbi(state.blobbiSeed, state.blobbiSize);
});
for (const [id, key] of [
  ['live-water', 'animateWater'],
  ['live-wind', 'animateWind'],
  ['live-shadows', 'shadows'],
  ['live-debug', 'debugCollision'],
  ['live-path', 'debugPath'],
] as const) {
  $(id).addEventListener('change', (e) => {
    state.live[key] = (e.target as HTMLInputElement).checked;
    view.focus();
  });
}

function setBlobbiSeed(seed: string): void {
  state.blobbiSeed = seed;
  syncControls();
  live?.setBlobbi(seed, state.blobbiSize);
  saveHash();
  renderBlobbiView();
}

// ─── Blobbi mode ─────────────────────────────────────────────────────────────

let previewAnimators: { dir: Direction; animator: BlobbiAnimator; canvas: HTMLCanvasElement; buf: PixelBuffer }[] = [];
let previewTime = 0;
let previewLast = 0;
let previewSize = 24;

function renderBlobbiView(): void {
  if (state.mode !== 'blobbi') return;
  const host = $('blobbi-view');
  host.innerHTML = '';
  previewSize = Number($<HTMLSelectElement>('blobbi-size-2').value);
  const id = blobbiIdentity(state.blobbiSeed);
  // Direction preview: four animated canvases.
  const preview = document.createElement('div');
  preview.className = 'preview-row';
  previewAnimators = [];
  for (const dir of ['down', 'left', 'up', 'right'] as Direction[]) {
    const cell = Math.round(previewSize * 2.2);
    const buf = new PixelBuffer(cell, cell);
    const canvas = document.createElement('canvas');
    canvas.className = 'preview';
    const scale = Math.max(2, Math.floor(160 / cell));
    canvas.style.width = `${cell * scale}px`;
    canvas.style.height = `${cell * scale}px`;
    const fig = document.createElement('figure');
    const cap = document.createElement('figcaption');
    cap.textContent = dir;
    fig.append(canvas, cap);
    preview.append(fig);
    const animator = new BlobbiAnimator(`${state.blobbiSeed}/${dir}`);
    previewAnimators.push({ dir, animator, canvas, buf });
  }
  const title = document.createElement('h3');
  title.textContent = `${state.blobbiSeed} · ${previewSize} px · antenna ${id.antenna.count}, horns ${id.horns.kind}, ears ${id.ears.kind}, tail ${id.tail.kind}, ${id.pattern.kind}, mark ${id.mark.kind}${id.belly ? ', belly' : ''}`;
  host.append(title, preview);
  // Expression strip.
  const strip = document.createElement('div');
  strip.className = 'preview-row';
  for (const e of EXPRESSIONS) {
    const sprite = buildBlobbiSprite(id, { ...REST_POSE, expression: e }, previewSize);
    const fig = spriteFigure(sprite, e, 4);
    strip.append(fig);
  }
  const lids = buildBlobbiSprite(id, { ...REST_POSE, lid: 2 }, previewSize);
  strip.append(spriteFigure(lids, 'blink', 4));
  host.append(strip);
  // Gallery of seeds.
  const h = document.createElement('h3');
  h.textContent = 'Appearance gallery (front view): click to select';
  host.append(h);
  const grid = document.createElement('div');
  grid.className = 'blobbi-grid';
  const prefix = $<HTMLInputElement>('blobbi-prefix').value.trim() || 'blobbi';
  for (let i = 0; i < 24; i++) {
    const seed = `${prefix}-${i}`;
    const sprite = buildBlobbiSprite(blobbiIdentity(seed), REST_POSE, 24);
    const fig = spriteFigure(sprite, seed, 3);
    fig.addEventListener('click', () => {
      state.blobbiSeed = seed;
      syncControls();
      saveHash();
      renderBlobbiView();
      live?.setBlobbi(seed, state.blobbiSize);
    });
    grid.append(fig);
  }
  host.append(grid);
  $('stats').innerHTML = `blobbi    <b>${escapeHtml(state.blobbiSeed)}</b>\nsize      ${previewSize} px\nsprite    ${buildBlobbiSprite(id, REST_POSE, previewSize).buffer.width}×${buildBlobbiSprite(id, REST_POSE, previewSize).buffer.height} px\ngenes     ${Object.entries(id.genes)
    .map(([k, v]) => `${k} ${v.toFixed(2)}`)
    .join(', ')}`;
}

function spriteFigure(sprite: Sprite, caption: string, scale: number): HTMLElement {
  const pad = 4;
  const buf = new PixelBuffer(sprite.buffer.width + pad * 2, sprite.buffer.height + pad * 2);
  buf.fill(COZY.grass.mid);
  buf.fillEllipse(pad + sprite.anchorX + 0.5, pad + sprite.anchorY + 0.5, sprite.footRx + 1, sprite.footRy, COZY.shadowOnGrass);
  buf.blit(sprite.buffer, pad, pad);
  const canvas = toCanvas(buf);
  canvas.className = 'preview';
  canvas.dataset.w = String(buf.width);
  canvas.dataset.h = String(buf.height);
  canvas.dataset.gx = String(pad + sprite.anchorX);
  canvas.dataset.gy = String(pad + sprite.anchorY);
  canvas.dataset.size = String(Math.round((sprite.anchorY - (sprite.buffer.bounds()?.y ?? 0)) * 1.0));
  canvas.style.width = `${buf.width * scale}px`;
  canvas.style.height = `${buf.height * scale}px`;
  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.textContent = caption;
  fig.append(canvas, cap);
  return fig;
}

function previewFrame(now: number): void {
  requestAnimationFrame(previewFrame);
  if (state.mode !== 'blobbi' || !previewAnimators.length) return;
  const dt = previewLast ? Math.min(0.05, (now - previewLast) / 1000) : 1 / 60;
  previewLast = now;
  previewTime += dt;
  const id = blobbiIdentity(state.blobbiSeed);
  for (const p of previewAnimators) {
    p.animator.step(dt, previewTime, { moving: state.previewMoving, direction: p.dir });
    const pose: BlobbiPose = { ...p.animator.pose(previewTime), expression: state.previewExpression === 'neutral' ? p.animator.pose(previewTime).expression : state.previewExpression };
    const sprite = buildBlobbiSprite(id, pose, previewSize);
    p.buf.fill(COZY.grass.mid);
    const gx = Math.floor(p.buf.width / 2);
    const gy = p.buf.height - 4;
    p.buf.fillEllipse(gx + 0.5, gy + 0.5, sprite.footRx + 1, 2, COZY.shadowOnGrass);
    p.buf.blit(sprite.buffer, gx - sprite.anchorX, gy - sprite.anchorY + p.animator.hop(previewTime));
    toCanvas(p.buf, p.canvas);
  }
}

$('blobbi-seed-2').addEventListener('change', (e) => setBlobbiSeed((e.target as HTMLInputElement).value.trim() || 'abc123'));
$('blobbi-random-2').addEventListener('click', () => setBlobbiSeed(randomSeed('blobbi')));
$('blobbi-use').addEventListener('click', () => {
  live?.setBlobbi(state.blobbiSeed, state.blobbiSize);
  setMode('play');
});
$('blobbi-size-2').addEventListener('change', renderBlobbiView);
$('blobbi-prefix').addEventListener('change', renderBlobbiView);
exprSelect.addEventListener('change', () => (state.previewExpression = exprSelect.value as Expression));
$('preview-moving').addEventListener('change', (e) => (state.previewMoving = (e.target as HTMLInputElement).checked));
// Click a direction preview to react.
$('blobbi-view').addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.tagName !== 'CANVAS') return;
  for (const p of previewAnimators) if (p.canvas === target) p.animator.react('excited', previewTime, 1, 3);
});

// ─── Growth mode ─────────────────────────────────────────────────────────────

let growthLast = 0;
let growthCanvas: HTMLCanvasElement | null = null;

function renderGrowthView(): void {
  if (state.mode !== 'growth') return;
  const host = $('growth-view');
  host.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'preview-row';
  const stages = [0, 0.08, 0.2, 0.35, 0.5, 0.7, 0.85, 1];
  for (const g of stages) {
    const sprite = generateTree({ seed: state.treeSeed, size: state.treeSize, palette: COZY, growth: g });
    row.append(spriteFigure(sprite, `growth ${g.toFixed(2)}`, 3));
  }
  const title = document.createElement('h3');
  const mature = generateTree({ seed: state.treeSeed, size: state.treeSize, palette: COZY, growth: 1 });
  title.textContent = `${state.treeSeed}: ${mature.variation.trunk} trunk, ${mature.variation.canopy} canopy${mature.variation.fruit ? ', fruit' : ''}${mature.variation.blossom ? ', blossom' : ''}`;
  host.append(title, row);
  const big = document.createElement('div');
  big.className = 'preview-row';
  const cell = state.treeSize + 12;
  growthCanvas = document.createElement('canvas');
  growthCanvas.className = 'preview';
  growthCanvas.style.width = `${cell * 6}px`;
  growthCanvas.style.height = `${cell * 6}px`;
  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.id = 'growth-caption';
  fig.append(growthCanvas, cap);
  big.append(fig);
  host.append(big);
  drawGrowthStage();
}

function drawGrowthStage(): void {
  if (!growthCanvas) return;
  const cell = state.treeSize + 12;
  const buf = new PixelBuffer(cell, cell);
  buf.fill(COZY.grass.mid);
  const sprite = generateTree({ seed: state.treeSeed, size: state.treeSize, palette: COZY, growth: state.growth });
  const gx = Math.floor(cell / 2);
  const gy = cell - 5;
  buf.fillEllipse(gx + 0.5, gy + 0.5, sprite.footRx + 1, sprite.footRy, COZY.shadowOnGrass);
  buf.blit(sprite.buffer, gx - sprite.anchorX, gy - sprite.anchorY);
  toCanvas(buf, growthCanvas);
  $('growth-caption').textContent = `growth ${state.growth.toFixed(2)} · ${sprite.buffer.width}×${sprite.buffer.height} px`;
  $('growth-value').textContent = state.growth.toFixed(2);
  $<HTMLInputElement>('growth').value = String(state.growth);
  $('stats').innerHTML = `tree      <b>${escapeHtml(state.treeSeed)}</b>\ngrowth    ${state.growth.toFixed(2)}\nmature    ${state.treeSize} px\n${state.growing ? 'growing at ' + state.speed + '×' : 'paused'}`;
}

function growthFrame(now: number): void {
  requestAnimationFrame(growthFrame);
  if (state.mode !== 'growth') return;
  const dt = growthLast ? Math.min(0.05, (now - growthLast) / 1000) : 0;
  growthLast = now;
  if (!state.growing) return;
  state.growth = Math.min(1, state.growth + (dt / 12) * state.speed);
  if (state.growth >= 1) {
    state.growing = false;
    $('grow-toggle').textContent = 'Grow';
  }
  drawGrowthStage();
}

$('tree-seed').addEventListener('change', (e) => {
  state.treeSeed = (e.target as HTMLInputElement).value.trim() || 'oak-1';
  renderGrowthView();
});
$('tree-random').addEventListener('click', () => {
  state.treeSeed = randomSeed('tree');
  syncControls();
  renderGrowthView();
});
$('tree-size').addEventListener('change', (e) => {
  state.treeSize = Number((e.target as HTMLSelectElement).value);
  renderGrowthView();
});
$('growth').addEventListener('input', (e) => {
  state.growth = Number((e.target as HTMLInputElement).value);
  drawGrowthStage();
});
$('grow-toggle').addEventListener('click', () => {
  if (state.growth >= 1) state.growth = 0;
  state.growing = !state.growing;
  $('grow-toggle').textContent = state.growing ? 'Pause' : 'Grow';
  drawGrowthStage();
});
$('grow-reset').addEventListener('click', () => {
  state.growth = 0;
  state.growing = false;
  $('grow-toggle').textContent = 'Grow';
  drawGrowthStage();
});


// ─── Fidelity lab ────────────────────────────────────────────────────────────

let fidAnimated: { canvas: HTMLCanvasElement; genome: ReturnType<typeof generateGenomeFor>; base: BlobbiPose }[] = [];
let fidLast = 0;
let fidTime = 0;
const generateGenomeFor = (seed: string) => blobbiIdentity(seed).genome;
let motionStyleInjected = false;

function fidPose(): BlobbiPose {
  const f = state.fidelity;
  const view = f.view === 'back' ? 'back' : f.view === 'front' ? 'front' : 'side';
  return { ...REST_POSE, view, facing: f.view === 'side-left' ? -1 : 1, expression: f.expression };
}

/** The kit's SVG as a DOM element, sized so its standing height is `standingPx` on screen. */
function canonicalElement(genome: ReturnType<typeof generateGenomeFor>, pose: BlobbiPose, standingPx: number, animate: boolean): HTMLElement {
  if (!motionStyleInjected) {
    const style = document.createElement('style');
    style.textContent = MOTION_STYLESHEET;
    document.head.append(style);
    motionStyleInjected = true;
  }
  const st = stateForPose(pose);
  if (animate) {
    st.motion = 'walking';
    delete st.phase;
  }
  const svg = renderBlobbiSvg(genome, st, { idPrefix: `f${Math.random().toString(36).slice(2, 7)}` });
  const wrap = document.createElement('div');
  wrap.className = 'canon';
  const h = (238.125 / CANONICAL_STANDING_HEIGHT) * standingPx;
  wrap.style.width = `${(h * 211.66666) / 238.125}px`;
  wrap.style.height = `${h}px`;
  wrap.innerHTML = svg;
  return wrap;
}

function renderFidelityView(): void {
  if (state.mode !== 'fidelity') return;
  const host = $('fidelity-view');
  host.innerHTML = '';
  fidAnimated = [];
  const f = state.fidelity;
  const pose = fidPose();
  if (f.faces) {
    renderFaceGallery(host, pose);
    return;
  }
  const seeds = f.seeds.split(',').map((x) => x.trim()).filter(Boolean);
  const head = document.createElement('h3');
  head.textContent = `canonical Adult V3  |  canonical pixel raster ${f.size} px × ${f.zoom}${f.native ? '  |  native sprite (approach A)' : ''}`;
  host.append(head);
  const t0 = performance.now();
  for (const seed of seeds) {
    const genome = generateGenomeFor(seed);
    const id = blobbiIdentity(seed);
    const row = document.createElement('div');
    row.className = 'preview-row fid-row';
    const standingPx = f.size * f.zoom;
    const canon = canonicalElement(genome, pose, standingPx, f.animate);
    const b = buildCanonicalSprite(genome, pose, f.size, { outline: f.outline });
    const bFig = spriteFigure(b, `${seed} · pixel ${f.size}px`, f.zoom);
    const bCanvas = bFig.querySelector('canvas')!;
    bCanvas.dataset.size = String(f.size);
    if (f.animate) fidAnimated.push({ canvas: bCanvas, genome, base: pose });
    const cf = document.createElement('figure');
    const cap = document.createElement('figcaption');
    cap.textContent = `${seed} · canonical V3`;
    cf.append(canon, cap);
    row.append(cf, bFig);
    if (f.native) row.append(spriteFigure(buildNativeSprite(id, pose, f.size), `${seed} · native (A)`, f.zoom));
    host.append(row);
  }
  // Gameplay-size strip: the sprite exactly as the game draws it, at the play zoom, beside the canonical at the same screen height.
  const gh = document.createElement('h3');
  gh.textContent = `gameplay size: ${state.blobbiSize} px at ${state.playZoom}× (what the player sees)`;
  host.append(gh);
  const strip = document.createElement('div');
  strip.className = 'preview-row fid-row';
  for (const seed of seeds) {
    const genome = generateGenomeFor(seed);
    const s = buildCanonicalSprite(genome, pose, state.blobbiSize, { outline: f.outline });
    strip.append(canonicalElement(genome, pose, state.blobbiSize * state.playZoom, false), spriteFigure(s, `${seed} · ${state.blobbiSize}px ×${state.playZoom}`, state.playZoom));
    if (f.animate) {
      const c = strip.lastElementChild!.querySelector('canvas')!;
      c.dataset.size = String(state.blobbiSize);
      fidAnimated.push({ canvas: c, genome, base: pose });
    }
  }
  host.append(strip);
  $('stats').innerHTML = `fidelity  <b>${seeds.length}</b> seeds, ${pose.view}${pose.view === 'side' ? (pose.facing > 0 ? ' right' : ' left') : ''}, ${pose.expression}\nsize      ${f.size} px × ${f.zoom}  (gameplay ${state.blobbiSize} px × ${state.playZoom})\nbuilt in  ${(performance.now() - t0).toFixed(0)} ms\nstanding  ${CANONICAL_STANDING_HEIGHT.toFixed(1)} viewBox units = ${f.size} px`;
}

/** FACE GALLERY: 24 seeds, each as canonical | pixel 24 px | enlarged face | gameplay size. The face crop is
 * framed on the kit's own eye line, so every row shows the same anatomy. */
function renderFaceGallery(host: HTMLElement, pose: BlobbiPose): void {
  const t0 = performance.now();
  const head = document.createElement('h3');
  head.textContent = `face gallery · ${pose.expression} · canonical | pixel 24 px ×4 | face ×10 | gameplay ${state.blobbiSize} px ×${state.playZoom}`;
  host.append(head);
  const grid = document.createElement('div');
  grid.className = 'face-grid';
  for (let i = 0; i < 24; i++) {
    const seed = `blobbi-${i}`;
    const genome = generateGenomeFor(seed);
    const row = document.createElement('div');
    row.className = 'face-row';
    const label = document.createElement('div');
    label.className = 'face-label';
    label.textContent = seed;
    const canon = canonicalElement(genome, pose, 72, false);
    const b = buildCanonicalSprite(genome, pose, 24, { outline: state.fidelity.outline });
    const full = spriteFigure(b, '24 px', 4);
    // Face crop around the canonical eye line.
    const geo = buildBlobbiGeometry(deriveMorphology(genome, 'adult'), normalizeState(stateForPose(pose)));
    const k = 24 / CANONICAL_STANDING_HEIGHT;
    const fx = Math.round((geo.body.apex.x * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.tx) * k + 2);
    const fy = Math.round(((geo.face?.eyeLineY ?? geo.body.top) * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.ty) * k + 2);
    const cropBuf = new PixelBuffer(14, 14);
    cropBuf.fill(COZY.grass.mid);
    for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
      const v = b.buffer.get(fx - 7 + x, fy - 5 + y);
      if (v >>> 24) cropBuf.data[y * 14 + x] = v;
    }
    const cropCanvas = toCanvas(cropBuf);
    cropCanvas.className = 'preview';
    cropCanvas.style.width = '140px';
    cropCanvas.style.height = '140px';
    const cropFig = document.createElement('figure');
    const cropCap = document.createElement('figcaption');
    cropCap.textContent = 'face ×10';
    cropFig.append(cropCanvas, cropCap);
    const game = spriteFigure(buildCanonicalSprite(genome, pose, state.blobbiSize, { outline: state.fidelity.outline }), `${state.blobbiSize} px ×${state.playZoom}`, state.playZoom);
    const canonFig = document.createElement('figure');
    const canonCap = document.createElement('figcaption');
    canonCap.textContent = 'canonical';
    canonFig.append(canon, canonCap);
    row.append(label, canonFig, full, cropFig, game);
    grid.append(row);
  }
  host.append(grid);
  $('stats').innerHTML = `face gallery  <b>24</b> seeds, ${pose.expression}\nbuilt in  ${(performance.now() - t0).toFixed(0)} ms`;
}

function fidelityFrame(now: number): void {
  requestAnimationFrame(fidelityFrame);
  if (state.mode !== 'fidelity' || !state.fidelity.animate || !fidAnimated.length) return;
  const dt = fidLast ? Math.min(0.05, (now - fidLast) / 1000) : 0;
  fidLast = now;
  fidTime += dt;
  const frame = Math.floor((fidTime / 0.62) * WALK_FRAMES) % WALK_FRAMES;
  for (const a of fidAnimated) {
    const sizePx = Number(a.canvas.dataset.size);
    const pose: BlobbiPose = { ...a.base, walk: frame as BlobbiPose['walk'] };
    const s = buildCanonicalSprite(a.genome, pose, sizePx, { outline: state.fidelity.outline });
    const pad = 4;
    const buf = new PixelBuffer(Number(a.canvas.dataset.w), Number(a.canvas.dataset.h));
    buf.fill(COZY.grass.mid);
    const gx = Number(a.canvas.dataset.gx);
    const gy = Number(a.canvas.dataset.gy);
    buf.fillEllipse(gx + 0.5, gy + 0.5, s.footRx + 1, s.footRy, COZY.shadowOnGrass);
    buf.blit(s.buffer, gx - s.anchorX, gy - s.anchorY);
    void pad;
    toCanvas(buf, a.canvas);
  }
}

for (const [id, key] of [['fid-outline', 'outline'], ['fid-native', 'native'], ['fid-animate', 'animate'], ['fid-faces', 'faces']] as const) {
  $(id).addEventListener('change', (e) => {
    state.fidelity[key] = (e.target as HTMLInputElement).checked;
    renderFidelityView();
  });
}
$('fid-seeds').addEventListener('change', (e) => {
  state.fidelity.seeds = (e.target as HTMLInputElement).value;
  renderFidelityView();
});
fidExprSelect.addEventListener('change', () => {
  state.fidelity.expression = fidExprSelect.value as Expression;
  renderFidelityView();
});
$('fid-view').addEventListener('change', (e) => {
  state.fidelity.view = (e.target as HTMLSelectElement).value as typeof state.fidelity.view;
  renderFidelityView();
});
$('fid-size').addEventListener('change', (e) => {
  state.fidelity.size = Number((e.target as HTMLSelectElement).value);
  renderFidelityView();
});
$('fid-zoom').addEventListener('change', (e) => {
  state.fidelity.zoom = Number((e.target as HTMLSelectElement).value);
  renderFidelityView();
});

// ─── Shared controls ─────────────────────────────────────────────────────────

function syncControls(): void {
  seedInput.value = state.seed;
  $<HTMLSelectElement>('islands').value = String(state.options.islands);
  paletteSelect.value = state.options.palette;
  $<HTMLInputElement>('density').value = String(state.options.density);
  $('density-value').textContent = state.options.density.toFixed(1);
  $<HTMLSelectElement>('size').value = `${state.options.width}x${state.options.height}`;
  $<HTMLSelectElement>('world-scale').value = String(state.options.scale);
  $<HTMLSelectElement>('world-kind').value = state.options.kind;
  $<HTMLInputElement>('turtle-seed').value = state.turtleSeed;
  $<HTMLSelectElement>('shell-variant').value = String(state.shellVariant);
  $<HTMLInputElement>('live-autonomy').checked = live ? live.brain.enabled : true;
  $<HTMLInputElement>('live-path').checked = state.live.debugPath;
  $<HTMLInputElement>('layer-terrain').checked = state.render.terrain;
  $<HTMLInputElement>('layer-vegetation').checked = state.render.vegetation;
  $<HTMLInputElement>('layer-structures').checked = state.render.structures;
  $<HTMLInputElement>('layer-details').checked = state.render.details;
  $<HTMLInputElement>('layer-shadows').checked = state.render.shadows;
  $<HTMLInputElement>('gallery-prefix').value = state.galleryPrefix;
  $<HTMLSelectElement>('gallery-count').value = String(state.galleryCount);
  $<HTMLSelectElement>('play-speed').value = String(state.speed);
  $<HTMLSelectElement>('play-zoom').value = String(state.playZoom);
  $<HTMLInputElement>('blobbi-seed').value = state.blobbiSeed;
  $<HTMLInputElement>('blobbi-seed-2').value = state.blobbiSeed;
  $<HTMLSelectElement>('blobbi-size').value = String(state.blobbiSize);
  $<HTMLInputElement>('live-water').checked = state.live.animateWater;
  $<HTMLInputElement>('live-wind').checked = state.live.animateWind;
  $<HTMLInputElement>('live-shadows').checked = state.live.shadows;
  $<HTMLInputElement>('live-debug').checked = state.live.debugCollision;
  $<HTMLInputElement>('tree-seed').value = state.treeSeed;
  $<HTMLSelectElement>('tree-size').value = String(state.treeSize);
  $<HTMLInputElement>('growth').value = String(state.growth);
  $('growth-value').textContent = state.growth.toFixed(2);
  $<HTMLInputElement>('fid-seeds').value = state.fidelity.seeds;
  fidExprSelect.value = state.fidelity.expression;
  $<HTMLSelectElement>('fid-view').value = state.fidelity.view;
  $<HTMLSelectElement>('fid-size').value = String(state.fidelity.size);
  $<HTMLSelectElement>('fid-zoom').value = String(state.fidelity.zoom);
  $<HTMLInputElement>('fid-outline').checked = state.fidelity.outline;
  $<HTMLInputElement>('fid-native').checked = state.fidelity.native;
  $<HTMLInputElement>('fid-animate').checked = state.fidelity.animate;
  $<HTMLInputElement>('fid-faces').checked = state.fidelity.faces;
}

/** A fresh seed for the UI. The one place randomness is allowed: it only picks which seed to look at. */
function randomSeed(kind: 'world' | 'blobbi' | 'tree' | 'turtle' = 'world'): string {
  const words = kind === 'world' ? ['moss', 'cove', 'fern', 'reef', 'pine', 'dune', 'brook', 'glade', 'shoal', 'bluff', 'marsh', 'knoll'] : kind === 'blobbi' ? ['pip', 'momo', 'zuzu', 'lila', 'bobo', 'nina', 'kiki', 'tato', 'yumi', 'ollo'] : kind === 'turtle' ? ['shelly', 'old', 'moss', 'tide', 'drift', 'kelp'] : ['oak', 'elm', 'fir', 'ash', 'yew', 'fig'];
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return `${words[bytes[0] % words.length]}-${(bytes[1] % 10000).toString().padStart(4, '0')}`;
}

seedInput.addEventListener('change', () => {
  state.seed = seedInput.value.trim() || 'blobbi';
  regenerate();
});
$('randomize').addEventListener('click', () => {
  state.seed = randomSeed();
  syncControls();
  regenerate();
});
$('regenerate').addEventListener('click', () => {
  state.seed = seedInput.value.trim() || 'blobbi';
  regenerate();
});
$('islands').addEventListener('change', (e) => {
  state.options.islands = Number((e.target as HTMLSelectElement).value);
  regenerate();
});
paletteSelect.addEventListener('change', () => {
  state.options.palette = paletteSelect.value;
  spriteCache.clear();
  regenerate();
});
$('density').addEventListener('input', (e) => {
  state.options.density = Number((e.target as HTMLInputElement).value);
  $('density-value').textContent = state.options.density.toFixed(1);
  regenerate();
});
$('size').addEventListener('change', (e) => {
  const [w, h] = (e.target as HTMLSelectElement).value.split('x').map(Number);
  state.options.width = w;
  state.options.height = h;
  regenerate();
  fitZoom();
});
$('world-kind').addEventListener('change', (e) => {
  state.options.kind = (e.target as HTMLSelectElement).value as 'island' | 'turtle';
  stopLive();
  regenerate();
  fitZoom();
});
$('turtle-seed').addEventListener('change', (e) => {
  state.turtleSeed = (e.target as HTMLInputElement).value.trim() || 'turtle-0';
  stopLive();
  regenerate();
});
{
  const sel = $<HTMLSelectElement>('shell-variant');
  for (const v of SHELL_VARIANTS) {
    const o = document.createElement('option');
    o.value = String(v.id);
    o.textContent = v.label;
    sel.append(o);
  }
  sel.addEventListener('change', (e) => {
    const v = Number((e.target as HTMLSelectElement).value);
    state.shellVariant = isShellVariant(v) ? v : 0;
    regenerate();
    fitZoom();
  });
}
$('turtle-random').addEventListener('click', () => {
  state.turtleSeed = randomSeed('turtle');
  syncControls();
  stopLive();
  regenerate();
});
$('live-autonomy').addEventListener('change', (e) => {
  if (live) live.brain.enabled = (e.target as HTMLInputElement).checked;
  view.focus();
});
$('world-scale').addEventListener('change', (e) => {
  state.options.scale = Number((e.target as HTMLSelectElement).value);
  spriteCache.clear();
  regenerate();
});
for (const layer of ['terrain', 'vegetation', 'structures', 'details', 'shadows'] as const) {
  $(`layer-${layer}`).addEventListener('change', (e) => {
    state.render[layer] = (e.target as HTMLInputElement).checked;
    rerender();
  });
}
$('zoom-in').addEventListener('click', () => zoomAt(state.zoom + 1, view.width / 2, view.height / 2));
$('zoom-out').addEventListener('click', () => zoomAt(state.zoom - 1, view.width / 2, view.height / 2));
$('zoom-fit').addEventListener('click', fitZoom);
$('export').addEventListener('click', () => {
  if (!image) return;
  const scaled = toCanvas(image.scaled(state.zoom));
  const a = document.createElement('a');
  a.download = `blobbi-pixel-lab-${state.seed}-${state.zoom}x.png`;
  a.href = scaled.toDataURL('image/png');
  a.click();
});

function zoomAt(next: number, sx: number, sy: number): void {
  const z = Math.max(1, Math.min(10, Math.round(next)));
  if (z === state.zoom) return;
  const wx = (sx - state.panX) / state.zoom;
  const wy = (sy - state.panY) / state.zoom;
  state.zoom = z;
  state.panX = Math.round(sx - wx * z);
  state.panY = Math.round(sy - wy * z);
  draw();
}

let drag: { x: number; y: number; panX: number; panY: number } | null = null;
view.addEventListener('pointerdown', (e) => {
  view.focus();
  if (state.mode !== 'world') return;
  drag = { x: e.clientX, y: e.clientY, panX: state.panX, panY: state.panY };
  view.setPointerCapture(e.pointerId);
  view.classList.add('dragging');
});
view.addEventListener('pointermove', (e) => {
  if (!drag) return;
  state.panX = drag.panX + (e.clientX - drag.x);
  state.panY = drag.panY + (e.clientY - drag.y);
  draw();
});
const endDrag = () => {
  drag = null;
  view.classList.remove('dragging');
};
view.addEventListener('pointerup', endDrag);
view.addEventListener('pointercancel', endDrag);
view.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (state.mode === 'play') {
      state.playZoom = Math.max(2, Math.min(6, state.playZoom + (e.deltaY < 0 ? 1 : -1)));
      $<HTMLSelectElement>('play-zoom').value = String(state.playZoom);
      return;
    }
    const rect = view.getBoundingClientRect();
    zoomAt(state.zoom + (e.deltaY < 0 ? 1 : -1), e.clientX - rect.left, e.clientY - rect.top);
  },
  { passive: false },
);

function resize(): void {
  const main = view.parentElement!;
  view.width = main.clientWidth;
  view.height = main.clientHeight;
  draw();
}
window.addEventListener('resize', resize);

// ─── Modes ───────────────────────────────────────────────────────────────────

function setMode(mode: Mode): void {
  state.mode = mode;
  for (const m of ['world', 'play', 'blobbi', 'growth', 'gallery', 'fidelity'] as Mode[]) $(`tab-${m}`).setAttribute('aria-selected', String(mode === m));
  $('view').classList.toggle('hidden', mode !== 'world' && mode !== 'play');
  $('gallery').classList.toggle('hidden', mode !== 'gallery');
  $('blobbi-view').classList.toggle('hidden', mode !== 'blobbi');
  $('growth-view').classList.toggle('hidden', mode !== 'growth');
  $('fidelity-view').classList.toggle('hidden', mode !== 'fidelity');
  $('panel-fidelity').classList.toggle('hidden', mode !== 'fidelity');
  $('panel-view').classList.toggle('hidden', mode !== 'world');
  $('panel-play').classList.toggle('hidden', mode !== 'play');
  $('panel-blobbi').classList.toggle('hidden', mode !== 'blobbi');
  $('panel-growth').classList.toggle('hidden', mode !== 'growth');
  $('panel-gallery').classList.toggle('hidden', mode !== 'gallery');
  saveHash();
  if (mode === 'gallery' && !$('gallery').childElementCount) renderGallery();
  if (mode === 'world') {
    resize();
    showWorldStats();
  }
  if (mode === 'play') {
    resize();
    if (!live) startLive();
    lastFrameTime = 0;
    view.focus();
  }
  if (mode === 'blobbi') renderBlobbiView();
  if (mode === 'growth') renderGrowthView();
  if (mode === 'fidelity') renderFidelityView();
}
for (const m of ['world', 'play', 'blobbi', 'growth', 'gallery', 'fidelity'] as Mode[]) $(`tab-${m}`).addEventListener('click', () => setMode(m));

$('gallery-prefix').addEventListener('change', (e) => (state.galleryPrefix = (e.target as HTMLInputElement).value.trim() || 'gallery'));
$('gallery-count').addEventListener('change', (e) => (state.galleryCount = Number((e.target as HTMLSelectElement).value)));
$('gallery-render').addEventListener('click', renderGallery);

function renderGallery(): void {
  const host = $('gallery');
  host.innerHTML = '';
  const t0 = performance.now();
  let flagged = 0;
  for (let i = 0; i < state.galleryCount; i++) {
    const seed = `${state.galleryPrefix}-${i}`;
    const savedTurtle = state.turtleSeed;
    if (state.options.kind === 'turtle') state.turtleSeed = seed; // each tile is its own turtle
    const w = makeWorld(seed);
    state.turtleSeed = savedTurtle;
    const img = renderWorld(w, state.render, spriteCache);
    const audit = auditWorld(w);
    if (!audit.ok) flagged++;
    const fig = document.createElement('figure');
    const c = toCanvas(img);
    const cap = document.createElement('figcaption');
    cap.innerHTML = `<span>${escapeHtml(seed)}${w.turtle ? ' · turtle ' + escapeHtml(w.turtle.genome.seed) : ''}</span><span>${w.stats.islands} isl · ${w.stats.bridges} br · ${w.objects.length} obj ${audit.ok ? '' : `<span class="warn" title="${escapeHtml(audit.issues.join('; '))}">⚠</span>`}</span>`;
    fig.append(c, cap);
    fig.addEventListener('click', () => {
      state.seed = seed;
      syncControls();
      stopLive();
      setMode('world');
      regenerate();
    });
    host.append(fig);
  }
  $('stats').innerHTML = `gallery   <b>${state.galleryCount}</b> worlds, prefix "${escapeHtml(state.galleryPrefix)}"\nflagged   <b>${flagged}</b> by audit\ntime      ${(performance.now() - t0).toFixed(0)} ms`;
}

// ─── Boot ────────────────────────────────────────────────────────────────────

syncControls();
resize();
world = makeWorld(state.seed);
rerender();
fitZoom();
setMode(state.mode);
rafId = requestAnimationFrame(playFrame);
requestAnimationFrame(previewFrame);
requestAnimationFrame(growthFrame);
requestAnimationFrame(fidelityFrame);
void rafId;
void hex;
