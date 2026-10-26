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
  type Gate,
  type State,
} from './index';

// Helpers: straight bars and single cells, anchored at their first cell.
const hBar = (id: string, colour: Block['colour'], row: number, col: number, len: number): Block => ({
  id, colour, anchor: { row, col }, axis: 'h',
  shape: Array.from({ length: len }, (_, i) => ({ row: 0, col: i })),
});
const vBar = (id: string, colour: Block['colour'], row: number, col: number, len: number): Block => ({
  id, colour, anchor: { row, col }, axis: 'v',
  shape: Array.from({ length: len }, (_, i) => ({ row: i, col: 0 })),
});
const dot = (id: string, colour: Block['colour'], row: number, col: number): Block => ({
  id, colour, anchor: { row, col }, axis: 'free', shape: [{ row: 0, col: 0 }],
});
const board = (blocks: Block[], gates: Gate[]): State => {
  const s = deepFreeze({ size: 5, blocks, gates, moves: 0 });
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
  it('measures a horizontal block to the walls on an empty row', () => {
    const s = board([hBar('A', 'cyan', 2, 1, 2)], []);
    expect(legalSlides(s, 'A')).toEqual({ up: 0, right: 2, down: 0, left: 1 });
  });

  it('measures a vertical block to the walls', () => {
    const s = board([vBar('A', 'cyan', 0, 3, 3)], []);
    expect(legalSlides(s, 'A')).toEqual({ up: 0, right: 0, down: 2, left: 0 });
  });

  it('stops at the neighbouring block', () => {
    const s = board([hBar('A', 'cyan', 0, 0, 2), vBar('B', 'amber', 0, 4, 2)], []);
    expect(legalSlides(s, 'A').right).toBe(2);
    const t = board([hBar('A', 'cyan', 0, 0, 2), vBar('B', 'amber', 0, 2, 2)], []);
    expect(legalSlides(t, 'A').right).toBe(0);
  });

  it('lets a single-cell block move along both axes', () => {
    const s = board([dot('A', 'mint', 2, 2), dot('B', 'cyan', 0, 2)], []);
    expect(legalSlides(s, 'A')).toEqual({ up: 1, right: 2, down: 2, left: 2 });
  });

  it('returns zeros for an unknown block', () => {
    const s = board([], []);
    expect(legalSlides(s, 'Z')).toEqual({ up: 0, right: 0, down: 0, left: 0 });
  });
});

describe('canExit', () => {
  const gate: Gate = { side: 'right', index: 1, colour: 'cyan' };

  it('returns the gate when the lane is clear and colour and row match', () => {
    const s = board([hBar('A', 'cyan', 1, 0, 2)], [gate]);
    expect(canExit(s, 'A')).toEqual(gate);
  });

  it('is null when one cell of the lane is blocked', () => {
    const s = board([hBar('A', 'cyan', 1, 0, 2), dot('B', 'mint', 1, 4)], [gate]);
    expect(canExit(s, 'A')).toBeNull();
  });

  it('is null when the gate colour is wrong', () => {
    const s = board([hBar('A', 'cyan', 1, 0, 2)], [{ ...gate, colour: 'amber' }]);
    expect(canExit(s, 'A')).toBeNull();
  });

  it('is null when the gate is misaligned by one row', () => {
    const above = board([hBar('A', 'cyan', 1, 0, 2)], [{ ...gate, index: 0 }]);
    const below = board([hBar('A', 'cyan', 1, 0, 2)], [{ ...gate, index: 2 }]);
    expect(canExit(above, 'A')).toBeNull();
    expect(canExit(below, 'A')).toBeNull();
  });

  it('only exits along the block axis', () => {
    // Vertical block next to a matching side gate cannot leave sideways.
    const s = board([vBar('A', 'cyan', 0, 4, 2)], [{ side: 'right', index: 0, colour: 'cyan' }]);
    expect(canExit(s, 'A')).toBeNull();
  });

  it('exits a vertical block through the top or bottom', () => {
    const top: Gate = { side: 'top', index: 3, colour: 'violet' };
    const s = board([vBar('A', 'violet', 2, 3, 2)], [top]);
    expect(canExit(s, 'A')).toEqual(top);
  });

  it('exits a single-cell block in any direction', () => {
    const left: Gate = { side: 'left', index: 4, colour: 'mint' };
    const s = board([dot('A', 'mint', 4, 3)], [left]);
    expect(canExit(s, 'A')).toEqual(left);
  });

  it('ignores a matching gate on the far side when the near lane is blocked', () => {
    const s = board(
      [hBar('A', 'cyan', 1, 1, 2), dot('B', 'mint', 1, 4)],
      [gate, { side: 'left', index: 1, colour: 'cyan' }],
    );
    expect(canExit(s, 'A')).toEqual({ side: 'left', index: 1, colour: 'cyan' });
  });

  it('needs a gate for every row a thick block occupies', () => {
    const thick: Block = {
      id: 'A', colour: 'amber', anchor: { row: 1, col: 0 }, axis: 'h',
      shape: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
    };
    const one = board([thick], [{ side: 'right', index: 1, colour: 'amber' }]);
    expect(canExit(one, 'A')).toBeNull();
    const both = board([thick], [
      { side: 'right', index: 2, colour: 'amber' },
      { side: 'right', index: 1, colour: 'amber' },
    ]);
    expect(canExit(both, 'A')).toEqual({ side: 'right', index: 1, colour: 'amber' });
  });
});

