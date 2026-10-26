import type { Block, Colour, Rails } from '../engine';
import type { World } from './types';

/** A piece drawn as rows of '#' and '.', anchored at its top-left. */
const p = (id: string, colour: Colour, row: number, col: number, rows: string[]): Block => ({
  id,
  colour,
  anchor: { row, col },
  shape: rows.flatMap((line, r) => [...line].flatMap((ch, c) => (ch === '#' ? [{ row: r, col: c }] : []))),
});

const rails: Rails = { top: 'amber', right: 'cyan', bottom: 'violet', left: 'mint' };

// Level 1: 6x6, 12 pieces, 27 of 36 cells. Built in reverse (rule 6): each
// piece was placed so it can leave past the pieces placed before it, and
// where it blocked the most of them. Two pieces can leave at the start.
//   + a a a a a a +
//   m . A A B C C c
//   m . D D B E . c
//   m . F F E E . c
//   m . . . E G H c
//   m I . J K G H c
//   m I J J K L L c
//   + v v v v v v +
export const world1: World = {
  id: 'world1',
  palette: {
    ground: '#060B14',
    grid: 'rgba(140, 170, 210, 0.07)',
    frame: 'rgba(140, 170, 210, 0.22)',
    blocks: { cyan: '#4CD6E6', amber: '#F2A93B', violet: '#7D6CF5', mint: '#5BE8A8' },
  },
  glyphs: { cyan: 'square', amber: 'triangle', violet: 'circle', mint: 'diamond' },
  rails,
  levels: [
    {
      id: '1',
      start: {
        size: 6,
        moves: 0,
        rails,
        blocks: [
          p('A', 'violet', 0, 1, ['##']),
          p('B', 'mint', 0, 3, ['#', '#']),
          p('C', 'amber', 0, 4, ['##']),
          p('D', 'violet', 1, 1, ['##']),
          p('E', 'violet', 1, 3, ['.#', '##', '#.']),
          p('F', 'cyan', 2, 1, ['##']),
          p('G', 'cyan', 3, 4, ['#', '#']),
          p('H', 'violet', 3, 5, ['#', '#']),
          p('I', 'amber', 4, 0, ['#', '#']),
          p('J', 'mint', 4, 1, ['.#', '##']),
          p('K', 'mint', 4, 3, ['#', '#']),
          p('L', 'mint', 5, 4, ['##']),
        ],
      },
    },
  ],
};
