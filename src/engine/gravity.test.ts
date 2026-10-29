import { describe, expect, it } from 'vitest';
import { applyExit, canExit, isSettled, isStuck, settle, startAttempt, tap, type Block, type Colour, type State } from './index';

// Job 022 (spike): gravity. After every exit, pieces settle toward one rail until none can move.
const rails = { top: 'amber', right: 'cyan', bottom: 'violet', left: 'mint' } as const;
const one = (id: string, colour: Colour, row: number, col: number): Block => ({ id, colour, anchor: { row, col }, shape: [{ row: 0, col: 0 }] });

// 3 wide, 4 tall, pulling down. W (mint) rests on U (violet); X (sky blue) sits on the floor.
//   . . .
//   . . .
//   . W .
//   X U .
const trap: State = { rows: 4, cols: 3, rails, gravity: 'bottom', blocks: [one('W', 'mint', 2, 1), one('X', 'cyan', 3, 0), one('U', 'violet', 3, 1)] };

describe('gravity (job 022)', () => {
  it('drops a piece toward the gravity rail until it lands', () => {
    const floating: State = { rows: 5, cols: 2, rails, gravity: 'bottom', blocks: [one('A', 'amber', 0, 0), one('B', 'mint', 4, 0)] };
    expect(isSettled(floating)).toBe(false);
    expect(settle(floating).blocks.find((b) => b.id === 'A')!.anchor).toEqual({ row: 3, col: 0 });
    expect(isSettled(trap)).toBe(true);
  });

  it('pulls toward any rail, and does nothing without gravity', () => {
    const left: State = { rows: 2, cols: 5, rails, gravity: 'left', blocks: [one('A', 'amber', 0, 3)] };
    expect(settle(left).blocks[0]!.anchor).toEqual({ row: 0, col: 0 });
    const none: State = { ...left, gravity: undefined };
    expect(settle(none)).toBe(none);
  });

  it('brings a whole stack down together after an exit', () => {
    // A bar of two lying on a single, a single on the bar; the bottom single leaves.
    const bar: Block = { id: 'B', colour: 'amber', anchor: { row: 2, col: 0 }, shape: [{ row: 0, col: 0 }, { row: 0, col: 1 }] };
    const s: State = { rows: 4, cols: 2, rails, gravity: 'bottom', blocks: [one('T', 'amber', 1, 1), bar, one('F', 'violet', 3, 0)] };
    const after = applyExit(s, 'F')!;
    expect(after.blocks.map((b) => [b.id, b.anchor.row])).toEqual([['T', 2], ['B', 3]]);
  });

  it('clears in the right order: W, then U, then X', () => {
    let s = trap;
    for (const id of ['W', 'U', 'X']) s = applyExit(s, id)!;
    expect(s.blocks).toEqual([]);
  });

  it('can be stranded by taps alone: U first lets W fall into X\'s lane, and X into W\'s', () => {
    expect(canExit(trap, 'U')).toBe('bottom');
    const after = applyExit(trap, 'U')!;
    expect(after.blocks.find((b) => b.id === 'W')!.anchor).toEqual({ row: 3, col: 1 });
    expect(isStuck(after)).toBe(true);
    // The stuck state costs no strike: a tap there reports it.
    const stranded = tap(startAttempt(trap), 'U').attempt;
    expect(tap(stranded, 'X').kind).toBe('stuck');
  });
});
