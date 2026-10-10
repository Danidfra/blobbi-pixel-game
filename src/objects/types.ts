import type { Sprite } from '../core/pixel';
import type { WorldPalette } from '../core/palette';

/** What every object generator accepts. Unspecified variation is drawn from the seed. */
export interface ObjectInput<V extends object = Record<string, never>> {
  seed: string;
  /** Nominal size in logical pixels (height for trees, width for most others). */
  size: number;
  palette: WorldPalette;
  variation?: Partial<V>;
  /** Development, 0 (just planted) to 1 (mature). Only living things use it; default 1. */
  growth?: number;
}

export type ObjectGenerator<V extends object = Record<string, never>> = (input: ObjectInput<V>) => Sprite;
