import { describe, expect, it } from 'vitest';
import {
  applyExit,
  applySlide,
  canExit,
  canUndo,
  commit,
  createHistory,
  current,
  isSolved,
  legalSlides,
  restart,
  undo,
  validateState,
  type Block,
  type Colour,
  type Rails,
  type State,
} from './index';

const RAILS: Rails = { top: 'amber', right: 'cyan', bottom: 'violet', left: 'mint' };

/** A piece drawn as rows of '#' and '.', anchored at its top-left. */
const piece = (id: string, colour: Colour, row: number, col: number, rows: string[]): Block => ({
  id,
  colour,
  anchor: { row, col },
  shape: rows.flatMap((line, r) => [...line].flatMap((ch, c) => (ch === '#' ? [{ row: r, col: c }] : []))),
});
const board = (blocks: Block[], rows = 5, cols = rows): State => {
  const s = deepFreeze({ rows, cols, blocks, rails: RAILS });
  validateState(s);
  return s;
};
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('legalSlides', () => {
  it('measures to the frame in all four directions', () => {
    const s = board([piece('A', 'cyan', 2, 1, ['##'])]);
    expect(legalSlides(s, 'A')).toEqual({ up: 2, right: 2, down: 2, left: 1 });
  });

  it('stops where any cell of the shape meets a neighbour', () => {
    // L at rows 0-1; its foot at (1,1) meets B at (1,3) after one step right.
    const s = board([piece('A', 'cyan', 0, 0, ['#.', '##']), piece('B', 'mint', 1, 3, ['#', '#'])]);
    expect(legalSlides(s, 'A').right).toBe(1);
  });

  it('lets an interlocked piece fit past a neighbour its shape clears', () => {
    // T pointing down sits over a gap in B, so it can slide down one.
    const s = board([
      piece('A', 'amber', 0, 0, ['###', '.#.']),
      piece('B', 'mint', 2, 0, ['#.#', '###']),
    ]);
    expect(legalSlides(s, 'A').down).toBe(1);
  });

  it('measures to the frame on a portrait board, taller than wide', () => {
    const s = board([piece('A', 'cyan', 0, 0, ['##'])], 7, 4);
    expect(legalSlides(s, 'A')).toEqual({ up: 0, right: 2, down: 6, left: 0 });
  });

  it('returns zeros for an unknown block', () => {
    expect(legalSlides(board([]), 'Z')).toEqual({ up: 0, right: 0, down: 0, left: 0 });
  });
});

describe('canExit', () => {
  it('leaves by the side its colour names when the lane is clear', () => {
    expect(canExit(board([piece('A', 'amber', 3, 1, ['##'])]), 'A')).toBe('top');
    expect(canExit(board([piece('A', 'cyan', 3, 1, ['##'])]), 'A')).toBe('right');
    expect(canExit(board([piece('A', 'violet', 0, 1, ['##'])]), 'A')).toBe('bottom');
    expect(canExit(board([piece('A', 'mint', 3, 3, ['##'])]), 'A')).toBe('left');
  });

  it('is null when one cell of the lane is blocked', () => {
    const s = board([piece('A', 'amber', 3, 1, ['##']), piece('B', 'cyan', 0, 2, ['##'])]);
    expect(canExit(s, 'A')).toBeNull();
  });

  it('never leaves by a side of the wrong colour, even when that side is open', () => {
    // Cyan piece on the top row with nothing above: top is amber, so it must go right.
    const open = board([piece('A', 'cyan', 0, 0, ['##'])]);
    expect(canExit(open, 'A')).toBe('right');
    const blocked = board([piece('A', 'cyan', 0, 0, ['##']), piece('B', 'mint', 0, 4, ['#', '#'])]);
    expect(canExit(blocked, 'A')).toBeNull();
  });

  it('checks every cell the shape passes through, not just one lane', () => {
    // Amber L: its stem column is clear to the top, its foot column is not.
    const s = board([piece('A', 'amber', 2, 0, ['#.', '##']), piece('B', 'mint', 0, 1, ['##'])]);
    expect(canExit(s, 'A')).toBeNull();
    expect(canExit(board([piece('A', 'amber', 2, 0, ['#.', '##'])]), 'A')).toBe('top');
  });

  it('passes through its own cells', () => {
    const s = board([piece('A', 'amber', 1, 2, ['#', '#', '#'])]);
    expect(canExit(s, 'A')).toBe('top');
  });

  it('is null for an unknown block', () => {
    expect(canExit(board([]), 'Z')).toBeNull();
  });
});

