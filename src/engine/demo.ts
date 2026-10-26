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

const start: State = {
  size: 5,
  moves: 0,
  blocks: [
    { id: 'A', colour: 'cyan', anchor: { row: 0, col: 0 }, axis: 'h', shape: [{ row: 0, col: 0 }, { row: 0, col: 1 }] },
    { id: 'B', colour: 'amber', anchor: { row: 0, col: 3 }, axis: 'v', shape: [{ row: 0, col: 0 }, { row: 1, col: 0 }] },
    { id: 'C', colour: 'violet', anchor: { row: 2, col: 0 }, axis: 'h', shape: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }] },
    { id: 'D', colour: 'mint', anchor: { row: 4, col: 3 }, axis: 'free', shape: [{ row: 0, col: 0 }] },
  ],
  gates: [
    { side: 'right', index: 0, colour: 'cyan' },
    { side: 'bottom', index: 3, colour: 'amber' },
    { side: 'left', index: 2, colour: 'violet' },
    { side: 'left', index: 4, colour: 'mint' },
  ],
};

type Step = { exit: string } | { slide: string; dir: Direction; by: number };

const script: Step[] = [
  { exit: 'A' }, // rejected: B sits in A's lane
  { slide: 'B', dir: 'down', by: 1 }, // opens row 0
  { exit: 'A' },
  { exit: 'B' }, // rejected: D sits below B in column 3
  { exit: 'D' },
  { exit: 'B' },
  { exit: 'C' },
];

validateState(start);
let history = createHistory(start);
console.log(boardToText(start));

for (const step of script) {
  const s = current(history);
  const label = 'exit' in step ? `exit ${step.exit}` : `slide ${step.slide} ${step.dir} ${step.by}`;
  const next = 'exit' in step ? applyExit(s, step.exit) : applySlide(s, step.slide, step.dir, step.by);
  history = commit(history, next);
  console.log(`\n${label}: ${next ? 'ok' : 'rejected'}  (moves ${current(history).moves})`);
  if (next) console.log(boardToText(next));
}

if (!isSolved(current(history))) throw new Error('NOT SOLVED');
console.log('\nSOLVED');
