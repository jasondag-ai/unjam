# Unjam — rules for engineers

Unjam is a block-escape puzzle for phones. Jason is the CEO; you are the engineer.

**Read [STANDING_RULES.md](STANDING_RULES.md) first. It overrides this file and the PRD; check every build against it.**

## The game
- Boards are 5x5 for levels 1 to 5 and 6x6 from level 6 on. Blocks are polyominoes of 2 to 6 cells
  (bars, squares, L, T, S, Z).
- Four rails, one full-length rail per side, each a colour: top amber, left mint, right cyan,
  bottom violet. A block's colour names the side it leaves by.
- Exit: a block travels straight toward its own side and leaves when every cell its shape passes
  through, all the way to the rail, is empty. Shape decides whether; colour decides where.
- Sliding: a block moves one cell in any direction into space its whole shape fits.
- Boards are dense and interlocked: 60 to 75 percent of cells filled.

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
- Job 002 real boards: rails, polyominoes, free sliding, one packed 6x6 board. Built.
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
- Not built yet: drag input, generator, sound, stars, menus, more levels.

## Working rules
- One question at a time, with your recommended answer.
- If you can decide it yourself, decide it, and record it in HANDOFF.md.
- Keep HANDOFF.md current: state, decisions, next step.
- Commit at each gate. Stop at each gate and report to Jason.
- Keep this file under 200 lines.

## Commands
- `npm test` — engine typecheck guard, full typecheck, Vitest.
- `npx tsx src/engine/demo.ts` (or `npm run demo`) — scripted solve in the terminal.
- `npm run dev` — Vite dev server on the local network, fixed port 5290 (5173-5181 belong to other projects).
