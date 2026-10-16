/**
 * M11D.1: Baby Blobbi visual support. The kit's own baby of the same genome, rasterized with the pixel rules
 * (droplet body, simple eyes, budding traits, no arms or feet), a whole-pixel hop, tools held by invisible hands, the
 * V1/V2 baby from the kit's authored art, Babies choosable in MY BLOBBIS, and nothing changed for adults or saves.
 */
import { describe, expect, it } from 'vitest';
import { buildEggTags, deriveBlobbiV3Seed, getCanonicalBlobbiD } from '@blobbi-kit/core';
import { generateGenome, renderBlobbiSvg } from '@blobbi-kit/renderer/procedural';
import { stagedIdentity, blobbiIdentity } from '../src/blobbi/identity';
import { buildBlobbiSprite, REST_POSE, type BlobbiPose } from '../src/blobbi/sprite';
import { BABY_HEIGHT_RATIO, BABY_MIN_HEIGHT, babyHeightFor, babyHopFor, buildCanonicalSprite, stateForPose } from '../src/blobbi/canonical';
import { svgSupportIssues } from '../src/blobbi/svg-raster';
import { buildV1BabySprite, kitV1BabySvg, pixelDialect } from '../src/blobbi/v1-baby';
import { attachTool, EquipmentRig, toolSprite, type EquipmentAnimation } from '../src/game/equipment';
import { ITEMS } from '../src/game/items';
import { paletteFor } from '../src/world/generate';
import { pickBlobbis } from '../src/nostr/blobbis';
import type { OwnedBlobbi } from '../src/nostr/port';
import { effectiveSelection, loadSelection, loadSelectionRecord, SELECTION_KEY, storeSelection } from '../src/game/blobbi-selection';
import { resolveBlobbi, type BlobbiSource } from '../src/blobbi/source';
import { memoryStore, saveKey } from '../src/game/persistence';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { GameUI } from '../src/ui/game-ui';
import { BlobbisScreen, reasonKey, type BlobbiChooser } from '../src/ui/screens/blobbis';
import { PixelBuffer, type Sprite } from '../src/core/pixel';
import { en } from '../src/i18n/messages/en';
import { ptBR } from '../src/i18n/messages/pt-BR';
import { es } from '../src/i18n/messages/es';
import { SAMPLE_PETS, sampleV3Seed } from '../src/dev/baby-sheet';

const PK = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';
const SEEDS = SAMPLE_PETS.map(sampleV3Seed);
const palette = paletteFor('cozy');
const VIEWS: Partial<BlobbiPose>[] = [{ view: 'front' }, { view: 'back' }, { view: 'side', facing: 1 }, { view: 'side', facing: -1 }];
const TOOLS = [ITEMS.axe.id, ITEMS.pickaxe.id, ITEMS.hoe.id, ITEMS.wateringCan.id, 'blobbi-pixel:tool:fishing-rod'];

