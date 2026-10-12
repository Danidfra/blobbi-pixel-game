/**
 * THE LIVE WORLD: a generated world plus everything that changes. The
 * terrain and object placements stay what the generator made; on top of
 * them live a controllable Blobbi, wind, falling leaves, sparkles, smoke,
 * planted trees that grow, and the small reactions of touching things.
 * All of it advances in fixed clock steps and draws its randomness from
 * keyed streams, so a replay of the same inputs is the same world.
 *
 * M4 adds the living island on the same model: farm plots and crops that grow
 * in world time, the Blobbi's needs (fed, rested, happy) stepped with the
 * clock, decorations as buildings, and objectives derived from a tally of the
 * player's own actions. Autonomy may rest, wander and look; only the player's
 * input collects, crafts, builds, tills, plants, waters, harvests and feeds.
 */
import { SimClock } from './clock';
import { SOLID_KINDS, CollisionMap } from './collision';
import { ParticleSystem } from './particles';
import { stream, type Rng } from '../core/rng';
import type { Sprite } from '../core/pixel';
import { hex } from '../core/color';
import { OBJECT_GENERATORS } from '../objects';
import type { TreeResult } from '../objects/tree';
import type { HouseResult } from '../objects/structures';
import { paletteFor } from '../world/generate';
import { T, WALKABLE, type Placement, type WorldDescription } from '../world/types';
import { blobbiIdentity, type PixelBlobbiIdentity } from '../blobbi/identity';
import { sourceFromSeed, type BlobbiSource } from '../blobbi/source';
import { BlobbiAnimator, type Direction } from '../blobbi/animation';
import { buildBlobbiSprite, poseKey, type BlobbiPose } from '../blobbi/sprite';
import { Brain, NavGrid } from './brain';
import { BASIC_KINDS, generateResources, isShore, REACH, RESOURCE_ITEM, RESOURCE_LABEL, type ResourceNode } from '../game/resources';
import { Inventory } from '../game/inventory';
import { loadSave, storeSave, clearSave, worldIdentity, newGrowthSave, newTutorialSave, INTRO_SEEN, SAVE_VERSION, WORLD_OWNER, type GrowthSave, type IntroSave, type IntroState, type KeyValueStore, type TreeSaveState, type TutorialSave } from '../game/persistence';
import { ITEMS, isTool, itemLabel, toolSupports, stackLimit as registryStack } from '../game/items';
import { canCraft, craft, type Recipe } from '../game/crafting';
import { HITS_TO_FELL, stumpSprite, treeCondition, woodYield, type TreeCondition, type TreeState } from '../game/trees';
import { EquipmentRig, type EquipmentAnimation } from '../game/equipment';
import { HITS_TO_MINE, isLargeRock, rockCondition, rubbleSprite, stoneYield, type RockCondition, type RockState } from '../game/rocks';
import { RESPAWN_SECONDS } from '../game/resources';
import type { RockSaveState } from '../game/persistence';
import { houseLevelInfo, MAX_HOUSE_LEVEL, type HouseLevel } from '../content/houses';
import { currentTip, TIP_PAUSE, updateTutorial, type TutorialContext, type TutorialStep } from '../game/tutorial';
import { optionUnlocked, type UnlockContext } from '../content/home-styles';
import type { HouseLook } from '../game/house-art';
import { doorSpot, doorwayRect, footOf, footprintRect, houseLevel, BUILDINGS, BUILDING_KINDS, CRATE_BONUS, MAX_CRATES, buildingProgress, buildingSprite, checkPlacement, checkPlot, isBuildingKind, isDecoration, kindForItem, PROBLEM_TEXT, type Building, type BuildingKind, type PlacementCheck, type PlacementContext } from '../game/buildings';
import { consumeIngredients, RECIPES } from '../game/crafting';
import { CROPS, CROP_KINDS, STAGE_NAMES, afterHarvest, harvestFor, cellAt, cellCentre, cellKey, cellRect, cropColour, cropProgress, cropStage, growthRemaining, isMature, needsWater, plantCrop, waterCrop, SOIL_COLOURS, type Cell, type CropKind, type FarmPlot, PLOT_GRID } from '../game/farming';
import { JOY, addHappiness, eat, isHungry, isRested, isTired, mood, newCare, pet as petCare, speedFactor, stepCare, careToSave, type CareState } from '../game/care';
import { advanceObjectives, finishRequest, newObjectives, newTally, startRequest, unlockedKinds, type Objective, type ObjectiveContext, type ObjectiveState, type Tally, objectiveById, activeQuests } from '../game/objectives';
import { nextDawn, clockLabel, lightAt, rainAt, type LightSource } from '../game/daylight';
import { loreById } from '../content/lore';
import { ALL_DISCOVERIES } from '../content/discoveries';
import { GENERATOR_VERSION } from '../game/archipelago';
import { placeDiscoveries, type DiscoverySpot } from '../game/discoveries';
import { FRIEND, FRIEND_TITLES, friendLevel, tastesFor, type Tastes } from '../game/friendship';
import { ALL_ITEMS } from '../game/items';
import { FOODS, foodEffect, foodValue, itemPlural, toolTier } from '../game/items';
import { COPPER_ORE, FISH_CONTENT } from '../content/tools';
import { atDoor, checkInterior, isWallKind, layoutFor, newInterior, relocateFurniture, roomCollision, roomRect, type InteriorState, type RoomLayout } from '../game/interior';
import { newContainer, transfer, type Container } from '../game/containers';
import type { PointOfInterest } from './brain';
import { TeleportController, type PresenceState } from '../game/teleport';
import { findPlaces, type Place } from '../game/places';
import { OWNER, READ_ONLY, type VisitorPermissions } from '../game/visiting';
import { canGrow, growWorld, GROWTH_VERSION, MAX_GROWTH_STAGE } from '../world/growth';
import { growthReadiness, type GrowthReadiness } from '../game/growth-progress';
import { growthResources, placeGrowthDiscoveries, regionPlaces } from '../game/growth-content';
import { BOND, HUM_LINES, carrierFavourites, carrierToSave, growthStage, harmony, newCarrier, nextObservation, type CarrierState } from '../game/carrier';
import { dayAt, hourAt } from '../game/daylight';

export interface LiveInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Edge-triggered: true on the step the key went down. */
  interact: boolean;
  plant: boolean;
}

export const IDLE_INPUT: LiveInput = { up: false, down: false, left: false, right: false, interact: false, plant: false };

export interface BlobbiEntity {
  /** The genome seed: what the kit generates this Blobbi from (`source.seed`). */
  seed: string;
  /** Where the seed came from: a V3 address, a V3 seed or a demo seed. Identity only; it owns nothing. */
  source: BlobbiSource;
  identity: PixelBlobbiIdentity;
  animator: BlobbiAnimator;
  x: number;
  y: number;
  size: number;
  footRx: number;
  footRy: number;
  /** Pixels per second. */
  speed: number;
}

export interface PlantedTree {
  placement: Placement;
  plantedAt: number;
  /** Whether its footprint has been added to the collision map yet. */
  solid: boolean;
}

export interface Bubble {
  text: string;
  until: number;
  x: number;
  y: number;
  /** Set when the Blobbi speaks: its world height then, so a view drawing it at another size can rest the tail on its head. */
  head?: number;
}

export interface LiveStats {
  steps: number;
  interactions: number;
  particles: number;
  planted: number;
  /** Resources collected by the player in this session. */
  collected: number;
  /** Axe hits, trees felled and items crafted by the player in this session. */
  chops: number;
  felled: number;
  crafted: number;
  /** Buildings placed by the player in this session. */
  built: number;
  /** Pickaxe hits and rocks broken by the player in this session. */
  mines: number;
  mined: number;
}

/** A resource being picked up: its sprite floats up from the node for a moment. */
export interface Pickup {
  node: ResourceNode;
  start: number;
}

export const PICKUP_SECONDS = 0.55;

/** The axe swing: raise, strike (the hit lands), recover. Seconds from the press. */
export const SWING = { raise: 0.1, hit: 0.18, end: 0.32 } as const;

export interface Swing {
  /** What the swing does when it lands: chop a tree (axe), mine a rock (pickaxe) or till the soil (hoe). */
  action: 'chop' | 'mine' | 'till';
  start: number;
  /** The tree's or rock's placement index (-1 when tilling). */
  index: number;
  /** The cell being tilled. */
  cell?: Cell;
  /** Whether the hit has landed. */
  landed: boolean;
}

/** A harvested crop rising from its plot for a moment. */
export interface HarvestPop {
  kind: CropKind;
  x: number;
  y: number;
  start: number;
}

/** A completed objective, announced at the top of the screen for a few seconds. */
export interface Notice {
  /** The first line's heading ("Quest complete", "New request"...). */
  heading: string;
  title: string;
  text: string;
  until: number;
}

/**
 * What E does on the farm right now, from the cell in front of the Blobbi. The prompt and the action read the same
 * answer, so the prompt never promises what the key would not do.
 */
export type FarmAction =
  | { kind: 'harvest'; plot: FarmPlot }
  | { kind: 'water'; plot: FarmPlot }
  | { kind: 'growing'; plot: FarmPlot }
  | { kind: 'plant'; plot: FarmPlot; crop: CropKind }
  | { kind: 'no-seeds'; plot: FarmPlot }
  | { kind: 'till'; cell: Cell }
  | { kind: 'cannot-till'; cell: Cell; check: PlacementCheck };

export const HARVEST_POP_SECONDS = 0.8;
/** A herb planter grows one herb per this many seconds of world time, holding up to HERB_MAX. */
export const HERB_SECONDS = 240;
export const HERB_MAX = 3;
/** Seconds a fish's bite lasts: E within them reels it in. */
export const BITE_SECONDS = 1.2;

/** Prompt names for ground resources. */
const RESOURCE_SINGULAR: Record<string, string> = { fibre: 'wild fibre', berry: 'wild berries', herb: 'wild herb', shell: 'shell' };

/** The prompt for E on something placed, by its use. */
const USE_VERB: Record<string, (label: string, r: Building) => string> = {
  storage: (l, r) => (r.kind === 'crate' ? `look at the ${l}` : `open the ${l}`),
  cook: () => 'cook',
  craft: () => 'craft at the workbench',
  sit: (l) => `sit on the ${l}`,
  sleep: (l, r) => (r.kind === 'shelter' ? 'go inside' : `sleep in the ${l}`),
  nap: () => 'nap on the cushion',
  read: (_l, r) => (r.kind === 'signpost' ? 'read the sign' : 'pick a book'),
  light: (l) => `look at the ${l}`,
  admire: (l) => `look at the ${l}`,
  play: () => 'play with the ball',
  music: (_l, r) => (r.kind === 'wind-chime' ? 'ring the chimes' : 'open the music box'),
  sprinkle: (l) => `look at the ${l}`,
  birds: (l) => `look at the ${l}`,
  time: () => 'check the time',
  herbs: () => 'pick herbs',
};

/** What the Blobbi says when looking at something the player made. */
const ADMIRE: Record<string, string> = {
  'flower-bed': 'pretty flowers',
  table: 'tidy',
  'dining-table': 'room for everyone',
  'potted-plant': 'a happy plant',
  vase: 'they smell lovely',
  painting: 'a turtle carrying an island...',
  rug: 'so soft',
  'wall-shelf': 'little jars',
  scarecrow: 'hello, scarecrow!',
  cairn: 'who stacked these?',
  'flower-arch': 'so pretty',
  'blobbi-statue': 'it looks like me!',
  'picket-fence': 'neat',
  'stone-wall': 'sturdy',
  crate: 'more room',
};
const BOOK_LINES = [
  'a book about knots',
  'a book of sea songs',
  'a picture book of shells',
  'notes on turtle naps',
  'a cookbook with soup stains',
  'a map with no land on it',
  'a story about a sleepy island',
];
const SIGN_LINES = ['welcome home', 'this way to the garden', 'mind the turtle', 'cozy corner', 'slow down, enjoy the view'];

/**
 * The companion state: how the Blobbi living on this island is doing and how close it is to the player. Saved in
 * the world record as the island's companion, deliberately NOT keyed by Blobbi identity (the M3.4 rule: no save
 * names a Blobbi). A Blobbi's tastes are derived from its seed at runtime and never stored.
 */
export interface CompanionState {
  care: CareState;
  /** Friendship points (only grow). */
  friendship: number;
  /** Foods it has tried. */
  tasted: Set<string>;
}

/** Foods a Blobbi may love (raw produce, forage and meals). */
const FAVOURITE_FOODS = ALL_ITEMS.filter((d) => d.food).map((d) => d.id);
/** Things a Blobbi may love to visit. */
const FAVOURITE_THINGS = ['flower-bed', 'bench', 'lantern', 'bird-bath', 'wind-chime', 'flower-arch', 'toy-ball', 'music-box', 'rug', 'armchair'];

/** The room scene while the Blobbi is inside a house: its own collision, navigation, autonomy and particles. */
export interface InteriorScene {
  state: InteriorState;
  collision: CollisionMap;
  nav: NavGrid;
  brain: Brain;
  particles: ParticleSystem;
}

/** How long newly grown land stays lit after its reveal (simulated seconds). */
export const REVEAL_GLOW_SECONDS = 3.5;

/** What the next house level needs (see `LiveWorld.houseUpgrade`). */
export interface HouseUpgradeCheck {
  house: Building | null;
  level: number;
  next: HouseLevel | null;
  requirements: { label: string; met: boolean; have?: number; need?: number }[];
  ready: boolean;
  /** Why it cannot happen even when every requirement is met (inside, does not fit...). */
  blocked: string | null;
  /** Pieces of furniture that would go back to the bag. */
  displaced: number;
}

/** The steps of a rest that ends in bed (M9). */
export interface RestPlan {
  phase: 'home' | 'bed' | 'climb-in' | 'in-bed' | 'climb-out';
  houseId: string | null;
  bedId: string | null;
  /** Where the bed stood when the plan chose it (a moved bed is chosen again). */
  bedAt?: { x: number; y: number };
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  t0?: number;
}

/** Seconds a climb into or out of bed takes (a little hop, never a jump cut). */
export const CLIMB_SECONDS = 0.45;

export interface LiveOptions {
  /** Where collected resources and the inventory persist; nothing persists without it. */
  store?: KeyValueStore | null;
  /**
   * Visiting someone else's world (M7): the save is read (a read-only store), the visitor carries an empty bag of its
   * own, and every lasting change is refused (see `permissions`). Nothing is ever written.
   */
  visitor?: boolean;
}

/** Wind strength 0..1 at a world x and time: slow gusts that travel across the map. */
export function windAt(time: number, x: number): number {
  const gust = Math.sin(time * 0.45 - x / 140) * Math.sin(time * 0.17 + 0.8);
  return Math.max(0, gust) ** 1.5;
}

const stackLimit = (item: string): number => registryStack(item);

export class LiveWorld {
  readonly clock = new SimClock();
  /** The island's particles; the room has its own (see `particles`). */
  private readonly islandParticles: ParticleSystem;
  readonly spriteCache = new Map<string, Sprite>();
  readonly blobbiCache = new Map<string, Sprite>();
  /** The island's collision, navigation and autonomy; the room has its own (see the scene getters below). */
  islandCollision!: CollisionMap;
  blobbi: BlobbiEntity;
  readonly planted: PlantedTree[] = [];
  /** Per-object sway phase, so trees do not move in step. */
  readonly swayPhase: Float32Array;
  /** The Blobbi's autonomy: a nav grid over the collision map and a small behaviour machine. */
  islandNav!: NavGrid;
  islandBrain!: Brain;
  /** The house interior the Blobbi is in, or null on the island. */
  interior: InteriorScene | null = null;
  /** Every shelter's interior, by shelter id (made on first entry, kept when the shelter moves). */
  readonly interiors = new Map<string, InteriorState>();
  /** Where this world hides its discoveries, and which were found. */
  discoveries: DiscoverySpot[] = [];
  readonly found = new Set<string>();
  /** The Blobbi's presence: teleporting away and back (never saved: a reload always starts present). */
  readonly teleport: TeleportController;
  /** The island's named places, and the ones the Blobbi has visited (saved). */
  places: Place[] = [];
  readonly visited = new Set<string>();
  /** The bond with the World Carrier (saved), and how long the Blobbi has stood still by its head. */
  carrier: CarrierState = newCarrier();
  private stillByCarrier = 0;
  /** Where to stand to listen to the Carrier (the shore in front of its head). */
  listenSpot: { x: number; y: number } | null = null;
  /** Ambient creatures' own stream (never disturbs the older ambient sequence). */
  private creatures!: Rng;
  private wasRaining = false;
  /** Flowers and flower beds, where butterflies gather. */
  private flowerSpots: { x: number; y: number }[] = [];
  /** A few beach spots facing the sea, for the Blobbi to watch the waves from. */
  private shoreSpots: { x: number; y: number }[] = [];
  /** Turtle animation state (turtle worlds only). */
  readonly turtleAnim = { blinkUntil: -1, nextBlink: 2.5, glance: 0 as -1 | 0 | 1, glanceUntil: 0, nextGlance: 6 };
  /** Shake impulses from interactions, by object index (planted trees use index + objects.length). */
  readonly impulses = new Map<number, { until: number; strength: number }>();
  bubble: Bubble | null = null;
  growDuration = 45;
  readonly stats: LiveStats = { steps: 0, interactions: 0, particles: 0, planted: 0, collected: 0, chops: 0, felled: 0, crafted: 0, built: 0, mines: 0, mined: 0 };
  /** Buildings the player placed, in canvas coordinates (saved in the island frame). */
  readonly buildings: Building[] = [];
  /** Build mode: a placement preview in front of the Blobbi; E places, B leaves. */
  buildMode: BuildingKind | null = null;
  /** Placing a furniture item from the bag (its item id), or null. */
  placing: string | null = null;
  /** Management mode: select what you built to move or remove it. */
  manage = false;
  /** Buildings whose completion has been announced. */
  private readonly completed = new Set<string>();
  private siteTimer = 0;
  /** The equipped tool's item id, or null. Only the player equips. */
  equipped: string | null = null;
  /** Harvest state per world tree (placement index); absent means an untouched, grown tree. */
  readonly trees = new Map<number, TreeState>();
  /** Simulated seconds this world had lived before this session (from the save record; dev tools may advance it). */
  timeOffset = 0;
  private lastAutosave = 0;
  /** Mining state per large world rock (placement index); absent means whole and untouched. */
  readonly rocks = new Map<number, RockState>();
  /** World time each collected node was taken; it grows back RESPAWN_SECONDS later. */
  readonly collectedAt = new Map<string, number>();
  private respawnTimer = 0;
  private readonly rubbleCache = new Map<string, Sprite>();
  private readonly stumpCache = new Map<string, Sprite>();
  /** The axe swing in progress, if any. */
  swing: Swing | null = null;
  /** Finds the Blobbi's hands for the equipment layer; rebuilt with the Blobbi. */
  rig: EquipmentRig;
  /** Resource nodes still on the ground (the generated set minus what the player collected). */
  resources: ResourceNode[] = [];
  /** Every node the world generates, collected or not. */
  allResources: ResourceNode[];
  readonly collected = new Set<string>();
  inventory: Inventory;
  readonly pickups: Pickup[] = [];
  /** Farm plots, in the order they were tilled (canvas = island-frame cell + carrier origin). */
  readonly plots: FarmPlot[] = [];
  private readonly plotByCell = new Map<string, FarmPlot>();
  /** Which crop E plants next (T cycles through the crops whose seeds are in the bag). */
  selectedCrop: CropKind = 'turnip';
  readonly harvestPops: HarvestPop[] = [];
  /** The Blobbi's needs on this island. */
  care: CareState = newCare();
  /** What the player has done here, and the objectives completed from it. */
  tally: Tally = newTally();
  objectives: ObjectiveState = newObjectives();
  readonly notices: Notice[] = [];
  private readonly ripe = new Set<string>();
  private farmTimer = 0;
  private sleepTimer = 0;
  private wasResting = false;
  private nextHungryNote = 0;
  private nextTiredNote = 0;
  private nextHappyNote = 0;
  private lastDecorationJoy = -Infinity;
  /** The identity the save record is keyed by. */
  readonly identity: string;
  private store: KeyValueStore | null;
  private readonly ambient: Rng;
  private readonly shallow: Int32Array;
  private readonly chimneys: { x: number; y: number }[] = [];
  private smokeTimer = 0;
  private lastInput: LiveInput = IDLE_INPUT;
  private movedLastStep = false;
  /** Pixels walked since the last footstep sound. */
  private stride = 0;
  /** Edge-triggered presses not yet consumed by a step. */
  private pendingInteract = false;
  private pendingPlant = false;

  /**
   * The world as generated (stage 0): the identity, the save key and every base-derived thing (resources,
   * discoveries, places, the listening spot) come from it, so growth never moves them.
   */
  readonly baseWorld: WorldDescription;
  /** The world as it is now: the base world, or the base world grown to the saved stage (M7, `world/growth.ts`). */
  readonly world: WorldDescription;
  /** Island growth: stage, version, history (saved). */
  growth: GrowthSave = newGrowthSave();
  /** What the player may do here: everything at home; read-only as a visitor (game/visiting.ts). */
  permissions: VisitorPermissions = OWNER;
  readonly visitor: boolean;
  /** The visited island's name (shown while visiting). */
  visitLabel = '';
  /** Set when a save's growth cannot be reproduced (an unknown generator version): the world is then read-only. */
  growthError: string | null = null;
  /** The island's own name (M8), or null: it is then called by its generated name. */
  islandName: string | null = null;
  /** The intro cinematic's state (M8). A world with no save counts it as seen; NEW ISLAND marks it pending. */
  intro: IntroSave = { ...INTRO_SEEN };
  /** The contextual tutorial's state (M8, `game/tutorial.ts`). */
  tutorial: TutorialSave = newTutorialSave();

