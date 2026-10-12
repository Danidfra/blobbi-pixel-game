/**
 * FORAGE CONTENT: wild things the island grows by itself, picked up with E like sticks and stones, and grown back
 * over world time. Each kind names where it grows; `game/resources.ts` places the nodes deterministically.
 */
import type { ItemDefinition } from '../game/items';

export interface ForageContent {
  kind: 'fibre' | 'mushroom' | 'berry' | 'herb' | 'shell' | 'driftwood';
  item: ItemDefinition;
  /**
   * Not placed when the world is generated (M10 phase B): the live world puts these nodes down itself, when
   * they are needed (driftwood: only while the island is short of standing trees). Its item is registered elsewhere.
   */
  dynamic?: boolean;
  /** Where nodes appear (see `generateResources`). */
  near: 'grass-tuft' | 'tree-shade' | 'bush' | 'meadow' | 'beach';
  respawnSeconds: number;
  /** Ground sprites (letters as in icons). */
  sprites: readonly (readonly string[])[];
  colours: Readonly<Record<string, string>>;
}

export const FORAGE_CONTENT: readonly ForageContent[] = [
  {
    kind: 'fibre',
    near: 'grass-tuft',
    respawnSeconds: 120,
    item: { id: 'blobbi-pixel:resource:fibre', label: 'wild fibre', plural: 'wild fibre', category: 'resource', stack: 40, description: 'Long tough grass. Woven into cloth at a workbench.', icon: { rows: ['f.F.f', 'f.F.f', '.fFf.', '.fFf.', '..f..', '.fff.'], colours: { f: '#9ac64a', F: '#c8e07a' } } },
    sprites: [['f.F', 'fFf', '.f.'], ['F.f.F', '.fFf.', '..f..']],
    colours: { f: '#9ac64a', F: '#c8e07a' },
  },
  {
    kind: 'mushroom',
    near: 'tree-shade',
    respawnSeconds: 240,
    item: { id: 'blobbi-pixel:food:mushroom', label: 'mushroom', plural: 'mushrooms', category: 'food', stack: 30, description: 'A brown cap from the shade of the trees. Lovely in soup.', food: { restores: 8 }, icon: { rows: ['.ccc.', 'cCccc', 'ccccc', '..s..', '..s..', '.sss.'], colours: { c: '#a8643a', C: '#e0a070', s: '#f3e3c3' } } },
    sprites: [['.cc.', 'cCcc', '.ss.'], ['cc..', 'Cc.c', 's.cC', '..s.']],
    colours: { c: '#a8643a', C: '#e0a070', s: '#f3e3c3' },
  },
  {
    kind: 'berry',
    near: 'bush',
    respawnSeconds: 200,
    item: { id: 'blobbi-pixel:food:wild-berry', label: 'wild berry', plural: 'wild berries', category: 'food', stack: 40, description: 'Little dark berries from the bushes. Sweet and a bit tart.', food: { restores: 6, joy: 3 }, icon: { rows: ['..g..', '.bgb.', 'bBbBb', 'bbbbb', '.bBb.', '..b..'], colours: { b: '#5a3a9a', B: '#9a7ad8', g: '#4fbf3a' } } },
    sprites: [['.g.', 'bBb', 'bbb'], ['b.b', 'BbB', '.b.']],
    colours: { b: '#5a3a9a', B: '#9a7ad8', g: '#4fbf3a' },
  },
  {
    kind: 'herb',
    near: 'meadow',
    respawnSeconds: 180,
    item: { id: 'blobbi-pixel:resource:herb', label: 'wild herb', plural: 'wild herbs', category: 'resource', stack: 30, description: 'Fragrant leaves from the meadow. Cooks love them.', icon: { rows: ['h.H.h', '.hHh.', 'H.h.H', '.hhh.', '..s..', '..s..'], colours: { h: '#3f9a4a', H: '#8fe06a', s: '#6a8a3a' } } },
    sprites: [['h.H', '.h.', 'HhH'], ['.H.h', 'h.H.', '.hh.']],
    colours: { h: '#3f9a4a', H: '#8fe06a', s: '#6a8a3a' },
  },
  {
    kind: 'shell',
    near: 'beach',
    respawnSeconds: 240,
    item: { id: 'blobbi-pixel:resource:shell', label: 'sea shell', plural: 'sea shells', category: 'resource', stack: 30, description: 'A pale spiral shell from the shore of the shell. Crafty things need these.', icon: { rows: ['..sS.', '.sSps', 'sSpps', 'sppps', '.sss.'], colours: { s: '#f4d8c8', S: '#ffffff', p: '#e8a0a0' } } },
    sprites: [['.sS', 'sps', '.s.'], ['sS.', 'pps', '.ss']],
    colours: { s: '#f4d8c8', S: '#ffffff', p: '#e8a0a0' },
  },
  {
    // Driftwood (M10 phase B): wood washed up on the shore, the fallback that keeps wood within reach when building
    // has left the island with few trees (`MIN_STANDING_TREES`, src/game/clearing.ts).
    kind: 'driftwood',
    near: 'beach',
    respawnSeconds: 240,
    dynamic: true,
    item: { id: 'blobbi-pixel:material:wood', label: 'wood', plural: 'wood', category: 'material', stack: 40, description: 'Sturdy logs.' },
    sprites: [['.......', '..lLLl.', '.lLccLl', 'llLLlll', '.......'], ['.......', '.lLLl..', 'lLccLLl', '.lllLLl', '.......']],
    colours: { l: '#8a7a68', L: '#b8a890', c: '#d8ccb4' },
  },
];
