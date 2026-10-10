import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT, SWING, type LiveInput } from '../src/sim/live-world';
import { LiveRenderer, Camera, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { attachTool, EquipmentRig, EQUIPMENT, STEEL, toolIcon, toolSprite } from '../src/game/equipment';
import { blobbiIdentity } from '../src/blobbi/identity';
import { buildBlobbiSprite, REST_POSE, type BlobbiPose } from '../src/blobbi/sprite';
import { ITEMS } from '../src/game/items';
import { paletteFor } from '../src/world/generate';
import { REACH } from '../src/game/resources';
import { alpha } from '../src/core/color';
import type { PixelBuffer } from '../src/core/pixel';

const palette = paletteFor('cozy');
const AXE = ITEMS.axe.id;
const run = (live: LiveWorld, steps: number, input: Partial<LiveInput> = {}) => {
  for (let i = 0; i < steps; i++) live.update(1 / 60, { ...IDLE_INPUT, ...input, interact: i === 0 && !!input.interact, plant: false });
};
const steelPixels = (buf: PixelBuffer) => {
  let n = 0;
  for (const c of buf.data) if (c === STEEL.mid || c === STEEL.light || c === STEEL.dark) n++;
  return n;
};
function faceTree(live: LiveWorld, dir: 'up' | 'right' = 'up'): number {
  for (let i = 0; i < live.world.objects.length; i++) {
    const o = live.world.objects[i];
    if (o.kind !== 'tree' || live.treeAt(i).phase !== 'grown') continue;
    const s = live.spriteOf(o);
    const x = dir === 'right' ? o.x - s.footRx - 5 : o.x;
    const y = dir === 'right' ? o.y : o.y + s.footRy + 5;
    if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
    live.blobbi.x = x;
    live.blobbi.y = y;
    run(live, 1, { [dir]: true });
    live.blobbi.x = x;
    live.blobbi.y = y;
    if (live.facingObject()?.index === i) {
      live.resources = live.resources.filter((n) => Math.hypot(n.x - x, (n.y - y) * 1.25) > REACH + 2);
      return i;
    }
  }
  throw new Error('no tree to face');
}
function frameAt(live: LiveWorld, renderer: LiveRenderer, time = live.clock.time): PixelBuffer {
  const camera = new Camera();
  camera.follow(live.blobbi.x, live.blobbi.y - 8, 96, 72, live.world.options.width, live.world.options.height, 0, true);
  return renderer.render(96, 72, camera.x, camera.y, time, { ...DEFAULT_LIVE_OPTIONS, hud: false, animateWind: false, animateWater: false }).clone();
}

describe('the procedural axe', () => {
  it('has a wooden handle, a steel head, an outline and a grip, in every orientation, mirrored and scaled; the icon is the resting axe', () => {
    for (const o of ['rest', 'lowered', 'raised', 'strike', 'strike-down', 'strike-up'] as const)
      for (const m of [false, true]) {
        const s = toolSprite(AXE, o, palette, m);
        let wood = 0;
        let outline = 0;
        for (const c of s.buffer.data) {
          if (c === palette.wood.mid || c === palette.wood.light || c === palette.wood.dark) wood++;
          if (c === palette.wood.outline || c === STEEL.outline) outline++;
        }
        expect(wood).toBeGreaterThanOrEqual(3);
        expect(steelPixels(s.buffer)).toBeGreaterThanOrEqual(4);
        expect(outline).toBeGreaterThan(wood + steelPixels(s.buffer) * 0.5);
        expect(alpha(s.buffer.get(s.gripX, s.gripY))).toBe(255);
        expect(s.buffer.width).toBeLessThanOrEqual(9);
        expect(s.buffer.height).toBeLessThanOrEqual(9);
        // Mirroring flips the head to the other side of the handle.
        const other = toolSprite(AXE, o, palette, !m);
        expect(other.buffer.width).toBe(s.buffer.width);
        expect(other.buffer.data).not.toEqual(s.buffer.data);
      }
    const icon = toolIcon(AXE, palette);
    expect(icon.buffer.data).toEqual(toolSprite(AXE, 'rest', palette).buffer.data);
    const big = toolSprite(AXE, 'rest', palette, false, 2);
    expect(big.buffer.width).toBe(icon.buffer.width * 2);
    expect(big.gripX).toBe(icon.gripX * 2);
    // Deterministic: the same inputs, the same pixels.
    expect(toolSprite(AXE, 'strike', palette, true).buffer.data).toEqual(toolSprite(AXE, 'strike', palette, true).buffer.data);
    expect(EQUIPMENT[AXE].item).toBe(AXE);
  });
});

describe('attachment to the Blobbi', () => {
  const identity = blobbiIdentity('blobbi-9');
  const size = 16;
  const rig = new EquipmentRig(identity, size);
  const spriteOf = (p: BlobbiPose) => buildBlobbiSprite(identity, p, size);
  const views: Partial<BlobbiPose>[] = [{ view: 'front' }, { view: 'back' }, { view: 'side', facing: 1 }, { view: 'side', facing: -1 }];

  it('finds a hand on the canonical sprite in every view and walk frame, never guessed, at arm height, on the arm side', () => {
    for (const v of views)
      for (const walk of [-1, 0, 2, 4] as const) {
        const pose = { ...REST_POSE, ...v, walk };
        const arm = pose.view === 'side' ? 'near-arm' : 'right-arm';
        const hand = rig.hand(pose, arm, spriteOf);
        expect(hand.guessed).toBe(false);
        expect(hand.dy).toBeLessThan(-size * 0.2);
        expect(hand.dy).toBeGreaterThan(-size * 0.8);
        if (pose.view === 'side') expect(Math.sign(hand.dx) || pose.facing).toBe(pose.facing);
        expect(hand.behind).toBe(pose.view === 'back');
      }
  });

  it('attaches per direction: mirrored for the left, in front for front and side, behind for the back at rest and in front when striking', () => {
    const front = attachTool(AXE, { ...REST_POSE, view: 'front' }, 'idle', rig, spriteOf, palette);
    const back = attachTool(AXE, { ...REST_POSE, view: 'back' }, 'idle', rig, spriteOf, palette);
    const right = attachTool(AXE, { ...REST_POSE, view: 'side', facing: 1 }, 'idle', rig, spriteOf, palette);
    const left = attachTool(AXE, { ...REST_POSE, view: 'side', facing: -1 }, 'idle', rig, spriteOf, palette);
    expect(front.behind).toBe(false);
    expect(back.behind).toBe(true);
    expect(right.behind).toBe(false);
    expect(left.behind).toBe(false);
    expect(right.orientation).toBe('lowered');
    expect(left.orientation).toBe('lowered');
    expect(front.orientation).toBe('rest');
    expect(right.mirrored).toBe(false);
    expect(left.mirrored).toBe(true);
    expect(Math.sign(left.dx)).toBe(-Math.sign(right.dx));
    // Not one fixed screen position: the four views place the axe differently.
    const places = new Set([front, back, left, right].map((a) => `${a.dx},${a.dy},${a.orientation},${a.mirrored},${a.behind}`));
    expect(places.size).toBe(4);
    // The strike orientation follows the view.
    expect(attachTool(AXE, { ...REST_POSE, view: 'front' }, 'strike', rig, spriteOf, palette).orientation).toBe('strike-down');
    const backStrike = attachTool(AXE, { ...REST_POSE, view: 'back' }, 'strike', rig, spriteOf, palette);
    expect(backStrike.orientation).toBe('strike-up');
    expect(backStrike.behind).toBe(false);
    expect(attachTool(AXE, { ...REST_POSE, view: 'side', facing: 1 }, 'strike', rig, spriteOf, palette).orientation).toBe('strike');
    expect(attachTool(AXE, { ...REST_POSE, view: 'side', facing: 1 }, 'raise', rig, spriteOf, palette).orientation).toBe('raised');
    expect(attachTool(AXE, { ...REST_POSE, view: 'side', facing: 1 }, 'recover', rig, spriteOf, palette).orientation).toBe('lowered');
  });

  it('follows the walk: the grip moves with the kit arm swing, by small steps, never jumping', () => {
    for (const v of views) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let w = 0; w < 6; w++) {
        const at = attachTool(AXE, { ...REST_POSE, ...v, walk: w as BlobbiPose['walk'] }, 'idle', rig, spriteOf, palette);
        xs.push(at.dx);
        ys.push(at.dy);
      }
      for (let i = 1; i < 6; i++) {
        expect(Math.abs(xs[i] - xs[i - 1])).toBeLessThanOrEqual(3);
        expect(Math.abs(ys[i] - ys[i - 1])).toBeLessThanOrEqual(3);
      }
      expect(new Set(xs.map((x, i) => `${x},${ys[i]}`)).size).toBeGreaterThan(1); // it does move with the arm
    }
  });

  it('is the same attachment for the same pose: deterministic and cached', () => {
    const a = attachTool(AXE, { ...REST_POSE, view: 'side', facing: 1, walk: 3 }, 'idle', rig, spriteOf, palette);
    const b = attachTool(AXE, { ...REST_POSE, view: 'side', facing: 1, walk: 3 }, 'idle', new EquipmentRig(identity, size), spriteOf, palette);
    expect([a.dx, a.dy, a.behind, a.orientation, a.mirrored]).toEqual([b.dx, b.dy, b.behind, b.orientation, b.mirrored]);
    expect(a.sprite.buffer.data).toEqual(b.sprite.buffer.data);
  });
});

