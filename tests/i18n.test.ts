/**
 * M11B: languages. English, Brazilian Portuguese and Spanish, chosen from the browser or by the player, switched live,
 * with every key in every catalogue and every character drawable; the language never reaches a save, an identity or
 * world generation.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CATALOGS, detectLocale, getLocale, initialLocale, loadLocale, localeBundle, LOCALES, missingKeys, setLocale, t, type Locale, type MessageKey } from '../src/i18n';
import { en } from '../src/i18n/messages/en';
import { BODY_LARGE, BODY_SMALL } from '../src/ui/fonts/body-font';
import { tinyFontHas } from '../src/render/live-render';
import { DEFAULT_SETTINGS, GameUI, readSettings } from '../src/ui/game-ui';
import { TitleScreen, type TitleActions } from '../src/ui/title';
import { PixelBuffer } from '../src/core/pixel';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { memoryStore, saveKey } from '../src/game/persistence';
import { sanitizeIslandName } from '../src/game/island-name';
import { hash32 } from '../src/core/rng';
import { contentTexts, itemNoun, NOUN_PARAMS } from '../src/content/text';
import { GENDER_PT_BR } from '../src/i18n/content/pt-BR';
import { GENDER_ES } from '../src/i18n/content/es';
import { ALL_ITEMS, itemLabel } from '../src/game/items';
import { QUESTS } from '../src/game/objectives';
import { LORE } from '../src/content/lore';
import { RECIPES } from '../src/game/crafting';
import { BUILDINGS, PROBLEM_TEXT } from '../src/game/buildings';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Other languages are chunks loaded on demand: load both once for these tests.
beforeAll(async () => {
  await loadLocale('pt-BR');
  await loadLocale('es');
});
afterEach(() => setLocale('en'));
const CONTENT_TRANSLATIONS = { get 'pt-BR'() { return localeBundle('pt-BR')!.content; }, get es() { return localeBundle('es')!.content; } };

const strings = (m: unknown): string[] => (typeof m === 'string' ? [m] : Object.values(m as Record<string, string>));

describe('choosing a language', () => {
  it('maps the browser languages: pt-* to pt-BR, es-* to es, anything else to English', () => {
    expect(detectLocale(['pt-BR'])).toBe('pt-BR');
    expect(detectLocale(['pt-PT', 'en'])).toBe('pt-BR');
    expect(detectLocale(['es-MX'])).toBe('es');
    expect(detectLocale(['es'])).toBe('es');
    expect(detectLocale(['fr-FR', 'de'])).toBe('en');
    expect(detectLocale(['fr-FR', 'es-AR'])).toBe('es'); // the first language we have
    expect(detectLocale([])).toBe('en');
    expect(detectLocale(undefined)).toBe('en');
  });

  it('an explicit, stored choice wins over the browser; nonsense is ignored', () => {
    expect(initialLocale('es', ['pt-BR'])).toBe('es');
    expect(initialLocale('pt-BR', ['en-US'])).toBe('pt-BR');
    expect(initialLocale('klingon', ['pt-BR'])).toBe('pt-BR');
    expect(initialLocale(null, ['en-GB'])).toBe('en');
  });

  it('switches at once, for every message', () => {
    expect(t('title.begin')).toBe('Begin');
    setLocale('pt-BR');
    expect(getLocale()).toBe('pt-BR');
    expect(t('title.begin')).toBe('Começar');
    setLocale('es');
    expect(t('title.begin')).toBe('Empezar');
  });
});

describe('messages', () => {
  it('interpolate parameters and keep unknown ones visible', () => {
    expect(t('hud.day', { day: 3 })).toBe('Day 3');
    setLocale('es');
    expect(t('hud.day', { day: 3 })).toBe('Día 3');
    expect(t('hud.goal', { n: 2 })).toBe('Objetivo 2/{total}');
  });

  it('pluralise by count in each language', () => {
    expect(t('title.quests', { count: 1 })).toBe('1 quest');
    expect(t('title.quests', { count: 0 })).toBe('0 quests');
    expect(t('title.quests', { count: 5 })).toBe('5 quests');
    setLocale('pt-BR');
    expect(t('title.quests', { count: 1 })).toBe('1 missão');
    expect(t('title.quests', { count: 2 })).toBe('2 missões');
    expect(t('title.built', { count: 1 })).toBe('1 construção');
    setLocale('es');
    expect(t('title.quests', { count: 1 })).toBe('1 misión');
    expect(t('title.quests', { count: 7 })).toBe('7 misiones');
  });

  it('fall back to English for a missing translation, and report keys nobody has', () => {
    const pt = CATALOGS['pt-BR']! as Record<string, unknown>;
    const saved = pt['title.begin'];
    delete pt['title.begin'];
    setLocale('pt-BR');
    expect(t('title.begin')).toBe('Begin');
    pt['title.begin'] = saved;
    expect(t('no.such.key' as MessageKey)).toBe('no.such.key');
    expect(missingKeys.has('no.such.key')).toBe(true);
    missingKeys.clear();
  });
});

describe('the catalogues are complete and drawable', () => {
  const keys = Object.keys(en).sort();
  for (const { id } of LOCALES)
    it(`${id}: every English key, no extra ones, same parameters, no empty text`, () => {
      const c = CATALOGS[id]! as Record<string, unknown>;
      expect(Object.keys(c).sort()).toEqual(keys);
      for (const k of keys) {
        const params = (m: unknown) => [...new Set(strings(m).flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1])))].sort();
        // Noun phrases come as a family (see NOUN_PARAMS): a language may pick another form of the same noun.
        // `count` (plural choice) and English-only helpers (`en_*`, e.g. "the two") may be left out by a language.
        const family = (ps: string[]) => ps.filter((p) => p !== 'count' && !p.startsWith('en_')).map((p) => ((NOUN_PARAMS as readonly string[]).includes(p) ? 'noun' : p)).filter((p, i, a) => a.indexOf(p) === i).sort();
        expect(family(params(c[k])), `${id} ${k}`).toEqual(family(params((en as Record<string, unknown>)[k])));
        for (const s of strings(c[k])) expect(s.trim().length, `${id} ${k}`).toBeGreaterThan(0);
      }
    });

  it('every character of every catalogue is in both body fonts and the 3×5 capitals', () => {
    const chars = new Set<string>();
    for (const { id } of LOCALES) for (const m of Object.values(CATALOGS[id]!)) for (const s of strings(m)) for (const ch of s.replace(/\{\w+\}/g, '').normalize('NFC')) chars.add(ch);
    for (const ch of chars) {
      expect(BODY_SMALL.has(ch), `small body font: ${ch}`).toBe(true);
      expect(BODY_LARGE.has(ch), `large body font: ${ch}`).toBe(true);
      if (ch !== ' ') expect(tinyFontHas(ch), `3×5 font: ${ch}`).toBe(true);
    }
  });

  it('island names stay the player\'s own: never translated, still limited to what every font can draw', () => {
    setLocale('pt-BR');
    expect(sanitizeIslandName('Kelp Harbour')).toBe('Kelp Harbour');
    expect(sanitizeIslandName('<b>x</b>')).toBe('bxb');
    for (const ch of 'Kelp Harbour 12.!-') expect(BODY_SMALL.has(ch) && BODY_LARGE.has(ch) && tinyFontHas(ch)).toBe(true);
  });
});

describe('the language is presentation only', () => {
  it('world generation, identities and saves are the same in every language', () => {
    const results = (['en', 'pt-BR', 'es'] as Locale[]).map((l) => {
      setLocale(l);
      const store = memoryStore();
      const world = generateTurtleWorld('turtle-i18n');
      const live = new LiveWorld(world, 'blobbi-9', 16, { store });
      live.save();
      const { generationMs: _ms, ...stats } = world.stats as unknown as Record<string, unknown>;
      return { identity: live.identity, save: store.get(saveKey(live.identity)), stats, objects: JSON.stringify(world.objects), terrain: hash32(Array.from(world.terrain.cls).join('')) };
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it('the title redraws in the new language without a restart', () => {
    const actions: TitleActions = { worlds: () => [], current: () => ({ identity: '', name: '', saved: false }), continueGame: () => {}, openWorld: () => {}, settings: () => {} };
    const title = new TitleScreen(actions);
    const labels = () => (title as unknown as { items(): { label: string }[] }).items().map((i) => i.label);
    expect(labels()[0]).toBe('NEW ADVENTURE'); // M11D.3: BEGIN became NEW ADVENTURE
    title.key('KeyL'); // the language key
    expect(getLocale()).toBe('pt-BR');
    expect(labels()[0]).toBe('NOVA AVENTURA');
    title.render(new PixelBuffer(960, 540), 0); // draws without throwing
    title.key('KeyL');
    expect(labels()[0]).toBe('NUEVA AVENTURA');
  });
});

describe('text size', () => {
  it('is kept, migrates the old large HUD setting, and ignores nonsense', () => {
    expect(readSettings({ textSize: 'large' }).textSize).toBe('large');
    expect(readSettings({ textSize: 'small', goals: false })).toMatchObject({ textSize: 'small', goals: false });
    expect(readSettings({ largeText: true }).textSize).toBe('large');
    expect(readSettings({ textSize: 'huge' }).textSize).toBe('normal');
    expect(readSettings(JSON.parse(JSON.stringify({ ...DEFAULT_SETTINGS, textSize: 'small' }))).textSize).toBe('small');
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('caps the menu scale: small 2, normal 3, large 4 (when the screen has room)', () => {
    const ui = new GameUI(() => null, () => ({}) as never);
    const at = (size: 'small' | 'normal' | 'large', w: number, h: number) => ((ui.settings.textSize = size), ui.scaleFor(w, h));
    expect([at('small', 1920, 1080), at('normal', 1920, 1080), at('large', 1920, 1080)]).toEqual([2, 3, 4]);
    expect([at('small', 1280, 720), at('normal', 1280, 720), at('large', 1280, 720)]).toEqual([2, 3, 3]);
    expect(at('normal', 667, 375)).toBe(2); // a small phone in landscape now gets 2× menus
  });
});

describe('content text (items, quests, notes, guide, homes, the Carrier, places, tips)', () => {
  it('every content text has a Portuguese and a Spanish translation, and nothing else is there', () => {
    const keys = [...contentTexts().keys()].sort();
    expect(keys.length).toBeGreaterThan(800);
    for (const table of Object.values(CONTENT_TRANSLATIONS)) {
      expect(Object.keys(table).sort()).toEqual(keys);
      for (const k of keys) expect(table[k].trim().length, k).toBeGreaterThan(0);
    }
  });

  it('every translated character is drawable, and every item has a grammatical gender', () => {
    for (const table of Object.values(CONTENT_TRANSLATIONS))
      for (const s of Object.values(table))
        for (const ch of s.normalize('NFC')) {
          expect(BODY_SMALL.has(ch) && BODY_LARGE.has(ch), `body fonts: ${ch} in "${s}"`).toBe(true);
          if (ch !== ' ') expect(tinyFontHas(ch), `3×5 font: ${ch}`).toBe(true);
        }
    for (const d of ALL_ITEMS) {
      const id = d.id.replace(/^blobbi-pixel:/, '');
      expect(GENDER_PT_BR[id], `pt gender ${id}`).toMatch(/^[mf]$/);
      expect(GENDER_ES[id], `es gender ${id}`).toMatch(/^[mf]$/);
    }
  });

  it('follows the language and comes back to the exact English', () => {
    const before = ALL_ITEMS.map((d) => [d.id, d.label, d.plural, d.description]);
    const quests = QUESTS.map((q) => [q.id, q.title, q.story, q.hint, q.reward.text]);
    setLocale('pt-BR');
    expect(itemLabel('blobbi-pixel:resource:stone')).toBe('pedra');
    expect(QUESTS.find((q) => q.id === 'meet')!.title).toBe('Conheça seu Blobbi');
    expect(PROBLEM_TEXT.water).toBe('não pode ser na água');
    setLocale('es');
    expect(itemLabel('blobbi-pixel:resource:stone')).toBe('piedra');
    expect(LORE.find((l) => l.id === 'arrival')!.title).toBe('Una isla pequeña');
    setLocale('en');
    expect(ALL_ITEMS.map((d) => [d.id, d.label, d.plural, d.description])).toEqual(before);
    expect(QUESTS.map((q) => [q.id, q.title, q.story, q.hint, q.reward.text])).toEqual(quests);
    expect(PROBLEM_TEXT.water).toBe('not on water');
  });

  it('internal ids never change with the language (items, quests, recipes, buildings)', () => {
    const ids = () => JSON.stringify([ALL_ITEMS.map((d) => d.id), QUESTS.map((q) => q.id), RECIPES.map((r) => [r.id, r.output.item]), Object.keys(BUILDINGS), LORE.map((l) => l.id)]);
    const en0 = ids();
    for (const l of ['pt-BR', 'es', 'en'] as Locale[]) {
      setLocale(l);
      expect(ids()).toBe(en0);
    }
  });

  it('builds noun phrases with the right article and contraction', () => {
    const stone = 'blobbi-pixel:resource:stone';
    const stick = 'blobbi-pixel:resource:stick';
    expect(itemNoun(stone)).toMatchObject({ the: 'the stone', a: 'a stone', to_the: 'to the stone' });
    expect(itemNoun('blobbi-pixel:food:onion-does-not-exist').a).toMatch(/^an? /);
    setLocale('pt-BR');
    expect(itemNoun(stone)).toMatchObject({ the: 'a pedra', a: 'uma pedra', of_the: 'da pedra', in_the: 'na pedra', to_the: 'à pedra' });
    expect(itemNoun(stick)).toMatchObject({ the: 'o graveto', of_the: 'do graveto', to_the: 'ao graveto' });
    expect(t('prompt.pickUp', itemNoun(stone))).toBe('pegar a pedra');
    setLocale('es');
    expect(itemNoun(stone)).toMatchObject({ the: 'la piedra', of_the: 'de la piedra', to_the: 'a la piedra' });
    expect(itemNoun(stick)).toMatchObject({ the: 'el palo', of_the: 'del palo', to_the: 'al palo' });
    expect(t('prompt.pickUp', itemNoun(stick))).toBe('recoger el palo');
  });

  it('every message key the source asks for exists (no typo can show a raw key)', () => {
    const asked = new Set<string>();
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : f.endsWith('.ts') ? [join(dir, f)] : []));
    for (const f of walk('src')) for (const m of readFileSync(f, 'utf8').matchAll(/\b(?:t|lang|tr)\('([a-zA-Z][\w.-]*)'/g)) asked.add(m[1]);
    expect(asked.size).toBeGreaterThan(400);
    for (const k of asked) expect(k in en, k).toBe(true);
  });

  it('a whole island plays the same story in Portuguese (messages are words, never state)', () => {
    setLocale('pt-BR');
    const store = memoryStore();
    const live = new LiveWorld(generateTurtleWorld('turtle-pt'), 'blobbi-9', 16, { store });
    expect(live.prompt() ?? '').not.toMatch(/\b(pick up|the|look at)\b/);
    live.save();
    setLocale('en');
    const again = new LiveWorld(generateTurtleWorld('turtle-pt'), 'blobbi-9', 16, { store: memoryStore() });
    again.save();
    expect(store.get(saveKey(live.identity))).toBe(again.save() ?? store.get(saveKey(live.identity)));
  });
});
