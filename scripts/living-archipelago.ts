/**
 * M6 LIVING ARCHIPELAGO images: the title screen, the new HUD, the Carrier panel, the map and the journal's places,
 * through the game's own renderers and UI, on a world played through by the scripted story.
 *   npx tsx scripts/living-archipelago.ts [outDir=examples/living-archipelago]
 * (Teleport frames: scripts/teleport.ts. Carrier species: scripts/carriers.ts.)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { toPng } from '../src/node/png';
import { paletteFor } from '../src/world/generate';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { ViewCamera, worldBounds, type CameraModeId } from '../src/render/view-camera';
import { GameUI } from '../src/ui/game-ui';
import { TitleScreen } from '../src/ui/title';
import { CarrierScreen } from '../src/ui/screens/carrier';
import { MapScreen } from '../src/ui/screens/map';
import { JournalScreen } from '../src/ui/screens/journal';
import { SettingsScreen } from '../src/ui/screens/settings';
import { DEFAULT_AUDIO } from '../src/audio/engine';
import { ITEMS } from '../src/game/items';
import { playLoop, run, stand } from '../src/dev/scripted-play';
import { worldName, parseIdentity } from '../src/game/worlds';

const outDir = process.argv[2] ?? 'examples/living-archipelago';
mkdirSync(outDir, { recursive: true });
const write = (name: string, buf: PixelBuffer) => writeFileSync(join(outDir, name), toPng(buf));
const W = 960;
const H = 540;

const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
playLoop(live);
const view = new ViewRenderer(live, new LiveRenderer(live));
const shot = (mode: CameraModeId, ui = DEFAULT_VIEW_UI, target = live.cameraTarget()) => {
  const cam = new ViewCamera(mode);
  const b = live.sceneBounds() ?? worldBounds(live.world);
  const v = cam.update(0, target, W, H, b, true);
  return view.render(v, cam.restScale(mode, W, H, b), live.clock.time, DEFAULT_LIVE_OPTIONS, ui).clone();
};

// ─── Title ───────────────────────────────────────────────────────────────
{
  const id = live.identity;
  const title = new TitleScreen({
    worlds: () => [{ identity: id, params: parseIdentity(id)!, name: worldName(id), day: 3, quests: 12, buildings: 9, lastPlayed: 1 }],
    current: () => ({ identity: id, name: worldName(id), saved: true }),
    continueGame: () => {},
    openWorld: () => {},
    newWorld: () => {},
    settings: () => {},
  });
  const sheet = new PixelBuffer(W * 2, H);
  const b = worldBounds(live.world);
  const main = shot('exploration', { ...DEFAULT_VIEW_UI, hud: false, indicator: false, goals: false, prompt: false }, { x: b.width / 2, y: b.height / 2, size: 16 });
  const islands = main.clone();
  title.render(main, 0);
  title.key('ArrowDown');
  title.key('Enter');
  title.render(islands, 0);
  sheet.blit(main, 0, 0);
  sheet.blit(islands, W, 0);
  write('title.png', sheet);
}

// ─── HUD: a moment of play, with toasts ──────────────────────────────────
{
  const shelter = live.buildings.find((x) => x.kind === 'shelter')!;
  stand(live, shelter.x + 20, shelter.y + 26, 'down');
  run(live, 30);
  shot('exploration');
  live.inventory.add(ITEMS.wood.id, 3);
  live.inventory.add(ITEMS.stone.id, 2);
  shot('exploration');
  run(live, 30); // the toasts slide in
  write('hud.png', shot('exploration'));
}

// ─── Panels: the Carrier, the map, the journal's places, sound settings ──
{
  live.resources = live.resources.filter((n) => Math.hypot(n.x - live.listenSpot!.x, n.y - live.listenSpot!.y) > 20);
  stand(live, live.listenSpot!.x, live.listenSpot!.y, 'down');
  live.greetCarrier();
  live.observeCarrier();
  live.observeCarrier();
  live.inventory.add(live.carrierLikes[0], 1);
  live.offerToCarrier(live.carrierLikes[0]);
  for (const p of live.places.slice(0, 4)) live.visited.add(p.id);
  for (const d of live.discoveries.slice(0, 3)) live.found.add(d.id);
  run(live, 10);
  const ui = new GameUI(() => live, () => paletteFor('cozy'));
  const settings = new SettingsScreen();
  settings.audio = { ...DEFAULT_AUDIO };
  const journal = new JournalScreen();
  for (const s of [new CarrierScreen(), new MapScreen(), journal, settings]) ui.register(s);
  const panels: PixelBuffer[] = [];
  for (const id of ['carrier', 'map', 'journal', 'settings'] as const) {
    ui.open(id);
    if (id === 'journal') journal.tab = 'places';
    if (id === 'settings') settings.page = 'sound';
    const f = shot('closeup');
    ui.render(f, 10);
    panels.push(f);
    ui.close();
  }
  const sheet = new PixelBuffer(W * 2, H * 2);
  panels.forEach((p, i) => sheet.blit(p, (i % 2) * W, Math.floor(i / 2) * H));
  write('panels.png', sheet);
}
console.log(`wrote ${outDir}: title, hud, panels`);
