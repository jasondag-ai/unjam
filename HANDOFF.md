# HANDOFF

## Status
- **M0 engine: done**, accepted by Jason.
- **M1 tap to exit: done**, accepted by Jason.
- **Job 002 real boards: done.**
- **Job 003 piece mix: done.**
- **Job 004 density curve: done.**
- **Job 005 grid grows: done.**
- **Job 009 GitHub Pages: live** at https://jasondag-ai.github.io/unjam/.
- **Job 010 match the reference: done.**
- **Job 011 late band and deadlock: done.**
- **Job 012 mix the colours: done.**
- **Job 013 tweaks: done.**
- **Job 014 shaped late band: built and released** (see the job 014 section).

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

## Job 005: grid grows, pieces don't (2026-10-26)
Jason's correction: piece size is held at 2 to 4 cells; piece count, fill and the grid rise. Early 6x6,
middle 7x7, late 8x8. Job 003 mix applies to middle and late. Supersedes decisions 28 to 31.
- Search: `maxDominoes` added; grid size was already `size`. A 7x7 search test added.
- Layout: frame margin 26 -> 20 px, rail glyphs 16 -> 12 px out, so 7x7 cells are 45 px on a 390 px
  phone (43 before). Tests pin 44+ for 6x6 and 7x7 at 390, 393 and 430 px wide.
- Levels regenerated: grid 6,6,6,6,6,7,7,7,7,7. Pieces 5,6,6,7,7,9,9,10,10,10.
  Fill 31,36,39,42,44,53,55,59,61,63 percent. Free 3,3,2,2,2,2,1-2,1,1,1.
- Job 003 board moved to `src/levels/candidates.ts` (`lateCandidates`), out of the level list.
- Tests per band follow the new table; every piece 2 to 4 cells; fill and piece count never drop;
  grid steps up at level 6; level 10 at the top of the middle band.
- Browser check at iPhone size: levels 1 to 10 played in order by tapping, 53 px cells on 6x6 and
  45 px on 7x7, Next level after 1 to 9 only, no errors.

## Job 005 decisions and findings
33. Rule 2 cell sizes (CSS px), with the 20 px margin:
    | Phone width | 6x6 | 7x7 | 8x8 |
    | 375 (SE, mini) | 50 | 43 | 37 |
    | 390 / 393 | 53 | 45 | 39-40 |
    | 430 (Pro Max) | 59 | 51 | 44 |
    7x7 misses 44 by 1 px on 375 px phones. 8x8 holds 44 only on 430 px phones.
34. Middle band tops out near 10 pieces: with the job 003 mix, 11 pieces need at least 32 of 49
    cells (65.3 percent). So 9 to 14 is really 9 to 10 inside 65 percent. Level 10 is 10 pieces, 63
    percent. Same arithmetic caps the late band near 18 pieces at 80 percent.
35. Early levels use 2 to 4 cell pieces too (no 2-3 cap); they lean small because the fill is low.

## Jobs 007 to 009: test links (2026-10-26)
- Job 007 quick tunnel: replaced by Pages and stopped. Job 008 (named tunnel, login service): dropped;
  the PathGrant tunnel was never changed and no login service was installed.
- Job 009: public repo jasondag-ai/unjam; Pages Source = GitHub Actions; deploy workflow on push to
  main (npm ci, npm test, build, publish; Node 22).
- `vite.config.ts`: base `/unjam/` for builds only (dev server and its tooling stay at `/`);
  `__APP_VERSION__` from package.json; build id from `GITHUB_SHA` in CI, git locally; writes
  `version.json` `{version, build}`. Footer: `v0.0.x · build abc1234`.
- `tools/release.sh` (`npm run release`): patch bump, commit "Release x.y.z", push, check.
  `tools/check-live.sh` (`npm run check-live`): ls-remote, raw package.json at the commit, live
  version.json via curl with no cache; waits up to 5 minutes; lists runs if not live.
- First deploy: 0.0.2, build 51a956b; run succeeded in 42 s; checked in a phone-sized browser over
  the public site: playable in 0.4 s, level 1 cleared by taps.

## Job 009 decisions
36. Base path applies to builds only, so the dev server (and the then-running quick tunnel) kept
    working at the root.
37. Version starts at 0.0.1; each release is a patch bump. The release commit is made by the script.