/** Connected clusters of steel pixels in a frame: one axe head = one cluster. */
function steelClusters(f: PixelBuffer): { count: number; minX: number; maxX: number } {
  const isSteel = (c: number) => c === STEEL.mid || c === STEEL.light || c === STEEL.dark;
  const seen = new Uint8Array(f.width * f.height);
  let count = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] || !isSteel(f.data[i])) continue;
    count++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % f.width;
      const y = Math.floor(k / f.width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= f.width || ny >= f.height) continue;
        const j = ny * f.width + nx;
        if (!seen[j] && isSteel(f.data[j])) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
  }
  return { count, minX, maxX };
}

describe('one axe, one hand (regression: the side views showed the tool across both arms)', () => {
  it('draws exactly one axe head in every direction, standing, walking and chopping, on the near side of the body in the side views', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    live.inventory.add(AXE, 1);
    live.equip(AXE);
    const renderer = new LiveRenderer(live);
    const check = (label: string, facing: -1 | 1 | 0) => {
      const f = frameAt(live, renderer);
      const clusters = steelClusters(f);
      expect(clusters.count, label).toBe(1);
      if (facing !== 0) {
        // The head stays on the facing side of the body's centre line (never over at the far arm).
        const cx = Math.round(live.blobbi.x) - Math.round(live.blobbi.x - 48); // the camera centres the Blobbi at x = 48 in a 96 px frame
        if (facing > 0) expect(clusters.minX, label).toBeGreaterThanOrEqual(cx - 2);
        else expect(clusters.maxX, label).toBeLessThanOrEqual(cx + 2);
      }
    };
    for (const [dir, facing] of [['left', -1], ['right', 1], ['up', 0], ['down', 0]] as const) {
      // Standing (after the turn settles), then every walking frame.
      run(live, 1, { [dir]: true });
      run(live, 8);
      check(`${dir} standing`, facing);
      for (let i = 0; i < 12; i++) {
        live.update(1 / 60, { ...IDLE_INPUT, [dir]: true });
        check(`${dir} walking step ${i}`, facing);
      }
      run(live, 8);
    }
    // Chopping from the left side of a tree (facing right) and from below (facing up): one axe through the swing.
    for (const dir of ['right', 'up'] as const) {
      faceTree(live, dir);
      run(live, 1, { interact: true });
      for (let i = 0; i < Math.ceil(SWING.end * 60) + 2; i++) {
        live.update(1 / 60, IDLE_INPUT);
        check(`${dir} swing step ${i}`, dir === 'right' ? 1 : 0);
      }
    }
    // And the attachment itself never spans the body: in the side views every axe pixel is within the tool's
    // own sprite width of the near hand, and the sprite is narrower than the Blobbi.
    for (const facing of [-1, 1] as const) {
      const at = attachTool(AXE, { ...REST_POSE, view: 'side', facing }, 'idle', live.rig, (p) => live.blobbiSprite(p), palette);
      expect(at.sprite.buffer.width).toBeLessThanOrEqual(9);
      expect(Math.sign(at.dx) || facing).toBe(facing);
    }
  });
});

