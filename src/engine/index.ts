export * from './types';
export { BOARD_SIZE, MIN_PIECE, MAX_PIECE, cellsOf, findBlock, validateState } from './board';
export { legalSlides, exitSide, partsOf, exitingPart, canExit, applySlide, applyExit, settle, isSettled, isSolved, isStuck } from './moves';
export { createHistory, current, commit, canUndo, undo, restart } from './history';
export type { History } from './history';
export { boardToText } from './text';
export { MAX_STRIKES, startAttempt, tap, undoAttempt, restartAttempt } from './strikes';
export type { Attempt, TapResult } from './strikes';
