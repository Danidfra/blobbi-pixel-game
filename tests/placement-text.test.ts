/**
 * WHAT THE BLOBBI SAYS WHEN SOMETHING IS PLACED OUTDOORS speaks the player's language (regression: the outdoor path
 * built "placed a lantern" / "building a …" / "need 3 stick" in English whatever the locale; the indoor path and
 * the crafting bench already used the message keys).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { BUILDINGS } from '../src/game/buildings';
import { QUESTS } from '../src/game/objectives';
import { memoryStore } from '../src/game/persistence';
import { findBuildSpot, pressE } from '../src/dev/scripted-play';
import { buildingNoun } from '../src/content/text';
import { loadLocale, setLocale, t as lang, type Locale } from '../src/i18n';

afterEach(() => setLocale('en'));

function placeLantern(): LiveWorld {
  const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store: memoryStore() });
  live.brain.enabled = false;
  for (const q of QUESTS) live.objectives.completed[q.id] = 0;
  live.inventory.add(BUILDINGS.lantern.item!, 1);
  findBuildSpot(live, 'lantern', live.world.hubs[0]);
  live.startPlacing(BUILDINGS.lantern.item!);
  pressE(live);
  return live;
}

describe('placing outdoors, in every language', () => {
  it('says "placed …" through the message key', async () => {
    await loadLocale('pt-BR');
    await loadLocale('es');
    for (const locale of ['en', 'pt-BR', 'es'] as Locale[]) {
      setLocale(locale);
      const live = placeLantern();
      expect(live.buildings.some((b) => b.kind === 'lantern')).toBe(true);
      expect(live.bubble?.text).toBe(lang('build.placed', buildingNoun('lantern')));
      if (locale !== 'en') expect(live.bubble?.text).not.toMatch(/^placed /);
    }
  });
});
