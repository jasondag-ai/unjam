# Unjam — rules for engineers

Unjam is a block-escape puzzle for phones. Jason is the CEO; you are the engineer.

**Read [STANDING_RULES.md](STANDING_RULES.md) first. It overrides this file and the PRD; check every build against it.**

## The game
- A 5x5 board holds coloured blocks. Each board edge segment is either wall or a coloured gate.
- A block leaves by travelling in a straight line along its own axis to a gate of its colour,
  with no other block in the lane, and the gate aligned with the block's own rows or columns.
- Blocks also slide along their axis into free cells. That is how a lane gets opened.
- Single-cell blocks are free: they move and exit along either axis.

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

## Milestones
- M0 engine: `npm test` passes; `npx tsx src/engine/demo.ts` prints SOLVED. Done.
- M1 tap to exit: canvas renderer and tap input. Start only when Jason says go.
  - Portrait, board centred, 16px gutters.
  - Edge-lit vector look. Ground #060B14, faint grid behind the board.
  - Blocks: rounded rectangles, 1.5px lit border, translucent fill of the same colour, outer glow.
  - Colours: cyan #4CD6E6, amber #F2A93B, violet #7D6CF5, mint #5BE8A8.
  - Gates are glowing bars on the frame.
  - Every block carries a distinct glyph (square, triangle, circle, diamond). Always on.
  - Hit areas at least 44 CSS px, expanded away from neighbours; a tap between two blocks goes
    to the nearer block centre.
  - Tap: if `canExit`, animate out of its gate in under 300ms and accept input at once.
    Otherwise shake 4px.
  - One hand-authored 5x5 level, solvable by tapping alone.
  - Move counter in the corner. Undo button. Restart button.
  - Gate: runs with `npm run dev`, Jason clears it on his phone over the local network,
    every tap feels immediate.
- Out of scope for job 001: drag, art, sound, more levels.

## Working rules
- One question at a time, with your recommended answer.
- If you can decide it yourself, decide it, and record it in HANDOFF.md.
- Keep HANDOFF.md current: state, decisions, next step.
- Commit at each gate. Stop at each gate and report to Jason.
- Keep this file under 200 lines.

## Commands
- `npm test` — engine typecheck guard, full typecheck, Vitest.
- `npx tsx src/engine/demo.ts` (or `npm run demo`) — scripted solve in the terminal.
- `npm run dev` — Vite dev server, exposed on the local network.