## Job 010: match the reference (2026-10-26)
- STANDING_RULES: rule 2 now per piece (44 px along its longest side; 28 px cell floor on a 375 px
  phone; single cells only where a cell is 44 px+). Rule 5 is three strikes (reverses "no fail
  state" on purpose). Rule 19 added: the cancel gesture.
- Engine: `rows`/`cols` replace `size`; single-cell pieces valid; `moves` dropped;
  `strikes.ts` (startAttempt, tap, undoAttempt, restartAttempt; MAX_STRIKES 3).
- Game: HUD shows `Strikes ✕ ○ ○`, then "3 strikes: level restarted" for 1.6 s. Undo keeps
  strikes; restart clears them. A tap commits on lift only on the piece it started on
  (`tapOnRelease`); the 12 px slop is gone.
- Search: rows/cols; size weights with a 60 percent "2 or 3 cells" floor; fixed colour quota;
  any remaining kind each step; always blocks the most free pieces, then touch and centre pull
  (`centrePull`); ranks boards by smallest empty patch, then fewest free, then most pinned. Fast
  placement on a taken-cell set (about 15 ms per 8x9 try).
- Catalogue: single cell `M`, 5-cell `I5`, `L5`, `J5` added. Curve kinds: dominoes, bars and L's
  (T, S, Z, O stay in the catalogue, unused).
- Levels: 1-5 6x7, pieces 8,8,8,10,10, fill 36,40,43,45,50 percent, free 3,3,2,2,2.
  6-10 8x9, pieces 18,20,22,24,26, fill 65,69,74,76,79 percent, free 5,4,8,6,8.
- Browser check (iPhone size): all 10 cleared by taps; 53 px cells on 6x7, 39 px on 8x9; three
  bad taps restart; sliding off a blocked or free piece cancels with no strike; no errors.

## Job 010 decisions
38. Colour share 20-30 percent has no whole-number answer for 6, 7, 9 or 11 pieces, so early levels
    use 8 and 10 pieces.
39. Item 4's mix replaces the job 003 mix in every band (that mix cannot fit 18-26 pieces at 80
    percent). 4 and 5 cell pieces are bars and L's only, as item 4 lists.
40. At 26 pieces in 57 cells the average is 2.2 cells: level 10 is 23 dominoes. It is what the
    numbers force; fewer pieces at that fill would give more shapes.
41. Free at start: job 010's table dropped it. Early keeps 2-3. 1-2 on middle boards is out of
    reach for this search (typical 5-8 at 22-26 pieces), so middle boards have no target.
42. Middle boards rank by smallest empty patch first so they look crowded all over.
43. "3 strikes: level restarted" shows for 1.6 s after the third strike, so the reset is not a
    surprise. Text only; no art change.

## Job 011: late band and deadlock (2026-10-27)
Jason: 4 to 8 free on middle boards accepted, no stronger search. Rule 7 kept, reworded (the solver
decides solvability and what a hint points at). Mostly dominoes at reference density is correct.
- Rule 7 reworded in STANDING_RULES.md.
- Deadlock: engine `isStuck`; `tap` returns `stuck` with no strike; HUD "Stuck: no piece can
  leave", footer button reads Restart (`#action`, was `#next`); status line wraps at 375 px.
  Checked in the browser with a test board swapped in by Playwright (not in the repo).
- FINDING: taps alone can never strand a board. An exit only empties cells, so a free piece stays
  free whatever else leaves first, and every level is built to clear by taps. A new test plays
  every level in 20 random orders. Deadlock needs slides (drag input).
- Late band: levels 11-15 on 9x11, pieces 32, 34, 36, 38, 40; fill 86, 87, 89, 90, 91 percent;
  dominoes over half. Levels 1-10 unchanged (generator output identical).
- Rule 2 at 9 wide: 33 px cells on a 375 px phone (35 px on 390), above the 28 px floor; no cap.
- Browser check (iPhone size): all 15 levels cleared by taps; no slow frames during play with 40
  pieces (one 33 ms frame right after a level loads); no errors.

## Job 011 decisions and findings
44. Late fill stops at 91 percent (40 pieces in 90 cells): the reverse search finds no board at 92
    percent or more. Inside the 85-95 band; not a stronger search, per item 1.
45. A tap on a stuck board does nothing and costs nothing; Restart (header or footer) brings the
    level back with no strikes.
46. Colours on dense boards drift toward their own rail (amber top, violet bottom, mint left, cyan
    right), because each piece is placed where its lane to its rail is clear. Not changed.

## Job 012: mix the colours (2026-10-27)
- `src/search/measures.ts`: `colourSpread` (each colour's average distance to its own rail over
  every piece's average to that rail; 1 = no link to position), `clumping` (touching same-colour
  pairs against a random deal), `dependency` (pieces before the most-buried can go, and longest
  blocking chain), `blockers`, `railDistance`. Unit tests.
- Search `colourMix` (target spread, 0 = off): positions from the reverse build as before;
  colours dealt out again at random, then repaired by colour swaps: first until the board clears
  by taps with every colour at the target, then to cut same-colour clumps to a random deal plus 5
  points. Lanes, distances and touching pairs are worked out once, so it is fast.