/** Opaque extent of a sprite: rows and, per row, the leftmost and rightmost opaque column. */
function extent(s: Sprite) {
  let top = -1;
  let bottom = -1;
  let left = Infinity;
  let right = -Infinity;
  for (let y = 0; y < s.buffer.height; y++)
    for (let x = 0; x < s.buffer.width; x++)
      if (s.buffer.get(x, y) >>> 24) {
        if (top < 0) top = y;
        bottom = y;
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
  return { top, bottom, left, right, height: bottom - top + 1, width: right - left + 1 };
}

const rgb = (c: number) => [c & 0xff, (c >>> 8) & 0xff, (c >>> 16) & 0xff];

describe('the V3 Baby (the kit baby of the same genome)', () => {
  it('passes the rasterizer for every view and motion of many genomes (no unsupported markup)', () => {
    for (const seed of [...SEEDS, 'blobbi-9', 'blobbi-17'])
      for (const view of ['front', 'side', 'back'] as const)
        for (const motion of ['still', 'idle', 'walking'] as const) {
          const svg = renderBlobbiSvg(generateGenome(seed), { stage: 'baby', view, direction: 'right', motion, phase: 0.3 }, { idPrefix: 'p' });
          expect(svgSupportIssues(svg), `${seed} ${view} ${motion}`).toEqual([]);
        }
  });

  it('is deterministic and is the kit baby: the same identity draws the same pixels; the stage is the only change', () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const a = buildBlobbiSprite(stagedIdentity(seed, 'baby'), REST_POSE, 24);
      const b = buildBlobbiSprite(stagedIdentity(seed, 'baby'), REST_POSE, 24);
      expect(a.buffer.data).toEqual(b.buffer.data);
      expect(stateForPose(REST_POSE, 'baby').stage).toBe('baby');
      expect(stagedIdentity(seed, 'baby').genome).toEqual(blobbiIdentity(seed).genome);
      const adult = buildBlobbiSprite(stagedIdentity(seed, 'adult'), REST_POSE, 24);
      expect(a.buffer.data).not.toEqual(adult.buffer.data);
    }
  });

  it('leaves the adult pixel-identical (the default stage draws exactly what M11C drew)', () => {
    for (const seed of ['blobbi-9', SEEDS[0]])
      for (const v of VIEWS) {
        const pose = { ...REST_POSE, ...v };
        expect(buildBlobbiSprite(blobbiIdentity(seed), pose, 24).buffer.data).toEqual(buildCanonicalSprite(generateGenome(seed), pose, 24).buffer.data);
      }
  });

  it("stands about two thirds of its adult's height (the kit's plan), never below the legibility floor", () => {
    expect(BABY_HEIGHT_RATIO).toBeGreaterThan(0.6);
    expect(BABY_HEIGHT_RATIO).toBeLessThan(0.7);
    expect(babyHeightFor(12)).toBe(BABY_MIN_HEIGHT);
    expect(babyHeightFor(48)).toBe(Math.round(48 * BABY_HEIGHT_RATIO));
    for (const size of [24, 48, 72]) {
      const baby = extent(buildBlobbiSprite(stagedIdentity(SEEDS[0], 'baby'), REST_POSE, size));
      const adult = extent(buildBlobbiSprite(stagedIdentity(SEEDS[0], 'adult'), REST_POSE, size));
      expect(baby.height / adult.height, `${size}`).toBeGreaterThan(0.5);
      expect(baby.height / adult.height, `${size}`).toBeLessThan(0.8);
      expect(baby.width).toBeLessThan(adult.width);
    }
  });

  it('has no arms or feet: the kit draws none and the pixel Baby adds none', () => {
    const svg = renderBlobbiSvg(generateGenome(SEEDS[0]), { stage: 'baby', view: 'front', motion: 'walking', phase: 0.2 }, { idPrefix: 'p' });
    expect(svg).not.toMatch(/data-part="[^"]*(arm|foot)/);
    // Front view: a droplet, widest near its middle; nothing sticks out of the sides (the cheeks stay inside).
    const s = buildBlobbiSprite(stagedIdentity(SEEDS[0], 'baby'), REST_POSE, 48);
    const e = extent(s);
    const body = generateGenome(SEEDS[0]);
    expect(body.seed).toBe(SEEDS[0]);
    expect(e.width).toBeLessThan(e.height);
  });

  it('keeps clear eyes: a light eye white and a dark pupil, from 24 px up', () => {
    for (const size of [24, 48]) {
      const s = buildBlobbiSprite(stagedIdentity(SEEDS[1], 'baby'), REST_POSE, size);
      let light = 0;
      let dark = 0;
      for (let y = 0; y < s.buffer.height; y++)
        for (let x = 0; x < s.buffer.width; x++) {
          const c = s.buffer.get(x, y);
          if (!(c >>> 24)) continue;
          const [r, g, b] = rgb(c);
          if (r > 225 && g > 225 && b > 225) light++;
          if (r + g + b < 200) dark++;
        }
      expect(light, `${size} whites`).toBeGreaterThanOrEqual(2);
      expect(dark, `${size} pupils`).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps its adult's colours: the average body colour is close to the adult's", () => {
    const mean = (s: Sprite) => {
      const sum = [0, 0, 0];
      let n = 0;
      for (let y = 0; y < s.buffer.height; y++)
        for (let x = 0; x < s.buffer.width; x++) {
          const c = s.buffer.get(x, y);
          if (!(c >>> 24)) continue;
          rgb(c).forEach((v, i) => (sum[i] += v));
          n++;
        }
      return sum.map((v) => v / n);
    };
    for (const seed of SEEDS) {
      const a = mean(buildBlobbiSprite(stagedIdentity(seed, 'adult'), REST_POSE, 48));
      const b = mean(buildBlobbiSprite(stagedIdentity(seed, 'baby'), REST_POSE, 48));
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), seed).toBeLessThan(60);
    }
  });

  it('hops: four lifted frames and two landings per cycle, whole pixels, the ground point unchanged', () => {
    for (const size of [16, 24, 48]) {
      const id = stagedIdentity(SEEDS[0], 'baby');
      const rest = buildBlobbiSprite(id, { ...REST_POSE, view: 'side' }, size);
      const lifts = [0, 1, 2, 3, 4, 5].map((w) => {
        const s = buildBlobbiSprite(id, { ...REST_POSE, view: 'side', walk: w as BlobbiPose['walk'] }, size);
        expect(Number.isInteger(s.anchorY)).toBe(true);
        return babyHopFor(w, babyHeightFor(size));
      });
      expect(lifts[0]).toBe(0);
      expect(lifts[3]).toBe(0);
      for (const w of [1, 2, 4, 5]) expect(lifts[w]).toBeGreaterThanOrEqual(1);
      expect(babyHopFor(-1, 20)).toBe(0);
      expect(rest.anchorX).toBe(buildBlobbiSprite(id, { ...REST_POSE, view: 'side', walk: 1 }, size).anchorX);
    }
    // The adult's walk is untouched by the hop.
    const adult = stagedIdentity(SEEDS[0], 'adult');
    expect(buildBlobbiSprite(adult, { ...REST_POSE, view: 'side', walk: 1 }, 24).anchorY).toBe(buildCanonicalSprite(generateGenome(SEEDS[0]), { ...REST_POSE, view: 'side', walk: 1 }, 24).anchorY);
  });

  it('shows expressions with its lids and mouth (happy, sad and asleep differ from neutral)', () => {
    const id = stagedIdentity(SEEDS[2], 'baby');
    const neutral = buildBlobbiSprite(id, REST_POSE, 48).buffer.data;
    for (const pose of [{ expression: 'happy' }, { expression: 'sad' }, { lid: 2, expression: 'sleepy' }] as Partial<BlobbiPose>[]) expect(buildBlobbiSprite(id, { ...REST_POSE, ...pose }, 48).buffer.data).not.toEqual(neutral);
  });
});

