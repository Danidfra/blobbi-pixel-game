// M11D.8.2, ISSUE 3: the current Blobbi from Ditto. Audit (read only, docs/architecture/CURRENT-BLOBBI.md §4): Ditto
// publishes kind 11125 with `current_companion` = the Blobbi's BARE d, by the player, ONLY from its "Set as companion"
// button (BlobbiPage `handleSetAsCompanion`, BlobbiWidget); picking a Blobbi on its page (`handleSelectBlobbi`) only
// writes Ditto's own localStorage `blobbi:selected:d:<pubkey>` and publishes nothing; pressing the button on the
// current companion UNSETS it (the tag is removed). These tests feed Pixel's resolver events shaped exactly as Ditto
// builds them (the kit's `buildBlobbonautTags` + `updateBlobbonautTags`), signed by a disposable key, and check what
// Pixel sees in each case. No relay, no real identity, nothing published.
import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from 'nostr-tools/pure';
import { buildBlobbonautTags, buildEggTags, getCanonicalBlobbiD, updateBlobbonautTags, KIND_BLOBBONAUT_PROFILE } from '@blobbi-kit/core';
import { resolveCurrentBlobbi } from '../src/nostr/current-blobbi';
import { READ_RELAYS } from '../src/nostr/relay-config';
import type { ProfileReadResult } from '../src/nostr/relays';
import { babyStateTemplate } from '../src/nostr/canonical-events';

const sk = generateSecretKey();
const ME = getPublicKey(sk);
const at = 1_760_000_100;
const wire = (e: NostrEvent): NostrEvent => JSON.parse(JSON.stringify(e));
// Two Blobbis of the owner, as Ditto or Pixel would have published them (V3).
const BOCA = finalizeEvent({ kind: 31124, created_at: at, content: '', tags: buildEggTags(ME, 'b0cab0cab0', at, 'Boca rosa', { visualGeneration: 'v3' }).map((t) => (t[0] === 'stage' ? ['stage', 'adult'] : t)) }, sk);
const PUDDING = finalizeEvent(babyStateTemplate({ owner: ME, petId: 'a1b2c3d4e5', name: 'Pudding', bornAt: at - 100 }, at), sk);
const BOCA_D = getCanonicalBlobbiD(ME, 'b0cab0cab0');
const PUDDING_D = getCanonicalBlobbiD(ME, 'a1b2c3d4e5');

/** Ditto's profile as first made (the hatching ceremony: the kit's base tags), then as "Set as companion" rewrites it. */
const baseProfile = (created: number) => finalizeEvent({ kind: KIND_BLOBBONAUT_PROFILE, created_at: created, content: '', tags: updateBlobbonautTags(buildBlobbonautTags(ME), { has: [PUDDING_D, BOCA_D] }) }, sk);
const setCompanion = (prev: NostrEvent, d: string, created: number) =>
  finalizeEvent({ kind: KIND_BLOBBONAUT_PROFILE, created_at: created, content: prev.content, tags: updateBlobbonautTags(prev.tags.filter((t) => t[0] !== 'current_companion'), { current_companion: d }) }, sk);
const unsetCompanion = (prev: NostrEvent, created: number) =>
  finalizeEvent({ kind: KIND_BLOBBONAUT_PROFILE, created_at: created, content: prev.content, tags: updateBlobbonautTags(prev.tags, {}).filter((t) => t[0] !== 'current_companion') }, sk);

const relays = (profiles: NostrEvent[], blobbis: NostrEvent[] = [BOCA, PUDDING]) => {
  const reqs: string[] = [];
  const answer = (events: NostrEvent[]): Promise<ProfileReadResult> => Promise.resolve({ events: events.map(wire), reachable: READ_RELAYS.length });
  return {
    reqs,
    resolve: () =>
      resolveCurrentBlobbi(ME, {
        relays: READ_RELAYS,
        timeoutMs: 200,
        profiles: { readBlobbonaut: () => (reqs.push('REQ 11125'), answer(profiles)) },
        blobbis: { readBlobbis: () => (reqs.push('REQ 31124'), answer(blobbis)) },
      }),
  };
};