  constructor(
    base: WorldDescription,
    blobbi: string | BlobbiSource,
    blobbiSize = 16,
    options: LiveOptions = {},
  ) {
    this.store = options.store ?? null;
    this.visitor = !!options.visitor;
    if (this.visitor) this.permissions = READ_ONLY;
    this.baseWorld = base;
    this.identity = worldIdentity(base);
    // The save first: its growth stage decides which world we stand on (stage 0 when there is none).
    const save = this.store ? loadSave(this.store, this.identity) : null;
    let world = base;
    if (save && save.growth.stage > 0) {
      try {
        world = growWorld(base, save.growth.stage, save.growth.version);
        this.growth = save.growth;
      } catch (e) {
        // Never regrow differently or overwrite: keep the save untouched and play nothing that could save.
        this.growthError = (e as Error).message;
        this.store = null;
      }
    } else if (save) this.growth = save.growth;
    this.world = world;
    this.islandParticles = new ParticleSystem(world.seed);
    this.ambient = stream(world.seed, 'ambient');
    const phases = stream(world.seed, 'sway');
    this.swayPhase = new Float32Array(world.objects.length);
    for (let i = 0; i < world.objects.length; i++) this.swayPhase[i] = phases.range(0, Math.PI * 2);
    // Shallow-water pixels, for sparkles.
    const list: number[] = [];
    const { cls } = world.terrain;
    for (let i = 0; i < cls.length; i += 3) if (cls[i] === T.SHALLOW) list.push(i);
    this.shallow = Int32Array.from(list);
    for (const o of world.objects) {
      if (o.kind !== 'house') continue;
      const s = this.spriteOf(o) as HouseResult;
      if (s.chimney) this.chimneys.push({ x: o.x - s.anchorX + s.chimney.x, y: o.y - s.anchorY + s.chimney.y });
    }
    this.collision = CollisionMap.fromWorld(world, (p) => this.spriteOf(p));
    // Stage-0 collision and navigation, for everything derived from the base world (identical to an ungrown world's).
    const baseCollision = world === base ? this.collision : CollisionMap.fromWorld(base, (p) => this.spriteOf(p));
    this.blobbi = this.makeBlobbi(blobbi, blobbiSize);
    this.rig = new EquipmentRig(this.blobbi.identity, this.blobbi.size);
    this.teleport = new TeleportController(world.seed, blobbiSize, Math.max(4, Math.round(blobbiSize * 0.42)));
    this.placeBlobbiAtStart();
    this.rebuildBrain();
    // Resources on the ground, minus what a saved game says the player already collected.
    const baseNodes = generateResources(base, (x, y, rx, ry) => baseCollision.canStand(x, y, rx, ry));
    // Grown land's own resources, with their own ids (`g:<region>:<kind>:<n>`), after every base node.
    this.allResources = world.growth ? [...baseNodes, ...growthResources(world, (x, y, rx, ry) => this.collision.canStand(x, y, rx, ry))] : baseNodes;
    this.inventory = new Inventory(this.identity, this.stackFor);
    this.useCompanion(this.blobbi.seed);
    this.placeWorldSecrets(world === base ? this.islandNav : new NavGrid(baseCollision, this.blobbi.footRx, this.blobbi.footRy), baseCollision, baseNodes);
    this.creatures = stream(world.seed, 'creatures');
    this.flowerSpots = world.objects.filter((o) => o.kind === 'flower').map((o) => ({ x: o.x, y: o.y }));
    this.shoreSpots = this.findShoreSpots();
    if (save) {
      for (const id of save.collected) {
        this.collected.add(id);
        this.collectedAt.set(id, save.collectedAt[id] ?? save.worldTime);
      }
      for (const [k, v] of Object.entries(save.rocks)) {
        const index = Number(k);
        const o = world.objects[index];
        if (o && o.kind === 'rock' && isLargeRock(o.size)) this.rocks.set(index, { hits: v.hits, minedAt: v.minedAt });
      }
      this.timeOffset = save.worldTime;
      // Buildings before the inventory: finished storage crates add stack room the saved inventory may be using.
      const origin = this.origin;
      for (const b of save.buildings) {
        if (!isBuildingKind(b.kind)) continue;
        const building: Building = { id: b.id, kind: b.kind, x: b.x + origin.x, y: b.y + origin.y, placedAt: b.placedAt, seed: b.seed, ...(b.variant ? { variant: b.variant } : {}), ...(b.level ? { level: b.level } : {}), ...(b.look ? { look: { ...b.look } } : {}), ...(b.upgradedAt !== undefined ? { upgradedAt: b.upgradedAt } : {}) };
        this.buildings.push(building);
        this.blockBuilding(building);
        if (buildingProgress(building, this.worldTime) >= 1) this.completed.add(building.id);
      }
      if (this.buildings.length) this.nav.rebuild();
      this.inventory = Inventory.fromSnapshot(save.inventory, this.stackFor);
      for (const [k, v] of Object.entries(save.trees)) {
        const index = Number(k);
        if (index >= 0 && index < world.objects.length && world.objects[index].kind === 'tree') this.trees.set(index, { hits: v.hits, harvestedAt: v.harvestedAt });
      }
      if (save.equipped && isTool(save.equipped) && this.inventory.count(save.equipped) > 0) this.equipped = save.equipped;
      for (const p of save.plots) {
        const plot: FarmPlot = { id: p.id, gx: p.gx, gy: p.gy, preparedAt: p.preparedAt, harvests: p.harvests, crop: p.crop ? { ...p.crop } : null };
        this.plots.push(plot);
        this.plotByCell.set(cellKey(plot), plot);
        if (plot.crop && isMature(plot.crop, this.worldTime)) this.ripe.add(plot.id);
      }
      this.care = save.care;
      this.companion = { care: this.care, friendship: save.companion.friendship, tasted: new Set(save.companion.tasted) };
      this.useCompanion(this.blobbi.seed);
      for (const id of save.found) if (this.discoveries.some((d) => d.id === id)) this.found.add(id);
      this.tally = save.tally;
      this.objectives = save.objectives;
      for (const [id, v] of Object.entries(save.interiors)) {
        if (!this.buildings.some((x) => x.id === id && x.kind === 'shelter')) continue; // an interior needs its shelter
        this.interiors.set(id, { shelterId: id, furniture: v.furniture.filter((f) => isBuildingKind(f.kind)).map((f) => ({ ...f })), style: { ...v.style }, level: v.level });
      }
      for (const [key, v] of Object.entries(save.containers)) {
        const c = newContainer(key, v.capacity);
        for (const e of v.items) c.inventory.add(e.item, e.quantity);
        this.containers.set(key, c);
      }
      for (const [key, t] of Object.entries(save.producers)) this.producers.set(key, t);
      this.carrier = save.carrier;
      for (const id of save.places) if (this.places.some((p) => p.id === id)) this.visited.add(id);
      this.islandName = save.name;
      this.intro = save.intro;
      this.tutorial = save.tutorial;
    }
    this.resources = this.allResources.filter((n) => !this.collected.has(n.id));
    if (this.visitor) {
      // A visitor brings nothing of the host's away and takes nothing: an empty bag, no tool, and no store to write.
      this.inventory = new Inventory(this.identity, this.stackFor);
      this.equipped = null;
      this.store = null;
    }
  }

  // ─── Scenes: the island, or a house interior ───────────────────────────

  /** The current scene's collision (the island's, or the room's). */
  get collision(): CollisionMap {
    return this.interior?.collision ?? this.islandCollision;
  }
  set collision(c: CollisionMap) {
    this.islandCollision = c;
  }
  get nav(): NavGrid {
    return this.interior?.nav ?? this.islandNav;
  }
  set nav(n: NavGrid) {
    this.islandNav = n;
  }
  /** The current scene's autonomy. */
  get brain(): Brain {
    return this.interior?.brain ?? this.islandBrain;
  }
  set brain(b: Brain) {
    this.islandBrain = b;
  }
  get particles(): ParticleSystem {
    return this.interior?.particles ?? this.islandParticles;
  }
  get inside(): boolean {
    return this.interior !== null;
  }
  /** What the camera frames: the room when inside. */
  sceneBounds(): { width: number; height: number } | null {
    return this.interior ? { width: this.roomLayout.w, height: this.roomLayout.h } : null;
  }

