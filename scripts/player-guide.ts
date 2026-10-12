/**
 * Writes docs/game-design/PLAYER-GUIDE.md from the in-game guide's pages (`src/content/guide.ts`), so the document
 * and the game never disagree.   npx tsx scripts/player-guide.ts
 */
import { writeFileSync } from 'node:fs';
import { GUIDE_PAGES } from '../src/content/guide';

const out = [
  '# Player guide',
  '',
  '> Generated from `src/content/guide.ts` by `scripts/player-guide.ts`: do not edit by hand. In the game: the GUIDE',
  '> button, `?` or F1. Each page describes what the game does today.',
  '',
  ...GUIDE_PAGES.flatMap((p) => [`## ${p.title}`, '', p.text, '']),
].join('\n');
writeFileSync('docs/game-design/PLAYER-GUIDE.md', out);
console.log(`wrote docs/game-design/PLAYER-GUIDE.md: ${GUIDE_PAGES.length} pages`);
