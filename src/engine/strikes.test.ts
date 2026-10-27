import { describe, expect, it } from 'vitest';
import { current, isSolved, MAX_STRIKES, restartAttempt, startAttempt, tap, undoAttempt, type State } from './index';

// A (cyan, leaves right) is blocked by B; B (violet, leaves down) is free.
const start: State = {
  rows: 5,
  cols: 5,
  rails: { top: 'amber', right: 'cyan', bottom: 'violet', left: 'mint' },
  blocks: [
    { id: 'A', colour: 'cyan', anchor: { row: 0, col: 0 }, shape: [{ row: 0, col: 0 }, { row: 0, col: 1 }] },
    { id: 'B', colour: 'violet', anchor: { row: 0, col: 3 }, shape: [{ row: 0, col: 0 }, { row: 1, col: 0 }] },
  ],
};

describe('three strikes', () => {
  it('a correct tap is free and uncounted', () => {
    const r = tap(startAttempt(start), 'B');
    expect(r.kind).toBe('exit');
    expect(r.attempt.strikes).toBe(0);
    expect(current(r.attempt.history).blocks.map((b) => b.id)).toEqual(['A']);
  });

  it('a tap on a piece whose lane is not clear costs a strike and changes nothing else', () => {
    const a = startAttempt(start);
    const r = tap(a, 'A');
    expect(r.kind).toBe('strike');
    expect(r.attempt.strikes).toBe(1);
    expect(r.attempt.history).toBe(a.history);
  });

  it('the third strike restarts the level with no strikes', () => {
    let a = tap(startAttempt(start), 'A').attempt; // strike 1
    a = tap(a, 'B').attempt; // progress
    a = undoAttempt(a); // undo gives B back but keeps the strike
    expect(a.strikes).toBe(1);
    a = tap(a, 'A').attempt; // strike 2
    const r = tap(a, 'A');
    expect(MAX_STRIKES).toBe(3);
    expect(r.kind).toBe('out');
    expect(r.attempt.strikes).toBe(0);
    expect(current(r.attempt.history)).toBe(start);
  });

  it('restart clears the board and the strikes', () => {
    let a = tap(startAttempt(start), 'A').attempt; // strike
    a = tap(a, 'B').attempt;
    a = restartAttempt(a);
    expect(a.strikes).toBe(0);
    expect(current(a.history)).toBe(start);
  });

  it('a tap on a piece already gone does nothing', () => {
    const a = tap(startAttempt(start), 'B').attempt;
    expect(tap(a, 'B')).toEqual({ kind: 'none', attempt: a });
  });

  it('clears by correct taps alone with no strikes', () => {
    let a = startAttempt(start);
    a = tap(a, 'B').attempt;
    a = tap(a, 'A').attempt;
    expect(isSolved(current(a.history))).toBe(true);
    expect(a.strikes).toBe(0);
  });
});