describe('Baby tools: held by invisible arms', () => {
  function attach(item: string, pose: BlobbiPose, animation: EquipmentAnimation, size = 24, stage: 'baby' | 'adult' = 'baby') {
    const id = stagedIdentity(SEEDS[0], stage);
    const spriteOf = (p: BlobbiPose) => buildBlobbiSprite(id, p, size);
    return { at: attachTool(item, pose, animation, new EquipmentRig(id, size), spriteOf, palette), sprite: spriteOf(pose) };
  }

  it('attaches every tool in every view and swing phase, the grip beside the body (one pixel outside it, front and back)', () => {
    for (const item of TOOLS)
      for (const v of VIEWS)
        for (const a of ['idle', 'raise', 'strike', 'recover', 'cast', 'fishing'] as EquipmentAnimation[]) {
          const pose = { ...REST_POSE, ...v };
          const { at, sprite } = attach(item, pose, a);
          expect(at.sprite.buffer.width).toBeGreaterThan(0);
          if (pose.view !== 'side') {
            // The grip column, as drawn (M11D.2: with the renderers' in-front nudge), touches the silhouette from outside.
            const gx = sprite.anchorX + at.dx + (at.behind ? 0 : 2);
            const gy = sprite.anchorY + at.dy;
            expect(sprite.buffer.get(gx, gy) >>> 24, `${item} ${pose.view} ${a}`).toBe(0);
            const inward = at.dx < 0 ? 1 : -1;
            expect(sprite.buffer.get(gx + inward, gy) >>> 24, `${item} ${pose.view} ${a}`).not.toBe(0);
          }
        }
  });

  it('from the side it hangs at the back edge, swings to the front edge, and stays hidden in the far hand at rest', () => {
    const near = { ...REST_POSE, view: 'side' as const, facing: -1 as const };
    const idle = attach(ITEMS.axe.id, near, 'idle').at;
    const strike = attach(ITEMS.axe.id, near, 'strike').at;
    expect(idle.visible).toBe(true);
    expect(idle.orientation).toBe('rest'); // never the over-the-shoulder carry across a baby's face
    expect(strike.dx).toBeLessThan(idle.dx); // facing left: the blow lands ahead (to the left)
    const far = attach(ITEMS.axe.id, { ...near, facing: 1 }, 'idle').at;
    expect(far.visible).toBe(false);
    expect(attach(ITEMS.axe.id, { ...near, facing: 1 }, 'strike').at.visible).toBe(true);
  });

  it('rides the hop: the tool lifts with the body on a lifted walk frame', () => {
    const pose = { ...REST_POSE, view: 'front' as const };
    const down = attach(ITEMS.axe.id, { ...pose, walk: 0 }, 'idle', 48).at;
    const up = attach(ITEMS.axe.id, { ...pose, walk: 1 }, 'idle', 48).at;
    expect(up.dy).toBeLessThan(down.dy);
  });

  it("is sized to the baby (smaller than the adult's at close range); the rod keeps its line tip", () => {
    const pose = { ...REST_POSE, view: 'front' as const };
    expect(attach(ITEMS.axe.id, pose, 'idle', 48).at.sprite.buffer.width).toBeLessThan(attach(ITEMS.axe.id, pose, 'idle', 48, 'adult').at.sprite.buffer.width);
    for (const v of VIEWS) expect(attach('blobbi-pixel:tool:fishing-rod', { ...REST_POSE, ...v }, 'fishing').at.tip).not.toBe(null);
    // The adult attachment is unchanged by M11D.1 (the arm rig, the shoulder carry from the side).
    expect(attach(ITEMS.axe.id, { ...REST_POSE, view: 'side' }, 'idle', 24, 'adult').at.orientation).toBe('carry');
    expect(toolSprite(ITEMS.axe.id, 'rest', palette, false, 1).buffer.width).toBeGreaterThan(0);
  });
});

