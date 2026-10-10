import type { Sprite } from '../core/pixel';
import { generateTree } from './tree';
import { generateBush } from './bush';
import { generateFlower, generateGrassTuft } from './flower';
import { generateRock } from './rock';
import { generateBridge, generateDecor, generateFence, generateHouse } from './structures';
import type { ObjectInput } from './types';

/** Every procedural object the lab can draw, by kind. All take the same input shape. */
export const OBJECT_GENERATORS = {
  tree: generateTree,
  bush: generateBush,
  flower: generateFlower,
  grass: generateGrassTuft,
  rock: generateRock,
  house: generateHouse,
  bridge: generateBridge,
  fence: generateFence,
  decor: generateDecor,
} satisfies Record<string, (input: ObjectInput<any>) => Sprite>;

export type ObjectKind = keyof typeof OBJECT_GENERATORS;

export { generateTree } from './tree';
export { generateBush } from './bush';
export { generateFlower, generateGrassTuft } from './flower';
export { generateRock } from './rock';
export { generateBridge, generateDecor, generateFence, generateHouse } from './structures';
export type { ObjectInput } from './types';
