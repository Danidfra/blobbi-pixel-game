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
import { SHELL_VARIANTS, DEFAULT_SHELL_VARIANT, NEW_WORLD_SHELL_VARIANT, isShellVariant, type ShellVariant } from '../carrier/types';
import { renderWorld, type RenderOptions, DEFAULT_RENDER_OPTIONS } from '../render/compose';
import { auditWorld } from '../render/audit';
import type { OwnedBlobbi, ShareStatus } from '../nostr/port';
import type { WorldDescription, WorldOptions } from '../world/types';
import { DEFAULT_WORLD_OPTIONS } from '../world/types';
import { PALETTES, COZY } from '../core/palette';
import { PixelBuffer, type Sprite } from '../core/pixel';
import { hex } from '../core/color';
import { LiveWorld, QUICK_PACE, type LiveInput } from '../sim/live-world';
import { localStore, memoryStore } from '../game/persistence';
import { createNostrAccount } from '../nostr';
import { loadAccount } from '../nostr/account-store';
import { effectiveSelection, loadSelection, loadSelectionRecord, markSelectionChosen, markSelectionSynced, noteUnstampedChoice, setSelectionStage, storeGuestSelection, storeSelection, type SeenProfile, type SelectionWhen } from '../game/blobbi-selection';
import { CompanionSync, type RemoteCompanion } from '../game/companion-sync';
import { createPresenceHost } from '../game/presence-host';
import { activePresenceKey, createTravelHost, entryDecision, placeUnknown, travelCueFor, worldTravelMode, WORLD_TRAVEL_SWITCH_KEY, type TravelHost } from '../game/travel-host';
import { WORLD_HOME, createWorldTravel, type WorldTravelSigner, type WorldTravelSnapshot } from '@blobbi-kit/core';
import { cookieLeaseStore } from '../game/presence-page';
import { HOME_APP } from '../game/world-presence';
import { resolveBlobbi, describeSource, sourceFromSeed, worldFormSource, DEMO_BLOBBI_SEED, type BlobbiSource, type ResolvedBlobbi } from '../blobbi/source';
import { cleanWorldFormTraits } from '../blobbi/world-form';
import { acceptWorldForm, worldFormSeen } from '../game/world-form-memory';
import { isLocalBlobbiSeed, localBlobbi, markBorn } from '../game/local-blobbis';
import { awaitsName, chooseGuestName, forgetUnbornGuestBlobbi, guestBlobbi, readGuestBlobbis, updateGuestBlobbi, type GuestBlobbi } from '../game/guest-blobbis';
import { IdentityScreen } from '../ui/screens/identity';
import { NamingScreen } from '../ui/screens/naming';
import type { IdentityService } from '../nostr/identity';
import { lastVisitor, recordVisit, visitedBefore } from '../game/island-visits';
import { currentSelectionAt, decideChosen, entryAddress, ENTRY_DIAGNOSTIC_KEY, entryDiagnostic, rememberStay, runEntry, stayedWith, type EntryDecision, type EntryFacts } from '../game/world-entry';
import { EntryScreen } from '../ui/entry-screen';
import { RESOURCE_KINDS, RESOURCE_LABEL, RESOURCE_ITEM } from '../game/resources';
import { ITEMS, TOOLS, FOODS, itemLabel, itemPlural } from '../game/items';
import { RECIPES, canCraft, recipeById } from '../game/crafting';
import { toolIcon } from '../game/equipment';
import { BUILDINGS, BUILDING_KINDS, type BuildingKind } from '../game/buildings';
import { CROPS, CROP_KINDS, STAGE_NAMES, cropProgress, isWet, isMature } from '../game/farming';
import { OBJECTIVES, currentObjective } from '../game/objectives';
import { isHungry, isTired } from '../game/care';
import { isLargeRock } from '../game/rocks';
import { ViewCamera, CAMERA_CYCLE, CAMERA_MODES, DEFAULT_CAMERA_MODE, isCameraMode, worldBounds, type CameraModeId, type WorldBounds } from '../render/view-camera';
import { ViewRenderer, DEFAULT_VIEW_UI, type ViewUiOptions } from '../render/view-renderer';
import { ARRIVE } from '../game/teleport';
import { paletteFor } from '../world/generate';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS, type LiveRenderOptions } from '../render/live-render';
import { GameUI, hudScale, readStoredSettings, settingsRecord } from '../ui/game-ui';
import { hotbarIndexForKey, isTypingTarget, nextToolInCycle } from '../ui/hotbar';
import { AccountInvite, isBusy } from '../ui/account-invite';
import { textPreference } from '../ui/surface';
import { getLocale, initialLocale, loadLocale, LOCALE_KEY, onLocaleChange, setLocale, t } from '../i18n';
import '../content/text'; // content text follows the language (items, quests, notes...)
import { InventoryScreen } from '../ui/screens/inventory';
import { StorageScreen } from '../ui/screens/storage';
import { CraftingScreen } from '../ui/screens/crafting';
import { JournalScreen } from '../ui/screens/journal';
import { CareScreen } from '../ui/screens/care';
import { SettingsScreen } from '../ui/screens/settings';
import { BlobbisScreen } from '../ui/screens/blobbis';
import { CarrierScreen } from '../ui/screens/carrier';
import { MapScreen } from '../ui/screens/map';
import { GrowthScreen } from '../ui/screens/growth';
import { growLiveIsland, rebuildFromSave as rebuildLive } from '../sim/regrow';
import { WorldsScreen } from '../ui/screens/worlds';
import { HomeScreen } from '../ui/screens/home';
import { GuideScreen } from '../ui/screens/guide';
import { installCustomisation } from '../ui/screens/home-style';
import { LocalVisitTransport, VisitSession, localPlayerId, OWNERS_KEY, type WorldRef } from '../game/visiting';
import { AudioEngine, DEFAULT_AUDIO } from '../audio/engine';
import { GameAudio } from '../audio/director';
import { TitleScreen, CARD_PIC, type Companion, type NewOwner } from '../ui/title';
import { displayName } from '../game/island-name';
import { generateMantaWorld } from '../carriers/manta-world';
import { generateWhaleWorld } from '../carriers/whale-world';
import { speciesThumbnail } from '../carriers/species';
import { TouchControls } from '../ui/touch';
import { IntroCinematic, type IntroResult } from '../cinematic/intro';
import { introPreviewWorld, isIntroSpecies } from '../cinematic/preview';
import type { CarrierKind } from '../game/carrier';
import { activeWorld, listWorlds, newWorldSeeds, resolveFrame, readIndex, touchIndex, worldName, ACTIVE_WORLD_KEY, WORLD_INDEX_KEY, hasSave, type WorldEntry } from '../game/worlds';
import { worldIdentity } from '../game/persistence';
import { ConfirmGate, CONFIRM_ARM_SECONDS, deleteWorld } from '../game/world-delete';
import { blobbiIdentity, identityOfSource } from '../blobbi/identity';
import { buildCanonicalSprite, stateForPose, WALK_FRAMES, CANONICAL_STANDING_HEIGHT, type BlobbiStage } from '../blobbi/canonical';
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
  /** The genome seed of the selected Blobbi (`blobbi.seed`). */
  blobbiSeed: string;
  /** The selected Blobbi: a V3 address, a V3 seed or a demo seed. Persisted per browser; owns nothing. */
  blobbi: BlobbiSource;
  blobbiSize: number;
  /** M11D.1: the stage the walking Blobbi is drawn at (an account's canonical Baby; else the adult). */
  blobbiStage: BlobbiStage;
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

/**
 * The Blobbi at start-up: one named by the link (`#pubkey=…&d=…` or `#blobbi=…`), else the one selected in this
 * browser before (survives reloads), else the demo Blobbi. A link that names an invalid Blobbi is reported, not
 * repaired, and the next choice is used.
 */
const startupBlobbi: { source: BlobbiSource; message: string; error: boolean; stage?: BlobbiStage } = (() => {
  let message = '';
  if (params.has('pubkey') || params.has('d') || params.has('blobbi')) {
    const r = params.has('pubkey') || params.has('d') ? resolveBlobbi({ pubkey: params.get('pubkey') ?? '', d: params.get('d') ?? '' }) : resolveBlobbi({ seed: params.get('blobbi') ?? '' });
    if (r.ok) return { source: r.source, message: r.notes.join(' '), error: false };
    message = `The link's Blobbi was not used: ${r.error}`;
  }
  const store = localStore();
  const saved = store ? loadSelection(store) : null;
  return { source: saved ?? sourceFromSeed(DEMO_BLOBBI_SEED), message, error: message !== '' };
})();
// M11C: a Blobbi chosen with an account walks only while that account is connected here (a link naming it too).
{
  const store = localStore();
  const rec = store ? loadSelectionRecord(store) : null;
  if (rec?.account && rec.source.seed === startupBlobbi.source.seed && loadAccount(store!)?.pubkey !== rec.account) startupBlobbi.source = sourceFromSeed(DEMO_BLOBBI_SEED);
  // M11D.1: a canonical Baby walks as a Baby (only the stored choice itself, never a link or the demo).
  else if (rec?.stage === 'baby' && rec.source.seed === startupBlobbi.source.seed) startupBlobbi.stage = 'baby';
}
/** Guest or Connected, for the HUD chip (M11C): what the account remembers on this device, never a guess. */
let identity: 'guest' | 'connected' = 'guest';
/** The connected public key (kept in step by the account's change events: no per-frame work). */
let connectedPubkey: string | null = null;
/** The canonical Blobbi's name for the HUD (null: the seed, as before). */
let shownName: string | null = null;

const state: State = {
  seed: params.get('seed') ?? 'blobbi',
  options: { ...DEFAULT_WORLD_OPTIONS, kind: (params.get('kind') as 'island' | 'turtle' | 'manta' | 'whale') ?? 'turtle', ...(params.get('house') === 'none' ? { generatedHouse: false } : {}) },
  render: { ...DEFAULT_RENDER_OPTIONS },
  live: { ...DEFAULT_LIVE_OPTIONS },
  zoom: 2,
  panX: 0,
  panY: 0,
  // The game is the front door: a plain link opens Play (the title); the lab tabs are one click away.
  mode: (params.get('mode') as Mode) ?? 'play',
  galleryPrefix: 'gallery',
  galleryCount: 12,
  blobbiSeed: startupBlobbi.source.seed,
  blobbi: startupBlobbi.source,
  blobbiSize: 16,
  blobbiStage: startupBlobbi.stage ?? 'adult',
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
      <label>World <select id="world-kind"><option value="turtle">turtle (M1)</option><option value="island">islands (phases 1-3)</option><option value="manta">manta (M7)</option><option value="whale">whale (M8)</option></select></label>
      <label>Turtle seed <input id="turtle-seed" type="text" spellcheck="false" /></label>
      <div class="row"><button id="turtle-random">Random turtle</button></div>
      <label>Shell variant <select id="shell-variant"></select></label>
      <div class="hint">World Carrier shell variants: B (70%) is the lab's default and what existing worlds keep; 0 is the M1 turtle unchanged; A and C enlarge the visible shell to ≈60/80% island coverage (island, collision, navigation and the Blobbi identical in all four). S (≈40%) is a smaller starting island on a shell with room to grow: what NEW ISLAND makes.</div>
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
      <label>Camera <select id="play-camera"><option value="overview">Overview (1×, whole turtle)</option><option value="exploration">Exploration (2×, follows)</option><option value="closeup">Close-up (4×, follows)</option><option value="upclose">Up close (6×, follows)</option></select></label>
      <label>Blobbi seed <input id="blobbi-seed" type="text" spellcheck="false" placeholder="64-hex V3 seed or a demo seed" /></label>
      <div class="row"><button id="blobbi-random">Random demo</button><button id="blobbi-random-v3">Random V3 seed</button></div>
      <label>Owner pubkey <input id="blobbi-pubkey" type="text" spellcheck="false" placeholder="64 hex digits" /></label>
      <label>Blobbi d tag <input id="blobbi-d" type="text" spellcheck="false" placeholder="blobbi-&lt;12 hex&gt;-&lt;10 hex&gt;" /></label>
      <div class="row"><button id="blobbi-address">Use V3 address</button></div>
      <div class="hint" id="blobbi-status"></div>
      <div class="hint">A V3 address (owner pubkey + d tag) or a 64-hex V3 seed is the same Blobbi as in the Standalone; other strings are lab-only demo Blobbis. The choice is remembered in this browser. The island, inventory and buildings belong to the world, not to the Blobbi: switching Blobbis keeps them.</div>
      <label>Blobbi size <select id="blobbi-size"><option>12</option><option>14</option><option>16</option><option>18</option><option>20</option><option>24</option><option>32</option></select></label>
      <label class="check"><input id="live-water" type="checkbox" /> animate water</label>
      <label class="check"><input id="live-wind" type="checkbox" /> animate wind</label>
      <label class="check"><input id="live-shadows" type="checkbox" /> shadows</label>
      <label class="check"><input id="live-debug" type="checkbox" /> debug collision</label>
      <label class="check"><input id="live-autonomy" type="checkbox" /> autonomy (WASD takes over, resumes after 5 s)</label>
      <label class="check"><input id="live-path" type="checkbox" /> debug path and nav grid</label>
      <div class="hint">WASD / arrows move · E or Space: pick up, then farm (harvest, water, plant, till with the hoe), then chop / mine, else look · F feed · H pet · R rest (again to wake) · T next seed · C / V / G craft axe / pickaxe / hoe · Q switch tool · B build (cycles what), Esc cancel · O goals on/off · P plant a tree · Z camera mode (or the wheel) · click the view first</div>
      <h2>Objectives</h2>
      <div id="objectives" class="stats"></div>
      <h2>Blobbi care</h2>
      <div id="care" class="stats"></div>
      <div class="row"><button id="care-feed" class="primary">Feed (F)</button><button id="care-pet">Pet (H)</button><button id="care-rest">Rest (R)</button></div>
      <div class="hint">Needs fall slowly while you play (never while the game is closed). Food restores FED; resting restores ENERGY, twice as fast in the shelter's doorway; feeding, resting, exploring, decorations and attention raise JOY. Low needs only slow Blobbi a little and change its face. Autonomy rests on its own when tired but never eats, harvests or uses the bag.</div>
      <h2>Inventory</h2>
      <div id="inventory" class="stats"></div>
      <div class="row" id="axe-icon-row" style="align-items:center;gap:8px"><canvas id="axe-icon" width="36" height="36"></canvas><span class="hint" id="axe-icon-label">simple axe</span></div>
      <div class="row" id="pickaxe-icon-row" style="align-items:center;gap:8px"><canvas id="pickaxe-icon" width="36" height="36"></canvas><span class="hint" id="pickaxe-icon-label">simple pickaxe</span></div>
      <h2>Crafting</h2>
      <div id="crafting" class="stats"></div>
      <div class="row"><button id="craft-axe" class="primary">Craft simple axe (C)</button><button id="craft-pickaxe" class="primary">Craft pickaxe (V)</button><button id="craft-hoe" class="primary">Craft hoe (G)</button></div>
      <div class="row"><button id="equip-axe">Switch tool (Q)</button></div>
      <div class="hint">Simple pickaxe: 2 wood + 2 sticks + 3 stones. With the pickaxe equipped, face a large rock and press E four times: stones go in the bag, rubble stays, and the rock is whole again after five minutes of world time. Sticks, stones and seeds grow back two to three minutes after you pick them up. Q cycles through the tools you own (and empty hands).</div>
      <div class="hint">Simple axe: 3 sticks + 2 stones. With the axe equipped, face a tree and press E three times to fell it: wood goes in the bag, a stump stays, and the same tree regrows over four minutes of world time (continuing across reloads).</div>
      <h2>Farming</h2>
      <div id="farming" class="stats"></div>
      <div class="row"><button id="farm-seed">Next seed (T)</button></div>
      <div class="hint">Simple hoe: 1 wood + 2 sticks + 1 stone. Equip it (Q) and press E on flat grass: the cell in front becomes a farm plot (green frame = fits). Face a plot and press E to plant (turnips from wild seeds; carrots and pumpkins from goal rewards), to water a crop that shows a drop, and to harvest it when ripe. Crops grow only while watered: about 2-3 waterings each. Growth is in world time and continues across reloads.</div>
      <h2>Building</h2>
      <div id="building" class="stats"></div>
      <div class="row" id="build-buttons"></div>
      <div class="hint">B shows a preview in front of the Blobbi (green = fits, red = why not) and cycles through what you can build; E places it and the materials leave the bag; Esc cancels. Decorations unlock with goals. Everything keeps its place on the island across reloads.</div>
      <div class="row"><button id="progress-reset">Delete this island's progress…</button></div>
      <div id="reset-confirm" class="confirm hidden" role="alertdialog" aria-labelledby="reset-confirm-text">
        <div class="hint" id="reset-confirm-text"></div>
        <div class="row"><button id="reset-cancel" class="primary">Cancel</button><button id="reset-delete" class="danger" disabled>Delete</button></div>
      </div>
      <div class="hint">Sticks lie under trees, stones by rocks and on the forest floor, seeds by bushes and flowers. Collected resources and the inventory persist per world in this browser (versioned, keyed by seed, turtle, variant and size). Autonomy never collects.</div>
      <div id="dev-tools"></div>
    </section>
    <section id="panel-blobbi" class="hidden">
      <h2>Blobbi</h2>
      <label>Seed <input id="blobbi-seed-2" type="text" spellcheck="false" placeholder="64-hex V3 seed or a demo seed" /></label>
      <div class="hint" id="blobbi-status-2"></div>
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
    <div id="rotate-hint" role="status">Turn your device sideways to play Blobbi: the island needs a wide screen.</div>
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
  // In Play, the link names an island only once it is being played or has a save: a reload of the title alone stays
  // a plain link (so it never looks like a shared island).
  const menu = state.mode === 'play' && menuChosen ? '&menu=1' : '';
  if (state.mode === 'play' && !playStarted && !(live && hasSave(live.identity, storeGet))) {
    if (location.hash !== `#mode=play${menu}`) history.replaceState(null, '', `#mode=play${menu}`);
    return;
  }
  const b = state.blobbi;
  const blobbi = b.kind === 'v3-address' ? `pubkey=${b.pubkey}&d=${encodeURIComponent(b.d)}` : `blobbi=${encodeURIComponent(b.seed)}`;
  location.hash = `seed=${encodeURIComponent(state.seed)}&mode=${state.mode}&${blobbi}&kind=${state.options.kind}&turtle=${encodeURIComponent(state.turtleSeed)}&variant=${state.shellVariant}${state.options.generatedHouse === false ? '&house=none' : ''}${menu}`;
}