describe('V1 and V2 Babies: the kit’s one authored baby, in its own colours', () => {
  const colors = { base: '#ff9900', secondary: '#3355ff', eye: '#222222' };

  it('rewrites the authored art into the pixel dialect without changing a shape, for every drawing the kit makes', () => {
    for (const pose of [REST_POSE, { ...REST_POSE, view: 'back' as const }, { ...REST_POSE, lid: 2 as const }]) {
      const kit = kitV1BabySvg(colors, pose);
      const pixel = pixelDialect(kit);
      expect(svgSupportIssues(pixel)).toEqual([]);
      // Every path and centre of the kit's drawing is still there.
      for (const m of kit.matchAll(/\sd="([^"]+)"/g)) expect(pixel).toContain(m[1].replace(/\s+/g, ' ').trim());
      for (const m of kit.matchAll(/\scx="([^"]+)"/g)) expect(pixel).toContain(`cx="${m[1]}"`);
    }
  });

  it('refuses markup it does not recognise rather than guessing', () => {
    const kit = kitV1BabySvg(colors, REST_POSE);
    expect(() => pixelDialect(kit.replace('</svg>', '<rect x="1" y="1" width="2" height="2" fill="#000000"/></svg>'))).toThrow(/unknown shape/);
  });

  it('draws deterministically; V2 is the same drawing as V1 (as the kit does); a side facing shows the front art', () => {
    const a = buildV1BabySprite(colors, REST_POSE, 24);
    expect(buildV1BabySprite(colors, REST_POSE, 24).buffer.data).toEqual(a.buffer.data);
    expect(buildV1BabySprite(colors, REST_POSE, 24, 'v2').buffer.data).toEqual(a.buffer.data);
    expect(buildV1BabySprite(colors, { ...REST_POSE, view: 'side' }, 24).buffer.data).toEqual(a.buffer.data);
    expect(buildV1BabySprite(colors, { ...REST_POSE, view: 'back' }, 24).buffer.data).not.toEqual(a.buffer.data);
    expect(extent(a).height).toBeGreaterThanOrEqual(babyHeightFor(24) - 1);
    // It hops like a V3 Baby.
    expect(buildV1BabySprite(colors, { ...REST_POSE, walk: 1 }, 24).anchorY).toBeGreaterThan(a.anchorY);
  });

  it('paints with the event colours: different colours, different pixels', () => {
    expect(buildV1BabySprite({ ...colors, base: '#7ad3ff' }, REST_POSE, 24).buffer.data).not.toEqual(buildV1BabySprite(colors, REST_POSE, 24).buffer.data);
  });
});

