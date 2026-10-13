import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { memoryStore, saveKey } from '../src/game/persistence';

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.ts') ? [join(dir, f)] : []));

describe('cross-game and network boundaries', () => {
  const all = files('src');
  const inNostr = (f: string) => f.startsWith(join('src', 'nostr') + '/');

  it('only src/nostr/ may reach the network or a signer (M11B narrows the M6 rule; it never removes it)', () => {
    for (const f of all.filter((f) => !inNostr(f))) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/\bnew WebSocket\b|\bfetch\(|RTCPeerConnection|nostr-tools|@nostrify\/|\brelayInit\b|\.nostr\b/);
    }
  });

  it('nothing, not even src/nostr/, can publish, sign, encrypt, or handle a secret key (M11B is read-only)', () => {
    for (const f of all) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/signEvent|finalizeEvent|\.event\(|\bnip44\b|\bnip04\b|NSecSigner|NConnectSigner|generateSecretKey|getSecretKey|nsec1|bunker:\/\/|nostrconnect:/);
    }
  });

  it('gameplay, rendering, generation and the simulation never import the Nostr module; the UI sees only its port', () => {
    for (const f of all.filter((f) => !inNostr(f))) {
      const imports = [...readFileSync(f, 'utf8').matchAll(/from '((?:\.\.?\/)+)nostr\/([\w-]+)'/g)].map((m) => m[2]);
      if (!imports.length) continue;
      if (f === join('src', 'playground', 'main.ts')) continue; // the host wires the account
      expect(f.startsWith(join('src', 'ui') + '/'), f).toBe(true);
      expect(imports, f).toEqual(imports.map(() => 'port'));
      expect(readFileSync(f, 'utf8'), f).toMatch(/import type [^;]*nostr\/port/);
    }
  });
  it('a Blobbi travelling (teleporting) keeps its identity, and another Blobbi never writes this world\'s companion', () => {
    const store = memoryStore();
    const world = generateTurtleWorld('turtle-0');
    const a = new LiveWorld(world, 'blobbi-9', 16, { store });
    a.addFriendship(7);
    a.save();
    const record = store.get(saveKey(a.identity))!;
    expect(record).not.toMatch(/blobbi-9/); // the save belongs to the world, not to a Blobbi
    const b = new LiveWorld(world, 'blobbi-1', 16, { store });
    expect(b.companion.friendship).toBe(a.companion.friendship); // the island's companion record, whichever Blobbi visits
    expect(b.blobbi.identity).not.toBe(a.blobbi.identity);
  });
});
