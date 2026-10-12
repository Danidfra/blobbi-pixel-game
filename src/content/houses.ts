/**
 * HOUSE LEVELS (M8) as data: the player's home grows from a Cozy Shelter to a Cottage to a Dream Home. Each level
 * has its own footprint (the house stands on more ground), its own room layout (`game/interior.ts`), a cost, and the
 * quest that opens it. Upgrades are earned through the game's own progress (quests, discoveries, the island's
 * harmony), paid from the bag, confirmed by the player, and never take anything already placed.
 */
export interface HouseLevel {
  level: 1 | 2 | 3;
  name: string;
  /** One line for the HOME screen. */
  blurb: string;
  /** Ground footprint half-sizes (pixels at world scale 1.6). */
  footRx: number;
  footRy: number;
  /** Half the width of the ground kept open in front of the door. */
  doorHalf: number;
  /** What the upgrade TO this level costs (level 1: the shelter's own cost, see `BUILDINGS.shelter`). */
  cost: readonly { item: string; quantity: number }[];
  /** World seconds the upgrade's construction takes. */
  buildSeconds: number;
  /** The quest that asks for this level (its prerequisites open the upgrade). */
  quest?: string;
  /** More conditions, beyond the quest's prerequisites (checked when upgrading). */
  harmony?: number;
  finds?: number;
  /** A piece of furniture that comes with the new rooms (placed in its room, or into the bag). */
  gift?: string;
}

const I = {
  wood: 'blobbi-pixel:material:wood',
  stone: 'blobbi-pixel:resource:stone',
  cloth: 'blobbi-pixel:material:cloth',
};

export const HOUSE_LEVELS: readonly HouseLevel[] = [
  { level: 1, name: 'Cozy Shelter', blurb: 'One snug room: a bed, a table, a window on the sea.', footRx: 12, footRy: 5, doorHalf: 6, cost: [], buildSeconds: 24 },
  {
    level: 2,
    name: 'Cottage',
    blurb: 'A sleeping nook, a main room and a little tiled kitchen, under a shingled roof with a porch.',
    footRx: 17,
    footRy: 6,
    doorHalf: 7,
    cost: [
      { item: I.wood, quantity: 10 },
      { item: I.stone, quantity: 6 },
      { item: I.cloth, quantity: 2 },
    ],
    buildSeconds: 20,
    quest: 'cottage',
    gift: 'cooking-station',
  },
  {
    level: 3,
    name: 'Dream Home',
    blurb: 'Two storeys: a bedroom, a study, a kitchen and a living room, a wide porch and a tiled roof.',
    footRx: 22,
    footRy: 7,
    doorHalf: 8,
    cost: [
      { item: I.wood, quantity: 16 },
      { item: I.stone, quantity: 10 },
      { item: I.cloth, quantity: 4 },
    ],
    buildSeconds: 28,
    quest: 'dream-home',
    harmony: 35,
    finds: 3,
    gift: 'armchair',
  },
];

export const houseLevelInfo = (level: number): HouseLevel => HOUSE_LEVELS[Math.max(0, Math.min(2, (Number.isInteger(level) ? level : 1) - 1))];
export const MAX_HOUSE_LEVEL = 3;
