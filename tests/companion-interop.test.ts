/**
 * Companion sync across the Blobbi apps (no relay, disposable keys, nothing published): profiles shaped exactly as
 * Blobbi Standalone and Ditto write them are met by this game, and the profile this game writes is the one they read.
 *
 *   Standalone  `buildCompanionProfile` (the kit's `updateBlobbonautTags`, `has` kept) then its publish adapter adds
 *               `client: Blobbi` and `published_at`
 *   Ditto       "Set as companion": the old tag removed, `updateBlobbonautTags(…, { current_companion })`
 *   Pixel       `companionProfileTemplate` (`src/nostr/canonical-events.ts`), no client tag
 */
import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from 'nostr-tools/pure';
import { buildBlobbonautTags, buildEggTags, getCanonicalBlobbiD, isValidBlobbonautEvent, parseBlobbonautEvent, updateBlobbonautTags } from '@blobbi-kit/core';
import { resolveCurrentBlobbi } from '../src/nostr/current-blobbi';
import { READ_RELAYS, PUBLISH_RELAYS } from '../src/nostr/relay-config';
import type { ProfileReadResult } from '../src/nostr/relays';
import { memoryRelay, relayGroup } from '../src/nostr/publisher';
import { memoryStore } from '../src/game/persistence';
import { shareCompanion } from '../src/nostr/companion-share';
import { orderOf, type LocalCompanion } from '../src/game/companion-sync';

const sk = generateSecretKey();
const ME = getPublicKey(sk);
const NOW = 1_800_000_000_000;
const S = NOW / 1000;
const wire = (e: NostrEvent): NostrEvent => JSON.parse(JSON.stringify(e));
const blobbi = (petId: string, name: string) => finalizeEvent({ kind: 31124, created_at: S - 9000, content: '', tags: buildEggTags(ME, petId, S - 9000, name, { visualGeneration: 'v3' }).map((t) => (t[0] === 'stage' ? ['stage', 'adult'] : t)) }, sk);
const ADA = blobbi('000000000a', 'Ada');
const BO = blobbi('000000000b', 'Bo');
const CY = blobbi('000000000c', 'Cy');
const [dA, dB, dC] = ['000000000a', '000000000b', '000000000c'].map((p) => getCanonicalBlobbiD(ME, p));

const base = finalizeEvent({ kind: 11125, created_at: S - 3600, content: '{"daily":1}', tags: [...updateBlobbonautTags(buildBlobbonautTags(ME), { has: [dA, dB, dC], current_companion: dA, xp: '300' }), ['island_room', 'garden']] }, sk);
const standaloneChose = (d: string, at: number) =>
  finalizeEvent({ kind: 11125, created_at: at, content: base.content, tags: [...updateBlobbonautTags(base.tags.filter((t) => t[0] !== 'current_companion'), { current_companion: d }).filter((t) => t[0] !== 'client'), ['client', 'Blobbi'], ['published_at', String(base.created_at)]] }, sk);
const dittoChose = (d: string, at: number) => finalizeEvent({ kind: 11125, created_at: at, content: base.content, tags: updateBlobbonautTags(base.tags.filter((t) => t[0] !== 'current_companion'), { current_companion: d }) }, sk);

async function resolveWith(profiles: NostrEvent[]) {
  const answer = (events: NostrEvent[]): Promise<ProfileReadResult> => Promise.resolve({ events: events.map(wire), reachable: READ_RELAYS.length });
  return resolveCurrentBlobbi(ME, { relays: READ_RELAYS, timeoutMs: 200, profiles: { readBlobbonaut: () => answer(profiles) }, blobbis: { readBlobbis: () => answer([ADA, BO, CY]) } });
}
// The Blobbi walking here: Ada, adopted from the profile an hour ago
const walking: LocalCompanion = { d: dA, name: 'Ada', at: (S - 3600) * 1000, by: 'remote', synced: { id: base.id, createdAt: base.created_at } };

describe('companion sync between Blobbi Standalone, Ditto and Blobbi Pixel', () => {
  it.each([
    ['Blobbi Standalone', standaloneChose(dB, S - 60), dB],
    ['Ditto', dittoChose(dC, S - 60), dC],
  ])('a choice made in %s: Pixel resolves it as the current Blobbi and brings it along (newer than the walking one)', async (_app, profile, d) => {
    const r = await resolveWith([base, profile]);
    expect(r.status).toBe('current');
    if (r.status !== 'current') return;
    expect(r.blobbi.d).toBe(d);
    expect(r.profileId).toBe(profile.id);
    expect(orderOf(walking, { status: 'current', d: r.blobbi.d, name: r.blobbi.name, id: r.profileId, createdAt: r.profileAt, walkable: true, item: r.blobbi }, NOW).winner).toBe('global');
  });

  it("Pixel's share is what Standalone and Ditto read: the kit's newest valid 11125, naming the Blobbi, nothing lost", async () => {
    const members = PUBLISH_RELAYS.map((url) => memoryRelay({ url, mode: 'live' }));
    members.forEach((m) => m.events.push(base));
    const out = await shareCompanion({ owner: ME, d: dC, at: NOW, over: { id: base.id, createdAt: base.created_at, d: dA } }, { store: memoryStore(), publisher: relayGroup(members, 'live'), sign: async (t) => finalizeEvent(t, sk), stillAccount: () => true, now: () => NOW, sleep: async () => {} });
    expect(out.kind).toBe('shared');
    // What Standalone's `fetchFreshBlobbonautProfile` and Ditto do: the newest valid 11125 by the author, parsed by the kit
    const newest = members[0].events.filter((e) => e.kind === 11125 && isValidBlobbonautEvent(e as never)).sort((a, b) => b.created_at - a.created_at)[0];
    const parsed = parseBlobbonautEvent(wire(newest) as never)!;
    expect(parsed.currentCompanion).toBe(dC);
    expect(parsed.has).toEqual([dA, dB, dC]);
    expect(parsed.xp).toBe(300);
    expect(parsed.allTags).toContainEqual(['island_room', 'garden']);
    expect(parsed.content).toBe(base.content);
  });

  it('Ditto unsets the companion: Pixel keeps the walking Blobbi (nothing is guessed)', async () => {
    const unset = finalizeEvent({ kind: 11125, created_at: S - 30, content: base.content, tags: base.tags.filter((t) => t[0] !== 'current_companion') }, sk);
    const r = await resolveWith([base, unset]);
    expect(r).toMatchObject({ status: 'no-selection', reason: 'no-companion' });
  });
});