let serial = 0;
function blobbiEvent(o: { pet: string; name?: string; gen?: 'v1' | 'v2' | 'v3'; stage?: 'egg' | 'baby' | 'adult'; at?: number }) {
  const tags = buildEggTags(PK, o.pet, 1_700_000_000, o.name ?? 'Pip', { visualGeneration: o.gen ?? 'v3' }).map((t) => (t[0] === 'stage' ? ['stage', o.stage ?? 'adult'] : t));
  return { id: (++serial).toString(16).padStart(64, '0'), pubkey: PK, created_at: o.at ?? 1_700_000_000 + serial, kind: 31124, tags, content: '', sig: 'a'.repeat(128) };
}

describe('MY BLOBBIS with Babies', () => {
  const items = pickBlobbis(
    [
      blobbiEvent({ pet: '0000000001', name: 'Bean', stage: 'baby', at: 60 }),
      blobbiEvent({ pet: '0000000002', name: 'Big', stage: 'adult', at: 50 }),
      blobbiEvent({ pet: '0000000003', name: 'Eggy', stage: 'egg', at: 40 }),
      blobbiEvent({ pet: '0000000004', name: 'Old Bean', gen: 'v1', stage: 'baby', at: 30 }),
      blobbiEvent({ pet: '0000000005', name: 'Older', gen: 'v2', stage: 'adult', at: 20 }),
    ],
    PK,
  ).items;
  const by = (name: string) => items.find((b) => b.name === name)!;

  it('a V3 Baby may visit; an egg may not; V1/V2 Blobbis visit in world forms (M11D.2), else their reason', () => {
    expect(by('Bean')).toMatchObject({ stage: 'baby', generation: 'v3', availability: 'available', seed: deriveBlobbiV3Seed(PK, getCanonicalBlobbiD(PK, '0000000001')) });
    expect(by('Big').availability).toBe('available');
    expect(by('Eggy').availability).toBe('egg');
    expect(by('Old Bean').availability).toBe('available');
    expect(reasonKey({ ...by('Old Bean'), availability: 'older-generation' })).toBe('blobbis.reason.olderBaby');
    expect(reasonKey({ ...by('Older'), availability: 'older-generation' })).toBe('blobbis.reason.older');
    expect(reasonKey(by('Eggy'))).toBe('blobbis.reason.egg');
  });

  function screenWith(list: OwnedBlobbi[], selected: { address: string; stage: 'adult' | 'baby' } | null = null) {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    const ui = new GameUI(() => live, () => palette);
    const s = new BlobbisScreen();
    s.collection = { blobbis: () => ({ status: 'ready', owner: PK, items: list, partial: false, skipped: 0, fetchedAt: 1 }), loadBlobbis: async () => {} };
    const chosen: OwnedBlobbi[] = [];
    const refreshed: OwnedBlobbi[] = [];
    let sel = selected;
    const chooser: BlobbiChooser = {
      selectedAddress: () => sel?.address ?? null,
      selectedStage: () => sel?.stage ?? null,
      choose: (b) => (chosen.push(b), (sel = { address: b.address, stage: b.stage === 'baby' ? 'baby' : 'adult' }), true),
      refreshStage: (b) => (refreshed.push(b), (sel = { address: b.address, stage: b.stage === 'baby' ? 'baby' : 'adult' }), true),
      useVisitor: () => (sel = null),
    };
    s.chooser = chooser;
    ui.register(s);
    ui.open('blobbis');
    const draw = () => ui.render(new PixelBuffer(960, 540), 0);
    return { ui, s, chosen, refreshed, draw, selected: () => sel };
  }

  it('choosing is explicit: Enter on a Baby brings it, as a Baby; nothing is chosen by opening the list', () => {
    const { ui, chosen, draw, selected } = screenWith([...items]);
    draw();
    expect(chosen).toEqual([]);
    ui.handleKey('Enter');
    expect(chosen.map((b) => b.name)).toEqual(['Bean']);
    expect(selected()).toEqual({ address: by('Bean').address, stage: 'baby' });
    draw();
  });

  it('a chosen Baby that grew up in another app is drawn as the adult once the list is read again; that is not a choice', () => {
    const grown = { ...by('Bean'), stage: 'adult' as const };
    const { chosen, refreshed, draw, selected } = screenWith([grown], { address: grown.address, stage: 'baby' });
    draw();
    // Companion sync: only the stage is refreshed; `choose` (the player's choice, shared with the other games) is never called
    expect(chosen).toEqual([]);
    expect(refreshed.map((b) => b.address)).toEqual([grown.address]);
    expect(selected()?.stage).toBe('adult');
    draw();
    expect(refreshed.length).toBe(1); // settled: no loop
  });

  it("previews a Baby as the Baby that will walk, and a V1/V2 Baby with the kit's own picture (not a swatch)", async () => {
    const s = new BlobbisScreen();
    const baby = s.preview(by('Bean').seed!, 48, 'baby');
    const adult = s.preview(by('Bean').seed!, 48, 'adult');
    expect(baby.data).not.toEqual(adult.data);
    expect(baby.height).toBeLessThanOrEqual(48);
    const { draw, ui, s: screen } = screenWith([by('Old Bean')]);
    draw(); // the art is not loaded yet: the colours stand in, nothing throws
    await screen.loadOlderArt(); // the lazy chunk (the kit's authored baby art)
    draw();
    ui.handleKey('Enter'); // M11D.2: it may visit in its world form; the explanation shows both pictures
    expect(screen.confirming?.name).toBe('Old Bean');
    draw();
  });

  it('the new texts exist in English, Portuguese and Spanish without an em dash', () => {
    for (const k of ['blobbis.readyBaby', 'blobbis.reason.olderBaby', 'blobbis.reason.egg'] as const)
      for (const cat of [en, ptBR, es] as Record<string, string>[]) {
        expect(cat[k], k).toBeTruthy();
        expect(cat[k], k).not.toMatch(/—/);
      }
  });
});

