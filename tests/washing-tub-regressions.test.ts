/**
 * THE WASHING TUB, regressions reported from play: facing it froze the game (the prompt had no verb for `wash` and
 * threw every frame), hygiene was not on the HUD's status card, and the tub is meant to work indoors too.
 */
import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, LiveWorld, USE_VERB } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { memoryStore } from '../src/game/persistence';
import { BUILDINGS, ALL_PLACEABLE_KINDS, type Building } from '../src/game/buildings';
import { PLACEABLE_CONTENT } from '../src/content/placeables';
import { InteriorRenderer } from '../src/render/interior-render';
import { DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { statusCard } from '../src/ui/hud';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { LiveRenderer } from '../src/render/live-render';
import { ViewCamera, worldBounds } from '../src/render/view-camera';
import { findBuildSpot, pressE, run, stand } from '../src/dev/scripted-play';
import { t as lang } from '../src/i18n';

const quiet = () => {
  const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store: memoryStore() });
  live.brain.enabled = false;
  live.resources = [];
  return live;
};
const TUB = BUILDINGS['washing-tub'];
function tubOutside(live: LiveWorld): Building {
  live.inventory.add(TUB.item!, 1);
  expect(findBuildSpot(live, 'washing-tub')).toBe(true);
  expect(live.startPlacing(TUB.item!)).toBe(true);
  pressE(live);
  run(live, 150);
  return live.buildings.find((b) => b.kind === 'washing-tub')!;
}
const faceIt = (live: LiveWorld, tub: Building) => {
  stand(live, tub.x, tub.y + TUB.footRy + live.blobbi.footRy + 2, 'up');
  expect(live.facingBuilding()?.id).toBe(tub.id);
};

describe('issue 1: facing the tub', () => {
  it('every use a placeable can have has a verb for the prompt (the frame asks for it while facing)', () => {
    for (const kind of ALL_PLACEABLE_KINDS) {
      const use = BUILDINGS[kind].use;
      if (!use) continue;
      expect(typeof USE_VERB[use], `${kind}: ${use}`).toBe('function');
    }
    for (const p of PLACEABLE_CONTENT) if (p.use) expect(typeof USE_VERB[p.use], p.kind).toBe('function');
  });

  it('the prompt says what E does at the tub, and frames keep running while facing it, interacting, and walking away', () => {
    const live = quiet();
    const tub = tubOutside(live);
    faceIt(live, tub);
    expect(live.prompt()).toBe(`E  ${lang('use.wash')}`);
    // A few seconds of frames facing it (what the view asks each frame), then a wash, then away: no throw, no stall.
    for (let i = 0; i < 180; i++) {
      live.update(1 / 60, IDLE_INPUT);
      expect(() => live.prompt()).not.toThrow();
    }
    live.care.hygiene = 20;
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    // Living Home: the wash lands at the end of the soak; the prompt keeps answering throughout.
    expect(live.occupation?.kind).toBe('bath');
    for (let i = 0; i < 60 * 5 && live.occupation; i++) {
      live.update(1 / 60, IDLE_INPUT);
      expect(() => live.prompt()).not.toThrow();
    }
    expect(live.occupation).toBeNull();
    expect(live.care.hygiene).toBeGreaterThan(95);
    for (let i = 0; i < 60; i++) {
      live.update(1 / 60, { ...IDLE_INPUT, down: true });
      expect(() => live.prompt()).not.toThrow();
    }
    expect(live.facingBuilding()).toBeNull();
  });
});

