/**
 * THE LIVE WORLD: a generated world plus everything that changes. The
 * terrain and object placements stay what the generator made; on top of
 * them live a controllable Blobbi, wind, falling leaves, sparkles, smoke,
 * planted trees that grow, and the small reactions of touching things.
 * All of it advances in fixed clock steps and draws its randomness from
 * keyed streams, so a replay of the same inputs is the same world.
 */
import { SimClock } from './clock';
import { CollisionMap } from './collision';
import { ParticleSystem } from './particles';
import { stream, type Rng } from '../core/rng';
import type { Sprite } from '../core/pixel';
import { hex } from '../core/color';
import { OBJECT_GENERATORS } from '../objects';
import type { TreeResult } from '../objects/tree';
import type { HouseResult } from '../objects/structures';
import { paletteFor } from '../world/generate';
import { T, type Placement, type WorldDescription } from '../world/types';
import { blobbiIdentity, type PixelBlobbiIdentity } from '../blobbi/identity';
import { BlobbiAnimator, type Direction } from '../blobbi/animation';
import { buildBlobbiSprite, poseKey, type BlobbiPose } from '../blobbi/sprite';
import { Brain, NavGrid } from './brain';
import { generateResources, REACH, RESOURCE_ITEM, RESOURCE_LABEL, type ResourceKind, type ResourceNode } from '../game/resources';
import { Inventory } from '../game/inventory';
import { loadSave, storeSave, clearSave, worldIdentity, type KeyValueStore, type TreeSaveState } from '../game/persistence';
import { ITEMS, isTool, itemLabel, toolSupports, stackLimit as registryStack } from '../game/items';
import { canCraft, craft, type Recipe } from '../game/crafting';
import { HITS_TO_FELL, stumpSprite, treeCondition, woodYield, type TreeCondition, type TreeState } from '../game/trees';
import { EquipmentRig, type EquipmentAnimation } from '../game/equipment';
import { BUILDINGS, buildingProgress, buildingSprite, checkPlacement, PROBLEM_TEXT, type Building, type BuildingKind, type PlacementCheck } from '../game/buildings';
import { consumeIngredients } from '../game/crafting';

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
  seed: string;
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
  start: number;
  /** The tree's placement index. */
  index: number;
  /** Whether the hit has landed. */
  landed: boolean;
}

export interface LiveOptions {
  /** Where collected resources and the inventory persist; nothing persists without it. */
  store?: KeyValueStore | null;
}

/** Wind strength 0..1 at a world x and time: slow gusts that travel across the map. */
export function windAt(time: number, x: number): number {
  const gust = Math.sin(time * 0.45 - x / 140) * Math.sin(time * 0.17 + 0.8);
  return Math.max(0, gust) ** 1.5;
}

const stackLimit = (item: string): number => registryStack(item);

