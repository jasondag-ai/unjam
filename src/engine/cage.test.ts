import { describe, expect, it } from 'vitest';
import { applyExit, canExit, legalSlides, type Block, type Colour, type State } from './index';

// Job 019: a U is concave. Its notch is not its own, so a piece sitting in the
// notch blocks the U's way toward its opening, and the U's prongs and base
// hold that piece in on three sides.
const rails = { top: 'amber', right: 'cyan', bottom: 'violet', left: 'mint' } as const;

// U5 opening up, rows 2 and 3, columns 1 to 3. Its notch is (2, 2).
const u = (colour: Colour): Block => ({
  id: 'U',
  colour,
  anchor: { row: 2, col: 1 },
  shape: [{ row: 0, col: 0 }, { row: 0, col: 2 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
});
const caged = (colour: Colour): Block => ({ id: 'C', colour, anchor: { row: 2, col: 2 }, shape: [{ row: 0, col: 0 }] });
const board = (...blocks: Block[]): State => ({ rows: 5, cols: 5, rails, blocks });

describe('a piece caged in a U', () => {
  it('stops the U leaving toward its opening: the swept cells include the notch', () => {
    expect(canExit(board(u('amber'), caged('amber')), 'U')).toBeNull();
    expect(canExit(board(u('amber')), 'U')).toBe('top');
  });

  it('frees the U once it has gone out through the opening', () => {
    const s = board(u('amber'), caged('amber'));
    expect(canExit(s, 'C')).toBe('top');
    const after = applyExit(s, 'C')!;
    expect(canExit(after, 'U')).toBe('top');
    expect(applyExit(after, 'U')!.blocks).toEqual([]);
  });

  it('can leave only through the opening: prongs hold it sideways, the base holds it below', () => {
    expect(canExit(board(u('amber'), caged('cyan')), 'C')).toBeNull();
    expect(canExit(board(u('amber'), caged('mint')), 'C')).toBeNull();
    expect(canExit(board(u('amber'), caged('violet')), 'C')).toBeNull();
  });

  it('does not stop the U leaving away from its opening', () => {
    expect(canExit(board(u('violet'), caged('amber')), 'U')).toBe('bottom');
  });

  it('holds the U still on three sides', () => {
    expect(legalSlides(board(u('amber'), caged('amber')), 'U')).toEqual({ up: 0, right: 0, down: 1, left: 0 });
  });

  it('works for a deep U holding a domino that sticks out of the opening', () => {
    // U7 opening up, rows 1 to 3, columns 1 to 3; notch (1, 2) and (2, 2).
    const deep: Block = {
      id: 'U',
      colour: 'amber',
      anchor: { row: 1, col: 1 },
      shape: [
        { row: 0, col: 0 }, { row: 0, col: 2 }, { row: 1, col: 0 }, { row: 1, col: 2 },
        { row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 },
      ],
    };
    const domino: Block = { id: 'D', colour: 'amber', anchor: { row: 1, col: 2 }, shape: [{ row: 0, col: 0 }, { row: 1, col: 0 }] };
    const s = board(deep, domino);
    expect(canExit(s, 'U')).toBeNull();
    expect(canExit(s, 'D')).toBe('top');
    expect(canExit({ ...s, blocks: [deep, { ...domino, colour: 'cyan' }] }, 'D')).toBeNull();
    expect(canExit(applyExit(s, 'D')!, 'U')).toBe('top');
  });
});
