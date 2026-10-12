/**
 * THE ISLAND MAP (N, or MAP on the menu bar): the whole island drawn small from its terrain, with the Blobbi, its
 * home and buildings, the farm, the places it has visited, the finds it has made, and where the current story goal
 * is when that goal is a place. Nothing hidden is shown: unfound discoveries and unvisited places stay off the map.
 *
 * Click the map (or pick a place and press Enter) and the Blobbi walks there. Every marker has its own shape, with
 * a legend, so the map never relies on colour alone.
 */
import { PixelBuffer } from '../../core/pixel';
import { hex, type Color } from '../../core/color';
import { T, type WorldDescription } from '../../world/types';
import { currentObjective } from '../../game/objectives';
import { cellCentre } from '../../game/farming';
import { Gfx, UI } from '../gfx';
import { isConfirm, moveSelection, type GameUI, type Screen } from '../game-ui';

/** World ↔ map pixels for a map area (the island fitted and centred). Pure, so it is tested on its own. */
export function mapTransform(worldW: number, worldH: number, areaW: number, areaH: number) {
  const scale = Math.min(areaW / worldW, areaH / worldH);
  const ox = Math.floor((areaW - worldW * scale) / 2);
  const oy = Math.floor((areaH - worldH * scale) / 2);
  return {
    scale,
    ox,
    oy,
    toMap: (x: number, y: number) => ({ x: Math.round(ox + x * scale), y: Math.round(oy + y * scale) }),
    toWorld: (mx: number, my: number) => ({ x: (mx - ox) / scale, y: (my - oy) / scale }),
  };
}

const TERRAIN: Partial<Record<number, string>> = {
  [T.DEEP]: '#22406c',
  [T.WATER]: '#2f5d96',
  [T.SHALLOW]: '#4f8cc6',
  [T.FOAM]: '#8fc3e6',
  [T.SAND_WET]: '#cdb377',
  [T.SAND]: '#e3cf93',
  [T.GRASS_EDGE]: '#5fae42',
  [T.GRASS]: '#6fbf4a',
  [T.GRASS_PATCH]: '#7fcf58',
  [T.GRASS_DARK]: '#4f9a3a',
  [T.PATH]: '#c9a46a',
  [T.CLIFF_FACE]: '#8a6a44',
  [T.RIM]: '#9a7a52',
  [T.SKIN]: '#6f9a5a',
  [T.POND]: '#4f8cc6',
  [T.MEADOW]: '#8fd860',
  [T.MOSS]: '#3f7a3a',
  [T.GRAVEL]: '#b8a88a',
  [T.CLOVER]: '#6fb88a',
};

/** The island drawn small: terrain by class (majority-free nearest sampling), trees as dark dots. */
export function mapImage(world: WorldDescription, w: number, h: number): PixelBuffer {
  const { width, height, cls } = world.terrain;
  const m = mapTransform(width, height, w, h);
  const out = new PixelBuffer(w, h);
  const colours = new Map<number, Color>();
  const colour = (c: number) => colours.get(c) ?? colours.set(c, hex(TERRAIN[c] ?? '#22406c')).get(c)!;
  out.fill(colour(T.DEEP));
  // A creature's body is its own colour (a manta is dark slate, a whale blue-grey, not a turtle's green).
  if (world.creature) colours.set(T.SKIN, hex(world.creature.species === 'whale' ? '#56677d' : '#3a4458'));
  for (let my = 0; my < h; my++)
    for (let mx = 0; mx < w; mx++) {
      const p = m.toWorld(mx + 0.5, my + 0.5);
      const x = Math.floor(p.x);
      const y = Math.floor(p.y);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      out.set(mx, my, colour(cls[y * width + x]));
    }
  const tree = hex('#2f6e2c');
  for (const o of world.objects) if (o.kind === 'tree') {
    const q = m.toMap(o.x, o.y);
    out.set(q.x, q.y, tree);
    out.set(q.x, q.y - 1, tree);
  }
  return out;
}

export type MarkerKind = 'you' | 'home' | 'building' | 'farm' | 'place' | 'find' | 'goal';

export interface Marker {
  kind: MarkerKind;
  x: number;
  y: number;
  label?: string;
}

