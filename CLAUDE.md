# Unjam — rules for engineers

Unjam is a block-escape puzzle for phones. Jason is the CEO; you are the engineer.

**Read [STANDING_RULES.md](STANDING_RULES.md) first. It overrides this file and the PRD; check every build against it.**

## The game
- Four rails, one full-length rail per side, each a colour: top amber, left mint, right cyan,
  bottom violet. A block's colour names the side it leaves by.
- Exit: a block travels straight toward its own side and leaves when every cell its shape passes
  through, all the way to the rail, is empty. Shape decides whether; colour decides where.
- Sliding (engine only, no input yet): a block moves one cell in any direction its shape fits.
- Tap: commits on lift, on the piece it started on; sliding off cancels at no cost (rule 19).
  A tap on a piece whose lane is not clear is a strike; three strikes restart the level (rule 5).
  Correct taps are free. No move counter, par or stars.
- Boards are portrait. The curve (`src/levels/bands.ts`, job 010):
  | Band | Grid (wide x tall) | Pieces | Fill |
  | early | 6x7 | 6 to 10 | 35-50% |
  | middle | 10x12 | 30 to 43 | 65-80% |
  | late | 12x15 | 44 to 52 | 80-90% | (job 019: convoluted strokes, singles) |
- Job 024, three acts of five: 1-5 dense tap (6x7 50%, 10x12 68%, then 12x15 80/85/87%), 6-10
  dense tap 88-90%, 11-15 split pieces (8-12 each), 16-20 gravity (pull turning). Level 1 is
  the only teaching board.
- Every colour gets 20 to 30 percent of each board's pieces.
- Early and middle pieces are mostly 2 and 3 cells, with some 4 and 5 cell bars and L shapes.
  Singles wherever the press highlight is on and a cell is 24 px or more (rule 2, job 019); cells
  never under 24 px, boards never over 14 wide. No piece is two cells thick (job 019).
- Early boards keep 2 to 3 free pieces at the start and cluster in the middle. Middle and late
  boards have no free-at-start target (4 to 8 on middle boards is accepted, job 011); the search
  takes the board with the smallest empty patch. Do not build a stronger search for free counts.
- Late band (job 019): levels 3 to 20 on 12x15, 48 pieces: 15-25% singles, one-cell-wide U, S,
  Z, T, plus and staircase strokes up to 7 cells, dominoes and threes; at least one piece caged
  in a U's notch that the U waits for (`cages()`); two nests of L's (7/5/3
  and 5/3, one colour each) and two long bars as landmarks, and two threaded pieces: a small piece
  whose lane is a walled one-cell channel of 4+ cells and which holds another (`threads()` in
  measures.ts); at least one channel closed at its outer end by a piece (hidden from the edge).
- Colours are mixed on levels 2 to 20, gravity included (jobs 012, 018, 024): colour must not follow position. Measures in
  `src/search/measures.ts`: spread ratio per colour (own-rail distance against the board's, at
  least 0.9), same-colour neighbours (below a random deal, job 018), and dependency depth
  (pieces before the most-buried can go; at least 3 on late boards). Never loosen the mix to reach
  density.
