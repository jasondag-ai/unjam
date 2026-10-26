# HANDOFF

## Status
- **M0 engine: done.** Waiting for Jason's go before M1.
- M1 tap to exit: not started.

## What exists
- `src/engine/types.ts` — Cell, Block, Gate, State, Slides.
- `src/engine/board.ts` — cell maths, occupancy, `validateState`.
- `src/engine/moves.ts` — `legalSlides`, `canExit`, `applySlide`, `applyExit`, `isSolved`.
- `src/engine/history.ts` — undo as a list of states: `createHistory`, `commit`, `undo`, `restart`.
- `src/engine/text.ts` — `boardToText` for the terminal.
- `src/engine/demo.ts` — prints a board, plays 7 scripted moves (2 rejected), prints SOLVED.
- `src/engine/engine.test.ts` — 23 Vitest tests.

## Decisions made (engineer's call)
1. Gate index is the column for top/bottom gates and the row for left/right gates.
2. Rejected moves return `null`. `commit(history, null)` keeps the history unchanged, so a rejected tap
   never counts as a move.
3. Undo restores the earlier state as it was, including its move count.
4. Single-cell blocks must have axis `'free'`; multi-cell blocks must be `'h'` or `'v'`.
5. When more than one exit works, `canExit` tries up, right, down, left and takes the first.
6. A block more than one cell thick across its exit needs a matching gate on every row (or column) it covers.
7. Text board legend: block ids on cells; gate letters on the frame (c cyan, a amber, v violet, m mint).
8. tsx is a dev dependency so the gate command `npx tsx ...` runs offline. TypeScript is too, for typechecks.
9. Machine has Node 25; project targets Node 22+ (`engines`, `.nvmrc`). Nothing uses features past 22.

## Next step
- M1, on Jason's go: canvas renderer, tap input, one tap-only level, move counter, undo, restart.
