import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { memoryStore, saveKey } from '../src/game/persistence';

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.ts') ? [join(dir, f)] : []));

describe('cross-game and network boundaries (M6: architecture only)', () => {
  it('no module talks to the network, signs, or publishes Nostr events', () => {
    for (const f of files('src')) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/\bnew WebSocket\b|\bfetch\(|RTCPeerConnection|nostr-tools|signEvent|\bfinalizeEvent\b|\brelayInit\b/);
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
