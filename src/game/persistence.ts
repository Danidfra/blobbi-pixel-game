/**
 * LOCAL PERSISTENCE of what the player did to a world: which resource nodes were collected and what the
 * inventory holds. One versioned record per world identity, in any key-value store (the browser's
 * localStorage in the playground, a Map in tests). A record whose version this code does not know is
 * ignored, never half-read. Nothing here talks to Nostr; the record is the local state a future Nostr
 * layer would publish from.
 */
import type { InventorySnapshot } from './inventory';
import { carrierFromSave, type CarrierState } from './carrier';
import type { WorldDescription } from '../world/types';
import { CROP_KINDS, type CropKind } from './farming';
import { careFromSave, careToSave, type CareState } from './care';
import { newObjectives, newTally, objectivesFromSave, tallyFromSave, type ObjectiveState, type Tally } from './objectives';

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/**
 * The record schema. 1: collected nodes and inventory (M2.1). 2: adds the equipped tool, tree states and world time
 * (M2.2). 3: adds buildings (M3.1). 4: adds when each node was collected (renewable resources) and rock states (M3.2).
 * 5: states the owner, `local-world` (M3.4); records 1-4 had the same owner without saying so and migrate to it.
 * 6: adds farm plots and their crops, the Blobbi's needs, the tally of player actions and completed objectives
 * (M4). Decorations are buildings (new kinds in `buildings`). Records 1-5 migrate: no plots, a comfortable
 * Blobbi, a tally seeded from what the record shows was done (collected nodes, felled trees, broken rocks,
 * buildings), no objectives completed yet (they complete on the next step from that progress).
 * 7: (M5) placement colourways, house interiors (furniture, style, level) by shelter id, container contents by
 * container key, producer timers, the island companion's friendship and tried foods (`companion`; with `care` it
 * is the Blobbi-specific state, kept with the island and never keyed by a Blobbi, so no save names one),
 * discoveries found, the full quest state (requests, journal notes). Records 1-6 migrate with none of these.
 */
export const SAVE_VERSION = 9;

/**
 * Who a world record belongs to. Everything in it (inventory, equipment, buildings, resources, world time) is the
 * LOCAL WORLD's, keyed by the world identity: never by a Blobbi, so changing the selected Blobbi (see
 * `blobbi-selection.ts`) never changes or reassigns it. A record naming any other owner is not read.
 */
export const WORLD_OWNER = 'local-world';
/** The key namespace: records of every schema this code can migrate share it. */
const NAMESPACE = 'blobbi-pixel-lab:save:v1';

export interface TreeSaveState {
  hits: number;
  harvestedAt: number | null;
}

/** A placed building. `x`, `y` are in the ISLAND FRAME (canvas minus the carrier's origin): stable across canvases. */
export interface BuildingSave {
  id: string;
  kind: string;
  x: number;
  y: number;
  placedAt: number;
  seed: string;
  variant?: number;
}

export interface RockSaveState {
  hits: number;
  minedAt: number | null;
}

/** A farm plot: its grid cell in the ISLAND FRAME (stable across canvases), its history and its crop. */
export interface PlotSave {
  id: string;
  gx: number;
  gy: number;
  preparedAt: number;
  harvests: number;
  crop: { kind: CropKind; plantedAt: number; grown: number; wetFrom: number | null; wetUntil: number | null; picks?: number } | null;
}

/** The Blobbi's needs on this island (state of the world's Blobbi, never its identity). */
export type CareSave = ReturnType<typeof careToSave>;

export interface WorldSave {
  version: typeof SAVE_VERSION;
  /** The owner of everything in the record: the local world, never a Blobbi. */
  owner: typeof WORLD_OWNER;
  /** The world identity the record belongs to (also part of the key, repeated here as a guard). */
  world: string;
  /** Ids of the resource nodes the player collected. */
  collected: string[];
  inventory: InventorySnapshot;
  /** The equipped tool's item id, or null. */
  equipped: string | null;
  /** Harvest state per tree placement index (only trees that were ever chopped). */
  trees: Record<string, TreeSaveState>;
  /** Simulated seconds this world has lived, so regrowth continues across reloads. */
  worldTime: number;
  /** Buildings the player placed, in island-frame coordinates. */
  buildings: BuildingSave[];
  /** World time each collected node was taken (it grows back from then). */
  collectedAt: Record<string, number>;
  /** Mining state per large-rock placement index (only rocks that were ever hit). */
  rocks: Record<string, RockSaveState>;
  /** Farm plots in the order they were tilled. */
  plots: PlotSave[];
  care: CareSave;
  /** What the player has done here (objective progress is derived from it). */
  tally: Tally;
  objectives: ObjectiveState;
  /** House interiors by shelter id; furniture in ROOM coordinates. */
  interiors: Record<string, { furniture: BuildingSave[]; style: { floor: number; wall: number }; level: number }>;
  /** Container contents by container key (`island/<id>`, `room/<shelter>/<id>`). */
  containers: Record<string, { capacity: number; items: { item: string; quantity: number }[] }>;
  /** World time each producer was last emptied. */
  producers: Record<string, number>;
  /** The island companion's friendship and the foods it has tried (its needs are `care`). Never keyed by a Blobbi. */
  companion: { friendship: number; tasted: string[] };
  /** Discoveries found (ids). */
  found: string[];
  /** The bond with the World Carrier (schema 8; earlier records start fresh). */
  carrier: CarrierState;
  /** Named places visited (schema 8). */
  places: string[];
  /** Island growth (schema 9): the stage reached, the generator version it was made with, and when each came. */
  growth: GrowthSave;
  /** The World Carrier's species and the world generator's version (schema 9; records only, for compatibility). */
  species: 'turtle' | 'whale' | 'manta';
  generator: string;
}

