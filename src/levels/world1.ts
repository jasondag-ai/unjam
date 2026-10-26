import type { Block, Colour } from '../engine';
import type { World } from './types';

const h = (id: string, colour: Colour, row: number, col: number, len: number): Block => ({
  id, colour, anchor: { row, col }, axis: 'h',
  shape: Array.from({ length: len }, (_, i) => ({ row: 0, col: i })),
});
const v = (id: string, colour: Colour, row: number, col: number, len: number): Block => ({
  id, colour, anchor: { row, col }, axis: 'v',
  shape: Array.from({ length: len }, (_, i) => ({ row: i, col: 0 })),
});

// Level 1, hand-authored, cleared by taps alone. Only B can leave at the start.
//   +-v-a---a-m-+
//   | A A . B . c
//   | C . D B . |
//   c C E D F F |
//   | G E . . H |
//   c G . I I H c
//   +-----m-----+
export const world1: World = {
  id: 'world1',
  palette: {
    ground: '#060B14',
    grid: 'rgba(140, 170, 210, 0.07)',
    frame: 'rgba(140, 170, 210, 0.22)',
    blocks: { cyan: '#4CD6E6', amber: '#F2A93B', violet: '#7D6CF5', mint: '#5BE8A8' },
  },
  glyphs: { cyan: 'square', amber: 'triangle', violet: 'circle', mint: 'diamond' },
  levels: [
    {
      id: '1-1',
      start: {
        size: 5,
        moves: 0,
        blocks: [
          h('A', 'cyan', 0, 0, 2),
          v('B', 'amber', 0, 3, 2),
          v('C', 'violet', 1, 0, 2),
          v('D', 'mint', 1, 2, 2),
          v('E', 'amber', 2, 1, 2),
          h('F', 'cyan', 2, 3, 2),
          v('G', 'violet', 3, 0, 2),
          v('H', 'mint', 3, 4, 2),
          h('I', 'cyan', 4, 2, 2),
        ],
        gates: [
          { side: 'top', index: 0, colour: 'violet' },
          { side: 'top', index: 1, colour: 'amber' },
          { side: 'top', index: 3, colour: 'amber' },
          { side: 'top', index: 4, colour: 'mint' },
          { side: 'right', index: 0, colour: 'cyan' },
          { side: 'right', index: 4, colour: 'cyan' },
          { side: 'bottom', index: 2, colour: 'mint' },
          { side: 'left', index: 2, colour: 'cyan' },
          { side: 'left', index: 4, colour: 'cyan' },
        ],
      },
    },
  ],
};
