import type { Block, Colour } from '../engine';
import type { Level } from './types';

/** A piece drawn as rows of '#' and '.', anchored at its top-left. */
const p = (id: string, colour: Colour, row: number, col: number, rows: string[]): Block => ({
  id,
  colour,
  anchor: { row, col },
  shape: rows.flatMap((line, r) => [...line].flatMap((ch, c) => (ch === '#' ? [{ row: r, col: c }] : []))),
});

/**
 * Boards kept for the late band, not in any level list.
 *
 * job-003: 6x6, 8 pieces, 27 of 36 cells: an S, a T, two L's, a J, a
 * square, a bar of three and one domino. Built in reverse (rule 6). Two
 * pieces can leave at the start. Late boards are 8x8, so it needs
 * rebuilding at that size before use.
 *   + a a a a a a +
 *   m . A A . . . c
 *   m . B A C C D c
 *   m B B C C E D c
 *   m F F F . E D c
 *   m . F G G E E c
 *   m H H G G . . c
 *   + v v v v v v +
 */
export const lateCandidates: readonly Level[] = [
  {
    id: 'job-003',
    start: {
      size: 6,
      moves: 0,
      rails: { top: 'amber', right: 'cyan', bottom: 'violet', left: 'mint' },
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
];
