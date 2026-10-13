/**
 * CONTENT TEXT IN OTHER LANGUAGES (M11B): the content's player-facing text — item names and descriptions, quests,
 * notes, the guide, homes and styles, the Carrier's words, places, tips — translated in place when the language
 * changes, keyed by the content's own stable ids (`item.<id>.label`, `quest.<id>.title`...).
 *
 * The English stays where it is written (the content files are the source); this module remembers each field's
 * English the first time it runs and writes the current language's text over the same objects, so every screen that
 * reads `itemLabel(id)` or `quest.title` shows the current language with no change of its own. Back to English
 * restores the originals exactly.
 *
 * Only display text is touched. Ids, kinds, recipes, numbers and anything a rule compares (house-art compares
 * `WALL_MATERIALS` names, so those arrays are never registered — the HOME screen reads its own copies in
 * `STYLE_OPTIONS`) stay as they are; world generation, the simulation and saves never read these fields
 * (`tests/i18n.test.ts` checks that generation and saves are identical in every language).
 */
import { getLocale, localeBundle, onLocaleChange, t, type Locale } from '../i18n';
import { ALL_ITEMS, MENU_LABEL, itemById, itemLabel, itemPlural } from '../game/items';
import { BUILDINGS } from '../game/buildings';
import { CROP_CONTENT } from './crops';
import { MEAL_CONTENT } from './meals';
import { PLACEABLE_CONTENT } from './placeables';
import { FISH_CONTENT, FISH_MEALS } from './tools';
import { QUEST_CONTENT, REQUEST_POOL } from './quests';
import { QUESTS } from '../game/objectives';
import { LORE } from './lore';
import { GUIDE_PAGES } from './guide';
import { HOUSE_LEVELS } from './houses';
import { PART_NAMES, STYLE_OPTIONS } from './home-styles';
import { HARMONY_LEVELS, HUM_LINES, MANTA_OBSERVATIONS, OBSERVATIONS, WHALE_OBSERVATIONS, GROWTH_STAGES as CARRIER_AGES } from '../game/carrier';
import { BIOMES, GROWTH_STAGES } from '../world/growth';
import { FRIEND_TITLES } from '../game/friendship';
import { TUTORIAL_STEPS } from '../game/tutorial';
import { PLACE_NAMES } from '../game/places';


interface Field {
  key: string;
  obj: Record<string, unknown>;
  prop: string | number;
}

let fields: Field[] | null = null;
const english = new Map<string, string>();