describe('applySlide and applyExit', () => {
  const start = () =>
    board(
      [hBar('A', 'cyan', 0, 0, 2), vBar('B', 'amber', 0, 3, 2)],
      [{ side: 'right', index: 0, colour: 'cyan' }],
    );

  it('slides a block and returns a new state without touching the old one', () => {
    const s = start();
    const next = applySlide(s, 'B', 'down', 1);
    expect(next).not.toBeNull();
    expect(next).not.toBe(s);
    expect(next!.blocks.find((b) => b.id === 'B')!.anchor).toEqual({ row: 1, col: 3 });
    expect(s.blocks.find((b) => b.id === 'B')!.anchor).toEqual({ row: 0, col: 3 });
  });

  it('rejects slides that are too far, off axis, or zero', () => {
    const s = start();
    expect(applySlide(s, 'B', 'down', 4)).toBeNull();
    expect(applySlide(s, 'B', 'left', 1)).toBeNull();
    expect(applySlide(s, 'B', 'down', 0)).toBeNull();
    expect(applySlide(s, 'Z', 'down', 1)).toBeNull();
  });

  it('opens a lane by sliding, then exits', () => {
    const s = start();
    expect(applyExit(s, 'A')).toBeNull();
    const opened = applySlide(s, 'B', 'down', 1)!;
    const exited = applyExit(opened, 'A')!;
    expect(exited.blocks.map((b) => b.id)).toEqual(['B']);
    expect(opened.blocks).toHaveLength(2);
  });
});

describe('move count', () => {
  it('counts slides and exits but not rejected taps', () => {
    const s = board(
      [hBar('A', 'cyan', 0, 0, 2), vBar('B', 'amber', 0, 3, 2)],
      [{ side: 'right', index: 0, colour: 'cyan' }],
    );
    let h = createHistory(s);
    h = commit(h, applyExit(current(h), 'A')); // rejected: lane blocked
    expect(current(h).moves).toBe(0);
    h = commit(h, applySlide(current(h), 'B', 'down', 1));
    expect(current(h).moves).toBe(1);
    h = commit(h, applyExit(current(h), 'A'));
    expect(current(h).moves).toBe(2);
    h = commit(h, applyExit(current(h), 'B')); // rejected: no amber gate
    expect(current(h).moves).toBe(2);
    expect(h.states).toHaveLength(3);
  });
});

describe('history', () => {
  const s = board([dot('A', 'mint', 0, 0)], [{ side: 'top', index: 0, colour: 'mint' }]);

  it('undo returns the exact earlier state object', () => {
    const h0 = createHistory(s);
    const h1 = commit(h0, applySlide(s, 'A', 'right', 2));
    const h2 = commit(h1, applySlide(current(h1), 'A', 'down', 1));
    const back = undo(h2);
    expect(current(back)).toBe(current(h1));
    expect(current(undo(back))).toBe(s);
    expect(current(h2).moves).toBe(2);
    expect(current(back).moves).toBe(1);
  });

  it('cannot undo past the start', () => {
    const h = createHistory(s);
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h);
  });

  it('restart goes back to the first state', () => {
    let h = createHistory(s);
    h = commit(h, applySlide(s, 'A', 'right', 1));
    h = commit(h, applySlide(current(h), 'A', 'right', 1));
    expect(current(restart(h))).toBe(s);
    expect(canUndo(restart(h))).toBe(false);
  });
});

describe('isSolved', () => {
  it('is false while blocks remain and true when none do', () => {
    const s = board([dot('A', 'mint', 0, 0)], [{ side: 'top', index: 0, colour: 'mint' }]);
    expect(isSolved(s)).toBe(false);
    expect(isSolved(applyExit(s, 'A')!)).toBe(true);
  });
});

describe('validateState', () => {
  it('rejects overlapping, off-board and badly typed blocks', () => {
    const v = (blocks: Block[], gates: Gate[] = []) => () => validateState({ size: 5, blocks, gates, moves: 0 });
    expect(v([hBar('A', 'cyan', 0, 0, 2), dot('B', 'mint', 0, 1)])).toThrow(/overlap/);
    expect(v([hBar('A', 'cyan', 0, 4, 2)])).toThrow(/off the board/);
    expect(v([{ ...dot('A', 'mint', 0, 0), axis: 'h' }])).toThrow(/free/);
    expect(v([{ ...hBar('A', 'cyan', 0, 0, 2), axis: 'free' }])).toThrow(/axis/);
    expect(v([], [{ side: 'top', index: 5, colour: 'cyan' }])).toThrow(/off the board/);
  });
});