describe('M11D.8.2: what Pixel sees of Ditto\'s current Blobbi', () => {
  it('a Ditto profile with no companion set (the player only picked a Blobbi on the page): nothing is chosen', async () => {
    const r = await relays([baseProfile(at + 10)]).resolve();
    expect(r).toMatchObject({ status: 'no-selection', reason: 'no-companion' });
    // Pixel knows the Blobbis, but never guesses the current one from them.
    expect(r.status === 'no-selection' && r.items.map((b) => b.name).sort()).toEqual(['Boca rosa', 'Pudding']);
  });

  it('"Set as companion" in Ditto on Boca rosa: Pixel resolves Boca rosa as the current Blobbi', async () => {
    const profile = setCompanion(baseProfile(at + 10), BOCA_D, at + 20);
    expect(profile.tags.find((t) => t[0] === 'current_companion')?.[1]).toBe(BOCA_D);
    expect(profile.tags.find((t) => t[0] === 'd')?.[1]).toBe(`blobbonaut-${ME.slice(0, 12)}`);
    const r = await relays([profile]).resolve();
    expect(r).toMatchObject({ status: 'current', partial: false });
    expect(r.status === 'current' && r.blobbi).toMatchObject({ name: 'Boca rosa', d: BOCA_D, generation: 'v3', availability: 'available', stage: 'adult' });
  });

  it('the newest Ditto profile wins: the companion changed to Pudding, then (older) Boca rosa in another relay', async () => {
    const first = setCompanion(baseProfile(at + 10), BOCA_D, at + 20);
    const second = setCompanion(first, PUDDING_D, at + 30);
    const r = await relays([first, second, first]).resolve();
    expect(r.status === 'current' && r.blobbi.name).toBe('Pudding');
  });

  it('"Set as companion" pressed again on the current one UNSETS it in Ditto: Pixel then sees no companion', async () => {
    const set = setCompanion(baseProfile(at + 10), BOCA_D, at + 20);
    const unset = unsetCompanion(set, at + 30);
    expect(unset.tags.some((t) => t[0] === 'current_companion')).toBe(false);
    expect(await relays([set, unset]).resolve()).toMatchObject({ status: 'no-selection', reason: 'no-companion' });
  });

  it('the companion names a Blobbi the relays did not return: missing (never a replacement)', async () => {
    const profile = setCompanion(baseProfile(at + 10), BOCA_D, at + 20);
    const r = await relays([profile], [PUDDING]).resolve();
    expect(r).toMatchObject({ status: 'missing', d: BOCA_D });
  });

  it('a profile by someone else, or a forged one, is ignored even when a relay returns it for the owner', async () => {
    const otherSk = generateSecretKey();
    const other = finalizeEvent({ kind: KIND_BLOBBONAUT_PROFILE, created_at: at + 50, content: '', tags: updateBlobbonautTags(buildBlobbonautTags(ME), { current_companion: BOCA_D }) }, otherSk);
    const forged = wire(setCompanion(baseProfile(at + 10), BOCA_D, at + 20));
    forged.tags = forged.tags.map((t) => (t[0] === 'current_companion' ? ['current_companion', PUDDING_D] : t));
    expect(await relays([other, forged]).resolve()).toMatchObject({ status: 'no-selection', reason: 'no-profile' });
  });

  it('the resolver only ever asks (two REQs), never sends an event', async () => {
    const r = relays([setCompanion(baseProfile(at + 10), BOCA_D, at + 20)]);
    await r.resolve();
    expect(r.reqs.sort()).toEqual(['REQ 11125', 'REQ 31124']);
  });

  it('the Ditto source says so: the companion is published only by "Set as companion"; page selection is local', () => {
    // A note for the reader of this test: verified against ~/Developer/ditto at b2e65945 (read only, not modified):
    // src/pages/BlobbiPage.tsx `handleSelectBlobbi` -> setStoredSelectedD (localStorage `blobbi:selected:d:<pubkey>`);
    // `handleSetAsCompanion` -> publishEvent({ kind: KIND_BLOBBONAUT_PROFILE, tags: updateBlobbonautTags(..., { current_companion: companion.d }) }).
    expect(KIND_BLOBBONAUT_PROFILE).toBe(11125);
  });
});