describe('issue 2: hygiene on the status card', () => {
  it('the HUD status card shows a clean meter beside fed, energy and joy, and the view fills it from the Blobbi\'s hygiene', () => {
    const base = { name: 'Blobbi', title: 'friends', fed: 10, energy: 10, joy: 10, clean: 10, carried: [], face: null, away: false };
    const clean = statusCard(base, 1);
    const grubby = statusCard({ ...base, clean: 2 }, 1);
    expect(clean.width).toBe(grubby.width);
    expect(clean.data).not.toEqual(grubby.data);
    // The card grew a row for it: taller than three meters need.
    expect(clean.height).toBeGreaterThan(27); // taller than the three-meter card was
    // End to end: the frame the view draws differs only by hygiene.
    const live = quiet();
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const bounds = worldBounds(live.world);
    const cam = new ViewCamera('exploration');
    const rest = cam.restScale('exploration', 844, 390, bounds);
    const v = cam.update(1 / 60, live.cameraTarget(390 / rest), 844, 390, bounds, true, 1 / 60);
    live.care.hygiene = 100;
    const a = view.render(v, rest, live.clock.time, DEFAULT_LIVE_OPTIONS, DEFAULT_VIEW_UI).clone();
    live.care.hygiene = 5;
    const b = view.render(v, rest, live.clock.time, DEFAULT_LIVE_OPTIONS, DEFAULT_VIEW_UI);
    expect(a.data).not.toEqual(b.data);
  });
});

describe('issue 3: the tub indoors', () => {
  it('is placed in the room, drawn there, and E at it washes, with the room\'s collision and reach as for any furniture', () => {
    const live = quiet();
    for (const c of BUILDINGS.shelter.cost) live.inventory.add(c.item, c.quantity);
    expect(findBuildSpot(live, 'shelter')).toBe(true);
    live.setBuildMode('shelter');
    pressE(live);
    run(live, 60 * (BUILDINGS.shelter.buildSeconds + 1));
    expect(live.enterInterior(live.home()!)).toBe(true);
    live.brain.enabled = false;
    run(live, 100);
    live.inventory.add(TUB.item!, 1);
    let placed: Building | undefined;
    for (const [x, y] of [[64, 70], [40, 60], [90, 60], [64, 56], [50, 76], [84, 76]] as const) {
      if (placed) break;
      if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
      stand(live, x, y, 'up');
      if (!live.placementCheck('washing-tub').ok) continue;
      expect(live.startPlacing(TUB.item!)).toBe(true);
      pressE(live);
      run(live, 30);
      placed = live.interior!.state.furniture.find((f) => f.kind === 'washing-tub');
    }
    expect(placed, 'a tub placed in the room').toBeDefined();
    expect(live.buildings.some((b) => b.kind === 'washing-tub')).toBe(false); // in the room, not on the island
    // Drawn in the room: the water's own blue where it stands.
    const frame = new InteriorRenderer(live).render(128, 96, 0, 0, live.clock.time, DEFAULT_LIVE_OPTIONS);
    let blue = 0;
    for (let y = placed!.y - 12; y <= placed!.y + 2; y++)
      for (let x = placed!.x - 8; x <= placed!.x + 8; x++) {
        const c = frame.get(x, y);
        const r = c & 0xff;
        const g = (c >>> 8) & 0xff;
        const bl = (c >>> 16) & 0xff;
        if (bl > r + 40 && bl >= g) blue++;
      }
    expect(blue).toBeGreaterThan(6);
    // Solid: the Blobbi cannot stand on it; E in front of it washes (once the "placed" word has faded: the prompt
    // yields to a word, as ever).
    expect(live.collision.canStand(placed!.x, placed!.y, live.blobbi.footRx, live.blobbi.footRy)).toBe(false);
    run(live, 60 * 3);
    stand(live, placed!.x, placed!.y + TUB.footRy + live.blobbi.footRy + 2, 'up');
    expect(live.facingBuilding()?.id).toBe(placed!.id);
    expect(live.prompt()).toBe(`E  ${lang('use.wash')}`);
    live.care.hygiene = 20;
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    expect(live.occupation?.kind).toBe('bath');
    for (let i = 0; i < 60 * 5 && live.occupation; i++) live.update(1 / 60, IDLE_INPUT);
    expect(live.care.hygiene).toBeGreaterThan(95);
    expect(live.collision.canStand(live.blobbi.x, live.blobbi.y, live.blobbi.footRx, live.blobbi.footRy)).toBe(true);
  });
});