export class LiveWorld {
  readonly clock = new SimClock();
  readonly particles: ParticleSystem;
  readonly spriteCache = new Map<string, Sprite>();
  readonly blobbiCache = new Map<string, Sprite>();
  collision: CollisionMap;
  blobbi: BlobbiEntity;
  readonly planted: PlantedTree[] = [];
  /** Per-object sway phase, so trees do not move in step. */
  readonly swayPhase: Float32Array;
  /** The Blobbi's autonomy: a nav grid over the collision map and a small behaviour machine. */
  nav!: NavGrid;
  brain!: Brain;
  /** Turtle animation state (turtle worlds only). */
  readonly turtleAnim = { blinkUntil: -1, nextBlink: 2.5, glance: 0 as -1 | 0 | 1, glanceUntil: 0, nextGlance: 6 };
  /** Shake impulses from interactions, by object index (planted trees use index + objects.length). */
  readonly impulses = new Map<number, { until: number; strength: number }>();
  bubble: Bubble | null = null;
  growDuration = 45;
  readonly stats: LiveStats = { steps: 0, interactions: 0, particles: 0, planted: 0, collected: 0, chops: 0, felled: 0, crafted: 0, built: 0 };
  /** Buildings the player placed, in canvas coordinates (saved in the island frame). */
  readonly buildings: Building[] = [];
  /** Build mode: a placement preview in front of the Blobbi; E places, B leaves. */
  buildMode: BuildingKind | null = null;
  /** Buildings whose completion has been announced. */
  private readonly completed = new Set<string>();
  private siteTimer = 0;
  /** The equipped tool's item id, or null. Only the player equips. */
  equipped: string | null = null;
  /** Harvest state per world tree (placement index); absent means an untouched, grown tree. */
  readonly trees = new Map<number, TreeState>();
  /** Simulated seconds this world had lived before this session (from the save record). */
  private timeOffset = 0;
  private lastAutosave = 0;
  private readonly stumpCache = new Map<string, Sprite>();
  /** The axe swing in progress, if any. */
  swing: Swing | null = null;
  /** Finds the Blobbi's hands for the equipment layer; rebuilt with the Blobbi. */
  rig: EquipmentRig;
  /** Resource nodes still on the ground (the generated set minus what the player collected). */
  resources: ResourceNode[] = [];
  /** Every node the world generates, collected or not. */
  readonly allResources: ResourceNode[];
  readonly collected = new Set<string>();
  inventory: Inventory;
  readonly pickups: Pickup[] = [];
  /** The identity the save record is keyed by. */
  readonly identity: string;
  private readonly store: KeyValueStore | null;
  private readonly ambient: Rng;
  private readonly shallow: Int32Array;
  private readonly chimneys: { x: number; y: number }[] = [];
  private smokeTimer = 0;
  private lastInput: LiveInput = IDLE_INPUT;
  private movedLastStep = false;

  constructor(
    readonly world: WorldDescription,
    blobbiSeed: string,
    blobbiSize = 16,
    options: LiveOptions = {},
  ) {
    this.store = options.store ?? null;
    this.identity = worldIdentity(world);
    this.particles = new ParticleSystem(world.seed);
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
    this.blobbi = this.makeBlobbi(blobbiSeed, blobbiSize);
    this.rig = new EquipmentRig(this.blobbi.identity, this.blobbi.size);
    this.placeBlobbiAtStart();
    this.rebuildBrain();
    // Resources on the ground, minus what a saved game says the player already collected.
    this.allResources = generateResources(world, (x, y, rx, ry) => this.collision.canStand(x, y, rx, ry));
    this.inventory = new Inventory(this.identity, stackLimit);
    const save = this.store ? loadSave(this.store, this.identity) : null;
    if (save) {
      for (const id of save.collected) this.collected.add(id);
      this.inventory = Inventory.fromSnapshot(save.inventory, stackLimit);
      this.timeOffset = save.worldTime;
      for (const [k, v] of Object.entries(save.trees)) {
        const index = Number(k);
        if (index >= 0 && index < world.objects.length && world.objects[index].kind === 'tree') this.trees.set(index, { hits: v.hits, harvestedAt: v.harvestedAt });
      }
      if (save.equipped && isTool(save.equipped) && this.inventory.count(save.equipped) > 0) this.equipped = save.equipped;
      const origin = world.carrier?.origin ?? { x: 0, y: 0 };
      for (const b of save.buildings) {
        if (!(b.kind in BUILDINGS)) continue;
        const building: Building = { id: b.id, kind: b.kind as BuildingKind, x: b.x + origin.x, y: b.y + origin.y, placedAt: b.placedAt, seed: b.seed };
        this.buildings.push(building);
        this.blockBuilding(building);
        if (buildingProgress(building, this.worldTime) >= 1) this.completed.add(building.id);
      }
      if (this.buildings.length) this.nav.rebuild();
    }
    this.resources = this.allResources.filter((n) => !this.collected.has(n.id));
  }

