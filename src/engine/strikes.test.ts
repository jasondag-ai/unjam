import { describe, expect, it } from 'vitest';
import { current, isSolved, isStuck, MAX_STRIKES, restartAttempt, startAttempt, tap, undoAttempt, type State } from './index';

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

describe('deadlock', () => {
  // C (amber, leaves up) and D (violet, leaves down) sit in each other's lane.
  const stuck: State = {
    rows: 5,
    cols: 5,
    rails: { top: 'amber', right: 'cyan', bottom: 'violet', left: 'mint' },
    blocks: [
      { id: 'C', colour: 'amber', anchor: { row: 3, col: 2 }, shape: [{ row: 0, col: 0 }, { row: 1, col: 0 }] },
      { id: 'D', colour: 'violet', anchor: { row: 1, col: 2 }, shape: [{ row: 0, col: 0 }, { row: 1, col: 0 }] },
    ],
  };

  it('is stuck when pieces remain and none can leave', () => {
    expect(isStuck(stuck)).toBe(true);
    expect(isStuck(start)).toBe(false);
    expect(isStuck({ ...start, blocks: [] })).toBe(false); // cleared is not stuck
  });

  it('a tap on a stuck board costs no strike', () => {
    const a = startAttempt(stuck);
    const r = tap(a, 'C');
    expect(r.kind).toBe('stuck');
    expect(r.attempt).toBe(a);
    expect(tap(tap(r.attempt, 'D').attempt, 'C').attempt.strikes).toBe(0);
  });

  it('restart from a stuck board brings back the start with no strikes', () => {
    const a = restartAttempt(startAttempt(stuck));
    expect(current(a.history)).toBe(stuck);
    expect(a.strikes).toBe(0);
  });
});
