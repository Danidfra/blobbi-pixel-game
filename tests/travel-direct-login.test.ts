/**
 * World travel with a DIRECT login (2026-10-18). A player who restores their account in Pixel from a backup (a pasted
 * nsec: Pixel's direct login) and continues with the Blobbi it finds, or who hatches a Blobbi here and registers it,
 * walks it under a GUEST choice whose owner is the connected account (the vault identity). World travel must follow
 * that Blobbi as the account's own once it is shared; it never started before, so no World Location was ever signed.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { deriveBlobbiV3Seed } from '@blobbi-kit/core';
import { memoryStore } from '../src/game/persistence';
import { effectiveSelection, loadSelectionRecord, ownSharedGuestWalker, storeGuestSelection, storeSelection } from '../src/game/blobbi-selection';
import { addGuestBlobbi, guestBlobbi, updateGuestBlobbi } from '../src/game/guest-blobbis';
import { resolveBlobbi } from '../src/blobbi/source';
import { ACTIVATION_KEY } from '../src/nostr/activation';

const ME = '1'.repeat(64);
const OTHER = '2'.repeat(64);
const PET = '0a1b2c3d4e';
const dOf = (pk: string) => `blobbi-${pk.slice(0, 12)}-${PET}`;

/** A Blobbi met here (restored or born), its owner `owner`, shared or not, walking under a guest choice. */
function walkingGuest(owner: string, shared: boolean) {
  const store = memoryStore();
  const d = dOf(owner);
  addGuestBlobbi(store, { owner, ownerKind: 'guest', petId: PET, d, name: 'Dotado', createdAt: 1, bornAt: 1, island: null, born: true, activatedAt: null, named: true, namingLaterAt: null, practicedAt: null });
  if (shared) {
    // A live finished run stands behind a shared Blobbi (as a restore's adoption or a registration leaves it).
    store.set(ACTIVATION_KEY, JSON.stringify({ version: 1, runs: { [d]: { owner, d, stage: 'done', mode: 'live', blobbi: null, profile: null, accepted: { blobbi: [], profile: [] }, seenOn: { blobbi: [], profile: [] }, adopted: true, consentAt: 1, updatedAt: 1 } } }));
    updateGuestBlobbi(store, d, { activatedAt: 2 });
  }
  const r = resolveBlobbi({ pubkey: owner, d });
  if (!r.ok) throw new Error('bad address');
  storeGuestSelection(store, r.source, 'baby', { at: 3, by: 'player' });
  return { store, d };
}
const walker = (store: ReturnType<typeof memoryStore>, connected: string | null) => ownSharedGuestWalker(effectiveSelection(loadSelectionRecord(store), connected), connected, (d) => guestBlobbi(store, d));

describe('world travel follows the account’s own Blobbi after a direct login (restore) or a registration here', () => {
  it('a restored (or registered) Blobbi of the connected account, stored as a guest choice, travels', () => {
    const { store, d } = walkingGuest(ME, true);
    expect(loadSelectionRecord(store)).toMatchObject({ guest: true, account: null }); // what restore/BRING store
    expect(walker(store, ME)).toEqual({ owner: ME, d });
  });

  it('never for a Blobbi only on this device (not shared yet: no 31124 out there for another app to find)', () => {
    const { store } = walkingGuest(ME, false);
    expect(walker(store, ME)).toBeNull();
  });

  it('never for another account’s Blobbi, nor with no account connected (account switching is safe)', () => {
    const { store } = walkingGuest(OTHER, true);
    expect(walker(store, ME)).toBeNull();
    const mine = walkingGuest(ME, true);
    expect(walker(mine.store, null)).toBeNull();
    expect(walker(mine.store, OTHER)).toBeNull();
  });

  it('an account choice is not this rule’s (it is read as before)', () => {
    const store = memoryStore();
    const r = resolveBlobbi({ pubkey: ME, d: dOf(ME) });
    if (!r.ok) throw new Error('bad address');
    storeSelection(store, r.source, { name: 'Bambu', account: ME });
    expect(walker(store, ME)).toBeNull();
    expect(r.source.seed).toBe(deriveBlobbiV3Seed(ME, dOf(ME)));
  });

  it('the page’s travel candidate uses it, beside the account choice (nothing else changes who travels)', () => {
    const main = readFileSync('src/playground/main.ts', 'utf8');
    const fn = main.slice(main.indexOf('function travelCandidate()'), main.indexOf('function travelPlaceUnknown()'));
    expect(fn).toMatch(/walkingCanonical\(\)/);
    expect(fn).toMatch(/ownSharedGuestWalker\(rec, pubkey/);
    expect(fn).toMatch(/rec\.source\.seed !== state\.blobbi\.seed/); // only the Blobbi actually walking
  });
});
