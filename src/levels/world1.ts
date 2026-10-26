import type { Block, Colour, Rails } from '../engine';
import type { World } from './types';
import { generatedLevels } from './world1.generated';

/** A piece drawn as rows of '#' and '.', anchored at its top-left. */
const p = (id: string, colour: Colour, row: number, col: number, rows: string[]): Block => ({
  id,
  colour,
  anchor: { row, col },
  shape: rows.flatMap((line, r) => [...line].flatMap((ch, c) => (ch === '#' ? [{ row: r, col: c }] : []))),
});

const rails: Rails = { top: 'amber', right: 'cyan', bottom: 'violet', left: 'mint' };

// Level 10 is the job 003 board, kept as Jason asked. 8 pieces, 27 of 36
// cells: an S, a T, two L's, a J, a square, a bar of three and one domino.
// Built in reverse (rule 6). Two pieces can leave at the start.
//   + a a a a a a +
//   m . A A . . . c
//   m . B A C C D c
//   m B B C C E D c
//   m F F F . E D c
//   m . F G G E E c
//   m H H G G . . c
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
  // Levels 1 to 9 come from the board search (tools/make-levels.ts).
  levels: [
    ...generatedLevels,
    {
      id: '10',
      start: {
        size: 6,
        moves: 0,
        rails,
        blocks: [
          p('A', 'amber', 0, 1, ['##', '.#']),
          p('B', 'violet', 1, 0, ['.#', '##']),
          p('C', 'mint', 1, 2, ['.##', '##.']),
          p('D', 'mint', 1, 5, ['#', '#', '#']),
          p('E', 'mint', 2, 4, ['#.', '#.', '##']),
          p('F', 'violet', 3, 0, ['###', '.#.']),
          p('G', 'violet', 4, 2, ['##', '##']),
          p('H', 'cyan', 5, 0, ['##']),
        ],
      },
    },
  ],
};
