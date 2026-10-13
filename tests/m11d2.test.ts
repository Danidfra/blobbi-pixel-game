/**
 * M11D.2: world forms for V1/V2 Blobbis, departure and arrival when the Blobbi changes, Baby particles on the Baby's
 * own body, Baby tools flush with the body; and nothing published, no secret anywhere, saves untouched.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildEggTags, deriveBlobbiV3Seed, getCanonicalBlobbiD } from '@blobbi-kit/core';
import { generateGenome } from '@blobbi-kit/renderer/procedural';
import { cleanWorldFormTraits, isWorldFormSeed, validWorldForm, worldFormGenome, worldFormSeed, WORLD_FORM_VERSION, type WorldFormTraits } from '../src/blobbi/world-form';
import { resolveBlobbi, sourceFromSeed, worldFormSource, type BlobbiSource } from '../src/blobbi/source';
import { identityOfSource, stagedIdentity } from '../src/blobbi/identity';
import { buildBlobbiSprite, REST_POSE, type BlobbiPose } from '../src/blobbi/sprite';
import { babyHeightFor } from '../src/blobbi/canonical';
import { pickBlobbis } from '../src/nostr/blobbis';
import type { OwnedBlobbi } from '../src/nostr/port';
import { effectiveSelection, loadSelection, loadSelectionRecord, SELECTION_KEY, storeSelection } from '../src/game/blobbi-selection';
import { acceptWorldForm, worldFormSeen, WORLD_FORMS_KEY } from '../src/game/world-form-memory';
import { memoryStore, saveKey } from '../src/game/persistence';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { IDLE_INPUT, LiveWorld } from '../src/sim/live-world';
import { DEPART, ARRIVE } from '../src/game/teleport';
import { attachTool, EquipmentRig } from '../src/game/equipment';
import { ITEMS } from '../src/game/items';
import { paletteFor } from '../src/world/generate';
import { GameUI } from '../src/ui/game-ui';
import { BlobbisScreen, isWorldForm, worldFormOf, type BlobbiChooser } from '../src/ui/screens/blobbis';
import { PixelBuffer, type Sprite } from '../src/core/pixel';
import { en } from '../src/i18n/messages/en';
import { ptBR } from '../src/i18n/messages/pt-BR';
import { es } from '../src/i18n/messages/es';
import { SAMPLE_PETS, sampleV3Seed } from '../src/dev/baby-sheet';

const PK = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';
const PK2 = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';
const D1 = getCanonicalBlobbiD(PK, '00000000c1');
const TRAITS: WorldFormTraits = { base: '#ff9900', secondary: '#3355ff', eye: '#222222', pattern: 'striped', mark: 'star' };
const palette = paletteFor('cozy');
const world = generateTurtleWorld('turtle-0');
const form = (d = D1, traits = TRAITS, gen: 'v1' | 'v2' = 'v1') => worldFormSource(PK, d, gen, traits)!;
const run = (live: LiveWorld, seconds: number, input = {}) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) live.update(1 / 60, { ...IDLE_INPUT, ...input });
};

let serial = 0;
function blobbiEvent(o: { pet: string; name?: string; gen?: 'v1' | 'v2' | 'v3'; stage?: 'egg' | 'baby' | 'adult'; at?: number; colours?: [string, string, string] }) {
  let tags = buildEggTags(PK, o.pet, 1_700_000_000, o.name ?? 'Pip', { visualGeneration: o.gen ?? 'v3' }).map((t) => (t[0] === 'stage' ? ['stage', o.stage ?? 'adult'] : t));
  if (o.colours) tags = tags.filter((t) => !['base_color', 'secondary_color', 'eye_color'].includes(t[0])).concat([['base_color', o.colours[0]], ['secondary_color', o.colours[1]], ['eye_color', o.colours[2]]]);
  return { id: (++serial).toString(16).padStart(64, '0'), pubkey: PK, created_at: o.at ?? 1_700_000_000 + serial, kind: 31124, tags, content: '', sig: 'a'.repeat(128) };
}

describe('world forms: the same Blobbi, the same temporary form', () => {
  it('is deterministic: the same address and look give the same genome and pixels, on every call', () => {
    const a = buildBlobbiSprite(identityOfSource(form(), 'adult'), REST_POSE, 24);
    const b = buildBlobbiSprite(identityOfSource(form(), 'adult'), REST_POSE, 24);
    expect(a.buffer.data).toEqual(b.buffer.data);
    expect(worldFormGenome(PK, D1, TRAITS)).toEqual(worldFormGenome(PK, D1, { ...TRAITS }));
    expect(WORLD_FORM_VERSION).toBe(1);
  });

  it('is derived from the canonical address: another d or owner is another form; never a V3 seed, never random', () => {
    const other = getCanonicalBlobbiD(PK, '00000000c2');
    expect(worldFormGenome(PK, other, TRAITS).morphology).not.toEqual(worldFormGenome(PK, D1, TRAITS).morphology);
    expect(worldFormSeed(PK, D1)).toBe(`blobbi-pixel:world-form:v1:${PK}:${D1}`);
    expect(isWorldFormSeed(form().seed)).toBe(true);
    expect(form().seed).not.toMatch(/^[0-9a-f]{64}$/);
    expect(form().seed).not.toBe(deriveBlobbiV3Seed(PK, D1));
    // Typed into the lab, the world-form seed is only a demo string: never resolved as a V3 identity.
    expect(sourceFromSeed(form().seed).kind).toBe('demo');
  });

  it('keeps the colours, pattern and mark its event states; blush becomes freckles; unknown words read plainly', () => {
    const g = worldFormGenome(PK, D1, TRAITS);
    expect(g.colors).toMatchObject({ base: '#ff9900', secondary: '#3355ff', eye: '#222222' });
    expect(g.traits.pattern.kind).toBe('striped');
    expect(g.traits.mark.kind).toBe('star');
    const blush = worldFormGenome(PK, D1, { ...TRAITS, mark: 'blush', pattern: 'spotted' });
    expect(blush.traits.mark.kind).toBe('none');
    expect(blush.traits.freckles.enabled).toBe(true);
    expect(blush.traits.pattern.kind).toBe('spotted');
    expect(cleanWorldFormTraits({ base: '#FF9900', secondary: '#3355ff', eye: '#222222', pattern: 'plaid', mark: 'moonbeam' })).toEqual({ ...TRAITS, pattern: 'solid', mark: 'none' });
    expect(cleanWorldFormTraits({ base: 'red', secondary: '#3355ff', eye: '#222222' })).toBe(null);
  });

  it('a Baby is the pixel Baby body, an Adult the pixel Adult body, in the same colours', () => {
    const baby = buildBlobbiSprite(identityOfSource(form(), 'baby'), REST_POSE, 48);
    const adult = buildBlobbiSprite(identityOfSource(form(), 'adult'), REST_POSE, 48);
    expect(identityOfSource(form(), 'baby').stage).toBe('baby');
    expect(baby.buffer.height).toBeLessThan(adult.buffer.height);
    // The identity's genome is the world form's, never the plain seed's (which would lose the event's colours).
    expect(identityOfSource(form(), 'adult').genome.colors.base).toBe('#ff9900');
    expect(generateGenome(form().seed).colors.base).not.toBe('#ff9900');
  });

  it('never touches the canonical identity: the source keeps owner, d and generation; the event is read, not changed', () => {
    const f = form(D1, TRAITS, 'v2');
    expect(f).toMatchObject({ kind: 'world-form', pubkey: PK, d: D1, generation: 'v2' });
    const event = Object.freeze(blobbiEvent({ pet: '00000000c1', gen: 'v1', stage: 'baby' }));
    const before = JSON.stringify(event);
    pickBlobbis([event], PK);
    expect(JSON.stringify(event)).toBe(before);
    expect(validWorldForm({ ...f, seed: worldFormSeed(PK2, D1) })).toBe(false);
    expect(validWorldForm({ ...f, generation: 'v3' })).toBe(false);
  });
});

describe('V1/V2 Babies and Adults visit in their world forms', () => {
  const items = pickBlobbis(
    [
      blobbiEvent({ pet: '00000000c1', name: 'Old Bean', gen: 'v1', stage: 'baby', at: 60, colours: ['#ff9900', '#3355ff', '#222222'] }),
      blobbiEvent({ pet: '00000000c2', name: 'Biscuit', gen: 'v2', stage: 'adult', at: 50, colours: ['#7ad3ff', '#ffffff', '#3b2a5a'] }),
      blobbiEvent({ pet: '00000000c3', name: 'Eggy', gen: 'v1', stage: 'egg', at: 40 }),
    ],
    PK,
  ).items;
  const by = (name: string) => items.find((b) => b.name === name)!;

  it('lists a V1 Baby and a V2 Adult as available with their look; a V1 egg still cannot walk', () => {
    // The look is the kit's own reading of the event (for V1/V2 the kit derives it from the Blobbi's seed tag).
    expect(by('Old Bean')).toMatchObject({ generation: 'v1', stage: 'baby', availability: 'available' });
    expect(by('Old Bean').worldForm).toMatchObject(by('Old Bean').colors!);
    expect(worldFormOf(by('Old Bean'))!.kind === 'world-form' && identityOfSource(worldFormOf(by('Old Bean'))!, 'baby').genome.colors.base).toBe(by('Old Bean').colors!.base);
    expect(by('Biscuit')).toMatchObject({ generation: 'v2', stage: 'adult', availability: 'available' });
    expect(by('Eggy').availability).toBe('egg');
    expect(isWorldForm(by('Old Bean'))).toBe(true);
    expect(worldFormOf(by('Biscuit'))).toMatchObject({ kind: 'world-form', generation: 'v2', d: by('Biscuit').d, pubkey: PK });
  });

  it('walks the island at its own stage, with its form’s adult footprint', () => {
    for (const [name, stage] of [['Old Bean', 'baby'], ['Biscuit', 'adult']] as const) {
      const source = worldFormOf(by(name))!;
      const live = new LiveWorld(world, source, 16, { stage });
      expect(live.blobbi.identity.stage).toBe(stage);
      expect(live.blobbi.seed).toBe(source.seed);
      const adult = new LiveWorld(world, source, 16);
      expect([live.blobbi.footRx, live.blobbi.footRy]).toEqual([adult.blobbi.footRx, adult.blobbi.footRy]);
      live.brain.enabled = false;
      const x0 = live.blobbi.x;
      run(live, 0.5, { right: true });
      expect(live.blobbi.x).toBeGreaterThan(x0);
    }
  });

  function screenWith(list: OwnedBlobbi[]) {
    const live = new LiveWorld(world, 'blobbi-9', 16);
    const ui = new GameUI(() => live, () => palette);
    const s = new BlobbisScreen();
    s.collection = { blobbis: () => ({ status: 'ready', owner: PK, items: list, partial: false, skipped: 0, fetchedAt: 1 }), loadBlobbis: async () => {} };
    const chosen: OwnedBlobbi[] = [];
    const store = memoryStore();
    s.forms = { seen: (a) => worldFormSeen(store, a), accept: (a) => acceptWorldForm(store, a) };
    const chooser: BlobbiChooser = { selectedAddress: () => null, choose: (b) => (chosen.push(b), true), useVisitor: () => {} };
    s.chooser = chooser;
    ui.register(s);
    ui.open('blobbis');
    const draw = () => ui.render(new PixelBuffer(960, 540), 0);
    return { ui, s, chosen, draw, store };
  }

  it('explains the new form with a preview before the first visit; TRY THIS FORM brings it; next time no explanation', () => {
    const { ui, s, chosen, draw, store } = screenWith([by('Old Bean')]);
    draw();
    ui.handleKey('Enter');
    expect(chosen).toEqual([]); // not chosen yet: the explanation shows
    expect(s.confirming?.name).toBe('Old Bean');
    draw(); // both pictures and both buttons, no throw
    expect(s.formPreview(by('Old Bean'), 44)!.width).toBeGreaterThan(0);
    ui.handleKey('Enter'); // TRY THIS FORM
    expect(chosen.map((b) => b.name)).toEqual(['Old Bean']);
    expect(s.confirming).toBe(null);
    expect(worldFormSeen(store, by('Old Bean').address)).toBe(true);
    expect(JSON.parse(store.get(WORLD_FORMS_KEY)!)).toEqual({ version: 1, accepted: [by('Old Bean').address] });
    ui.handleKey('Enter'); // again: straight in, no explanation
    expect(s.confirming).toBe(null);
    expect(chosen.length).toBe(2);
  });

  it('NOT NOW leaves everything as it was (nothing chosen, nothing remembered)', () => {
    const { ui, s, chosen, draw, store } = screenWith([by('Biscuit')]);
    draw();
    ui.handleKey('Enter');
    expect(s.confirming).not.toBe(null);
    ui.handleKey('Backspace');
    expect(s.confirming).toBe(null);
    expect(chosen).toEqual([]);
    expect(store.get(WORLD_FORMS_KEY)).toBe(null);
    // Escape also closes the screen (and the explanation) without choosing.
    ui.handleKey('Enter');
    ui.handleKey('Escape');
    expect(chosen).toEqual([]);
  });

  it('the explanation texts are the briefed copy in English, Portuguese and Spanish, without an em dash', () => {
    expect(en['worldForm.title']).toBe('Your Blobbi discovered a new form!');
    expect(ptBR['worldForm.try']).toBe('Experimentar nova forma');
    expect(es['worldForm.title']).toBe('¡Tu Blobbi descubrió una nueva forma!');
    for (const k of ['worldForm.title', 'worldForm.body', 'worldForm.try', 'worldForm.notNow', 'worldForm.original', 'worldForm.here', 'blobbis.readyWorldForm'] as const)
      for (const cat of [en, ptBR, es] as Record<string, string>[]) {
        expect(cat[k], k).toBeTruthy();
        expect(cat[k], k).not.toMatch(/—/);
      }
  });

  it('the stored choice: a world form only beside its owner account, rebuilt and checked on load; disconnect: the visitor', () => {
    const store = memoryStore();
    const source = worldFormOf(by('Old Bean'))!;
    storeSelection(store, source, { name: 'Old Bean', account: PK, stage: 'baby' });
    expect(loadSelection(store)).toEqual(source);
    const rec = loadSelectionRecord(store)!;
    expect(rec).toMatchObject({ name: 'Old Bean', account: PK, stage: 'baby' });
    expect(effectiveSelection(rec, PK)).toBe(rec);
    expect(effectiveSelection(rec, null)).toBe(null); // disconnected: the visiting Blobbi walks
    expect(effectiveSelection(rec, PK2)).toBe(null); // another account: not theirs
    // Without its account, or with a tampered seed or look, the record is refused whole.
    const raw = JSON.parse(store.get(SELECTION_KEY)!);
    store.set(SELECTION_KEY, JSON.stringify({ ...raw, account: undefined }));
    expect(loadSelectionRecord(store)).toBe(null);
    store.set(SELECTION_KEY, JSON.stringify({ ...raw, source: { ...raw.source, seed: deriveBlobbiV3Seed(PK, raw.source.d) } }));
    expect(loadSelectionRecord(store)).toBe(null);
    store.set(SELECTION_KEY, JSON.stringify({ ...raw, source: { ...raw.source, traits: { ...raw.source.traits, base: 'red' } } }));
    expect(loadSelectionRecord(store)).toBe(null);
    store.set(SELECTION_KEY, JSON.stringify({ ...raw, account: PK2 }));
    expect(loadSelectionRecord(store)).toBe(null);
  });
});

describe('departure and arrival when the Blobbi changes', () => {
  const v3 = (): BlobbiSource => {
    const r = resolveBlobbi({ pubkey: PK, d: getCanonicalBlobbiD(PK, '0000000001') });
    if (!r.ok) throw new Error(r.error);
    return r.source;
  };
  const fresh = () => {
    const live = new LiveWorld(world, 'blobbi-9', 16);
    live.brain.enabled = false;
    run(live, 0.2);
    return live;
  };

  it('the outgoing Blobbi stops, faces the player and leaves; the new one arrives at its spot, facing the player', () => {
    const live = fresh();
    run(live, 0.3, { right: true }); // walking to the right
    const { x, y } = live.blobbi;
    expect(live.swapBlobbi(v3(), 16, 'baby')).toBe('animated');
    expect(live.swap?.phase).toBe('leaving');
    expect(live.teleport.state).toBe('departing');
    expect(live.blobbi.seed).toBe('blobbi-9'); // still the outgoing one
    expect(live.blobbi.animator.pose(live.clock.time).view).toBe('front');
    run(live, DEPART.end * 0.5);
    expect(live.blobbi.animator.pose(live.clock.time).view).toBe('front');
    run(live, DEPART.end * 0.5 + 0.1);
    expect(live.swap?.phase).toBe('arriving');
    expect(live.teleport.state).toBe('arriving');
    expect(live.blobbi.seed).toBe(v3().seed);
    expect(live.blobbi.identity.stage).toBe('baby');
    expect([live.blobbi.x, live.blobbi.y]).toEqual([x, y]); // the same spot
    expect(live.blobbi.animator.pose(live.clock.time).view).toBe('front');
    run(live, ARRIVE.end + 0.1);
    expect(live.swap).toBe(null);
    expect(live.teleport.state).toBe('present');
    expect(live.blobbi.animator.pose(live.clock.time).view).toBe('front');
  });

  it('locks movement and actions during the transition (no accidental gameplay)', () => {
    const live = fresh();
    live.inventory.add(ITEMS.axe.id, 1);
    live.equip(ITEMS.axe.id);
    const { x, y } = live.blobbi;
    live.swapBlobbi(v3());
    run(live, 1, { right: true, interact: true });
    expect([live.blobbi.x, live.blobbi.y]).toEqual([x, y]);
    expect(live.swing).toBe(null);
    run(live, DEPART.end + ARRIVE.end - 1.3, { left: true }); // the rest of the swap (6.2 s in all)
    expect([live.blobbi.x, live.blobbi.y]).toEqual([x, y]);
    run(live, 0.6);
    expect(live.teleport.state).toBe('present');
    run(live, 0.3, { left: true });
    expect(live.blobbi.x).toBeLessThan(x); // free again once arrived
  });

  it('rapid choices: the last one arrives; choosing the current one while it leaves turns it back; one Blobbi only', () => {
    const live = fresh();
    const a = form();
    live.swapBlobbi(v3());
    run(live, 0.5);
    expect(live.swapBlobbi(a, 16, 'baby')).toBe('animated');
    run(live, DEPART.end);
    expect(live.blobbi.seed).toBe(a.seed);
    expect(live.blobbi.identity.stage).toBe('baby');
    run(live, ARRIVE.end + 0.1);
    expect(live.teleport.state).toBe('present');
    // Back to the visitor and, mid-departure, the same one again: it simply comes back.
    live.swapBlobbi('blobbi-9');
    run(live, DEPART.dissolveStart + 0.3);
    expect(live.swapBlobbi(a, 16, 'baby')).toBe('unchanged');
    expect(live.swap).toBe(null);
    run(live, ARRIVE.end);
    expect(live.teleport.state).toBe('present');
    expect(live.blobbi.seed).toBe(a.seed);
    // During an arrival another choice turns it into a departure, then that one arrives.
    live.swapBlobbi(v3());
    run(live, DEPART.end + 0.5);
    expect(live.swap?.phase).toBe('arriving');
    live.swapBlobbi('blobbi-9');
    expect(live.swap?.phase).toBe('leaving');
    run(live, DEPART.end + ARRIVE.end + 0.5);
    expect(live.blobbi.seed).toBe('blobbi-9');
    expect(live.swap).toBe(null);
    expect(live.teleport.state).toBe('present');
  });

  it('is immediate where the effect cannot play (already away), and a cancel never strands anyone', () => {
    const live = fresh();
    live.leaveBlobbi();
    expect(live.swapBlobbi(v3())).toBe('immediate');
    expect(live.blobbi.seed).toBe(v3().seed);
    const other = fresh();
    other.swapBlobbi(v3());
    run(other, 0.4);
    other.cancelTransition();
    run(other, 0.1);
    expect(other.teleport.state).toBe('present');
    expect(other.blobbi.seed).toBe(v3().seed);
    expect(other.swap).toBe(null);
  });

  it('changes nothing in the island save, which never names a Blobbi', () => {
    const store = memoryStore();
    const live = new LiveWorld(world, 'blobbi-9', 16, { store });
    live.inventory.add(ITEMS.axe.id, 1);
    live.save();
    const before = store.get(saveKey(live.identity))!;
    live.swapBlobbi(form(), 16, 'baby');
    run(live, DEPART.end + ARRIVE.end + 0.2);
    live.save();
    const after = store.get(saveKey(live.identity))!;
    expect(after).not.toMatch(/world-form|blobbi-7e7e9c42a91b/);
    expect(JSON.parse(after).inventory).toEqual(JSON.parse(before).inventory);
    expect(JSON.parse(after).version).toBe(JSON.parse(before).version);
  });
});

describe('Baby particles follow the Baby’s body', () => {
  it("the teleport and the sparkles use the Baby's drawn height and width; the adult's numbers are unchanged", () => {
    const adult = new LiveWorld(world, 'blobbi-9', 16);
    expect([adult.teleport.height, adult.teleport.halfWidth]).toEqual([16, 7]);
    expect(adult.bodyH).toBe(16);
    expect(adult.bodyK).toBe(1);
    const baby = new LiveWorld(world, sampleV3Seed(SAMPLE_PETS[0]), 16, { stage: 'baby' });
    expect(baby.bodyH).toBe(babyHeightFor(16));
    expect(baby.bodyK).toBeLessThan(0.8);
    expect(baby.teleport.height).toBe(babyHeightFor(16));
    expect(baby.teleport.halfWidth).toBeLessThan(7);
    expect(baby.teleport.halfWidth).toBeGreaterThanOrEqual(2);
    // Departing pixels start inside the Baby's own body (never above an adult's head), and spread over its width.
    baby.leaveBlobbi();
    run(baby, DEPART.dissolveStart + 0.05);
    const ps = baby.teleport.particles(baby.clock.time);
    expect(ps.length).toBeGreaterThan(0);
    for (const p of ps) {
      expect(p.z).toBeLessThanOrEqual(baby.bodyH + 2);
      expect(Math.abs(p.dx)).toBeLessThanOrEqual(baby.teleport.halfWidth + 1);
    }
    // After a swap to a Baby, the effect is resized before the Baby arrives.
    const live = new LiveWorld(world, 'blobbi-9', 16);
    live.swapBlobbi(sampleV3Seed(SAMPLE_PETS[0]), 16, 'baby');
    run(live, DEPART.end + 0.05);
    expect(live.teleport.height).toBe(babyHeightFor(16));
  });

  it('a pet sparkle rises from the Baby, not from where an adult head would be', () => {
    const baby = new LiveWorld(world, sampleV3Seed(SAMPLE_PETS[0]), 16, { stage: 'baby' });
    const adult = new LiveWorld(world, sampleV3Seed(SAMPLE_PETS[0]), 16);
    const top = (live: LiveWorld) => {
      live.pet();
      const hearts = live.particles.particles.filter((p) => p.kind === 'heart' && p.age === 0);
      expect(hearts.length).toBeGreaterThan(0);
      return Math.min(...hearts.map((p) => p.y - live.blobbi.y));
    };
    expect(top(baby)).toBeGreaterThan(top(adult));
  });
});

describe('Baby tools sit flush against the body', () => {
  function effectiveGrip(size: number, pose: BlobbiPose, item: string) {
    const id = stagedIdentity(sampleV3Seed(SAMPLE_PETS[3]), 'baby');
    const spriteOf = (p: BlobbiPose) => buildBlobbiSprite(id, p, size);
    const at = attachTool(item, pose, 'idle', new EquipmentRig(id, size), spriteOf, palette);
    const sprite: Sprite = spriteOf(pose);
    // As both renderers draw it: a tool in front one world pixel (round(size / 12) native pixels) to the right.
    const nudge = at.behind ? 0 : Math.max(1, Math.round(size / 12));
    return { x: sprite.anchorX + at.dx + nudge, y: sprite.anchorY + at.dy, sprite, at };
  }

  it('front and back: the drawn grip touches the silhouette from outside at every camera size, for every tool', () => {
    for (const size of [12, 16, 24, 48, 72])
      for (const view of ['front', 'back'] as const)
        for (const item of [ITEMS.axe.id, ITEMS.pickaxe.id, ITEMS.hoe.id, ITEMS.wateringCan.id, 'blobbi-pixel:tool:fishing-rod']) {
          const { x, y, sprite, at } = effectiveGrip(size, { ...REST_POSE, view }, item);
          const opaque = (px: number) => (sprite.buffer.get(px, y) >>> 24) !== 0;
          const inward = at.dx < 0 ? 1 : -1;
          expect(opaque(x), `${size} ${view} ${item} on`).toBe(false);
          expect(opaque(x + inward), `${size} ${view} ${item} next`).toBe(true);
        }
  });

  it('from the side (the near hand) it hangs at the back edge and touches it; the far hand stays hidden at rest', () => {
    for (const size of [16, 24, 48]) {
      const { x, y, sprite, at } = effectiveGrip(size, { ...REST_POSE, view: 'side', facing: -1 }, ITEMS.axe.id);
      expect(at.visible).toBe(true);
      expect(sprite.buffer.get(x, y) >>> 24).toBe(0);
      expect(sprite.buffer.get(x - 1, y) >>> 24).not.toBe(0);
      expect(effectiveGrip(size, { ...REST_POSE, view: 'side', facing: 1 }, ITEMS.axe.id).at.visible).toBe(false);
    }
  });

  it('adult attachments are unchanged (the arm rig)', () => {
    const id = stagedIdentity('blobbi-9', 'adult');
    const spriteOf = (p: BlobbiPose) => buildBlobbiSprite(id, p, 24);
    const at = attachTool(ITEMS.axe.id, REST_POSE, 'idle', new EquipmentRig(id, 24), spriteOf, palette);
    expect(at.arm).toBe('right-arm');
    expect(at.orientation).toBe('rest');
  });
});

describe('nothing published, no secret stored', () => {
  it('the M11D.2 code has no signing, publishing or key-making call, and stores only public records', () => {
    for (const f of ['src/blobbi/world-form.ts', 'src/game/world-form-memory.ts', 'src/ui/screens/blobbis.ts', 'src/game/blobbi-selection.ts', 'src/sim/live-world.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/signEvent|generateSecretKey|nsecEncode|finalizeEvent|\.publish\(|\.event\(|getSecretKey|privateKey/);
    }
    const store = memoryStore();
    storeSelection(store, form(), { name: 'Old Bean', account: PK, stage: 'baby' });
    acceptWorldForm(store, `31124:${PK}:${D1}`);
    const all = JSON.stringify([store.get(SELECTION_KEY), store.get(WORLD_FORMS_KEY)]);
    expect(all).not.toMatch(/nsec|ncryptsec|secret|private/i);
  });
});
