import type { State } from './types';

/**
 * Undo is the list of states played so far. Undo drops the last one; it
 * never computes an inverse move. Each state carries its own move count, so
 * undo also restores the count.
 */
export interface History {
  readonly states: readonly State[];
}

export function createHistory(initial: State): History {
  return { states: [initial] };
}

export function current(history: History): State {
  return history.states[history.states.length - 1]!;
}

/** Record the result of a move. A null (rejected) move leaves history as is. */
export function commit(history: History, next: State | null): History {
  if (next === null) return history;
  return { states: [...history.states, next] };
}

export function canUndo(history: History): boolean {
  return history.states.length > 1;
}

export function undo(history: History): History {
  if (!canUndo(history)) return history;
  return { states: history.states.slice(0, -1) };
}

export function restart(history: History): History {
  return createHistory(history.states[0]!);
}
