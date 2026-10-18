import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { claimTab, GAME_LOCK, type TabLocks } from '../src/game/single-tab';

/** A browser's lock manager for one origin, shared by the "tabs" that use it. */
function lockManager() {
  let held: { name: string; done: Promise<unknown> } | null = null;
  const queue: Array<() => void> = [];
  const grant = (name: string, fn: (lock: unknown) => Promise<unknown> | null) => {
    const done = Promise.resolve(fn({ name }));
    held = { name, done };
    void done.then(() => {
      held = null;
      queue.shift()?.();
    });
    return done;
  };
  const locks: TabLocks = {
    request(name: string, a: unknown, b?: unknown): Promise<unknown> {
      const fn = (typeof a === 'function' ? a : b) as (lock: unknown) => Promise<unknown> | null;
      const ifAvailable = typeof a === 'object' && (a as { ifAvailable?: boolean }).ifAvailable;
      if (!held) return grant(name, fn);
      if (ifAvailable) return Promise.resolve(fn(null));
      return new Promise((resolve) => queue.push(() => resolve(grant(name, fn))));
    },
  };
  return { locks, isHeld: () => !!held };
}

function fakeWindow() {
  const handlers = new Map<string, Array<(e: unknown) => void>>();
  return {
    addEventListener: (type: string, fn: (e: unknown) => void) => handlers.set(type, [...(handlers.get(type) ?? []), fn]),
    fire: (type: string, e: unknown = {}) => handlers.get(type)?.forEach((fn) => fn(e)),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('one game per browser (the game lock)', () => {
  it('the first tab starts the game at once and holds the lock', async () => {
    const m = lockManager();
    let starts = 0;
    expect(await claimTab({ locks: m.locks, start: () => starts++, waiting: () => {} })).toBe('started');
    expect(starts).toBe(1);
    expect(m.isHeld()).toBe(true);
  });

  it('a second tab never starts while the first is open: it says so and waits', async () => {
    const m = lockManager();
    const first = fakeWindow();
    await claimTab({ locks: m.locks, win: first as never, start: () => {}, waiting: () => {} });
    let starts = 0;
    let waits = 0;
    expect(await claimTab({ locks: m.locks, start: () => starts++, waiting: () => waits++ })).toBe('waiting');
    await tick();
    expect(starts).toBe(0);
    expect(waits).toBe(1);
  });

  it('the waiting tab starts by itself, once, when the first tab goes away', async () => {
    const m = lockManager();
    const first = fakeWindow();
    await claimTab({ locks: m.locks, win: first as never, start: () => {}, waiting: () => {} });
    let starts = 0;
    await claimTab({ locks: m.locks, start: () => starts++, waiting: () => {} });
    first.fire('pagehide');
    await tick();
    await tick();
    expect(starts).toBe(1);
    expect(m.isHeld()).toBe(true);
  });

  it('a page restored from the back/forward cache reloads instead of running beside the new holder', async () => {
    const m = lockManager();
    const w = fakeWindow();
    let reloads = 0;
    await claimTab({ locks: m.locks, win: w as never, start: () => {}, waiting: () => {}, reload: () => reloads++ });
    w.fire('pagehide', { persisted: true });
    w.fire('pageshow', { persisted: false });
    expect(reloads).toBe(0);
    w.fire('pageshow', { persisted: true });
    expect(reloads).toBe(1);
  });

  it('without Web Locks the game starts as before (unguarded)', async () => {
    let starts = 0;
    expect(await claimTab({ locks: undefined, start: () => starts++, waiting: () => {} })).toBe('unguarded');
    expect(starts).toBe(1);
  });

  it('the page loads the game only through the lock, and never steals it', () => {
    expect(readFileSync('index.html', 'utf8')).toMatch(/src="\/src\/playground\/boot\.ts"/);
    expect(readFileSync('index.html', 'utf8')).not.toMatch(/playground\/main\.ts/);
    const boot = readFileSync('src/playground/boot.ts', 'utf8');
    expect(boot).toMatch(/import\('\.\/main'\)/);
    expect(boot).not.toMatch(/^import .*['"]\.\/main['"]/m);
    expect(readFileSync('src/game/single-tab.ts', 'utf8')).not.toMatch(/steal:/);
    expect(GAME_LOCK).toBe('blobbi-pixel:game');
  });
});
