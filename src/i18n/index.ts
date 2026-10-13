/**
 * LANGUAGES (M11B): English, Brazilian Portuguese and Spanish; ready for more.
 *
 * - `t(key, params)` reads a typed, stable key from the current language's catalogue, falls back to English, and
 *   interpolates `{name}` parameters. A message may be plural (`{ one, other }`, chosen with `Intl.PluralRules` by the
 *   `count` parameter).
 * - Catalogues are plain modules in `messages/`: `en.ts` is the source; every other language must have every key
 *   (the type system and `tests/i18n.test.ts` check it), so nothing silently stays in English.
 * - English is built in; every other language is a separate chunk (`locales/`), loaded when chosen (`useLocale`), so
 *   a language costs nothing to players who do not use it.
 * - Content text (items, quests, notes...) is translated by the content overlay (`content-text.ts`), keyed by the
 *   content's ids.
 * - Presentation only: the language never reaches world generation, the simulation, a save or an identity. Names the
 *   player chose are never translated.
 */
import { en, type Message } from './messages/en';

export type Locale = 'en' | 'pt-BR' | 'es';
export type MessageKey = keyof typeof en;
export type Params = Readonly<Record<string, string | number>>;
export type Catalog = { readonly [K in MessageKey]: Message };

/** The languages offered, each named in itself. */
export const LOCALES: readonly { id: Locale; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'pt-BR', name: 'Português (Brasil)' },
  { id: 'es', name: 'Español' },
];

/** Everything a language other than English brings: its messages, its content text and its nouns' genders. */
export interface LocaleBundle {
  messages: Catalog;
  content: Readonly<Record<string, string>>;
  gender: Readonly<Record<string, 'm' | 'f'>>;
}

/** The catalogues loaded so far (English always). */
export const CATALOGS: Partial<Record<Locale, Catalog>> = { en };
const bundles: Partial<Record<Locale, LocaleBundle>> = {};
const loaders: Record<Exclude<Locale, 'en'>, () => Promise<LocaleBundle>> = {
  'pt-BR': () => import('./locales/pt-BR').then((m) => m.bundle),
  es: () => import('./locales/es').then((m) => m.bundle),
};

/** Load a language's chunk (once). English needs nothing. */
export async function loadLocale(locale: Locale): Promise<void> {
  if (locale === 'en' || bundles[locale]) return;
  const b = await loaders[locale]();
  bundles[locale] = b;
  CATALOGS[locale] = b.messages;
}

/** A loaded language's bundle, or null (English, or not loaded yet). */
export const localeBundle = (locale: Locale): LocaleBundle | null => bundles[locale] ?? null;

/** Where the player's explicit choice is kept (per browser, never in a save). */
export const LOCALE_KEY = 'blobbi-pixel-lab:locale';

let current: Locale = 'en';
let plurals = new Intl.PluralRules('en');
const listeners = new Set<(l: Locale) => void>();
/** Keys asked for that no catalogue has (a bug; shown as the key itself). */
export const missingKeys = new Set<string>();

export const isLocale = (v: unknown): v is Locale => v === 'en' || v === 'pt-BR' || v === 'es';

/** The browser's preferred languages to one of ours: pt-* → pt-BR, es-* → es, anything else → en. */
export function detectLocale(preferred: readonly string[] | undefined): Locale {
  for (const tag of preferred ?? []) {
    const lang = tag.toLowerCase().split(/[-_]/)[0];
    if (lang === 'pt') return 'pt-BR';
    if (lang === 'es') return 'es';
    if (lang === 'en') return 'en';
  }
  return 'en';
}

/** The stored choice, else the browser's languages. */
export function initialLocale(stored: string | null, preferred: readonly string[] | undefined): Locale {
  return isLocale(stored) ? stored : detectLocale(preferred);
}

export const getLocale = (): Locale => current;

/**
 * Change the language now (every screen reads it as it draws, so nothing needs a restart). A language that is not
 * loaded yet is loaded first, and switched to when it arrives (see `useLocale` to wait for it).
 */
export function setLocale(locale: Locale): void {
  if (!isLocale(locale) || locale === current) return;
  if (locale !== 'en' && !bundles[locale]) {
    void loadLocale(locale).then(() => setLocale(locale));
    return;
  }
  current = locale;
  plurals = new Intl.PluralRules(locale);
  for (const l of listeners) l(locale);
}

/** Load a language if needed, then switch to it. */
export async function useLocale(locale: Locale): Promise<void> {
  await loadLocale(locale);
  setLocale(locale);
}

/** Called after every language change (the content overlay, cached HUD text). Returns an unsubscribe. */
export function onLocaleChange(listener: (l: Locale) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const interpolate = (text: string, params?: Params): string =>
  params ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole)) : text;

/** The plural form for `count` in the current language (CLDR categories; anything missing uses `other`). */
export function pluralForm(message: Exclude<Message, string>, count: number): string {
  const cat = plurals.select(count) as keyof typeof message;
  return message[cat] ?? message.other;
}

/** A message in the current language, with `{param}`s filled in. Plural messages need a `count` parameter. */
export function t(key: MessageKey, params?: Params): string {
  const message = CATALOGS[current]?.[key] ?? en[key];
  if (message === undefined) {
    missingKeys.add(key);
    return key;
  }
  if (typeof message === 'string') return interpolate(message, params);
  return interpolate(pluralForm(message, Number(params?.count ?? 0)), params);
}

/** A message by a key built at run time (content ids), or `fallback` when no catalogue has it. */
export function tOr(key: string, fallback: string, params?: Params): string {
  return key in en ? t(key as MessageKey, params) : fallback;
}

/** Upper case for the current language (the pixel title font draws capitals only). */
export const upper = (s: string): string => s.toLocaleUpperCase(current);

/** A sentence's first letter in capitals ("pick up the stone" → "Pick up the stone"), for lines built from fragments. */
export const sentence = (s: string): string => {
  const [first = '', ...rest] = [...s];
  return first.toLocaleUpperCase(current) + rest.join('');
};
