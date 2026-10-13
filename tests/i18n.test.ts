/**
 * M11B: languages. English, Brazilian Portuguese and Spanish, chosen from the browser or by the player, switched live,
 * with every key in every catalogue and every character drawable; the language never reaches a save, an identity or
 * world generation.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { CATALOGS, detectLocale, getLocale, initialLocale, LOCALES, missingKeys, setLocale, t, type Locale, type MessageKey } from '../src/i18n';
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

afterEach(() => setLocale('en'));

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
    const pt = CATALOGS['pt-BR'] as Record<string, unknown>;
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
      const c = CATALOGS[id] as Record<string, unknown>;
      expect(Object.keys(c).sort()).toEqual(keys);
      for (const k of keys) {
        const params = (m: unknown) => [...new Set(strings(m).flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1])))].sort();
        expect(params(c[k]), `${id} ${k}`).toEqual(params((en as Record<string, unknown>)[k]));
        for (const s of strings(c[k])) expect(s.trim().length, `${id} ${k}`).toBeGreaterThan(0);
      }
    });

  it('every character of every catalogue is in both body fonts and the 3×5 capitals', () => {
    const chars = new Set<string>();
    for (const { id } of LOCALES) for (const m of Object.values(CATALOGS[id])) for (const s of strings(m)) for (const ch of s.replace(/\{\w+\}/g, '').normalize('NFC')) chars.add(ch);
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
    expect(labels()[0]).toBe('BEGIN');
    title.key('KeyL'); // the language key
    expect(getLocale()).toBe('pt-BR');
    expect(labels()[0]).toBe('COMEÇAR');
    title.render(new PixelBuffer(960, 540), 0); // draws without throwing
    title.key('KeyL');
    expect(labels()[0]).toBe('EMPEZAR');
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
