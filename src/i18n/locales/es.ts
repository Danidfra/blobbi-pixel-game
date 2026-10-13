/** Everything Spanish needs, loaded only when the language is chosen (its own chunk). */
import { es } from '../messages/es';
import { CONTENT_ES, GENDER_ES } from '../content/es';
import type { LocaleBundle } from '../index';

export const bundle: LocaleBundle = { messages: es, content: CONTENT_ES, gender: GENDER_ES };