// ─── World mode ──────────────────────────────────────────────────────────────

/** The generated cottage option, only when it is off (worlds made before M8 never carry the field). */
const houseOption = (): { generatedHouse?: false } => (state.options.generatedHouse === false ? { generatedHouse: false } : {});

/** The world for the current options: a turtle carrying the land, or the phase 1-3 archipelago. */
function makeWorld(seed: string): WorldDescription {
  // A creature world has its own canvas (the manta and the whale need the room): only the look options carry over.
  if (state.options.kind === 'manta') return generateMantaWorld(seed, { palette: state.options.palette, density: state.options.density, scale: state.options.scale, carrierSeed: state.turtleSeed, ...houseOption() });
  if (state.options.kind === 'whale') return generateWhaleWorld(seed, { palette: state.options.palette, density: state.options.density, scale: state.options.scale, carrierSeed: state.turtleSeed, ...houseOption() });
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
/**
 * The loaded world has been played (or is a new island): only then does leaving the page save it. A world shown
 * behind the title but never played is not written, so looking at the title never creates a save.
 */
let playStarted = false;
/** M11D.8: the player chose SETTINGS > MAIN MENU: the address says `menu` until play starts again (a reload keeps the title). */
let menuChosen = params.has('menu');
let liveRenderer: LiveRenderer | null = null;
let viewRenderer: ViewRenderer | null = null;
let bounds: WorldBounds | null = null;
const CAMERA_KEY = 'blobbi-pixel:camera-mode';
/** The camera mode is a viewer preference (browser storage), never part of the world save. */
function storedCameraMode(): CameraModeId {
  try {
    const v = localStorage.getItem(CAMERA_KEY);
    return isCameraMode(v) ? v : DEFAULT_CAMERA_MODE;
  } catch {
    return DEFAULT_CAMERA_MODE;
  }
}
const viewCamera = new ViewCamera(storedCameraMode());
function setCameraMode(mode: CameraModeId): void {
  viewCamera.setMode(mode);
  $<HTMLSelectElement>('play-camera').value = mode;
  try {
    localStorage.setItem(CAMERA_KEY, mode);
  } catch {
    // Storage unavailable: the mode just is not remembered.
  }
}
let liveCanvas: HTMLCanvasElement | null = null;
const keys = new Set<string>();
let interactPressed = false;
let plantPressed = false;
let lastFrameTime = 0;
const frameTimes: number[] = [];
const simTimes: number[] = [];
const renderTimes: number[] = [];
const uploadTimes: number[] = [];
/** View render time per camera mode (the last 90 frames spent in each). */
const modeTimes: Record<CameraModeId, number[]> = { overview: [], exploration: [], closeup: [], upclose: [] };
let fps = 0;
let statsTimer = 0;
let rafId = 0;
/** The scene the camera framed last frame (a change snaps the camera). */
let lastScene = 'island';
/** The last camera view (tap-to-walk maps screen pixels to the world with it). */
let lastView: import('../render/view-camera').ViewRect | null = null;
/** The game's menus over the play view (inventory, storage, crafting, journal, care, cooking, settings). */
const gameUI = new GameUI(() => live, () => paletteFor(state.options.palette));
gameUI.register(new InventoryScreen());
gameUI.onUse = () => {
  interactPressed = true;
};
gameUI.register(new StorageScreen());
gameUI.register(new CraftingScreen());
gameUI.register(new CraftingScreen('cooking'));
gameUI.register(new JournalScreen());
gameUI.register(new CareScreen());
gameUI.register(new CarrierScreen());
gameUI.register(new MapScreen());
const growthScreen = new GrowthScreen();
gameUI.register(growthScreen);
growthScreen.onGrow = () => regrow();
gameUI.register(new GuideScreen());
const homeScreen = new HomeScreen();
installCustomisation(homeScreen);
gameUI.register(homeScreen);
const worldsScreen = new WorldsScreen();
gameUI.register(worldsScreen);
const settingsScreen = new SettingsScreen();
gameUI.register(settingsScreen);
// The language (M11B): the player's explicit choice, else the browser's languages (pt-* Portuguese, es-* Spanish,
// else English). Only an explicit choice is stored. Presentation only: no island, save or identity depends on it.
{
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LOCALE_KEY);
  } catch {
    /* private mode: detect each time */
  }
  const initial = initialLocale(stored, typeof navigator === 'undefined' ? [] : navigator.languages);
  // A language other than English is its own small chunk: wait for it (once, before anything is drawn), so the
  // first frame is already in the player's language. If it cannot load, the game simply stays in English.
  try {
    await loadLocale(initial);
  } catch {
    /* offline or blocked: English */
  }
  setLocale(initial);
  document.documentElement.lang = getLocale();
  // The page's own few words (the rest of the game is drawn on the canvas).
  const pageText = () => {
    const hint = document.getElementById('rotate-hint');
    if (hint) hint.textContent = t('rotate.hint');
    document.getElementById('island-name-input')?.setAttribute('aria-label', t('create.nameLabel'));
  };
  queueMicrotask(pageText);
  onLocaleChange((l) => {
    document.documentElement.lang = l;
    pageText();
    try {
      localStorage.setItem(LOCALE_KEY, l);
    } catch {
      /* not stored: fine */
    }
  });
}
// Settings are viewer preferences in this browser, never part of a save.
const SETTINGS_KEY = 'blobbi-pixel-lab:settings';
// The system's reduced-motion preference is the default until the player chooses (M11D.1: a change to another
// setting no longer freezes it; see `readStoredSettings`).
const systemReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
gameUI.settings.reducedMotion = systemReduced;
let reducedChosen = false;
try {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (raw) ({ settings: gameUI.settings, chosen: reducedChosen } = readStoredSettings(JSON.parse(raw), gameUI.settings, systemReduced));
} catch {
  /* private mode or bad JSON: defaults */
}
let lastReduced = gameUI.settings.reducedMotion;
// Audio: the engine starts on the first key or tap (browsers require a gesture); its mix is kept like the settings.
const AUDIO_KEY = 'blobbi-pixel-lab:audio';
const audioEngine = new AudioEngine();
try {
  const raw = localStorage.getItem(AUDIO_KEY);
  if (raw) audioEngine.settings = { ...DEFAULT_AUDIO, ...JSON.parse(raw) };
} catch {
  /* defaults */
}
const gameAudio = new GameAudio(audioEngine);
settingsScreen.audio = audioEngine.settings;
// The player's account (M11B, optional and read-only): remembered per browser, never part of a save. Creating it reads
// one small local record; nothing touches the network until the player opens the ACCOUNT page or connects.
const account = createNostrAccount(localStore() ?? memoryStore());
settingsScreen.account = account;
const identityNow = (): 'guest' | 'connected' => identity;

// ─── M11C: the player's canonical Blobbis (MY BLOBBIS) ───────────────────────
const blobbisScreen = new BlobbisScreen();
gameUI.register(blobbisScreen);
blobbisScreen.collection = account;
// M11D.2: a V1/V2 Blobbi's world form is explained once per Blobbi on this device.
blobbisScreen.forms = {
  seen: (address) => storeOrNull((st) => worldFormSeen(st, address)) ?? false,
  accept: (address) => void storeOrNull((st) => acceptWorldForm(st, address)),
};
settingsScreen.onMyBlobbis = () => gameUI.open('blobbis');

// ─── M11D.4: reserved identities, the secret backup, registration ───────────────────────────
/**
 * The identity service (the key vault, backups, registration) is loaded only when first needed: the game's first
 * screen never loads it. Publishing is a REHEARSAL (an in-browser relay: nothing leaves the device) unless the build
 * says live (`VITE_BLOBBI_PUBLISH=live`) or, on a development server only, the page is opened with `#publish=live`
 * (the owner decides when live publishing ships; `src/nostr/relay-config.ts`, docs/milestones/M11D6.md).
 */
let identityTask: Promise<IdentityService> | null = null;
function identityService(): Promise<IdentityService> {
  identityTask ??= (async () => {
    const [{ IdentityService: Service }, keys, pub, signer, relayConfig, relays] = await Promise.all([import('../nostr/identity'), import('../nostr/keystore'), import('../nostr/publisher'), import('../nostr/signer'), import('../nostr/relay-config'), import('../nostr/relays')]);
    let backend: import('../nostr/keystore').VaultBackend;
    try {
      backend = keys.indexedDbVaultBackend();
    } catch {
      backend = keys.memoryVaultBackend(); // the service reports the vault unavailable; nothing is pretended
    }
    // M11D.6: the build decides (VITE_BLOBBI_PUBLISH=live); `#publish=live` works only on a development server.
    const mode = relayConfig.publishModeFor({ buildMode: import.meta.env.VITE_BLOBBI_PUBLISH, dev: import.meta.env.DEV, hash: params });
    const publisher = mode === 'live' ? pub.relayPublisher() : pub.memoryRelay();
    const store = localStore() ?? memoryStore();
    return new Service({
      store,
      vault: new keys.KeyVault(backend),
      publisher,
      accountSigner: (tpl) => signer.browserExtensionSignEvent(tpl),
      currentAccount: () => connectedPubkey,
      onChanged: () => (shownName = blobbiDisplayName()),
      onRegistered: (b) => {
        // A guest identity becomes the player's account (an identity this game keeps); the same Blobbi stays, in
        // place: no departure, no arrival, nothing about the island changes. M11D.6: only when no OTHER account is
        // connected; a connected account (a browser extension) is never replaced behind the player's back.
        const acc = account.snapshot();
        if (b.ownerKind === 'guest' && (acc.status !== 'connected' || acc.pubkey === b.owner)) account.adoptVaultIdentity(b.owner);
        shownName = blobbiDisplayName();
      },
      // M11D.7: a restored identity is the player's from now on (a new adventure, MY BLOBBIS and SETTINGS > ACCOUNT use
      // it, and a reload remembers it), unless ANOTHER account is connected: that one is never replaced unasked.
      onRestored: (pubkey) => {
        if (account.snapshot().status === 'guest') account.adoptVaultIdentity(pubkey);
      },
      // M11D.7: after a restore its Blobbis already shared are looked for (a read; nothing is sent).
      blobbiReader: relays.relayBlobbiReader(),
      readRelays: relayConfig.READ_RELAYS,
    });
  })();
  identityTask.catch(() => (identityTask = null));
  return identityTask;
}
const identityScreen = new IdentityScreen();
gameUI.register(identityScreen);
/** Open the account flow (on ACTIVATE for the walking Blobbi, or on RESTORE). */
async function openIdentity(page: 'activate' | 'restore'): Promise<void> {
  identityScreen.identity = await identityService();
  identityScreen.start(page);
  gameUI.open('identity');
}
settingsScreen.onIdentity = (page) => void openIdentity(page);
/**
 * M11D.6: where each Blobbi met here stands with other worlds (`ShareStatus`), asked of the identity service and
 * kept a moment; until it answers, the public record says enough (shared, practiced or nothing yet).
 */
const shareCache = new Map<string, { status: ShareStatus; at: number }>();
function shareOf(g: GuestBlobbi): ShareStatus {
  const hit = shareCache.get(g.d);
  if (!hit || performance.now() - hit.at > 2000) {
    shareCache.set(g.d, { status: hit?.status ?? (g.activatedAt ? 'shared' : g.practicedAt ? 'practiced' : 'local'), at: performance.now() });
    void identityService()
      .then((svc) => svc.shareStatus(g.d))
      .then((status) => shareCache.set(g.d, { status, at: performance.now() }))
      .catch(() => {});
  }
  return shareCache.get(g.d)!.status;
}
settingsScreen.reservedWalking = () => {
  const src = state.blobbi;
  if (src.kind !== 'v3-address') return null;
  const g = storeOrNull((st) => guestBlobbi(st, src.d));
  return g && g.born ? { name: g.name, registered: !!g.activatedAt, awaitsName: awaitsName(g), share: shareOf(g) } : null;
};
settingsScreen.onName = () => {
  namingScreen.start();
  gameUI.open('naming');
};
// The screen's host: hidden page inputs for text (passwords are type=password), a file picker, a paste area, a
// download and the clipboard. Typed values go straight to the screen and are cleared with its page.
const secretInput = document.createElement('input');
secretInput.style.cssText = 'position:fixed;left:-1000px;top:0;width:10px;height:10px;opacity:0';
secretInput.autocomplete = 'off';
secretInput.spellcheck = false;
const pasteArea = document.createElement('textarea');
pasteArea.style.cssText = 'position:fixed;left:-1000px;top:0;width:10px;height:10px;opacity:0';
const filePicker = document.createElement('input');
filePicker.type = 'file';
filePicker.accept = '.txt,text/plain';
filePicker.style.cssText = 'display:none';
document.body.append(secretInput, pasteArea, filePicker);
let secretSink: ((v: string) => void) | null = null;
secretInput.addEventListener('input', () => secretSink?.(secretInput.value));
secretInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === 'Escape') {
    e.preventDefault();
    secretInput.value = '';
    secretSink = null;
    view.focus();
  }
});
secretInput.addEventListener('blur', () => {
  secretInput.value = ''; // the screen keeps its copy only while its page is open
  secretSink = null;
});
let pasteSink: ((v: string) => void) | null = null;
pasteArea.addEventListener('input', () => {
  pasteSink?.(pasteArea.value);
  pasteArea.value = '';
  pasteSink = null;
  view.focus();
});
let fileSink: ((v: string) => void) | null = null;
filePicker.addEventListener('change', () => {
  const f = filePicker.files?.[0];
  filePicker.value = '';
  if (!f || f.size > 16_384) return;
  void f.text().then((text) => fileSink?.(text));
});
identityScreen.host = {
  editText: (field, current, secret, set) => {
    secretInput.type = secret ? 'password' : 'text';
    secretInput.maxLength = field === 'name' ? 24 : 128;
    secretInput.value = current;
    secretSink = set;
    secretInput.focus();
  },
  pickFile: (done) => {
    fileSink = done;
    filePicker.click();
  },
  pasteText: (done) => {
    pasteSink = done;
    pasteArea.focus();
  },
  download: (fileName, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  copy: async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  },
  walking: () => {
    const src = state.blobbi;
    const g = src.kind === 'v3-address' ? storeOrNull((st) => guestBlobbi(st, src.d)) : null;
    const reserved = g && g.born ? { owner: g.owner, ownerKind: g.ownerKind, petId: g.petId, d: g.d, name: g.name, born: g.born, activatedAt: g.activatedAt, named: g.named, namingLaterAt: g.namingLaterAt } : null;
    return { reserved, legacyLocal: isLocalBlobbiSeed(src.seed) };
  },
  bring: (d) => {
    const g = storeOrNull((st) => guestBlobbi(st, d));
    if (!g) return;
    const r = resolveBlobbi({ pubkey: g.owner, d: g.d });
    if (!r.ok) return;
    storeOrNull((st) => storeGuestSelection(st, r.source, 'baby', playerNow()));
    applyBlobbi(r.source, 'baby');
  },
  // M11D.6: after a restore, one clear way on. On the main menu: the restored Blobbi becomes the chosen one (the
  // player pressed CONTINUE WITH <name>), then the islands to choose from, or a new adventure when there are none
  // (nothing is created until the player says so). While playing: it comes to this island, as BRING did.
  continueAfterRestore: (d) => {
    const g = d ? storeOrNull((st) => guestBlobbi(st, d)) : null;
    const r = g ? resolveBlobbi({ pubkey: g.owner, d: g.d }) : null;
    if (g && r?.ok) {
      storeOrNull((st) => storeGuestSelection(st, r.source, 'baby', playerNow()));
      applyBlobbi(r.source, 'baby');
    }
    if (title.active) title.afterRestore(g && r?.ok ? g.name : null);
  },
  portraitOf: (d) => {
    const g = storeOrNull((st) => guestBlobbi(st, d));
    const r = g ? resolveBlobbi({ pubkey: g.owner, d: g.d }) : null;
    return r?.ok ? { identity: identityOfSource(r.source, 'baby'), size: state.blobbiSize } : null;
  },
  otherAccountConnected: (owner) => {
    const acc = account.snapshot();
    return acc.status === 'connected' && !!acc.pubkey && acc.pubkey !== owner;
  },
};

// ─── M11D.5: naming a new Blobbi (its first little quest, right after it hatches) ───────────────────────────
const namingScreen = new NamingScreen();
gameUI.register(namingScreen);
/** The walking Blobbi's public record, when it is one met here (born). */
function walkingGuest(): GuestBlobbi | null {
  const src = state.blobbi;
  const g = src.kind === 'v3-address' ? storeOrNull((st) => guestBlobbi(st, src.d)) : null;
  return g && g.born ? g : null;
}
namingScreen.host = {
  subject: () => {
    const g = walkingGuest();
    return g && !g.activatedAt ? { d: g.d, name: g.name } : null;
  },
  editName: (current, set) => {
    secretInput.type = 'text';
    secretInput.maxLength = 24;
    secretInput.value = current;
    secretSink = set;
    secretInput.focus();
  },
  choose: (d, name) => {
    const kept = storeOrNull((st) => chooseGuestName(st, d, name));
    if (kept) shownName = blobbiDisplayName();
    return !!kept;
  },
  later: (d) => void storeOrNull((st) => updateGuestBlobbi(st, d, { namingLaterAt: Date.now() })),
  celebrate: () => {
    if (!live) return;
    live.blobbi.animator.react('excited', live.clock.time, 1.4, gameUI.settings.reducedMotion ? 0 : 3);
    live.sound('happy');
  },
};
/**
 * When the naming question is asked: right after a birth (once the world is calm: no menu, the Blobbi present), and
 * for a Blobbi whose naming was put off, once in a later session after a little calm play. Never twice in a session,
 * never for a Blobbi already named or registered, never over a menu, a cinematic, a reveal or a teleport.
 */
