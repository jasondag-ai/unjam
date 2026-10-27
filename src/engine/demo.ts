// Prints a board, plays a scripted solution, and prints SOLVED.
// Run: npx tsx src/engine/demo.ts
import {
  applyExit,
  applySlide,
  boardToText,
  commit,
  createHistory,
  current,
  isSolved,
  validateState,
  type Direction,
  type State,
} from './index';

// Rails: top amber, right cyan, bottom violet, left mint.
const start: State = {
  rows: 5,
  cols: 5,
  rails: { top: 'amber', right: 'cyan', bottom: 'violet', left: 'mint' },
  blocks: [
    { id: 'A', colour: 'cyan', anchor: { row: 0, col: 0 }, shape: [{ row: 0, col: 0 }, { row: 0, col: 1 }] },
    { id: 'B', colour: 'violet', anchor: { row: 0, col: 3 }, shape: [{ row: 0, col: 0 }, { row: 1, col: 0 }] },
    { id: 'C', colour: 'mint', anchor: { row: 2, col: 1 }, shape: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 1 }] },
    { id: 'D', colour: 'violet', anchor: { row: 3, col: 3 }, shape: [{ row: 0, col: 0 }, { row: 1, col: 0 }] },
  ],
};

type Step = { exit: string } | { slide: string; dir: Direction };

const script: Step[] = [
  { exit: 'A' }, // rejected: B sits in A's lane to the right
  { slide: 'B', dir: 'down' }, // opens row 0
  { exit: 'A' },
  { exit: 'B' }, // rejected: D sits below B
  { exit: 'D' },
  { exit: 'B' },
  { exit: 'C' },
];

validateState(start);
let history = createHistory(start);
console.log(boardToText(start));

for (const step of script) {
  const s = current(history);
  const label = 'exit' in step ? `exit ${step.exit}` : `slide ${step.slide} ${step.dir}`;
  const next = 'exit' in step ? applyExit(s, step.exit) : applySlide(s, step.slide, step.dir);
  history = commit(history, next);
  console.log(`\n${label}: ${next ? 'ok' : 'rejected'}`);
  if (next) console.log(boardToText(next));
}

if (!isSolved(current(history))) throw new Error('NOT SOLVED');
console.log('\nSOLVED');