  /** Discovery spots and the place to listen to the Carrier: from the world alone, the same every time. */
  /** Which ground can be reached on foot from the hub, on a navigation grid (a flood fill over its free cells). */
  private reachability(nav: NavGrid, hub: { x: number; y: number }): (x: number, y: number) => boolean {
    const start = nav.nearestFree(hub.x, hub.y, 6);
    const seen = new Uint8Array(nav.cols * nav.rows);
    if (start) {
      const queue = [start.r * nav.cols + start.c];
      seen[queue[0]] = 1;
      while (queue.length) {
        const k = queue.pop()!;
        const c = k % nav.cols;
        const r = (k / nav.cols) | 0;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc;
          const nr = r + dr;
          const nk = nr * nav.cols + nc;
          if (!nav.isFree(nc, nr) || seen[nk]) continue;
          seen[nk] = 1;
          queue.push(nk);
        }
      }
    }
    return (x, y) => {
      const cell = nav.nearestFree(x, y, 1);
      return !!cell && seen[cell.r * nav.cols + cell.c] === 1;
    };
  }

  private placeWorldSecrets(nav: NavGrid, baseCollision: CollisionMap, baseNodes: readonly ResourceNode[]): void {
    const base = this.baseWorld;
    const hub = base.hubs[0] ?? { x: base.islands[0].cx, y: base.islands[0].cy };
    const reachable = this.reachability(nav, hub);
    this.discoveries = placeDiscoveries(base, (x, y) => baseCollision.canStand(x, y, 3, 2), reachable, baseNodes);
    // The listening spot: walk from the turtle's head toward the island until there is reachable ground.
    const head = base.turtle?.head ?? base.creature?.head;
    const island = base.islands[0];
    if (head) {
      for (let k = 0; k <= 1; k += 0.02) {
        const x = Math.round(head.cx + (island.cx - head.cx) * k);
        const y = Math.round(head.cy + (island.cy - head.cy) * k);
        if (baseCollision.canStand(x, y, this.blobbi.footRx, this.blobbi.footRy) && reachable(x, y)) {
          this.listenSpot = { x, y };
          break;
        }
      }
    }
    // The island's named places, each on reachable ground.
    this.places = findPlaces(
      base,
      (x, y) => {
        const p = baseCollision.nearestFree(x, y, this.blobbi.footRx, this.blobbi.footRy, 45);
        return p && reachable(p.x, p.y) ? p : null;
      },
      this.listenSpot,
    );
    // Grown land (M7): each region is a place, and holds its biome's discovery, on the grown world's ground.
    const g = this.world.growth;
    if (g) {
      const grownReach = this.reachability(this.islandNav, hub);
      // Grown-land resources only where a Blobbi can walk to them.
      this.allResources = this.allResources.filter((n, i) => i < baseNodes.length || grownReach(n.x, n.y));
      const canStand = (x: number, y: number) => this.islandCollision.canStand(x, y, this.blobbi.footRx, this.blobbi.footRy) && grownReach(x, y);
      this.places.push(...regionPlaces(this.world, canStand));
      this.discoveries.push(...placeGrowthDiscoveries(this.world, (x, y) => this.islandCollision.canStand(x, y, 3, 2) && grownReach(x, y), [...this.allResources, ...this.discoveries]));
    }
  }

  /** Up to six standable sand spots next to shallow water, spread around the island (deterministic). */
  private findShoreSpots(): { x: number; y: number }[] {
    const { width, height } = this.world.terrain;
    const island = this.world.islands[0];
    const out: { x: number; y: number }[] = [];
    for (let k = 0; k < 24 && out.length < 6; k++) {
      const a = (k / 24) * Math.PI * 2 + 0.13;
      for (let r = island.radius * 1.15; r > island.radius * 0.6; r -= 1) {
        const x = Math.round(island.cx + Math.cos(a) * r);
        const y = Math.round(island.cy + Math.sin(a) * r * (island.aspect ?? 1));
        if (x < 3 || y < 3 || x >= width - 3 || y >= height - 3) continue;
        if (!isShore(this.world, x, y)) continue;
        // The nearest place the Blobbi can actually stand, if it is still by the water.
        const spot = this.islandCollision.nearestFree(x, y, this.blobbi.footRx, this.blobbi.footRy);
        if (spot && Math.hypot(spot.x - x, spot.y - y) < 12 && out.every((o) => Math.hypot(o.x - spot.x, o.y - spot.y) > 40)) out.push({ x: Math.round(spot.x), y: Math.round(spot.y) });
        break;
      }
    }
    return out;
  }

  /** The carrier's origin: canvas = island frame + origin. */
  get origin(): { x: number; y: number } {
    return this.world.carrier?.origin ?? { x: 0, y: 0 };
  }

  /** Stack limits: the item registry's, plus room from finished storage crates (tools stay one). */
  readonly stackFor = (item: string): number => {
    const base = stackLimit(item);
    if (isTool(item)) return base;
    let crates = 0;
    for (const b of this.buildings) if (b.kind === 'crate' && buildingProgress(b, this.worldTime) >= 1) crates++;
    return base + Math.min(MAX_CRATES, crates) * CRATE_BONUS;
  };

  /** The resource node within reach of the Blobbi, nearest first, or null. Reach is from the ground point. */
  nearestResource(reach = REACH): ResourceNode | null {
    if (this.inside) return null;
    const b = this.blobbi;
    let best: ResourceNode | null = null;
    let bestD = Infinity;
    for (const n of this.resources) {
      const d = Math.hypot(n.x - b.x, (n.y - b.y) * 1.25);
      if (d <= reach && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * Collect the nearest resource in reach. Only the player's own interaction calls this; the brain never does.
   * Returns the node collected, or null (nothing in reach, or the stack is full).
   */
  collect(): ResourceNode | null {
    if (this.denied('gather')) return null;
    const node = this.nearestResource();
    if (!node) return null;
    const time = this.clock.time;
    const b = this.blobbi;
    const item = RESOURCE_ITEM[node.kind];
    if (this.inventory.add(item, 1) === 0) {
      this.bubble = { text: `${RESOURCE_LABEL[node.kind]} full`, until: time + 1.6, x: b.x, y: b.y - b.size - 2, head: b.size };
      b.animator.react('sad', time, 0.8, 0);
      return null;
    }
    this.collected.add(node.id);
    this.collectedAt.set(node.id, this.worldTime);
    this.resources = this.resources.filter((n) => n !== node);
    this.pickups.push({ node, start: time });
    this.particles.sparkle(node.x, node.y - 2, hex('#ffffff'));
    this.particles.sparkle(node.x + 2, node.y - 1, hex('#fff2b0'));
    this.bubble = { text: `+1 ${node.kind}  ${this.inventory.count(item)}/${this.inventory.limit(item)}`, until: time + 1.4, x: b.x, y: b.y - b.size - 2, head: b.size };
    b.animator.react('happy', time, 0.7, 2);
    this.stats.collected++;
    this.tally.collected++;
    if (!(BASIC_KINDS as readonly string[]).includes(node.kind)) this.tally.foraged++;
    if (node.kind === 'shell') this.tally.shells++;
    this.sound('pickup');
    this.save();
    return node;
  }

  /** Simulated seconds this world has lived, across sessions. Tree regrowth is measured in it. */
  get worldTime(): number {
    return this.timeOffset + this.clock.time;
  }

  /** A world tree's condition now (grown, being chopped, a stump, regrowing). */
  treeAt(index: number): TreeCondition {
    return treeCondition(this.trees.get(index), this.worldTime);
  }

  /** The sprite a world object shows now: trees may be stumps or regrowing; everything else is as generated. */
  objectSprite(index: number): Sprite {
    const p = this.world.objects[index];
    if (p.kind === 'rock' && this.rocks.has(index) && this.rockAt(index).phase === 'rubble') {
      const key = `${this.world.options.palette}|${p.seed}|${p.size}`;
      const hit = this.rubbleCache.get(key);
      if (hit) return hit;
      const whole = this.spriteOf(p);
      const s = rubbleSprite(p.seed, whole.footRx, whole.footRy, paletteFor(this.world.options.palette));
      this.rubbleCache.set(key, s);
      return s;
    }
    if (p.kind !== 'tree' || !this.trees.has(index)) return this.spriteOf(p);
    const c = this.treeAt(index);
    if (c.phase === 'stump') {
      const key = `${this.world.options.palette}|${p.seed}|${p.size}`;
      const hit = this.stumpCache.get(key);
      if (hit) return hit;
      const s = stumpSprite(this.spriteOf(p) as TreeResult, paletteFor(this.world.options.palette));
      this.stumpCache.set(key, s);
      return s;
    }
    if (c.phase === 'regrowing') return this.spriteOf(p, c.growth);
    return this.spriteOf(p);
  }

  /** A world rock's condition now (whole, being mined, rubble). */
  rockAt(index: number): RockCondition {
    return rockCondition(this.rocks.get(index), this.worldTime);
  }

  /**
   * Bring collected nodes back once their respawn time has passed, when their spot is still free (not under a
   * building, not under the Blobbi's feet). Checked once a second; deterministic in world time.
   */
  private stepRespawn(dt: number): void {
    this.respawnTimer -= dt;
    if (this.respawnTimer > 0 || this.collectedAt.size === 0) return;
    this.respawnTimer = 1;
    const now = this.worldTime;
    const b = this.blobbi;
    let changed = false;
    for (const node of this.allResources) {
      const at = this.collectedAt.get(node.id);
      if (at === undefined || now - at < RESPAWN_SECONDS[node.kind]) continue;
      if (this.islandCollision.isBlocked(node.x + 0.5, node.y + 0.5)) continue;
      if (this.plotByCell.has(cellKey(cellAt(node.x, node.y, this.origin)))) continue; // never on a field
      if (this.buildings.some((r) => Math.abs(r.x - node.x) <= footOf(r).footRx + 1 && Math.abs(r.y - node.y) <= footOf(r).footRy + 1)) continue; // nor under a path or a rug
      if (Math.abs(node.x - b.x) <= b.footRx + 2 && Math.abs(node.y - b.y) <= b.footRy + 2) continue;
      this.collectedAt.delete(node.id);
      this.collected.delete(node.id);
      changed = true;
    }
    if (!changed) return;
    // Keep generation order, so the nearest-node tie-break never depends on respawn order.
    this.resources = this.allResources.filter((n) => !this.collected.has(n.id));
    this.save();
  }

  // ─── Tools and crafting: the player's actions only ───────────────────────

  /** Equip a tool from the inventory. False when it is not there or not a tool. */
  equip(item: string): boolean {
    if (this.denied('inventory')) return false;
    if (!isTool(item) || this.inventory.count(item) === 0) return false;
    this.equipped = item;
    this.brain.manual(this.clock.time);
    this.save();
    return true;
  }

  unequip(): void {
    if (this.equipped === null) return;
    this.equipped = null;
    this.brain.manual(this.clock.time);
    this.save();
  }

  /** Whether a recipe is known (no unlock, or its quest is done). */
  recipeKnown(recipe: Recipe): boolean {
    return !recipe.unlock || recipe.unlock in this.objectives.completed;
  }

  /** Is the station a recipe needs close by (a workbench or cooking station within reach in this scene)? */
  nearStation(station: Recipe['station'] = 'hand'): boolean {
    if (station === 'hand') return true;
    const use = station === 'workbench' ? 'craft' : 'cook';
    const b = this.blobbi;
    return this.placedHere.some((r) => BUILDINGS[r.kind].use === use && this.buildingAt(r) >= 1 && Math.hypot(r.x - b.x, r.y - b.y) < 28);
  }

  /** Craft a recipe once, atomically, with feedback. False leaves the inventory untouched. */
  craftRecipe(recipe: Recipe): boolean {
    if (this.denied('inventory')) return false;
    const time = this.clock.time;
    const b = this.blobbi;
    this.brain.manual(time);
    if (!this.recipeKnown(recipe)) return false;
    if (!this.nearStation(recipe.station)) {
      this.bubble = { text: recipe.station === 'cooking' ? 'needs a cooking station nearby' : 'needs a workbench nearby', until: time + 1.8, x: b.x, y: b.y - b.size - 2, head: b.size };
      b.animator.react('sad', time, 0.6, 0);
      this.sound('fail');
      return false;
    }
    const check = canCraft(this.inventory, recipe);
    if (!check.ok) {
      const why = check.outputFull ? `already have a ${itemLabel(recipe.output.item)}` : check.missing.map((m) => `need ${m.need - m.have} ${itemLabel(m.item)}`).join(', ');
      this.bubble = { text: why, until: time + 1.8, x: b.x, y: b.y - b.size - 2, head: b.size };
      b.animator.react('sad', time, 0.7, 0);
      this.sound('fail');
      return false;
    }
    if (!craft(this.inventory, recipe)) return false;
    this.stats.crafted++;
    this.tally.crafted++;
    if (recipe.output.item === ITEMS.axe.id) this.tally.axesCrafted++;
    for (let i = 0; i < 6; i++) this.particles.sparkle(b.x + this.particles.rng.range(-6, 6), b.y - b.size * 0.6 + this.particles.rng.range(-5, 5), i % 2 ? hex('#ffe07a') : hex('#ffffff'));
    this.particles.note(b.x + 4, b.y - b.size - 2);
    this.bubble = { text: recipe.output.quantity > 1 ? `crafted ${recipe.output.quantity} ${itemPlural(recipe.output.item)}!` : `crafted a ${itemLabel(recipe.output.item)}!`, until: time + 2, x: b.x, y: b.y - b.size - 2, head: b.size };
    this.sound(recipe.group === 'meals' ? 'cook' : 'craft');
    if (recipe.group === 'meals') {
      // Cooking: steam from the stove, and a Blobbi who can smell it.
      this.tally.cooked++;
      const stove = this.placedHere.filter((r) => BUILDINGS[r.kind].use === 'cook').sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0];
      if (stove) for (let i = 0; i < 4; i++) this.particles.smoke(stove.x + this.particles.rng.range(-3, 3), stove.y - 10 - i);
      this.bubble = { text: `${itemLabel(recipe.output.item)}! smells good`, until: time + 2, x: b.x, y: b.y - b.size - 2, head: b.size };
    }
    b.animator.react('excited', time, 1.1, 3);
    this.save();
    return true;
  }

  /**
   * Chop the tree in front with the equipped axe. One hit per press; the third fells it, leaves a stump and
   * awards wood. Returns true when the press was spent on a tree (so no other interaction runs).
   */
  chop(): boolean {
    if (this.denied('gather')) return false;
    if (!this.equipped || !toolSupports(this.equipped, 'chop')) return false;
    const target = this.facingObject();
    if (!target || target.placement.kind !== 'tree' || target.index >= this.world.objects.length) return false;
    const time = this.clock.time;
    const b = this.blobbi;
    const { index, placement: o, sprite } = target;
    const condition = this.treeAt(index);
    if (condition.phase === 'stump' || condition.phase === 'regrowing') {
      const m = Math.ceil(condition.remaining / 60);
      this.bubble = { text: condition.phase === 'stump' ? `a stump. regrows in ${m} min` : `regrowing, ${m} min to go`, until: time + 1.8, x: o.x, y: o.y - sprite.anchorY - 2 };
      b.animator.react('neutral', time, 0.5, 0);
      return true;
    }
    // A press during a swing is ignored: one swing at a time, no queue.
    if (this.swing) return true;
    this.swing = { action: 'chop', start: time, index, landed: false };
    b.animator.react('excited', time, SWING.end, 0);
    return true;
  }

  /**
   * Mine the large rock in front with the equipped pickaxe: one swing per press, four landed hits break it into
   * rubble and award stones. Returns true when the press was spent on a rock.
   */
  mine(): boolean {
    if (this.denied('gather')) return false;
    if (!this.equipped || !toolSupports(this.equipped, 'mine')) return false;
    const target = this.facingObject();
    if (!target || target.placement.kind !== 'rock' || target.index >= this.world.objects.length) return false;
    const time = this.clock.time;
    const b = this.blobbi;
    const { index, placement: o, sprite } = target;
    if (!isLargeRock(o.size)) {
      // No swing (nothing to mine), but a clear answer: the bubble, a puff of dust on the rock and a small shrug.
      this.bubble = { text: 'too small to mine', until: time + 1.8, x: b.x, y: b.y - b.size - 2, head: b.size };
      const palette = paletteFor(this.world.options.palette);
      for (let i = 0; i < 3; i++) this.particles.dust(o.x + this.particles.rng.range(-1, 1), o.y - sprite.anchorY + 1, palette.stone.light);
      b.animator.react('surprised', time, 0.6, 1);
      return true;
    }
    const condition = this.rockAt(index);
    if (condition.phase === 'rubble') {
      this.bubble = { text: `rubble. whole again in ${Math.ceil(condition.remaining / 60)} min`, until: time + 1.8, x: o.x, y: o.y - sprite.anchorY - 2 };
      b.animator.react('neutral', time, 0.5, 0);
      return true;
    }
    if (this.swing) return true;
    this.swing = { action: 'mine', start: time, index, landed: false };
    b.animator.react('excited', time, SWING.end, 0);
    return true;
  }

  /** The pickaxe lands on rock `index`: a hit, or the breaking on the last one. Called by the swing only. */
  private landMine(index: number): void {
    const time = this.clock.time;
    const b = this.blobbi;
    const o = this.world.objects[index];
    if (this.rockAt(index).phase === 'rubble') return;
    const sprite = this.objectSprite(index);
    const state = this.rocks.get(index) ?? { hits: 0, minedAt: null };
    // A rock that grew back after rubble starts a fresh count.
    if (state.minedAt !== null) {
      state.minedAt = null;
      state.hits = 0;
    }
    state.hits++;
    this.rocks.set(index, state);
    this.stats.mines++;
    this.sound('mine');
    const palette = paletteFor(this.world.options.palette);
    const impact = this.impactPoint(o, sprite);
    for (let i = 0; i < 5; i++) this.particles.dust(impact.x + this.particles.rng.range(-1, 1), impact.y - this.particles.rng.range(0, 2), i % 2 ? palette.stone.light : palette.stone.mid);
    this.particles.sparkle(impact.x, impact.y - 1, hex('#fff2b0'));
    const toMine = this.equipped && toolTier(this.equipped) >= 2 ? HITS_TO_MINE - 1 : HITS_TO_MINE;
    if (state.hits < toMine) {
      this.bubble = { text: `mine ${state.hits}/${toMine}`, until: time + 0.9, x: b.x, y: b.y - b.size - 2, head: b.size };
      this.save();
      return;
    }
    state.hits = 0;
    state.minedAt = this.worldTime;
    this.stats.mined++;
    this.tally.mined++;
    const stones = stoneYield(o.seed, o.size);
    const got = this.inventory.add(ITEMS.stone.id, stones);
    // Once the player knows where to look ("Deeper stone"), large rocks give copper ore too.
    if ('side-miner' in this.objectives.completed) {
      const ore = 1 + (stream(o.seed, 'ore', this.tally.mined).chance(0.4) ? 1 : 0);
      if (this.inventory.add(COPPER_ORE.id, ore)) this.particles.sparkle(o.x, o.y - 4, hex('#ffb070'));
    }
    for (let i = 0; i < 8; i++) this.particles.dust(o.x + this.particles.rng.range(-sprite.footRx, sprite.footRx), o.y - this.particles.rng.range(0, 6), i % 2 ? palette.stone.light : palette.stone.dark);
    this.bubble = { text: got === stones ? `+${got} stone  ${this.inventory.count(ITEMS.stone.id)}/${this.inventory.limit(ITEMS.stone.id)}` : got > 0 ? `+${got} stone, bag full` : 'stones full', until: time + 1.8, x: b.x, y: b.y - b.size - 2, head: b.size };
    b.animator.react('happy', time, 1, 3);
    this.save();
  }

  /** The axe lands on tree `index`: a hit, or the felling on the last one. Called by the swing, never directly. */
  private landChop(index: number): void {
    const time = this.clock.time;
    const b = this.blobbi;
    const o = this.world.objects[index];
    const sprite = this.objectSprite(index);
    const condition = this.treeAt(index);
    if (condition.phase === 'stump' || condition.phase === 'regrowing') return;
    const state = this.trees.get(index) ?? { hits: 0, harvestedAt: null };
    state.hits++;
    this.trees.set(index, state);
    this.stats.chops++;
    this.sound('chop');
    // The impact: the trunk shakes, chips fly from the point of contact, a few leaves fall.
    this.impulses.set(index, { until: time + 0.4, strength: 1.6 });
    const palette = paletteFor(this.world.options.palette);
    const impact = this.impactPoint(o, sprite);
    for (let i = 0; i < 5; i++) this.particles.dust(impact.x + this.particles.rng.range(-1, 1), impact.y - this.particles.rng.range(0, 2), i % 2 ? palette.wood.light : palette.wood.mid);
    const tree = sprite as TreeResult;
    const foliage = palette.foliage[tree.variation.foliage % 4];
    const top = o.y - sprite.anchorY;
    for (let i = 0; i < 3; i++) this.particles.leaf(o.x + this.particles.rng.range(-sprite.buffer.width * 0.3, sprite.buffer.width * 0.3), top + this.particles.rng.range(2, Math.max(3, (sprite.swayRow ?? sprite.anchorY) - 1)), i % 2 ? foliage.dark : foliage.mid);
    const toFell = this.equipped && toolTier(this.equipped) >= 2 ? HITS_TO_FELL - 1 : HITS_TO_FELL;
    if (state.hits < toFell) {
      this.bubble = { text: `chop ${state.hits}/${toFell}`, until: time + 0.9, x: b.x, y: b.y - b.size - 2, head: b.size };
      this.save();
      return;
    }
    // Felled: a stump from now, wood into the bag (what fits), the rest of the tree's canopy comes down as leaves.
    state.hits = 0;
    state.harvestedAt = this.worldTime;
    this.stats.felled++;
    this.tally.felled++;
    const wood = woodYield(o.seed, o.size);
    const got = this.inventory.add(ITEMS.wood.id, wood);
    for (let i = 0; i < 10; i++) this.particles.leaf(o.x + this.particles.rng.range(-sprite.buffer.width * 0.4, sprite.buffer.width * 0.4), top + this.particles.rng.range(1, Math.max(3, (sprite.swayRow ?? sprite.anchorY) - 1)), i % 2 ? foliage.dark : foliage.mid);
    for (let i = 0; i < 4; i++) this.particles.dust(o.x + this.particles.rng.range(-4, 4), o.y - 1, paletteFor(this.world.options.palette).wood.light);
    this.impulses.delete(index);
    this.bubble = { text: got === wood ? `+${got} wood  ${this.inventory.count(ITEMS.wood.id)}/${this.inventory.limit(ITEMS.wood.id)}` : got > 0 ? `+${got} wood, bag full` : 'wood full', until: time + 1.8, x: b.x, y: b.y - b.size - 2, head: b.size };
    b.animator.react('happy', time, 1, 3);
    this.save();
    return;
  }

  /** Where the axe meets the trunk: the trunk's near side at the Blobbi's hand height. */
  private impactPoint(o: Placement, sprite: Sprite): { x: number; y: number } {
    const b = this.blobbi;
    const toward = Math.sign(o.x - b.x) || 1;
    const dir = b.animator.state.direction;
    if (dir === 'left' || dir === 'right') return { x: o.x - toward * Math.max(1, Math.round(sprite.footRx * 0.5)), y: Math.round(b.y - b.size * 0.4) };
    return { x: o.x, y: dir === 'up' ? o.y - 1 : Math.round(o.y - Math.min(sprite.anchorY * 0.3, b.size * 0.5)) };
  }

  /** The equipment layer's animation state now. */
  equipmentAnimation(time: number): EquipmentAnimation {
    if (!this.swing) return 'idle';
    const t = time - this.swing.start;
    if (t < SWING.raise) return 'raise';
    if (t < SWING.hit + 0.06) return 'strike';
    return t < SWING.end ? 'recover' : 'idle';
  }

  // ─── Farming: the player's actions only ─────────────────────────────────

  /** The grid cell in front of the Blobbi: where the hoe tills and E tends. */
  targetCell(): Cell {
    const b = this.blobbi;
    const dir = b.animator.state.direction;
    const x = b.x + (dir === 'left' ? -(b.footRx + 4) : dir === 'right' ? b.footRx + 4 : 0);
    const y = b.y + (dir === 'up' ? -6 : dir === 'down' ? 5 : -1);
    return cellAt(x, y, this.origin);
  }

  plotAt(cell: Cell): FarmPlot | null {
    return this.plotByCell.get(cellKey(cell)) ?? null;
  }

  /** The canvas rectangle of a plot. */
  plotRect(plot: Cell): { x0: number; y0: number; x1: number; y1: number } {
    return cellRect(plot, this.origin);
  }

  /** Everything a placement check needs, plots included. */
  private placementContext(): PlacementContext {
    return {
      world: this.world,
      isBlocked: (x, y) => this.islandCollision.isBlocked(x + 0.5, y + 0.5),
      buildings: this.buildings,
      // Sticks, stones and seeds must be picked up first; wild forage is simply trampled (see `trample`).
      // Hidden discoveries too: nothing is ever built (or tilled) on top of one.
      resources: [...this.resources.filter((n) => (BASIC_KINDS as readonly string[]).includes(n.kind)), ...this.hiddenDiscoveries],
      blobbi: this.blobbi,
      plots: this.plots.map((p) => this.plotRect(p)),
    };
  }

  /** Can a plot be tilled on a cell? */
  plotCheck(cell: Cell = this.targetCell()): PlacementCheck {
    return checkPlot(this.plotRect(cell), this.placementContext());
  }

  /** The crop E would plant: the selected one if its seeds are in the bag, else the first crop that has seeds. */
  cropToPlant(): CropKind | null {
    if (this.inventory.count(CROPS[this.selectedCrop].seed) > 0) return this.selectedCrop;
    return CROP_KINDS.find((k) => this.inventory.count(CROPS[k].seed) > 0) ?? null;
  }

  /** Choose the next crop whose seeds are in the bag (T). Returns the selection. */
  cycleCrop(): CropKind {
    const have = CROP_KINDS.filter((k) => this.inventory.count(CROPS[k].seed) > 0);
    if (have.length) {
      const i = have.indexOf(this.selectedCrop);
      this.selectedCrop = have[(i + 1) % have.length];
    }
    const b = this.blobbi;
    const n = this.inventory.count(CROPS[this.selectedCrop].seed);
    this.bubble = { text: have.length ? `planting ${this.selectedCrop}s (${n} seeds)` : 'no seeds in the bag', until: this.clock.time + 1.4, x: b.x, y: b.y - b.size - 2, head: b.size };
    return this.selectedCrop;
  }

  /** What E would do on the farm now (see `FarmAction`), or null when the farm has nothing to do with it. */
  farmAction(): FarmAction | null {
    if (this.inside) return null;
    const cell = this.targetCell();
    const plot = this.plotAt(cell);
    const t = this.worldTime;
    if (plot) {
      if (!plot.crop) {
        const crop = this.cropToPlant();
        return crop ? { kind: 'plant', plot, crop } : { kind: 'no-seeds', plot };
      }
      if (isMature(plot.crop, t)) return { kind: 'harvest', plot };
      if (needsWater(plot.crop, t)) return { kind: 'water', plot };
      return { kind: 'growing', plot };
    }
    if (this.equipped && toolSupports(this.equipped, 'till')) {
      const check = this.plotCheck(cell);
      return check.ok ? { kind: 'till', cell } : { kind: 'cannot-till', cell, check };
    }
    return null;
  }

  /**
   * E on the farm: harvest, water, plant, or (with the hoe) till the cell in front. Returns true when the press was
   * spent here. A hoe aimed at a tree or a building lets the press through to the usual interactions.
   */
  tend(): boolean {
    if (this.denied('farm')) return false;
    const action = this.farmAction();
    if (!action) return false;
    const time = this.clock.time;
    const b = this.blobbi;
    const say = (text: string, seconds = 1.6) => (this.bubble = { text, until: time + seconds, x: b.x, y: b.y - b.size - 2, head: b.size });
    switch (action.kind) {
      case 'harvest':
        return this.harvest(action.plot), true;
      case 'water':
        if (this.equipped && toolSupports(this.equipped, 'water')) return this.waterRow(action.plot), true;
        return this.water(action.plot), true;
      case 'plant':
        return this.plant(action.plot, action.crop), true;
      case 'no-seeds':
        say('no seeds. find some by bushes');
        b.animator.react('sad', time, 0.6, 0);
        return true;
      case 'growing': {
        const crop = action.plot.crop!;
        const left = Math.ceil(Math.min(growthRemaining(crop, this.worldTime), (crop.wetUntil ?? 0) - this.worldTime));
        say(`${crop.kind} ${STAGE_NAMES[cropStage(crop, this.worldTime)]}, watered for ${left} s`);
        b.animator.react('happy', time, 0.5, 0);
        return true;
      }
      case 'till':
        if (this.swing) return true;
        this.swing = { action: 'till', start: time, index: -1, landed: false, cell: action.cell };
        b.animator.react('excited', time, SWING.end, 0);
        this.brain.manual(time);
        return true;
      case 'cannot-till':
        if (this.facingObject() || this.facingBuilding()) return false;
        say(PROBLEM_TEXT[action.check.problem!]);
        b.animator.react('sad', time, 0.5, 0);
        return true;
    }
  }

  /** The hoe lands: the cell becomes a plot; a copper hoe also tills the two cells beside it across the row. */
  private landTill(cell: Cell): void {
    if (this.equipped && toolTier(this.equipped) >= 2) {
      const dir = this.blobbi.animator.state.direction;
      const across = dir === 'up' || dir === 'down' ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
      for (const [dx, dy] of across) {
        const c = { gx: cell.gx + dx, gy: cell.gy + dy };
        if (!this.plotAt(c) && this.plotCheck(c).ok) this.tillCell(c, true);
      }
    }
    this.tillCell(cell, false);
  }

  private tillCell(cell: Cell, quiet: boolean): void {
    const time = this.clock.time;
    const b = this.blobbi;
    const check = this.plotCheck(cell);
    if (!check.ok || this.plotAt(cell)) {
      this.bubble = { text: PROBLEM_TEXT[check.problem ?? 'plot'], until: time + 1.4, x: b.x, y: b.y - b.size - 2, head: b.size };
      return;
    }
    const tr = this.plotRect(cell);
    this.trample(tr.x0, tr.y0, tr.x1, tr.y1);
    const n = this.plots.reduce((m, p) => Math.max(m, Number(p.id.split(':')[1]) + 1 || 0), 0);
    const plot: FarmPlot = { id: `plot:${n}`, gx: cell.gx, gy: cell.gy, preparedAt: this.worldTime, crop: null, harvests: 0 };
    this.plots.push(plot);
    this.plotByCell.set(cellKey(plot), plot);
    this.tally.plots++;
    const c = cellCentre(cell, this.origin);
    for (let i = 0; i < 6; i++) this.particles.dust(c.x + this.particles.rng.range(-3, 3), c.y + this.particles.rng.range(-2, 2), i % 2 ? SOIL_COLOURS.dry.light : SOIL_COLOURS.dry.dark);
    if (quiet) return;
    const crop = this.cropToPlant();
    this.bubble = { text: crop ? `tilled! E plants a ${crop}` : 'tilled! now find seeds', until: time + 1.6, x: b.x, y: b.y - b.size - 2, head: b.size };
    b.animator.react('happy', time, 0.7, 2);
    this.sound('till');
    this.save();
  }

  /** Plant one seed of a crop in an empty plot. */
  plant(plot: FarmPlot, kind: CropKind = this.cropToPlant() ?? this.selectedCrop): boolean {
    const time = this.clock.time;
    const b = this.blobbi;
    if (plot.crop) return false;
    if (this.inventory.remove(CROPS[kind].seed, 1) !== 1) return false;
    plot.crop = plantCrop(kind, this.worldTime);
    this.tally.planted++;
    const c = cellCentre(plot, this.origin);
    for (let i = 0; i < 4; i++) this.particles.dust(c.x + this.particles.rng.range(-2, 2), c.y, i % 2 ? SOIL_COLOURS.dry.light : hex('#e3c48a'));
    this.sound('plant');
    this.bubble = { text: `planted a ${kind}. it needs water`, until: time + 1.8, x: b.x, y: b.y - b.size - 2, head: b.size };
    b.animator.react('happy', time, 0.7, 2);
    this.brain.manual(time);
    this.save();
    return true;
  }

  /** With the watering can: the target plot and its two neighbours across the row, every dry crop among them. */
  waterRow(plot: FarmPlot): number {
    const dir = this.blobbi.animator.state.direction;
    const big = !!this.equipped && toolTier(this.equipped) >= 2;
    const across = big ? [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => [dx, dy])) : dir === 'up' || dir === 'down' ? [[-1, 0], [0, 0], [1, 0]] : [[0, -1], [0, 0], [0, 1]];
    let n = 0;
    for (const [dx, dy] of across) {
      const p = this.plotAt({ gx: plot.gx + dx, gy: plot.gy + dy });
      if (p?.crop && needsWater(p.crop, this.worldTime) && this.water(p)) n++;
    }
    if (n > 1) this.bubble = { text: `watered ${n} crops`, until: this.clock.time + 1.6, x: this.blobbi.x, y: this.blobbi.y - this.blobbi.size - 2, head: this.blobbi.size };
    return n;
  }

  /** Water a dry crop: the soil darkens and the crop grows for the crop's watering time. */
  water(plot: FarmPlot): boolean {
    const time = this.clock.time;
    const b = this.blobbi;
    if (!plot.crop) return false;
    const next = waterCrop(plot.crop, this.worldTime);
    if (!next) return false;
    plot.crop = next;
    this.tally.watered++;
    this.sound('water');
    const c = cellCentre(plot, this.origin);
    for (let i = 0; i < 8; i++) this.particles.drop(c.x + this.particles.rng.range(-3, 3), c.y - this.particles.rng.range(2, 6), i % 3 ? hex('#5fb3f0') : hex('#d8f1ff'));
    this.bubble = { text: `watered. grows for ${CROPS[plot.crop.kind].waterSeconds} s`, until: time + 1.6, x: b.x, y: b.y - b.size - 2, head: b.size };
    b.animator.react('happy', time, 0.7, 1);
    this.brain.manual(time);
    this.save();
    return true;
  }

  /**
   * Harvest a mature crop: everything it yields goes in the bag at once, or nothing does and the crop waits (no
   * reward is ever lost or given twice: the crop is gone in the same step its yield arrives, and both are saved
   * together). The plot is ready to plant again.
   */
  harvest(plot: FarmPlot): boolean {
    const time = this.clock.time;
    const b = this.blobbi;
    const crop = plot.crop;
    if (!crop || !isMature(crop, this.worldTime)) return false;
    const yieldNow = harvestFor(crop);
    const short = yieldNow.find((h) => this.inventory.count(h.item) + h.quantity > this.inventory.limit(h.item));
    if (short) {
      this.bubble = { text: `no room for ${itemPlural(short.item)}`, until: time + 1.8, x: b.x, y: b.y - b.size - 2, head: b.size };
      b.animator.react('sad', time, 0.6, 0);
      return false;
    }
    for (const h of yieldNow) this.inventory.add(h.item, h.quantity);
    plot.crop = afterHarvest(crop);
    plot.harvests++;
    this.ripe.delete(plot.id);
    this.tally.harvested++;
    if (CROPS[crop.kind].flower) this.tally.flowers++;
    this.sound('harvest');
    const c = cellCentre(plot, this.origin);
    this.harvestPops.push({ kind: crop.kind, x: c.x, y: c.y, start: time });
    for (let i = 0; i < 5; i++) this.particles.leaf(c.x + this.particles.rng.range(-3, 3), c.y - this.particles.rng.range(1, 5), i % 2 ? SOIL_COLOURS.leaf.mid : SOIL_COLOURS.leaf.light);
    for (let i = 0; i < 3; i++) this.particles.sparkle(c.x + this.particles.rng.range(-4, 4), c.y - this.particles.rng.range(3, 9), i % 2 ? hex('#fff2b0') : cropColour(crop.kind));
    addHappiness(this.care, JOY.harvest);
    const food = yieldNow[0];
    this.bubble = { text: `+${food.quantity} ${food.quantity === 1 ? itemLabel(food.item) : itemPlural(food.item)}  ${this.inventory.count(food.item)}/${this.inventory.limit(food.item)}`, until: time + 1.8, x: b.x, y: b.y - b.size - 2, head: b.size };
    b.animator.react('excited', time, 1, 3);
    this.brain.manual(time);
    this.save();
    return true;
  }

  /** A crop's visible stage now, for the renderer and the UI. */
  cropStageOf(plot: FarmPlot): number {
    return plot.crop ? cropStage(plot.crop, this.worldTime) : -1;
  }

  /** Sparkles when a crop ripens (checked once a second in world time). */
  private stepFarm(dt: number): void {
    this.farmTimer -= dt;
    if (this.farmTimer > 0 || !this.plots.length) return;
    this.farmTimer = 1;
    // Rain waters every dry crop it falls on (outdoors; no tally: that is the sky's work, not the player's).
    if (rainAt(this.world.seed, this.worldTime) > 0.3)
      for (const plot of this.plots) if (plot.crop && needsWater(plot.crop, this.worldTime)) plot.crop = waterCrop(plot.crop, this.worldTime) ?? plot.crop;
    // Sprinklers water every dry crop within a step of them.
    for (const sp of this.buildings) {
      if (BUILDINGS[sp.kind].use !== 'sprinkle' || this.buildingAt(sp) < 1) continue;
      const c = cellAt(sp.x, sp.y, this.origin);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const plot = this.plotAt({ gx: c.gx + dx, gy: c.gy + dy });
          if (plot?.crop && needsWater(plot.crop, this.worldTime)) {
            plot.crop = waterCrop(plot.crop, this.worldTime) ?? plot.crop;
            const pc = cellCentre(plot, this.origin);
            for (let i = 0; i < 2; i++) this.islandParticles.drop(pc.x + this.islandParticles.rng.range(-3, 3), pc.y - 4, hex('#d8f1ff'));
          }
        }
    }
    for (const plot of this.plots) {
      if (!plot.crop || this.ripe.has(plot.id) || !isMature(plot.crop, this.worldTime)) continue;
      this.ripe.add(plot.id);
      const c = cellCentre(plot, this.origin);
      for (let i = 0; i < 3; i++) this.particles.sparkle(c.x + this.particles.rng.range(-3, 3), c.y - this.particles.rng.range(4, 9), hex('#fff2b0'));
    }
  }

  // ─── Care: the player's attention, the Blobbi's needs ───────────────────

  /** The first food in the bag, smallest first, or null. */
  foodToGive(): string | null {
    return FOODS.find((f) => this.inventory.count(f) > 0) ?? null;
  }

  /** Feed the Blobbi one food (F). Consumes it only when the Blobbi eats. */
  feed(item: string | null = this.foodToGive()): boolean {
    if (this.denied('care')) return false;
    const time = this.clock.time;
    const b = this.blobbi;
    const say = (text: string) => (this.bubble = { text, until: time + 1.8, x: b.x, y: b.y - b.size - 2, head: b.size });
    if (!item || this.inventory.count(item) === 0 || !foodValue(item)) {
      say('no food yet. grow some!');
      b.animator.react('sad', time, 0.6, 0);
      this.sound('fail');
      return false;
    }
    if (this.brain.state === 'rest' || this.brain.state === 'to-shelter') this.brain.wake(time);
    if (!eat(this.care, foodEffect(item) ?? foodValue(item))) {
      say('not hungry right now');
      b.animator.react('neutral', time, 0.6, 0);
      return false;
    }
    this.inventory.remove(item, 1);
    this.tally.fed++;
    const meal = item.includes(':meal:');
    if (meal) this.tally.mealsFed++;
    // Tastes: a favourite is a bigger treat; every food tried is remembered.
    const favourite = this.tastes.foods.includes(item);
    this.companion.tasted.add(item);
    if (favourite) {
      this.tally.favourites++;
      addHappiness(this.care, JOY.favourite);
    }
    this.addFriendship(favourite ? FRIEND.favourite : meal ? FRIEND.meal : FRIEND.feed);
    for (let i = 0; i < 4; i++) this.particles.dust(b.x + this.particles.rng.range(-3, 3), b.y - b.size * 0.45, i % 2 ? hex('#fff2b0') : hex('#e3c48a'));
    for (let i = 0; i < (favourite ? 4 : 2); i++) this.particles.heart(b.x + this.particles.rng.range(-4, 4), b.y - b.size - 2 - i * 3);
    say(favourite ? `my favourite! ${itemLabel(item)}!` : meal ? `yum! ${itemLabel(item)}` : `yum! a ${itemLabel(item)}`);
    b.animator.react('excited', time, favourite ? 1.8 : 1.3, favourite ? 4 : 3);
    this.sound('eat');
    this.save();
    return true;
  }

  /** Give the Blobbi some attention (H). Happiness rises once per cooldown; a sleeping Blobbi stays asleep. */
  pet(): boolean {
    const time = this.clock.time;
    const b = this.blobbi;
    this.tally.petted++;
    if (this.brain.state === 'rest') {
      this.particles.heart(b.x, b.y - b.size - 2);
      return false;
    }
    const counted = petCare(this.care, this.worldTime);
    if (counted) this.addFriendship(FRIEND.pet);
    for (let i = 0; i < (counted ? 3 : 1); i++) this.particles.heart(b.x + this.particles.rng.range(-4, 4), b.y - b.size - 1 - i * 3);
    b.animator.react('happy', time, counted ? 1.1 : 0.6, counted ? 3 : 1);
    this.sound(counted ? 'pet' : 'happy');
    this.save();
    return counted;
  }

  /** Tap to walk: the Blobbi walks to a world point (current scene) along a path. */
  walkTo(x: number, y: number): boolean {
    this.walkingToClick = true;
    if (this.brain.state === 'rest') this.brain.wake(this.clock.time);
    this.fishing = null;
    return this.brain.goTo(this.clock.time, { x: this.blobbi.x, y: this.blobbi.y }, { x, y });
  }

  /** Rest (R): go to sleep, in the shelter when there is one, until rested; R again wakes. */
  rest(): void {
    const time = this.clock.time;
    const b = this.blobbi;
    if (this.brain.state === 'rest' || this.brain.state === 'to-shelter') {
      this.brain.wake(time);
      b.animator.state.sleeping = false;
      b.animator.react('surprised', time, 0.5, 1);
      this.sound('wake');
      return;
    }
    this.sound('sleep');
    // M9: rest means bed. Indoors: to the nearest bed the Blobbi can reach. Outside: home first (through its door,
    // the usual way in), then to bed. Without a home or a bed, a nap right here.
    let text = 'nap time';
    if (this.inside) text = this.goToBed(time) ? 'bed time' : 'no bed here: a little nap';
    else {
      const home = this.homeForRest();
      if (home) {
        this.restPlan = { phase: 'home', houseId: home.id, bedId: null };
        this.brain.restNow(time, { x: b.x, y: b.y }, doorSpot(home, b.footRy));
        if ((this.brain.state as string) === 'to-shelter') text = 'going home to bed';
        else if ((this.brain.state as string) === 'rest' && !this.brain.restAtShelter) {
          this.restPlan = null;
          text = 'too far from home: a little nap';
        }
      } else this.brain.restNow(time, { x: b.x, y: b.y }, null);
    }
    this.bubble = { text, until: time + 1.6, x: b.x, y: b.y - b.size - 2, head: b.size };
  }

  // ─── Resting in bed (M9) ────────────────────────────────────────────────

  /** A rest that ends in a bed: going home, walking to the bed, climbing in, tucked in, climbing out. Not saved. */
  restPlan: RestPlan | null = null;

  /** The finished house the Blobbi goes home to (the nearest), or null. */
  private homeForRest(): Building | null {
    const b = this.blobbi;
    let best: { h: Building; d: number } | null = null;
    for (const s of this.buildings) {
      if (s.kind !== 'shelter' || this.buildingAt(s) < 1) continue;
      const door = doorSpot(s, b.footRy);
      const d = Math.hypot(door.x - b.x, door.y - b.y);
      if (!best || d < best.d) best = { h: s, d };
    }
    return best?.h ?? null;
  }

  /** The beds of the room (beds and Blobbi cushions), nearest first. */
  private roomBeds(): Building[] {
    const b = this.blobbi;
    const beds = this.interior?.state.furniture.filter((f) => f.kind === 'bed' || f.kind === 'pet-bed') ?? [];
    return beds.sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y) || (p.id < q.id ? -1 : 1));
  }

  /** Where the Blobbi stands to climb into a bed (in front of it). */
  bedApproach(bed: Building): { x: number; y: number } {
    return { x: bed.x, y: bed.y + BUILDINGS[bed.kind].footRy + this.blobbi.footRy + 2 };
  }

  /** Where the Blobbi lies in a bed: on the sheet, its lower half under the blanket (a cushion: sitting in it). */
  bedSleepSpot(bed: Building): { x: number; y: number } {
    return bed.kind === 'pet-bed' ? { x: bed.x, y: bed.y + 1 } : { x: bed.x, y: bed.y + 2 };
  }

  /** Indoors: walk to the nearest reachable bed and rest there. False (a nap on the spot) without one. */
  private goToBed(time: number): boolean {
    const b = this.blobbi;
    const pos = { x: b.x, y: b.y };
    for (const bed of this.roomBeds()) {
      const at = this.bedApproach(bed);
      if (!this.brain.reachable(pos, at)) continue;
      this.restPlan = { phase: 'bed', houseId: this.interior!.state.shelterId, bedId: bed.id, bedAt: { x: bed.x, y: bed.y } };
      this.brain.restNow(time, pos, at);
      return true;
    }
    this.restPlan = null;
    this.brain.restNow(time, pos, null);
    return false;
  }

  /** The bed the Blobbi is in (or climbing into or out of), for drawing; null otherwise. */
  inBed(): { bed: Building; tucked: boolean } | null {
    const p = this.restPlan;
    if (!p || !this.interior || (p.phase !== 'climb-in' && p.phase !== 'in-bed' && p.phase !== 'climb-out')) return null;
    const bed = this.interior.state.furniture.find((f) => f.id === p.bedId);
    return bed ? { bed, tucked: p.phase === 'in-bed' } : null;
  }

  /** Each step, after movement: carry the rest plan along (enter the house, climb in, stay tucked, climb out). */
  private stepRestPlan(time: number): void {
    const b = this.blobbi;
    const st = this.brain.state;
    let p = this.restPlan;
    // A rest that reached a bed on its own (autonomy, tired indoors): climb in too.
    if (!p) {
      if (!this.inside || st !== 'rest' || !this.brain.restAtShelter) return;
      const bed = this.roomBeds().find((f) => Math.hypot(this.bedApproach(f).x - b.x, this.bedApproach(f).y - b.y) < 6);
      if (!bed) return;
      p = this.restPlan = { phase: 'bed', houseId: this.interior!.state.shelterId, bedId: bed.id, bedAt: { x: bed.x, y: bed.y } };
    }
    const lerp = (k: number) => {
      const e = k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
      b.x = p!.from!.x + (p!.to!.x - p!.from!.x) * e;
      b.y = p!.from!.y + (p!.to!.y - p!.from!.y) * e;
    };
    const bed = p.bedId ? this.interior?.state.furniture.find((f) => f.id === p!.bedId) ?? null : null;
    switch (p.phase) {
      case 'home': {
        if (st === 'to-shelter') return;
        const house = this.buildings.find((h) => h.id === p.houseId);
        // Interrupted (a key, a tap), or no way home (a nap where it stands): the plan ends.
        if (st !== 'rest' || !this.brain.restAtShelter || this.inside || !house || this.buildingAt(house) < 1) {
          this.restPlan = null;
          return;
        }
        // At the door: in through the usual way, then to bed.
        if (!this.enterInterior(house)) {
          this.restPlan = null;
          return;
        }
        if (!this.goToBed(time)) this.bubble = { text: 'no bed here: a little nap', until: time + 1.6, x: b.x, y: b.y - b.size - 2, head: b.size };
        return;
      }
      case 'bed': {
        // The bed was moved, picked up or replaced while the Blobbi walked: choose again.
        if (!bed || bed.x !== p.bedAt!.x || bed.y !== p.bedAt!.y) {
          if (st === 'to-shelter' || st === 'rest') this.goToBed(time);
          else this.restPlan = null;
          return;
        }
        if (st === 'to-shelter') return;
        if (st !== 'rest' || !this.brain.restAtShelter) {
          this.restPlan = null;
          return;
        }
        p.phase = 'climb-in';
        p.from = { x: b.x, y: b.y };
        p.to = this.bedSleepSpot(bed);
        p.t0 = time;
        b.animator.state.direction = 'down';
        this.sound('place');
        return;
      }
      case 'climb-in': {
        if (!bed) return void (this.restPlan = null);
        if (st !== 'rest') return this.climbOut(time, bed);
        const k = (time - p.t0!) / CLIMB_SECONDS;
        lerp(k);
        if (k >= 1) {
          p.phase = 'in-bed';
          b.animator.state.direction = 'down';
          b.animator.state.sleeping = true;
          // Snug: a little heart as it settles (no reaction: that would open its eyes).
          this.particles.heart(b.x, b.y - b.size + 2);
        }
        return;
      }
      case 'in-bed': {
        if (!bed) return void (this.restPlan = null);
        if (st !== 'rest') return this.climbOut(time, bed);
        b.x = p.to!.x;
        b.y = p.to!.y;
        return;
      }
      case 'climb-out': {
        const k = (time - p.t0!) / CLIMB_SECONDS;
        lerp(k);
        if (k >= 1) this.restPlan = null;
        return;
      }
    }
  }

  /** Out of bed: a short hop back to where the Blobbi climbed in (never through a wall). */
  private climbOut(time: number, bed: Building): void {
    const p = this.restPlan!;
    p.phase = 'climb-out';
    p.from = { x: this.blobbi.x, y: this.blobbi.y };
    const at = this.bedApproach(bed);
    p.to = this.collision.nearestFree(at.x, at.y, this.blobbi.footRx, this.blobbi.footRy) ?? at;
    p.t0 = time;
  }

  /** Where the Blobbi sleeps at the nearest finished shelter: in its doorway, or null without one. */
  shelterDoor(): { x: number; y: number } | null {
    const b = this.blobbi;
    let best: { x: number; y: number; d: number } | null = null;
    for (const s of this.buildings) {
      if (s.kind !== 'shelter' || this.buildingAt(s) < 1) continue;
      const door = doorSpot(s, b.footRy);
      const d = Math.hypot(door.x - b.x, door.y - b.y);
      if (!best || d < best.d) best = { ...door, d };
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  /**
   * Things the Blobbi may wander over to look at: what the player made (its favourite thing twice), growing crops,
   * the sea from the beach, and anything hidden nearby that it is curious about.
   */
  private pointsOfInterest(): PointOfInterest[] {
    const out: PointOfInterest[] = [];
    const b = this.blobbi;
    for (const r of this.placedHere) {
      const def = BUILDINGS[r.kind];
      if (r.kind === 'shelter' || r.kind === 'fence' || def.layer === 'wall' || this.buildingAt(r) < 1) continue;
      // What the player made is the most interesting thing around (three times the weight; its favourite, four).
      for (let k = 0; k < (r.kind === this.tastes.thing ? 4 : 3); k++) out.push({ x: r.x, y: r.y, kind: r.kind });
    }
    if (this.inside) return out;
    for (const p of this.plots) if (p.crop && cropStage(p.crop, this.worldTime) >= 2) out.push({ ...cellCentre(p, this.origin), kind: 'crop' });
    for (const s of this.shoreSpots) out.push({ ...s, kind: 'sea' });
    for (const d of this.hiddenDiscoveries) if (Math.hypot(d.x - b.x, d.y - b.y) < 80) out.push({ x: d.x, y: d.y - 4, kind: 'curious' });
    return out;
  }

  /** The Blobbi arrived somewhere it wanted to look at: a small, cosmetic reaction (never touches the bag). */
  private lookAround(): void {
    const look = this.brain.lastLook;
    this.brain.lastLook = null;
    const time = this.clock.time;
    const b = this.blobbi;
    const say = (text: string, seconds = 1.8) => !this.bubble && (this.bubble = { text, until: time + seconds, x: b.x, y: b.y - b.size - 2, head: b.size });
    if (look?.kind === 'sea') {
      say(this.creatures.pick(['the sea is so big', 'waves...', 'where are we going?', 'hello, sea!']), 2.2);
      b.animator.react('happy', time, 2.5, 0);
      return;
    }
    if (look?.kind === 'curious') {
      this.particles.exclaim(b.x, b.y - b.size - 4);
      say("what's that?", 2);
      b.animator.react('surprised', time, 1.2, 2);
      return;
    }
    if (look?.kind === 'crop') {
      const plot = this.plots.find((p) => Math.hypot(cellCentre(p, this.origin).x - look.x, cellCentre(p, this.origin).y - look.y) < 2);
      if (plot?.crop && isMature(plot.crop, this.worldTime)) say(`the ${plot.crop.kind} looks ripe!`);
      else if (plot?.crop && needsWater(plot.crop, this.worldTime)) say('this one is thirsty');
      else say('growing nicely');
      b.animator.react('happy', time, 1, 1);
      return;
    }
    const placed = look ? this.placedHere.find((r) => r.x === look.x && r.y === look.y) : null;
    if (placed) {
      this.visitBuilding(placed, false);
      if (placed.kind === this.tastes.thing) {
        for (let i = 0; i < 3; i++) this.particles.heart(b.x + this.particles.rng.range(-4, 4), b.y - b.size - 2 - i * 3);
        this.bubble = { text: `I love the ${BUILDINGS[placed.kind].label}!`, until: time + 2, x: b.x, y: b.y - b.size - 2, head: b.size };
        addHappiness(this.care, JOY.decoration);
      }
      return;
    }
    this.interact(false);
  }

  /** Needs, the face they suggest, the odd autonomous reaction. Called every step. */
  private stepCare(dt: number): void {
    const b = this.blobbi;
    const time = this.clock.time;
    const now = this.worldTime;
    const resting = this.brain.state === 'rest';
    // A rest that ended rested is a good rest (checked before this step's waking minute counts).
    if (this.wasResting && !resting && isRested(this.care)) addHappiness(this.care, JOY.rested);
    this.wasResting = resting;
    stepCare(this.care, dt, { resting, sheltered: resting && this.brain.restAtShelter, moving: this.movedLastStep });
    b.animator.state.mood = mood(this.care);
    if (resting) {
      this.sleepTimer -= dt;
      if (this.sleepTimer <= 0) {
        this.sleepTimer = 1.4;
        this.particles.zzz(b.x + 3, b.y - b.size - 1);
      }
      return;
    }
    if (this.bubble || this.brain.manualActive) return;
    if (isHungry(this.care) && now >= this.nextHungryNote) {
      this.nextHungryNote = now + 45;
      this.bubble = { text: this.foodToGive() ? 'hungry... (F to feed)' : 'hungry...', until: time + 2, x: b.x, y: b.y - b.size - 2, head: b.size };
      b.animator.react('sad', time, 1, 0);
    } else if (isTired(this.care) && now >= this.nextTiredNote) {
      this.nextTiredNote = now + 60;
      this.bubble = { text: 'so sleepy...', until: time + 1.8, x: b.x, y: b.y - b.size - 2, head: b.size };
    } else if (this.care.happiness >= 90 && now >= this.nextHappyNote) {
      this.nextHappyNote = now + 30;
      this.particles.heart(b.x, b.y - b.size - 2);
    }
  }

  // ─── Objectives ─────────────────────────────────────────────────────────

  /** Complete what the tally and the world now satisfy; grant each reward once, announce it, save. */
  /** What quest goals read. */
  questContext(): ObjectiveContext {
    return { tally: this.tally, inventory: this.inventory, buildings: this.buildings, worldTime: this.worldTime, found: this.found, friendship: friendLevel(this.companion.friendship) };
  }

  private stepObjectives(): void {
    // Island requests: one at a time, the next from the following dawn.
    if (!this.objectives.request) {
      const started = startRequest(this.objectives, this.tally, this.worldTime);
      if (started) this.notices.push({ heading: 'New request', title: started.title, text: 'see the journal (J)', until: (this.notices.at(-1)?.until ?? this.clock.time) + 3 });
    } else {
      const finished = finishRequest(this.objectives, this.tally, nextDawn(this.worldTime));
      if (finished) {
        for (const r of finished.reward.items) this.inventory.add(r.item, r.quantity);
        this.addFriendship(FRIEND.quest);
        this.notices.push({ heading: 'Request done', title: finished.title, text: `reward: ${finished.reward.text}`, until: (this.notices.at(-1)?.until ?? this.clock.time) + 3 });
        this.sound('quest');
        this.save();
      }
    }
    const done = advanceObjectives(this.objectives, this.questContext());
    if (!done.length) return;
    const b = this.blobbi;
    for (const o of done) this.grantReward(o);
    for (let i = 0; i < 6; i++) this.particles.sparkle(b.x + this.particles.rng.range(-8, 8), b.y - b.size * 0.6 + this.particles.rng.range(-6, 6), i % 2 ? hex('#ffe07a') : hex('#ffffff'));
    b.animator.react('excited', this.clock.time, 1, 3);
    this.save();
  }

  private grantReward(o: Objective): void {
    const got: string[] = [];
    for (const r of o.reward.items) {
      const n = this.inventory.add(r.item, r.quantity);
      if (n < r.quantity) got.push(`${r.quantity - n} ${itemPlural(r.item)} did not fit`);
    }
    addHappiness(this.care, JOY.objective);
    for (const id of o.reward.lore) this.learn(id);
    this.addFriendship(FRIEND.quest + o.reward.friendship);
    this.sound('quest');
    // A quest that teaches recipes: the discovery chime too.
    if (RECIPES.some((r) => r.unlock === o.id)) this.sound('recipe');
    const at = this.notices.length ? this.notices[this.notices.length - 1].until : this.clock.time;
    const heading = o.type === 'side' ? 'Side quest done' : o.type === 'discovery' ? 'Discovery quest done' : 'Quest complete';
    this.notices.push({ heading, title: o.title, text: `reward: ${o.reward.text}${got.length ? ` (${got.join(', ')})` : ''}`, until: at + 3.2 });
  }

  // ─── Lore, discoveries, the Carrier ─────────────────────────────────────

  /** Add a journal note (once). */
  learn(id: string): boolean {
    const lore = (this.objectives.lore ??= []);
    if (lore.includes(id) || !loreById(id)) return false;
    lore.push(id);
    return true;
  }

  /** Discoveries still lying on the ground. */
  get hiddenDiscoveries(): DiscoverySpot[] {
    return this.discoveries.filter((d) => !this.found.has(d.id));
  }

  nearestDiscovery(reach = REACH): DiscoverySpot | null {
    if (this.inside) return null;
    const b = this.blobbi;
    let best: DiscoverySpot | null = null;
    let bestD = Infinity;
    for (const d of this.hiddenDiscoveries) {
      const dist = Math.hypot(d.x - b.x, (d.y - b.y) * 1.25);
      if (dist <= reach && dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best;
  }

  /** Pick up the discovery in reach: its special item, its journal note, a moment of wonder. */
  collectDiscovery(): DiscoverySpot | null {
    if (this.denied('gather')) return null;
    const d = this.nearestDiscovery();
    if (!d) return null;
    const time = this.clock.time;
    const b = this.blobbi;
    this.found.add(d.id);
    this.inventory.add(d.content.item.id, 1);
    this.tally.discoveries++;
    this.learn(d.content.lore);
    for (let i = 0; i < 8; i++) this.particles.sparkle(d.x + this.particles.rng.range(-6, 6), d.y - this.particles.rng.range(0, 10), i % 2 ? hex('#fff2b0') : hex('#d8f1ff'));
    this.bubble = { text: `found: ${d.content.item.label}!`, until: time + 2.2, x: b.x, y: b.y - b.size - 2, head: b.size };
    b.animator.react('surprised', time, 0.5, 2);
    this.notices.push({ heading: 'Discovery', title: d.content.item.label, text: 'a new note in the journal (J)', until: (this.notices.at(-1)?.until ?? time) + 3 });
    this.addFriendship(1);
    this.sound('discover');
    this.save();
    return d;
  }

  /** Whether a special item has a note to read. */
  readable(item: string): boolean {
    return ALL_DISCOVERIES.some((d) => d.item.id === item);
  }

  /** The note a special item holds. */
  noteFor(item: string): string | null {
    return ALL_DISCOVERIES.find((d) => d.item.id === item)?.lore ?? null;
  }

  /** Close enough to the turtle's head to listen (at the shore in front of it). */
  nearCarrier(): boolean {
    const s = this.listenSpot;
    return !!s && !this.inside && Math.hypot(this.blobbi.x - s.x, this.blobbi.y - s.y) < 26;
  }

  /** Listen to the Carrier: the turtle blinks and glances (its own animations), and the island hums. */
  listen(): void {
    const time = this.clock.time;
    const b = this.blobbi;
    this.tally.talked++;
    const ta = this.turtleAnim;
    ta.blinkUntil = time + 0.18;
    ta.glance = this.listenSpot && this.world.turtle && this.listenSpot.x < this.world.turtle.head.cx ? -1 : 1;
    ta.glanceUntil = time + 2.5;
    ta.nextGlance = ta.glanceUntil + 4;
    // The hum's words follow the island's harmony (warmer as it grows; never colder).
    const lines = HUM_LINES.slice(0, this.harmony().level + 1).flat();
    this.bubble = { text: lines[(this.tally.talked - 1) % lines.length], until: time + 3, x: b.x, y: b.y - b.size - 2, head: b.size };
    b.animator.react('happy', time, 1.5, 1);
    for (let i = 0; i < 3; i++) this.islandParticles.ripple(this.listenSpot!.x + this.particles.rng.range(-8, 8), this.listenSpot!.y + 6 + i * 2, paletteFor(this.world.options.palette).foam);
    this.addFriendship(1);
    this.carrier.bond += BOND.listen;
    this.sound('hum');
    this.save();
  }

  // ─── The Carrier as a companion (see game/carrier.ts) ─────────────────────

  /** The World Carrier's species. */
  get species(): 'turtle' | 'manta' | 'whale' {
    return this.world.creature?.species ?? 'turtle';
  }

  /** Island harmony now (non-punitive: it never falls). */
  harmony(): ReturnType<typeof harmony> {
    return harmony({ bond: this.carrier.bond, tally: this.tally, found: this.found.size, days: dayAt(this.worldTime) });
  }

  /** The Carrier's growth stage and planned expansions (designed; never applied to the world). */
  carrierGrowth(): ReturnType<typeof growthStage> {
    return growthStage(this.harmony().value, dayAt(this.worldTime));
  }

  /** What the Carrier likes to be offered: two of the foods and flowers, chosen by its own seed. */
  get carrierLikes(): string[] {
    const seed = this.world.carrier?.seed ?? this.world.turtle?.genome.seed ?? this.world.creature?.seed ?? this.world.seed;
    return carrierFavourites(seed, ALL_ITEMS.filter((d) => d.food || d.id.includes('flower')).map((d) => d.id));
  }

  private carrierTurns(glance: boolean): void {
    const time = this.clock.time;
    const ta = this.turtleAnim;
    ta.blinkUntil = time + 0.18;
    if (glance && this.world.turtle) {
      ta.glance = this.blobbi.x < this.world.turtle.head.cx ? -1 : 1;
      ta.glanceUntil = time + 2.2;
      ta.nextGlance = ta.glanceUntil + 4;
    }
  }

  private say(text: string, seconds = 2.4): void {
    const b = this.blobbi;
    this.bubble = { text, until: this.clock.time + seconds, x: b.x, y: b.y - b.size - 2, head: b.size };
  }

  /** Greet the Carrier: a wave and a hop; it blinks back. Counts toward the bond once a day. */
  greetCarrier(): boolean {
    if (!this.nearCarrier()) return false;
    const time = this.clock.time;
    const day = dayAt(this.worldTime);
    this.carrier.counts.greet++;
    const first = this.carrier.greetedDay !== day;
    if (first) {
      this.carrier.greetedDay = day;
      this.carrier.bond += BOND.greet;
    }
    this.carrierTurns(true);
    this.blobbi.animator.react('excited', time, 1.2, 4);
    this.say(first ? 'hello, big friend!' : 'hello again!');
    this.sound('happy');
    this.save();
    return first;
  }

  /** Observe the Carrier: notice the next thing about it (kept in the journal). False when nothing new to see now. */
  observeCarrier(): string | null {
    if (!this.nearCarrier()) return null;
    const time = this.clock.time;
    const night = hourAt(this.worldTime) >= 20.5 || hourAt(this.worldTime) < 5.5;
    const o = nextObservation(this.carrier, night, this.species);
    this.carrier.counts.observe++;
    this.blobbi.animator.react(o ? 'surprised' : 'neutral', time, 1, o ? 2 : 0);
    if (!o) {
      this.say(night ? 'the Carrier sleeps. come back by day' : 'the Carrier, as always: calm');
      return null;
    }
    this.carrier.observations.push(o.id);
    this.carrier.bond += BOND.observe;
    this.carrierTurns(o.id === 'eye');
    this.say(o.text, 3);
    this.sound('curious');
    this.save();
    return o.id;
  }

  /** Offer the Carrier something from the bag (a food or a flower). Counts once a day; a favourite counts more. */
  offerToCarrier(item: string): boolean {
    if (this.denied('inventory')) return false;
    if (!this.nearCarrier() || this.inventory.count(item) < 1) return false;
    const def = ALL_ITEMS.find((d) => d.id === item);
    if (!def || !(def.food || item.includes('flower'))) {
      this.say('the Carrier only takes food and flowers');
      this.sound('fail');
      return false;
    }
    const time = this.clock.time;
    this.inventory.remove(item, 1);
    const day = dayAt(this.worldTime);
    const favourite = this.carrierLikes.includes(item);
    this.carrier.counts.offer++;
    if (favourite && !this.carrier.likesFound.includes(item)) this.carrier.likesFound.push(item);
    if (this.carrier.offeredDay !== day) {
      this.carrier.offeredDay = day;
      this.carrier.bond += favourite ? BOND.favourite : BOND.offer;
    }
    this.carrierTurns(true);
    for (let i = 0; i < 4; i++) this.islandParticles.ripple(this.listenSpot!.x + this.particles.rng.range(-8, 8), this.listenSpot!.y + 6 + i * 2, paletteFor(this.world.options.palette).foam);
    this.blobbi.animator.react('happy', time, 1.4, 2);
    this.say(favourite ? `the Carrier loves ${itemLabel(item)}!` : `the Carrier takes the ${itemLabel(item)}`);
    this.sound(favourite ? 'hum' : 'pickup');
    this.save();
    return true;
  }

  /** Nap on the shore by the Carrier's head (counts toward the bond once a day). */
  restByCarrier(): boolean {
    if (!this.nearCarrier() || !this.listenSpot) return false;
    const time = this.clock.time;
    const day = dayAt(this.worldTime);
    this.carrier.counts.rest++;
    if (this.carrier.restedDay !== day) {
      this.carrier.restedDay = day;
      this.carrier.bond += BOND.rest;
    }
    this.brain.restNow(time, { x: this.blobbi.x, y: this.blobbi.y }, this.listenSpot);
    this.say('a nap by the Carrier. its hum is a lullaby');
    this.sound('sleep');
    this.save();
    return true;
  }

  /** Walking near a named place for the first time adds it to the journal and the map. */
  private stepPlaces(): void {
    if (this.inside || this.teleport.state !== 'present') return;
    const b = this.blobbi;
    for (const p of this.places) {
      if (this.visited.has(p.id) || Math.hypot(b.x - p.x, b.y - p.y) > p.radius) continue;
      this.visited.add(p.id);
      this.notices.push({ heading: 'New place', title: p.name, text: 'added to the journal and the map', until: (this.notices.at(-1)?.until ?? this.clock.time) + 3 });
      this.sound('curious');
      this.save();
    }
  }

  /** Standing still by the head for a while, the Blobbi notices the island breathing (once a day counts). */
  private stepCarrierBreath(dt: number): void {
    if (!this.movedLastStep && this.nearCarrier() && this.teleport.state === 'present') this.stillByCarrier += dt;
    else this.stillByCarrier = 0;
    if (this.stillByCarrier < 6) return;
    this.stillByCarrier = -30; // not again for a while
    const day = dayAt(this.worldTime);
    this.carrier.counts.breathe++;
    if (this.carrier.breathDay === day) return;
    this.carrier.breathDay = day;
    this.carrier.bond += BOND.breathe;
    if (!this.carrier.observations.includes('breath')) this.carrier.observations.push('breath');
    this.say('the island rises... and falls. it breathes', 3);
    this.blobbi.animator.react('happy', this.clock.time, 1.5, 0);
    this.sound('carrier-breath');
    this.save();
  }

  // ─── Fishing ─────────────────────────────────────────────────────────────

  /** A cast in progress: where the bobber floats, when the fish bites, and how long the bite lasts. */
  fishing: { start: number; biteAt: number; x: number; y: number; water: 'sea' | 'pond' } | null = null;
  private casts = 0;

  /** The water in front of the Blobbi a rod could reach, or null. */
  fishTarget(): { x: number; y: number; water: 'sea' | 'pond' } | null {
    if (this.inside) return null;
    const b = this.blobbi;
    const dir = b.animator.state.direction;
    const fx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const fy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    const { width, height, cls } = this.world.terrain;
    // A cast reaches the pond close by, or the sea out over the shell's rim.
    for (let reach = 8; reach <= 48; reach += 2) {
      const x = Math.round(b.x + fx * reach);
      const y = Math.round(b.y + fy * reach * 0.8 - (fy === 0 ? 2 : 0));
      if (x < 0 || y < 0 || x >= width || y >= height) return null;
      const c = cls[y * width + x];
      if (c === T.POND && reach <= 20) return { x, y, water: 'pond' };
      if (c === T.SHALLOW || c === T.WATER || c === T.DEEP) return { x, y, water: 'sea' };
      // Over land, the line only carries across the rim or the shore band; anything else stops it.
      if (reach > 16 && c !== T.RIM && c !== T.FOAM && c !== T.SAND && c !== T.SAND_WET && c !== T.GRASS_EDGE) return null;
    }
    return null;
  }

  /**
   * E with a rod: cast at the water in front; when the fish bites (an "!"), E again within the moment reels it in.
   * Too early or too late, it swims off (nothing is lost). Returns true when the press was spent on fishing.
   */
  fish(): boolean {
    if (this.denied('gather')) return false;
    if (!this.equipped || !toolSupports(this.equipped, 'fish')) return false;
    const time = this.clock.time;
    const b = this.blobbi;
    const say = (text: string) => (this.bubble = { text, until: time + 1.8, x: b.x, y: b.y - b.size - 2, head: b.size });
    const f = this.fishing;
    if (!f) {
      const target = this.fishTarget();
      if (!target) return false;
      const rng = stream(this.world.seed, 'fishing', this.casts++);
      this.fishing = { start: time, biteAt: time + rng.range(1.5, 5), ...target };
      this.brain.manual(time);
      say('cast...');
      this.particles.ripple(target.x, target.y, hex('#eaf8ff'));
      this.sound('cast');
      return true;
    }
    this.fishing = null;
    if (time < f.biteAt) {
      say('too soon. it swam off');
      return true;
    }
    if (time > f.biteAt + BITE_SECONDS) {
      say('it got away');
      return true;
    }
    // A catch: which fish, from this water's weights (a deterministic draw per cast).
    const pool = FISH_CONTENT.filter((c) => c.water === 'both' || c.water === f.water);
    const total = pool.reduce((n, c) => n + c.weight, 0);
    let roll = stream(this.world.seed, 'catch', this.casts).range(0, total);
    const caught = pool.find((c) => (roll -= c.weight) < 0) ?? pool[0];
    if (this.inventory.add(caught.item.id, 1) !== 1) {
      say(`no room for ${caught.item.plural}`);
      return true;
    }
    this.tally.fished++;
    for (let i = 0; i < 6; i++) this.particles.drop(f.x + this.particles.rng.range(-3, 3), f.y - 2, i % 2 ? hex('#d8f1ff') : hex('#5fb3f0'));
    say(`+1 ${caught.item.label}!`);
    b.animator.react('excited', time, 1.3, 3);
    addHappiness(this.care, 2);
    this.sound('catch');
    this.save();
    return true;
  }

  private stepFishing(): void {
    const f = this.fishing;
    if (!f) return;
    const time = this.clock.time;
    this.brain.manual(time); // the Blobbi holds still while the line is out
    if (this.movedLastStep) {
      this.fishing = null;
      return;
    }
    if (time >= f.biteAt && time - this.clock.dt < f.biteAt) {
      this.particles.exclaim(this.blobbi.x, this.blobbi.y - this.blobbi.size - 4);
      this.particles.ripple(f.x, f.y, hex('#eaf8ff'));
      this.sound('bite');
    }
    if (time > f.biteAt + BITE_SECONDS) {
      this.fishing = null;
      this.bubble = { text: 'it got away', until: time + 1.4, x: this.blobbi.x, y: this.blobbi.y - this.blobbi.size - 2, head: this.blobbi.size };
    }
  }

  // ─── Day, night and weather ─────────────────────────────────────────────

  /** The light now: darkness (0 day .. 0.45 night) and dawn/dusk warmth. Indoors the lamps and walls soften it. */
  ambientLight(): { dark: number; warm: number; night: boolean } {
    const l = lightAt(this.worldTime);
    return this.inside ? { dark: l.dark * 0.6, warm: l.warm * 0.5, night: l.night } : l;
  }

  /** Rain now (0..1), outdoors only. */
  rainNow(): number {
    return this.inside ? 0 : rainAt(this.world.seed, this.worldTime);
  }

  /** Lamps in the current scene: lanterns outside, wall lanterns and lamps inside. */
  lightSources(): LightSource[] {
    const out: LightSource[] = [];
    for (const r of this.placedHere) {
      if (BUILDINGS[r.kind].use !== 'light' || this.buildingAt(r) < 1) continue;
      const sprite = buildingSprite(r, paletteFor(this.world.options.palette), 1, this.world.options.scale);
      out.push({ x: r.x, y: r.y - Math.round(sprite.anchorY * 0.6), radius: this.inside ? 40 : 30 });
    }
    // The shelter's doorway glows warmly at night.
    if (!this.inside) for (const s of this.buildings) if (s.kind === 'shelter' && this.buildingAt(s) >= 1) out.push({ x: s.x, y: s.y, radius: 18 });
    return out;
  }

  /** Butterflies, birds, fireflies and rain around the Blobbi (island scenery; its own stream). */
  private stepAtmosphere(dt: number): void {
    if (this.inside) return;
    const rng = this.creatures;
    const b = this.blobbi;
    const l = lightAt(this.worldTime);
    const rain = rainAt(this.world.seed, this.worldTime);
    const p = this.islandParticles;
    if (rain > 0) {
      for (let i = 0; i < Math.round(rain * 3); i++) if (rng.chance(dt * 30)) p.rain(b.x + rng.range(-150, 150), b.y + rng.range(-110, 60));
      if (!this.wasRaining && rain > 0.3) {
        this.wasRaining = true;
        if (!this.bubble) this.bubble = { text: 'rain! the garden will love it', until: this.clock.time + 2.2, x: b.x, y: b.y - b.size - 2, head: b.size };
        b.animator.react('surprised', this.clock.time, 0.6, 1);
      }
      return;
    }
    this.wasRaining = false;
    if (!l.night) {
      if (this.flowerSpots.length && rng.chance(dt * 0.25)) {
        const f = rng.pick(this.flowerSpots);
        if (Math.hypot(f.x - b.x, f.y - b.y) < 160) p.butterfly(f.x, f.y - 6, rng.pick(paletteFor(this.world.options.palette).flowers));
      }
      if (rng.chance(dt * 0.025)) {
        const dir = rng.chance(0.5) ? 1 : -1;
        p.bird(b.x - dir * 170, b.y - rng.range(40, 110), dir);
      }
    } else if (rng.chance(dt * 1.5)) {
      p.firefly(b.x + rng.range(-120, 120), b.y + rng.range(-90, 70));
    }
  }

  // ─── Friendship and the Blobbi's own state ──────────────────────────────

  /** The island's companion: needs, friendship, foods tried. */
  companion: CompanionState = { care: newCare(), friendship: 0, tasted: new Set() };
  /** This Blobbi's tastes (from its seed, never stored). */
  tastes!: Tastes;

  /** The Blobbi's tastes follow its seed; the companion state stays with the island. */
  private useCompanion(seed: string): void {
    this.companion.care = this.care;
    this.tastes = tastesFor(seed, FAVOURITE_FOODS, FAVOURITE_THINGS);
  }

  /** Friendship grows; a new level is celebrated. */
  addFriendship(points: number): void {
    if (points <= 0) return;
    const before = friendLevel(this.companion.friendship);
    this.companion.friendship += points;
    const after = friendLevel(this.companion.friendship);
    if (after > before) {
      const b = this.blobbi;
      for (let i = 0; i < 5; i++) this.particles.heart(b.x + this.particles.rng.range(-8, 8), b.y - b.size - 2 - i * 2);
      this.notices.push({ heading: 'Friendship', title: `${FRIEND_TITLES[after - 1]}!`, text: `level ${after}`, until: (this.notices.at(-1)?.until ?? this.clock.time) + 3 });
      this.sound('friend');
    }
  }

  /** Building kinds the player may build now. */
  unlocked(): Set<BuildingKind> {
    return unlockedKinds(this.objectives);
  }

  /** B: leave build mode, or enter it with the next unlocked kind (shelter, then the decorations). */
  cycleBuildMode(): BuildingKind | null {
    const kinds = BUILDING_KINDS.filter((k) => this.unlocked().has(k));
    const i = this.buildMode ? kinds.indexOf(this.buildMode) : -1;
    this.setBuildMode(i + 1 < kinds.length ? kinds[i + 1] : null);
    return this.buildMode;
  }


  // ─── The prompt ─────────────────────────────────────────────────────────

  /**
   * What E (or another key) would do now, in the order E tries things: collect, the farm, chop, mine, visit. Null
   * when E would only make the Blobbi look around. Build mode has its own label on the preview.
   */
  prompt(): string | null {
    if (this.buildMode || this.placing || this.moving || this.manage) return null;
    if (this.nearestDiscovery()) return 'E  pick up something glinting';
    const node = this.nearestResource();
    if (node) return `E  pick up the ${RESOURCE_SINGULAR[node.kind] ?? node.kind}`;
    const farm = this.farmAction();
    if (farm) {
      const t = this.worldTime;
      switch (farm.kind) {
        case 'harvest':
          return `E  harvest the ${farm.plot.crop!.kind}`;
        case 'water':
          return `E  water the ${farm.plot.crop!.kind}`;
        case 'growing':
          return `${farm.plot.crop!.kind} ${Math.floor(cropProgress(farm.plot.crop!, t) * 100)}%, watered`;
        case 'plant':
          return `E  plant a ${farm.crop} (${this.inventory.count(CROPS[farm.crop].seed)})  T  seed`;
        case 'no-seeds':
          return 'no seeds to plant';
        case 'till':
          return 'E  till the soil';
        case 'cannot-till':
          if (!this.facingObject() && !this.facingBuilding()) return `cannot till: ${PROBLEM_TEXT[farm.check.problem!]}`;
      }
    }
    const f = this.facingObject();
    if (f && f.index < this.world.objects.length) {
      if (f.placement.kind === 'tree' && this.equipped && toolSupports(this.equipped, 'chop') && (this.treeAt(f.index).phase === 'grown' || this.treeAt(f.index).phase === 'chopping')) return 'E  chop';
      if (f.placement.kind === 'rock' && this.equipped && toolSupports(this.equipped, 'mine') && isLargeRock(f.placement.size) && this.rockAt(f.index).phase !== 'rubble') return 'E  mine';
    }
    const building = this.facingBuilding();
    if (building && this.buildingAt(building) >= 1) return `E  ${USE_VERB[BUILDINGS[building.kind].use ?? 'admire'](BUILDINGS[building.kind].label, building)}`;
    if (this.fishing) return this.clock.time >= this.fishing.biteAt ? 'E  reel it in!' : 'wait for a bite...';
    if (this.equipped && toolSupports(this.equipped, 'fish') && this.fishTarget()) return 'E  cast the line';
    if (!this.facingObject() && this.nearCarrier()) return 'carrier' in this.objectives.completed ? 'E  the Carrier' : 'E  listen to the Carrier';
    if (isHungry(this.care) && this.foodToGive()) return 'F  feed Blobbi';
    return null;
  }

  // ─── The house interior ─────────────────────────────────────────────────

  /** The layout of the room the Blobbi is in (level 1 outside, for callers that ask anyway). */
  get roomLayout(): RoomLayout {
    return layoutFor(this.interior?.state.level);
  }

  /** The interior of a shelter, made (and furnished once) on first use. */
  interiorOf(shelter: Building): InteriorState {
    let state = this.interiors.get(shelter.id);
    if (!state) {
      state = newInterior(shelter.id, `${this.world.seed}/${shelter.id}/interior`, houseLevel(shelter));
      this.interiors.set(shelter.id, state);
    }
    return state;
  }

  /** Step inside a finished shelter: the room scene replaces the island's collision, navigation and autonomy. */
  enterInterior(shelter: Building): boolean {
    if (this.inside || shelter.kind !== 'shelter' || this.buildingAt(shelter) < 1) return false;
    const state = this.interiorOf(shelter);
    const b = this.blobbi;
    this.interior = this.makeRoomScene(state);
    b.x = this.roomLayout.spawn.x;
    b.y = this.roomLayout.spawn.y;
    this.blobbi.animator.state.direction = 'up';
    this.swing = null;
    this.buildMode = null;
    this.placing = null;
    this.moving = null;
    this.manage = false;
    this.brain.manual(this.clock.time);
    this.bubble = { text: 'home!', until: this.clock.time + 1.4, x: b.x, y: b.y - b.size - 2, head: b.size };
    b.animator.react('happy', this.clock.time, 0.8, 2);
    this.tally.entered = (this.tally.entered ?? 0) + 1;
    this.sound('door');
    this.save();
    return true;
  }

  /** Back outside, in the shelter's doorway, facing out. */
  exitInterior(): void {
    const scene = this.interior;
    if (!scene) return;
    if (this.moving) this.cancelMove();
    this.restPlan = null;
    this.interior = null;
    this.placing = null;
    this.manage = false;
    const shelter = this.buildings.find((x) => x.id === scene.state.shelterId);
    const b = this.blobbi;
    if (shelter) {
      const door = doorSpot(shelter, b.footRy);
      const spot = this.islandCollision.nearestFree(door.x, door.y, b.footRx, b.footRy) ?? door;
      b.x = spot.x;
      b.y = spot.y;
    }
    b.animator.state.direction = 'down';
    this.brain.manual(this.clock.time);
    this.sound('door');
    this.save();
  }

  private makeRoomScene(state: InteriorState): InteriorScene {
    const layout = layoutFor(state.level);
    const collision = roomCollision(state.furniture, false, layout);
    // Navigation never plans through the door: autonomy stays inside; only the player walks out.
    const nav = new NavGrid(roomCollision(state.furniture, true, layout), this.blobbi.footRx, this.blobbi.footRy);
    const brain = new Brain(`${this.world.seed}/${this.blobbi.seed}/${state.shelterId}`, nav, []);
    brain.enabled = this.islandBrain.enabled;
    brain.wants = () => ({ tired: isTired(this.care), rested: isRested(this.care), shelter: this.bedSpot() });
    brain.extras = () => this.pointsOfInterest();
    return { state, collision, nav, brain, particles: new ParticleSystem(`${this.world.seed}/${state.shelterId}/room`) };
  }

  /** Rebuild the room's collision and navigation after its furniture changed (the brain keeps its state). */
  private rebuildRoom(): void {
    const scene = this.interior;
    if (!scene) return;
    const layout = layoutFor(scene.state.level);
    scene.collision = roomCollision(scene.state.furniture, false, layout);
    const nav = new NavGrid(roomCollision(scene.state.furniture, true, layout), this.blobbi.footRx, this.blobbi.footRy);
    scene.nav.free.set(nav.free);
    this.structureVersion++;
  }

  /** Where the Blobbi lies down to sleep indoors: in front of a bed, or null without one. */
  private bedSpot(): { x: number; y: number } | null {
    const bed = this.roomBeds()[0];
    return bed ? this.bedApproach(bed) : null;
  }

  /** What is placed in the current scene: the island's buildings, or the room's furniture. */
  get placedHere(): Building[] {
    return this.interior ? this.interior.state.furniture : this.buildings;
  }

  /** Place furniture in the room from the bag (the room's own rules: floor, walls, the door kept clear). */
  private placeIndoors(kind: BuildingKind, item: string, variant: number): Building | null {
    const scene = this.interior!;
    const time = this.clock.time;
    const b = this.blobbi;
    const spot = this.placementSpot(kind);
    const check = this.placementCheck(kind, spot);
    if (!check.ok) {
      this.bubble = { text: PROBLEM_TEXT[check.problem!], until: time + 1.6, x: b.x, y: b.y - b.size - 2, head: b.size };
      b.animator.react('sad', time, 0.6, 0);
      return null;
    }
    if (this.inventory.remove(item, 1) !== 1) return null;
    const n = scene.state.furniture.filter((x) => x.kind === kind).reduce((m, x) => Math.max(m, Number(x.id.split(':').pop()) + 1 || 0), 0);
    const record: Building = { id: `${kind}:${n}`, kind, x: spot.x, y: spot.y, placedAt: this.worldTime, seed: `${this.world.seed}/${scene.state.shelterId}/${kind}/${n}` };
    if (variant) record.variant = variant;
    scene.state.furniture.push(record);
    this.rebuildRoom();
    this.tally.furnished = (this.tally.furnished ?? 0) + 1;
    for (let i = 0; i < 5; i++) this.particles.sparkle(spot.x + this.particles.rng.range(-4, 4), spot.y - this.particles.rng.range(0, 8), hex('#fff2b0'));
    this.bubble = { text: `placed a ${BUILDINGS[kind].label}`, until: time + 1.6, x: b.x, y: b.y - b.size - 2, head: b.size };
    b.animator.react('excited', time, 0.9, 2);
    this.sound('place');
    this.save();
    return record;
  }

  // ─── Managing what was built: select, move, remove, restyle ─────────────

  /** What is being moved (picked up, previewed at the new spot), or null. */
  moving: { record: Building; from: { x: number; y: number }; inside: boolean } | null = null;

  /** The placed object management mode acts on: the one in front of the Blobbi. */
  selectedPlaced(): Building | null {
    if (this.moving) return null;
    return this.facingPlaced(14);
  }

  /** The placed object (building, decoration or room furniture) in front of the Blobbi. */
  facingPlaced(radius = 10): Building | null {
    const b = this.blobbi;
    const dir = b.animator.state.direction;
    const fx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const fy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    let best: { r: Building; d: number } | null = null;
    for (const r of this.placedHere) {
      const def = BUILDINGS[r.kind];
      let dx: number;
      let dy: number;
      if (this.inside && isWallKind(r.kind)) {
        // Wall items: right above the Blobbi when it faces the back wall.
        if (dir !== 'up' || b.y > 44) continue;
        dx = Math.max(0, Math.abs(r.x - b.x) - def.footRx);
        dy = 0;
      } else {
        dx = Math.max(0, Math.abs(r.x - b.x) - def.footRx);
        dy = Math.max(0, Math.abs(r.y - b.y) - def.footRy);
      }
      // Things you walk over (rugs, paths) only answer when nothing that stands is in front.
      const d = Math.hypot(dx, dy) + (BUILDINGS[r.kind].layer === 'floor' ? 8 : 0);
      if (d > radius + (BUILDINGS[r.kind].layer === 'floor' ? 8 : 0)) continue;
      const dot = (r.x - b.x) * fx + (r.y - b.y) * fy;
      if (!(this.inside && isWallKind(r.kind)) && dot < -2 && d > 4) continue;
      if (!best || d < best.d) best = { r, d };
    }
    return best?.r ?? null;
  }

  /** M: enter or leave management mode. */
  toggleManage(): boolean {
    if (this.denied('build')) return false;
    if (this.moving) this.cancelMove();
    this.manage = !this.manage;
    this.buildMode = null;
    this.placing = null;
    this.brain.manual(this.clock.time);
    return this.manage;
  }

  /** Why the selected object cannot be picked up into the bag, or null when it can. */
  removalProblem(r: Building): string | null {
    const def = BUILDINGS[r.kind];
    if (!def.item) return 'a home stays. move it instead';
    if (def.capacity && !this.containerEmpty(this.containerKey(r))) return 'empty it first';
    if (this.inventory.count(def.item) + 1 > this.inventory.limit(def.item)) return 'no room in the bag';
    return null;
  }

  /** X in management mode: pick the object up into the bag (refused, with the reason, when that would lose anything). */
  removeSelected(): boolean {
    if (this.denied('build')) return false;
    const r = this.selectedPlaced();
    const time = this.clock.time;
    const b = this.blobbi;
    const say = (text: string) => (this.bubble = { text, until: time + 1.8, x: b.x, y: b.y - b.size - 2, head: b.size });
    if (!r) {
      // An empty farm plot can be filled in.
      const plot = !this.inside ? this.plotAt(this.targetCell()) : null;
      if (plot && !plot.crop) {
        this.plots.splice(this.plots.indexOf(plot), 1);
        this.plotByCell.delete(cellKey(plot));
        say('plot filled in');
        this.save();
        return true;
      }
      if (plot) say('harvest it first');
      return false;
    }
    const problem = this.removalProblem(r);
    if (problem) {
      say(problem);
      b.animator.react('sad', time, 0.5, 0);
      return false;
    }
    const def = BUILDINGS[r.kind];
    this.inventory.add(def.item!, 1);
    const list = this.placedHere;
    list.splice(list.indexOf(r), 1);
    this.containers.delete(this.containerKey(r));
    this.producers.delete(this.containerKey(r));
    this.afterStructureChange();
    say(`${def.label} back in the bag`);
    this.sound('pickup');
    this.save();
    return true;
  }

  /** E in management mode: pick the object up to move it; its preview follows the Blobbi until E puts it down. */
  pickUpToMove(): boolean {
    if (this.denied('build')) return false;
    const r = this.selectedPlaced();
    if (!r) return false;
    const list = this.placedHere;
    list.splice(list.indexOf(r), 1);
    this.moving = { record: r, from: { x: r.x, y: r.y }, inside: this.inside };
    this.afterStructureChange();
    this.brain.manual(this.clock.time);
    return true;
  }

  /** Put the moved object down at the preview spot (same id: a chest keeps its contents, a shelter its interior). */
  placeMoved(): boolean {
    const m = this.moving;
    if (!m) return false;
    const time = this.clock.time;
    const b = this.blobbi;
    const spot = this.placementSpot(m.record.kind);
    const check = this.placementCheck(m.record.kind, spot);
    if (!check.ok) {
      this.bubble = { text: PROBLEM_TEXT[check.problem!], until: time + 1.6, x: b.x, y: b.y - b.size - 2, head: b.size };
      b.animator.react('sad', time, 0.5, 0);
      return false;
    }
    m.record.x = spot.x;
    m.record.y = spot.y;
    if (!m.inside) this.trample(spot.x - footOf(m.record).footRx, spot.y - footOf(m.record).footRy, spot.x + footOf(m.record).footRx, spot.y + footOf(m.record).footRy);
    this.placedHere.push(m.record);
    this.moving = null;
    this.afterStructureChange();
    this.bubble = { text: `moved the ${BUILDINGS[m.record.kind].label}`, until: time + 1.4, x: b.x, y: b.y - b.size - 2, head: b.size };
    this.sound('place');
    this.save();
    return true;
  }

  /** Esc while moving: the object goes back where it was. */
  cancelMove(): void {
    const m = this.moving;
    if (!m) return;
    this.moving = null;
    m.record.x = m.from.x;
    m.record.y = m.from.y;
    (m.inside && this.interior ? this.interior.state.furniture : this.buildings).push(m.record);
    this.afterStructureChange();
  }

  /** T in management mode: the next colourway of the selected object (or, indoors with nothing selected, the room's style). */
  restyleSelected(): boolean {
    if (this.denied('build')) return false;
    const r = this.selectedPlaced();
    if (r) {
      const n = BUILDINGS[r.kind].variants ?? 1;
      if (n <= 1) return false;
      r.variant = ((r.variant ?? 0) + 1) % n;
      if (!r.variant) delete r.variant;
      this.save();
      return true;
    }
    if (this.interior) {
      const st = this.interior.state.style;
      if (st.wall + 1 < 3) st.wall++;
      else {
        st.wall = 0;
        st.floor = (st.floor + 1) % 3;
      }
      this.structureVersion++;
      this.save();
      return true;
    }
    return false;
  }

  /** Collision and navigation after something was placed, moved or removed. */
  private afterStructureChange(): void {
    if (this.interior) {
      this.rebuildRoom();
      return;
    }
    this.islandCollision = CollisionMap.fromWorld(this.world, (p) => this.spriteOf(p));
    for (const t of this.planted) if (t.solid) {
      const sp = this.spriteOf(t.placement, this.growthOf(t));
      this.islandCollision.blockEllipse(t.placement.x, t.placement.y, sp.footRx, Math.max(1, sp.footRy));
    }
    for (const b of this.buildings) this.blockBuilding(b);
    // Rebuild navigation over the new map, keeping the brain (and its state) as it is.
    const nav = new NavGrid(this.islandCollision, this.blobbi.footRx, this.blobbi.footRy);
    (this.islandNav as { collision: CollisionMap }).collision = this.islandCollision;
    this.islandNav.free.set(nav.free);
    this.structureVersion++;
  }

  // ─── Storage: chests and cabinets ───────────────────────────────────────

  /** Container inventories by key (see `containers.ts`). */
  readonly containers = new Map<string, Container>();

  /** A placed record's container key in the scene it stands in. */
  containerKey(r: Building, inside = this.inside): string {
    return inside && this.interior ? `room/${this.interior.state.shelterId}/${r.id}` : `island/${r.id}`;
  }

  /** The container of a storage record (made empty on first use). */
  containerFor(r: Building): Container | null {
    const cap = BUILDINGS[r.kind].capacity;
    if (!cap) return null;
    const key = this.containerKey(r);
    let c = this.containers.get(key);
    if (!c) {
      c = newContainer(key, cap);
      this.containers.set(key, c);
    }
    return c;
  }

  containerEmpty(key: string): boolean {
    const c = this.containers.get(key);
    return !c || c.inventory.total() === 0;
  }

  /** Move items between the bag and a container (`toChest` true puts them in). Returns how many moved. */
  moveItems(r: Building, item: string, quantity: number, toChest: boolean): number {
    if (this.denied('inventory')) return 0;
    const c = this.containerFor(r);
    if (!c) return 0;
    const n = toChest ? transfer(this.inventory, c.inventory, item, quantity, c.capacity) : transfer(c.inventory, this.inventory, item, quantity);
    if (n > 0) {
      if (toChest) this.tally.stored += n;
      this.sound(toChest ? 'store' : 'take');
      this.save();
    }
    return n;
  }

  // ─── Producers: things that make something over world time ─────────────

  /** World time each producer (a herb planter) was last emptied. */
  readonly producers = new Map<string, number>();

  /** Herbs ready in a planter now (one per HERB_SECONDS of world time, up to HERB_MAX). */
  herbsReady(r: Building): number {
    const since = this.worldTime - (this.producers.get(this.containerKey(r)) ?? r.placedAt);
    return Math.max(0, Math.min(HERB_MAX, Math.floor(since / HERB_SECONDS)));
  }

  // ─── Essential paths ────────────────────────────────────────────────────

  private reachCache = new Map<string, boolean>();

  /**
   * Would a solid footprint cut the Blobbi off from somewhere it can reach now: a shelter's doorway, the front of
   * a storage or a workstation, the island's hub, or (indoors) the door and the bed? Checked on the navigation
   * grid with the footprint's cells closed.
   */
  cutsOffPath(rect: { x0: number; y0: number; x1: number; y1: number }): boolean {
    const nav = this.interior ? this.interior.nav : this.islandNav;
    const b = this.blobbi;
    const start = nav.nearestFree(b.x, b.y, 3);
    if (!start) return false;
    const key = `${this.inside}|${this.structureVersion}|${rect.x0},${rect.y0},${rect.x1},${rect.y1}|${start.c},${start.r}`;
    const hit = this.reachCache.get(key);
    if (hit !== undefined) return hit;
    const points: { x: number; y: number }[] = [];
    if (this.interior) {
      points.push({ x: this.roomLayout.spawn.x, y: this.roomLayout.spawn.y - 2 });
      for (const room of this.roomLayout.rooms) points.push(room.anchor);
      const bed = this.bedSpot();
      if (bed) points.push(bed);
    } else {
      points.push(this.world.hubs[0] ?? { x: this.world.islands[0].cx, y: this.world.islands[0].cy });
      for (const s of this.buildings) if (s.kind === 'shelter') points.push(doorSpot(s, b.footRy));
    }
    for (const r of this.placedHere) {
      const use = BUILDINGS[r.kind].use;
      if (use === 'storage' || use === 'cook' || use === 'craft') points.push({ x: r.x, y: r.y + BUILDINGS[r.kind].footRy + b.footRy + 3 });
    }
    const pad = { x: b.footRx + 1, y: b.footRy + 1 };
    const closed = (c: number, r: number) => {
      const p = nav.centre(c, r);
      return p.x >= rect.x0 - pad.x && p.x <= rect.x1 + pad.x && p.y >= rect.y0 - pad.y && p.y <= rect.y1 + pad.y;
    };
    const flood = (withRect: boolean) => {
      const seen = new Uint8Array(nav.cols * nav.rows);
      const queue = [start.r * nav.cols + start.c];
      seen[queue[0]] = 1;
      while (queue.length) {
        const k = queue.pop()!;
        const c = k % nav.cols;
        const r = (k / nav.cols) | 0;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc;
          const nr = r + dr;
          if (!nav.isFree(nc, nr)) continue;
          const nk = nr * nav.cols + nc;
          if (seen[nk] || (withRect && closed(nc, nr))) continue;
          seen[nk] = 1;
          queue.push(nk);
        }
      }
      return seen;
    };
    const before = flood(false);
    const after = flood(true);
    let cut = false;
    for (const p of points) {
      const cell = nav.nearestFree(p.x, p.y, 3);
      if (!cell) continue;
      const k = cell.r * nav.cols + cell.c;
      if (before[k] && !after[k] && !closed(cell.c, cell.r)) cut = true;
    }
    if (this.reachCache.size > 200) this.reachCache.clear();
    this.reachCache.set(key, cut);
    return cut;
  }

  // ─── Building: the player's action only ─────────────────────────────────

  /** Enter or leave build mode for a kind (null leaves). */
  setBuildMode(kind: BuildingKind | null): void {
    if (kind && this.denied('build')) return;
    // Decorations wait for the objective that unlocks them.
    this.buildMode = kind && this.unlocked().has(kind) ? kind : null;
    if (this.buildMode) {
      if (this.moving) this.cancelMove();
      this.placing = null;
      this.manage = false;
    }
    this.brain.manual(this.clock.time);
  }

  /** Where a building would go: in front of the Blobbi, snapped to two pixels, in canvas coordinates. */
  placementSpot(kind: BuildingKind = this.previewKind ?? 'shelter'): { x: number; y: number } {
    const b = this.blobbi;
    // Indoors, wall items hang on the back wall above the Blobbi.
    if (this.inside && isWallKind(kind)) return { x: Math.round(b.x / 2) * 2, y: this.roomLayout.wallAnchorY };
    const def = BUILDINGS[kind];
    const dir = b.animator.state.direction;
    const dx = dir === 'left' ? -(def.footRx + b.footRx + 4) : dir === 'right' ? def.footRx + b.footRx + 4 : 0;
    const dy = dir === 'up' ? -(def.footRy + b.footRy + 6) : dir === 'down' ? def.footRy + b.footRy + 6 : 0;
    return { x: Math.round((b.x + dx) / 2) * 2, y: Math.round((b.y + dy) / 2) * 2 };
  }

  /** The placement check for the current spot (or a given one). */
  placementCheck(kind: BuildingKind = this.previewKind ?? 'shelter', spot = this.placementSpot(kind), level?: number): PlacementCheck {
    const check = this.inside ? checkInterior(kind, spot.x, spot.y, this.interior!.state.furniture, this.blobbi, this.moving?.record, this.roomLayout) : this.islandPlacementCheck(kind, spot, level);
    // Solid things must never cut the way to a door, a chest or a workstation.
    if (check.ok && BUILDINGS[kind].layer === 'solid' && this.cutsOffPath(this.inside ? roomRect({ kind, ...spot }, this.roomLayout) : { x0: check.x0, y0: check.y0, x1: check.x1, y1: check.y1 })) return { ...check, ok: false, problem: 'path' };
    return check;
  }

  private islandPlacementCheck(kind: BuildingKind, spot: { x: number; y: number }, level?: number): PlacementCheck {
    const def = BUILDINGS[kind];
    if (def.where === 'indoor') return { ok: false, problem: 'outdoor', x0: spot.x - def.footRx, y0: spot.y - def.footRy, x1: spot.x + def.footRx, y1: spot.y + def.footRy };
    // A house being moved keeps its level's footprint.
    return checkPlacement(kind, spot.x, spot.y, this.placementContext(), kind === 'shelter' ? (level ?? this.moving?.record.level) : undefined);
  }

  // ─── House upgrades (M8) ────────────────────────────────────────────────

  /** The player's home: the first shelter placed (the one the quests and upgrades are about), or null. */
  home(): Building | null {
    return this.buildings.find((b) => b.kind === 'shelter') ?? null;
  }

  /**
   * What upgrading the home to its next level needs, and whether it can happen now. Every requirement is listed with
   * whether it is met, so the HOME screen can show the way. Nothing changes here.
   */
  houseUpgrade(): HouseUpgradeCheck {
    const house = this.home();
    const level = house ? houseLevel(house) : 1;
    const next = level < MAX_HOUSE_LEVEL ? houseLevelInfo(level + 1) : null;
    const out: HouseUpgradeCheck = { house, level, next, requirements: [], ready: false, blocked: null, displaced: 0 };
    if (!house || !next) return out;
    const req = (label: string, met: boolean, have?: number, need?: number) => out.requirements.push({ label, met, ...(need !== undefined ? { have, need } : {}) });
    const quest = next.quest ? objectiveById(next.quest) : undefined;
    for (const id of quest?.requires ?? []) req(`${objectiveById(id)?.title ?? id} (quest)`, id in this.objectives.completed);
    if (next.harmony) req('Island harmony', this.harmony().value >= next.harmony, Math.round(this.harmony().value), next.harmony);
    if (next.finds) req('Discoveries found', this.found.size >= next.finds, this.found.size, next.finds);
    for (const c of next.cost) req(itemPlural(c.item), this.inventory.count(c.item) >= c.quantity, this.inventory.count(c.item), c.quantity);
    const met = out.requirements.every((r) => r.met);
    if (this.buildingAt(house) < 1) out.blocked = 'the house is still being built';
    else if (this.inside) out.blocked = 'step outside first: the builders need the house empty';
    else if (this.visitor) out.blocked = 'only the island\'s own player can rebuild its house';
    else {
      const fit = this.upgradeFit(house, next.level);
      if (!fit.ok) out.blocked = fit.reason;
      else {
        const plan = this.upgradeRooms(house, next.level);
        out.displaced = plan?.displaced.length ?? 0;
        if (plan && !plan.bagOk) out.blocked = 'the bag has no room for furniture the new rooms cannot hold';
      }
    }
    out.ready = met && !out.blocked;
    return out;
  }

  /**
   * Does the bigger house fit where the house stands? Its neighbours keep their gaps, and the new ground (and the
   * ground before its door) must be walkable, on the house's level and free of other things; a path or a meadow
   * under it is fine (an upgrade grows over its own garden), loose sticks and stones are cleared away.
   */
  private upgradeFit(house: Building, level: number): { ok: boolean; reason: string | null } {
    const next = { ...house, level };
    const foot = footOf(next);
    const no = (why: string) => ({ ok: false, reason: `the bigger house does not fit here: ${why} (move it, or clear around it)` });
    for (const b of this.buildings) {
      if (b === house) continue;
      const d = footOf(b);
      const gap = Math.max(BUILDINGS.shelter.gap, BUILDINGS[b.kind].gap);
      if (Math.abs(b.x - house.x) < foot.footRx + d.footRx + gap && Math.abs(b.y - house.y) < foot.footRy + d.footRy + gap) return no(`too close to the ${BUILDINGS[b.kind].label}`);
    }
    const rect = footprintRect(next);
    for (const p of this.plots) {
      const o = this.origin;
      const x0 = p.gx * PLOT_GRID + o.x;
      const y0 = p.gy * PLOT_GRID + o.y;
      if (x0 <= rect.x1 + 2 && x0 + PLOT_GRID - 1 >= rect.x0 - 2 && y0 <= rect.y1 + 2 && y0 + PLOT_GRID - 1 >= rect.y0 - 2) return no('a farm plot is there');
    }
    const { width, height, cls, elevation } = this.world.terrain;
    const level0 = elevation[Math.round(house.y) * width + Math.round(house.x)];
    const map = (this.baseCollisionForUpgrade ??= CollisionMap.fromWorld(this.world, (p) => this.spriteOf(p)));
    const door = doorwayRect(next)!;
    for (const r of [{ x0: rect.x0 - 1, y0: rect.y0 - 1, x1: rect.x1 + 1, y1: rect.y1 + 1 }, door])
      for (let y = r.y0; y <= r.y1; y++)
        for (let x = r.x0; x <= r.x1; x++) {
          if (x < 0 || y < 0 || x >= width || y >= height) return no(PROBLEM_TEXT.edge);
          const i = y * width + x;
          if (!WALKABLE.has(cls[i]) || cls[i] === T.RIM || cls[i] === T.SKIN) return no(PROBLEM_TEXT.ground);
          if (elevation[i] !== level0) return no('the ground is not level');
          if (map.blocked[i]) {
            const what = this.world.objects.find((o) => SOLID_KINDS.has(o.kind) && Math.abs(o.x - x) <= this.spriteOf(o).footRx + 1 && Math.abs(o.y - y) <= this.spriteOf(o).footRy + 1);
            return no(what ? `a ${what.kind === 'decor' ? 'stone or stump' : what.kind} is in the way` : 'the ground there is not clear (water, a slope or a tree)');
          }
        }
    return { ok: true, reason: null };
  }
  private baseCollisionForUpgrade: CollisionMap | null = null;

  /** The new rooms for an upgrade: where each piece goes, what has no place, and whether the bag can take that. */
  private upgradeRooms(house: Building, level: number): { placed: Building[]; displaced: Building[]; bagOk: boolean } | null {
    const st = this.interiors.get(house.id);
    if (!st) return null; // never entered: the rooms are furnished when first entered, at the new level
    const hasItems = (f: Building) => (this.containers.get(`room/${house.id}/${f.id}`)?.inventory.total() ?? 0) > 0;
    const r = relocateFurniture(st.furniture, layoutFor(st.level), layoutFor(level), this.blobbi, hasItems);
    // A piece that holds things never goes to the bag; any other must fit there.
    const counts = new Map<string, number>();
    let bagOk = r.displaced.every((f) => !hasItems(f) && !!BUILDINGS[f.kind].item);
    for (const f of r.displaced) counts.set(BUILDINGS[f.kind].item ?? '', (counts.get(BUILDINGS[f.kind].item ?? '') ?? 0) + 1);
    for (const [item, n] of counts) if (item && this.inventory.count(item) + n > this.inventory.limit(item)) bagOk = false;
    return { ...r, bagOk };
  }

  /**
   * Upgrade the home (after the player confirmed): pay from the bag, raise the new level over its construction time,
   * move the furniture into the new rooms (anything without a place goes back into the bag, never lost), add the new
   * rooms' gift, and save. Returns why not when it cannot happen; nothing changes then.
   */
  upgradeHouse(): { ok: boolean; reason: string | null } {
    if (this.denied('build')) return { ok: false, reason: 'not on this island' };
    const check = this.houseUpgrade();
    if (!check.house || !check.next) return { ok: false, reason: check.house ? 'the house is as grand as it gets' : 'build a shelter first' };
    if (!check.ready) return { ok: false, reason: check.blocked ?? `still needed: ${check.requirements.filter((r) => !r.met).map((r) => r.label.toLowerCase()).join(', ')}` };
    const house = check.house;
    const next = check.next;
    const plan = this.upgradeRooms(house, next.level);
    if (!consumeIngredients(this.inventory, next.cost)) return { ok: false, reason: 'the bag is short' };
    house.level = next.level;
    house.upgradedAt = this.worldTime;
    this.completed.delete(house.id);
    const st = this.interiors.get(house.id);
    if (st && plan) {
      st.furniture = plan.placed;
      st.level = next.level;
      for (const f of plan.displaced) this.inventory.add(BUILDINGS[f.kind].item!, 1);
    }
    let gift = '';
    if (next.gift && BUILDINGS[next.gift]) {
      const giftItem = BUILDINGS[next.gift].item!;
      const placed = st ? this.placeGift(st, next.gift) : false;
      if (placed) gift = `, and a ${BUILDINGS[next.gift].label} in the new rooms`;
      else if (this.inventory.add(giftItem, 1) === 1) gift = `, and a ${BUILDINGS[next.gift].label} (in the bag)`;
    }
    this.baseCollisionForUpgrade = null;
    this.afterStructureChange();
    this.trample(house.x - footOf(house).footRx, house.y - footOf(house).footRy, house.x + footOf(house).footRx, house.y + footOf(house).footRy, true);
    // The Blobbi steps out of the new walls if it stood where they rise.
    const b = this.blobbi;
    if (!this.islandCollision.canStand(b.x, b.y, b.footRx, b.footRy)) {
      const spot = this.islandCollision.nearestFree(doorSpot(house, b.footRy).x, doorSpot(house, b.footRy).y, b.footRx, b.footRy);
      if (spot) Object.assign(b, { x: spot.x, y: spot.y });
    }
    this.tally.built++;
    this.stats.built++;
    this.sound('place');
    this.notices.push({ heading: 'Home', title: `Building the ${next.name}`, text: `the builders are at work${gift}`, until: Math.max(this.clock.time, this.notices.at(-1)?.until ?? 0) + 3.5 });
    b.animator.react('excited', this.clock.time, 1.2, 3);
    this.save();
    return { ok: true, reason: null };
  }

  // ─── Home customisation (M8) ──────────────────────────────────────────

  /** What the player has earned so far, for the style unlocks (`content/home-styles.ts`). */
  styleContext(): UnlockContext {
    const house = this.home();
    return { completed: this.objectives.completed, found: this.found.size, tally: this.tally, growthStage: this.growth.stage, houseLevel: house ? houseLevel(house) : 1 };
  }

  /** Apply a look to the home (every part must be unlocked); false (and nothing changes) otherwise. */
  setHouseLook(look: HouseLook): { ok: boolean; reason: string | null } {
    if (this.denied('build')) return { ok: false, reason: 'not on this island' };
    const house = this.home();
    if (!house) return { ok: false, reason: 'build a shelter first' };
    const ctx = this.styleContext();
    const next: HouseLook = {};
    for (const part of ['roof', 'wall', 'door', 'window'] as const) {
      const v = look[part];
      if (v === undefined) continue;
      if (!optionUnlocked(part, v, ctx)) return { ok: false, reason: `that ${part} is not unlocked yet` };
      next[part] = v;
    }
    house.look = next;
    this.structureVersion++;
    this.sound('place');
    this.save();
    return { ok: true, reason: null };
  }

  /** Apply a room style to the home's interior (floor, wall colour, finish; each must be unlocked). */
  setRoomStyle(style: { floor: number; wall: number; finish?: number }): { ok: boolean; reason: string | null } {
    if (this.denied('build')) return { ok: false, reason: 'not on this island' };
    const house = this.home();
    if (!house) return { ok: false, reason: 'build a shelter first' };
    const ctx = this.styleContext();
    if (!optionUnlocked('floor', style.floor, ctx) || !optionUnlocked('wallColour', style.wall, ctx) || !optionUnlocked('finish', style.finish ?? 0, ctx)) return { ok: false, reason: 'that style is not unlocked yet' };
    const st = this.interiorOf(house);
    st.style = { floor: style.floor, wall: style.wall, ...(style.finish ? { finish: style.finish } : {}) };
    this.structureVersion++;
    this.sound('place');
    this.save();
    return { ok: true, reason: null };
  }

  /** Put an upgrade's gift in its preferred room (no possession is ever moved for it). */
  private placeGift(st: InteriorState, kind: BuildingKind): boolean {
    const n = st.furniture.filter((f) => f.kind === kind).reduce((m, f) => Math.max(m, Number(f.id.split(':').pop()) + 1 || 0), 0);
    const gift: Building = { id: `${kind}:${n}`, kind, x: -1, y: -1, placedAt: this.worldTime, seed: `${this.world.seed}/${st.shelterId}/${kind}/${n}` };
    const r = relocateFurniture([...st.furniture, gift], layoutFor(st.level), layoutFor(st.level), this.blobbi, (f) => f !== gift);
    const placed = r.placed.find((f) => f.id === gift.id);
    if (!placed || r.displaced.length || r.placed.some((f) => { const o = st.furniture.find((x) => x.id === f.id); return o && (o.x !== f.x || o.y !== f.y); })) return false;
    st.furniture.push(placed);
    return true;
  }

  /** Can the bag pay for a building? */
  canAfford(kind: BuildingKind): boolean {
    return BUILDINGS[kind].cost.every((c) => this.inventory.count(c.item) >= c.quantity);
  }

  /**
   * Place the building of the current build mode at the preview spot: the cost leaves the bag atomically, the
   * footprint blocks, construction starts. False (with a bubble) when the spot is invalid or the bag is short.
   */
  placeBuilding(): Building | null {
    if (this.denied('build')) return null;
    const kind = this.buildMode;
    if (!kind || !this.unlocked().has(kind)) return null;
    const def = BUILDINGS[kind];
    // A matching item in the bag is placed first; otherwise the materials pay for it, as always.
    const fromBag = !!def.item && this.inventory.count(def.item) > 0;
    const placed = this.commitPlacement(kind, fromBag ? { item: def.item! } : { cost: def.cost });
    if (placed) this.buildMode = null;
    return placed;
  }

  /**
   * Place a kind at the preview spot, paid by one bag item or by materials, atomically: nothing is taken unless the
   * spot is valid and the payment complete. The new record's id and seed are unique for good (max + 1).
   */
  private commitPlacement(kind: BuildingKind, pay: { item: string } | { cost: readonly { item: string; quantity: number }[] }, variant = 0): Building | null {
    const time = this.clock.time;
    const b = this.blobbi;
    const def = BUILDINGS[kind];
    const spot = this.placementSpot(kind);
    const check = this.placementCheck(kind, spot);
    const say = (text: string) => (this.bubble = { text, until: time + 1.8, x: b.x, y: b.y - b.size - 2, head: b.size });
    if (!check.ok) {
      say(PROBLEM_TEXT[check.problem!]);
      b.animator.react('sad', time, 0.6, 0);
      return null;
    }
    if ('item' in pay) {
      if (this.inventory.remove(pay.item, 1) !== 1) return null;
    } else if (!consumeIngredients(this.inventory, pay.cost)) {
      say(pay.cost.filter((c) => this.inventory.count(c.item) < c.quantity).map((c) => `need ${c.quantity - this.inventory.count(c.item)} ${itemLabel(c.item)}`).join(', '));
      b.animator.react('sad', time, 0.6, 0);
      return null;
    }
    const n = this.buildings.filter((x) => x.kind === kind).reduce((m, x) => Math.max(m, Number(x.id.split(':').pop()) + 1 || 0), 0);
    const building: Building = { id: `${kind}:${n}`, kind, x: spot.x, y: spot.y, placedAt: this.worldTime, seed: `${this.world.seed}/${kind}/${n}` };
    if (variant) building.variant = variant;
    this.addBuilding(building);
    this.stats.built++;
    this.tally.built++;
    if (isDecoration(kind)) this.tally.decorations++;
    const palette = paletteFor(this.world.options.palette);
    for (let i = 0; i < 6; i++) this.particles.dust(spot.x + this.particles.rng.range(-def.footRx, def.footRx), spot.y + this.particles.rng.range(-2, 2), i % 2 ? palette.wood.light : palette.path.dark);
    say(def.category === 'building' ? `building a ${def.label}` : `placed a ${def.label}`);
    b.animator.react('excited', time, 1, 2);
    this.sound('place');
    this.save();
    return building;
  }

  /** Wild forage under a new footprint is gone (not collected); it grows back only once the spot is free again. */
  private trample(x0: number, y0: number, x1: number, y1: number, all = false): void {
    let changed = false;
    for (const n of this.resources) {
      if ((!all && (BASIC_KINDS as readonly string[]).includes(n.kind)) || n.x < x0 - 1 || n.x > x1 + 1 || n.y < y0 - 1 || n.y > y1 + 1) continue;
      this.collected.add(n.id);
      this.collectedAt.set(n.id, this.worldTime);
      changed = true;
    }
    if (changed) this.resources = this.allResources.filter((n) => !this.collected.has(n.id));
  }

  /** Add a record to the island: blocks collision (when solid) and updates navigation around it. */
  private addBuilding(building: Building): void {
    const def = footOf(building);
    this.trample(building.x - def.footRx, building.y - def.footRy, building.x + def.footRx, building.y + def.footRy);
    this.buildings.push(building);
    this.blockBuilding(building);
    this.nav.rebuild(building.x - def.footRx - 20, building.y - def.footRy - 16, building.x + def.footRx + 20, building.y + def.footRy + 16);
    this.structureVersion++;
  }

  // ─── Placing furniture from the bag ─────────────────────────────────────

  /** Start placing a furniture item from the bag: a preview in front of the Blobbi; E places, Esc stops. */
  startPlacing(item: string): boolean {
    if (this.denied('build')) return false;
    const kind = kindForItem(item);
    const time = this.clock.time;
    const b = this.blobbi;
    if (!kind || this.inventory.count(item) === 0) return false;
    const def = BUILDINGS[kind];
    const here = this.inside ? 'indoor' : 'outdoor';
    if (def.where !== 'both' && def.where !== here) {
      this.bubble = { text: def.where === 'indoor' ? 'that goes inside the house' : 'that goes outside', until: time + 1.8, x: b.x, y: b.y - b.size - 2, head: b.size };
      return false;
    }
    this.placing = item;
    this.placingVariant = 0;
    this.buildMode = null;
    this.manage = false;
    this.brain.manual(time);
    return true;
  }

  /** The style a placement will have (T cycles it while placing). */
  placingVariant = 0;

  cycleVariant(): number {
    const kind = this.placing ? kindForItem(this.placing) : null;
    const n = kind ? BUILDINGS[kind].variants ?? 1 : 1;
    this.placingVariant = (this.placingVariant + 1) % n;
    return this.placingVariant;
  }

  stopPlacing(): void {
    this.placing = null;
  }

  /** E while placing: put one down; keep placing while the bag holds more (paths, fences). */
  placeFromBag(): Building | null {
    if (this.denied('build')) return null;
    const item = this.placing;
    const kind = item ? kindForItem(item) : null;
    if (!item || !kind) return null;
    const placed = this.inside ? this.placeIndoors(kind, item, this.placingVariant) : this.commitPlacement(kind, { item }, this.placingVariant);
    if (placed && this.inventory.count(item) === 0) this.placing = null;
    return placed;
  }

  /** The kind being previewed now (build mode, placing, or moving), or null. */
  get previewKind(): BuildingKind | null {
    if (this.moving) return this.moving.record.kind;
    if (this.placing) return kindForItem(this.placing);
    return this.buildMode;
  }

  /** Bumped whenever something is placed, moved or removed (caches of reachability read it). */
  structureVersion = 0;

  /** Sound hooks: names of events an audio layer could play (consumed by whoever listens). */
  readonly sounds: string[] = [];
  sound(name: string): void {
    if (this.sounds.length < 32) this.sounds.push(name);
  }

  private blockBuilding(b: Building): void {
    if (BUILDINGS[b.kind].layer !== 'solid') return; // rugs, paths and arches are walked over or under
    const foot = footOf(b);
    this.islandCollision.blockEllipse(b.x, b.y, foot.footRx, foot.footRy, true);
  }

  /** What the Blobbi walks on, for footsteps: wood indoors, else the island's ground. */
  surfaceUnder(): 'wood' | 'grass' | 'sand' | 'path' | 'shallow' {
    if (this.interior) return 'wood';
    const { width, height, cls } = this.world.terrain;
    const x = Math.round(this.blobbi.x);
    const y = Math.round(this.blobbi.y);
    if (x < 0 || y < 0 || x >= width || y >= height) return 'grass';
    const c = cls[y * width + x];
    if (c === T.PATH) return 'path';
    if (c === T.SAND || c === T.SAND_WET) return 'sand';
    if (c === T.SHALLOW || c === T.FOAM || c === T.POND) return 'shallow';
    return this.plotByCell.size && this.plotAt(cellAt(this.blobbi.x, this.blobbi.y, this.origin)) ? 'path' : 'grass';
  }

  // ─── Visitor permissions (M7) ────────────────────────────────────────────

  /** Refuse a lasting change a visitor may not make (a gentle word, never an error). True when refused. */
  private denied(what: keyof VisitorPermissions): boolean {
    if (this.permissions[what]) return false;
    const b = this.blobbi;
    this.bubble = { text: 'visiting: look, but don\'t touch', until: this.clock.time + 1.6, x: b.x, y: b.y - b.size - 2, head: b.size };
    this.sound('fail');
    return true;
  }

  // ─── Island growth (M7) ─────────────────────────────────────────────────

  /** Progress toward the island's next growth stage (never goes backwards; see game/growth-progress.ts). */
  growthReadiness(): GrowthReadiness {
    return growthReadiness({ stage: this.growth.stage, harmony: this.harmony().value, tally: this.tally, completed: this.objectives.completed, found: this.found.size, days: dayAt(this.worldTime), possible: canGrow(this.baseWorld) && !this.growthError });
  }

  /**
   * Let the island grow to its next stage, when it is ready (the player's choice, at the Carrier). The stage is
   * saved at once; the grown world takes effect when the world is rebuilt from the save (`regrow` in the playground,
   * a new LiveWorld in tests), exactly as a reload would. Returns the new stage, or null when not ready.
   */
  growIsland(force = false): number | null {
    if (this.denied('build')) return null;
    const r = this.growthReadiness();
    if (!r.next || (!r.ready && !force) || r.blocked) return null;
    this.growth = { stage: r.next, version: GROWTH_VERSION, history: [...this.growth.history, { stage: r.next, worldTime: this.worldTime, version: GROWTH_VERSION }], regions: this.growth.regions };
    this.sound('grow');
    this.save();
    return r.next;
  }

  /** The stage whose readiness was announced (not saved: a reload may announce it again, kindly). */
  private announcedStage = -1;

  /** When the island becomes ready to grow, the Carrier stirs: a notice (checked every few seconds). */
  private stepGrowthNotice(time: number): void {
    if (this.announcedStage === this.growth.stage || Math.floor(time * 60) % 180 !== 0 || this.reveal) return;
    const r = this.growthReadiness();
    if (!r.ready) return;
    this.announcedStage = this.growth.stage;
    this.notices.push({ heading: 'The Carrier stirs', title: 'The island is ready to grow', text: 'open growth (L) or visit the Carrier', until: (this.notices.at(-1)?.until ?? time) + 5 });
    this.turtleAnim.blinkUntil = time + 0.3;
    this.sound('curious');
  }

  /** Development only (test worlds): set the stage directly, without requirements. Saved. */
  devSetGrowthStage(stage: number): void {
    const s = Math.max(0, Math.min(MAX_GROWTH_STAGE, Math.floor(stage)));
    this.growth = { stage: s, version: GROWTH_VERSION, history: s ? [...this.growth.history, { stage: s, worldTime: this.worldTime, version: GROWTH_VERSION }] : [], regions: [] };
    this.save();
  }

  /**
   * The growth reveal: just after the world was rebuilt at a new stage, the new land spreads out from the old coast
   * over a few seconds (presentation only; the land is already there for the simulation). `fromStage` is the stage
   * the player last saw (one below by default; lower after a jump of several stages, so all of it is revealed).
   */
  reveal: { start: number; duration: number; stage: number; fromStage: number; order: Float32Array; pixels: Int32Array; from: number; to: number } | null = null;

  /** Start the reveal of the land grown since `fromStage` (the playground calls it after a growth). */
  startReveal(duration = 4.5, fromStage?: number): void {
    const g = this.world.growth;
    if (!g || g.stage < 1) return;
    const before = Math.max(0, Math.min(g.stage - 1, fromStage ?? g.stage - 1));
    const isNew = (b: number) => b > before && b <= g.stage;
    const { width, height } = this.world.terrain;
    // Multi-source flood from the land that was there before: the order the new land appears in.
    const born = g.bornAt;
    const order = new Float32Array(width * height).fill(-1);
    const pixels: number[] = [];
    const queue: number[] = [];
    const steps = new Int32Array(width * height).fill(-1);
    for (let i = 0; i < born.length; i++) {
      if (!isNew(born[i])) continue;
      pixels.push(i);
      const x = i % width;
      const y = (i / width) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const j = yy * width + xx;
        const c = this.world.terrain.cls[j];
        if (!isNew(born[j]) && WALKABLE.has(c) && steps[i] < 0) {
          steps[i] = 0;
          queue.push(i);
        }
      }
    }
    let max = 1;
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      const x = i % width;
      const y = (i / width) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const j = yy * width + xx;
        if (isNew(born[j]) && steps[j] < 0) {
          steps[j] = steps[i] + 1;
          max = Math.max(max, steps[j]);
          queue.push(j);
        }
      }
    }
    for (const i of pixels) order[i] = steps[i] < 0 ? 1 : (steps[i] / max) * 0.92 + (((i * 2654435761) >>> 0) % 100) / 1250;
    this.reveal = { start: this.clock.time, duration, stage: g.stage, fromStage: before, order, pixels: Int32Array.from(pixels), from: g.objectsAt[before], to: g.objectsAt[g.stage] };
    // The Carrier feels it: a slow blink and a glance, a happy Blobbi, and a chime.
    this.turtleAnim.blinkUntil = this.clock.time + 0.4;
    this.blobbi.animator.react('excited', this.clock.time, 2, 4);
    this.sound('grow');
  }

  /** After a reveal: the land it revealed, lit and fading out (presentation only; see LiveRenderer). */
  revealGlow: { start: number; duration: number; pixels: Int32Array } | null = null;

  /** 0 (gone) .. 1 (just revealed): how lit the newly grown land still is. */
  revealGlowLevel(time = this.clock.time): number {
    const g = this.revealGlow;
    if (!g) return 0;
    return Math.max(0, 1 - (time - g.start) / g.duration);
  }

  /** 0..1 through the reveal (1 when there is none). */
  revealProgress(time = this.clock.time): number {
    const r = this.reveal;
    if (!r) return 1;
    return Math.max(0, Math.min(1, (time - r.start - 0.6) / r.duration));
  }

  private stepReveal(): void {
    const r = this.reveal;
    if (!r) return;
    const p = this.revealProgress();
    // Sparkles and leaves along the growing front.
    const palette = paletteFor(this.world.options.palette);
    const width = this.world.terrain.width;
    for (let k = 0; k < 6; k++) {
      const i = r.pixels[this.ambient.int(0, r.pixels.length - 1)];
      if (Math.abs(r.order[i] - p) > 0.06) continue;
      const x = i % width;
      const y = (i / width) | 0;
      if (this.ambient.chance(0.5)) this.islandParticles.sparkle(x, y - 2, this.ambient.chance(0.5) ? hex('#ffffff') : hex('#d8ff8a'));
      else this.islandParticles.leaf(x, y - 3, palette.foliage[0].light);
    }
    if (p >= 1) {
      this.reveal = null;
      // The new land stays lit for a moment after it has spread, so it is seen even where it is a thin band.
      this.revealGlow = { start: this.clock.time, duration: REVEAL_GLOW_SECONDS, pixels: r.pixels };
      this.blobbi.animator.react('happy', this.clock.time, 1.4, 3);
      this.notices.push({ heading: 'The island grew', title: this.world.growth ? `Stage ${this.world.growth.stage}` : 'New land', text: 'new land to explore: see the map (N)', until: (this.notices.at(-1)?.until ?? this.clock.time) + 4 });
    }
  }

  // ─── Presence: teleporting away and back ───────────────────────────────

  getPresenceState(): PresenceState {
    return this.teleport.getPresenceState();
  }

  /** Begin teleporting away (when present; during an arrival it turns around). */
  leaveBlobbi(): boolean {
    if (this.teleport.state === 'present') {
      this.swing = null;
      this.fishing = null;
      this.stopPlacing();
      this.buildMode = null;
    }
    return this.teleport.leaveBlobbi(this.clock.time);
  }

  /**
   * Begin arriving (when absent; during a departure it turns around). `at` picks a landing spot in the current
   * scene, moved to the nearest free ground; otherwise the Blobbi returns where it left.
   */
  enterBlobbi(at?: { x: number; y: number }): boolean {
    if (at && this.teleport.state === 'absent') {
      const spot = this.collision.nearestFree(at.x, at.y, this.blobbi.footRx, this.blobbi.footRy);
      if (spot) {
        this.blobbi.x = spot.x;
        this.blobbi.y = spot.y;
      }
    }
    return this.teleport.enterBlobbi(this.clock.time);
  }

  /** Stop a transition: the Blobbi is simply present again. */
  cancelTransition(): PresenceState {
    return this.teleport.cancelTransition();
  }

  /** Reverse a transition mid-way. */
  reverseTransition(): boolean {
    return this.teleport.reverse(this.clock.time);
  }

  /**
   * Where the camera should look: the Blobbi, lifted while the teleport choreography wants the sky in view (by up
   * to a fifth of the view's height, `viewHeight` in world pixels).
   */
  cameraTarget(viewHeight = 120): { x: number; y: number; size: number } {
    return { x: this.blobbi.x, y: this.blobbi.y - this.teleport.cameraLift(this.clock.time) * viewHeight * 0.2, size: this.blobbi.size };
  }

  private stepTeleport(time: number): void {
    for (const e of this.teleport.step(time)) {
      this.sound(`teleport-${e}`);
      if (e === 'arrived') this.blobbi.animator.react('happy', time, 1.6, 3);
      if (e === 'gone' || e === 'cancelled') this.brain.manual(time);
    }
  }

  /** A screen the world asks the UI to open (a chest, the stove, the workbench), consumed by the UI. */
  uiRequest: { screen: 'storage' | 'cooking' | 'crafting' | 'carrier'; target: Building | null } | null = null;

  /** Construction progress of a building now. */
  buildingAt(b: Building): number {
    return buildingProgress(b, this.worldTime);
  }

  /** The building in front of and close to the Blobbi, if any. */
  facingBuilding(radius = 10): Building | null {
    return this.facingPlaced(radius);
  }

  /** Sawdust and the odd sparkle at a site while it is being built; a bubble when it is done. */
  private stepConstruction(dt: number): void {
    if (!this.buildings.length) return;
    this.siteTimer -= dt;
    const palette = paletteFor(this.world.options.palette);
    for (const building of this.buildings) {
      const p = this.buildingAt(building);
      const def = BUILDINGS[building.kind];
      if (p >= 1) {
        if (!this.completed.has(building.id)) {
          this.completed.add(building.id);
          for (let i = 0; i < 5; i++) this.particles.sparkle(building.x + this.particles.rng.range(-def.footRx, def.footRx), building.y - this.particles.rng.range(4, def.category === 'building' ? 18 : 8), hex('#fff2b0'));
          const top = building.y - buildingSprite(building, palette, 1, this.world.options.scale).anchorY;
          this.particles.heart(building.x, top - 2);
          const name = building.kind === 'shelter' && building.upgradedAt !== undefined ? `your ${houseLevelInfo(houseLevel(building)).name}` : def.label;
          this.bubble = { text: `${name} finished!`, until: this.clock.time + 2.2, x: building.x, y: top - 4 };
          if (building.kind === 'shelter' && building.upgradedAt !== undefined && building.upgradedAt > 0) {
            // A grander home: a burst of sparkles over the whole house, and a chime.
            for (let i = 0; i < 18; i++) this.particles.sparkle(building.x + this.particles.rng.range(-footOf(building).footRx - 4, footOf(building).footRx + 4), building.y - this.particles.rng.range(2, 40), hex(i % 3 ? '#fff2b0' : '#ffd0f0'));
            this.sound('quest');
          }
          addHappiness(this.care, JOY.built);
        }
        continue;
      }
      if (this.siteTimer <= 0) {
        const sprite = buildingSprite(building, palette, p, this.world.options.scale);
        const top = building.y - sprite.anchorY;
        this.particles.dust(building.x + this.particles.rng.range(-def.footRx, def.footRx), building.y - this.particles.rng.range(0, Math.max(2, (building.y - top) * p)), this.particles.rng.chance(0.5) ? palette.wood.light : palette.wood.mid);
      }
    }
    if (this.siteTimer <= 0) this.siteTimer = 0.45;
  }

  /** Counts per resource kind, for the HUD. */
  counts(): Record<(typeof BASIC_KINDS)[number], number> {
    return { stick: this.inventory.count(RESOURCE_ITEM.stick), stone: this.inventory.count(RESOURCE_ITEM.stone), seed: this.inventory.count(RESOURCE_ITEM.seed) };
  }

  /** Write the collected set and the inventory to the store, if there is one. */
  save(): void {
    if (!this.store) return;
    const trees: Record<string, TreeSaveState> = {};
    for (const [index, t] of [...this.trees.entries()].sort((a, b) => a[0] - b[0])) if (t.hits > 0 || t.harvestedAt !== null) trees[String(index)] = { hits: t.hits, harvestedAt: t.harvestedAt };
    const origin = this.origin;
    const record = (b: Building, dx = 0, dy = 0) => ({ id: b.id, kind: b.kind, x: b.x - dx, y: b.y - dy, placedAt: b.placedAt, seed: b.seed, ...(b.variant ? { variant: b.variant } : {}), ...(b.level ? { level: b.level } : {}), ...(b.look ? { look: { ...b.look } } : {}), ...(b.upgradedAt !== undefined ? { upgradedAt: b.upgradedAt } : {}) });
    // A record being moved is saved where it was picked up from, so a reload mid-move loses nothing.
    const moved = this.moving ? { ...this.moving.record, x: this.moving.from.x, y: this.moving.from.y } : null;
    const islandList = moved && !this.moving!.inside ? [...this.buildings, moved] : this.buildings;
    const buildings = islandList.map((b) => record(b, origin.x, origin.y));
    const interiors: Record<string, { furniture: ReturnType<typeof record>[]; style: { floor: number; wall: number; finish?: number }; level: number }> = {};
    for (const [id, st] of this.interiors) {
      const furniture = moved && this.moving!.inside && this.interior?.state === st ? [...st.furniture, moved] : st.furniture;
      interiors[id] = { furniture: furniture.map((f) => record(f)), style: { ...st.style }, level: st.level };
    }
    const containers: Record<string, { capacity: number; items: { item: string; quantity: number }[] }> = {};
    for (const [key, c] of [...this.containers.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) if (c.inventory.total() > 0) containers[key] = { capacity: c.capacity, items: c.inventory.entries() };
    const producers = Object.fromEntries([...this.producers.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
    const rocks: Record<string, RockSaveState> = {};
    for (const [index, r] of [...this.rocks.entries()].sort((a, b) => a[0] - b[0])) if (r.hits > 0 || r.minedAt !== null) rocks[String(index)] = { hits: r.hits, minedAt: r.minedAt };
    const collected = [...this.collected].sort();
    const collectedAt: Record<string, number> = {};
    for (const id of collected) collectedAt[id] = this.collectedAt.get(id) ?? this.worldTime;
    const plots = this.plots.map((p) => ({ id: p.id, gx: p.gx, gy: p.gy, preparedAt: p.preparedAt, harvests: p.harvests, crop: p.crop ? { ...p.crop } : null }));
    storeSave(this.store, {
      version: SAVE_VERSION,
      owner: WORLD_OWNER,
      world: this.identity,
      collected,
      inventory: this.inventory.snapshot(),
      equipped: this.equipped,
      trees,
      worldTime: this.worldTime,
      buildings,
      collectedAt,
      rocks,
      plots,
      care: careToSave(this.care),
      companion: { friendship: this.companion.friendship, tasted: [...this.companion.tasted].sort() },
      found: [...this.found].sort(),
      tally: { ...this.tally },
      objectives: { completed: { ...this.objectives.completed }, request: this.objectives.request ?? null, requestsDone: this.objectives.requestsDone ?? 0, nextRequestAt: this.objectives.nextRequestAt ?? 0, lore: [...(this.objectives.lore ?? [])] },
      interiors,
      containers,
      producers,
      carrier: carrierToSave(this.carrier),
      places: [...this.visited].sort(),
      growth: { stage: this.growth.stage, version: this.growth.version, history: this.growth.history.map((h) => ({ ...h })), regions: [...(this.world.growth?.regions.map((r) => r.id) ?? [])] },
      species: this.species,
      generator: GENERATOR_VERSION,
      name: this.islandName,
      intro: { ...this.intro },
      tutorial: { done: [...this.tutorial.done], skipped: this.tutorial.skipped },
    });
    this.lastAutosave = this.clock.time;
  }

  /** The intro cinematic ended (seen or skipped) or must play on the next opening (pending); saved at once. */
  setIntro(state: IntroState): void {
    this.intro = { state, at: state === 'pending' ? 0 : this.worldTime };
    this.save();
  }

  // ─── The contextual tutorial (M8, `game/tutorial.ts`) ──────────────────

  /** UI and play events seen this session (`open:inventory`, `walked`...): the tutorial reads them. */
  readonly events = new Set<string>();
  private playerWalked = 0;
  private walkingToClick = false;
  /** Clock time the last tutorial step was done (the next tip waits a moment). */
  tipDoneAt = -Infinity;
  /** The step just done, for a short "nice!" on the tip card. */
  tipJustDone: string | null = null;

  /** Something happened the tutorial may care about (a menu opened...). */
  noteEvent(e: string): void {
    this.events.add(e);
  }

  tutorialContext(): TutorialContext {
    const active = new Set(activeQuests(this.objectives).map((q) => q.id));
    return { tally: this.tally, completed: this.objectives.completed, active, events: this.events, hasShelter: this.buildings.some((b) => b.kind === 'shelter' && this.buildingAt(b) >= 1), inside: this.inside };
  }

  private stepTutorial(): void {
    const fresh = updateTutorial(this.tutorial, this.tutorialContext());
    if (fresh.length) {
      this.tipDoneAt = this.clock.time;
      this.tipJustDone = fresh.at(-1)!;
    }
  }

  /** The tip to show now (none while a finished step's moment lasts, with tips off, or all done). */
  tutorialTip(): TutorialStep | null {
    if (this.visitor || this.clock.time - this.tipDoneAt < TIP_PAUSE) return null;
    return currentTip(this.tutorial, this.tutorialContext());
  }

  /** Tips off (SKIP TIPS) or on again (the guide): saved with the island. */
  setTips(on: boolean): void {
    this.tutorial.skipped = !on;
    this.save();
  }

  /** Stop writing this world's save (it was deleted): nothing this world does afterwards is stored. */
  detachStore(): void {
    this.store = null;
  }

  /** Forget this world's progress: every node is back and the inventory is empty. */
  resetProgress(): void {
    if (this.store) clearSave(this.store, this.identity);
    this.collected.clear();
    this.collectedAt.clear();
    this.rocks.clear();
    this.plots.length = 0;
    this.plotByCell.clear();
    this.ripe.clear();
    this.harvestPops.length = 0;
    this.care = newCare();
    this.companion = { care: this.care, friendship: 0, tasted: new Set() };
    this.useCompanion(this.blobbi.seed);
    this.found.clear();
    this.tally = newTally();
    this.objectives = newObjectives();
    this.notices.length = 0;
    this.interior = null;
    this.interiors.clear();
    this.containers.clear();
    this.producers.clear();
    this.moving = null;
    this.placing = null;
    this.manage = false;
    this.inventory = new Inventory(this.identity, this.stackFor);
    this.resources = [...this.allResources];
    this.pickups.length = 0;
    this.trees.clear();
    this.equipped = null;
    this.timeOffset = -this.clock.time;
    this.buildings.length = 0;
    this.completed.clear();
    this.buildMode = null;
    this.collision = CollisionMap.fromWorld(this.world, (p) => this.spriteOf(p));
    for (const t of this.planted) if (t.solid) {
      const s = this.spriteOf(t.placement, this.growthOf(t));
      this.islandCollision.blockEllipse(t.placement.x, t.placement.y, s.footRx, Math.max(1, s.footRy));
    }
    this.rebuildBrain();
  }

  /** The nav grid and brain depend on the Blobbi's foot size and the world; rebuilt when either changes. */
  private rebuildBrain(): void {
    this.islandNav = new NavGrid(this.islandCollision, this.blobbi.footRx, this.blobbi.footRy);
    const wasEnabled = this.brain?.enabled ?? true;
    this.islandBrain = new Brain(`${this.world.seed}/${this.blobbi.seed}`, this.islandNav, this.world.objects);
    this.brain.enabled = wasEnabled;
    // Read-only views: the brain may rest and look, never take or change anything.
    this.brain.wants = () => ({ tired: isTired(this.care), rested: isRested(this.care), shelter: this.shelterDoor() });
    this.brain.extras = () => this.pointsOfInterest();
  }

  private makeBlobbi(blobbi: string | BlobbiSource, size: number): BlobbiEntity {
    const source = typeof blobbi === 'string' ? sourceFromSeed(blobbi) : blobbi;
    const seed = source.seed;
    const identity = blobbiIdentity(seed);
    const sprite = buildBlobbiSprite(identity, { view: 'front', facing: 1, breath: 0, lid: 0, expression: 'neutral', walk: -1, gazeX: 0, gazeY: 0 }, size);
    return { seed, source, identity, animator: new BlobbiAnimator(seed), x: 0, y: 0, size, footRx: Math.max(2, sprite.footRx - 1), footRy: 2, speed: 42 };
  }

  /** Start on the first island's hub, or the nearest free ground to it. */
  private placeBlobbiAtStart(): void {
    const hub = this.world.hubs[0] ?? { x: this.world.islands[0].cx, y: this.world.islands[0].cy };
    const spot = this.collision.nearestFree(hub.x, hub.y + 2, this.blobbi.footRx, this.blobbi.footRy) ?? { x: hub.x, y: hub.y };
    this.blobbi.x = spot.x;
    this.blobbi.y = spot.y;
  }

  /**
   * Another Blobbi walks this island. Only the Blobbi changes: the inventory, equipment, buildings and resources
   * are the world's and stay exactly as they are (and are saved under the world, never under a Blobbi).
   */
  setBlobbi(blobbi: string | BlobbiSource, size = this.blobbi.size): void {
    const { x, y } = this.blobbi;
    this.blobbi = this.makeBlobbi(blobbi, size);
    this.blobbi.x = x;
    this.blobbi.y = y;
    this.blobbiCache.clear();
    this.rig = new EquipmentRig(this.blobbi.identity, this.blobbi.size);
    this.swing = null;
    // Another Blobbi has its own tastes; the island's bag, buildings and companion state stay.
    if (this.tastes) this.useCompanion(this.blobbi.seed);
    this.rebuildBrain();
  }

  /** The sprite of a placement, with growth for planted trees. Cached by every input that matters. */
  spriteOf(p: Placement, growth = 1): Sprite {
    const key = `${this.world.options.palette}|${p.kind}|${p.seed}|${p.size}|${JSON.stringify(p.variation ?? null)}|${growth}`;
    const hit = this.spriteCache.get(key);
    if (hit) return hit;
    const sprite = OBJECT_GENERATORS[p.kind]({ seed: p.seed, size: p.size, palette: paletteFor(this.world.options.palette), variation: p.variation as never, growth });
    this.spriteCache.set(key, sprite);
    return sprite;
  }

  /** Growth of a planted tree at the current time, quantized so sprites are reused. */
  growthOf(t: PlantedTree): number {
    const g = Math.min(1, (this.clock.time - t.plantedAt) / this.growDuration);
    return Math.round(g * 24) / 24;
  }

  /** The Blobbi's sprite for a pose, cached. */
  blobbiSprite(pose: BlobbiPose): Sprite {
    const key = `${this.blobbi.seed}|${this.blobbi.size}|${poseKey(pose)}`;
    const hit = this.blobbiCache.get(key);
    if (hit) return hit;
    const s = buildBlobbiSprite(this.blobbi.identity, pose, this.blobbi.size);
    this.blobbiCache.set(key, s);
    return s;
  }

  /** Run as many fixed steps as `realSeconds` allows. Returns the number of steps run. */
  update(realSeconds: number, input: LiveInput): number {
    // Edge-triggered keys wait for the next step that runs. A display faster than the step rate (120 Hz and up)
    // has frames with no step at all; a press on such a frame used to vanish ("E did nothing").
    this.pendingInteract ||= input.interact;
    this.pendingPlant ||= input.plant;
    const steps = this.clock.advance(realSeconds);
    for (let i = 0; i < steps; i++) {
      // Edge-triggered keys fire once, on the first step.
      this.step(i === 0 ? { ...input, interact: this.pendingInteract, plant: this.pendingPlant } : { ...input, interact: false, plant: false });
    }
    // A paused world drops presses rather than replaying them on resume.
    if (steps > 0 || this.clock.paused) this.pendingInteract = this.pendingPlant = false;
    this.lastInput = input;
    return steps;
  }

  step(input: LiveInput): void {
    const dt = this.clock.dt;
    const time = this.clock.time;
    const b = this.blobbi;
    // ── Movement: the keyboard takes control; otherwise the brain's intent drives the same code ─────
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    // Teleporting (or away): no walking, no actions, no autonomy until the Blobbi is fully back.
    const away = this.teleport.locked;
    if (away) {
      dx = dy = 0;
      input = { ...input, interact: false, plant: false };
    }
    const manualNow = dx !== 0 || dy !== 0 || input.interact || input.plant;
    if (manualNow) this.brain.manual(time);
    let moving = dx !== 0 || dy !== 0;
    let direction: Direction = b.animator.state.direction;
    // A very hungry or exhausted Blobbi walks a little slower (never stops).
    const pace = speedFactor(this.care);
    let speed = b.speed * pace;
    let brainInteract = false;
    const intent = away ? null : this.brain.step(time, dt, { x: b.x, y: b.y }, this.movedLastStep);
    if (intent && !this.brain.manualActive) {
      dx = intent.dx;
      dy = intent.dy;
      moving = intent.moving;
      speed = this.brain.options.speed * pace;
      brainInteract = intent.interact;
      if (intent.face) direction = intent.face;
    }
    const before = { x: b.x, y: b.y };
    if (moving) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      // Facing: horizontal wins on diagonals, as in most top-down games.
      direction = dx !== 0 && Math.abs(dx) >= Math.abs(dy) * 0.6 ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      const moved = this.collision.move(b.x, b.y, dx * speed * dt, dy * speed * dt, b.footRx, b.footRy);
      b.x = moved.x;
      b.y = moved.y;
    }
    const walked = Math.hypot(b.x - before.x, b.y - before.y);
    this.movedLastStep = walked > 0.01;
    // The tutorial's first step: the player walked (keys, the stick, or a click to walk).
    if (manualNow || this.walkingToClick) {
      this.playerWalked += walked;
      if (this.playerWalked > 24) this.events.add('walked');
    }
    if (!this.brain.target) this.walkingToClick = false;
    // Footsteps: one every few pixels walked, named for the ground underfoot.
    this.stride += walked;
    if (this.stride >= 7) {
      this.stride = 0;
      this.sound(`step-${this.surfaceUnder()}`);
    }
    b.animator.step(dt, time, { moving, direction });
    b.animator.state.sleeping = !away && this.brain.state === 'rest';
    this.stepRestPlan(time);
    this.stepTeleport(time);
    // The brain's interactions never touch resources, crops or the bag; looking around makes it happy.
    if (brainInteract) {
      this.lookAround();
      addHappiness(this.care, JOY.explore);
    }
    // The player's E: collect first, then the farm, then the tools, then a look.
    if (input.interact) {
      if (this.moving) this.placeMoved();
      else if (this.manage) this.pickUpToMove();
      else if (this.placing) this.placeFromBag();
      else if (this.buildMode) this.placeBuilding();
      else if (this.inside) this.interact();
      else if (!(this.fishing && this.fish()) && !this.collectDiscovery() && !this.collect() && !this.tend() && !this.chop() && !this.mine() && !this.fish()) this.interact();
    }
    // Walking into the door gap leaves the house.
    if (this.interior && atDoor(b.x, b.y, this.roomLayout)) this.exitInterior();
    this.stepConstruction(dt);
    this.stepRespawn(dt);
    this.stepFarm(dt);
    this.stepCare(dt);
    this.stepFishing();
    this.stepAtmosphere(dt);
    this.stepCarrierBreath(dt);
    this.stepReveal();
    if (!this.visitor) this.stepGrowthNotice(time);
    this.stepPlaces();
    // A visitor neither advances the host's story nor receives its rewards.
    if (!this.visitor) this.stepObjectives();
    if (!this.visitor) this.stepTutorial();
    while (this.harvestPops.length && time - this.harvestPops[0].start > HARVEST_POP_SECONDS) this.harvestPops.shift();
    while (this.notices.length && time >= this.notices[0].until) this.notices.shift();
    // The swing: the hit lands part-way through, the axe is back at rest at the end.
    if (this.swing) {
      if (!this.swing.landed && time >= this.swing.start + SWING.hit) {
        this.swing.landed = true;
        if (this.swing.action === 'mine') this.landMine(this.swing.index);
        else if (this.swing.action === 'till') this.landTill(this.swing.cell!);
        else this.landChop(this.swing.index);
      }
      if (time >= this.swing.start + SWING.end) this.swing = null;
    }
    // Autosave every ten simulated seconds, so world time (and regrowth) survives a reload.
    if (this.store && time - this.lastAutosave >= 10) this.save();
    while (this.pickups.length && time - this.pickups[0].start > PICKUP_SECONDS) this.pickups.shift();
    if (input.plant && !this.inside) this.plantTree();

    // ── Ambient life ──────────────────────────────────────────────────────
    const objects = this.world.objects;
    if (this.ambient.chance(dt * 0.9)) {
      const i = this.ambient.int(0, objects.length - 1);
      const o = objects[i];
      if (o.kind === 'tree') {
        const s = this.spriteOf(o) as TreeResult;
        const foliage = paletteFor(this.world.options.palette).foliage[s.variation.foliage % 4];
        const x = o.x + this.ambient.range(-s.buffer.width * 0.3, s.buffer.width * 0.3);
        const y = o.y - s.anchorY + this.ambient.range(2, Math.max(3, (s.swayRow ?? s.anchorY) - 2));
        if (s.variation.blossom) this.islandParticles.petal(x, y, hex('#ff9ad1'));
        else this.islandParticles.leaf(x, y, this.ambient.chance(0.5) ? foliage.dark : foliage.mid);
      }
    }
    if (this.shallow.length && this.ambient.chance(dt * 4)) {
      const i = this.shallow[this.ambient.int(0, this.shallow.length - 1)];
      this.islandParticles.sparkle(i % this.world.terrain.width, Math.floor(i / this.world.terrain.width), paletteFor(this.world.options.palette).foam);
    }
    // Fireflies by the player's lanterns (no draw from the stream when there are none).
    const lanterns = this.buildings.filter((x) => x.kind === 'lantern' && this.buildingAt(x) >= 1);
    if (lanterns.length && this.ambient.chance(dt * 0.8 * lanterns.length)) {
      const l = this.ambient.pick(lanterns);
      this.islandParticles.sparkle(l.x + this.ambient.range(-6, 6), l.y - this.ambient.range(4, 14), this.ambient.chance(0.5) ? hex('#ffe07a') : hex('#d8ff8a'));
    }
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0 && this.chimneys.length) {
      this.smokeTimer = this.ambient.range(1.2, 2.4);
      const c = this.ambient.pick(this.chimneys);
      this.islandParticles.smoke(c.x + 1, c.y - 1);
    }
    // Leaves shaken loose by a gust.
    for (const [index, imp] of this.impulses) {
      if (time >= imp.until) this.impulses.delete(index);
    }
    // The island keeps living while the Blobbi is indoors: both particle systems step.
    this.islandParticles.step(dt);
    this.interior?.particles.step(dt);

    // ── Growth ────────────────────────────────────────────────────────────
    for (const t of this.planted) {
      if (!t.solid && this.growthOf(t) >= 0.3) {
        const s = this.spriteOf(t.placement, this.growthOf(t));
        this.islandCollision.blockEllipse(t.placement.x, t.placement.y, s.footRx, Math.max(1, s.footRy));
        t.solid = true;
        this.islandNav.rebuild(t.placement.x - 16, t.placement.y - 12, t.placement.x + 16, t.placement.y + 12);
      }
    }
    if (this.bubble && time >= this.bubble.until) this.bubble = null;
    // ── The turtle: blinks and slow glances on its own schedule ────────────
    if (this.world.turtle) {
      const ta = this.turtleAnim;
      if (ta.blinkUntil < 0 && time >= ta.nextBlink) {
        ta.blinkUntil = time + 0.18;
        ta.nextBlink = time + this.ambient.range(3, 7);
      }
      if (ta.blinkUntil >= 0 && time >= ta.blinkUntil) ta.blinkUntil = -1;
      if (time >= ta.nextGlance) {
        ta.glance = ta.glance === 0 ? this.ambient.pick([-1, 1] as const) : 0;
        ta.glanceUntil = time + this.ambient.range(2, 4);
        ta.nextGlance = ta.glanceUntil + (ta.glance === 0 ? this.ambient.range(4, 9) : 0);
      }
      // A slow ripple now and then by a flipper tip.
      if (this.ambient.chance(dt * 0.35)) {
        const f = this.ambient.pick(this.world.turtle.flippers);
        this.islandParticles.ripple(f.cx + Math.cos(f.angle) * f.rx * 0.9, f.cy + Math.sin(f.angle) * f.rx * 0.9, paletteFor(this.world.options.palette).foam);
      }
    }
    this.clock.tick();
    this.stats.steps = this.clock.step;
    this.stats.particles = this.islandParticles.particles.length + (this.interior?.particles.particles.length ?? 0);
  }

  /** The object the Blobbi is facing and close to, if any. */
  facingObject(radius = 16): { index: number; placement: Placement; sprite: Sprite } | null {
    if (this.inside) return null;
    const b = this.blobbi;
    const dir = b.animator.state.direction;
    const fx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const fy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    let best: { index: number; placement: Placement; sprite: Sprite; d: number } | null = null;
    const all = [...this.world.objects, ...this.planted.map((t) => t.placement)];
    for (let i = 0; i < all.length; i++) {
      const o = all[i];
      if (o.kind === 'grass' || o.kind === 'bridge') continue;
      const sprite = i < this.world.objects.length ? this.objectSprite(i) : this.spriteOf(o, this.growthOf(this.planted[i - this.world.objects.length]));
      const dx = o.x - b.x;
      const dy = o.y - b.y;
      const d = Math.hypot(dx, dy) - sprite.footRx;
      if (d > radius) continue;
      // Must be roughly in front: the dot product with the facing direction is positive, or very close.
      const dot = dx * fx + dy * fy;
      if (dot < -2 && d > 4) continue;
      if (!best || d < best.d) best = { index: i, placement: o, sprite, d };
    }
    return best;
  }

  interact(fromPlayer = true): void {
    const time = this.clock.time;
    const b = this.blobbi;
    this.stats.interactions++;
    const building = this.facingBuilding();
    if (building) {
      const p = this.buildingAt(building);
      if (p >= 1) {
        this.visitBuilding(building, fromPlayer);
      } else {
        this.bubble = { text: `under construction, ${Math.ceil((1 - p) * BUILDINGS[building.kind].buildSeconds)} s`, until: time + 1.6, x: b.x, y: b.y - b.size - 2, head: b.size };
        b.animator.react('neutral', time, 0.5, 0);
      }
      return;
    }
    const target = this.facingObject();
    if (!target && this.nearCarrier()) {
      // The first time (the quest), E simply listens; once the Carrier is known, E opens its interactions.
      if (fromPlayer && 'carrier' in this.objectives.completed) this.uiRequest = { screen: 'carrier', target: null };
      else this.listen();
      return;
    }
    if (target && fromPlayer) this.tally.looked++;
    if (!target) {
      // Nothing there: a small hop and a shrug.
      b.animator.react('surprised', time, 0.6, 2);
      return;
    }
    const { placement: o, sprite, index } = target;
    const top = o.y - sprite.anchorY;
    switch (o.kind) {
      case 'tree': {
        this.impulses.set(index, { until: time + 0.7, strength: 1.4 });
        const tree = sprite as TreeResult;
        const foliage = paletteFor(this.world.options.palette).foliage[tree.variation.foliage % 4];
        const n = 4 + Math.round(sprite.buffer.width / 6);
        for (let i = 0; i < n; i++) {
          const x = o.x + this.particles.rng.range(-sprite.buffer.width * 0.35, sprite.buffer.width * 0.35);
          const y = top + this.particles.rng.range(2, Math.max(3, (sprite.swayRow ?? sprite.anchorY) - 1));
          if (tree.variation.fruit) {
            if (i % 3 === 0) this.particles.dust(x, y, paletteFor(this.world.options.palette).fruit[0]);
          }
          if (tree.variation.blossom) this.particles.petal(x, y, hex('#ff9ad1'));
          else this.particles.leaf(x, y, i % 2 ? foliage.dark : foliage.mid);
        }
        b.animator.react('happy', time, 1, 3);
        break;
      }
      case 'bush':
        this.impulses.set(index, { until: time + 0.5, strength: 1 });
        for (let i = 0; i < 3; i++) this.particles.sparkle(o.x + this.particles.rng.range(-4, 4), top + this.particles.rng.range(1, 5), hex('#ffffff'));
        b.animator.react('excited', time, 0.9, 2);
        break;
      case 'house':
        for (let i = 0; i < 3; i++) this.particles.heart(o.x + this.particles.rng.range(-3, 3), o.y - 6 - i * 2);
        this.particles.note(o.x + 6, o.y - 10);
        b.animator.react('excited', time, 1.2, 3);
        break;
      case 'flower':
        for (let i = 0; i < 4; i++) this.particles.petal(o.x + this.particles.rng.range(-2, 2), top + 1, paletteFor(this.world.options.palette).flowers[(o.variation?.color as number) ?? 0]);
        b.animator.react('happy', time, 0.9, 2);
        break;
      case 'decor':
        if (o.variation?.kind === 'sign') {
          this.bubble = { text: this.signText(o), until: time + 2.5, x: o.x, y: top - 2 };
          b.animator.react('neutral', time, 0.5, 0);
          this.particles.exclaim(b.x, b.y - this.blobbi.size - 4);
        } else if (o.variation?.kind === 'lantern') {
          for (let i = 0; i < 5; i++) this.particles.sparkle(o.x + this.particles.rng.range(-3, 3), top + this.particles.rng.range(0, 4), hex('#ffe07a'));
          b.animator.react('surprised', time, 0.8, 2);
        } else {
          this.particles.exclaim(b.x, b.y - this.blobbi.size - 4);
          b.animator.react('surprised', time, 0.8, 2);
        }
        break;
      case 'rock':
        this.particles.dust(o.x - 2, o.y, paletteFor(this.world.options.palette).stone.light);
        this.particles.dust(o.x + 2, o.y, paletteFor(this.world.options.palette).stone.light);
        b.animator.react('sad', time, 0.9, 0);
        break;
      default:
        b.animator.react('surprised', time, 0.6, 2);
    }
  }

  /** Looking at something the player built: each kind answers in its own small way. */
  private visitBuilding(building: Building, fromPlayer = true): void {
    const time = this.clock.time;
    const b = this.blobbi;
    const def = BUILDINGS[building.kind];
    const say = (text: string) => (this.bubble = { text, until: time + 2, x: b.x, y: b.y - b.size - 2, head: b.size });
    const top = building.y - buildingSprite(building, paletteFor(this.world.options.palette), 1, this.world.options.scale).anchorY;
    // Decorations cheer the Blobbi up, once in a while (not every press).
    const cheer = (amount: number = JOY.decoration) => {
      if (this.worldTime - this.lastDecorationJoy < 20) return;
      this.lastDecorationJoy = this.worldTime;
      addHappiness(this.care, amount);
    };
    const joy = (amount = def.joy ?? 0) => amount > 0 && cheer(amount);
    // On its own, the Blobbi only looks: it never opens a chest, cooks, crafts, picks herbs or goes indoors.
    if (!fromPlayer && (def.use === 'storage' || def.use === 'cook' || def.use === 'craft' || def.use === 'herbs' || def.use === 'sleep' || def.use === 'read' || def.use === 'time')) {
      say(def.use === 'cook' ? 'something smells good here' : def.use === 'sleep' && building.kind === 'shelter' ? 'home' : `a ${def.label}`);
      b.animator.react('happy', time, 0.8, 1);
      return;
    }
    if (!fromPlayer && def.use === 'sit') {
      // A long, contented sit.
      this.brain.until = time + 6;
      say(building.kind === 'bench' || building.kind === 'log-seat' ? 'what a nice view' : 'comfy');
      b.animator.react('happy', time, 5, 0);
      joy();
      return;
    }
    switch (def.use) {
      case undefined:
        break;
      case 'sleep':
        if (building.kind === 'shelter') {
          // The door: in we go.
          if (!this.enterInterior(building)) say('home sweet home');
          return;
        }
        this.rest();
        return;
      case 'nap':
        this.brain.restNow(time, { x: b.x, y: b.y }, { x: building.x, y: building.y });
        say('a little nap');
        joy();
        return;
      case 'storage': {
        if (fromPlayer && this.denied('inventory')) return;
        if (def.capacity) this.uiRequest = { screen: 'storage', target: building };
        else say(`storage: +${CRATE_BONUS} per stack`); // the M4 crate: more room in the bag
        return;
      }
      case 'cook':
        if (fromPlayer && this.denied('inventory')) return;
        this.uiRequest = { screen: 'cooking', target: building };
        return;
      case 'craft':
        if (fromPlayer && this.denied('inventory')) return;
        this.uiRequest = { screen: 'crafting', target: building };
        return;
      case 'sit':
        this.tally.sat++;
        this.particles.note(building.x + 3, top - 2);
        say(building.kind === 'bench' || building.kind === 'log-seat' ? 'what a nice view' : 'a good seat');
        b.animator.react('happy', time, 1.2, 1);
        joy();
        return;
      case 'read': {
        this.tally.looked++;
        say(this.readLine(building));
        b.animator.react('neutral', time, 1, 0);
        joy();
        return;
      }
      case 'light':
        for (let i = 0; i < 4; i++) this.particles.sparkle(building.x + this.particles.rng.range(-3, 3), top + this.particles.rng.range(0, 4), hex('#ffe07a'));
        say('so cozy');
        b.animator.react('happy', time, 0.9, 1);
        joy(2);
        return;
      case 'play':
        this.tally.played++;
        for (let i = 0; i < 2; i++) this.particles.heart(b.x + this.particles.rng.range(-4, 4), b.y - b.size - 2 - i * 3);
        say('boing!');
        b.animator.react('excited', time, 1.4, 4);
        joy();
        return;
      case 'music':
        for (let i = 0; i < 3; i++) this.particles.note(building.x + this.particles.rng.range(-4, 4), top - 2 - i * 3);
        say(building.kind === 'wind-chime' ? 'ting... ting...' : 'a little tune');
        b.animator.react('happy', time, 1.4, 1);
        this.sound('music');
        joy();
        return;
      case 'sprinkle':
        say('it waters the crops nearby');
        return;
      case 'birds':
        say('the birds love it');
        b.animator.react('happy', time, 0.8, 1);
        joy();
        return;
      case 'time':
        say(this.timeLabel());
        return;
      case 'herbs': {
        const n = this.herbsReady(building);
        if (!n) {
          say('the herbs are still growing');
          return;
        }
        const got = this.inventory.add('blobbi-pixel:resource:herb', n);
        if (!got) {
          say('no room for herbs');
          return;
        }
        this.producers.set(this.containerKey(building), this.worldTime - Math.max(0, (this.worldTime - (this.producers.get(this.containerKey(building)) ?? building.placedAt)) - got * HERB_SECONDS));
        say(`+${got} wild herb${got === 1 ? '' : 's'}`);
        b.animator.react('happy', time, 0.8, 2);
        this.save();
        return;
      }
      case 'admire':
        if (building.kind === 'flower-bed') for (let i = 0; i < 4; i++) this.particles.petal(building.x + this.particles.rng.range(-5, 5), top + 2, paletteFor(this.world.options.palette).flowers[i % 5]);
        else if (building.kind === 'fence') this.particles.dust(building.x, building.y, paletteFor(this.world.options.palette).wood.light);
        say(ADMIRE[building.kind] ?? `a ${def.label}`);
        b.animator.react(def.joy ? 'happy' : 'neutral', time, 0.9, def.joy ? 2 : 0);
        joy();
        return;
    }
  }

  /** A line to read from a bookshelf or a signpost (stable per object). */
  private readLine(building: Building): string {
    const lines = building.kind === 'signpost' ? SIGN_LINES : BOOK_LINES;
    return stream(building.seed, 'read', this.tally.looked).pick(lines);
  }

  /** The time of day, for clocks. */
  timeLabel(): string {
    return `it is ${clockLabel(this.worldTime)}`;
  }

  private signText(o: Placement): string {
    const texts = ['Welcome to the island', 'Mind the water', 'Trees grow here', 'Bridge ahead', 'Home sweet home', 'Keep off the flowers'];
    return stream(this.world.seed, 'sign', o.x, o.y).pick(texts);
  }

  /** Plant a seedling just ahead of the Blobbi on free grass. It will grow with the clock. */
  plantTree(): boolean {
    if (this.denied('farm')) return false;
    const b = this.blobbi;
    const dir = b.animator.state.direction;
    const ahead = { x: b.x + (dir === 'left' ? -9 : dir === 'right' ? 9 : 0), y: b.y + (dir === 'up' ? -7 : dir === 'down' ? 7 : 2) };
    const { width, cls } = this.world.terrain;
    const grassAt = (x: number, y: number) => {
      const c = cls[Math.floor(y) * width + Math.floor(x)];
      return c === T.GRASS || c === T.GRASS_PATCH;
    };
    // The spot ahead, else a ring of spots around it; never on a path, the shore or another footprint.
    const candidates = [ahead];
    for (const r of [5, 10]) for (let i = 0; i < 8; i++) candidates.push({ x: ahead.x + Math.cos((i / 8) * Math.PI * 2) * r, y: ahead.y + Math.sin((i / 8) * Math.PI * 2) * r * 0.8 });
    const spot = candidates.find((c) => grassAt(c.x, c.y) && this.islandCollision.canStand(c.x, c.y, 3, 2) && !this.planted.some((t) => Math.hypot(t.placement.x - c.x, t.placement.y - c.y) < 6));
    if (!spot) return false;
    const px = Math.round(spot.x);
    const py = Math.round(spot.y);
    const seed = `${this.world.seed}/planted/${this.planted.length}`;
    const placement: Placement = { kind: 'tree', layer: 'vegetation', seed, size: 20 + stream(seed, 'size').int(0, 10), x: px, y: py, island: -1 };
    this.planted.push({ placement, plantedAt: this.clock.time, solid: false });
    this.stats.planted = this.planted.length;
    this.particles.dust(px, py, hex('#8a5a33'));
    this.particles.dust(px + 1, py, hex('#8a5a33'));
    b.animator.react('happy', this.clock.time, 0.8, 2);
    return true;
  }

  /** Horizontal sway of an object this frame, in pixels: wind plus any shake impulse. */
  swayOf(index: number, x: number, kind: Placement['kind'], time: number): number {
    const imp = this.impulses.get(index);
    if (imp) return Math.round(Math.sin((imp.until - time) * 28) * imp.strength);
    const wind = windAt(time, x);
    if (wind < 0.08) return 0;
    const phase = index < this.swayPhase.length ? this.swayPhase[index] : index * 1.7;
    const rate = kind === 'flower' ? 3.4 : kind === 'bush' ? 2.2 : 1.6;
    return Math.round(Math.sin(time * rate + phase) * wind * 1.3);
  }

  get input(): LiveInput {
    return this.lastInput;
  }
}