let namingAskedThisSession = false;
let namingAfterBirth = false;
let namingCalm = 0;
function updateNaming(dt: number): void {
  const l = live;
  if (!l || l.visitor || intro || title.active || gameUI.capturing || namingAskedThisSession) return (void (namingCalm = 0));
  const g = walkingGuest();
  if (!g || !awaitsName(g)) return;
  const calm = !l.reveal && !l.boat?.aboard && !l.fishing && !l.restPlan && l.getPresenceState() === 'present' && !(l.bubble && l.bubble.until > l.clock.time);
  namingCalm = calm ? namingCalm + dt : 0;
  // After a birth: a breath after the Blobbi stands on its island. Put off before: some calm play first.
  if (namingCalm < (namingAfterBirth || g.namingLaterAt === null ? 1.2 : 20)) return;
  namingAskedThisSession = true;
  namingAfterBirth = false;
  namingScreen.start();
  gameUI.open('naming');
}

/**
 * M11D.4, A NEW ADVENTURE: a new Blobbi gets its owner FIRST (a new identity sealed in the vault, or the connected
 * account), then the island is made and its egg hatches from that very identity. If the identity cannot be kept
 * safely, nothing is made (said plainly); an island whose making fails forgets its unborn Blobbi.
 */
let creatingAdventure = false;
async function createAdventure(req: { kind: CarrierKind; name: string; companion: Companion; owner: NewOwner }): Promise<void> {
  if (creatingAdventure) return;
  creatingAdventure = true;
  try {
    let reserved: GuestBlobbi | null = null;
    if (req.companion === 'new') {
      const svc = await identityService();
      const acc = account.snapshot();
      const owner = req.owner === 'account' && acc.status === 'connected' && acc.pubkey ? (acc.method === 'vault' ? { kind: 'vault' as const, pubkey: acc.pubkey } : { kind: 'account' as const, pubkey: acc.pubkey }) : { kind: 'guest' as const };
      const r = (await svc.vaultAvailable()) || owner.kind === 'account' ? await svc.reserve(owner, null) : ({ ok: false } as const);
      if (!r.ok) {
        title.createFailed(t('create.identityFailed'));
        return;
      }
      reserved = r.value;
    }
    const error = createWorld(req.kind, req.name, req.companion, reserved);
    if (error) {
      if (reserved) storeOrNull((st) => forgetUnbornGuestBlobbi(st, reserved!.d));
      title.createFailed(error);
    } else beginPlay();
  } catch (e) {
    title.createFailed(`${t('create.identityFailed')} (${(e as Error).message})`);
  } finally {
    creatingAdventure = false;
  }
}
// M11D.3: SETTINGS > MAIN MENU while playing: the island is saved, play stops, the title comes back (nothing lost).
settingsScreen.mainMenuAvailable = () => !!live && !title.active && !intro;
settingsScreen.onMainMenu = () => {
  if (!live || title.active || intro) return;
  if (!live.visitor) live.save();
  gameUI.close();
  playStarted = false;
  title.active = true;
  title.reset();
  menuChosen = true;
  saveHash();
};
/** The canonical Blobbi walking now (chosen from MY BLOBBIS with the connected account), or null. */
function walkingCanonical(): { address: string; name: string; stage: BlobbiStage } | null {
  const rec = effectiveSelection(storeOrNull(loadSelectionRecord), connectedPubkey);
  if (!rec?.account || (rec.source.kind !== 'v3-address' && rec.source.kind !== 'world-form') || rec.source.seed !== state.blobbi.seed) return null;
  return { address: `31124:${rec.source.pubkey}:${rec.source.d}`, name: rec.name ?? 'Blobbi', stage: rec.stage ?? 'adult' };
}
function storeOrNull<T>(f: (store: NonNullable<ReturnType<typeof localStore>>) => T): T | null {
  const store = localStore();
  return store ? f(store) : null;
}
blobbisScreen.chooser = {
  selectedAddress: () => walkingCanonical()?.address ?? null,
  selectedStage: () => walkingCanonical()?.stage ?? null,
  // M11D.8.3: `when` is the choice's moment and origin (absent: the player's, now).
  choose: (b, when = playerNow()) => {
    // Only the connected account's own V3 adult or Baby, and only if the kit derives the same seed from its address.
    if (b.availability !== 'available' || !connectedPubkey || b.pubkey !== connectedPubkey) return false;
    if (b.stage !== 'adult' && b.stage !== 'baby') return false;
    // M11D.2: a V1/V2 Blobbi visits in its world form, made from its own event (never typed, never another's).
    if (b.generation === 'v1' || b.generation === 'v2') {
      const form = b.worldForm ? cleanWorldFormTraits(b.worldForm) : null;
      const source = form ? worldFormSource(b.pubkey, b.d, b.generation, form) : null;
      if (!source) return false;
      selectBlobbi(source, { name: b.name, account: b.pubkey, stage: b.stage }, when);
      return true;
    }
    const r = resolveBlobbi({ pubkey: b.pubkey, d: b.d });
    if (!r.ok || r.source.kind !== 'v3-address' || r.source.seed !== b.seed) return false;
    selectBlobbi(r.source, { name: b.name, account: b.pubkey, stage: b.stage }, when);
    return true;
  },
  // Companion sync: the walking Blobbi at the stage just read. Not a choice: never stamped as the player's, never shared
  refreshStage: (b) => {
    const walking = walkingCanonical();
    if (!walking || walking.address !== b.address || b.availability !== 'available' || (b.stage !== 'adult' && b.stage !== 'baby')) return false;
    const rec = storeOrNull(loadSelectionRecord);
    if (!rec) return false;
    storeOrNull((st) => setSelectionStage(st, b.address, b.stage as BlobbiStage));
    applyBlobbi(rec.source, b.stage);
    return true;
  },
  useVisitor: () => selectBlobbi(sourceFromSeed(DEMO_BLOBBI_SEED), undefined, playerNow()),
};
/** M11D.8.3: a choice the player makes now, in this game (stamped with this device's clock). */
const playerNow = (): SelectionWhen => ({ at: Date.now(), by: 'player' });
/** The HUD's name for the Blobbi: a canonical Blobbi's own name; else none (the seed, as before). */
function blobbiDisplayName(): string | null {
  // M11D.4: a Blobbi met here (its reserved owner) is known by its own name.
  const src = state.blobbi;
  if (src.kind === 'v3-address') {
    const g = storeOrNull((st) => guestBlobbi(st, src.d));
    if (g) return g.name;
  }
  return walkingCanonical()?.name ?? null;
}

/**
 * Keep the walking Blobbi in step with the account (start-up, connect, disconnect, account switch): a Blobbi chosen
 * with an account walks only while that account is connected; otherwise the visiting Blobbi walks. The stored
 * choice is kept, so it comes back when the same account connects again. Islands and saves are never touched.
 */
function syncAccountBlobbi(restore = true): void {
  const snap = account.snapshot();
  identity = snap.status === 'connected' ? 'connected' : 'guest';
  connectedPubkey = snap.status === 'connected' ? snap.pubkey : null;
  const rec = storeOrNull(loadSelectionRecord);
  if (rec?.account) {
    const effective = effectiveSelection(rec, connectedPubkey);
    if (!effective && state.blobbi.seed === rec.source.seed) applyBlobbi(sourceFromSeed(DEMO_BLOBBI_SEED));
    else if (restore && effective && state.blobbi.kind === 'demo' && state.blobbi.seed === DEMO_BLOBBI_SEED) applyBlobbi(effective.source, effective.stage);
  }
  shownName = blobbiDisplayName();
}
account.onChange(() => syncAccountBlobbi());

// ─── M11C.5: the gentle account invitation (never asks the signer, never publishes) ───────
// M11D.6: never for a Blobbi already shared with other worlds (registered for real), connected or not.
const invite = new AccountInvite(localStore(), () => identity === 'connected' || !!walkingGuest()?.activatedAt);
gameUI.invite = invite;
// M11D.5: ONE invitation (the M11C.5 card, its timing, cooldown and "don't show again" kept): the walking Blobbi's own
// curiosity about other worlds. A Blobbi met here goes straight to saving it for other worlds; any other opens ACCOUNT.
gameUI.inviteName = () => shownName ?? blobbiDisplayName() ?? 'Blobbi';
gameUI.onInviteExplore = () => {
  const g = walkingGuest();
  if (g && !g.activatedAt) void openIdentity('activate');
  else openAccountPage();
};
/** When the player last pressed a key or touched the game (ms, performance clock): idle time is not active play. */
let lastInputAt = -Infinity;
/** The moment is not calm: the invitation waits (menus, speech, notices, timed actions, the first tips). */
function inviteBusy(): boolean {
  const l = live;
  if (!l) return true;
  // M11D.5: a newborn's name comes first (the invitation waits until it was chosen or put off).
  const g = walkingGuest();
  if (g && awaitsName(g) && g.namingLaterAt === null) return true;
  return isBusy({
    menuOpen: gameUI.capturing,
    bubble: !!l.bubble && l.bubble.until > l.clock.time,
    notice: l.notices.length > 0,
    action: !!(l.fishing || l.swing || l.restPlan || l.reveal || l.boat?.aboard || l.buildMode || l.placing || l.manage || l.moving || l.getPresenceState() !== 'present'),
    tip: l.tutorialTip()?.id ?? null,
    intro: !!intro,
  });
}
/**
 * Companion sync: whether a Blobbi chosen in another game may come along now. Narrower than the invitation's calm: it
 * waits for menus, speech, timed actions, a teleport or a cinematic, not for a tip or a notice (a tip can stay up for
 * minutes on a new island, and the arrival is its own notice).
 */
function companionCalm(): boolean {
  const l = live;
  if (!l || !playStarted || title.active) return !gameUI.capturing && !intro && !entry.active;
  return !isBusy({
    menuOpen: gameUI.capturing,
    bubble: !!l.bubble && l.bubble.until > l.clock.time,
    notice: false,
    action: !!(l.fishing || l.swing || l.restPlan || l.reveal || l.boat?.aboard || l.buildMode || l.placing || l.manage || l.moving || l.getPresenceState() !== 'present'),
    tip: null,
    intro: !!intro,
  });
}
// At start-up the choice already follows the rule (`startupBlobbi`); this only reads the identity and the name.
syncAccountBlobbi(false);

// ─── Companion sync: the Blobbi the player chooses is their companion in every Blobbi game ──────────────────────
/**
 * The game's half is `src/game/companion-sync.ts` (the rules, testable); this is its host. Shares only a choice the
 * player made here, of their own account's Blobbi, while that account is really here (its key in the vault, or the
 * extension answered with it: never a read-only session); meets a choice made elsewhere every minute in play and
 * when the page comes back, and brings it along only in a calm moment. See docs/architecture/CURRENT-BLOBBI.md §6.
 */
const companionPresent = (): { pubkey: string; present: boolean } | null => {
  const s = account.snapshot();
  return s.status === 'connected' && s.pubkey ? { pubkey: s.pubkey, present: s.method === 'vault' || s.extension === 'verified' } : null;
};
const companion = new CompanionSync({
  account: companionPresent,
  local: () => {
    const eff = effectiveSelection(storeOrNull(loadSelectionRecord), connectedPubkey);
    if (!eff?.account || eff.account !== connectedPubkey || eff.source.seed !== state.blobbi.seed) return null;
    const src = eff.source;
    if (src.kind !== 'v3-address' && src.kind !== 'world-form') return null;
    return { d: src.d, name: eff.name ?? 'Blobbi', at: eff.selectedAt ?? null, by: eff.selectedBy ?? null, existedBy: eff.existedBy ?? null, synced: eff.synced ?? null, over: eff.over ?? null };
  },
  resolve: async (pubkey): Promise<RemoteCompanion | null> => {
    const a = await readCurrentBlobbi(pubkey);
    if (a.status === 'current') return { status: 'current', d: a.blobbi.d, name: a.blobbi.name, id: a.profileId, createdAt: a.profileAt, walkable: a.blobbi.availability === 'available' && !!seedOf(a.blobbi), item: a.blobbi };
    if (a.status === 'missing') return { status: 'other', profile: { id: a.profileId, createdAt: a.profileAt } };
    if (a.status === 'no-selection') return { status: 'other', profile: a.profile ?? null };
    return null;
  },
  share: async (req) => {
    const method = account.snapshot().method;
    if (!method) return { kind: 'wrong-account' };
    const svc = await identityService();
    const out = await svc.shareCompanion(req, {
      method,
      // The extension shows the player every request: only their own act may ask it. The vault signs silently.
      maySign: req.byPlayer || method === 'vault',
      stillAccount: () => {
        const now = companionPresent();
        return !!now && now.present && now.pubkey === req.owner;
      },
    });
    if (out.kind === 'shared') return { kind: 'shared', stamp: { id: out.event.id, createdAt: out.event.created_at } };
    if (out.kind === 'unchanged') return { kind: 'unchanged', stamp: out.profile };
    return { kind: out.kind };
  },
  bring: (r) => void blobbisScreen.chooser?.choose(r.item as OwnedBlobbi, { at: r.createdAt * 1000, by: 'remote', synced: { id: r.id, createdAt: r.createdAt } }),
  markSynced: (d, stamp) => void storeOrNull((st) => connectedPubkey && markSelectionSynced(st, connectedPubkey, d, stamp)),
  restamp: (over) => void storeOrNull((st) => markSelectionChosen(st, Date.now(), over)),
  // In play: no menu, speech, timed action, teleport or cinematic (`companionCalm`); on the title: no menu, no entry.
  calm: companionCalm,
  online: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  now: () => Date.now(),
  notify: (kind, names) => notifyCompanion(kind, names.name, names.other),
});
/**
 * The profile the player has been shown, for a choice made now: the newest of the current Blobbi last read
 * (`companion.seen`) and the profile the walking Blobbi's own choice was carried by or agreed with (`synced`), e.g.
 * a Blobbi brought from another app, or one already the profile's: choosing another one is choosing over that.
 */
function seenNow(): SeenProfile | null {
  const rec = storeOrNull(loadSelectionRecord);
  const src = rec?.source;
  const own = rec?.synced && rec.account === connectedPubkey && src && (src.kind === 'v3-address' || src.kind === 'world-form') && rec.synced.createdAt > 0 ? { ...rec.synced, d: src.d } : null;
  const seen = companion.seen;
  if (!own) return seen;
  if (!seen) return own;
  return seen.createdAt > own.createdAt || (seen.createdAt === own.createdAt && seen.id <= own.id) ? seen : own;
}
/** A small word about the companion: a notice in play, else the UI's short message. */
function notifyCompanion(kind: 'came' | 'not-shared' | 'offline' | 'sign-failed' | 'ask', name: string, other?: string): void {
  const place = t('blobbis.title');
  const text =
    kind === 'came'
      ? t('companion.came', { name })
      : kind === 'ask'
        ? t('companion.askShort', { here: name, there: other ?? 'Blobbi', place })
        : `${t(kind === 'offline' ? 'companion.offline' : kind === 'sign-failed' ? 'companion.signFailed' : 'companion.notShared', { name })} ${t('companion.retryHint', { place })}`;
  if (live && playStarted && !title.active) live.notices.push({ heading: t('companion.heading'), title: name, text, until: Math.max(live.clock.time, live.notices.at(-1)?.until ?? 0) + 6 });
  else gameUI.say(text, kind === 'came');
}
blobbisScreen.companion = {
  waiting: () => companion.status.kind === 'waiting',
  retry: () => void companion.retry(),
  question: () => (companion.ambiguity ? { here: companion.ambiguity.here.name, there: companion.ambiguity.there.name } : null),
  answer: (keep) => void companion.answer(keep),
};
account.onChange(() => companion.accountChanged());

// ─── World presence (src/game/presence-host.ts): the account's Blobbi is here while the player plays here ───
// It goes home when the player plays in the Blobbi home instead, or when this tab is left hidden or idle; it comes
// back with the next key or tap here. Only an account's own Blobbi travels (a guest or local one stays). Nothing is
// sent anywhere: the lease is a first-party cookie shared with the Blobbi home on the same site.
const PRESENCE_OFF_KEY = 'blobbi:world-presence:v1';
/**
 * M16.2: the entry arrival held back while world travel does not know yet where the Blobbi is (a fresh device's first
 * look at the relays, the network module still loading): it is neither shown here nor sent away until the answer.
 * Bounded (`ENTRY_HOLD_MAX_MS`): the game never waits on the network for longer than the relays' timeout and a little.
 */
let entryHold: { since: number } | null = null;
/** The game's own moment, which a departure waits for (world presence v1 and world travel alike). */
function presenceBusy(): boolean {
  const l = live;
  if (!l) return true;
  return gameUI.capturing || (!!l.bubble && l.bubble.until > l.clock.time) || !!(l.fishing || l.swing || l.restPlan || l.reveal || l.boat?.aboard || l.buildMode || l.placing || l.manage || l.moving);
}
/** The game's own journeys come first: the title, an intro, a visit's handoff, a change of Blobbi. */
function presencePaused(): boolean {
  return !live || !playStarted || title.active || !!intro || entry.active || visit.phase === 'departing' || visit.phase === 'returning' || !!live.swap || !!entryHold;
}
const worldPresence = createPresenceHost({
  account: () => {
    // M16: with world travel on Nostr, the cookie lease is never read or written
    if (travelMode === 'nostr') return null;
    if (storeGetSafe(PRESENCE_OFF_KEY) === 'off') return null;
    const c = walkingCanonical();
    return c && connectedPubkey && c.address.startsWith(`31124:${connectedPubkey}:`) ? connectedPubkey : null;
  },
  blobbi: () => {
    const l = live;
    if (!l || !playStarted || title.active) return null;
    return { state: () => l.getPresenceState(), enter: () => void l.enterBlobbi(), leave: () => void l.leaveBlobbi() };
  },
  busy: presenceBusy,
  paused: presencePaused,
  onJourney: (kind, place) => {
    const l = live;
    if (!l) return;
    const name = shownName || 'Blobbi';
    const until = Math.max(l.clock.time, l.notices.at(-1)?.until ?? 0) + (kind === 'leave' ? 8 : 5);
    if (kind === 'leave') l.notices.push({ heading: t('presence.heading'), title: place === HOME_APP ? t('presence.leftHome', { name }) : t('presence.leftElsewhere', { name }), text: t('presence.callBack', { name }), until });
    else l.notices.push({ heading: t('presence.heading'), title: t('presence.back', { name }), text: t('presence.backText', { name }), until });
  },
  store: (pubkey) => cookieLeaseStore(pubkey),
});

