# Unjam — rules for engineers

Unjam is a block-escape puzzle for phones. Jason is the CEO; you are the engineer.

**Read [STANDING_RULES.md](STANDING_RULES.md) first. It overrides this file and the PRD; check every build against it.**

## The game
- Blocks are polyominoes of 2 to 4 cells in every band (bars, squares, L, T, S, Z). Piece size is
  not a difficulty knob; piece count, fill and the grid rise.
- Four rails, one full-length rail per side, each a colour: top amber, left mint, right cyan,
  bottom violet. A block's colour names the side it leaves by.
- Exit: a block travels straight toward its own side and leaves when every cell its shape passes
  through, all the way to the rail, is empty. Shape decides whether; colour decides where.
- Sliding: a block moves one cell in any direction into space its whole shape fits.
- The curve (`src/levels/bands.ts`):
  | Band | Grid | Pieces | Fill | Free at start |
  | early | 6x6 | 5 to 8 | 30-45% | 2 to 3 |
  | middle | 7x7 | 9 to 14 | 50-65% | 1 to 2 |
  | late | 8x8 | 14 to 20 | 70-80% | 0 to 1 |
  Early boards lean to 2 and 3 cell pieces, clustered in the middle with the outer ring mostly
  empty. Middle and late follow the job 003 mix: at least half the pieces 3 or 4 cells, dominoes
  at most a third, and a real L, T, S, Z mix.
- If fill and shape mix fight, shape mix wins.
- Levels come from the board search (`src/search/`, `npm run levels`), built in reverse (rule 6).
  Grid size, density, piece count, piece size, domino cap, clustering and free count are its
  parameters. The renderer and hit testing work at any grid size, scaled to the same area.

## Stack
- TypeScript, Vite, Canvas. No game engine, no framework.
- No dependencies beyond Vite and the test runner (Vitest). TypeScript and tsx are dev tools.
- Node 22+ (`.nvmrc` says 22).
- Do not create a GitHub repo or push anywhere until Jason says so.

## Engine rules (src/engine/)
- Pure functions over plain data. No DOM, no canvas, no globals, no Node APIs.
- `tsconfig.engine.json` compiles the engine with no DOM and no Node types; `npm test` runs it,
  so any browser or Node API in the engine fails the tests.
- Moves return a NEW state, or `null` when rejected. Never mutate.
- Undo is the list of states (`history.ts`), never inverse moves.
- The move count lives on the state. Slides and exits add 1; rejected moves add nothing.
- `isSolved` is true when no blocks remain.
- Rendering and input live outside `src/engine/` and only call the engine.
- Slides move one cell and add 1 to the move count.

## Milestones
- M0 engine: `npm test` passes; `npx tsx src/engine/demo.ts` prints SOLVED. Done.
- M1 tap to exit: done.
- Job 002 real boards: rails, polyominoes, free sliding, one packed 6x6 board. Done.
- Job 003 piece mix: done.
- Job 004 density curve: done.
- Job 005 grid grows: levels 1-5 6x6, 6-10 7x7, pieces 2-4 cells. Built.
  - Portrait, board centred, 16px gutters.
  - Edge-lit vector look. Ground #060B14, faint grid behind the board.
  - Blocks: rounded rectangles, 1.5px lit border, translucent fill of the same colour, outer glow.
  - Colours: cyan #4CD6E6, amber #F2A93B, violet #7D6CF5, mint #5BE8A8.
  - Rails are glowing bars along each side of the frame.
  - Every block carries a distinct glyph (square, triangle, circle, diamond). Always on.
  - Hit areas at least 44 CSS px, expanded away from neighbours; a tap between two blocks goes
    to the nearer block centre.
  - Tap: if `canExit`, animate out of its gate in under 300ms and accept input at once.
    Otherwise shake 4px.
  - Move counter in the corner. Undo button. Restart button.
  - Gate: runs with `npm run dev`, Jason clears it on his phone over the local network,
    every tap feels immediate.
- Not built yet: drag input, the late band, worlds, stars, sound, menus.

## Working rules
- One question at a time, with your recommended answer.
- If you can decide it yourself, decide it, and record it in HANDOFF.md.
- Keep HANDOFF.md current: state, decisions, next step.
- Commit at each gate. Stop at each gate and report to Jason.
- Keep this file under 200 lines.

## Commands
- `npm test` — engine typecheck guard, full typecheck, Vitest.
- `npx tsx src/engine/demo.ts` (or `npm run demo`) — scripted solve in the terminal.
- `npm run levels` — regenerate levels 1 to 10 from the curve in `tools/make-levels.ts`.
- `npm run dev` — Vite dev server on the local network, fixed port 5290 (5173-5181 belong to other projects).
