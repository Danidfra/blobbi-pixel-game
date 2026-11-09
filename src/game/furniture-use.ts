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
  /** Which pixels of the piece's sprite are drawn in front of the Blobbi: (column, row, width, height). */
  front: (x: number, y: number, w: number, h: number) => boolean;
}

/** Every piece the Blobbi can bathe in (seats follow). Keyed by kind. */
export const OCCUPANCY: Readonly<Record<string, OccupancySpot>> = {
  // The tub (15×11): the water's lower row and the tub's front, from row 3 down.
  'washing-tub': { kind: 'bath', dx: 0, dy: 0, front: (_x, y) => y >= 3 },
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
/** Seconds between the splashes of a bath. */
export const SPLASH_EVERY = 0.25;
