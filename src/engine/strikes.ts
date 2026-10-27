import { applyExit, canExit, isStuck } from './moves';
import { canUndo, commit, createHistory, current, restart, undo, type History } from './history';
import { findBlock } from './board';
import type { Block, Side, State } from './types';

/** Rule 5: three strikes restart the level. */
export const MAX_STRIKES = 3;

/** One attempt at a level: the boards played so far and the strikes taken. */
export interface Attempt {
  readonly history: History;
  readonly strikes: number;
}

export type TapResult =
  /** The piece left by its rail. Free, uncounted. */
  | { readonly kind: 'exit'; readonly attempt: Attempt; readonly block: Block; readonly side: Side }
  /** The lane was not clear: a strike. */
  | { readonly kind: 'strike'; readonly attempt: Attempt }
  /** The third strike: the level starts again with no strikes. */
  | { readonly kind: 'out'; readonly attempt: Attempt }
  /** No piece can leave at all: no strike; the player is offered a restart. */
  | { readonly kind: 'stuck'; readonly attempt: Attempt }
  /** No such piece (already gone). Nothing happens. */
  | { readonly kind: 'none'; readonly attempt: Attempt };

export function startAttempt(start: State): Attempt {
  return { history: createHistory(start), strikes: 0 };
}

export function tap(attempt: Attempt, blockId: string): TapResult {
  const state = current(attempt.history);
  const block = findBlock(state, blockId);
  if (!block) return { kind: 'none', attempt };
  if (isStuck(state)) return { kind: 'stuck', attempt };
  const side = canExit(state, blockId);
  if (side) {
    return { kind: 'exit', block, side, attempt: { ...attempt, history: commit(attempt.history, applyExit(state, blockId)) } };
  }
  const strikes = attempt.strikes + 1;
  if (strikes >= MAX_STRIKES) return { kind: 'out', attempt: { history: restart(attempt.history), strikes: 0 } };
  return { kind: 'strike', attempt: { ...attempt, strikes } };
}

/** Undo takes back a board, never a strike. */
export function undoAttempt(attempt: Attempt): Attempt {
  return canUndo(attempt.history) ? { ...attempt, history: undo(attempt.history) } : attempt;
}

/** Restart clears the board and the strikes. */
export function restartAttempt(attempt: Attempt): Attempt {
  return { history: restart(attempt.history), strikes: 0 };
}
