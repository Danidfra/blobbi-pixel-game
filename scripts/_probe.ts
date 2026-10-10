import { writeFileSync } from 'node:fs';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { LiveRenderer, Camera, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ITEMS } from '../src/game/items';
import { STEEL } from '../src/game/equipment';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
live.brain.enabled = false;
live.inventory.add(ITEMS.axe.id, 1);
live.equip(ITEMS.axe.id);
const renderer = new LiveRenderer(live);
const components = (f: PixelBuffer) => {
  const seen = new Uint8Array(f.width * f.height);
  const isSteel = (c: number) => c === STEEL.mid || c === STEEL.light || c === STEEL.dark;
  let n = 0;
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] || !isSteel(f.data[i])) continue;
    n++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % f.width, y = Math.floor(k / f.width);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= f.width || ny >= f.height) continue;
        const j = ny * f.width + nx;
        if (!seen[j] && isSteel(f.data[j])) { seen[j] = 1; stack.push(j); }
      }
    }
  }
  return n;
};
const panels: PixelBuffer[] = [];
for (const dir of ['left', 'right', 'up', 'down'] as const) {
  for (let i = 0; i < 3; i++) {
    live.update(1 / 60, { ...IDLE_INPUT, [dir]: true });
    const camera = new Camera();
    camera.follow(live.blobbi.x, live.blobbi.y - 8, 64, 48, live.world.options.width, live.world.options.height, 0, true);
    const f = renderer.render(64, 48, camera.x, camera.y, live.clock.time, { ...DEFAULT_LIVE_OPTIONS, hud: false }).clone();
    console.log(dir, 'step', i, 'pose', JSON.stringify(live.blobbi.animator.pose(live.clock.time)), 'turning', !!live.blobbi.animator.state.turning, 'steel components', components(f));
    panels.push(f);
  }
  for (let i = 0; i < 30; i++) live.update(1 / 60, IDLE_INPUT);
}
const sheet = new PixelBuffer(panels.length * 66, 48);
sheet.fill(hex('#1b1f2a'));
panels.forEach((p, i) => sheet.blit(p, i * 66, 0));
writeFileSync('out/probe.png', toPng(sheet.scaled(4)));