describe('equipment in play', () => {
  it('shows the axe in the frame only while equipped; unequipping removes it from the character, not the bag', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    const renderer = new LiveRenderer(live);
    run(live, 5);
    const bare = steelPixels(frameAt(live, renderer));
    expect(bare).toBe(0);
    live.inventory.add(AXE, 1);
    expect(steelPixels(frameAt(live, renderer))).toBe(0); // in the bag, not in hand
    expect(live.equip(AXE)).toBe(true);
    const held = steelPixels(frameAt(live, renderer));
    expect(held).toBeGreaterThanOrEqual(4);
    // Every direction shows it.
    for (const dir of ['up', 'left', 'right', 'down'] as const) {
      run(live, 2, { [dir]: true });
      expect(steelPixels(frameAt(live, renderer))).toBeGreaterThanOrEqual(3);
    }
    live.unequip();
    expect(steelPixels(frameAt(live, renderer))).toBe(0);
    expect(live.inventory.count(AXE)).toBe(1);
    // Frames are deterministic.
    live.equip(AXE);
    const t = live.clock.time;
    expect(frameAt(live, renderer, t).data).toEqual(frameAt(live, renderer, t).data);
  });

  it('swings on E: raise, strike with the hit landing, recover; a press during the swing is ignored; wood only on the last landed hit', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    const index = faceTree(live, 'right');
    live.inventory.add(AXE, 1);
    live.equip(AXE);
    expect(live.equipmentAnimation(live.clock.time)).toBe('idle');
    run(live, 1, { interact: true });
    const t0 = live.swing!.start;
    expect(live.blobbi.animator.hop(t0 + 0.05)).toBe(0); // a swing, not a jump
    expect(live.equipmentAnimation(t0 + 0.02)).toBe('raise');
    expect(live.equipmentAnimation(t0 + SWING.raise + 0.02)).toBe('strike');
    expect(live.equipmentAnimation(t0 + SWING.hit + 0.1)).toBe('recover');
    expect(live.equipmentAnimation(t0 + SWING.end + 0.01)).toBe('idle');
    // Before the hit lands: no hit, no shake, no chips.
    run(live, Math.floor(SWING.hit * 60) - 2);
    expect(live.trees.get(index)).toBeUndefined();
    expect(live.impulses.has(index)).toBe(false);
    const particlesBefore = live.particles.particles.length;
    // A second press now is ignored.
    run(live, 1, { interact: true });
    expect(live.swing!.start).toBe(t0);
    run(live, 3);
    expect(live.trees.get(index)).toEqual({ hits: 1, harvestedAt: null });
    expect(live.impulses.has(index)).toBe(true);
    expect(live.particles.particles.length).toBeGreaterThan(particlesBefore); // chips at the impact
    expect(live.stats.chops).toBe(1);
    run(live, 15);
    expect(live.swing).toBeNull();
    expect(live.equipmentAnimation(live.clock.time)).toBe('idle');
    // The swing frames differ from each other and from rest (the axe really moves).
    const renderer = new LiveRenderer(live);
    run(live, 1, { interact: true });
    const t1 = live.swing!.start;
    const raise = frameAt(live, renderer, t1 + 0.02);
    const strike = frameAt(live, renderer, t1 + SWING.raise + 0.03);
    const rest = frameAt(live, renderer, t1 + SWING.end + 0.1);
    expect(raise.data).not.toEqual(strike.data);
    expect(strike.data).not.toEqual(rest.data);
    run(live, 25);
    expect(live.trees.get(index)!.hits).toBe(2);
    expect(live.inventory.count(ITEMS.wood.id)).toBe(0);
    run(live, 1, { interact: true });
    run(live, Math.floor(SWING.hit * 60) - 1);
    expect(live.inventory.count(ITEMS.wood.id)).toBe(0); // not before the final hit lands
    run(live, 4);
    expect(live.inventory.count(ITEMS.wood.id)).toBeGreaterThan(0);
    expect(live.treeAt(index).phase).toBe('stump');
  });

  it('keeps the rest of the game as it was: walking, autonomy, resources and the ordinary interaction', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-1'), 'blobbi-9', 16);
    live.inventory.add(AXE, 1);
    live.equip(AXE);
    run(live, 60 * 6);
    expect(live.brain.state).not.toBe('manual');
    let off = 0;
    for (let i = 0; i < 60 * 30; i++) {
      live.update(1 / 60, IDLE_INPUT);
      if (!live.collision.canStand(live.blobbi.x, live.blobbi.y, live.blobbi.footRx, live.blobbi.footRy)) off++;
    }
    expect(off).toBe(0);
    expect(live.swing).toBeNull();
    expect(live.stats.chops).toBe(0);
    expect(live.trees.size).toBe(0);
    expect(live.equipped).toBe(AXE);
  });
});
