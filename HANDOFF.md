# HANDOFF

## Status
- **M0 engine: done**, accepted by Jason.
- **M1 tap to exit: done**, accepted by Jason.
- **Job 002 real boards: done.**
- **Job 003 piece mix: done.**
- **Job 004 density curve: built**, waiting for Jason to play levels 1 to 10 at http://10.0.0.30:5290/.

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

## Job 002: real boards (2026-10-25)
Model changed; supersedes M0 decisions 1, 4, 5, 6 and M1 decisions 10, 18, 20.
- Rails replace per-segment gates: `State.rails` names each side's colour (top amber, right cyan,
  bottom violet, left mint). The world holds them too (`World.rails`).
- `canExit` returns the side, or null. The block sweeps toward its colour's side; every cell its
  shape passes through to the frame must be empty.
- No axis. Pieces are 2 to 6 connected cells. `applySlide(state, id, dir)` moves exactly one cell in
  any direction the whole shape fits. `legalSlides` still reports the full distance each way.
- `validateState` checks piece size, connectedness, overlap, bounds, and four distinct rail colours.
- Renderer draws each piece's real outline (inset, rounded inner and outer corners) and four
  full-length rails, each with its glyph outside the frame at the middle.
- Hit test uses each cell of a piece as drawn; reach into free space is 0.6 of a cell.
- Blocked pieces shake toward the rail they want.
- Level 1 is now 6x6. Tests prove: 12 pieces, 27 of 36 cells (75%), 2 free at the start, all four
  colours, bent pieces present, clears by taps alone in 12 taps.
- Browser check at iPhone size: ready in under 0.1 s on a warm server, rejected tap leaves moves at 0,
  undo and restart work, all 12 taps chained 50 ms apart clear it, worst frame 16.8 ms, no errors.

## Job 002 decisions (engineer's call)
21. Item 7 numbers conflict with L/T/S/Z variety on 6x6: 12 pieces of at least 2 cells is already 24
    cells, and 75% is 27. I kept every stated number. Result: 9 dominoes, 2 L trominoes, 1 S
    tetromino. Jason was asked and declined to answer in-session; open question below.
22. The 6x6 board is level 1, as item 7 says, although item 6 says levels 1 to 5 are 5x5. It is the
    only board until more levels are in scope.
23. Rule 6 (generated in reverse, never hand-authored past M1): the board was built in reverse with a
    throwaway search script outside the repo. Each piece was placed so it can leave past the pieces
    already placed, choosing spots that block the most free pieces. Then the most pinned of many
    tries was kept (8 of 12 pieces held by 2+ neighbours). The script is not the product generator.
24. Glyphs stay per colour, so each rail's glyph matches its pieces.

## Job 003: piece mix (2026-10-26)
Jason's decisions: 8 to 10 pieces per 6x6 board, 60 to 75 percent full, at least half 3+ cells with a
genuine L/T/S/Z mix, dominoes at most a third; shape mix beats fill if they fight. The 6x6 board
is level 1; the 5x5 teaching idea is dropped. Supersedes decisions 21 and 22.
- Level 1 regenerated in reverse: 8 pieces, 27 of 36 cells (75%). S, T, L, L, J, square, bar of
  three, one domino. Two pieces free at the start (A and G), 8 taps to clear.
- Level tests now check 8 to 10 pieces, 60 to 75 percent fill, dominoes at most a third, half or
  more 3+ cells, at least three of L/T/S/Z (rotations; J counts as L). Rails, at-most-two-free,
  taps-alone, colours and glyph tests kept.
- Browser check at iPhone size: rejected tap leaves moves at 0, undo and restart work, 8 chained
  taps clear it, worst frame 16.8 ms, no errors.

## Job 003 decisions (engineer's call)
25. Search wanted exactly two free pieces at the start (Jason: "a board where only two pieces can
    move"); the test still allows at most two.
26. Every colour appears at least once. Two of each was dropped: no 8-piece board with two free
    pieces met it. Colours are 3 violet, 3 mint, 1 amber, 1 cyan.
27. Chose the board with the widest shape mix over one with one more pinned piece but an empty
    bottom row.

## Job 004: density curve (2026-10-26)
- `src/search/shapes.ts` — piece catalogue (domino, bars of 3 and 4, L3, L4, J4, T, S, Z, square),
  rotations, `kindOf`, `familyOf`.
- `src/search/search.ts` — `searchBoard(params, rails)`. Parameters: pieces, cells (density),
  piece-size range, minimum L/T/S/Z families, free-at-start range, ring maximum (clustering),
  tries, seed. Built in reverse; pulls pieces to the middle; keeps the most pinned board. Seeded.
- `src/levels/bands.ts` — early, middle, late bands.
- `tools/make-levels.ts` — the curve for levels 1 to 9; `npm run levels` writes
  `src/levels/world1.generated.ts`. Level 10 is the job 003 board, kept in `world1.ts`.
- Curve: pieces 5, 6, 6, 7, 7, 9, 9, 9, 10, 8. Fill 31, 36, 39, 42, 44, 53, 58, 61, 64, 75 percent.
  Free at start 3, 3, 2, 2, 2, 2, 1-2, 1, 1, 2. Level 1 has nothing on the outer ring.
- Tests: every level valid and tap-clearable; fill rises every level; levels 1 to 5 in the early
  band (mostly 2-3 cell pieces, ring at most 5 of 20 cells); 6 to 9 in the middle band with at
  least one L/T/S/Z; level 10 keeps its job 003 picture and mix tests.
- HUD shows the level number. A Next level button appears on clear (space reserved, so the board
  never moves); none after level 10. Progress is not saved; reload starts at level 1.
- Browser check at iPhone size: levels 1 to 10 played in order by tapping, each cleared, Next
  shown after 1 to 9 and not after 10, no errors.

## Job 004 decisions (engineer's call)
28. Level 10 is kept as asked, though it sits outside the middle band (8 pieces, not 9 to 13; 75
    percent, not 50 to 65). Tests hold it to its job 003 numbers instead. Open question below.
29. Middle band: job 003's mix (dominoes at most a third, half 3+ cells, three families) cannot fit
    9+ pieces at 65 percent or less: 9 pieces with 3 dominoes is already 26+ cells (72 percent).
    So middle levels are mostly dominoes with L/T/S/Z arriving (1 or 2 families). Fill was kept,
    since raising it would cross into the late band.
30. Early band "mostly 2 and 3 cell pieces" is held as: no piece over 3 cells in the curve; the
    test allows a quarter larger.
31. Pieces stop at 4 cells in the catalogue; the late band's bigger shapes need 5 and 6 cell
    pieces added later.
32. The search lives in the repo now (job 004 asks for it as parameters). It is a build-time tool,
    not run in the game.

## Needs from Jason
- Play levels 1 to 10 in order on the phone and say whether the board feels like it gets thicker.
- Decide level 10: keep the job 003 board (75 percent, 8 bigger pieces) or replace it with a
  generated board at the top of the middle band (about 10 pieces, 64 to 65 percent).

## Next step
- On Jason's word: next job.