describe('the Baby selection, accounts and saves', () => {
  const d = getCanonicalBlobbiD(PK, '0000000001');
  const src = (): BlobbiSource => {
    const r = resolveBlobbi({ pubkey: PK, d });
    if (!r.ok) throw new Error(r.error);
    return r.source;
  };

  it('stores the stage beside the account in the same version-1 record; older readers still read the source', () => {
    const store = memoryStore();
    storeSelection(store, src(), { name: 'Bean', account: PK, stage: 'baby' });
    expect(JSON.parse(store.get(SELECTION_KEY)!)).toEqual({ version: 1, source: src(), name: 'Bean', account: PK, stage: 'baby' });
    expect(loadSelection(store)).toEqual(src());
    expect(loadSelectionRecord(store)).toEqual({ source: src(), name: 'Bean', account: PK, stage: 'baby' });
    // A stage without an account is never stored; an unknown stage reads as the adult (never a refusal).
    storeSelection(store, src(), undefined);
    expect(JSON.parse(store.get(SELECTION_KEY)!).stage).toBeUndefined();
    store.set(SELECTION_KEY, JSON.stringify({ version: 1, source: src(), name: 'Bean', account: PK, stage: 'egg' }));
    expect(loadSelectionRecord(store)?.stage).toBe('adult');
  });

  it('a Baby chosen with an account walks only while that account is connected (disconnect: the visitor walks)', () => {
    const store = memoryStore();
    storeSelection(store, src(), { name: 'Bean', account: PK, stage: 'baby' });
    const rec = loadSelectionRecord(store)!;
    expect(effectiveSelection(rec, PK)?.stage).toBe('baby');
    expect(effectiveSelection(rec, null)).toBe(null);
    expect(effectiveSelection(rec, '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d')).toBe(null);
  });

  it('a Baby walks the island with the adult footprint; the island save is byte-identical and names no Blobbi', () => {
    const store = memoryStore();
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store });
    live.inventory.add(ITEMS.axe.id, 1);
    live.save();
    const key = saveKey(live.identity);
    const before = store.get(key)!;
    live.setBlobbi(src(), 16, 'adult');
    const adultFoot = [live.blobbi.footRx, live.blobbi.footRy];
    const adultSprite = live.blobbiSprite(REST_POSE);
    live.setBlobbi(src(), 16, 'baby');
    expect(live.blobbi.identity.stage).toBe('baby');
    expect([live.blobbi.footRx, live.blobbi.footRy]).toEqual(adultFoot);
    expect(live.blobbiSprite(REST_POSE)).not.toBe(adultSprite);
    expect(live.blobbiSprite(REST_POSE).buffer.height).toBeLessThan(adultSprite.buffer.height);
    live.save();
    const after = store.get(key)!;
    expect(after).not.toMatch(/baby/);
    expect(after).not.toMatch(new RegExp(PK));
    expect(JSON.parse(after).inventory).toEqual(JSON.parse(before).inventory);
    expect(JSON.parse(after).version).toBe(JSON.parse(before).version);
    // Constructed with a Baby from the start (a reload), and back to the visitor adult.
    const again = new LiveWorld(generateTurtleWorld('turtle-0'), src(), 16, { store, stage: 'baby' });
    expect(again.blobbi.identity.stage).toBe('baby');
    again.setBlobbi('blobbi-9');
    expect(again.blobbi.identity.stage).toBe('adult');
  });

  it('a Baby plays: it walks, swings and the world steps as for an adult', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), src(), 16, { stage: 'baby' });
    live.brain.enabled = false;
    const x0 = live.blobbi.x;
    for (let i = 0; i < 30; i++) live.update(1 / 60, { up: false, down: false, left: false, right: true, interact: false, plant: false });
    expect(live.blobbi.x).toBeGreaterThan(x0);
    expect(live.blobbi.animator.pose(live.clock.time).walk).toBeGreaterThanOrEqual(0);
  });
});
