/**
 * WILD SEEDS (Living World, phase 2): a seed found on the ground is, now and then, not a turnip's. Each pickup of a
 * seed node yields one crop's own seed item by weight, and the kind is revealed the moment it is picked up: the bag
 * simply holds the crop's seed, as if a quest had given it. Which kind is a pure function of the world seed, the node
 * and how many times that node has been picked before (its generation), so a reload before the pickup, or a second
 * look, changes nothing: the only way to a new roll is to pick the seed up and wait for the node to grow back.
 *
 * Item ids are untouched: the wild seed item stays the turnip's seed, every other crop keeps its own; quests, the
 * tallies and the stack limits see ordinary items.
 */
import { hash32 } from '../core/rng';
import { CROPS, type CropKind } from './farming';

/** Percent of ground pickups that turn out to be each crop's seed (they add up to 100). */
export const WILD_SEED_WEIGHTS: Readonly<Record<CropKind, number>> = {
  turnip: 45,
  radish: 15,
  carrot: 12,
  potato: 8,
  wheat: 6,
  tomato: 4,
  pumpkin: 3,
  strawberry: 2,
  sunflower: 2,
  tulip: 2,
  lavender: 1,
};

/** The kinds in a fixed order (the table's), so the bucket a hash falls in never depends on object key order. */
export const WILD_SEED_ORDER: readonly CropKind[] = ['turnip', 'radish', 'carrot', 'potato', 'wheat', 'tomato', 'pumpkin', 'strawberry', 'sunflower', 'tulip', 'lavender'];

/** Which crop's seed the `generation`th pickup of node `nodeId` in world `worldSeed` turns out to be. */
export function wildSeedKind(worldSeed: string, nodeId: string, generation: number): CropKind {
  let bucket = hash32(`${worldSeed}/wild-seed/${nodeId}/${generation}`) % 100;
  for (const kind of WILD_SEED_ORDER) {
    bucket -= WILD_SEED_WEIGHTS[kind];
    if (bucket < 0) return kind;
  }
  return 'turnip';
}

/** The item that pickup puts in the bag. */
export const wildSeedItem = (worldSeed: string, nodeId: string, generation: number): string => CROPS[wildSeedKind(worldSeed, nodeId, generation)].seed;