// ─── M16: world travel on Nostr (src/game/travel-host.ts, src/nostr/world-travel.ts) ───
// The Blobbi's canonical World is its World Location (kind 31126, provisional): when it is in Blobbi Home (on any
// device), it is not walking here, and a few interactions in play (three within 20 s, the kit's count) call it over
// with one signed event; "Call {name} here" in Settings > Account calls it at once. Off by
// default: the build (`VITE_BLOBBI_WORLD_TRAVEL=nostr`) or, on a development server only, `#world-travel=nostr` or
// `localStorage['blobbi:world-travel:v1'] = 'nostr'` turns it on. Only the connected account's own walking Blobbi
// travels; the network module is loaded only in this mode, and a session starts only once it is.
const travelMode = worldTravelMode({ buildMode: import.meta.env.VITE_BLOBBI_WORLD_TRAVEL, dev: import.meta.env.DEV, hash: params, stored: storeGetSafe(WORLD_TRAVEL_SWITCH_KEY), publishLive: import.meta.env.VITE_BLOBBI_PUBLISH === 'live' });
let travelNet: typeof import('../nostr/world-travel') | null = null;
if (travelMode === 'nostr') void import('../nostr/world-travel').then((m) => (travelNet = m));
/** The account is still the one a session is for, and really here (its key in the vault, or the extension answered). */
const travelAccount = (owner: string): boolean => {
  const s = account.snapshot();
  return s.status === 'connected' && s.pubkey === owner && (s.method === 'vault' || s.extension === 'verified');
};
function travelNotice(heading: string, body: string, seconds = 6): void {
  const l = live;
  if (!l || !playStarted || title.active) return;
  l.notices.push({ heading: t('travel.heading'), title: heading, text: body, until: Math.max(l.clock.time, l.notices.at(-1)?.until ?? 0) + seconds });
}
const travelName = () => shownName || 'Blobbi';
/** The connected account's own walking Blobbi, which world travel follows (whether or not its session runs yet). */
function travelCandidate(): { owner: string; d: string } | null {
  if (travelMode !== 'nostr' || !connectedPubkey) return null;
  const c = walkingCanonical();
  const prefix = `31124:${connectedPubkey}:`;
  if (!c || !c.address.startsWith(prefix) || account.snapshot().status !== 'connected') return null;
  return { owner: connectedPubkey, d: c.address.slice(prefix.length) };
}
/** The Blobbi's place is not known yet: its first look is under way, or its session is about to start. */
function travelPlaceUnknown(): boolean {
  return !!worldTravel && placeUnknown({ candidate: !!travelCandidate(), view: worldTravel.view()?.kind ?? null });
}
/** "Looking for {name}": the place is not known, and the game is waiting for it (never with no session in sight). */
const travelLooking = (): boolean => travelPlaceUnknown() && (worldTravel?.view() !== null || !!entryHold);
/**
 * The held entry (`entryDecision`), once the place is known: here, the Blobbi arrives as play's own journey would have
 * (from the spot the "looking" cue marked); elsewhere, it stays away (the away notice says where).
 */
function resolveEntryHold(): void {
  if (!entryHold) return;
  const l = live;
  if (!l || !playStarted || title.active) {
    entryHold = null;
    return;
  }
  const decision = entryDecision({ unknown: travelPlaceUnknown(), here: entryHere(), heldFor: performance.now() - entryHold.since });
  if (decision === 'wait') return;
  entryHold = null;
  // The wait ran out with no session at all: say so (once), rather than show the Blobbi in a World it may not be in
  if (decision === 'skip' && !worldTravel?.snapshot() && !travelNoSessionShown) {
    travelNoSessionShown = true;
    const name = travelName();
    travelNotice(t('travel.unchecked', { name }), t('travel.uncheckedAway', { name }), 8);
  }
  if (decision === 'enter' && l.getPresenceState() === 'absent') l.enterBlobbi();
}
/**
 * M16.2: whether play's entry may show the Blobbi here. A Blobbi world travel follows (the connected account's own)
 * is here only when its session says so: with no session yet (the network module still loading, or failed to), it is
 * never assumed to be here; it is shown once the session answers. Anyone else's Blobbi (a guest, a local one) walks.
 */
function entryHere(): boolean {
  if (!worldTravel || !travelCandidate()) return true;
  return worldTravel.snapshot()?.here ?? false;
}
let travelNoSessionShown = false;
const placeWords = (place: string, name: string) => (place === WORLD_HOME ? t('travel.awayHome', { name }) : t('travel.awayElsewhere', { name }));
let travelPhase = 'idle';
let travelPresence = 'off';
let travelAwayShown = -1;
let travelNoticedShown = -1;
let travelUnreachableShown = false;
const worldTravel: TravelHost | null =
  travelMode === 'nostr'
    ? createTravelHost({
        account: () => (travelNet ? travelCandidate() : null),
        session: (owner, d, hooks) => {
          const net = travelNet!;
          let session: ReturnType<typeof createWorldTravel> | null = null;
          const relays = net.pixelTravelRelays({ onReconnect: () => void session?.refresh() });
          const signer = (): WorldTravelSigner | null => {
            if (!travelAccount(owner)) return null;
            const method = account.snapshot().method === 'vault' ? 'vault' : 'nip07';
            return { mode: method === 'vault' ? 'silent' : 'prompt', sign: async (tpl) => (await identityService()).signAsAccount(owner, method, tpl) as never };
          };
          session = createWorldTravel({
            owner,
            d,
            world: 'blobbi-pixel',
            relays,
            verify: net.verifyTravelEvent as never,
            signer,
            stillAccount: () => travelAccount(owner) && connectedPubkey === owner,
            store: net.travelStore(),
            lock: net.webLock(),
            presenceEnabled: storeGetSafe(activePresenceKey(owner)) === 'on',
            isActive: hooks.isActive,
            // The teleport's arrival (src/game/teleport.ts ARRIVE): pixels fall from the sky for 1.9 s before the body
            // starts to rebuild, the moment it is seen here. The kit starts the arrival that much early, so the wait
            // for the departure window and the falling pixels overlap (reduced motion runs it at 0.6)
            // Read at each arrival, so turning reduced motion on or off mid-session keeps the fall and the wait in step
            arrivalLeadMs: () => Math.round(ARRIVE.rebuildStart * 1000 * (gameUI.settings.reducedMotion ? 0.6 : 1)),
          });
          travelPhase = 'idle';
          travelAwayShown = -1;
          travelNoticedShown = -1;
          travelUnreachableShown = false;
          return { session, setVisible: (v) => relays.setVisible(v) };
        },
        blobbi: () => {
          const l = live;
          if (!l || !playStarted || title.active) return null;
          return { state: () => l.getPresenceState(), enter: () => void l.enterBlobbi(), leave: () => void l.leaveBlobbi(), settle: (st) => void l.settleBlobbi(st) };
        },
        busy: presenceBusy,
        paused: presencePaused,
        playing: () => !!live && playStarted && !title.active && !gameUI.capturing,
        onJourney: (kind, place) => {
          const name = travelName();
          if (kind === 'leave') travelNotice(place === WORLD_HOME ? t('travel.leftHome', { name }) : t('travel.leftElsewhere', { name }), t('travel.callBack', { name }), 8);
          else travelNotice(t('travel.back', { name }), t('travel.backText', { name }), 5);
        },
        onOutcome: (out, snap) => {
          const name = travelName();
          if (out === 'declined') travelNotice(t('travel.declined', { name }), t('travel.declinedText', { name }), 8);
          else if (out === 'unreachable') travelNotice(t('travel.unreachable', { name }), t('travel.unreachableText'), 8);
          else if (out === 'contended' || out === 'stale') travelNotice(t('travel.justMoved', { name }), t('travel.justMovedText', { name }), 6);
          else if (out === 'moved' && !snap.here) travelNotice(t('travel.onTheWay', { name }), t('travel.onTheWayText'), 4);
        },
        onCounted: (snap) => {
          // The first interaction counted while it is away: a short word, only when nothing else is being said
          if (snap.follow.count !== 1 || travelNoticedShown === snap.change.key || (live?.notices.length ?? 1) > 0) return;
          travelNoticedShown = snap.change.key;
          travelNotice(t('travel.noticed', { name: travelName() }), t('travel.noticedText', { name: travelName() }), 3);
        },
        // A new island's birth intro shows this very Blobbi: NEW ADVENTURE WITH {name} is an explicit call here
        playStartExplicit: () => !!intro && introMode === 'world',
        onChange: (snap: WorldTravelSnapshot) => {
          const phase = snap.travel.phase;
          if (phase === 'signing' && travelPhase !== 'signing' && account.snapshot().method !== 'vault') travelNotice(t('travel.approve'), t('travel.approveText', { name: travelName() }), 6);
          travelPhase = phase;
          // Presence paused because the signer asked the player: say so once (the settings row says how to retry)
          if (snap.presence.status === 'paused-prompting' && travelPresence !== 'paused-prompting') travelNotice(t('account.presencePaused'), t('account.presenceExplain'), 6);
          travelPresence = snap.presence.status;
        },
      })
    : null;
/** Once per change of place met while away (the world opened with the Blobbi elsewhere): say where, and how to call it. */
function travelAwayNotice(): void {
  const snap = worldTravel?.snapshot();
  if (!snap || snap.status === 'loading' || snap.travel.phase !== 'idle' || presencePaused()) return;
  const name = travelName();
  // No relay answered the first look: say so once, with the place shown (the last one kept here, or the default)
  if (snap.resolution === 'unreachable' && snap.here && !travelUnreachableShown && live?.getPresenceState() === 'present') {
    travelUnreachableShown = true;
    travelNotice(t('travel.unchecked', { name }), t('travel.uncheckedHere', { name }), 6);
    return;
  }
  if (snap.here || travelAwayShown === snap.change.key) return;
  if (live?.getPresenceState() !== 'absent') return;
  travelAwayShown = snap.change.key;
  if (snap.resolution === 'unreachable') travelUnreachableShown = true;
  const text = snap.resolution === 'unreachable' ? t('travel.uncheckedAway', { name }) : snap.presence.there ? t('travel.playingThere', { name }) : t('travel.callBack', { name });
  travelNotice(placeWords(snap.place, name), text, 8);
}
/** What world travel shows at the empty spot this frame (see `drawTravelCue`), or null. */
function travelCue(): ViewUiOptions['travelCue'] {
  const l = live;
  if (!worldTravel || !l || l.inside) return null;
  const looking = travelLooking();
  if (!looking && presencePaused()) return null;
  const cue = travelCueFor({ absent: l.getPresenceState() === 'absent', looking, view: worldTravel.view()?.kind ?? null, follow: worldTravel.snapshot()?.follow ?? null });
  return cue && cue.kind === 'looking' ? { ...cue, label: t('travel.looking', { name: travelName() }) } : cue;
}
settingsScreen.travel = worldTravel
  ? {
      name: travelName,
      state: () => {
        const snap = worldTravel.snapshot();
        return snap ? { here: snap.here, presence: snap.presence.status } : null;
      },
      callHere: () => void worldTravel.callHere(),
      setPresence: (on) => {
        const owner = worldTravel.snapshot()?.owner;
        if (!owner) return;
        try {
          if (on) localStorage.setItem(activePresenceKey(owner), 'on');
          else localStorage.removeItem(activePresenceKey(owner));
        } catch {
          /* kept for this session only */
        }
        worldTravel.setPresenceEnabled(on);
      },
    }
  : null;
// A development aid for the browser checks (never in a production build: `import.meta.env.DEV` is false there)
if (import.meta.env.DEV) {
  (window as unknown as { __blobbiWorldTravel?: unknown }).__blobbiWorldTravel = {
    mode: travelMode,
    snapshot: () => worldTravel?.snapshot() ?? null,
    shown: () => (live && playStarted ? live.getPresenceState() : null),
    callHere: () => worldTravel?.callHere() ?? Promise.resolve(null),
    // M16.2, UI-only state: the place not known yet ("looking for"), a move here under way, the cue drawn now
    looking: () => travelLooking(),
    coming: () => worldTravel?.view()?.kind === 'coming',
    held: () => !!entryHold,
    cue: () => travelCue()?.kind ?? null,
  };
}
function storeGetSafe(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
/** How often the player's current Blobbi is looked at while the game is open and in front. */
const COMPANION_LOOK_MS = 60_000;
const lookAtCompanion = () => {
  if (document.visibilityState === 'visible' && entryTried && !entry.active) void companion.check();
};
setInterval(lookAtCompanion, COMPANION_LOOK_MS);
document.addEventListener('visibilitychange', lookAtCompanion);
window.addEventListener('online', () => {
  companion.online();
  lookAtCompanion();
});
/** Open SETTINGS on the ACCOUNT page (the HUD's identity chip). */
function openAccountPage(): void {
  settingsScreen.showPage('account');
  gameUI.open('settings');
}
gameUI.onSound = (name) => {
  if (gameUI.settings.sound) audioEngine.play(name);
};
const unlockAudio = () => {
  if (gameUI.settings.sound) audioEngine.unlock();
};
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });
settingsScreen.onChange = () => {
  audioEngine.applySettings();
  if (!gameUI.settings.sound) audioEngine.suspend();
  else unlockAudio();
  try {
    localStorage.setItem(AUDIO_KEY, JSON.stringify(audioEngine.settings));
    // Toggling REDUCED MOTION is the player's choice; any other change leaves it to the system.
    if (gameUI.settings.reducedMotion !== lastReduced) reducedChosen = true;
    lastReduced = gameUI.settings.reducedMotion;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsRecord(gameUI.settings, reducedChosen)));
  } catch {
    /* not stored: fine */
  }
};

function startLive(): void {
  if (!world) return;
  playStarted = false;
  live = new LiveWorld(world, state.blobbi, state.blobbiSize, { stage: state.blobbiStage, store: localStore() });
  if (linkedWorld && linkedIdentity === null) linkedIdentity = live.identity;
  liveRenderer = new LiveRenderer(live);
  viewRenderer = new ViewRenderer(live, liveRenderer);
  bounds = worldBounds(world);
  drawAxeIcon();
  showInventory();
  live.clock.speed = state.speed;
  viewCamera.update(0, { x: live.blobbi.x, y: live.blobbi.y, size: live.blobbi.size }, view.width, view.height, bounds, true);
}

// ─── The title screen and world selection ─────────────────────────────────────
const storeKeys = (): string[] => {
  try {
    return Object.keys(localStorage);
  } catch {
    return [];
  }
};
const storeGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
/** Remember that this world was just played (orders the islands list) and, unless visiting, make it the active one. */
function touchWorld(): void {
  if (!live) return;
  if (!live.visitor) claimWorld(live.identity);
  try {
    localStorage.setItem(WORLD_INDEX_KEY, JSON.stringify(touchIndex(readIndex(storeGet), live.identity, Date.now())));
    if (!live.visitor && hasSave(live.identity, storeGet)) localStorage.setItem(ACTIVE_WORLD_KEY, live.identity);
  } catch {
    /* not stored */
  }
}
/**
 * Leave the title and play. An island whose intro is still to be seen (a new island, or one reloaded during its
 * intro) plays the intro cinematic; any other island begins with the Blobbi's teleport arrival.
 */
function beginPlay(): void {
  title.active = false;
  menuChosen = false;
  gameUI.close();
  if (live) {
    playStarted = true;
    saveHash();
    touchWorld();
    if (live.intro.state === 'pending' && !live.visitor) {
      // M16.1: not known to be here (away, or its place not known yet): absent from the very first frame, so the
      // intro alone brings it in (its own arrival), never a glimpse before the cinematic takes over
      if (worldTravel && !worldTravel.here() && live.teleport.state !== 'absent') {
        live.teleport.cancelTransition();
        live.teleport.state = 'absent';
      }
      startWorldIntro();
      return;
    }
    live.teleport.reducedMotion = gameUI.settings.reducedMotion;
    // M11D.3: a Blobbi coming back to an island it knows arrives in about half the time.
    live.teleport.pace = knownHere(live) ? QUICK_PACE : 1;
    live.teleport.state = 'absent';
    // M16: a Blobbi already known to be in another World does not arrive with play (it would appear and vanish at
    // once); it stays away until the player calls it over. Its place not known yet (a fresh device): the arrival is
    // held, with a small "looking for" cue at the spot, until the first answer (`resolveEntryHold`, bounded)
    entryHold = null;
    const decision = entryDecision({ unknown: travelPlaceUnknown(), here: entryHere(), heldFor: 0 });
    if (decision === 'wait') entryHold = { since: performance.now() };
    else if (decision === 'enter') live.enterBlobbi();
    noteVisit(live);
  }
  view.focus();
}

