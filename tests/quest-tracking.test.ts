/**
 * M10 phase C: tracking and teaching. One active side quest can be pinned to the goal box from the journal (and
 * unpinned); it comes off by itself when done; it is saved; the main quest stays shown. Locked recipes whose quest is
 * open say how to unlock them, and still cannot be made; secrets (discovery quests, quests not open yet) stay hidden.
 * The island's first growth is part of the story.
 */
import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { LiveWorld } from '../src/sim/live-world';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { memoryStore } from '../src/game/persistence';
import { GameUI } from '../src/ui/game-ui';
import { JournalScreen } from '../src/ui/screens/journal';
import { CraftingScreen } from '../src/ui/screens/crafting';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewCamera, worldBounds, CAMERA_MODES, type CameraModeId } from '../src/render/view-camera';
import { activeQuests, currentObjective, objectiveById } from '../src/game/objectives';
import { RECIPES, recipeById } from '../src/game/crafting';
import { CANOE_ITEM } from '../src/content/tools';
import { pinnedCard } from '../src/ui/hud';
import { ITEMS } from '../src/game/items';

const palette = paletteFor('cozy');
const world = () => generateTurtleWorld('track-1', { turtleSeed: 't-track-1', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });

function setup(store = memoryStore()) {
  const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  const ui = new GameUI(() => live, () => palette);
  const journal = new JournalScreen();
  const crafting = new CraftingScreen();
  ui.register(journal);
  ui.register(crafting);
  const screen = new PixelBuffer(960, 540);
  return { live, ui, journal, crafting, screen, draw: () => ui.render(screen, 0) };
}

/** Complete the first chapters so side quests open (as a save would hold them). */
function through(live: LiveWorld, ids: string[]): void {
  for (const id of ids) live.objectives.completed[id] = 0;
}

describe('pinning a side quest', () => {
  it('pins from the journal (P or the button), shows under the main goal at every zoom, unpins, and is saved', () => {
    const store = memoryStore();
    const { live, ui, journal, draw } = setup(store);
    through(live, ['gather', 'axe']);
    expect(activeQuests(live.objectives).some((q) => q.id === 'improve')).toBe(true);
    ui.open('journal');
    journal.tab = 'quests';
    journal.index = journal.rows(ui).findIndex((r) => r.quest?.id === 'improve');
    draw();
    // A main quest cannot be pinned (it is always shown).
    const main = journal.rows(ui).findIndex((r) => r.quest?.type === 'main');
    journal.index = main;
    ui.handleKey('KeyP');
    expect(live.pinnedQuest).toBeNull();
    // The side quest: P pins it.
    journal.index = journal.rows(ui).findIndex((r) => r.quest?.id === 'improve');
    ui.handleKey('KeyP');
    expect(live.pinnedQuest).toBe('improve');
    expect(journal.rows(ui)[journal.index].label.startsWith('Pinned')).toBe(true);
    // The button says UNPIN now; pressing it unpins.
    draw();
    const unpin = ui.regions.at(-1)!;
    ui.handlePointer(unpin.x + unpin.w / 2, unpin.y + unpin.h / 2);
    expect(live.pinnedQuest).toBeNull();
    ui.handleKey('KeyP');
    expect(live.pinnedQuest).toBe('improve');
    // Saved and loaded.
    live.save();
    const again = new LiveWorld(world(), 'blobbi-9', 16, { store });
    expect(again.pinnedQuest).toBe('improve');
    expect(again.pinnedObjective()?.id).toBe('improve');
    // The goal box: the main goal and, under it, the pinned one; the same at every camera zoom and on a phone.
    ui.close();
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const cam = new ViewCamera();
    const b = worldBounds(live.world);
    const target = { x: live.blobbi.x, y: live.blobbi.y, size: live.blobbi.size };
    for (const [w, h] of [[960, 540], [390, 844]] as const)
      for (const mode of Object.keys(CAMERA_MODES) as CameraModeId[]) {
        cam.setMode(mode, true);
        const v = cam.update(10, target, w, h, b, true);
        const shot = () => view.render(v, cam.restScale(mode, w, h, b), live.clock.time, DEFAULT_LIVE_OPTIONS, DEFAULT_VIEW_UI).clone();
        live.pinnedQuest = 'improve';
        const pinned = shot();
        live.pinnedQuest = null;
        const plain = shot();
        live.pinnedQuest = 'improve';
        // The pinned card adds a little to the HUD, only near the top (under the main goal), nowhere else.
        let changed = 0;
        let lowest = 0;
        for (let i = 0; i < pinned.data.length; i++)
          if (pinned.data[i] !== plain.data[i]) {
            changed++;
            lowest = Math.max(lowest, Math.floor(i / w));
          }
        expect(changed, `${mode} ${w}x${h}`).toBeGreaterThan(50);
        expect(lowest, `${mode} ${w}x${h}`).toBeLessThan(h / 3);
      }
    expect(pinnedCard('Make it pretty', '1/2').height).toBeLessThan(14); // a small card
    expect(currentObjective(live.objectives)).not.toBeNull(); // the main quest is still the goal
  });

  it('a pinned quest comes off the goal box by itself when it is done', () => {
    const { live } = setup();
    through(live, ['gather', 'axe']);
    expect(live.pinQuest('improve')).toBe(true);
    expect(live.pinQuest('gather')).toBe(false); // done, and main
    expect(live.pinQuest('nope')).toBe(false);
    // Two decorations outside complete "Make it pretty".
    live.buildings.push({ id: 'f1', kind: 'fence', x: live.blobbi.x + 30, y: live.blobbi.y, placedAt: 0, seed: 'a' });
    live.buildings.push({ id: 'f2', kind: 'fence', x: live.blobbi.x + 50, y: live.blobbi.y, placedAt: 0, seed: 'b' });
    for (let i = 0; i < 120; i++) live.update(1 / 60, { up: false, down: false, left: false, right: false, interact: false } as never);
    expect('improve' in live.objectives.completed).toBe(true);
    expect(live.pinnedQuest).toBeNull();
    expect(live.pinnedObjective()).toBeNull();
  });
});

