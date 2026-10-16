/**
 * Companion sync, the game's half (no network: a host double): what is shared and when, what comes along from
 * another app and when, the question, retries, and accounts.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { CompanionSync, type CompanionHost, type LocalCompanion, type RemoteCompanion, type ShareResult } from '../src/game/companion-sync';

const ME = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const NOW = 1_800_000_000_000;
const S = NOW / 1000;
const d = (n: number) => `blobbi-${'a'.repeat(12)}-${String(n).padStart(10, '0')}`;
const id = (c: string) => c.repeat(64);

function setup(o: { local?: LocalCompanion | null; remote?: RemoteCompanion | null; share?: ShareResult; present?: boolean } = {}) {
  const state = {
    account: { pubkey: ME, present: o.present ?? true } as { pubkey: string; present: boolean } | null,
    local: (o.local === undefined ? { d: d(1), name: 'Ada', at: NOW - 3_600_000, by: 'player', synced: { id: id('1'), createdAt: S - 3_600 } } : o.local) as LocalCompanion | null,
    remote: (o.remote === undefined ? { status: 'current', d: d(1), name: 'Ada', id: id('1'), createdAt: S - 3_600, walkable: true, item: null } : o.remote) as RemoteCompanion | null,
    shareResult: o.share ?? ('shared' as ShareResult),
    calm: true,
    online: true,
  };
  const host = {
    account: () => state.account,
    local: () => state.local,
    resolve: vi.fn(async () => state.remote),
    share: vi.fn(async (_req: { owner: string; d: string }) => ({ kind: state.shareResult, stamp: { id: id('9'), createdAt: S } })),
    bring: vi.fn((r: Extract<RemoteCompanion, { status: 'current' }>) => {
      state.local = { d: r.d, name: r.name, at: r.createdAt * 1000, by: 'remote', synced: { id: r.id, createdAt: r.createdAt } };
    }),
    markSynced: vi.fn((dd: string, s: { id: string; createdAt: number }) => {
      if (state.local?.d === dd) state.local = { ...state.local, synced: s };
    }),
    restamp: vi.fn((over) => {
      if (state.local) state.local = { ...state.local, at: NOW, by: 'player', synced: null, over };
    }),
    calm: () => state.calm,
    online: () => state.online,
    now: () => NOW,
    notify: vi.fn(),
  } satisfies CompanionHost;
  return { state, host, sync: new CompanionSync(host) };
}
const chooseHere = (state: ReturnType<typeof setup>['state'], n: number, name: string) => {
  state.local = { d: d(n), name, at: NOW, by: 'player', synced: null, over: { id: id('1'), createdAt: S - 3_600, d: d(1) } };
};

describe('companion sync in Blobbi Pixel', () => {
  it('a choice made here is shared once and marked as carried by the profile', async () => {
    const { state, host, sync } = setup();
    chooseHere(state, 2, 'Bo');
    await sync.chosen();
    expect(host.share).toHaveBeenCalledTimes(1);
    expect(host.share.mock.calls[0][0]).toMatchObject({ owner: ME, d: d(2) });
    expect(host.markSynced).toHaveBeenCalledWith(d(2), { id: id('9'), createdAt: S });
    expect(sync.status.kind).toBe('shared');
  });

  it('looking (start-up, automatic entry, every minute) never shares, even a choice not shared yet', async () => {
    const { state, host, sync } = setup();
    chooseHere(state, 2, 'Bo');
    await sync.check();
    expect(host.share).not.toHaveBeenCalled();
    expect(sync.status).toEqual({ kind: 'waiting', reason: 'not-sent' });
  });

  it('a read-only session (the identity is not really here) never shares', async () => {
    const { state, host, sync } = setup({ present: false });
    chooseHere(state, 2, 'Bo');
    await sync.chosen();
    expect(host.share).not.toHaveBeenCalled();
  });

  it('a newer choice from Standalone or Ditto comes along, but only in a calm moment; never shared again', async () => {
    const { state, host, sync } = setup();
    state.remote = { status: 'current', d: d(3), name: 'Cy', id: id('3'), createdAt: S - 60, walkable: true, item: null };
    state.calm = false;
    await sync.check();
    expect(host.bring).not.toHaveBeenCalled();
    expect(sync.bringing).toBe(true);
    sync.tick();
    expect(host.bring).not.toHaveBeenCalled();
    state.calm = true;
    sync.tick();
    expect(host.bring).toHaveBeenCalledTimes(1);
    expect(host.notify).toHaveBeenCalledWith('came', { name: 'Cy' });
    expect(host.share).not.toHaveBeenCalled();
  });

  it('a choice shared from here never blocks a later one made elsewhere', async () => {
    const { state, host, sync } = setup();
    chooseHere(state, 2, 'Bo');
    await sync.chosen();
    state.remote = { status: 'current', d: d(3), name: 'Cy', id: id('3'), createdAt: S + 1, walkable: true, item: null };
    await sync.check();
    expect(host.bring).toHaveBeenCalled();
  });

  it('two choices too close in time: nothing comes along by itself; the player is asked (once) and answers', async () => {
    const { state, host, sync } = setup();
    state.local = { d: d(2), name: 'Bo', at: NOW - 20_000, by: 'player', synced: null, over: { id: id('1'), createdAt: S - 3_600, d: d(1) } };
    state.remote = { status: 'current', d: d(3), name: 'Cy', id: id('3'), createdAt: S - 10, walkable: true, item: null };
    await sync.check();
    await sync.check();
    expect(host.bring).not.toHaveBeenCalled();
    expect(sync.ambiguity?.there.d).toBe(d(3));
    expect(host.notify.mock.calls.filter((c) => c[0] === 'ask')).toHaveLength(1);
    await sync.answer(true);
    expect(host.restamp).toHaveBeenCalled();
    expect(host.share).toHaveBeenCalledTimes(1);
  });

  it('answering "the other one" brings it, and shares nothing', async () => {
    const { state, host, sync } = setup();
    state.local = { d: d(2), name: 'Bo', at: NOW - 20_000, by: 'player', synced: null };
    state.remote = { status: 'current', d: d(3), name: 'Cy', id: id('3'), createdAt: S - 10, walkable: true, item: null };
    await sync.check();
    await sync.answer(false);
    expect(host.bring).toHaveBeenCalledTimes(1);
    expect(host.share).not.toHaveBeenCalled();
  });

  it('offline: waits and says so; shared when the connection comes back', async () => {
    const { state, host, sync } = setup();
    state.online = false;
    chooseHere(state, 2, 'Bo');
    await sync.chosen();
    expect(sync.status).toEqual({ kind: 'waiting', reason: 'offline' });
    expect(host.notify).toHaveBeenCalledWith('offline', { name: 'Bo' });
    expect(host.share).not.toHaveBeenCalled();
    state.online = true;
    sync.online();
    await vi.waitFor(() => expect(sync.status.kind).toBe('shared'));
  });

  it('a failed share is said once and retried by TRY AGAIN; a signer that said no is not retried by itself', async () => {
    const { state, host, sync } = setup({ share: 'failed' });
    chooseHere(state, 2, 'Bo');
    await sync.chosen();
    expect(sync.status).toEqual({ kind: 'waiting', reason: 'failed' });
    expect(host.notify).toHaveBeenCalledWith('not-shared', { name: 'Bo' });
    state.shareResult = 'shared';
    await sync.retry();
    expect(sync.status.kind).toBe('shared');
    const refused = setup({ share: 'sign-failed' });
    chooseHere(refused.state, 2, 'Bo');
    vi.useFakeTimers();
    await refused.sync.chosen();
    await vi.advanceTimersByTimeAsync(300_000);
    vi.useRealTimers();
    expect(refused.host.share).toHaveBeenCalledTimes(1);
    expect(refused.host.notify).toHaveBeenCalledWith('sign-failed', { name: 'Bo' });
  });

  it('no profile anywhere, or a rehearsal build: the choice simply stays on this device, nothing said', async () => {
    for (const result of ['no-profile', 'rehearsal'] as const) {
      const { state, host, sync } = setup({ share: result });
      chooseHere(state, 2, 'Bo');
      await sync.chosen();
      expect(sync.status.kind).toBe('local-only');
      expect(host.notify).not.toHaveBeenCalled();
    }
  });

  it('switching accounts: a share out for the old account is dropped; nothing of it reaches the new one', async () => {
    const { state, host, sync } = setup();
    chooseHere(state, 2, 'Bo');
    let release!: () => void;
    host.share.mockImplementationOnce(() => new Promise((r) => (release = () => r({ kind: 'shared', stamp: { id: id('9'), createdAt: S } }))));
    const out = sync.chosen();
    state.account = { pubkey: OTHER, present: true };
    state.local = null;
    release();
    await out;
    expect(host.markSynced).not.toHaveBeenCalled();
    sync.accountChanged();
    expect(sync.status.kind).toBe('idle');
    expect(sync.ambiguity).toBeNull();
  });

  it('the same Blobbi on both sides: a choice waiting to be shared counts as shared, nothing is sent', async () => {
    const { state, host, sync } = setup();
    state.local = { d: d(3), name: 'Cy', at: NOW - 5_000, by: 'player', synced: null };
    state.remote = { status: 'current', d: d(3), name: 'Cy', id: id('3'), createdAt: S - 2, walkable: true, item: null };
    await sync.check();
    expect(host.markSynced).toHaveBeenCalledWith(d(3), { id: id('3'), createdAt: S - 2 });
    expect(host.share).not.toHaveBeenCalled();
  });
});

describe('companion sync: the wiring in main.ts', () => {
  const src = readFileSync('src/playground/main.ts', 'utf8');
  const fn = (name: string) => src.slice(src.indexOf(name), src.indexOf('\n}\n', src.indexOf(name)));

  it("shares only the player's own choice of the connected account's Blobbi; an adopted choice never", () => {
    const select = fn('function selectBlobbi(');
    expect(select).toMatch(/const mine = when\.by === 'player' && !!from\?\.account && from\.account === connectedPubkey;/);
    expect(select).toMatch(/if \(mine\) void companion\.chosen\(\);/);
    expect(src).toMatch(/bring: \(r\) => void blobbisScreen\.chooser\?\.choose\(r\.item as OwnedBlobbi, \{ at: r\.createdAt \* 1000, by: 'remote', synced: \{ id: r\.id, createdAt: r\.createdAt \} \}\)/);
  });

  it('a stage refreshed in MY BLOBBIS (a Blobbi grown up in another app) is never a choice: never stamped, never shared', () => {
    const screen = readFileSync('src/ui/screens/blobbis.ts', 'utf8');
    expect(screen).toMatch(/this\.chooser\.selectedStage\(\) !== walking\.stage\) this\.chooser\.refreshStage\?\.\(walking\);/);
    expect(screen).not.toMatch(/selectedStage\(\) !== walking\.stage\) this\.chooser\.choose\(/);
    const refresh = src.slice(src.indexOf('refreshStage: (b) =>'), src.indexOf('useVisitor: () =>', src.indexOf('refreshStage: (b) =>')));
    expect(refresh).toMatch(/setSelectionStage\(st, b\.address/);
    expect(refresh).not.toMatch(/selectBlobbi|storeSelection|companion\.|markSelectionChosen|playerNow/);
  });

  it('never from a read-only session: the extension must have answered with the key, and the account must still be it', () => {
    expect(src).toMatch(/present: s\.method === 'vault' \|\| s\.extension === 'verified'/);
    expect(src).toMatch(/stillAccount: \(\) => \{\s*const now = companionPresent\(\);\s*return !!now && now\.present && now\.pubkey === req\.owner;/);
  });

  it('the automatic entry and the periodic look only read; nothing in them shares', () => {
    const auto = fn('async function autoEnter(');
    expect(auto).not.toMatch(/companion\.(chosen|retry)\(/);
    expect(src).toMatch(/const lookAtCompanion = \(\) => \{\s*if \(document\.visibilityState === 'visible' && entryTried && !entry\.active\) void companion\.check\(\);/);
  });

  it('a remote choice comes along only in a calm moment (the frame asks): no menu, speech, timed action, teleport, cinematic', () => {
    expect(src).toMatch(/calm: companionCalm,/);
    const calm = fn('function companionCalm(');
    expect(calm).toMatch(/menuOpen: gameUI\.capturing/);
    expect(calm).toMatch(/l\.getPresenceState\(\) !== 'present'/);
    expect(calm).toMatch(/intro: !!intro/);
    expect(src).toMatch(/updateNaming\(real\);\s*\/\/[^\n]*\n\s*companion\.tick\(\);/);
  });
});