/** M11D.3: whether the walking Blobbi has been on this island before (on this device). */
function knownHere(l: LiveWorld): boolean {
  return storeOrNull((st) => visitedBefore(st, l.identity, l.blobbi.seed)) ?? false;
}
/** M11D.3: remember that the walking Blobbi came to this island (local memory, never published or saved in it). */
function noteVisit(l: LiveWorld): void {
  if (!l.visitor) recordVisitOf(l.identity, l.blobbi.seed, l.blobbi.identity.stage);
}
function recordVisitOf(island: string, seed: string, stage: BlobbiStage): void {
  const canonical = walkingCanonical();
  const name = canonical && state.blobbi.seed === seed ? canonical.name : null;
  storeOrNull((st) => recordVisit(st, island, { seed, name, stage: stage === 'baby' ? 'baby' : 'adult' }));
}
/** M11D.3: a local Blobbi met on this island whose birth has not been seen yet. */
function unbornHere(l: LiveWorld): boolean {
  // M11D.4: a Blobbi met here with a reserved owner, its birth not seen yet, on the island it was met on.
  const src = l.blobbi.source;
  if (src.kind === 'v3-address') {
    const g = storeOrNull((st) => guestBlobbi(st, src.d));
    return !!g && !g.born && g.island === l.identity;
  }
  if (!isLocalBlobbiSeed(l.blobbi.seed)) return false;
  const b = storeOrNull((st) => localBlobbi(st, l.blobbi.seed));
  return !!b && !b.born && b.island === l.identity;
}
/** M11D.3: an island card's second line: when it was last played, and who came last. */
function islandNote(w: WorldEntry): string {
  const parts: string[] = [];
  if (w.lastPlayed > 0) {
    const days = Math.floor((startOfDay(Date.now()) - startOfDay(w.lastPlayed)) / 86_400_000);
    parts.push(days <= 0 ? t('title.played.today') : days === 1 ? t('title.played.yesterday') : t('title.played.days', { count: days }));
  }
  const last = storeOrNull((st) => lastVisitor(st, w.identity));
  if (last) parts.push(t('title.withBlobbi', { name: last.name ?? metHereName(last.seed) ?? (isLocalBlobbiSeed(last.seed) ? t('blobbi.localBaby') : last.seed === DEMO_BLOBBI_SEED ? 'Blobbi' : last.seed.slice(0, 10)) }));
  return parts.join('  ');
}
/** M11D.6: the name of a Blobbi met here, by its look's seed (an island card names it, never a seed). */
function metHereName(seed: string): string | null {
  for (const g of storeOrNull(readGuestBlobbis) ?? []) {
    const r = resolveBlobbi({ pubkey: g.owner, d: g.d });
    if (r.ok && r.source.seed === seed) return g.name;
  }
  return null;
}
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
/** Point the playground at a saved world and load it; false (and nothing changed) when it cannot be reproduced. */
function openWorldParams(w: WorldEntry): boolean {
  const p = w.params;
  const keep = { seed: state.seed, options: state.options, turtleSeed: state.turtleSeed, shellVariant: state.shellVariant };
  state.seed = p.seed;
  state.options = { ...state.options, kind: p.kind, scale: p.scale, palette: p.palette as typeof state.options.palette, density: p.density, islands: p.islands as typeof state.options.islands, generatedHouse: p.generatedHouse };
  if (p.kind === 'manta' || p.kind === 'whale') state.turtleSeed = p.carrierSeed ?? p.seed;
  if (p.kind === 'turtle') {
    state.turtleSeed = p.turtleSeed ?? p.seed;
    if (isShellVariant(p.shellVariant ?? 0)) state.shellVariant = p.shellVariant as ShellVariant;
  }
  // The frame size that was asked for (an enlarged shell grows it): find the one that reproduces the identity.
  const frame = resolveFrame(w.identity, [{ width: keep.options.width, height: keep.options.height }, { width: DEFAULT_WORLD_OPTIONS.width, height: DEFAULT_WORLD_OPTIONS.height }, { width: p.width, height: p.height }], (size) => {
    state.options = { ...state.options, ...size };
    return worldIdentity(makeWorld(state.seed));
  });
  if (!frame) {
    Object.assign(state, keep);
    return false;
  }
  state.options = { ...state.options, ...frame };
  syncControls();
  regenerate();
  return true;
}
/** The link named a world (`#seed=…`): the title offers to play it even before it has a save. */
const linkedWorld = params.has('seed');
let linkedIdentity: string | null = null;
/** The active island (the one CONTINUE plays): the stored one while it has a save, else the most recent. */
const recentWorld = (): WorldEntry | null => activeWorld(listWorlds(storeKeys(), storeGet), storeGet);
const title = new TitleScreen({
  worlds: () => listWorlds(storeKeys(), storeGet),
  activeIdentity: () => recentWorld()?.identity ?? null,
  // One island per player in this release; `#islands=many` brings NEW ISLAND back for development.
  allowNewIsland: params.get('islands') === 'many',
  current: () => {
    const identity = live?.identity ?? (world ? worldIdentity(world) : '');
    return { identity, name: identity ? islandLabel(identity) : 'this island', saved: !!identity && hasSave(identity, storeGet), linked: linkedWorld && !!identity && identity === linkedIdentity };
  },
  continueGame: () => {
    const recent = recentWorld();
    if (!recent) return;
    if (live && live.identity === recent.identity) beginPlay();
    else if (openWorldParams(recent)) beginPlay();
  },
  playCurrent: () => beginPlay(),
  openWorld: (w) => {
    if (live && live.identity === w.identity) beginPlay();
    else if (openWorldParams(w)) beginPlay();
  },
  settings: () => gameUI.open('settings'),
  deleteWorld: (w) => {
    const ls = localStore();
    if (!ls) return;
    deleteWorld(ls, w.identity);
    // The deleted island may be the one behind the title: it must never write its save again.
    if (live && live.identity === w.identity) {
      live.detachStore();
      startLive();
    }
  },
  watchIntro: (kind) => startIntroPreview(kind),
  requestTextInput: (current) => openNameInput(current),
  // M11D.3: the optional account (the existing NIP-07 connection), MY BLOBBIS over the title, who walks now.
  account: () => {
    const s = account.snapshot();
    return { status: s.status === 'connected' ? 'connected' : s.status === 'connecting' ? 'connecting' : 'disconnected', name: s.status === 'connected' ? s.displayName : null, signerAvailable: s.signerAvailable, method: s.method, extension: s.extension };
  },
  restoreBackup: () => void openIdentity('restore'),
  connect: () => void account.connect(),
  myBlobbis: () => gameUI.open('blobbis'),
  currentBlobbi: () => {
    if (state.blobbi.kind === 'demo' && state.blobbi.seed === DEMO_BLOBBI_SEED) return null;
    if (isLocalBlobbiSeed(state.blobbi.seed)) return { name: t('blobbi.localBaby') };
    return { name: shownName ?? state.blobbi.seed.slice(0, 12) };
  },
  islandNote: (w) => islandNote(w),
  preview: (kind, time) => {
    // Each species' picture once per animation step (the title redraws every frame).
    const step = Math.floor(time * 4);
    const key = `${kind}|${step % 48}`;
    let pic = titlePictures.get(key);
    if (!pic) {
      pic = speciesThumbnail(kind, `${kind}-title`, CARD_PIC.w, CARD_PIC.h, (step % 48) / 4, paletteFor('cozy'));
      titlePictures.set(key, pic);
    }
    return pic;
  },
});
const titlePictures = new Map<string, PixelBuffer>();
title.onSound = (n) => gameUI.onSound?.(n);
/**
 * M11D.8.2: the world-entry loading screen, over the title while an automatic entry is decided (`autoEnter`). MAIN
 * MENU, ESC or its own clock give the title back; the run then changes nothing (`waiting()` is false).
 */
const entry = new EntryScreen(
  {
    portrait: () => {
      const key = `${state.blobbi.seed}|${state.blobbiStage}`;
      let p = entryPortraits.get(key);
      if (!p) {
        try {
          p = buildBlobbiSprite(identityOfSource(state.blobbi, state.blobbiStage), REST_POSE, 14).buffer.trimmed().buffer;
        } catch {
          p = null;
        }
        entryPortraits.clear();
        entryPortraits.set(key, p);
      }
      return p;
    },
    cancel: () => entry.end(),
  },
  gameUI,
);
const entryPortraits = new Map<string, PixelBuffer | null>();
/** The name players see for an island: its own (saved) name, else its generated one. */
function islandLabel(identity: string): string {
  if (live && live.identity === identity) return displayName(live.islandName, identity);
  return listWorlds(storeKeys(), storeGet).find((w) => w.identity === identity)?.name ?? worldName(identity);
}

/**
 * M11D.8, SEAMLESS WORLD ENTRY (`src/game/world-entry.ts` decides; this carries it out). Once per page load, at the
 * first start of play: a CONNECTED player whose identity is really here (the vault keeps its key, or the extension is
 * present) goes straight into their island, with their Blobbi. Their current Blobbi across the Blobbi apps (kind 11125
 * `current_companion`) is read first, read only, for a few seconds at most; offline, they enter with the Blobbi of
 * this device. Anything the player does on the title meanwhile wins: nothing is then taken over. Never creates an
 * identity, a Blobbi or an island, never publishes; the title is always one menu away (SETTINGS > MAIN MENU), and
 * `#menu` opens on it.
 */
let entryTried = false;
/** The pixel seed a Blobbi of the account walks with (V3: its own; V1/V2: its world form), or null. */
function seedOf(b: OwnedBlobbi): string | null {
  if (b.generation === 'v3') return b.seed;
  const form = b.worldForm ? cleanWorldFormTraits(b.worldForm) : null;
  return form && (b.generation === 'v1' || b.generation === 'v2') ? (worldFormSource(b.pubkey, b.d, b.generation, form)?.seed ?? null) : null;
}
/**
 * What this device knows for an entry decision: the saved islands with who played there last, and the seeds of this
 * identity's Blobbis (the account's list as read, the Blobbis met here with this owner, the stored selection).
 */
function deviceFacts(store: NonNullable<ReturnType<typeof localStore>>, pubkey: string, items: readonly OwnedBlobbi[]): { islands: { identity: string; lastSeed: string | null }[]; mine: Set<string> } {
  const mine = new Set<string>();
  for (const b of items) {
    const seed = seedOf(b);
    if (seed) mine.add(seed);
  }
  for (const g of readGuestBlobbis(store))
    if (g.owner === pubkey) {
      const r = resolveBlobbi({ pubkey: g.owner, d: g.d });
      if (r.ok) mine.add(r.source.seed);
    }
  const rec = loadSelectionRecord(store);
  const recOwner = rec?.account ?? (rec?.source.kind === 'v3-address' ? (guestBlobbi(store, rec.source.d)?.owner ?? null) : null);
  if (rec && recOwner === pubkey) mine.add(rec.source.seed);
  return { islands: listWorlds(storeKeys(), storeGet).map((w) => ({ identity: w.identity, lastSeed: lastVisitor(store, w.identity)?.seed ?? null })), mine };
}
/** Carry a decision out: into an island, the islands page, the two title pages, or nothing (the title as it is). */
function carryOut(decision: EntryDecision, item: OwnedBlobbi | null, pubkey: string, store: NonNullable<ReturnType<typeof localStore>>, currentAt: number | null = null, currentId: string | null = null): void {
  // Companion sync: a choice adopted from the other apps keeps the profile event it came from (never shared again)
  const synced = currentAt !== null && currentId ? { id: currentId, createdAt: Math.floor(currentAt / 1000) } : null;
  const worlds = listWorlds(storeKeys(), storeGet);
  const enter = (identity: string) => {
    const w = worlds.find((x) => x.identity === identity);
    if (!w) return;
    if (live && live.identity === w.identity) beginPlay();
    else if (openWorldParams(w)) beginPlay();
  };
  switch (decision.kind) {
    case 'enter':
      return enter(decision.island);
    case 'choose-island':
      return title.showIslands();
    case 'offer-switch':
      return title.offerSwitch({
        current: decision.name,
        walking: blobbiDisplayName() ?? 'Blobbi',
        island: islandLabel(decision.island),
        bring: () => {
          if (item && blobbisScreen.chooser?.choose(item, playerNow())) enter(decision.island);
        },
        keep: () => {
          // M11D.8.3: staying is the player's choice of the walking Blobbi, now (so a later remote choice can win).
          rememberStay(store, decision.island, pubkey, decision.d, Date.now());
          markSelectionChosen(store, Date.now(), seenNow());
          enter(decision.island);
          // Companion sync: an explicit choice, shared with the other Blobbi games
          void companion.chosen();
        },
      });
    case 'bring':
      // M11D.8.3: the current Blobbi was chosen more recently in another world: it comes along, stamped with THAT
      // choice's own time (never this device's now), so a later choice anywhere can still win.
      if (item && blobbisScreen.chooser?.choose(item, { at: currentAt ?? Date.now(), by: 'remote', synced })) enter(decision.island);
      return;
    case 'welcome':
      // Already chosen (the player did, or the walking Blobbi is it): just the page; else adopt the current one.
      if (item && (walkingCanonical()?.address === item.address || blobbisScreen.chooser?.choose(item, { at: currentAt ?? Date.now(), by: 'remote', synced }))) title.arrived(decision.name);
      return;
    case 'title':
      return;
  }
}
/** The player's current Blobbi across the Blobbi apps (kind 11125), read only: 6 s, then 1.5 s for the slower relays. */
async function readCurrentBlobbi(pubkey: string): Promise<import('../nostr/current-blobbi').CurrentBlobbiResult> {
  const [cb, rd, rc] = await Promise.all([import('../nostr/current-blobbi'), import('../nostr/relays'), import('../nostr/relay-config')]);
  // 6 s for the relays; once one has answered the others get 1.5 s more; what arrived is always kept.
  return cb.resolveCurrentBlobbi(pubkey, { profiles: rd.relayBlobbonautReader({ graceMs: 1500 }), blobbis: rd.relayBlobbiReader({ graceMs: 1500 }), relays: rc.READ_RELAYS, timeoutMs: 6000 }).catch(() => ({ status: 'unavailable' as const }));
}
/** Companion sync: the profile the player is shown by an answer (a choice made now is made over it). */
function seenBy(answer: import('../nostr/current-blobbi').CurrentBlobbiResult): SeenProfile | null {
  if (answer.status === 'current') return { id: answer.profileId, createdAt: answer.profileAt, d: answer.blobbi.d };
  if (answer.status === 'missing') return { id: answer.profileId, createdAt: answer.profileAt, d: answer.d };
  if (answer.status === 'no-selection' && answer.profile) return { ...answer.profile, d: null };
  return null;
}
async function autoEnter(): Promise<void> {
  if (entryTried) return;
  entryTried = true;
  const address = entryAddress(params);
  const snap = account.snapshot();
  if (!address.allowed || state.mode !== 'play') {
    // The title on purpose (`#menu`): still find out, quietly, whether the extension holds this account.
    if (snap.status === 'connected' && snap.method === 'nip07') void account.verifyExtension();
    return;
  }
  // A guest: the title at once (nothing to decide, no loading page).
  if (snap.status !== 'connected' || !snap.pubkey) return;
  // A link naming an island (the game's own address after a reload, or a shared one): only that island, if saved here.
  const linked = address.linked ? (linkedIdentity ?? '') : null;
  // M11D.8.2: the loading page, instead of a menu that would leave by itself.
  entry.begin();
  const startedAt = Date.now();
  // M11D.8.4: the current Blobbi is PUBLIC data: its read starts now, beside the extension's check, instead of after
  // it (the two waits used to add up). Nothing is decided from it until the identity is confirmed (`runEntry`).
  const readCurrent = readCurrentBlobbi;
  const early = readCurrent(snap.pubkey);
  let factsUsed: EntryFacts | null = null;
  const run = await runEntry({
    account: () => {
      const s = account.snapshot();
      return s.status === 'connected' && s.pubkey ? { pubkey: s.pubkey } : null;
    },
    present: (pubkey) => {
      const s = account.snapshot();
      if (s.method === 'vault') return identityService().then((svc) => svc.keeps(pubkey));
      // M11D.8.2: a browser extension is present only when it answers with THIS account's key (never a stale one).
      entry.phase = 'signer';
      return account.verifyExtension(6000).then((r) => r === 'verified');
    },
    current: (pubkey) => {
      entry.phase = 'worlds';
      return pubkey === snap.pubkey ? early : readCurrent(pubkey);
    },
    // The player asked for the menu (or the page gave up), or something else took over: they lead.
    waiting: () => state.mode === 'play' && title.active && entry.waiting() && !title.touched && !intro,
    facts: (pubkey, present, answer) => {
      const store = localStore();
      if (!store) return null;
      const items = answer.status === 'unavailable' ? [] : answer.items;
      const item = answer.status === 'current' ? answer.blobbi : null;
      // M11D.8.3: the device's choice of the walking Blobbi, when and by whom (null: made before, or not stored).
      // M11D.8.4: an unstamped choice gets, once, the moment it was first seen to exist (an upper bound, never its time).
      const now = Date.now();
      const rec = loadSelectionRecord(store);
      const mineNow = rec && rec.source.seed === state.blobbi.seed;
      const existedBy = mineNow && rec.selectedAt == null ? noteUnstampedChoice(store, now) : null;
      const local = mineNow ? { at: rec.selectedAt ?? null, by: rec.selectedBy ?? null, existedBy, synced: rec.synced ?? null, over: rec.over ?? null } : null;
      return (factsUsed = {
        allowed: true,
        linked,
        account: { pubkey, present },
        ...deviceFacts(store, pubkey, items),
        walkingSeed: state.blobbi.seed,
        current: item ? { status: 'current', d: item.d, name: item.name, seed: seedOf(item), walkable: item.availability === 'available' && !!seedOf(item), at: answer.status === 'current' ? currentSelectionAt(answer.profileAt) : null, id: answer.status === 'current' ? answer.profileId : null } : { status: answer.status === 'current' ? 'unavailable' : answer.status },
        stayed: (island, d) => stayedWith(store, island, pubkey, d),
        local,
        now,
      });
    },
  });
  // Whatever was decided, the loading page is over now (the title, or the island, comes at once).
  entry.end();
  const store = localStore();
  if (!run || !run.answer || !store) return;
  const { decision, answer, pubkey } = run;
  // M11D.8.4: what was decided and why, kept on this device for diagnosis (no key, no address, no name).
  const diag = entryDiagnostic(decision, factsUsed, answer.status === 'current' || answer.status === 'missing' || answer.status === 'no-selection' ? { status: answer.status, partial: answer.partial } : { status: answer.status, partial: false }, Date.now() - startedAt, Date.now());
  try {
    localStorage.setItem(ENTRY_DIAGNOSTIC_KEY, JSON.stringify(diag));
  } catch {
    /* not kept */
  }
  if (import.meta.env.DEV) console.info('[entry]', JSON.stringify(diag));
  // Companion sync: what the player is shown now (a choice made from here on is made over it)
  companion.seen = seenBy(answer);
  carryOut(decision, answer.status === 'current' ? answer.blobbi : null, pubkey, store, answer.status === 'current' ? currentSelectionAt(answer.profileAt) : null, answer.status === 'current' ? answer.profileId : null);
}

/**
 * M11D.8.2, A BLOBBI CHOSEN ON THE TITLE (MY BLOBBIS after CONNECT, or from the welcome back page): go on with it at
 * once instead of leaving the player on the list: its island when exactly one here is theirs, the islands page when
 * several, else WELCOME BACK with a new adventure for it (the Carrier choice). During play nothing more happens.
 */