export interface GrowthSave {
  stage: number;
  version: number;
  /** Each stage reached: when (world time) and with which generator version. */
  history: { stage: number; worldTime: number; version: number }[];
  /** Region ids unlocked (derived from the stage; stored for readers that do not run the generator). */
  regions: string[];
}

export const newGrowthSave = (): GrowthSave => ({ stage: 0, version: 1, history: [], regions: [] });

/** A saved growth record: a non-negative whole stage (at most 3), a known version; anything else is stage 0. */
export function growthFromSave(raw: unknown): GrowthSave {
  const g = newGrowthSave();
  if (!raw || typeof raw !== 'object') return g;
  const r = raw as Partial<Record<keyof GrowthSave, unknown>>;
  if (typeof r.stage === 'number' && Number.isInteger(r.stage) && r.stage >= 0 && r.stage <= 3) g.stage = r.stage;
  if (typeof r.version === 'number' && Number.isInteger(r.version) && r.version >= 1) g.version = r.version;
  if (Array.isArray(r.history))
    g.history = r.history
      .filter((h): h is { stage: number; worldTime: number; version: number } => !!h && typeof h === 'object' && Number.isInteger((h as { stage: unknown }).stage) && finite((h as { worldTime: unknown }).worldTime))
      .map((h) => ({ stage: h.stage, worldTime: h.worldTime, version: Number.isInteger(h.version) ? h.version : 1 }));
  if (Array.isArray(r.regions)) g.regions = r.regions.filter((x): x is string => typeof x === 'string');
  return g;
}

/** The loaded form: care as live state. */
export interface LoadedSave extends Omit<WorldSave, 'care'> {
  care: CareState;
}

function companionFromSave(raw: unknown): WorldSave['companion'] {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { friendship?: unknown; tasted?: unknown };
  return {
    friendship: typeof r.friendship === 'number' && Number.isFinite(r.friendship) && r.friendship >= 0 ? r.friendship : 0,
    tasted: Array.isArray(r.tasted) ? [...new Set(r.tasted.filter((x): x is string => typeof x === 'string'))] : [],
  };
}

/** Everything that decides which world this is: seed, kind, turtle, shell variant, canvas and scale. */
export function worldIdentity(world: WorldDescription): string {
  const o = world.options;
  const turtle = o.kind === 'turtle' ? `|turtle=${world.carrier?.seed ?? o.turtleSeed ?? world.seed}|variant=${world.carrier?.variant ?? o.shellVariant ?? 0}` : o.kind === 'manta' || o.kind === 'whale' ? `|carrier=${world.creature?.seed ?? o.carrierSeed ?? world.seed}` : '';
  return `seed=${world.seed}|kind=${o.kind}${turtle}|${o.width}x${o.height}|scale=${o.scale}|palette=${o.palette}|density=${o.density}|islands=${o.islands}`;
}

export function saveKey(identity: string): string {
  return `${NAMESPACE}:${identity}`;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A placed record, or null when it is malformed. */
function buildingFromSave(b: unknown): BuildingSave | null {
  if (!b || typeof b !== 'object') return null;
  const r = b as Partial<BuildingSave>;
  if (typeof r.id !== 'string' || typeof r.kind !== 'string' || typeof r.seed !== 'string') return null;
  if (!Number.isInteger(r.x) || !Number.isInteger(r.y) || !finite(r.placedAt)) return null;
  const out: BuildingSave = { id: r.id, kind: r.kind, x: r.x!, y: r.y!, placedAt: r.placedAt, seed: r.seed };
  if (Number.isInteger(r.variant) && (r.variant as number) > 0) out.variant = r.variant;
  return out;
}

function interiorsFromSave(raw: unknown): WorldSave['interiors'] {
  const out: WorldSave['interiors'] = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const r = v as { furniture?: unknown; style?: { floor?: unknown; wall?: unknown }; level?: unknown };
    const furniture = Array.isArray(r.furniture) ? r.furniture.map(buildingFromSave).filter((x): x is BuildingSave => !!x) : [];
    const n = (x: unknown) => (Number.isInteger(x) && (x as number) >= 0 ? (x as number) : 0);
    out[id] = { furniture, style: { floor: n(r.style?.floor), wall: n(r.style?.wall) }, level: Math.max(1, n(r.level)) };
  }
  return out;
}

