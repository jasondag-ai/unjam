export * from './types';
export { BOARD_SIZE, MIN_PIECE, MAX_PIECE, cellsOf, findBlock, validateState } from './board';
export { legalSlides, exitSide, canExit, applySlide, applyExit, isSolved } from './moves';
export { createHistory, current, commit, canUndo, undo, restart } from './history';
export type { History } from './history';
export { boardToText } from './text';
