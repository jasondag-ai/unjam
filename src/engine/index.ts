export * from './types';
export { BOARD_SIZE, cellsOf, findBlock, validateState } from './board';
export { legalSlides, canExit, applySlide, applyExit, isSolved } from './moves';
export { createHistory, current, commit, canUndo, undo, restart } from './history';
export type { History } from './history';
export { boardToText } from './text';