function containersFromSave(raw: unknown): WorldSave['containers'] {
  const out: WorldSave['containers'] = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const r = v as { capacity?: unknown; items?: unknown };
    if (!Number.isInteger(r.capacity) || (r.capacity as number) <= 0) continue;
    const items = Array.isArray(r.items) ? r.items.filter((e): e is { item: string; quantity: number } => !!e && typeof e.item === 'string' && Number.isInteger(e.quantity) && e.quantity > 0) : [];
    out[key] = { capacity: r.capacity as number, items: items.map((e) => ({ item: e.item, quantity: e.quantity })) };
  }
  return out;
}

function plotsFromSave(raw: unknown): PlotSave[] {
  if (!Array.isArray(raw)) return [];
  const plots: PlotSave[] = [];
  const cells = new Set<string>();
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const r = p as Record<string, unknown>;
    if (typeof r.id !== 'string' || !Number.isInteger(r.gx) || !Number.isInteger(r.gy) || !finite(r.preparedAt)) continue;
    const cell = `${r.gx},${r.gy}`;
    if (cells.has(cell)) continue; // one plot per cell, whatever the record says
    cells.add(cell);
    let crop: PlotSave['crop'] = null;
    const c = r.crop as Record<string, unknown> | null | undefined;
    if (c && typeof c === 'object' && (CROP_KINDS as readonly unknown[]).includes(c.kind) && finite(c.plantedAt) && finite(c.grown) && c.grown >= 0) {
      const wetFrom = finite(c.wetFrom) ? c.wetFrom : null;
      const wetUntil = finite(c.wetUntil) && wetFrom !== null ? c.wetUntil : null;
      crop = { kind: c.kind as CropKind, plantedAt: c.plantedAt, grown: c.grown, wetFrom: wetUntil === null ? null : wetFrom, wetUntil };
      if (Number.isInteger(c.picks) && (c.picks as number) > 0) crop.picks = c.picks as number;
    }
    const harvests = Number.isInteger(r.harvests) && (r.harvests as number) >= 0 ? (r.harvests as number) : 0;
    plots.push({ id: r.id, gx: r.gx as number, gy: r.gy as number, preparedAt: r.preparedAt, harvests, crop });
  }
  return plots;
}

