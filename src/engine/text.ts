import { cellsOf } from './board';
import type { Colour, Side, State } from './types';

const LETTER: Readonly<Record<Colour, string>> = { cyan: 'c', amber: 'a', violet: 'v', mint: 'm' };

/**
 * Plain-text picture of a board. Blocks show their id; gates show their
 * colour letter on the frame (c, a, v, m). Walls are - and |.
 */
export function boardToText(state: State): string {
  const grid: string[][] = Array.from({ length: state.size }, () => Array<string>(state.size).fill('.'));
  for (const block of state.blocks) {
    for (const cell of cellsOf(block)) grid[cell.row]![cell.col] = block.id;
  }
  const gate = (side: Side, index: number, wall: string) => {
    const g = state.gates.find((x) => x.side === side && x.index === index);
    return g ? LETTER[g.colour] : wall;
  };
  const span = Array.from({ length: state.size }, (_, i) => i);
  const lines = [`+${span.map((i) => '-' + gate('top', i, '-')).join('')}-+`];
  for (const row of span) {
    lines.push(`${gate('left', row, '|')}${grid[row]!.map((ch) => ' ' + ch).join('')} ${gate('right', row, '|')}`);
  }
  lines.push(`+${span.map((i) => '-' + gate('bottom', i, '-')).join('')}-+`);
  return lines.join('\n');
}
