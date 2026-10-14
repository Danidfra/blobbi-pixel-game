/**
 * M11D.5: Baby lifecycle fixes. A Baby stays a Baby when the island (the Carrier) grows: growth rebuilds the live
 * world from its save, and that rebuild used to drop the Blobbi's life stage (an adult until the next reload). The
 * Baby's shadow follows the Baby's own size; its gameplay footprint (collision, paths) stays the adult's.
 */
import { describe, expect, it } from 'vitest';
import { getCanonicalBlobbiD } from '@blobbi-kit/core';
import { resolveBlobbi, type BlobbiSource } from '../src/blobbi/source';
import { REST_POSE } from '../src/blobbi/sprite';
import { memoryStore } from '../src/game/persistence';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { rebuildFromSave } from '../src/sim/regrow';

const PK = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';
const src = (petId = '0000000001'): BlobbiSource => {
  const r = resolveBlobbi({ pubkey: PK, d: getCanonicalBlobbiD(PK, petId) });
  if (!r.ok) throw new Error(r.error);
  return r.source;
};

describe('M11D.5: island growth never changes the Blobbi (the Baby stays a Baby)', () => {
  it('a Baby is still the same Baby after the island grows (rebuild from the save), stage after stage', () => {
    const store = memoryStore();
    const base = generateTurtleWorld('turtle-0');
    let live = new LiveWorld(base, src(), 16, { store, stage: 'baby' });
    const seed = live.blobbi.seed;
    const height = live.blobbiSprite(REST_POSE).buffer.height;
    for (const stage of [1, 2, 3]) {
      live.devSetGrowthStage(stage);
      live = rebuildFromSave(live, { base, store, reveal: true });
      expect(live.world.growth?.stage ?? 0).toBe(stage);
      expect(live.blobbi.identity.stage).toBe('baby');
      expect(live.blobbi.seed).toBe(seed);
      expect(live.blobbi.source).toEqual(src());
      // What is drawn is the Baby's sprite, not an adult's.
      expect(live.blobbiSprite(REST_POSE).buffer.height).toBe(height);
    }
    // A reload (the stage read back from the selection) agrees with what growth left on screen.
    const reloaded = new LiveWorld(base, src(), 16, { store, stage: 'baby' });
    expect(reloaded.world.growth?.stage).toBe(3);
    expect(reloaded.blobbiSprite(REST_POSE).buffer.height).toBe(height);
  });

  it('the old callers passing a Blobbi to the rebuild cannot swap or grow the Blobbi', () => {
    const store = memoryStore();
    const base = generateTurtleWorld('turtle-0');
    const live = new LiveWorld(base, src(), 16, { store, stage: 'baby' });
    live.devSetGrowthStage(1);
    const grown = rebuildFromSave(live, { base, blobbi: 'blobbi-9', blobbiSize: 16, store, reveal: false });
    expect(grown.blobbi.source).toEqual(src());
    expect(grown.blobbi.identity.stage).toBe('baby');
  });

  it('an adult stays the same adult after growth (no regression)', () => {
    const store = memoryStore();
    const base = generateTurtleWorld('turtle-0');
    const live = new LiveWorld(base, src(), 16, { store });
    const sprite = live.blobbiSprite(REST_POSE).buffer.height;
    live.devSetGrowthStage(2);
    const grown = rebuildFromSave(live, { base, store, reveal: true });
    expect(grown.blobbi.identity.stage).toBe('adult');
    expect(grown.blobbiSprite(REST_POSE).buffer.height).toBe(sprite);
    const visitor = rebuildFromSave(new LiveWorld(base, 'blobbi-9', 16, { store }), { base, store, reveal: false });
    expect(visitor.blobbi.source).toEqual(new LiveWorld(base, 'blobbi-9', 16).blobbi.source);
  });

  it('playing (walking, quests, the clock) never evolves a Baby: nothing in the world writes the stage', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), src(), 16, { stage: 'baby' });
    live.brain.enabled = false;
    for (let i = 0; i < 240; i++) live.update(1 / 30, { up: false, down: i % 2 === 0, left: false, right: i % 3 === 0, interact: i % 7 === 0, plant: false });
    expect(live.blobbi.identity.stage).toBe('baby');
  });
});

describe('M11D.5: the Baby shadow is the Baby size; the footprint stays the adult one', () => {
  it('a Baby shadow is narrower than its footprint; an adult shadow is its footprint, unchanged', () => {
    for (const petId of ['0000000001', '00000000a7', '0000000c3f']) {
      const base = generateTurtleWorld('turtle-0');
      const adult = new LiveWorld(base, src(petId), 16);
      const baby = new LiveWorld(base, src(petId), 16, { stage: 'baby' });
      expect(adult.blobbi.shadowRx).toBe(adult.blobbi.footRx);
      expect([baby.blobbi.footRx, baby.blobbi.footRy]).toEqual([adult.blobbi.footRx, adult.blobbi.footRy]);
      expect(baby.blobbi.shadowRx).toBeLessThan(baby.blobbi.footRx);
      expect(baby.blobbi.shadowRx).toBeGreaterThanOrEqual(2);
      // The shadow fits under the Baby's body (half its rendered width at most).
      expect(baby.blobbi.shadowRx * 2 + 1).toBeLessThanOrEqual(baby.blobbiSprite(REST_POSE).buffer.width);
    }
  });

  it('switching stages recomputes the shadow (MY BLOBBIS, world forms)', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), src(), 16, { stage: 'baby' });
    const babyShadow = live.blobbi.shadowRx;
    live.setBlobbi(src(), 16, 'adult');
    expect(live.blobbi.shadowRx).toBe(live.blobbi.footRx);
    live.setBlobbi(src(), 16, 'baby');
    expect(live.blobbi.shadowRx).toBe(babyShadow);
  });
});
