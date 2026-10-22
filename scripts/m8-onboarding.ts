/**
 * M8 ONBOARDING images, through the game's own renderers and UI: the welcome page, the Carrier choice, naming the
 * island, the delete confirmation, a new island's first frame with a tip (keyboard and touch), the touch menu bar
 * with the build mode's buttons, and the guide.
 *   npx tsx scripts/m8-onboarding.ts [outDir=examples/m8-onboarding]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { toPng } from '../src/node/png';
import { paletteFor } from '../src/world/generate';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { ViewCamera, worldBounds, type CameraModeId } from '../src/render/view-camera';
import { GameUI } from '../src/ui/game-ui';
import { TitleScreen } from '../src/ui/title';
import { GuideScreen } from '../src/ui/screens/guide';
import { speciesThumbnail } from '../src/carriers/species';
import { parseIdentity } from '../src/game/worlds';
import { CARD_PIC } from '../src/ui/title';
import { ITEMS } from '../src/game/items';

const outDir = process.argv[2] ?? 'examples/m8-onboarding';
mkdirSync(outDir, { recursive: true });
const write = (name: string, buf: PixelBuffer) => writeFileSync(join(outDir, name), toPng(buf));

const world = generateWhaleWorld('island-m8-onboarding', { carrierSeed: 'whale-onb', generatedHouse: false });
const live = new LiveWorld(world, 'blobbi-9', 16);
live.brain.enabled = false;
const view = new ViewRenderer(live, new LiveRenderer(live));
const frame = (W: number, H: number, mode: CameraModeId = 'exploration', bottom = 0, hud = true) => {
  const cam = new ViewCamera(mode);
  const b = worldBounds(live.world);
  const v = cam.update(0, live.cameraTarget(), W, H, b, true);
  return view.render(v, cam.restScale(mode, W, H, b), live.clock.time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, lighting: false, bottom, ...(hud ? {} : { hud: false, goals: false, prompt: false, indicator: false }) }).clone();
};

// ─── The title: first time, the Carrier choice, the name, a delete confirmation ──────────────────────
{
  const saved = { identity: 'seed=a|kind=whale|carrier=c|1280x768|scale=1.6|palette=cozy|density=1|islands=1', params: parseIdentity('seed=a|kind=whale|carrier=c|1280x768|scale=1.6|palette=cozy|density=1|islands=1')!, name: 'Kelp Harbour', day: 4, quests: 9, buildings: 3, lastPlayed: 2 };
  const pics = new Map<string, PixelBuffer>();
  const preview = (kind: 'turtle' | 'manta' | 'whale', t: number) => {
    const key = `${kind}|${Math.floor(t * 4) % 48}`;
    if (!pics.has(key)) pics.set(key, speciesThumbnail(kind, `${kind}-title`, CARD_PIC.w, CARD_PIC.h, (Math.floor(t * 4) % 48) / 4, paletteFor('cozy')));
    return pics.get(key)!;
  };
  const first = new TitleScreen({ worlds: () => [], current: () => ({ identity: '', name: '', saved: false }), continueGame: () => {}, openWorld: () => {}, settings: () => {}, preview });
  const shot = (t: TitleScreen, name: string, time = 1) => {
    const f = frame(960, 540, 'exploration', 0, false);
    t.render(f, time);
    write(name, f);
  };
  shot(first, 'title-01-welcome.png');
  first.key('Enter');
  shot(first, 'title-02-carrier-turtle.png');
  first.key('ArrowRight');
  first.key('ArrowRight');
  shot(first, 'title-03-carrier-whale.png', 2.3);
  first.key('Enter');
  for (const ch of 'Kelp Harbour') first.key(ch === ' ' ? 'Space' : `Key${ch.toUpperCase()}`, ch);
  shot(first, 'title-04-name.png');
  first.key('Enter');
  shot(first, 'title-05-creating.png');
  const back = new TitleScreen({ worlds: () => [saved], current: () => ({ identity: '', name: '', saved: false }), continueGame: () => {}, openWorld: () => {}, settings: () => {}, preview, deleteWorld: () => {} });
  shot(back, 'title-06-returning.png');
  back.key('ArrowDown');
  back.key('Enter');
  shot(back, 'title-07-my-islands.png');
  back.key('KeyX');
  shot(back, 'title-08-delete-confirm.png', 0);
}

// ─── Play: the new island's first frame with a tip; touch; build mode; the guide ─────────────────────
{
  const ui = new GameUI(() => live, () => paletteFor('cozy'));
  ui.register(new GuideScreen());
  let f = frame(960, 540);
  ui.render(f, 0);
  write('play-01-first-frame-tip-keys.png', f);
  ui.touchMode = true;
  f = frame(844, 390, 'exploration', 40);
  ui.render(f, 0);
  write('play-02-touch-tip-844x390.png', f);
  live.inventory.add(ITEMS.wood.id, 6);
  live.inventory.add(ITEMS.stone.id, 3);
  live.setBuildMode('shelter');
  f = frame(844, 390, 'exploration', 40);
  ui.render(f, 0);
  write('play-03-touch-build-mode-bar.png', f);
  live.setBuildMode(null);
  f = frame(568, 320, 'exploration', 60);
  ui.render(f, 0);
  write('play-04-touch-568x320.png', f);
  ui.touchMode = false;
  ui.open('guide');
  f = frame(960, 540);
  ui.render(f, 0);
  write('play-05-guide.png', f);
}
console.log(`wrote ${outDir}`);
