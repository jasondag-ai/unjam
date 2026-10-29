import { describe, expect, it } from 'vitest';
import { applyExit, canExit, isStuck, partsOf, startAttempt, tap, validateState, type Block, type State } from './index';

// Job 021: split pieces. One piece, two colours; each colour's cells leave as
// one part through that colour's rail, the other part counting as solid.
const rails = { top: 'amber', right: 'cyan', bottom: 'violet', left: 'mint' } as const;

// An upright bar of three in column 2, rows 2 to 4: top cell sky blue (leaves right),
// lower two amber (leave up). The amber part's lane runs through the sky blue cell.
const bar: Block = {
  id: 'S',
  colour: 'amber',
  colours: ['cyan', 'amber', 'amber'],
  anchor: { row: 2, col: 2 },
  shape: [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }],
};
const board = (...blocks: Block[]): State => ({ rows: 6, cols: 5, rails, blocks });

describe('split pieces (job 021)', () => {
  it('splits into one part per colour, each keeping the anchor', () => {
    expect(partsOf(bar).map((p) => [p.colour, p.shape.length])).toEqual([['cyan', 1], ['amber', 2]]);
    expect(() => validateState(board(bar))).not.toThrow();
  });

  it('blocks a part with its own other part: the amber part cannot go first', () => {
    // Only the sky blue part is free, so a tap sends it right.
    expect(canExit(board(bar), 'S')).toBe('right');
    // With the sky blue lane closed, nothing on the piece can go.
    const wall: Block = { id: 'W', colour: 'violet', anchor: { row: 2, col: 4 }, shape: [{ row: 0, col: 0 }] };
    expect(canExit(board(bar, wall), 'S')).toBeNull();
  });

  it('leaves the remainder where it was, an ordinary piece of the remaining colour', () => {
    const after = applyExit(board(bar), 'S')!;
    expect(after.blocks).toEqual([
      { id: 'S', colour: 'amber', anchor: { row: 2, col: 2 }, shape: [{ row: 1, col: 0 }, { row: 2, col: 0 }] },
    ]);
    // The rest now needs a different wall, and its lane is clear.
    expect(canExit(after, 'S')).toBe('top');
    expect(applyExit(after, 'S')!.blocks).toEqual([]);
  });

  it('lets a part go when the other part is not in its lane', () => {
    // A lying bar: left cell mint (leaves left), right two cells violet (leave down).
    // Neither part is in the other's lane, so the first part in order goes.
    const lying: Block = {
      id: 'L', colour: 'violet', colours: ['mint', 'violet', 'violet'],
      anchor: { row: 1, col: 1 }, shape: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }],
    };
    expect(canExit(board(lying), 'L')).toBe('left');
    // Block the mint lane and the violet part goes instead.
    const wall: Block = { id: 'W', colour: 'amber', anchor: { row: 1, col: 0 }, shape: [{ row: 0, col: 0 }] };
    expect(canExit(board(lying, wall), 'L')).toBe('bottom');
    const after = applyExit(board(lying, wall), 'L')!;
    expect(after.blocks.find((b) => b.id === 'L')).toEqual({ id: 'L', colour: 'mint', anchor: { row: 1, col: 1 }, shape: [{ row: 0, col: 0 }] });
  });

  it('is a strike when neither part can go', () => {
    const wall: Block = { id: 'W', colour: 'violet', anchor: { row: 2, col: 4 }, shape: [{ row: 0, col: 0 }] };
    const s = board(bar, wall);
    const result = tap(startAttempt(s), 'S');
    expect(result.kind).toBe('strike');
    expect(result.attempt.strikes).toBe(1);
  });

  it('a tap sends out only the free part, and reports that part', () => {
    const result = tap(startAttempt(board(bar)), 'S');
    expect(result.kind).toBe('exit');
    if (result.kind !== 'exit') return;
    expect(result.side).toBe('right');
    expect(result.block.shape).toEqual([{ row: 0, col: 0 }]);
    expect(result.block.colour).toBe('cyan');
  });

  it('counts a piece whose parts block each other as stuck', () => {
    // Top cell violet (down) over amber (up): each part stands in the other's lane.
    const locked: Block = { id: 'X', colour: 'amber', colours: ['violet', 'amber'], anchor: { row: 2, col: 2 }, shape: [{ row: 0, col: 0 }, { row: 1, col: 0 }] };
    expect(isStuck(board(locked))).toBe(true);
  });

  it('refuses a split piece with a part in two pieces, or one colour', () => {
    const torn: Block = { ...bar, colours: ['amber', 'cyan', 'amber'] };
    expect(() => validateState(board(torn))).toThrow(/not connected/);
    expect(() => validateState(board({ ...bar, colours: ['amber', 'amber', 'amber'] }))).toThrow(/one colour/);
  });
});