blobbisScreen.onChosen = (b) => {
  if (state.mode !== 'play' || !title.active || intro || entry.active) return;
  const store = localStore();
  const pubkey = connectedPubkey;
  const seed = seedOf(b);
  if (!store || !pubkey || !seed || b.pubkey !== pubkey) return;
  gameUI.close();
  const facts = deviceFacts(store, pubkey, account.blobbis().items);
  const decision = decideChosen({ account: { pubkey, present: true }, islands: facts.islands, mine: facts.mine, chosen: { d: b.d, name: b.name, seed } });
  if (import.meta.env.DEV) console.info('[entry] chosen', b.name, decision.kind);
  carryOut(decision, b, pubkey, store);
};

/**
 * Make a new island (the title's CREATE ISLAND, taken once): new seeds whose identity has no save, the world
 * generated without the cottage (and a small turtle shell), saved at once with its name and its intro pending (so a
 * reload during the intro plays it again rather than losing the island), then the intro on the real world. On any
 * failure the playground's previous world and settings are restored and nothing is saved.
 */
function createWorld(kind: CarrierKind, name: string, companion: Companion = 'current', reserved: GuestBlobbi | null = null): string | null {
  const keep = { seed: state.seed, options: state.options, turtleSeed: state.turtleSeed, shellVariant: state.shellVariant, blobbi: state.blobbi, blobbiSeed: state.blobbiSeed, blobbiStage: state.blobbiStage };
  const keepWorld = { world, live, liveRenderer, viewRenderer, bounds };
  try {
    // A new world has no generated cottage: the player builds the first home (M8).
    state.options = { ...state.options, kind, generatedHouse: false };
    // A new turtle starts small (Variant S); worlds made before keep the variant in their identity.
    if (kind === 'turtle') state.shellVariant = NEW_WORLD_SHELL_VARIANT;
    const identityOf = (seed: string, turtleSeed: string) => worldIdentity(makeWorldFor(seed, turtleSeed));
    const { seed, turtleSeed } = newWorldSeeds(() => randomSeed('world'), identityOf, (id) => hasSave(id, storeGet));
    state.seed = seed;
    state.turtleSeed = turtleSeed;
    world = makeWorld(seed);
    const store = localStore();
    // M11D.4, MEET A NEW BLOBBI: the Blobbi with its reserved owner (made before this, see `createAdventure`): its
    // canonical address (owner, d) gives its V3 look, the egg's and the Baby's alike. Nothing is signed or published.
    if (companion === 'new') {
      if (!reserved) throw new Error(t('create.identityFailed'));
      const r = resolveBlobbi({ pubkey: reserved.owner, d: reserved.d });
      if (!r.ok) throw new Error(r.error);
      state.blobbi = r.source;
      state.blobbiSeed = r.source.seed;
      state.blobbiStage = 'baby';
    }
    const made = new LiveWorld(world, state.blobbi, state.blobbiSize, { stage: state.blobbiStage, store });
    if (hasSave(made.identity, storeGet)) throw new Error(t('create.exists'));
    made.islandName = name || null;
    made.intro = { state: 'pending', at: 0 };
    made.save();
    if (store && !hasSave(made.identity, storeGet)) throw new Error(t('create.storage'));
    // The new Blobbi walks from now on (the choice is kept in this browser, beside the islands, never in one).
    if (reserved && store) {
      updateGuestBlobbi(store, reserved.d, { island: made.identity });
      storeGuestSelection(store, state.blobbi, 'baby', playerNow());
    }
    shownName = blobbiDisplayName();
    live = made;
    liveRenderer = new LiveRenderer(live);
    viewRenderer = new ViewRenderer(live, liveRenderer);
    bounds = worldBounds(world);
    live.clock.speed = state.speed;
    syncControls();
    saveHash();
    rerender();
    showInventory();
    return null;
  } catch (e) {
    Object.assign(state, keep);
    ({ world, live, liveRenderer, viewRenderer, bounds } = keepWorld);
    syncControls();
    return `The island could not be made: ${(e as Error).message}. Nothing was saved.`;
  }
}

// Touch: a hidden text field brings up the device keyboard for the island name; what is typed mirrors into the title.
const nameInput = document.createElement('input');
nameInput.type = 'text';
nameInput.id = 'island-name-input';
nameInput.maxLength = 32;
nameInput.autocomplete = 'off';
nameInput.setAttribute('aria-label', t('create.nameLabel'));
nameInput.style.cssText = 'position:fixed;left:-1000px;top:0;width:10px;height:10px;opacity:0';
document.body.appendChild(nameInput);
function openNameInput(current: string): void {
  nameInput.value = current;
  nameInput.focus();
}
nameInput.addEventListener('input', () => {
  title.setName(nameInput.value);
  nameInput.value = title.name;
});
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === 'Escape') {
    e.preventDefault();
    view.focus();
    if (e.key === 'Enter') title.key('Enter');
  }
});

/** A world for other seeds, without touching the playground's state (identity checks for a new world). */
function makeWorldFor(seed: string, turtleSeed: string): WorldDescription {
  const keep = state.turtleSeed;
  state.turtleSeed = turtleSeed;
  try {
    return makeWorld(seed);
  } finally {
    state.turtleSeed = keep;
  }
}
const titleCamera = new ViewCamera('exploration');
// Touch: a floating stick on the world and a big USE button (shown once a touch is seen).
const touch = new TouchControls(() => hudScale(gameUI.settings));
/** The screen's safe-area insets (notches, rounded corners) in canvas pixels, read from CSS. */
function readSafeArea(): void {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const rect = view.getBoundingClientRect();
  const k = view.width / Math.max(1, rect.width);
  touch.insets = { top: parseFloat(cs.paddingTop) * k || 0, right: parseFloat(cs.paddingRight) * k || 0, bottom: parseFloat(cs.paddingBottom) * k || 0, left: parseFloat(cs.paddingLeft) * k || 0 };
  gameUI.insets = touch.insets;
  probe.remove();
}
window.addEventListener('resize', readSafeArea);
queueMicrotask(readSafeArea);

/**
 * Grow the island (the player chose to, at the growth panel): the stage is saved, the world is rebuilt from the save
 * exactly as a reload would, the Blobbi stays where it stood, and the new land is revealed while the camera pulls
 * back to show the whole island (not with reduced motion). The steps are `sim/regrow.ts` (tested end to end).
 */
function regrow(): boolean {
  if (!live || !world) return false;
  const r = growLiveIsland(live, { base: live.baseWorld, store: localStore() });
  if (!r.grown) {
    gameUI.say(r.reason, false);
    return false;
  }
  adoptRebuilt(r.live);
  return true;
}

/** Rebuild the live world from its save (after a dev stage change), keeping the Blobbi where it is. */
function rebuildFromSave(reveal: boolean): void {
  if (!live || !world) return;
  const before = live.world.growth?.stage ?? 0;
  adoptRebuilt(rebuildLive(live, { base: live.baseWorld, store: localStore(), reveal }));
  const after = live!.world.growth?.stage ?? 0;
  if (after < before) gameUI.say(`growth set back to stage ${after} (dev)`, true);
}

/** Show a rebuilt world: new renderers, and the camera pulls back to the whole island while new land is revealed. */
function adoptRebuilt(next: LiveWorld): void {
  live = next;
  liveRenderer = new LiveRenderer(live);
  viewRenderer = new ViewRenderer(live, liveRenderer);
  bounds = worldBounds(live.world);
  if (live.reveal && !gameUI.settings.reducedMotion && viewCamera.mode !== 'overview') {
    revealCameraReturn = viewCamera.mode;
    viewCamera.setMode('overview');
  }
}
// ─── Visiting another world (M7, local prototype) ─────────────────────────────
// The URL and the playground's world settings never change during a visit: a reload at any moment comes home.
const visit = new VisitSession();
let homeWorld: WorldDescription | null = null;
const player = localPlayerId(storeGet, (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* not stored */
  }
}, () => randomSeed('world'));
/** Remember that a world is this player's (its owner), when it is first played here. */
function claimWorld(identity: string): void {
  try {
    const owners = JSON.parse(localStorage.getItem(OWNERS_KEY) ?? '{}') ?? {};
    if (!owners[identity]) {
      owners[identity] = player;
      localStorage.setItem(OWNERS_KEY, JSON.stringify(owners));
    }
  } catch {
    /* not stored */
  }
}
const transport = new LocalVisitTransport(storeKeys, storeGet, () => (visit.visiting ? null : live?.identity ?? null));
/** A world from its parameters, without changing the playground's own settings. */
function worldFor(ref: WorldRef): WorldDescription {
  const keep = { seed: state.seed, options: state.options, turtleSeed: state.turtleSeed, shellVariant: state.shellVariant };
  try {
    const p = ref.params;
    state.seed = p.seed;
    state.options = { ...state.options, kind: p.kind, scale: p.scale, palette: p.palette as typeof state.options.palette, density: p.density, islands: p.islands as typeof state.options.islands, generatedHouse: p.generatedHouse };
    if (p.kind === 'manta' || p.kind === 'whale') state.turtleSeed = p.carrierSeed ?? p.seed;
    if (p.kind === 'turtle') {
      state.turtleSeed = p.turtleSeed ?? p.seed;
      if (isShellVariant(p.shellVariant ?? 0)) state.shellVariant = p.shellVariant as ShellVariant;
    }
    const frame = resolveFrame(ref.identity, [{ width: keep.options.width, height: keep.options.height }, { width: DEFAULT_WORLD_OPTIONS.width, height: DEFAULT_WORLD_OPTIONS.height }, { width: p.width, height: p.height }], (size) => {
      state.options = { ...state.options, ...size };
      return worldIdentity(makeWorld(state.seed));
    });
    if (frame) state.options = { ...state.options, ...frame };
    return makeWorld(state.seed);
  } finally {
    Object.assign(state, keep);
  }
}
worldsScreen.hooks = {
  list: () => transport.list(),
  stageOf: (ref) => {
    try {
      return JSON.parse(storeGet(`blobbi-pixel-lab:save:v1:${ref.identity}`) ?? '{}')?.growth?.stage ?? 0;
    } catch {
      return 0;
    }
  },
  generate: (ref) => worldFor(ref),
  player: () => player,
  visit: (ref) => startVisit(ref),
  goHome: () => {
    if (live && visit.goHome()) live.leaveBlobbi();
  },
  visiting: () => (visit.visiting ? (visit.target?.name ?? 'another island') : null),
};
function startVisit(ref: WorldRef): void {
  if (!live || live.interior || live.getPresenceState() !== 'present') return;
  live.save();
  if (!visit.go(ref, { x: live.blobbi.x, y: live.blobbi.y })) return;
  live.leaveBlobbi();
}
/** Switch worlds while the Blobbi is away (called each frame; acts only at the handoff points). */
function stepVisit(): void {
  if (!live || !world) return;
  const presence = live.getPresenceState();
  if (visit.phase === 'departing' && presence === 'present') visit.abort(); // the departure was cancelled
  if (visit.phase === 'departing' && visit.arrive(presence)) {
    homeWorld = world;
    const host = worldFor(visit.target!);
    world = host;
    live = new LiveWorld(host, state.blobbi, state.blobbiSize, { stage: state.blobbiStage, store: transport.open(visit.target!), visitor: true });
    live.visitLabel = visit.target!.name;
    arriveHere(live.listenSpot ?? null);
  } else if (visit.phase === 'returning' && visit.arriveHome(presence)) {
    world = homeWorld ?? makeWorld(state.seed);
    homeWorld = null;
    live = new LiveWorld(world, state.blobbi, state.blobbiSize, { stage: state.blobbiStage, store: localStore() });
    arriveHere(visit.homeSpot);
  }
}
/** The Blobbi arrives in the (new) current world, at a spot, by teleport. */
function arriveHere(at: { x: number; y: number } | null): void {
  if (!live || !world) return;
  if (at && live.collision.canStand(at.x, at.y, live.blobbi.footRx, live.blobbi.footRy)) {
    live.blobbi.x = at.x;
    live.blobbi.y = at.y;
  }
  live.clock.speed = state.speed;
  live.teleport.reducedMotion = gameUI.settings.reducedMotion;
  live.teleport.state = 'absent';
  live.enterBlobbi();
  liveRenderer = new LiveRenderer(live);
  viewRenderer = new ViewRenderer(live, liveRenderer);
  bounds = worldBounds(world);
  viewCamera.update(0, live.cameraTarget(), view.width, view.height, bounds, true);
  showInventory();
}

/** The camera mode to go back to when a growth reveal ends. */
let revealCameraReturn: CameraModeId | null = null;

function stopLive(): void {
  gameAudio.silence();
  endIntroPreview();
  if (intro) {
    intro.dispose();
    intro = null;
  }
  live = null;
  liveRenderer = null;
  viewRenderer = null;
  liveCanvas = null;
}

// ─── The intro cinematic ──────────────────────────────────────────────────────────────────────────────
/**
 * The cinematic playing over the view, if any: either a new island's own intro (`introMode` 'world', on the real
 * live world, ending in play) or a preview (WATCH THE INTRO, dev tools: a throwaway world with no store, ending back
 * on the title).
 */
let intro: IntroCinematic | null = null;
let introMode: 'world' | 'preview' = 'preview';
let introResult: IntroResult | null = null;

/**
 * A new island's intro, on the real world: the cinematic never steps or saves the world; when it ends (seen or
 * skipped) the intro is marked in the save, the camera takes the cinematic's last view and play begins at once.
 */
function startWorldIntro(): void {
  const target = live;
  if (!target || !liveRenderer || !viewRenderer) return;
  endIntroPreview();
  try {
    intro = new IntroCinematic(
      { live: target, renderer: liveRenderer, view: viewRenderer },
      {
        reducedMotion: gameUI.settings.reducedMotion,
        audio: gameUI.settings.sound ? audioEngine : null,
        renderOptions: state.live,
        uiScale: hudScale(gameUI.settings),
        onComplete: (r) => finishWorldIntro(target, r),
        // M11D.3: a local Blobbi met on this island and not born yet hatches from its egg (a local presentation).
        birth: unbornHere(target),
      },
    );
    introMode = 'world';
  } catch (e) {
    // The intro could not start: the island is fine, so play begins the usual way and the intro counts as seen.
    console.error('[intro] could not start', e);
    intro = null;
    target.setIntro('done');
    beginPlay();
    return;
  }
  title.active = false;
  gameUI.close();
  lastFrameTime = 0;
  view.focus();
}

/** The new island's intro ended: mark it, take its camera, and play. */
function finishWorldIntro(target: LiveWorld, r: IntroResult): void {
  introResult = r;
  const done = intro;
  intro = null;
  done?.dispose();
  if (live !== target) return;
  target.setIntro(r.skipped ? 'skipped' : 'done');
  // M16.1: the intro showed the Blobbi being born here, but it belongs to another World (the call was refused or
  // failed): it leaves with its journey rather than vanishing from one frame to the next
  // (a move here still under way, `coming`, is not "away": the kit's sync keeps it shown until it lands)
  if (worldTravel?.view()?.kind === 'away' && target.getPresenceState() === 'present') target.leaveBlobbi();
  // The birth was seen (or skipped): it never plays again; and the Blobbi has now been on this island.
  if (isLocalBlobbiSeed(target.blobbi.seed)) storeOrNull((st) => markBorn(st, target.blobbi.seed, Date.now()));
  const born = target.blobbi.source;
  if (born.kind === 'v3-address') storeOrNull((st) => updateGuestBlobbi(st, born.d, { born: true }));
  // M11D.5: a newborn's first little quest is its name.
  namingAfterBirth = true;
  namingCalm = 0;
  noteVisit(target);
  setCameraMode(r.cameraMode);
  if (bounds) viewCamera.update(0, target.cameraTarget(), view.width, view.height, bounds, true);
  playStarted = true;
  touchWorld();
  lastFrameTime = 0;
  if (import.meta.env.DEV) console.info('[intro] complete', r);
}
/**
 * Play the intro on a preview world of a species. The preview world has no store (nothing is read or written),
 * the player's own live world is left exactly as it is, and the title screen returns when the cinematic ends.
 */
function startIntroPreview(kind: CarrierKind, reduced = gameUI.settings.reducedMotion): void {
  endIntroPreview();
  const previewLive = new LiveWorld(introPreviewWorld(kind), state.blobbi, state.blobbiSize, { stage: state.blobbiStage, store: null });
  const previewRenderer = new LiveRenderer(previewLive);
  const previewView = new ViewRenderer(previewLive, previewRenderer);
  intro = new IntroCinematic(
    { live: previewLive, renderer: previewRenderer, view: previewView },
    {
      reducedMotion: reduced,
      audio: gameUI.settings.sound ? audioEngine : null,
      renderOptions: state.live,
      uiScale: hudScale(gameUI.settings),
      onComplete: (r) => {
        introResult = r;
        if (import.meta.env.DEV) console.info('[intro] complete', r);
        endIntroPreview();
      },
    },
  );
  introMode = 'preview';
  title.active = false;
  gameUI.close();
  lastFrameTime = 0;
  view.focus();
}
/** Leave the preview (ended, skipped or abandoned): dispose it and return to the title. */
function endIntroPreview(): void {
  if (!intro || introMode !== 'preview') return;
  const done = intro;
  intro = null;
  done.dispose();
  if (state.mode === 'play' && live) title.active = true;
}
function introFrame(real: number): void {
  const playing = intro;
  if (!playing) return;
  let frame: PixelBuffer;
  try {
    frame = playing.frame(real, view.width, view.height);
  } catch (e) {
    // A failing frame never strands the player: a preview returns to the title, a new island goes on into play.
    console.error('[intro] frame failed', e);
    if (introMode === 'preview') endIntroPreview();
    else if (!playing.done) playing.skip();
    else intro = null;
    return;
  }
  if (!intro) return; // it ended during this frame and handed over
  liveCanvas = toCanvas(frame, liveCanvas ?? undefined);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(liveCanvas, 0, 0);
}

