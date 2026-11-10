/**
 * USING FURNITURE WITH THE BODY (Living Home): where the Blobbi sits in a seat or stands in the washing tub, and
 * which part of the piece is drawn in front of it so the seat holds it and the water comes up round it. One small
 * table of data per kind that can be occupied; the state machine that moves the Blobbi there and back lives in
 * `sim/live-world.ts` (`Occupation`), the drawing in `render/occupant-render.ts`.
 *
 * Sprite rows and columns below are those of the finished sprite (`placeableSprite`: the art plus its one-pixel
 * outline; the M4 bench is outlined in place). Every piece is drawn behind the Blobbi, then its `front` pixels over
 * it again: a seat's front edge and legs hide the feet, so the Blobbi reads as seated; the tub's water line and
 * front hide its lower body, so it stands in the water.
 */
import type { Building } from './buildings';

export type OccupancyKind = 'seat' | 'bath';

export interface OccupancySpot {
  kind: OccupancyKind;
  /** The Blobbi's ground point while there, relative to the piece's anchor. */
  dx: number;
  dy: number;
  /**
   * World pixels the Blobbi is drawn up from its ground point while settled, so its body rests on the seat (or
   * stands tall enough in the water) and only its feet go behind the piece's `front`. The view draws the Blobbi at
   * its own size, smaller than the piece's rows suggest, so this keeps the face and most of the body in sight.
   */
  lift: number;
  /** Which pixels of the piece's sprite are drawn in front of the Blobbi: (column, row, width, height). */
  front: (x: number, y: number, w: number, h: number) => boolean;
}

/** Every piece the Blobbi can sit in or bathe in. Keyed by kind; `use: 'sit'` kinds and the tub are all here. */
export const OCCUPANCY: Readonly<Record<string, OccupancySpot>> = {
  // The tub (15×11): the water (rows 3–5) and the tub's front; the Blobbi stands in it to a little below the face.
  'washing-tub': { kind: 'bath', dx: 0, dy: 0, lift: 1, front: (_x, y) => y >= 3 },
  // A chair (9×13): the seat (rows 6–7), its front edge and the legs. Its feet go behind the front edge (row 7).
  chair: { kind: 'seat', dx: 0, dy: -1, lift: 1, front: (_x, y) => y >= 7 },
  // The armchair (13×13): the cushion (rows 6–7), its front (row 8) and the base; the arms' lower part either side,
  // at cushion level only, so they hold the body without hiding its sides.
  armchair: { kind: 'seat', dx: 0, dy: 1, lift: 1, front: (x, y, w) => y >= 8 || (y >= 6 && (x <= 2 || x >= w - 3)) },
  // A stool (9×8): the seat (rows 1–2) and the legs below.
  stool: { kind: 'seat', dx: 0, dy: -1, lift: 1, front: (_x, y) => y >= 3 },
  // The M4 bench (13×10, outlined in place): the seat (rows 5–7) and the legs.
  bench: { kind: 'seat', dx: 0, dy: -1, lift: 1, front: (_x, y) => y >= 6 },
  // A log seat (15×9): the log below its top face (row 3).
  'log-seat': { kind: 'seat', dx: 0, dy: 0, lift: 1, front: (_x, y) => y >= 4 },
  // A hay bale (13×9): the bale below its top face (rows 1–2).
  'hay-bale': { kind: 'seat', dx: 0, dy: 0, lift: 2, front: (_x, y) => y >= 3 },
};

/** Whether a piece can be occupied, and how. */
export const occupancyOf = (kind: string): OccupancySpot | null => OCCUPANCY[kind] ?? null;

/** Where the Blobbi's ground point is while it occupies `f`. */
export function occupantSpot(f: Building): { x: number; y: number } {
  const o = OCCUPANCY[f.kind];
  return { x: f.x + (o?.dx ?? 0), y: f.y + (o?.dy ?? 0) };
}

/** Seconds a bath lasts once the Blobbi is in the water. */
export const BATH_SECONDS = 2.4;
/** Seconds the Blobbi sits when it chose a seat on its own. */
export const IDLE_SIT_SECONDS = 6;
/** Seconds between the splashes of a bath. */
export const SPLASH_EVERY = 0.25;
