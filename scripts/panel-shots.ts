/**
 * PANEL SHOTS: a menu panel rendered headless at desktop and phone sizes, in every language, for a look at its
 * words and bars without a browser. Deterministic for a given code state.
 *
 *   npx tsx scripts/panel-shots.ts <label> [screen=care]
 *
 * Writes out/ui/<label>/<screen>-<locale>-<desktop|phone>.png (ignored by git).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { ITEMS } from '../src/game/items';
import { GameUI, type ScreenId } from '../src/ui/game-ui';
import { CareScreen } from '../src/ui/screens/care';
import { InventoryScreen } from '../src/ui/screens/inventory';
import { JournalScreen } from '../src/ui/screens/journal';
import { loadLocale, setLocale, type Locale } from '../src/i18n';
import '../src/content/text';
import { memoryStore } from '../src/game/persistence';
import { toPng } from '../src/node/png';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const label = args[0] ?? 'run';
const which = (args[1] ?? 'care') as ScreenId;
const dir = `out/ui/${label}`;
mkdirSync(dir, { recursive: true });

const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store: memoryStore() });
live.brain.enabled = false;
for (const id of [ITEMS.wood.id, ITEMS.stone.id, ITEMS.stick.id, 'blobbi-pixel:food:carrot']) live.inventory.add(id, 3);
live.care.hunger = 72;
live.care.energy = 55;
live.care.happiness = 64;
live.care.hygiene = 38;
const ui = new GameUI(() => live, () => paletteFor('cozy'));
/** A shared care snapshot as read for a Blobbi, so the panel's shared block draws its bars and words. */
const sharedCare = (() => {
  const stats = { hunger: 66, happiness: 81, health: 93, hygiene: 47, energy: 58 };
  const care = { pubkey: 'a'.repeat(64), d: 'blobbi-aaaaaaaaaaaa-0123456789', name: 'Pudding', stage: 'adult' as const, state: 'active' as const, stats, lastDecayAt: 1_760_000_000, lastInteraction: 1_760_000_000, createdAt: 1_760_000_000, eventId: 'x', project: () => stats };
  return { snapshot: () => ({ status: 'ready' as const, address: `31124:${care.pubkey}:${care.d}`, care, partial: true, fetchedAt: 1_760_000_000_000 }), nowSec: () => 1_760_000_190, refresh: () => {} };
})();
const care = new CareScreen();
care.shared = sharedCare;
for (const s of [new InventoryScreen(), new JournalScreen(), care]) ui.register(s);

async function main(): Promise<void> {
  await loadLocale('pt-BR');
  await loadLocale('es');
  for (const locale of ['en', 'pt-BR', 'es'] as Locale[]) {
    setLocale(locale);
    for (const [name, w, h] of [['desktop', 1280, 720], ['phone', 844, 390]] as const) {
      const screen = new PixelBuffer(w, h);
      screen.data.fill(0xff1a1d24);
      ui.open(which);
      ui.render(screen, 0);
      writeFileSync(`${dir}/${which}-${locale}-${name}.png`, toPng(screen));
    }
  }
  setLocale('en');
  console.log(`wrote 6 images to ${dir}/`);
}
void main();