- Split pieces (job 021): a block's `colours` gives each cell a colour; each colour's part leaves
  by its own rail, the other part solid. A tap sends the first part that can go; the rest stays
  as an ordinary piece. Generated splits are always forced (one part in the other's lane) and
  never locked. Only levels 11-15 have them: 8, 10, 12, 12, 12 (job 024). Drawn as one
  outline whose colour fades across the join (job 023), never with a seam line.
- Gravity (levels 16-20): `State.gravity` pulls toward one rail and the board settles after every
  exit, so taps alone can strand it. Built forward (job 024, src/search/gravity.ts): pack, settle,
  replay with annealed priorities and colours until the mix is met; the replay is the stored
  solution. Strand rates of random play are in the generated file's comments.
  Empty cells show a faint chevron pointing the pull (job 023).
- Deadlock: when pieces remain and none can leave, the status says "Stuck: no piece can leave" and
  the footer button offers Restart; taps there cost no strike. Exits alone can never cause it
  (they only empty cells); it guards for drag input.
- Levels come from the board search (`src/search/`, `npm run levels`), built in reverse (rule 6).
  Grid, piece count, fill, kinds and size weights, colour share, free range, clustering and
  centre pull are its parameters. Renderer and hit testing work at any grid, scaled to fit.
- The edge-lit neon look is final (job 010). Do not change the art.

## Stack
- TypeScript, Vite, Canvas. No game engine, no framework.
- No dependencies beyond Vite and the test runner (Vitest). TypeScript and tsx are dev tools.
- Node 22+ (`.nvmrc` says 22).
- Repo: github.com/jasondag-ai/unjam (public). Live: https://jasondag-ai.github.io/unjam/

## Deploy (GitHub Pages)
- Every push to main tests, builds and publishes (`.github/workflows/deploy.yml`; Pages Source is
  GitHub Actions). Builds use base `/unjam/`; the dev server stays at the root.
- Ship with `npm run release` only: it bumps the patch version, commits "Release x.y.z", pushes and
  runs the live check. Every deploy bumps the version.
- The footer shows `v<version> · build <first 7 of the commit>`; the build writes the same into
  `version.json`.
- Verify with `npm run check-live`: git ls-remote for main, raw package.json at that commit, and the
  live version.json read raw with curl. Never trust a web fetch of version.json.
- Out of scope so far: a dev lane (unjam-next), a custom domain.

## Engine rules (src/engine/)
- Pure functions over plain data. No DOM, no canvas, no globals, no Node APIs.
- `tsconfig.engine.json` compiles the engine with no DOM and no Node types; `npm test` runs it,
  so any browser or Node API in the engine fails the tests.
- Moves return a NEW state, or `null` when rejected. Never mutate.
- Undo is the list of states (`history.ts`), never inverse moves.
- `isSolved` is true when no blocks remain.
- Strikes live in `strikes.ts` (an attempt is the history plus strikes). Undo never takes back a
  strike; restart clears them.
- Rendering and input live outside `src/engine/` and only call the engine.

## Milestones
- M0 engine, M1 tap to exit, jobs 002 to 005 (rails, piece mix, density curve, grid): done.
- Job 009 GitHub Pages: live.
- Job 010 match the reference: portrait boards, new curve, colour balance, strikes, cancel gesture.
- Job 011: late band (levels 11-15), deadlock message, rule 7 reworded.
- Job 012: colours mixed on levels 6-15; spread, clumping and depth measures.
- Job 013: sky blue, level picker (testing only; gate before public release).
- Job 014: late band shaped like the reference (nests of L's, staircases, big L's).
- Job 015: legibility is the difficulty: many small late pieces, threads, palette contrast.
- Job 016: real channels (4+ cells, one hidden from the edge), sky blue back.
- Job 018: press highlight; grid 10x12 / 12x15; levels 16-20; same-colour neighbours below random.
- Job 019: singles back (rule 2), skinny convoluted strokes, caged pieces; peel colouring.
- Job 021: split pieces (two colours, two exits); levels 21-23.
- Job 022 (spike): gravity; verdict in HANDOFF.
- Job 023: split parts fade across the join; gravity chevrons.
- Job 024: twenty levels in three acts; gravity at late density with the colour mix.
- The look (M1, final): ground #060B14, faint grid behind the board; blocks are rounded shapes with
  a 1.5px lit border, translucent fill of the same colour and an outer glow; sky blue #40B4FF (`cyan` in code), amber
  #F2A93B, violet #B3A3FF, mint #4ABF6A (job 016: contrast 8.4-9.9 on the ground, apart in lightness); rails are glowing bars; every block carries its colour's
  glyph (square, triangle, circle, diamond), always on; exits under 300 ms, a blocked tap shakes 4 px.
- Not built yet: drag input (keep rule 19; flag the conflict and ask), worlds, sound, menus.

## Working rules
- One question at a time, with your recommended answer.
- If you can decide it yourself, decide it, and record it in HANDOFF.md.
- Keep HANDOFF.md current: state, decisions, next step.
- Commit at each gate. Stop at each gate and report to Jason.
- Keep this file under 200 lines.

## Commands
- `npm test` — engine typecheck guard, full typecheck, Vitest.
- `npx tsx src/engine/demo.ts` (or `npm run demo`) — scripted solve in the terminal.
- `npm run levels` — regenerate levels 1 to 15 from the curve in `tools/make-levels.ts`, one process per level (about 2 h).
- `npm run dev` — Vite dev server on the local network, fixed port 5290 (5173-5181 belong to other projects).
- `npm run gravity` — regenerate gravity levels 16 to 20 (`tools/make-gravity.ts`, about 95 min).
- `npm run release` — deploy (see Deploy). `npm run check-live` — is it live?