describe('locked recipes', () => {
  it('the canoe shows LOCKED with how to unlock it once "Gone fishing" is open, and cannot be made before', () => {
    const { live, ui, crafting, draw } = setup();
    const canoe = RECIPES.find((r) => r.output.item === CANOE_ITEM.id)!;
    // Before "Gone fishing" is open: a secret still (not listed, counted as more to discover).
    expect(live.recipeLockHint(canoe)).toBeNull();
    ui.open('crafting');
    crafting.tab = 'tools';
    expect(crafting.entries(ui).some((e) => e.recipe === canoe)).toBe(false);
    // Open it (listen to the Carrier): now it is shown, locked, with the quest to do.
    through(live, ['carrier']);
    expect(live.recipeLockHint(canoe)).toBe('Complete "Gone fishing" to unlock.');
    const entry = crafting.entries(ui).find((e) => e.recipe === canoe)!;
    expect(entry.locked).toBe('Complete "Gone fishing" to unlock.');
    crafting.index = crafting.entries(ui).indexOf(entry);
    draw();
    // Pressing it never makes it, whatever the bag holds.
    live.inventory.add(ITEMS.wood.id, 20);
    live.inventory.add(ITEMS.stick.id, 20);
    live.inventory.add('blobbi-pixel:material:cloth', 5);
    ui.handleKey('Enter');
    expect(live.inventory.count(CANOE_ITEM.id)).toBe(0);
    expect(live.craftRecipe(canoe)).toBe(false);
    // Done: known, and no longer locked.
    through(live, ['side-angler']);
    expect(live.recipeLockHint(canoe)).toBeNull();
    expect(crafting.entries(ui).find((e) => e.recipe === canoe)?.locked).toBeUndefined();
  });

  it('a discovery-quest recipe stays a surprise; every hint comes from the quest data', () => {
    const { live } = setup();
    for (const r of RECIPES) {
      const hint = live.recipeLockHint(r);
      if (!hint) continue;
      const q = objectiveById(r.unlock!)!;
      expect(q.type).not.toBe('discovery');
      expect(hint).toContain(q.title);
    }
    const musicBox = RECIPES.find((r) => objectiveById(r.unlock ?? '')?.type === 'discovery');
    if (musicBox) {
      through(live, Object.keys(live.objectives.completed));
      expect(live.recipeLockHint(musicBox)).toBeNull();
    }
    void recipeById;
  });
});

describe('the growth tutorial', () => {
  it('"Help your island grow" comes after the stone hums and before the Carrier speaks; its goal box counts what the island needs', () => {
    const { live } = setup();
    const grow = objectiveById('grow')!;
    expect(grow.type).toBe('main');
    expect(grow.requires).toEqual(['mystery']);
    expect(objectiveById('carrier')!.requires).toContain('grow');
    through(live, ['meet', 'arrive', 'gather', 'axe', 'wood', 'materials', 'shelter', 'enter-home', 'first-furniture', 'plot', 'plant', 'water', 'harvest', 'feed', 'home', 'cook', 'mystery']);
    expect(currentObjective(live.objectives)?.id).toBe('grow');
    expect(live.questProgress(grow)).toMatch(/^\d+\/\d+$/);
    // Growing the island completes it, with a journal note.
    live.growIsland(true);
    for (let i = 0; i < 30; i++) live.update(1 / 60, { up: false, down: false, left: false, right: false, interact: false } as never);
    expect('grow' in live.objectives.completed).toBe(true);
    expect(live.objectives.lore).toContain('growing');
    expect(currentObjective(live.objectives)?.id).toBe('carrier');
  });
});
