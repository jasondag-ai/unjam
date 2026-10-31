// Job 025: how fair the gravity levels are. Run: npm run safe.
// Along each level's stored solution, the share of legal taps that keep the board solvable;
// and over 200 random plays, how many undos a stranded player needs to get back.
import { gravityLevels } from '../src/levels/gravity.generated';
import { safeMoves, solver, undosToRecover } from '../src/search/gravity';

for (const level of gravityLevels) {
  const solvable = solver();
  const safe = safeMoves(level.start, level.solution!, solvable);
  const back = undosToRecover(level.start, 200, 11, solvable).sort((a, b) => a - b);
  const median = back.length ? back[Math.floor(back.length / 2)] : 0;
  console.log(
    `level ${level.id} (${level.start.gravity}): safe ${safe.average.toFixed(2)} over ${safe.choices} choices,`,
    `worst ${safe.worst.safe} of ${safe.worst.legal}; ${back.length} of 200 random plays strand,`,
    `undos to recover median ${median}, most ${back.at(-1) ?? 0}, one undo enough ${back.filter((n) => n <= 1).length}`,
  );
}
