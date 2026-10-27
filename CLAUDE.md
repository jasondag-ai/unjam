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
  | middle | 8x9 | 18 to 26 | 65-80% |
  | late | 9x11 | 32 to 40 | 85-95% |
- Every colour gets 20 to 30 percent of each board's pieces.
- Pieces are mostly 2 and 3 cells, with some 4 and 5 cell bars and L shapes. Single cells only
  where a cell is 44 px or more (early boards).
- Early boards keep 2 to 3 free pieces at the start and cluster in the middle. Middle and late
  boards have no free-at-start target; the search takes the board with the smallest empty patch.
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
- The look (M1, final): ground #060B14, faint grid behind the board; blocks are rounded shapes with
  a 1.5px lit border, translucent fill of the same colour and an outer glow; cyan #4CD6E6, amber
  #F2A93B, violet #7D6CF5, mint #5BE8A8; rails are glowing bars; every block carries its colour's
  glyph (square, triangle, circle, diamond), always on; exits under 300 ms, a blocked tap shakes 4 px.
- Not built yet: drag input (keep rule 19; flag the conflict and ask), the late band, worlds,
  sound, menus.

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
- `npm run release` — deploy (see Deploy). `npm run check-live` — is it live?