/** Every translatable field: (key, object, property). Several objects may share a key (copies of the same text). */
function collect(): Field[] {
  const out: Field[] = [];
  const add = (key: string, obj: unknown, prop: string | number) => {
    const o = obj as Record<string, unknown>;
    if (!o || typeof o[prop] !== 'string' || !(o[prop] as string).trim()) return;
    out.push({ key, obj: o, prop });
    if (!english.has(key)) english.set(key, o[prop] as string);
  };
  for (const d of ALL_ITEMS) {
    add(`item.${d.id}.label`, d, 'label');
    add(`item.${d.id}.plural`, d, 'plural');
    add(`item.${d.id}.description`, d, 'description');
  }
  // Copies of item text elsewhere use the item's own keys.
  const itemKeys = (id: string, obj: unknown, map: Record<string, string>) => {
    if (!itemById(id)) return;
    for (const [prop, field] of Object.entries(map)) add(`item.${id}.${field}`, obj, prop);
  };
  for (const c of CROP_CONTENT) {
    itemKeys(c.produce.id, c, { label: 'label', plural: 'plural' });
    itemKeys(c.produce.id, c.produce, { label: 'label', plural: 'plural', description: 'description' });
    if (typeof c.seed === 'object') itemKeys(c.seed.id, c.seed, { label: 'label', plural: 'plural', description: 'description' });
  }
  for (const m of [...MEAL_CONTENT, ...FISH_MEALS]) itemKeys(m.id, m, { label: 'label', plural: 'plural', description: 'description' });
  for (const p of PLACEABLE_CONTENT) itemKeys(`blobbi-pixel:furniture:${p.kind}`, p, { label: 'label', plural: 'plural', description: 'description' });
  for (const b of Object.values(BUILDINGS)) {
    const item = b.item && b.kind !== 'shelter' ? itemById(b.item) : undefined;
    if (item && b.label === item.label) itemKeys(item.id, b, { label: 'label' });
    else add(`building.${b.kind}.label`, b, 'label');
    // The M4 decorations say what they do in their own words; the catalogue's placeables reuse their item's text.
    if (item && b.purpose === item.description) itemKeys(item.id, b, { purpose: 'description' });
    else add(`building.${b.kind}.purpose`, b, 'purpose');
  }
  for (const f of FISH_CONTENT) add(`fish.${f.item.id}.hint`, f, 'hint');
  for (const [k] of Object.entries(MENU_LABEL)) add(`menu.${k}`, MENU_LABEL, k);
  // Quests and requests (the objectives are copies of the quest content).
  for (const q of [...QUEST_CONTENT, ...QUESTS]) {
    add(`quest.${q.id}.title`, q, 'title');
    add(`quest.${q.id}.story`, q, 'story');
    add(`quest.${q.id}.hint`, q, 'hint');
    add(`quest.${q.id}.reward`, q.reward, 'text');
  }
  for (const r of REQUEST_POOL) {
    add(`request.${r.id}.title`, r, 'title');
    add(`request.${r.id}.reward`, r.reward, 'text');
  }
  for (const l of LORE) {
    add(`lore.${l.id}.title`, l, 'title');
    add(`lore.${l.id}.text`, l, 'text');
  }
  for (const p of GUIDE_PAGES) {
    add(`guide.${p.id}.title`, p, 'title');
    add(`guide.${p.id}.text`, p, 'text');
  }
  for (const h of HOUSE_LEVELS) {
    add(`house.${h.level}.name`, h, 'name');
    add(`house.${h.level}.blurb`, h, 'blurb');
  }
  for (const [part, options] of Object.entries(STYLE_OPTIONS)) {
    add(`stylePart.${part}`, PART_NAMES, part);
    options.forEach((o, i) => {
      add(`style.${part}.${i}.name`, o, 'name');
      add(`style.${part}.${i}.unlock`, o.unlock, 'label');
    });
  }
  for (const o of [...OBSERVATIONS, ...MANTA_OBSERVATIONS, ...WHALE_OBSERVATIONS]) {
    add(`observation.${o.id}.text`, o, 'text');
    add(`observation.${o.id}.note`, o, 'note');
  }
  HARMONY_LEVELS.forEach((h, i) => add(`harmony.${i}`, h, 'name'));
  HUM_LINES.forEach((lines, i) => lines.forEach((_, j) => add(`hum.${i}.${j}`, lines, j)));
  for (const a of CARRIER_AGES) add(`carrierAge.${a.stage}`, a, 'note');
  for (const s of GROWTH_STAGES) add(`growth.${s.stage}.name`, s, 'name');
  for (const b of Object.values(BIOMES)) {
    add(`biome.${b.id}.name`, b, 'name');
    add(`biome.${b.id}.note`, b, 'note');
  }
  FRIEND_TITLES.forEach((_, i) => add(`friend.${i}`, FRIEND_TITLES, i));
  for (const s of TUTORIAL_STEPS) {
    add(`tip.${s.id}.keys`, s, 'keys');
    add(`tip.${s.id}.touch`, s, 'touch');
  }
  for (const [id, p] of Object.entries(PLACE_NAMES)) {
    add(`place.${id}.name`, p, 'name');
    add(`place.${id}.note`, p, 'note');
  }
  return out;
}

/** Every content text key with its English (for tests and the translation catalogues). */
export function contentTexts(): ReadonlyMap<string, string> {
  fields ??= collect();
  return english;
}

/** Write a language's content text over the content (English restores the originals). Missing keys stay English. */
export function applyContentLocale(locale: Locale): void {
  fields ??= collect();
  const table = locale === 'en' ? null : localeBundle(locale)?.content;
  for (const f of fields) f.obj[f.prop] = table?.[f.key] ?? english.get(f.key)!;
}

// ─── Nouns in sentences ────────────────────────────────────────────────────

/**
 * The parameters a message about a thing receives, so each language can build its own phrase: the bare name (`name`,
 * `names`), with an article (`the`, `a`), and the article joined to a preposition (`of_the`, `in_the`, `on_the`,
 * `to_the`), which Portuguese and Spanish contract ("da pedra", "no fogão", "al árbol"). A message uses whichever it
 * needs; `tests/i18n.test.ts` accepts any of these where the English message uses one.
 */