  /** The resource node within reach of the Blobbi, nearest first, or null. Reach is from the ground point. */
  nearestResource(reach = REACH): ResourceNode | null {
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
    const node = this.nearestResource();
    if (!node) return null;
    const time = this.clock.time;
    const b = this.blobbi;
    const item = RESOURCE_ITEM[node.kind];
    if (this.inventory.add(item, 1) === 0) {
      this.bubble = { text: `${RESOURCE_LABEL[node.kind]} full`, until: time + 1.6, x: b.x, y: b.y - b.size - 2 };
      b.animator.react('sad', time, 0.8, 0);
      return null;
    }
    this.collected.add(node.id);
    this.resources = this.resources.filter((n) => n !== node);
    this.pickups.push({ node, start: time });
    this.particles.sparkle(node.x, node.y - 2, hex('#ffffff'));
    this.particles.sparkle(node.x + 2, node.y - 1, hex('#fff2b0'));
    this.bubble = { text: `+1 ${node.kind}  ${this.inventory.count(item)}/${this.inventory.limit(item)}`, until: time + 1.4, x: b.x, y: b.y - b.size - 2 };
    b.animator.react('happy', time, 0.7, 2);
    this.stats.collected++;
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

  // ─── Tools and crafting: the player's actions only ───────────────────────

  /** Equip a tool from the inventory. False when it is not there or not a tool. */
  equip(item: string): boolean {
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

  /** Craft a recipe once, atomically, with feedback. False leaves the inventory untouched. */
  craftRecipe(recipe: Recipe): boolean {
    const time = this.clock.time;
    const b = this.blobbi;
    this.brain.manual(time);
    const check = canCraft(this.inventory, recipe);
    if (!check.ok) {
      const why = check.outputFull ? `already have a ${itemLabel(recipe.output.item)}` : check.missing.map((m) => `need ${m.need - m.have} ${itemLabel(m.item)}`).join(', ');
      this.bubble = { text: why, until: time + 1.8, x: b.x, y: b.y - b.size - 2 };
      b.animator.react('sad', time, 0.7, 0);
      return false;
    }
    if (!craft(this.inventory, recipe)) return false;
    this.stats.crafted++;
    for (let i = 0; i < 6; i++) this.particles.sparkle(b.x + this.particles.rng.range(-6, 6), b.y - b.size * 0.6 + this.particles.rng.range(-5, 5), i % 2 ? hex('#ffe07a') : hex('#ffffff'));
    this.particles.note(b.x + 4, b.y - b.size - 2);
    this.bubble = { text: `crafted a ${itemLabel(recipe.output.item)}!`, until: time + 2, x: b.x, y: b.y - b.size - 2 };
    b.animator.react('excited', time, 1.1, 3);
    this.save();
    return true;
  }

  /**
   * Chop the tree in front with the equipped axe. One hit per press; the third fells it, leaves a stump and
   * awards wood. Returns true when the press was spent on a tree (so no other interaction runs).
   */
  chop(): boolean {
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
    this.swing = { start: time, index, landed: false };
    b.animator.react('excited', time, SWING.end, 0);
    return true;
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
    // The impact: the trunk shakes, chips fly from the point of contact, a few leaves fall.
    this.impulses.set(index, { until: time + 0.4, strength: 1.6 });
    const palette = paletteFor(this.world.options.palette);
    const impact = this.impactPoint(o, sprite);
    for (let i = 0; i < 5; i++) this.particles.dust(impact.x + this.particles.rng.range(-1, 1), impact.y - this.particles.rng.range(0, 2), i % 2 ? palette.wood.light : palette.wood.mid);
    const tree = sprite as TreeResult;
    const foliage = palette.foliage[tree.variation.foliage % 4];
    const top = o.y - sprite.anchorY;
    for (let i = 0; i < 3; i++) this.particles.leaf(o.x + this.particles.rng.range(-sprite.buffer.width * 0.3, sprite.buffer.width * 0.3), top + this.particles.rng.range(2, Math.max(3, (sprite.swayRow ?? sprite.anchorY) - 1)), i % 2 ? foliage.dark : foliage.mid);
    if (state.hits < HITS_TO_FELL) {
      this.bubble = { text: `chop ${state.hits}/${HITS_TO_FELL}`, until: time + 0.9, x: b.x, y: b.y - b.size - 2 };
      this.save();
      return;
    }
    // Felled: a stump from now, wood into the bag (what fits), the rest of the tree's canopy comes down as leaves.
    state.hits = 0;
    state.harvestedAt = this.worldTime;
    this.stats.felled++;
    const wood = woodYield(o.seed, o.size);
    const got = this.inventory.add(ITEMS.wood.id, wood);
    for (let i = 0; i < 10; i++) this.particles.leaf(o.x + this.particles.rng.range(-sprite.buffer.width * 0.4, sprite.buffer.width * 0.4), top + this.particles.rng.range(1, Math.max(3, (sprite.swayRow ?? sprite.anchorY) - 1)), i % 2 ? foliage.dark : foliage.mid);
    for (let i = 0; i < 4; i++) this.particles.dust(o.x + this.particles.rng.range(-4, 4), o.y - 1, paletteFor(this.world.options.palette).wood.light);
    this.impulses.delete(index);
    this.bubble = { text: got === wood ? `+${got} wood  ${this.inventory.count(ITEMS.wood.id)}/${this.inventory.limit(ITEMS.wood.id)}` : got > 0 ? `+${got} wood, bag full` : 'wood full', until: time + 1.8, x: b.x, y: b.y - b.size - 2 };
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

  // ─── Building: the player's action only ─────────────────────────────────

  /** Enter or leave build mode for a kind (null leaves). */
  setBuildMode(kind: BuildingKind | null): void {
    this.buildMode = kind;
    this.brain.manual(this.clock.time);
  }

  /** Where a building would go: in front of the Blobbi, snapped to two pixels, in canvas coordinates. */
  placementSpot(kind: BuildingKind = this.buildMode ?? 'shelter'): { x: number; y: number } {
    const b = this.blobbi;
    const def = BUILDINGS[kind];
    const dir = b.animator.state.direction;
    const dx = dir === 'left' ? -(def.footRx + b.footRx + 4) : dir === 'right' ? def.footRx + b.footRx + 4 : 0;
    const dy = dir === 'up' ? -(def.footRy + b.footRy + 6) : dir === 'down' ? def.footRy + b.footRy + 6 : 0;
    return { x: Math.round((b.x + dx) / 2) * 2, y: Math.round((b.y + dy) / 2) * 2 };
  }

  /** The placement check for the current spot (or a given one). */
  placementCheck(kind: BuildingKind = this.buildMode ?? 'shelter', spot = this.placementSpot(kind)): PlacementCheck {
    return checkPlacement(kind, spot.x, spot.y, {
      world: this.world,
      isBlocked: (x, y) => this.collision.isBlocked(x + 0.5, y + 0.5),
      buildings: this.buildings,
      resources: this.resources,
      blobbi: this.blobbi,
    });
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
    const kind = this.buildMode;
    if (!kind) return null;
    const time = this.clock.time;
    const b = this.blobbi;
    const def = BUILDINGS[kind];
    const spot = this.placementSpot(kind);
    const check = this.placementCheck(kind, spot);
    if (!check.ok) {
      this.bubble = { text: PROBLEM_TEXT[check.problem!], until: time + 1.6, x: b.x, y: b.y - b.size - 2 };
      b.animator.react('sad', time, 0.6, 0);
      return null;
    }
    if (!consumeIngredients(this.inventory, def.cost)) {
      const missing = def.cost.filter((c) => this.inventory.count(c.item) < c.quantity).map((c) => `need ${c.quantity - this.inventory.count(c.item)} ${itemLabel(c.item)}`);
      this.bubble = { text: missing.join(', '), until: time + 1.8, x: b.x, y: b.y - b.size - 2 };
      b.animator.react('sad', time, 0.6, 0);
      return null;
    }
    const n = this.buildings.filter((x) => x.kind === kind).length;
    const building: Building = { id: `${kind}:${n}`, kind, x: spot.x, y: spot.y, placedAt: this.worldTime, seed: `${this.world.seed}/${kind}/${n}` };
    this.buildings.push(building);
    this.blockBuilding(building);
    this.nav.rebuild(building.x - def.footRx - 20, building.y - def.footRy - 16, building.x + def.footRx + 20, building.y + def.footRy + 16);
    this.stats.built++;
    for (let i = 0; i < 6; i++) this.particles.dust(spot.x + this.particles.rng.range(-def.footRx, def.footRx), spot.y + this.particles.rng.range(-2, 2), i % 2 ? paletteFor(this.world.options.palette).wood.light : paletteFor(this.world.options.palette).path.dark);
    this.bubble = { text: `building a ${def.label}`, until: time + 1.8, x: b.x, y: b.y - b.size - 2 };
    b.animator.react('excited', time, 1, 2);
    this.buildMode = null;
    this.save();
    return building;
  }

  private blockBuilding(b: Building): void {
    const def = BUILDINGS[b.kind];
    this.collision.blockEllipse(b.x, b.y, def.footRx, def.footRy, true);
  }

  /** Construction progress of a building now. */
  buildingAt(b: Building): number {
    return buildingProgress(b, this.worldTime);
  }

  /** The building in front of and close to the Blobbi, if any. */
  facingBuilding(radius = 10): Building | null {
    const b = this.blobbi;
    const dir = b.animator.state.direction;
    const fx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const fy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    let best: { building: Building; d: number } | null = null;
    for (const building of this.buildings) {
      const def = BUILDINGS[building.kind];
      const dx = Math.max(0, Math.abs(building.x - b.x) - def.footRx);
      const dy = Math.max(0, Math.abs(building.y - b.y) - def.footRy);
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      const dot = (building.x - b.x) * fx + (building.y - b.y) * fy;
      if (dot < -2 && d > 4) continue;
      if (!best || d < best.d) best = { building, d };
    }
    return best?.building ?? null;
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
          for (let i = 0; i < 5; i++) this.particles.sparkle(building.x + this.particles.rng.range(-def.footRx, def.footRx), building.y - this.particles.rng.range(4, 18), hex('#fff2b0'));
          this.particles.heart(building.x, building.y - 20);
          this.bubble = { text: `${def.label} finished!`, until: this.clock.time + 2.2, x: building.x, y: building.y - 24 };
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
  counts(): Record<ResourceKind, number> {
    return { stick: this.inventory.count(RESOURCE_ITEM.stick), stone: this.inventory.count(RESOURCE_ITEM.stone), seed: this.inventory.count(RESOURCE_ITEM.seed) };
  }

  /** Write the collected set and the inventory to the store, if there is one. */
  save(): void {
    if (!this.store) return;
    const trees: Record<string, TreeSaveState> = {};
    for (const [index, t] of [...this.trees.entries()].sort((a, b) => a[0] - b[0])) if (t.hits > 0 || t.harvestedAt !== null) trees[String(index)] = { hits: t.hits, harvestedAt: t.harvestedAt };
    const origin = this.world.carrier?.origin ?? { x: 0, y: 0 };
    const buildings = this.buildings.map((b) => ({ id: b.id, kind: b.kind, x: b.x - origin.x, y: b.y - origin.y, placedAt: b.placedAt, seed: b.seed }));
    storeSave(this.store, { version: 3, world: this.identity, collected: [...this.collected].sort(), inventory: this.inventory.snapshot(), equipped: this.equipped, trees, worldTime: this.worldTime, buildings });
    this.lastAutosave = this.clock.time;
  }

  /** Forget this world's progress: every node is back and the inventory is empty. */
  resetProgress(): void {
    if (this.store) clearSave(this.store, this.identity);
    this.collected.clear();
    this.inventory = new Inventory(this.identity, stackLimit);
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
      this.collision.blockEllipse(t.placement.x, t.placement.y, s.footRx, Math.max(1, s.footRy));
    }
    this.rebuildBrain();
  }

  /** The nav grid and brain depend on the Blobbi's foot size and the world; rebuilt when either changes. */
  private rebuildBrain(): void {
    this.nav = new NavGrid(this.collision, this.blobbi.footRx, this.blobbi.footRy);
    const wasEnabled = this.brain?.enabled ?? true;
    this.brain = new Brain(`${this.world.seed}/${this.blobbi.seed}`, this.nav, this.world.objects);
    this.brain.enabled = wasEnabled;
  }

  private makeBlobbi(seed: string, size: number): BlobbiEntity {
    const identity = blobbiIdentity(seed);
    const sprite = buildBlobbiSprite(identity, { view: 'front', facing: 1, breath: 0, lid: 0, expression: 'neutral', walk: -1, gazeX: 0, gazeY: 0 }, size);
    return { seed, identity, animator: new BlobbiAnimator(seed), x: 0, y: 0, size, footRx: Math.max(2, sprite.footRx - 1), footRy: 2, speed: 42 };
  }

  /** Start on the first island's hub, or the nearest free ground to it. */
  private placeBlobbiAtStart(): void {
    const hub = this.world.hubs[0] ?? { x: this.world.islands[0].cx, y: this.world.islands[0].cy };
    const spot = this.collision.nearestFree(hub.x, hub.y + 2, this.blobbi.footRx, this.blobbi.footRy) ?? { x: hub.x, y: hub.y };
    this.blobbi.x = spot.x;
    this.blobbi.y = spot.y;
  }

  setBlobbi(seed: string, size = this.blobbi.size): void {
    const { x, y } = this.blobbi;
    this.blobbi = this.makeBlobbi(seed, size);
    this.blobbi.x = x;
    this.blobbi.y = y;
    this.blobbiCache.clear();
    this.rig = new EquipmentRig(this.blobbi.identity, this.blobbi.size);
    this.swing = null;
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
    const steps = this.clock.advance(realSeconds);
    for (let i = 0; i < steps; i++) {
      // Edge-triggered keys fire once per update, on the first step.
      this.step(i === 0 ? input : { ...input, interact: false, plant: false });
    }
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
    const manualNow = dx !== 0 || dy !== 0 || input.interact || input.plant;
    if (manualNow) this.brain.manual(time);
    let moving = dx !== 0 || dy !== 0;
    let direction: Direction = b.animator.state.direction;
    let speed = b.speed;
    let brainInteract = false;
    const intent = this.brain.step(time, dt, { x: b.x, y: b.y }, this.movedLastStep);
    if (!this.brain.manualActive) {
      dx = intent.dx;
      dy = intent.dy;
      moving = intent.moving;
      speed = this.brain.options.speed;
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
    this.movedLastStep = Math.hypot(b.x - before.x, b.y - before.y) > 0.01;
    b.animator.step(dt, time, { moving, direction });
    b.animator.state.sleeping = this.brain.state === 'rest';
    // The brain's interactions never touch resources; the player's try to collect first.
    if (brainInteract) this.interact();
    if (input.interact) {
      if (this.buildMode) this.placeBuilding();
      else if (!this.collect() && !this.chop()) this.interact();
    }
    this.stepConstruction(dt);
    // The swing: the hit lands part-way through, the axe is back at rest at the end.
    if (this.swing) {
      if (!this.swing.landed && time >= this.swing.start + SWING.hit) {
        this.swing.landed = true;
        this.landChop(this.swing.index);
      }
      if (time >= this.swing.start + SWING.end) this.swing = null;
    }
    // Autosave every ten simulated seconds, so world time (and regrowth) survives a reload.
    if (this.store && time - this.lastAutosave >= 10) this.save();
    while (this.pickups.length && time - this.pickups[0].start > PICKUP_SECONDS) this.pickups.shift();
    if (input.plant) this.plantTree();

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
        if (s.variation.blossom) this.particles.petal(x, y, hex('#ff9ad1'));
        else this.particles.leaf(x, y, this.ambient.chance(0.5) ? foliage.dark : foliage.mid);
      }
    }
    if (this.shallow.length && this.ambient.chance(dt * 4)) {
      const i = this.shallow[this.ambient.int(0, this.shallow.length - 1)];
      this.particles.sparkle(i % this.world.terrain.width, Math.floor(i / this.world.terrain.width), paletteFor(this.world.options.palette).foam);
    }
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0 && this.chimneys.length) {
      this.smokeTimer = this.ambient.range(1.2, 2.4);
      const c = this.ambient.pick(this.chimneys);
      this.particles.smoke(c.x + 1, c.y - 1);
    }
    // Leaves shaken loose by a gust.
    for (const [index, imp] of this.impulses) {
      if (time >= imp.until) this.impulses.delete(index);
    }
    this.particles.step(dt);

    // ── Growth ────────────────────────────────────────────────────────────
    for (const t of this.planted) {
      if (!t.solid && this.growthOf(t) >= 0.3) {
        const s = this.spriteOf(t.placement, this.growthOf(t));
        this.collision.blockEllipse(t.placement.x, t.placement.y, s.footRx, Math.max(1, s.footRy));
        t.solid = true;
        this.nav.rebuild(t.placement.x - 16, t.placement.y - 12, t.placement.x + 16, t.placement.y + 12);
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
        this.particles.ripple(f.cx + Math.cos(f.angle) * f.rx * 0.9, f.cy + Math.sin(f.angle) * f.rx * 0.9, paletteFor(this.world.options.palette).foam);
      }
    }
    this.clock.tick();
    this.stats.steps = this.clock.step;
    this.stats.particles = this.particles.particles.length;
  }

  /** The object the Blobbi is facing and close to, if any. */
  facingObject(radius = 16): { index: number; placement: Placement; sprite: Sprite } | null {
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

  interact(): void {
    const time = this.clock.time;
    const b = this.blobbi;
    this.stats.interactions++;
    const building = this.facingBuilding();
    if (building) {
      const p = this.buildingAt(building);
      if (p >= 1) {
        for (let i = 0; i < 3; i++) this.particles.heart(building.x + this.particles.rng.range(-4, 4), building.y - 14 - i * 2);
        this.bubble = { text: 'home sweet home', until: time + 2, x: b.x, y: b.y - b.size - 2 };
        b.animator.react('excited', time, 1.2, 3);
      } else {
        this.bubble = { text: `under construction, ${Math.ceil((1 - p) * BUILDINGS[building.kind].buildSeconds)} s`, until: time + 1.6, x: b.x, y: b.y - b.size - 2 };
        b.animator.react('neutral', time, 0.5, 0);
      }
      return;
    }
    const target = this.facingObject();
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

  private signText(o: Placement): string {
    const texts = ['Welcome to the island', 'Mind the water', 'Trees grow here', 'Bridge ahead', 'Home sweet home', 'Keep off the flowers'];
    return stream(this.world.seed, 'sign', o.x, o.y).pick(texts);
  }

  /** Plant a seedling just ahead of the Blobbi on free grass. It will grow with the clock. */
  plantTree(): boolean {
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
    const spot = candidates.find((c) => grassAt(c.x, c.y) && this.collision.canStand(c.x, c.y, 3, 2) && !this.planted.some((t) => Math.hypot(t.placement.x - c.x, t.placement.y - c.y) < 6));
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
