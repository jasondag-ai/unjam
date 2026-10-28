import { describe, expect, it } from 'vitest';
import type { State } from '../engine';
import { blockers, clumping, colourSpread, dependency, railDistance, threads } from './measures';

const rails = { top: 'amber', right: 'cyan', bottom: 'violet', left: 'mint' } as const;
const bar = (id: string, colour: 'amber' | 'cyan' | 'violet' | 'mint', row: number, col: number) => ({
  id, colour, anchor: { row, col }, shape: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
});

describe('railDistance', () => {
  it('counts rows or columns between a piece and each edge', () => {
    const cells = [{ row: 2, col: 1 }, { row: 2, col: 2 }];
    expect(railDistance(cells, 'top', 7, 6)).toBe(2);
    expect(railDistance(cells, 'bottom', 7, 6)).toBe(4);
    expect(railDistance(cells, 'left', 7, 6)).toBe(1);
    expect(railDistance(cells, 'right', 7, 6)).toBe(3);
  });
});

describe('dependency', () => {
  // A stack in column 0-1: C (amber, top) under B under A. C waits for B and A; B waits for A.
  const s: State = { rows: 5, cols: 4, rails, blocks: [bar('A', 'amber', 0, 0), bar('B', 'amber', 1, 0), bar('C', 'amber', 2, 0), bar('D', 'cyan', 4, 0)] };

  it('finds what stands in each lane', () => {
    const b = blockers(s);
    expect([...b.get('C')!].sort()).toEqual(['A', 'B']);
    expect([...b.get('A')!]).toEqual([]);
  });

  it('reports the most buried piece and the longest chain', () => {
    expect(dependency(s)).toEqual({ buried: 2, buriedPiece: 'C', chain: 2 });
  });

  it('refuses a board whose pieces block each other in a loop', () => {
    const loop: State = { rows: 3, cols: 4, rails, blocks: [bar('A', 'cyan', 1, 0), bar('B', 'mint', 1, 2)] };
    expect(() => dependency(loop)).toThrow(/loop/);
  });
});

describe('colourSpread', () => {
  it('is small for a colour sitting at its own rail, and 1 when position says nothing', () => {
    // Amber pieces on the top row, violet pieces on the bottom row: each hugs its own rail.
    const hugging: State = {
      rows: 6, cols: 4, rails,
      blocks: [bar('A', 'amber', 0, 0), bar('B', 'amber', 0, 2), bar('C', 'violet', 5, 0), bar('D', 'violet', 5, 2)],
    };
    const amber = colourSpread(hugging).find((c) => c.colour === 'amber')!;
    expect(amber.own).toBe(0);
    expect(amber.ratio).toBe(0);
    // Swap colours across rows: amber now sits as far from the top as anything on the board.
    const swapped: State = { ...hugging, blocks: hugging.blocks.map((b) => ({ ...b, colour: b.colour === 'amber' ? 'violet' : 'amber' })) };
    expect(colourSpread(swapped).find((c) => c.colour === 'amber')!.ratio).toBe(2);
  });
});

describe('clumping', () => {
  it('compares touching same-colour pairs with a random deal', () => {
    // Two amber side by side, two violet side by side, the rows touching.
    const s: State = { rows: 4, cols: 4, rails, blocks: [bar('A', 'amber', 0, 0), bar('B', 'amber', 0, 2), bar('C', 'violet', 1, 0), bar('D', 'violet', 1, 2)] };
    const c = clumping(s);
    expect(c.share).toBe(2 / 4); // A-B and C-D of the four touching pairs
    expect(c.random).toBeCloseTo(4 / 12);
  });
});

describe('threads', () => {
  // T (amber, leaves up) at row 2 of column 1, with an empty channel above it walled by two upright
  // dominoes; H below it waits for T.
  const upright = (id: string, colour: 'cyan' | 'mint', row: number, col: number) => ({
    id, colour, anchor: { row, col }, shape: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
  });
  const T = { id: 'T', colour: 'amber' as const, anchor: { row: 2, col: 1 }, shape: [{ row: 0, col: 0 }] };
  const H = { id: 'H', colour: 'amber' as const, anchor: { row: 3, col: 1 }, shape: [{ row: 0, col: 0 }] };
  const s: State = { rows: 5, cols: 3, rails, blocks: [upright('L', 'mint', 0, 0), upright('R', 'cyan', 0, 2), T, H] };

  it('finds a small piece whose lane is a walled one-cell channel and that holds another', () => {
    expect(threads(s)).toEqual([{ id: 'T', channel: 2, open: true, holds: ['H'] }]);
  });

  it('sees a channel closed at its outer end by a piece', () => {
    const tall: State = { rows: 6, cols: 3, rails, blocks: [
      { id: 'C', colour: 'mint', anchor: { row: 0, col: 1 }, shape: [{ row: 0, col: 0 }] },
      upright('L', 'mint', 1, 0), upright('R', 'cyan', 1, 2),
      { ...T, anchor: { row: 3, col: 1 } }, { ...H, anchor: { row: 4, col: 1 } },
    ] };
    expect(threads(tall)).toEqual([{ id: 'T', channel: 2, open: false, holds: ['H'] }]);
  });

  it('needs both walls, and something behind it', () => {
    expect(threads({ ...s, blocks: s.blocks.filter((b) => b.id !== 'R') })).toEqual([]);
    expect(threads({ ...s, blocks: s.blocks.filter((b) => b.id !== 'H') })).toEqual([]);
  });
});