export const NOUN_PARAMS = ['name', 'names', 'the', 'a', 'of_the', 'in_the', 'on_the', 'to_the'] as const;
export type NounParams = Record<(typeof NOUN_PARAMS)[number], string>;

/** Grammatical gender of a thing in a language (items by id; a few things without items by a `kind:` key). */
export function genderOf(key: string, locale: Locale = getLocale()): 'm' | 'f' {
  const table = localeBundle(locale)?.gender;
  return table?.[key.replace(/^blobbi-pixel:/, '')] ?? 'm';
}

/** Noun phrases for a name with a gender, in the current language. */
export function nounPhrases(name: string, names: string, gender: 'm' | 'f'): NounParams {
  const l = getLocale();
  if (l === 'pt-BR') {
    const f = gender === 'f';
    return { name, names, the: `${f ? 'a' : 'o'} ${name}`, a: `${f ? 'uma' : 'um'} ${name}`, of_the: `${f ? 'da' : 'do'} ${name}`, in_the: `${f ? 'na' : 'no'} ${name}`, on_the: `${f ? 'na' : 'no'} ${name}`, to_the: `${f ? 'à' : 'ao'} ${name}` };
  }
  if (l === 'es') {
    const f = gender === 'f';
    return { name, names, the: `${f ? 'la' : 'el'} ${name}`, a: `${f ? 'una' : 'un'} ${name}`, of_the: `${f ? 'de la' : 'del'} ${name}`, in_the: `en ${f ? 'la' : 'el'} ${name}`, on_the: `en ${f ? 'la' : 'el'} ${name}`, to_the: `${f ? 'a la' : 'al'} ${name}` };
  }
  const an = /^[aeiou]/i.test(name) ? 'an' : 'a';
  return { name, names, the: `the ${name}`, a: `${an} ${name}`, of_the: `of the ${name}`, in_the: `in the ${name}`, on_the: `on the ${name}`, to_the: `to the ${name}` };
}

/** Noun phrases for an item, by id. */
export const itemNoun = (id: string): NounParams => nounPhrases(itemLabel(id), itemPlural(id), genderOf(id));

/** Noun phrases for a placed thing (its item's, or the shelter's own). */
export function buildingNoun(kind: string): NounParams {
  const b = BUILDINGS[kind];
  if (b?.item && kind !== 'shelter') return itemNoun(b.item);
  return nounPhrases(b?.label ?? kind, b?.label ?? kind, genderOf(`building:${kind}`));
}

/** Noun phrases for a crop, by its kind (its produce's name). */
export function cropNoun(kind: string): NounParams {
  const c = CROP_CONTENT.find((x) => x.kind === kind);
  return c ? itemNoun(c.produce.id) : nounPhrases(kind, kind, 'm');
}

// ─── Places ────────────────────────────────────────────────────────────────

/**
 * A place's name and journal line in the current language. Places are made once per world (copies), so screens ask
 * here by id: the island's named spots, the landing, and grown regions (named from their biome).
 */
export function placeText(p: { id: string; name: string; note: string; biome?: string; stage?: number }): { name: string; note: string } {
  const known = PLACE_NAMES[p.id];
  if (known) return known;
  if (p.id === 'landing') return { name: t('place.landing.name'), note: t('place.landing.note') };
  const biome = p.biome ? BIOMES[p.biome as keyof typeof BIOMES] : undefined;
  if (biome) {
    const name = p.biome === 'coastal' && p.stage === 3 ? t('place.outerShore') : t('place.region', { biome: getLocale() === 'en' ? biome.name.toLowerCase() : biome.name });
    return { name, note: t('place.regionNote', { note: biome.note, n: p.stage ?? 1 }) };
  }
  return p;
}

/** A place's name without its leading article, for the map's small labels ("The still pond" → "still pond"). */
export const shortPlaceName = (name: string): string => name.replace(/^(The|O|A|Os|As|El|La|Los|Las) /, '');

// Follow the language from the moment this module is loaded.
applyContentLocale(getLocale());
onLocaleChange(applyContentLocale);