- Placement-time scoring (reward distance from own rail) was tried first and dropped: it made most
  builds fail and over-pushed the top and bottom colours on tall boards.
- Levels 6-15 regenerated with `colourMix: 0.9`; levels 1-5 unchanged. Level 15 is 39 pieces (was
  40). Tests: spread 0.9+ and clumping within 5 points on levels 6-15; depth 3+ on 11-15.

  | Level | Spread a / c / v / m | Buried | Chain | Same-colour neighbours (random) |
  | 11 | 0.92 / 1.05 / 0.91 / 0.95 | 28 | 11 | 27% (23%) |
  | 12 | 0.92 / 0.92 / 0.96 / 0.97 | 30 | 19 | 27% (23%) |
  | 13 | 0.91 / 0.94 / 0.91 / 0.91 | 33 | 13 | 28% (23%) |
  | 14 | 0.93 / 1.11 / 0.91 / 1.12 | 35 | 20 | 27% (23%) |
  | 15 | 0.94 / 0.91 / 1.00 / 0.93 | 37 | 16 | 28% (23%) |
  Before job 012, levels 11-15 had spread ratios 0.27 to 0.78 and clumping 36-41 percent.

## Job 012 decisions and findings
47. Spread target 0.9 for every colour ("near the board average"); clumping within 5 points of
    random. Levels 1-5 keep their drift (ratios 0.40 to 1.27), as allowed.
48. Ceiling with mixing on 9x11: 91 percent (90 cells) at 38-39 pieces; 40 pieces top out at 88
    percent (87 cells). Level 15 is 39 pieces in 90 cells so fill still rises every level.
49. Depth was already there before mixing (levels 11-15 buried 13-30), but the deepest pieces sat
    near their own rail. Now burial is 28-37 with colours mixed.

## Job 013: tweaks (2026-10-27, Jason's informal note)
- Sky blue: the `cyan` colour is now #40B4FF (was #4CD6E6), brighter and clearly apart from mint.
  Palette data only (world1.ts, rule 8).
- Level picker (for testing): "Level N ▾" in the HUD is a native select; any level, any time.
  Next level keeps it in step. No progress gating exists, so nothing is skipped.
- Level 15 tries "a smaller piece setting" (read as the 40-piece option from job 012): 40 pieces
  in 87 cells (88 percent), down from 39 in 90. Spread 1.14 / 0.95 / 0.97 / 0.91, 34 before the
  most buried, chain 14, same-colour neighbours 28 percent (random 23). Levels 1-14 unchanged.
  The fill test now rises through level 14; level 15 is the stated exception.

## Backlog (Jason, job 013)
- Option setting for tones, skins and styles. The palette is already world data (rule 8), so a
  skin is a second palette and glyph set.
- Sound effects, music, win screens, challenge rounds.
- Before a public release: hide or gate the level picker.

## Job 014: shaped late band (2026-10-27)
Jason: "like that" (Tap Block Out screenshot: big L's nested in each other, staircases, small
pieces making bigger blocks), then "let's try and see how it looks" to the proposal.
- Engine: pieces up to 7 cells; `Block.group` names pieces placed together as one shape.
- Shapes: big corner L's `V5`, `L6`, `J6`, `L7`; groups `nest2` (5+3), `nest2big` (7+5),
  `nest3` (7+5+3), `stair3` (three dominoes); `placementOrder` gives the reverse tap order for an
  exit side, or null if the pieces would not hold each other.
- Search `groups` param: each group is one unit in one colour, placed in its own reverse order with
  clear paths. Colour mixing moves a group's colour as a whole (trading with a same-size group or
  as many single pieces), only to colours whose path runs through the group. Boards with no groups
  come out exactly as before (levels 1-10 unchanged).
- Late band now 24-30 pieces at 85-90 percent: levels 11-15 are 24/85, 26/86, 28/87, 28/88, 30/89,
  each with nest3, nest2big, nest2 and stair3. Spread 0.90+, same-colour neighbours 22-27 percent
  (random 22-23), buried 16-28, chains 8-18.
- Supersedes decision 48 and the job 013 level 15 setting (40 pieces); the 32-40 late numbers are
  replaced.

## Job 014 decisions and findings
50. Six groups on a board, or two three-deep nests, found no board with colours mixed; every late
    level uses the same four groups.
51. Staircases of dominoes, not single cells: rule 2 forbids single cells at 33 px.
52. Piece count drops from 26 (level 10) to 24 (level 11): the late band uses fewer, bigger pieces.
    The never-drops test now applies inside each band.

## Needs from Jason
- Play levels 11 to 15 on the phone: does the late band now look like the reference?

## Next step
- On Jason's word: next job.
