/** Everything Brazilian Portuguese needs, loaded only when the language is chosen (its own chunk). */
import { ptBR } from '../messages/pt-BR';
import { CONTENT_PT_BR, GENDER_PT_BR } from '../content/pt-BR';
import type { LocaleBundle } from '../index';

export const bundle: LocaleBundle = { messages: ptBR, content: CONTENT_PT_BR, gender: GENDER_PT_BR };