/** What the map shows: only what the player has made, visited or found, plus the goal when it is a known place. */
export function mapMarkers(ui: GameUI): Marker[] {
  const live = ui.live!;
  const out: Marker[] = [];
  for (const b of live.buildings) out.push({ kind: b.kind === 'shelter' ? 'home' : 'building', x: b.x, y: b.y, label: b.kind === 'shelter' ? 'HOME' : undefined });
  for (const p of live.plots) {
    const c = cellCentre(p, live.origin);
    out.push({ kind: 'farm', x: c.x, y: c.y });
  }
  for (const p of live.places) if (live.visited.has(p.id)) out.push({ kind: 'place', x: p.x, y: p.y, label: p.name.replace(/^The /, '').toUpperCase() });
  for (const d of live.discoveries) if (live.found.has(d.id)) out.push({ kind: 'find', x: d.x, y: d.y });
  // The story goal, when it is about a known place (listening to the Carrier); never a secret.
  const goal = currentObjective(live.objectives);
  if (goal && 'tally' in goal.goal && goal.goal.tally === 'talked' && live.listenSpot) out.push({ kind: 'goal', x: live.listenSpot.x, y: live.listenSpot.y, label: 'GOAL' });
  // The Blobbi last, on top (indoors: at its home's door).
  const home = live.interior ? live.buildings.find((b) => b.id === live.interior!.state.shelterId) : null;
  out.push({ kind: 'you', x: home ? home.x : live.blobbi.x, y: home ? home.y + 6 : live.blobbi.y });
  return out;
}

const INK = hex('#1b1f2a');

/** A marker's shape (each kind its own, so colour is never the only cue). */
export function drawMarker(b: PixelBuffer, kind: MarkerKind, x: number, y: number): void {
  const px = (dx: number, dy: number, c: Color) => b.set(x + dx, y + dy, c);
  const ring = (r: number, c: Color) => {
    for (let a = 0; a < 16; a++) px(Math.round(Math.cos((a / 16) * Math.PI * 2) * r), Math.round(Math.sin((a / 16) * Math.PI * 2) * r), c);
  };
  switch (kind) {
    case 'you':
      ring(3, INK);
      ring(2, UI.accent);
      px(0, 0, UI.accent);
      break;
    case 'home':
      // A little house: roof and walls.
      for (let i = -2; i <= 2; i++) px(i, -1 - (2 - Math.abs(i)), hex('#ff8a7a'));
      b.fillRect(x - 2, y - 1, 5, 3, hex('#f4efe4'));
      px(0, 1, INK);
      break;
    case 'building':
      b.strokeRect(x - 1, y - 1, 3, 3, INK);
      px(0, 0, hex('#f4efe4'));
      break;
    case 'farm':
      b.fillRect(x - 1, y - 1, 2, 2, hex('#7a4f2a'));
      break;
    case 'place':
      // A diamond.
      for (const [dx, dy] of [[0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2]]) px(dx, dy, INK);
      for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) px(dx, dy, hex('#7ee0b8'));
      break;
    case 'find':
      // A star.
      for (const [dx, dy] of [[0, -2], [0, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [0, 1], [-1, 2], [1, 2]]) px(dx, dy, hex('#ffe07a'));
      break;
    case 'goal':
      // An exclamation mark in a box.
      b.fillRect(x - 2, y - 3, 5, 7, INK);
      b.fillRect(x, y - 2, 1, 3, UI.accent);
      px(0, 2, UI.accent);
      break;
  }
}

const LEGEND: [MarkerKind, string][] = [
  ['you', 'BLOBBI'],
  ['home', 'HOME'],
  ['building', 'BUILT'],
  ['farm', 'FARM'],
  ['place', 'PLACE'],
  ['find', 'FIND'],
  ['goal', 'GOAL'],
];

export class MapScreen implements Screen {
  readonly id = 'map' as const;
  index = 0;
  private cache: { identity: string; w: number; h: number; img: PixelBuffer } | null = null;

  title(ui: GameUI): string {
    const live = ui.live!;
    return `Map  ${live.visited.size}/${live.places.length} places  ${live.found.size} finds`;
  }

  opened(): void {
    this.index = 0;
  }

  private visitedPlaces(ui: GameUI) {
    const live = ui.live!;
    return live.places.filter((p) => live.visited.has(p.id));
  }

  private image(ui: GameUI, w: number, h: number): PixelBuffer {
    const live = ui.live!;
    if (!this.cache || this.cache.identity !== live.identity || this.cache.w !== w || this.cache.h !== h) this.cache = { identity: live.identity, w, h, img: mapImage(live.world, w, h) };
    return this.cache.img;
  }

