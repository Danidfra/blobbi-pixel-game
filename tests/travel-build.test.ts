import { describe, expect, it } from 'vitest';
import { BLOBBI_WORLD_TRAVEL_RELAYS } from '@blobbi-kit/core';
import { checkTravelBuild } from '../src/game/travel-build';
import { worldTravelMode } from '../src/game/travel-host';
import { PUBLISH_RELAYS, READ_RELAYS } from '../src/nostr/relay-config';

describe('what a build says about world travel (travel-build.ts, checked by vite.config.ts)', () => {
  it('off by default, and off is silent', () => {
    for (const travel of [undefined, '', 'off']) {
      expect(checkTravelBuild({ travel, command: 'build' })).toEqual({ ok: true, on: false, message: null });
      expect(checkTravelBuild({ travel, publish: 'live', command: 'build' })).toEqual({ ok: true, on: false, message: null });
    }
  });

  it('a production build carries world travel only as a live build; the travel flag alone stops the build', () => {
    const rehearsal = checkTravelBuild({ travel: 'nostr', command: 'build' });
    expect(rehearsal.ok).toBe(false);
    expect(rehearsal.message).toMatch(/VITE_BLOBBI_PUBLISH=live/);
    expect(checkTravelBuild({ travel: 'nostr', publish: 'rehearsal', command: 'build' }).ok).toBe(false);
    const live = checkTravelBuild({ travel: 'nostr', publish: 'live', command: 'build' });
    expect(live).toMatchObject({ ok: true, on: true });
    expect(live.message).toMatch(/public travel relays/);
  });

  it('an unknown value is a mistake, never a quiet off', () => {
    for (const travel of ['on', 'true', 'Nostr', ' nostr', 'v1']) expect(checkTravelBuild({ travel, publish: 'live', command: 'build' }).ok).toBe(false);
  });

  it('a development server keeps its switches, and says when travel publishes to the public relays', () => {
    const dev = checkTravelBuild({ travel: 'nostr', command: 'serve' });
    expect(dev).toMatchObject({ ok: true, on: true });
    expect(dev.message).toMatch(/PUBLIC travel relays/);
  });

  it('the build check and the page agree: a production build that passes with travel on runs it, every other passes runs it off', () => {
    const none = new URLSearchParams();
    for (const travel of [undefined, '', 'off', 'nostr']) {
      for (const publish of [undefined, 'rehearsal', 'live']) {
        const check = checkTravelBuild({ travel, publish, command: 'build' });
        if (!check.ok) continue;
        expect(worldTravelMode({ buildMode: travel, dev: false, hash: none, stored: 'nostr', publishLive: publish === 'live' })).toBe(check.on ? 'nostr' : 'off');
      }
    }
  });

  it('the production Content-Security-Policy lets the page reach every world-travel relay', () => {
    const allowed = new Set([...PUBLISH_RELAYS, ...READ_RELAYS]);
    for (const url of BLOBBI_WORLD_TRAVEL_RELAYS) expect(allowed.has(url), url).toBe(true);
  });
});