describe('applySlide and applyExit', () => {
  const start = () => board([piece('A', 'cyan', 0, 0, ['##']), piece('B', 'violet', 0, 3, ['#', '#'])]);

  it('slides one cell and returns a new state without touching the old one', () => {
    const s = start();
    const next = applySlide(s, 'B', 'down');
    expect(next).not.toBeNull();
    expect(next).not.toBe(s);
    expect(next!.blocks.find((b) => b.id === 'B')!.anchor).toEqual({ row: 1, col: 3 });
    expect(s.blocks.find((b) => b.id === 'B')!.anchor).toEqual({ row: 0, col: 3 });
  });

  it('slides in any direction its shape fits, and no other', () => {
    const s = start();
    expect(applySlide(s, 'B', 'right')).not.toBeNull();
    expect(applySlide(s, 'B', 'up')).toBeNull(); // frame
    expect(applySlide(s, 'A', 'right')).not.toBeNull();
    expect(applySlide(s, 'A', 'left')).toBeNull(); // frame
    expect(applySlide(s, 'Z', 'down')).toBeNull();
  });

  it('opens a lane by sliding, then exits', () => {
    const s = start();
    expect(applyExit(s, 'A')).toBeNull();
    const opened = applySlide(s, 'B', 'down')!;
    const exited = applyExit(opened, 'A')!;
    expect(exited.blocks.map((b) => b.id)).toEqual(['B']);
    expect(opened.blocks).toHaveLength(2);
  });
});

describe('history', () => {
  it('records slides and exits but not rejected moves', () => {
    const s = board([piece('A', 'cyan', 0, 0, ['##']), piece('B', 'amber', 0, 3, ['#', '#']), piece('C', 'violet', 4, 3, ['##'])]);
    let h = createHistory(s);
    h = commit(h, applyExit(current(h), 'A')); // rejected: B in the lane
    expect(h.states).toHaveLength(1);
    h = commit(h, applySlide(current(h), 'B', 'down'));
    h = commit(h, applyExit(current(h), 'A'));
    h = commit(h, applySlide(current(h), 'C', 'down')); // rejected: frame
    expect(h.states).toHaveLength(3);
  });
});

describe('history', () => {
  const s = board([piece('A', 'mint', 0, 0, ['##'])]);

  it('undo returns the exact earlier state object', () => {
    const h0 = createHistory(s);
    const h1 = commit(h0, applySlide(s, 'A', 'right'));
    const h2 = commit(h1, applySlide(current(h1), 'A', 'down'));
    const back = undo(h2);
    expect(current(back)).toBe(current(h1));
    expect(current(undo(back))).toBe(s);
  });

  it('cannot undo past the start', () => {
    const h = createHistory(s);
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h);
  });

  it('restart goes back to the first state', () => {
    let h = createHistory(s);
    h = commit(h, applySlide(s, 'A', 'right'));
    h = commit(h, applySlide(current(h), 'A', 'right'));
    expect(current(restart(h))).toBe(s);
    expect(canUndo(restart(h))).toBe(false);
  });
});

describe('isSolved', () => {
  it('is false while blocks remain and true when none do', () => {
    const s = board([piece('A', 'mint', 0, 0, ['##'])]);
    expect(isSolved(s)).toBe(false);
    expect(isSolved(applyExit(s, 'A')!)).toBe(true);
  });
});

describe('validateState', () => {
  const v = (blocks: Block[], rails: Rails = RAILS) => () => validateState({ rows: 5, cols: 5, blocks, rails });

  it('accepts single cells and pieces up to 7 cells', () => {
    expect(() => board([piece('A', 'cyan', 0, 0, ['#']), piece('B', 'mint', 2, 2, ['####', '#...', '#...'])], 6)).not.toThrow();
  });

  it('accepts pieces of 2 to 6 cells on a 6x6 board', () => {
    expect(() => board([piece('A', 'cyan', 0, 0, ['###', '###'])], 6)).not.toThrow();
  });

  it('rejects bad pieces and bad rails', () => {
    expect(v([{ ...piece('A', 'cyan', 0, 0, ['#']), shape: [] }])).toThrow(/1 to 7/);
    expect(v([piece('A', 'cyan', 0, 0, ['####', '####'])])).toThrow(/1 to 7/);
    expect(v([piece('A', 'cyan', 0, 0, ['#.#'])])).toThrow(/connected/);
    expect(v([piece('A', 'cyan', 0, 0, ['##']), piece('B', 'mint', 0, 1, ['##'])])).toThrow(/overlap/);
    expect(v([piece('A', 'cyan', 0, 4, ['##'])])).toThrow(/off the board/);
    expect(v([], { ...RAILS, left: 'cyan' })).toThrow(/rail/);
  });
});
