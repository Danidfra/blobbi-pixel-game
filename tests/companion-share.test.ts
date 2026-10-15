/**
 * Companion sync, the network half: sharing the player's choice as the profile's `current_companion` (kind 11125)
 * against in-memory relays (nothing leaves the machine; keys made for the test). Mirrors Blobbi Standalone's
 * `profile-write.test.ts`: the same safety rules, so both apps write the profile the same way.
 */
import { describe, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from 'nostr-tools/pure';
import { buildBlobbonautTags, getCanonicalBlobbiD, parseBlobbonautEvent, updateBlobbonautTags } from '@blobbi-kit/core';
import { memoryStore } from '../src/game/persistence';
import { memoryRelay, relayGroup } from '../src/nostr/publisher';
import { PUBLISH_RELAYS } from '../src/nostr/relay-config';
import { pendingShare, shareCompanion, type ShareDeps } from '../src/nostr/companion-share';
import { companionProfileTemplate, type EventTemplate } from '../src/nostr/canonical-events';

const [DITTO, PRIMAL, DREAMITH] = PUBLISH_RELAYS;
const NOW = 1_800_000_000_000;
const S = NOW / 1000;

function account() {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  return { pk, sign: (t: EventTemplate) => finalizeEvent(t, sk) as NostrEvent };
}
type Acc = ReturnType<typeof account>;
const dOf = (a: Acc, n: number) => getCanonicalBlobbiD(a.pk, String(n).padStart(10, '0'));

function profile(a: Acc, o: { has: string[]; companion?: string; at: number; extra?: string[][] }): NostrEvent {
  const tags = [...updateBlobbonautTags(buildBlobbonautTags(a.pk), { has: o.has, ...(o.companion ? { current_companion: o.companion } : {}), xp: '420' }), ...(o.extra ?? [])];
  return a.sign({ kind: 11125, created_at: o.at, tags, content: '{"daily":{"done":3}}' });
}

function network(faults: { down?: Set<string>; refuse?: Set<string>; forget?: Set<string> } = {}) {
  const members = PUBLISH_RELAYS.map((url) => memoryRelay({ url, mode: 'live', down: () => !!faults.down?.has(url), refuse: () => !!faults.refuse?.has(url), forget: () => !!faults.forget?.has(url) }));
  return { members, group: relayGroup(members, 'live'), faults, seed: (e: NostrEvent, on = PUBLISH_RELAYS) => members.forEach((m, i) => on.includes(PUBLISH_RELAYS[i]) && m.events.push(e)) };
}
type Net = ReturnType<typeof network>;
const on = (net: Net, url: string) => net.members[PUBLISH_RELAYS.indexOf(url)];
const newestOn = (net: Net, url: string) => on(net, url).events.filter((e) => e.kind === 11125).sort((a, b) => b.created_at - a.created_at)[0];
const sentProfiles = (net: Net) => net.members.flatMap((m) => m.sent).filter((e) => e.kind === 11125);

function deps(net: Net, a: Acc, over: Partial<ShareDeps> = {}) {
  const store = memoryStore();
  const signed: NostrEvent[] = [];
  const d: ShareDeps = {
    store,
    publisher: net.group,
    sign: async (t) => {
      const e = a.sign(t);
      signed.push(e);
      return e;
    },
    stillAccount: () => true,
    now: () => NOW,
    timeoutMs: 50,
    sleep: async () => {},
    ...over,
  };
  return { deps: d, signed, store };
}
const req = (a: Acc, d: string, over: { id: string; createdAt: number; d?: string } | null = null, at = NOW) => ({ owner: a.pk, d, at, over });

describe('sharing the companion chosen in Blobbi Pixel', () => {
  it('replaces only current_companion: every has, xp, extra tags and the content survive; read back from two relays', async () => {
    const a = account();
    const net = network();
    const base = profile(a, { has: [dOf(a, 1), dOf(a, 2), dOf(a, 3)], companion: dOf(a, 1), at: S - 100, extra: [['client', 'Blobbi'], ['room', 'garden']] });
    net.seed(base);
    const out = await shareCompanion(req(a, dOf(a, 2)), deps(net, a).deps);
    expect(out.kind).toBe('shared');
    const w = newestOn(net, DITTO);
    expect(parseBlobbonautEvent(w as never)?.currentCompanion).toBe(dOf(a, 2));
    expect(w.tags.filter((t) => t[0] === 'has').map((t) => t[1])).toEqual([dOf(a, 1), dOf(a, 2), dOf(a, 3)]);
    expect(w.tags).toContainEqual(['room', 'garden']);
    expect(w.content).toBe(base.content);
    expect(w.created_at).toBeGreaterThan(base.created_at);
  });

  it('a rehearsal build shares nothing', async () => {
    const a = account();
    const rehearsal = memoryRelay();
    const run = deps(network(), a, { publisher: rehearsal });
    expect((await shareCompanion(req(a, dOf(a, 2)), run.deps)).kind).toBe('rehearsal');
    expect(run.signed).toHaveLength(0);
  });

  it('never builds over an incomplete read (a required relay down): nothing signed or sent', async () => {
    const a = account();
    const net = network({ down: new Set([PRIMAL]) });
    net.seed(profile(a, { has: [dOf(a, 1)], companion: dOf(a, 1), at: S - 100 }));
    const run = deps(net, a);
    expect((await shareCompanion(req(a, dOf(a, 2)), run.deps)).kind).toBe('unsafe');
    expect(run.signed).toHaveLength(0);
    expect(sentProfiles(net)).toHaveLength(0);
  });

  it('dreamith down does not stop it (not a required relay)', async () => {
    const a = account();
    const net = network({ down: new Set([DREAMITH]) });
    net.seed(profile(a, { has: [dOf(a, 1)], companion: dOf(a, 1), at: S - 100 }));
    expect((await shareCompanion(req(a, dOf(a, 2)), deps(net, a).deps)).kind).toBe('shared');
  });

  it('builds over the newest profile, even one only primal has (a partial relay answer)', async () => {
    const a = account();
    const net = network();
    net.seed(profile(a, { has: [dOf(a, 1)], companion: dOf(a, 1), at: S - 500 }));
    net.seed(profile(a, { has: [dOf(a, 1), dOf(a, 3)], companion: dOf(a, 3), at: S - 100 }), [PRIMAL]);
    await shareCompanion(req(a, dOf(a, 2)), deps(net, a).deps);
    expect(newestOn(net, DITTO).tags.filter((t) => t[0] === 'has').map((t) => t[1])).toEqual([dOf(a, 1), dOf(a, 3), dOf(a, 2)]);
  });

  it('never makes a profile; nothing when it already names the Blobbi', async () => {
    const a = account();
    const empty = network();
    expect((await shareCompanion(req(a, dOf(a, 1)), deps(empty, a).deps)).kind).toBe('no-profile');
    const net = network();
    net.seed(profile(a, { has: [dOf(a, 1)], companion: dOf(a, 1), at: S - 100 }));
    expect((await shareCompanion(req(a, dOf(a, 1)), deps(net, a).deps)).kind).toBe('unchanged');
    expect(sentProfiles(net)).toHaveLength(0);
  });

  it('a choice made clearly later elsewhere (Ditto, Standalone) is never overwritten; too close: nothing written', async () => {
    const a = account();
    const seen = profile(a, { has: [dOf(a, 1), dOf(a, 2), dOf(a, 3)], companion: dOf(a, 1), at: S - 3600 });
    const later = network();
    later.seed(profile(a, { has: [dOf(a, 1), dOf(a, 2), dOf(a, 3)], companion: dOf(a, 3), at: S - 600 }));
    expect(await shareCompanion(req(a, dOf(a, 2), { id: seen.id, createdAt: seen.created_at, d: dOf(a, 1) }, NOW - 1_800_000), deps(later, a).deps)).toMatchObject({ kind: 'superseded', profile: { d: dOf(a, 3) } });
    const close = network();
    close.seed(profile(a, { has: [dOf(a, 1), dOf(a, 2), dOf(a, 3)], companion: dOf(a, 3), at: S - 20 }));
    expect((await shareCompanion(req(a, dOf(a, 2), { id: seen.id, createdAt: seen.created_at, d: dOf(a, 1) }, NOW - 45_000), deps(close, a).deps)).kind).toBe('ambiguous');
    expect(sentProfiles(later).concat(sentProfiles(close))).toHaveLength(0);
  });

  it('the share right after the choice is the latest act: written over a profile made moments before, never asked', async () => {
    const a = account();
    const net = network();
    net.seed(profile(a, { has: [dOf(a, 1), dOf(a, 2), dOf(a, 3)], companion: dOf(a, 3), at: S - 8 }));
    expect((await shareCompanion(req(a, dOf(a, 2), null, NOW - 1_000), deps(net, a).deps)).kind).toBe('shared');
  });

  it('a profile written between the read and the send is built over, never replaced', async () => {
    const a = account();
    const net = network();
    const seen = profile(a, { has: [dOf(a, 1), dOf(a, 2)], companion: dOf(a, 1), at: S - 100 });
    net.seed(seen);
    let once = false;
    const run = deps(net, a, {
      sign: vi.fn(async (t: EventTemplate) => {
        if (!once) {
          once = true;
          net.seed(profile(a, { has: [dOf(a, 1), dOf(a, 2), dOf(a, 3)], companion: dOf(a, 1), at: S - 10 }));
        }
        return a.sign(t);
      }),
    });
    expect((await shareCompanion(req(a, dOf(a, 2), { id: seen.id, createdAt: seen.created_at, d: dOf(a, 1) }), run.deps)).kind).toBe('shared');
    expect(newestOn(net, DITTO).tags.filter((t) => t[0] === 'has').map((t) => t[1])).toContain(dOf(a, 3));
  });

  it('partial (a relay refuses): stored; the retry sends the very same event to the missing relays only', async () => {
    const a = account();
    const net = network({ refuse: new Set([PRIMAL, DREAMITH]) });
    net.seed(profile(a, { has: [dOf(a, 1)], companion: dOf(a, 1), at: S - 100 }));
    const run = deps(net, a);
    expect((await shareCompanion(req(a, dOf(a, 2)), run.deps)).kind).toBe('partial');
    const stored = pendingShare(run.store, a.pk, dOf(a, 2))!;
    expect(stored.event.id).toBe(run.signed[0].id);
    net.faults.refuse!.clear();
    expect((await shareCompanion(req(a, dOf(a, 2)), run.deps)).kind).toBe('shared');
    expect(run.signed).toHaveLength(1);
    expect(new Set(sentProfiles(net).map((e) => e.id))).toEqual(new Set([stored.event.id]));
    expect(on(net, DITTO).sent.filter((e) => e.kind === 11125)).toHaveLength(1);
    expect(pendingShare(run.store, a.pk, dOf(a, 2))).toBeNull();
  });

  it('a relay that says OK and loses it does not count', async () => {
    const a = account();
    const net = network({ forget: new Set([DITTO]) });
    net.seed(profile(a, { has: [dOf(a, 1)], companion: dOf(a, 1), at: S - 100 }));
    expect((await shareCompanion(req(a, dOf(a, 2)), deps(net, a).deps)).kind).toBe('partial');
  });

  it('a stored write superseded by a newer choice elsewhere is dropped, never sent', async () => {
    const a = account();
    const net = network();
    const base = profile(a, { has: [dOf(a, 1), dOf(a, 2), dOf(a, 3)], companion: dOf(a, 1), at: S - 600 });
    net.seed(base);
    const run = deps(net, a);
    const mine = a.sign(companionProfileTemplate(a.pk, dOf(a, 2), S - 500, base));
    run.store.set('blobbi-pixel-lab:companion-share', JSON.stringify({ version: 1, runs: { [a.pk]: { owner: a.pk, d: dOf(a, 2), event: mine, base: { id: base.id, createdAt: base.created_at }, seenOn: [] } } }));
    net.seed(profile(a, { has: [dOf(a, 1), dOf(a, 2), dOf(a, 3)], companion: dOf(a, 3), at: S - 60 }));
    expect(await shareCompanion(req(a, dOf(a, 2)), run.deps)).toMatchObject({ kind: 'superseded', profile: { d: dOf(a, 3) } });
    expect(sentProfiles(net)).toHaveLength(0);
    expect(pendingShare(run.store, a.pk, dOf(a, 2))).toBeNull();
  });

  it('a refused signature, another key, or the account gone mid-way: nothing sent', async () => {
    const a = account();
    const b = account();
    for (const over of [{ sign: async () => Promise.reject(new Error('rejected')) }, { sign: async (t: EventTemplate) => b.sign(t) }, { stillAccount: (() => { let n = 0; return () => ++n < 2; })() }] as Partial<ShareDeps>[]) {
      const net = network();
      net.seed(profile(a, { has: [dOf(a, 1)], companion: dOf(a, 1), at: S - 100 }));
      const out = await shareCompanion(req(a, dOf(a, 2)), deps(net, a, over).deps);
      expect(['sign-failed', 'wrong-account']).toContain(out.kind);
      expect(sentProfiles(net)).toHaveLength(0);
    }
  });
});
