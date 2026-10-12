/**
 * CREATURE CARRIERS (M7 manta, M8 phase 0 whale): what a creature world records about the animal that carries it
 * (a turtle world has `world.turtle` instead), and the distance fields both creatures' world generators use.
 */
import { Mask } from '../core/pixel';
import type { MantaAnatomy } from './manta';
import type { WhaleAnatomy } from './whale';

export type CreatureSpecies = 'manta' | 'whale';

interface CreatureBase {
  seed: string;
  /** The head's centre (the shore in front of it is where one listens). */
  head: { cx: number; cy: number };
}

export interface MantaInfo extends CreatureBase {
  species: 'manta';
  anatomy: MantaAnatomy;
}

export interface WhaleInfo extends CreatureBase {
  species: 'whale';
  anatomy: WhaleAnatomy;
  /**
   * Where along the body land may grow (world x): behind the blowholes and eyes (east limit) and before the knuckles
   * (west limit), so the head and the ridge near the tail stay the whale's own.
   */
  growRange: { x0: number; x1: number };
}

export type CreatureInfo = MantaInfo | WhaleInfo;

/** Steps from each pixel to the nearest pixel outside `mask` (4-neighbour flood; 0 outside). */
export function insideDistance(mask: Mask, w: number, h: number): Int32Array {
  const d = new Int32Array(w * h).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < w * h; i++)
    if (!mask.get(i % w, (i / w) | 0)) {
      d[i] = 0;
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx;
      if (d[j] < 0) {
        d[j] = d[i] + 1;
        queue.push(j);
      }
    }
  }
  return d;
}

/** Steps from each pixel outside `mask` to the mask (for the sea's bands). */
export function outsideDistance(mask: Mask, w: number, h: number): Int32Array {
  const d = new Int32Array(w * h).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < w * h; i++)
    if (mask.get(i % w, (i / w) | 0)) {
      d[i] = 0;
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx;
      if (d[j] < 0) {
        d[j] = d[i] + (dx && dy ? 1.4 : 1);
        queue.push(j);
      }
    }
  }
  return d;
}
