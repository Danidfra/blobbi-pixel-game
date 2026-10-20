/**
 * THE OTHER BLOBBI WORLDS a player can travel to from this game (the World Travel menu, Y): which doors there are,
 * where they lead, and the icon each card shows. Mirrors the registries Blobbi Home (`src/features/worlds/worlds.ts`)
 * and Blobbi Island (`src/worlds/worlds.ts`) keep: the kit (`@blobbi-kit/core`) knows World ids and names, never
 * addresses, so every address is written here, checked, and never guessed.
 *
 * Only the worlds that read World Locations (kind 31126) are listed: Blobbi Home and Blobbi Island. Nostr Farm and
 * Blobbi Rumble do not yet, so this game does not present them as places the Blobbi arrives in by itself.
 *
 * A build may point a world at a staging address (`VITE_BLOBBI_WORLD_URL_HOME`, `VITE_BLOBBI_WORLD_URL_ISLAND`);
 * an override that is not a travel address is ignored. The icons are each app's own 192 px icon, copied under
 * public/icons/worlds/ (scripts/app-icons.ts says how); a card whose icon cannot be loaded draws its own emblem.
 */
import { WORLD_HOME } from '@blobbi-kit/core';

export const WORLD_ISLAND = 'blobbi-island';

export type BlobbiWorldId = 'home' | 'island';

export interface BlobbiWorld {
  id: BlobbiWorldId;
  /** The World id World Travel uses (the kit's). */
  travelId: string;
  name: string;
  /** The world's address (checked by `isTravelUrl`). */
  url: string;
  /** The card's icon, an image path on this origin. */
  icon: string;
  /** The card's colours (the emblem drawn when the icon is not there). */
  colors: readonly [string, string];
}

/** Checked on 2026-10-19. */
export const WORLDS_CHECKED_ON = '2026-10-19';

const DEFINED: readonly BlobbiWorld[] = [
  { id: 'home', travelId: WORLD_HOME, name: 'Blobbi Home', url: 'https://blobbi.pet/', icon: '/icons/worlds/blobbi-home.png', colors: ['#ffe0e6', '#ffb9c8'] },
  { id: 'island', travelId: WORLD_ISLAND, name: 'Blobbi Island', url: 'https://island.blobbi.pet/', icon: '/icons/worlds/blobbi-island.png', colors: ['#a9e2ff', '#f8dd91'] },
];

/**
 * A travel address: absolute https (or http on this machine, for a development server), with no credentials. The
 * address itself carries no query or fragment (nothing rides in a URL).
 */
export function isTravelUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password || url.search || url.hash) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
}

export const worldUrlEnvName = (id: BlobbiWorldId) => `VITE_BLOBBI_WORLD_URL_${id.toUpperCase()}`;

/** The staging addresses a build names, those that are travel addresses only. */
export function worldUrlOverrides(env: Record<string, string | boolean | undefined>): Partial<Record<BlobbiWorldId, string>> {
  const out: Partial<Record<BlobbiWorldId, string>> = {};
  for (const w of DEFINED) {
    const raw = env[worldUrlEnvName(w.id)];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (isTravelUrl(value)) out[w.id] = value;
  }
  return out;
}

/** The worlds, in the order the menu shows them, with any staging addresses applied. */
export function blobbiWorlds(overrides: Partial<Record<BlobbiWorldId, string>> = {}): BlobbiWorld[] {
  return DEFINED.map((w) => ({ ...w, url: overrides[w.id] ?? w.url }));
}

export function worldByTravelId(travelId: string, overrides: Partial<Record<BlobbiWorldId, string>> = {}): BlobbiWorld | undefined {
  return blobbiWorlds(overrides).find((w) => w.travelId === travelId);
}