  /** Walk to a world point and close the map (indoors, step outside first by the door: the map is the island's). */
  private go(ui: GameUI, x: number, y: number): void {
    const live = ui.live!;
    if (live.interior) {
      ui.say('step outside first: the map is of the island', false);
      return;
    }
    live.walkTo(x, y) ? ui.close() : ui.say('cannot walk there', false);
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    const list = this.visitedPlaces(ui);
    const moved = moveSelection(code, this.index, list.length, 1);
    if (moved !== null) {
      this.index = moved;
      return true;
    }
    if (isConfirm(code) && list[this.index]) {
      this.go(ui, list[this.index].x, list[this.index].y);
      return true;
    }
    return false;
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const live = ui.live!;
    const mw = 196;
    const mh = h - 2;
    const img = this.image(ui, mw, mh).clone();
    const m = mapTransform(live.world.terrain.width, live.world.terrain.height, mw, mh);
    for (const mk of mapMarkers(ui)) {
      const p = m.toMap(mk.x, mk.y);
      drawMarker(img, mk.kind, p.x, p.y);
    }
    g.buf.blit(img, x, y + 1);
    g.buf.strokeRect(x - 1, y, mw + 2, mh + 2, UI.line);
    // Labels beside their markers: right, else left; a label that would overlap another (or leave the map) is left
    // out (every place is also listed on the right). The goal's label goes first.
    const taken: { x: number; y: number; w: number }[] = [];
    const labelled = mapMarkers(ui).filter((mk) => mk.label && mk.kind !== 'home').sort((a, b) => (a.kind === 'goal' ? -1 : 0) - (b.kind === 'goal' ? -1 : 0));
    for (const mk of labelled) {
      const p = m.toMap(mk.x, mk.y);
      const lw = mk.label!.length * 4 + 1;
      const ly = y + 1 + p.y - 2;
      const free = (lx: number) => lx >= x && lx + lw <= x + mw && !taken.some((t) => Math.abs(t.y - ly) < 7 && lx < t.x + t.w && t.x < lx + lw);
      const lx = [x + p.x + 4, x + p.x - 4 - lw].find(free);
      if (lx === undefined) continue;
      taken.push({ x: lx, y: ly, w: lw });
      // A dark backing keeps the label readable on any terrain.
      g.buf.fillRect(lx - 1, ly - 1, lw + 1, 7, UI.bg);
      g.text(mk.label!, lx, ly, mk.kind === 'goal' ? UI.accent : UI.ink);
    }
    g.hit(x, y + 1, mw, mh, (px, py) => {
      const wp = m.toWorld(px - x, py - y - 1);
      this.go(ui, wp.x, wp.y);
    });
    // Right: the legend and the visited places.
    const rx = x + mw + 6;
    let cy = y + 2;
    g.text('LEGEND', rx, cy, UI.accent);
    cy += 8;
    const legend = new PixelBuffer(9, 9);
    for (const [kind, label] of LEGEND) {
      legend.fill(UI.panel);
      drawMarker(legend, kind, 4, 4);
      g.buf.blit(legend, rx, cy - 2);
      g.text(label, rx + 11, cy, UI.ink);
      cy += 9;
    }
    cy += 3;
    g.text('PLACES', rx, cy, UI.accent);
    cy += 8;
    const list = this.visitedPlaces(ui);
    this.index = Math.max(0, Math.min(this.index, list.length - 1));
    if (!list.length) g.para('None yet. Walk around the island.', rx, cy, x + w - rx, UI.muted, 3);
    list.forEach((p, i) => {
      const label = p.name.replace(/^The /, '').toUpperCase().slice(0, 18);
      g.box(rx - 1, cy - 1, x + w - rx + 1, 8, i === this.index ? UI.slotHi : UI.panel, i === this.index ? UI.accent : null);
      g.text(label, rx + 1, cy, UI.ink);
      g.hit(rx - 1, cy - 1, x + w - rx + 1, 8, () => (this.index === i ? this.go(ui, p.x, p.y) : (this.index = i)), 'walk there');
      cy += 9;
    });
    g.para('Click the map or a place: Blobbi walks there.', rx, y + h - 13, x + w - rx, UI.muted, 2);
  }
}