function readInput(): LiveInput {
  const stick = touch.directions();
  const input: LiveInput = {
    up: keys.has('ArrowUp') || keys.has('KeyW') || stick.up,
    down: keys.has('ArrowDown') || keys.has('KeyS') || stick.down,
    left: keys.has('ArrowLeft') || keys.has('KeyA') || stick.left,
    right: keys.has('ArrowRight') || keys.has('KeyD') || stick.right,
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

let titleCreateFrames = 0;
/** The title: the world paused, the camera drifting slowly over the island, the menu on top. */
function titleFrame(now: number, real: number): void {
  if (!live || !bounds) return;
  readInput();
  const b = bounds;
  const t = now / 1000;
  // A slow circle around the island's middle (still, with reduced motion).
  const drift = gameUI.settings.reducedMotion ? 0 : t * 0.05;
  const target = { x: b.width / 2 + Math.cos(drift) * b.width * 0.12, y: b.height / 2 + Math.sin(drift) * b.height * 0.1, size: live.blobbi.size };
  const rest = titleCamera.restScale('exploration', view.width, view.height, b);
  const v = titleCamera.update(real, target, view.width, view.height, b);
  const frame = viewRenderer!.render(v, rest, live.clock.time, state.live, { ...DEFAULT_VIEW_UI, hud: false, goals: false, prompt: false, indicator: false, lighting: gameUI.settings.daylight });
  title.reducedMotion = gameUI.settings.reducedMotion;
  // M11D.8.2: while an automatic entry is decided, the loading page (never the menu under it); it may give up.
  if (entry.active) entry.render(frame, t);
  if (!entry.active) title.render(frame, t);
  if (gameUI.capturing) gameUI.render(frame, t);
  // CREATE ISLAND: the "creating" page has been drawn once; now make the island (taken once: never twice).
  if (title.page === 'creating' && title.pendingCreate && titleCreateFrames++ >= 1) {
    const req = title.takeCreate()!;
    titleCreateFrames = 0;
    void createAdventure(req);
    return;
  }
  if (title.page !== 'creating') titleCreateFrames = 0;
  if (gameUI.settings.sound) gameAudio.update(live, Math.min(0.25, real), []);
  live.sounds.length = 0;
  liveCanvas = toCanvas(frame, liveCanvas ?? undefined);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(liveCanvas, 0, 0);
}

function playFrame(now: number): void {
  rafId = requestAnimationFrame(playFrame);
  // The text size is a drawing preference (M11B): read each frame, so a change shows at once.
  textPreference.smaller = gameUI.settings.textSize === 'small';
  // World presence follows the account from the first frame, the title's and the intro's too: the presses that start
  // play are the player playing here, and must be seen (a page made only once play began missed them, and the
  // Blobbi was sent home right after its first arrival)
  worldPresence.update();
  worldTravel?.update();
  resolveEntryHold();
  travelAwayNotice();
  if (state.mode !== 'play' || !live || !liveRenderer || !world) return;
  const real = lastFrameTime ? (now - lastFrameTime) / 1000 : 1 / 60;
  lastFrameTime = now;
  push(frameTimes, real * 1000);
  if (intro) {
    introFrame(real);
    return;
  }
  if (title.active) {
    titleFrame(now, real);
    return;
  }
  const t0 = performance.now();
  playStarted = true;
  // An open menu pauses the world: no steps, no input.
  const steps = gameUI.capturing ? (readInput(), 0) : live.update(real, readInput());
  const t1 = performance.now();
  // The camera is presentation only: it reads the Blobbi's position and never feeds anything back.
  // The room has its own bounds; changing scene snaps the camera instead of easing across.
  const sceneBounds = live.sceneBounds() ?? bounds!;
  const sceneKey = live.interior?.state.shelterId ?? 'island';
  const snap = sceneKey !== lastScene;
  lastScene = sceneKey;
  stepVisit();
  if (!live) return;
  if (revealCameraReturn && !live.reveal) {
    viewCamera.setMode(revealCameraReturn);
    revealCameraReturn = null;
  }
  const restScale = viewCamera.restScale(viewCamera.mode, view.width, view.height, sceneBounds);
  live.teleport.reducedMotion = gameUI.settings.reducedMotion;
  viewRenderer!.reducedMotion = gameUI.settings.reducedMotion;
  // The camera follows the Blobbi, lifted a little while a teleport wants the sky in view.
  const cameraView = (lastView = viewCamera.update(real, live.cameraTarget(view.height / restScale), view.width, view.height, sceneBounds, snap, steps * live.clock.dt));
  const frame = viewRenderer!.render(cameraView, restScale, live.clock.time, state.live, { ...DEFAULT_VIEW_UI, hud: state.live.hud, goals: gameUI.settings.goals, lighting: gameUI.settings.daylight, uiScale: hudScale(gameUI.settings), bottom: gameUI.menuBarHeight, identity: identityNow(), promptAvoid: gameUI.hotbarBox, blobbiName: shownName, travelCue: travelCue() });
  push(modeTimes[cameraView.mode], viewRenderer!.timings.total);
  const t2 = performance.now();
  gameUI.touchMode = touch.enabled;
  gameUI.hudBottom = viewRenderer!.hudBottom;
  updateNaming(real);
  // Companion sync: a choice made in another Blobbi game comes along once the moment is calm
  companion.tick();
  invite.update(real, { running: steps > 0 && !gameUI.capturing && document.visibilityState === 'visible', inputAge: (performance.now() - lastInputAt) / 1000, world: live, busy: inviteBusy() });
  gameUI.render(frame, now / 1000);
  if (!gameUI.capturing) touch.draw(frame, gameUI.menuBarHeight);
  // Sound: the world's events to the audio director (and to any other listener as events), then cleared.
  if (gameUI.settings.sound) {
    for (const name of live.sounds) window.dispatchEvent(new CustomEvent('blobbi-sound', { detail: name }));
    gameAudio.update(live, Math.min(0.25, real), live.sounds);
  }
  live.sounds.length = 0;
  liveCanvas = toCanvas(frame, liveCanvas ?? undefined);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(liveCanvas, 0, 0);
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
    `\nwood      <b>${inv.count(ITEMS.wood.id)}</b> / ${inv.limit(ITEMS.wood.id)}` +
    TOOLS.map((t) => `\n${itemLabel(t).replace('simple ', '').padEnd(9)} <b>${inv.count(t) ? (live!.equipped === t ? 'equipped' : 'in the bag') : 'none'}</b>`).join('') +
    [ITEMS.carrotSeed.id, ITEMS.pumpkinSeed.id, ...FOODS].filter((i) => inv.count(i) > 0).map((i) => `\n${itemPlural(i).padEnd(9)} <b>${inv.count(i)}</b> / ${inv.limit(i)}`).join('') +
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
  if (facing && facing.placement.kind === 'rock' && facing.index < live.world.objects.length) {
    const c = live.rockAt(facing.index);
    if (!isLargeRock(facing.placement.size)) treeLine = `facing a small rock: too small to mine${near ? ` (E collects the ${near.kind} first)` : ''}`;
    else if (c.phase === 'rubble') treeLine = `facing rubble, ${Math.ceil(c.remaining)} s until the rock is whole`;
    else treeLine = `facing a large rock: ${live.equipped === ITEMS.pickaxe.id ? `E to mine (${live.rocks.get(facing.index)?.hits ?? 0}/4)` : 'equip the pickaxe to mine'}`;
  }
  $('crafting').innerHTML = lines.join('\n') + `\nchops ${live.stats.chops}   felled ${live.stats.felled}   mined ${live.stats.mined}   regrowing nodes ${live.collectedAt.size}   crafted ${live.stats.crafted}   world time ${live.worldTime.toFixed(0)} s` + (treeLine ? `\n${treeLine}` : '');
  $('craft-axe').toggleAttribute('disabled', !canCraft(inv, RECIPES[0]).ok);
  $('craft-pickaxe').toggleAttribute('disabled', !canCraft(inv, RECIPES[1]).ok);
  $('craft-hoe').toggleAttribute('disabled', !canCraft(inv, recipeById('blobbi-pixel:recipe:simple-hoe')!).ok);
  $('equip-axe').textContent = `Switch tool (Q): ${live.equipped ? itemLabel(live.equipped) : 'empty hands'}`;
  $('equip-axe').toggleAttribute('disabled', TOOLS.every((t) => inv.count(t) === 0));
  $('pickaxe-icon-row').classList.toggle('hidden', inv.count(ITEMS.pickaxe.id) === 0);
  $('pickaxe-icon-label').textContent = live.equipped === ITEMS.pickaxe.id ? 'simple pickaxe, equipped (in hand)' : 'simple pickaxe, in the bag';
  $('axe-icon-row').classList.toggle('hidden', inv.count(ITEMS.axe.id) === 0);
  $('axe-icon-label').textContent = live.equipped === ITEMS.axe.id ? 'simple axe, equipped (in hand)' : 'simple axe, in the bag';
  if (live.swing) $('crafting').innerHTML += `\nswing     ${live.equipmentAnimation(live.clock.time)}`;
}

function drawAxeIcon(): void {
  for (const [id, item] of [['axe-icon', ITEMS.axe.id], ['pickaxe-icon', ITEMS.pickaxe.id]] as const) {
    const c = $<HTMLCanvasElement>(id);
    const icon = toolIcon(item, paletteFor(state.options.palette), 4);
    c.width = icon.buffer.width;
    c.height = icon.buffer.height;
    c.getContext('2d')!.drawImage(toCanvas(icon.buffer), 0, 0);
  }
}

const buildButtons = new Map<BuildingKind, HTMLButtonElement>();
for (const kind of BUILDING_KINDS) {
  const button = document.createElement('button');
  button.textContent = BUILDINGS[kind].label.replace('wooden ', '').replace('small ', '').replace('storage ', '');
  button.addEventListener('click', () => {
    if (live) live.setBuildMode(live.buildMode === kind ? null : kind);
    showBuilding();
    view.focus();
  });
  buildButtons.set(kind, button);
  $('build-buttons').append(button);
}

function showBuilding(): void {
  if (!live) return;
  const unlocked = live.unlocked();
  const lines = BUILDING_KINDS.map((kind) => {
    const def = BUILDINGS[kind];
    const name = def.label.replace('wooden ', '').replace('small ', '').replace('storage ', '').padEnd(10);
    if (!unlocked.has(kind)) return `${name}<span class="warn">locked</span> (a goal unlocks it)`;
    const cost = def.cost.map((c) => `${c.quantity} ${itemLabel(c.item)} (${live!.inventory.count(c.item)})`).join(' + ');
    return `${name}${cost} → ${live!.canAfford(kind) ? '<b>affordable</b>' : 'missing'}`;
  });
  lines.push(`built     ${live.buildings.length}` + live.buildings.map((b) => ` · ${b.kind} ${(live!.buildingAt(b) * 100).toFixed(0)}%`).join(''));
  if (live.buildMode) {
    const check = live.placementCheck();
    const spot = live.placementSpot();
    lines.push(`preview   <b>${BUILDINGS[live.buildMode].label}: ${check.ok ? 'fits' : check.problem}</b> at ${spot.x},${spot.y}   E place, B next, Esc cancel`);
  }
  $('building').innerHTML = lines.join('\n');
  for (const [kind, button] of buildButtons) {
    button.toggleAttribute('disabled', !unlocked.has(kind));
    button.classList.toggle('primary', live.buildMode === kind);
  }
}

function toggleBuild(): void {
  if (!live) return;
  live.cycleBuildMode();
  showBuilding();
}

const bar = (v: number) => {
  const n = Math.round(v / 10);
  return `${'█'.repeat(n)}${'░'.repeat(10 - n)} ${v.toFixed(0).padStart(3)}`;
};

function showCare(): void {
  if (!live) return;
  const c = live.care;
  const brain = live.brain;
  const food = live.foodToGive();
  const doing = brain.state === 'rest' ? (brain.restAtShelter ? 'sleeping in the shelter' : 'sleeping') : brain.state === 'to-shelter' ? 'going home to sleep' : brain.manualActive ? 'following you' : brain.state;
  $('care').innerHTML =
    `fed       ${bar(c.hunger)}${isHungry(c) ? '  <span class="warn">hungry</span>' : ''}\n` +
    `energy    ${bar(c.energy)}${isTired(c) ? '  <span class="warn">tired</span>' : ''}\n` +
    `joy       ${bar(c.happiness)}\n` +
    `now       ${escapeHtml(doing)}\n` +
    `food      ${food ? `<b>${FOODS.map((f) => live!.inventory.count(f) && `${live!.inventory.count(f)} ${live!.inventory.count(f) === 1 ? itemLabel(f) : itemPlural(f)}`).filter(Boolean).join(', ')}</b>` : 'none yet (grow some)'}`;
  $('care-feed').toggleAttribute('disabled', !food);
  $('care-rest').textContent = brain.state === 'rest' || brain.state === 'to-shelter' ? 'Wake (R)' : 'Rest (R)';
}

function showFarming(): void {
  if (!live) return;
  const t = live.worldTime;
  const inv = live.inventory;
  const seeds = CROP_KINDS.map((k) => `${k} ${inv.count(CROPS[k].seed)}`).join('  ');
  const lines = [`seed      <b>${live.selectedCrop}</b> (T)   ${seeds}`];
  const ripe = live.plots.filter((p) => p.crop && isMature(p.crop, t)).length;
  const dry = live.plots.filter((p) => p.crop && !isMature(p.crop, t) && !isWet(p.crop, t)).length;
  lines.push(`plots     ${live.plots.length}   planted ${live.plots.filter((p) => p.crop).length}   ripe ${ripe}   need water ${dry}   harvests ${live.tally.harvested}`);
  const action = live.farmAction();
  if (action && 'plot' in action && action.plot.crop) {
    const crop = action.plot.crop;
    lines.push(`facing    ${crop.kind}, ${STAGE_NAMES[live.cropStageOf(action.plot)]}, ${(cropProgress(crop, t) * 100).toFixed(0)}%${isWet(crop, t) ? `, wet ${Math.ceil(crop.wetUntil! - t)} s` : isMature(crop, t) ? '' : ', dry'}`);
  } else if (action) lines.push(`facing    ${action.kind === 'till' ? 'grass to till' : action.kind === 'cannot-till' ? `cannot till: ${action.check.problem}` : 'an empty plot'}`);
  $('farming').innerHTML = lines.join('\n');
}

function showObjectives(): void {
  if (!live) return;
  const current = currentObjective(live.objectives);
  const ctx = { tally: live.tally, inventory: live.inventory, buildings: live.buildings, worldTime: live.worldTime };
  $('objectives').innerHTML = OBJECTIVES.map((o, i) => {
    const done = o.id in live!.objectives.completed;
    const mark = done ? '✓' : o === current ? '▸' : '·';
    const title = `${mark} ${String(i + 1).padStart(2)} ${escapeHtml(o.title)}${o.progress && !done ? ` ${o.progress(ctx)}` : ''}`;
    if (o === current) return `<b>${title}</b>\n     ${escapeHtml(o.hint)}\n     reward: ${escapeHtml(o.reward.text)}`;
    return done ? `<span class="muted">${title}</span>` : title;
  }).join('\n') + (current ? '' : '\n<b>every goal done: the island is thriving</b>');
}

function craftHoe(): void {
  if (!live) return;
  live.craftRecipe(recipeById('blobbi-pixel:recipe:simple-hoe')!);
  showInventory();
}

function feedBlobbi(): void {
  live?.feed();
  showCare();
}

function craftAxe(): void {
  if (!live) return;
  live.craftRecipe(RECIPES[0]);
  showInventory();
}

function craftPickaxe(): void {
  if (!live) return;
  live.craftRecipe(RECIPES[1]);
  showInventory();
}

/** Cycle the hand: empty → each owned tool in order → empty. */
function toggleAxe(): void {
  if (!live) return;
  const next = nextToolInCycle((t) => live!.inventory.count(t), live.equipped);
  if (next === null) live.unequip();
  else live.equip(next);
  showInventory();
}

function showPlayStats(): void {
  if (!live || !liveRenderer) return;
  showInventory();
  showBuilding();
  showCare();
  showFarming();
  showObjectives();
  const b = live.blobbi;
  const t = liveRenderer.timings;
  const v = viewRenderer?.timings;
  const cam = CAMERA_MODES[viewCamera.mode];
  const native = viewRenderer?.lastBlobbi;
  $('stats').innerHTML =
    `fps       <b>${fps.toFixed(0)}</b>  frame ${avg(frameTimes).toFixed(1)} ms\n` +
    `worst     ${max(frameTimes).toFixed(1)} ms (last 90 frames)\n` +
    `sim       ${avg(simTimes).toFixed(2)} ms  render ${avg(renderTimes).toFixed(2)} ms\n` +
    `upload    ${avg(uploadTimes).toFixed(2)} ms  (copy ${t.copy.toFixed(2)} water ${t.water.toFixed(2)} objects ${t.objects.toFixed(2)})\n` +
    `camera    <b>${cam.label}</b> ${viewCamera.scale.toFixed(2)}×  blobbi ${native ? `${native.size} px native` : '-'}  world px ${v?.worldPixels ?? 0}\n` +
    `view      world ${v?.world.toFixed(2)} compose ${v?.compose.toFixed(2)} blobbi ${v?.blobbi.toFixed(2)} ui ${v?.ui.toFixed(2)} ms\n` +
    `per mode  ${CAMERA_CYCLE.map((m) => `${m} ${modeTimes[m].length ? avg(modeTimes[m]).toFixed(2) : '-'}`).join('  ')} ms\n` +
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
  lastInputAt = performance.now();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Escape'].includes(e.code)) e.preventDefault();
  // The intro cinematic: any key skips it.
  if (intro) {
    if (!e.repeat) intro.requestSkip();
    return;
  }
  // The title screen owns the keyboard (unless its settings panel is open).
  if (title.active && !gameUI.capturing) {
    // M11D.8.2: the loading page first (ESC or MAIN MENU gives the title back; nothing reaches the menu behind).
    if (entry.active) {
      if (!e.repeat) entry.key(e.code);
      e.preventDefault();
      return;
    }
    if (!e.repeat || title.page === 'name') title.key(e.code, e.key);
    if (e.code === 'Backspace') e.preventDefault();
    return;
  }
  // Menus first: an open screen takes every key (held keys let go, so the Blobbi stops), and I/K/J/U/Esc open them.
  if ((!e.repeat || gameUI.capturing) && gameUI.handleKey(e.code, e.shiftKey)) {
    keys.clear();
    interactPressed = plantPressed = false;
    return;
  }
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyE' || e.code === 'Space') interactPressed = true;
  if (e.code === 'KeyP') plantPressed = true;
  if (e.code === 'KeyC') craftAxe();
  if (e.code === 'KeyV') craftPickaxe();
  if (e.code === 'KeyG') craftHoe();
  // T: the style of what is being placed or managed, else the next seed.
  if (e.code === 'KeyT') {
    if (live?.placing) live.cycleVariant();
    else if (live?.manage) live.restyleSelected();
    else live?.cycleCrop();
  }
  if (e.code === 'KeyM') live?.toggleManage();
  if ((e.code === 'KeyX' || e.code === 'Delete' || e.code === 'Backspace') && live?.manage) live.removeSelected();
  if (e.code === 'KeyF') feedBlobbi();
  if (e.code === 'KeyH') live?.pet();
  if (e.code === 'KeyR') live?.rest();
  if (e.code === 'KeyO') gameUI.settings.goals = !gameUI.settings.goals;
  // Escape steps back out of a mode: moving (puts it back), placing, management, building.
  if (e.code === 'Escape' && live) {
    if (live.moving) live.cancelMove();
    else if (live.placing) live.stopPlacing();
    else if (live.manage) live.toggleManage();
    else if (live.buildMode) live.setBuildMode(null);
    showBuilding();
  }
  if (e.code === 'KeyQ') toggleAxe();
  // 1-5: the hotbar's slots (M11C). Never while something that types has the keyboard.
  const slot = hotbarIndexForKey(e.code);
  if (slot !== null && !isTypingTarget(e.target) && gameUI.pickTool(slot)) showInventory();
  if (e.code === 'KeyB') toggleBuild();
  if (e.code === 'KeyZ') setCameraMode(CAMERA_CYCLE[(CAMERA_CYCLE.indexOf(viewCamera.mode) + 1) % CAMERA_CYCLE.length]);
});
// Development only: a handle for inspecting the running world from the console (never in the build).
if (import.meta.env.DEV) (window as unknown as { __blobbi: unknown }).__blobbi = { audio: () => gameAudio, live: () => live, invite: () => invite, account: () => account, identity: () => identityScreen, naming: () => namingScreen, devGrow: (stage: number) => (live?.devSetGrowthStage(stage), rebuildFromSave(true)), identityService: () => identityService(), openIdentity: (p: 'activate' | 'restore') => openIdentity(p), camera: () => viewCamera, view: () => viewRenderer, frame: (now: number) => (playFrame(now), cancelAnimationFrame(rafId)), ui: () => gameUI, title: () => title, entry: () => entry, intro: () => intro, introResult: () => introResult, previewIntro: (kind: CarrierKind, reduced?: boolean) => startIntroPreview(kind, reduced), companion: () => companion };
// Development only: time, test resources, needs and goal tools for manual testing (the build drops the import).
if (import.meta.env.DEV)
  void import('../dev/dev-tools').then((m) =>
    m.installDevTools($('dev-tools'), {
      getLive: () => live,
      refresh: () => {
        showInventory();
        showBuilding();
        showCare();
        showFarming();
        showObjectives();
      },
      rebuildWorld: (reveal: boolean) => rebuildFromSave(reveal),
      previewIntro: (kind, reduced) => {
        if (state.mode !== 'play') setMode('play');
        startIntroPreview(kind, reduced);
      },
      // A refused dev action shows as a notice on the game view (no panel is open to carry a message).
      say: (text: string) => {
        if (live) live.notices.push({ heading: 'Dev tools', title: 'Not on this world', text, until: Math.max(live.clock.time, live.notices.at(-1)?.until ?? 0) + 5 });
      },
      // A separate world seed: experiments never touch the player's own save.
      openTestWorld: (kind) => {
        state.seed = 'm5-test-world';
        // Test worlds keep the pre-M8 generation (a stable identity for the test plan).
        state.options = { ...state.options, generatedHouse: undefined };
        if (kind) {
          state.options = { ...state.options, kind };
          if (kind !== 'turtle') state.turtleSeed = `${kind}-test`;
          syncControls();
        }
        seedInput.value = state.seed;
        regenerate();
        if (!live) startLive();
        view.focus();
      },
    }),
  );
window.addEventListener('beforeunload', () => {
  if (playStarted) live?.save();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playStarted) live?.save();
  // A hidden tab is silent; showing it again resumes (the world itself pauses with the animation frames).
  if (document.hidden) audioEngine.suspend();
  else if (gameUI.settings.sound) audioEngine.resume();
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
$('craft-pickaxe').addEventListener('click', () => {
  craftPickaxe();
  view.focus();
});
$('equip-axe').addEventListener('click', () => {
  toggleAxe();
  view.focus();
});
$('craft-hoe').addEventListener('click', () => {
  craftHoe();
  view.focus();
});
$('farm-seed').addEventListener('click', () => {
  live?.cycleCrop();
  showFarming();
  view.focus();
});
$('care-feed').addEventListener('click', () => {
  feedBlobbi();
  view.focus();
});
$('care-pet').addEventListener('click', () => {
  live?.pet();
  view.focus();
});
$('care-rest').addEventListener('click', () => {
  live?.rest();
  showCare();
  view.focus();
});
// Deleting progress always asks first, names the island, and ignores the Delete button for a moment after asking
// (so a double click or a repeated tap on the first button can never also confirm).
const resetGate = new ConfirmGate<string>();
$('progress-reset').addEventListener('click', () => {
  if (!live || live.visitor) return;
  resetGate.open(live.identity, performance.now() / 1000);
  $('reset-confirm-text').textContent = `Delete all progress on ${islandLabel(live.identity)} (${live.species})? Its bag, buildings, farm, house and quests are erased from this browser. This cannot be undone.`;
  $('reset-confirm').classList.remove('hidden');
  $('reset-delete').toggleAttribute('disabled', true);
  setTimeout(() => $('reset-delete').toggleAttribute('disabled', !resetGate.pending), CONFIRM_ARM_SECONDS * 1000 + 20);
  $('reset-cancel').focus();
});
$('reset-cancel').addEventListener('click', () => {
  resetGate.cancel();
  $('reset-confirm').classList.add('hidden');
  view.focus();
});
$('reset-delete').addEventListener('click', () => {
  const identity = resetGate.confirm(performance.now() / 1000);
  if (!identity) return;
  $('reset-confirm').classList.add('hidden');
  // Only the island the question named, and only if it is still the one loaded.
  if (live && live.identity === identity) live.resetProgress();
  showInventory();
  view.focus();
});
$('play-speed').addEventListener('change', (e) => {
  state.speed = Number((e.target as HTMLSelectElement).value);
  if (live) live.clock.speed = state.speed;
});
$('play-camera').addEventListener('change', (e) => setCameraMode((e.target as HTMLSelectElement).value as CameraModeId));
$('blobbi-seed').addEventListener('change', (e) => chooseBlobbi(resolveBlobbi({ seed: (e.target as HTMLInputElement).value })));
$('blobbi-random').addEventListener('click', () => setBlobbiSeed(randomSeed('blobbi')));
$('blobbi-random-v3').addEventListener('click', () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  chooseBlobbi(resolveBlobbi({ seed: Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join('') }));
});
$('blobbi-address').addEventListener('click', () => chooseBlobbi(resolveBlobbi({ pubkey: $<HTMLInputElement>('blobbi-pubkey').value, d: $<HTMLInputElement>('blobbi-d').value })));
$('blobbi-size').addEventListener('change', (e) => {
  state.blobbiSize = Number((e.target as HTMLSelectElement).value);
  live?.setBlobbi(state.blobbi, state.blobbiSize, state.blobbiStage);
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

/** A demo seed from the lab's own buttons and gallery (always valid). */
function setBlobbiSeed(seed: string): void {
  chooseBlobbi(resolveBlobbi({ seed }));
}

/** The player chose a Blobbi: use it if valid (and remember it in this browser), else say why and keep the current one. */
function chooseBlobbi(r: ResolvedBlobbi): void {
  if (!r.ok) {
    // The fields keep what was typed, so it can be corrected; the current Blobbi stays.
    showBlobbiStatus(r.error, true);
    return;
  }
  selectBlobbi(r.source);
  showBlobbiStatus(r.notes.join(' '), false);
}

function selectBlobbi(source: BlobbiSource, from?: { name: string; account: string; stage?: BlobbiStage }, when: SelectionWhen = playerNow()): void {
  const store = localStore();
  // Companion sync: the player's own choice of their account's Blobbi is made over the profile they were shown, and is
  // then shared with their other Blobbi games (a choice adopted from them, `by: 'remote'`, never is).
  const mine = when.by === 'player' && !!from?.account && from.account === connectedPubkey;
  if (store) storeSelection(store, source, from, mine ? { ...when, over: when.over ?? seenNow() } : when);
  applyBlobbi(source, from?.stage ?? 'adult');
  if (mine) void companion.chosen();
}

/** Walk with a Blobbi without changing the stored choice (the account rule, `syncAccountBlobbi`). */
function applyBlobbi(source: BlobbiSource, stage: BlobbiStage = 'adult'): void {
  state.blobbi = source;
  state.blobbiSeed = source.seed;
  state.blobbiStage = stage;
  shownName = blobbiDisplayName();
  syncControls();
  // Only the Blobbi changes: the world's inventory, equipment and buildings stay (they are the world's).
  // M11D.2: in play the change is seen (the outgoing Blobbi leaves, the new one arrives at its spot); before play,
  // on the title or during the intro it is immediate.
  if (live && playStarted && !intro) {
    // M11D.3: about 6 s the first time this Blobbi comes to this island, about 3 s after that.
    const quick = storeOrNull((st) => visitedBefore(st, live!.identity, source.seed)) ?? false;
    if (live.swapBlobbi(source, state.blobbiSize, stage, { quick }) !== 'unchanged' && !live.visitor) recordVisitOf(live.identity, source.seed, stage);
  } else live?.setBlobbi(source, state.blobbiSize, stage);
  saveHash();
  renderBlobbiView();
}

function showBlobbiStatus(note: string, error: boolean): void {
  const text = `${describeSource(state.blobbi)}${note ? ` · ${note}` : ''}`;
  for (const id of ['blobbi-status', 'blobbi-status-2']) {
    const el = $(id);
    el.textContent = error ? `${note}` : text;
    el.style.color = error ? '#ff8a80' : '';
  }
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
  const id = identityOfSource(state.blobbi, state.blobbiStage);
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
  title.textContent = `${describeSource(state.blobbi)} · ${previewSize} px · antenna ${id.antenna.count}, horns ${id.horns.kind}, ears ${id.ears.kind}, tail ${id.tail.kind}, ${id.pattern.kind}, mark ${id.mark.kind}${id.belly ? ', belly' : ''}${id.freckles ? ', freckles' : ''}`;
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
    fig.addEventListener('click', () => setBlobbiSeed(seed));
    grid.append(fig);
  }
  host.append(grid);
  $('stats').innerHTML = `blobbi    <b>${escapeHtml(describeSource(state.blobbi))}</b>\nseed      ${escapeHtml(state.blobbiSeed)}\nsize      ${previewSize} px\nsprite    ${buildBlobbiSprite(id, REST_POSE, previewSize).buffer.width}×${buildBlobbiSprite(id, REST_POSE, previewSize).buffer.height} px\ngenes     ${Object.entries(id.genes)
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
  const id = identityOfSource(state.blobbi, state.blobbiStage);
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

$('blobbi-seed-2').addEventListener('change', (e) => chooseBlobbi(resolveBlobbi({ seed: (e.target as HTMLInputElement).value })));
$('blobbi-random-2').addEventListener('click', () => setBlobbiSeed(randomSeed('blobbi')));
$('blobbi-use').addEventListener('click', () => {
  live?.setBlobbi(state.blobbi, state.blobbiSize, state.blobbiStage);
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
  gh.textContent = `gameplay size: ${state.blobbiSize} px in world pixels, shown ×${state.playZoom} here; in play the camera draws it natively at ${state.blobbiSize}, ${state.blobbiSize * 2} or ${state.blobbiSize * 4} px`;
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
  $<HTMLSelectElement>('play-camera').value = viewCamera.mode;
  $<HTMLInputElement>('blobbi-seed').value = state.blobbiSeed;
  $<HTMLInputElement>('blobbi-seed-2').value = state.blobbiSeed;
  $<HTMLInputElement>('blobbi-pubkey').value = state.blobbi.kind === 'v3-address' ? state.blobbi.pubkey : '';
  $<HTMLInputElement>('blobbi-d').value = state.blobbi.kind === 'v3-address' ? state.blobbi.d : '';
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
  state.options.kind = (e.target as HTMLSelectElement).value as 'island' | 'turtle' | 'manta' | 'whale';
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
  lastInputAt = performance.now();
  // Any touch (on the title, the intro or a menu too) switches the game to touch: bigger buttons, "tap" in tips.
  if (e.pointerType === 'touch' || e.pointerType === 'pen') touch.enabled = true;
  if (state.mode === 'play') {
    // Menus and the menu bar take clicks and taps (client position → canvas pixels, robust to CSS scaling).
    const rect = view.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) * view.width) / Math.max(1, rect.width);
    const sy = ((e.clientY - rect.top) * view.height) / Math.max(1, rect.height);
    // The intro cinematic: a click or a tap skips it.
    if (intro) {
      intro.requestSkip();
      e.preventDefault();
      return;
    }
    if (title.active && !gameUI.capturing) {
      if (entry.active) entry.pointer(sx, sy);
      else title.pointer(sx, sy);
      e.preventDefault();
      return;
    }
    if (gameUI.handlePointer(sx, sy)) {
      e.preventDefault();
      return;
    }
    // M11C: the Guest / Connected chip opens the ACCOUNT page.
    if (!gameUI.capturing && viewRenderer?.onIdentity(sx, sy)) {
      openAccountPage();
      e.preventDefault();
      return;
    }
    // The camera indicator (bottom left): a click or a tap moves to the next camera mode, as Z does.
    if (!gameUI.capturing && viewRenderer?.onIndicator(sx, sy)) {
      setCameraMode(CAMERA_CYCLE[(CAMERA_CYCLE.indexOf(viewCamera.mode) + 1) % CAMERA_CYCLE.length]);
      e.preventDefault();
      return;
    }
    // Touch: the USE button, or a press that becomes the stick (a tap still walks, on release).
    const took = touch.down(e.pointerId, sx, sy, e.pointerType === 'touch' || e.pointerType === 'pen');
    if (took === 'use') {
      interactPressed = true;
      e.preventDefault();
      return;
    }
    if (took === 'stick') {
      view.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    // Click the world: the Blobbi walks there.
    if (live && lastView) {
      const wx = lastView.originX + sx / lastView.scale;
      const wy = lastView.originY + sy / lastView.scale;
      live.walkTo(wx, wy);
    }
    return;
  }
  if (state.mode !== 'world') return;
  drag = { x: e.clientX, y: e.clientY, panX: state.panX, panY: state.panY };
  view.setPointerCapture(e.pointerId);
  view.classList.add('dragging');
});
/** Client position → canvas pixels. */
const canvasPoint = (e: PointerEvent) => {
  const rect = view.getBoundingClientRect();
  return { x: ((e.clientX - rect.left) * view.width) / Math.max(1, rect.width), y: ((e.clientY - rect.top) * view.height) / Math.max(1, rect.height) };
};
view.addEventListener('pointermove', (e) => {
  // Hover highlights and tooltips follow a mouse (a finger has no hover).
  gameUI.pointerAt = e.pointerType === 'mouse' ? canvasPoint(e) : null;
  if (touch.stick) {
    const p = canvasPoint(e);
    touch.move(e.pointerId, p.x, p.y);
    return;
  }
  if (!drag) return;
  state.panX = drag.panX + (e.clientX - drag.x);
  state.panY = drag.panY + (e.clientY - drag.y);
  draw();
});
const endDrag = (e: PointerEvent) => {
  const s = touch.stick;
  if (s && s.id === e.pointerId) {
    // A tap that never became a stick walks to the tapped spot, as before.
    if (touch.up(e.pointerId) && live && lastView) live.walkTo(lastView.originX + s.ox / lastView.scale, lastView.originY + s.oy / lastView.scale);
    return;
  }
  drag = null;
  view.classList.remove('dragging');
};
view.addEventListener('pointerup', endDrag);
view.addEventListener('pointerleave', () => (gameUI.pointerAt = null));
view.addEventListener('pointercancel', endDrag);
view.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (state.mode === 'play') {
      // The wheel steps through the camera modes: up moves closer, down pulls back.
      const at = CAMERA_CYCLE.indexOf(viewCamera.mode) + (e.deltaY < 0 ? 1 : -1);
      if (at >= 0 && at < CAMERA_CYCLE.length) setCameraMode(CAMERA_CYCLE[at]);
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
  app.classList.toggle('mode-play', mode === 'play');
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
    if (!live) {
      // Behind the title: the most recent island (unless a link named one), so CONTINUE picks up right there.
      const recent = linkedWorld ? null : recentWorld();
      if (recent) openWorldParams(recent);
      if (!live) startLive();
      // A fresh entry into play starts at the title screen: WELCOME the first time, the main menu after.
      title.active = true;
      title.reset();
      // M11D.8: a returning connected player may go straight in (once per page load; the title stays one menu away).
      void autoEnter();
    }
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
showBlobbiStatus(startupBlobbi.message, startupBlobbi.error);
resize();
world = makeWorld(state.seed);
rerender();
fitZoom();
setMode(state.mode);
// Development only: `#mode=play&intro=whale` (and `&reduced=1`) plays the intro preview straight away.
if (import.meta.env.DEV && isIntroSpecies(params.get('intro'))) {
  if (state.mode !== 'play') setMode('play');
  startIntroPreview(params.get('intro') as CarrierKind, params.get('reduced') === '1' || gameUI.settings.reducedMotion);
}
rafId = requestAnimationFrame(playFrame);
requestAnimationFrame(previewFrame);
requestAnimationFrame(growthFrame);
requestAnimationFrame(fidelityFrame);
void rafId;
void hex;
