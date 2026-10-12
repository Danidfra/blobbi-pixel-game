/**
 * ISLAND NAMES: the optional name a player gives a new island. Kept to what the game's tiny pixel font can draw
 * (letters, digits, spaces and a little punctuation), at most `MAX_NAME` characters, with spaces tidied. An empty
 * name means "no name": the island is then called by its stable generated name (`worldName`).
 */
import { hash32 } from '../core/rng';

const ADJECTIVES = ['Mossy', 'Sunny', 'Quiet', 'Drifting', 'Gentle', 'Misty', 'Clover', 'Amber', 'Willow', 'Pebble', 'Dewy', 'Starlit', 'Hazel', 'Breezy', 'Tidal', 'Sleepy'];
const NOUNS = ['Shell', 'Hollow', 'Meadow', 'Cove', 'Grove', 'Haven', 'Isle', 'Knoll', 'Glade', 'Rest', 'Harbour', 'Garden'];

/** A stable friendly name for a world ("Mossy Cove"), from its identity. */
export function worldName(identity: string): string {
  const h = hash32(identity);
  return `${ADJECTIVES[h % ADJECTIVES.length]} ${NOUNS[(h >>> 8) % NOUNS.length]}`;
}

export const MAX_NAME = 16;

/** A name as typed → the name kept (possibly empty). Never throws. */
export function sanitizeIslandName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[^A-Za-z0-9 .!-]/g, '')
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, MAX_NAME)
    .trimEnd();
}

/** Like `sanitizeIslandName`, but keeps one trailing space while the player is still typing. */
export function typingIslandName(raw: string): string {
  const kept = raw.replace(/[^A-Za-z0-9 .!-]/g, '').replace(/\s+/g, ' ').trimStart().slice(0, MAX_NAME);
  return kept;
}

/** The n-th suggested name (SURPRISE ME): stable, friendly, never empty. */
export function suggestIslandName(n: number): string {
  return worldName(`suggestion-${n}`);
}

/** What players see for an island: its own name, else the generated one. */
export function displayName(name: string | null | undefined, identity: string): string {
  const own = sanitizeIslandName(name ?? '');
  return own || worldName(identity);
}
