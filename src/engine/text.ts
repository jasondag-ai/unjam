import { cellsOf } from './board';
import type { Colour, State } from './types';

const LETTER: Readonly<Record<Colour, string>> = { cyan: 'c', amber: 'a', violet: 'v', mint: 'm' };

/**
 * Plain-text picture of a board. Blocks show their id; each side of the
 * frame shows its rail's colour letter (c, a, v, m).
 */
export function boardToText(state: State): string {
  const grid: string[][] = Array.from({ length: state.rows }, () => Array<string>(state.cols).fill('.'));
  for (const block of state.blocks) {
    for (const cell of cellsOf(block)) grid[cell.row]![cell.col] = block.id;
  }
  const { top, right, bottom, left } = state.rails;
  const edge = (c: Colour) => `+${` ${LETTER[c]}`.repeat(state.cols)} +`;
  return [
    edge(top),
    ...grid.map((row) => `${LETTER[left]}${row.map((ch) => ' ' + ch).join('')} ${LETTER[right]}`),
    edge(bottom),
  ].join('\n');
}
