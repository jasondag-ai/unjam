# HANDOFF

## Status
- **M0 engine: done**, accepted by Jason.
- **M1 tap to exit: built**, waiting for Jason to clear it on his phone at http://10.0.0.30:5290/.

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

## M1 (2026-10-25)
- STANDING_RULES.md added; CLAUDE.md points at it. It overrides everything else.
- `src/levels/` — world data: palette, glyph per colour, level 1 (rule 8: renderer has no board colours).
- `src/game/layout.ts` — portrait layout, 16 px gutters, block rectangles. Pure.
- `src/game/hit.ts` — rule 2 hit test. Pure, tested.
- `src/game/render.ts` — canvas renderer. Background and block sprites (with glow) drawn once per
  layout; each frame is just image copies (rule 12).
- `src/game/app.ts` — tap input, exit and shake animations, move counter, undo, restart.
- Build id shown at the bottom (`build <git hash>`, `+` if uncommitted changes).
- Browser check (Playwright, iPhone size, from the scratchpad, not a repo dependency): page ready
  in about 0.3 s, rejected tap leaves moves at 0, undo and restart work, all 9 taps chained 50 ms
  apart clear the level, worst frame 16.8 ms, no console errors.

## M1 decisions (engineer's call)
10. Gates also carry their colour's glyph just outside the frame, so gates are not colour-only (rule 1).
11. Glyphs: cyan square, amber triangle, violet circle, mint diamond.
12. A tap fires on release, on the block under the finger at press. A press that moves more than
    12 px is not a tap (keeps rule 10 swipes possible later). Each finger is tracked, so taps chain.
13. The engine commits a move at once; animations only replay it. Next tap is accepted immediately.
14. Exit: 220 ms, block slides through its gate and is clipped at the frame. Shake: 4 px along the
    block's axis, 200 ms.
15. Reduced motion (rule 14): exit fades in place; shake becomes an opacity dip.
16. Counter reads "Cleared in N moves" when the board is empty. No other end screen.
17. Undo and Restart are HTML buttons over the canvas, at least 44 px.
18. Level 1: 9 blocks, only one free at the start, tap-only solution of 9 moves (tested).
19. Dev server port fixed at 5290, strict, so the phone URL does not change.
20. Blocks are drawn as the bounding box of their cells. Fine for bars and single cells; L shapes
    would need a new drawing path.

## Needs from Jason
- Clear level 1 on the phone (same Wi-Fi as the Mac) and say whether every tap feels immediate.

## Next step
- On Jason's word after the phone check: next job.
