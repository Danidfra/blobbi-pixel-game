/**
 * THE WORLD CARRIER. The world (island terrain, vegetation, buildings, walkable geometry, state) is one
 * thing; the creature that carries it is another. A carrier has a species, an appearance, an anatomy, a
 * supporting surface the island rests on, and animations. The turtle is the first (and only) carrier.
 *
 * The island is generated in its own frame (the "island frame": the Variant 0 canvas, where every gameplay
 * coordinate lives) and then embedded in the carrier's canvas by one explicit translation, `origin`. The
 * carrier never changes terrain classes on the island, collision, navigation or the character's behaviour;
 * it only decides what the sea and the shell around the island look like.
 */
import type { TurtleAnatomy } from '../turtle/turtle';

/**
 * Shell variants: 0 is the approved M1 turtle, unchanged; 1-3 enlarge the visible shell around the same island;
 * 4 (Variant S, the small start) generates a SMALLER island in the same frame and fits the shell around it, so a
 * new turtle begins as a giant animal carrying a small island with most of its shell free to grow over.
 */
export type ShellVariant = 0 | 1 | 2 | 3 | 4;

export interface ShellVariantSpec {
  id: ShellVariant;
  /** A short name for selectors and captions. */
  label: string;
  /** Island area over shell area the variant aims for; null for the unchanged shell. */
  coverage: number | null;
  /**
   * The island generated in the frame, as a fraction of the shell top's half-axes: 1 is the whole top (the M1
   * island, as Variants 0-3 carry); less is a smaller island at the same centre, with the same object sizes.
   */
  islandScale: number;
}

export const SHELL_VARIANTS: readonly ShellVariantSpec[] = [
  { id: 0, label: 'Variant 0: current M1 shell', coverage: null, islandScale: 1 },
  { id: 1, label: 'Variant A: island ≈60% of the shell', coverage: 0.6, islandScale: 1 },
  { id: 2, label: 'Variant B: island ≈70% of the shell', coverage: 0.7, islandScale: 1 },
  { id: 3, label: 'Variant C: island ≈80% of the shell', coverage: 0.8, islandScale: 1 },
  { id: 4, label: 'Variant S: a small island ≈40% of the shell (new worlds)', coverage: 0.4, islandScale: 0.72 },
];

/**
 * The shell the generator uses unless asked otherwise: Variant B, chosen by the user after reviewing the four
 * (2026-10-10). Existing worlds keep their variant (it is part of the world identity); this implicit default stays
 * so that nothing already made regenerates differently.
 */
export const DEFAULT_SHELL_VARIANT: ShellVariant = 2;

/**
 * The shell a NEW turtle world is made with (the title's NEW ISLAND, the intro preview) since the M8 cinematic
 * session (2026-10-11): Variant S, the small start. A generation-version strategy: the variant is in the identity.
 */
export const NEW_WORLD_SHELL_VARIANT: ShellVariant = 4;

export const isShellVariant = (v: unknown): v is ShellVariant => v === 0 || v === 1 || v === 2 || v === 3 || v === 4;

export interface WorldCarrier {
  species: 'turtle';
  seed: string;
  variant: ShellVariant;
  /** Island area over shell area: the variant's target (null for Variant 0) and the value measured on the raster. */
  coverage: { target: number | null; measured: number };
  /** Where the island frame's origin lands in this canvas. Gameplay coordinates here = island-frame coordinates + origin. */
  origin: { x: number; y: number };
  /** The island frame (the Variant 0 canvas) and the canvas this carrier needs. */
  frame: { width: number; height: number };
  canvas: { width: number; height: number };
  /** How far the shell grew: the enlarged shell's half-axes over the reference shell's. 1 for Variant 0. */
  growth: number;
  /** Species anatomy in canvas pixels; its shell is the supporting surface. */
  turtle: TurtleAnatomy;
}