/** Read a record; versions 1-8 are migrated, anything else unknown or malformed is ignored whole. */
export function loadSave(store: KeyValueStore, identity: string): LoadedSave | null {
  const raw = store.get(saveKey(identity));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Omit<WorldSave, 'version' | 'owner' | 'trees' | 'buildings' | 'rocks' | 'collectedAt' | 'plots' | 'care' | 'tally' | 'objectives' | 'interiors' | 'containers' | 'producers' | 'companion' | 'found'>> & { version?: number; owner?: unknown; trees?: Record<string, Partial<TreeSaveState>>; buildings?: Partial<BuildingSave>[]; rocks?: Record<string, Partial<RockSaveState>>; collectedAt?: Record<string, unknown>; plots?: unknown; care?: unknown; tally?: unknown; objectives?: unknown; interiors?: unknown; containers?: unknown; producers?: unknown; companion?: unknown; found?: unknown };
    if (typeof parsed.version !== 'number' || parsed.version < 1 || parsed.version > SAVE_VERSION || !Number.isInteger(parsed.version) || parsed.world !== identity) return null;
    if (!Array.isArray(parsed.collected) || !parsed.inventory || parsed.inventory.version !== 1) return null;
    // From schema 5 the owner is stated and must be the local world; before, it was implied.
    if (parsed.version >= 5 && parsed.owner !== WORLD_OWNER) return null;
    const trees: Record<string, TreeSaveState> = {};
    if (parsed.version >= 2 && parsed.trees && typeof parsed.trees === 'object')
      for (const [k, v] of Object.entries(parsed.trees)) {
        if (!/^\d+$/.test(k) || !v || typeof v !== 'object') continue;
        const hits = typeof v.hits === 'number' && Number.isInteger(v.hits) && v.hits >= 0 ? v.hits : 0;
        const harvestedAt = typeof v.harvestedAt === 'number' && Number.isFinite(v.harvestedAt) ? v.harvestedAt : null;
        if (hits > 0 || harvestedAt !== null) trees[k] = { hits, harvestedAt };
      }
    const buildings: BuildingSave[] = [];
    if (parsed.version >= 3 && Array.isArray(parsed.buildings))
      for (const b of parsed.buildings) {
        const r = buildingFromSave(b);
        if (r) buildings.push(r);
      }
    const worldTime = parsed.version >= 2 && typeof parsed.worldTime === 'number' && Number.isFinite(parsed.worldTime) && parsed.worldTime >= 0 ? parsed.worldTime : 0;
    const collected = parsed.collected.filter((id): id is string => typeof id === 'string');
    // Before schema 4 there were no collection times: those nodes start growing back from the record's world time.
    const collectedAt: Record<string, number> = {};
    for (const id of collected) {
      const t = parsed.version >= 4 ? parsed.collectedAt?.[id] : undefined;
      collectedAt[id] = typeof t === 'number' && Number.isFinite(t) ? t : worldTime;
    }
    const rocks: Record<string, RockSaveState> = {};
    if (parsed.version >= 4 && parsed.rocks && typeof parsed.rocks === 'object')
      for (const [k, v] of Object.entries(parsed.rocks)) {
        if (!/^\d+$/.test(k) || !v || typeof v !== 'object') continue;
        const hits = typeof v.hits === 'number' && Number.isInteger(v.hits) && v.hits >= 0 ? v.hits : 0;
        const minedAt = typeof v.minedAt === 'number' && Number.isFinite(v.minedAt) ? v.minedAt : null;
        if (hits > 0 || minedAt !== null) rocks[k] = { hits, minedAt };
      }
    // Schema 6 states the tally; before, it is seeded from what the record itself shows was done.
    let tally: Tally;
    if (parsed.version >= 6) tally = tallyFromSave(parsed.tally);
    else {
      tally = newTally();
      tally.collected = collected.length;
      tally.felled = Object.values(trees).filter((t) => t.harvestedAt !== null).length;
      tally.mined = Object.values(rocks).filter((r) => r.minedAt !== null).length;
      tally.built = buildings.length;
    }
    return {
      version: SAVE_VERSION,
      owner: WORLD_OWNER,
      world: identity,
      collected,
      inventory: parsed.inventory,
      equipped: parsed.version >= 2 && typeof parsed.equipped === 'string' ? parsed.equipped : null,
      trees,
      worldTime,
      buildings,
      collectedAt,
      rocks,
      plots: parsed.version >= 6 ? plotsFromSave(parsed.plots) : [],
      care: careFromSave(parsed.version >= 6 ? parsed.care : null),
      companion: companionFromSave(parsed.version >= 7 ? parsed.companion : null),
      carrier: carrierFromSave(parsed.version >= 8 ? (parsed as { carrier?: unknown }).carrier : null),
      // Schema 9 adds growth; every older record is stage 0 (a migration never grows an island).
      growth: parsed.version >= 9 ? growthFromSave((parsed as { growth?: unknown }).growth) : newGrowthSave(),
      species: parsed.version >= 9 && ['turtle', 'whale', 'manta'].includes((parsed as { species?: string }).species ?? '') ? ((parsed as { species: 'turtle' | 'whale' | 'manta' }).species) : 'turtle',
      generator: parsed.version >= 9 && typeof (parsed as { generator?: unknown }).generator === 'string' ? (parsed as { generator: string }).generator : 'm6.0',
      places: parsed.version >= 8 && Array.isArray((parsed as { places?: unknown }).places) ? ((parsed as { places: unknown[] }).places.filter((x): x is string => typeof x === 'string')) : [],
      found: parsed.version >= 7 && Array.isArray(parsed.found) ? parsed.found.filter((x): x is string => typeof x === 'string') : [],
      tally,
      objectives: parsed.version >= 6 ? objectivesFromSave(parsed.objectives) : newObjectives(),
      interiors: parsed.version >= 7 ? interiorsFromSave(parsed.interiors) : {},
      containers: parsed.version >= 7 ? containersFromSave(parsed.containers) : {},
      producers: parsed.version >= 7 && parsed.producers && typeof parsed.producers === 'object' ? Object.fromEntries(Object.entries(parsed.producers as Record<string, unknown>).filter((e): e is [string, number] => finite(e[1]))) : {},
    };
  } catch {
    return null;
  }
}

export function storeSave(store: KeyValueStore, save: WorldSave): void {
  store.set(saveKey(save.world), JSON.stringify(save));
}

export function clearSave(store: KeyValueStore, identity: string): void {
  store.remove(saveKey(identity));
}

/** An in-memory store (tests, headless scripts). */
export function memoryStore(initial?: Record<string, string>): KeyValueStore & { readonly data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k) };
}

/** The browser's localStorage, or null where it is unavailable (private mode, headless). */
export function localStore(): KeyValueStore | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    return { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v), remove: (k) => ls.removeItem(k) };
  } catch {
    return null;
  }
}
