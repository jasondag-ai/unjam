# STANDING_RULES.md — Unjam
These override the PRD and CLAUDE.md. A rule is added the
moment the CEO says something once. Every build and asset
is checked against all of them.
1. Colour is never the only signal. Every block carries its
   own glyph mark, always on, never a setting.
2. Minimum touch target 44 CSS px per piece, not per cell:
   a piece's target spans at least 44 px along its longest
   side, expanded away from neighbours. Cells may be as
   small as 28 px on a 375 px phone, so a single-cell piece
   is allowed only where a cell is 44 px or larger, except
   on late boards (job 015): there single cells are allowed
   at 33 px and nearest-centre resolution carries them. A
   tap between two blocks resolves to the nearer block
   centre.
3. The engine stays pure. No DOM, canvas, browser globals
   or timers in src/engine/.
4. State is immutable. Moves return a new board. Undo is a
   list of past boards.
5. Three strikes (job 010, reversing "no fail state" on
   purpose). A tap on a piece whose lane is not clear costs
   a strike; three strikes restart the level. Correct taps
   are free and uncounted. No move counter, par or stars. No
   lives, energy, timers, ads or accounts.
6. Every level solvable by construction. Generated in
   reverse, never hand-authored past M1.
7. The solver, not a guess, decides whether a board is
   solvable and what a hint points at. Par is gone; the
   solver is not.
8. A level's palette is data on its world, never hard-coded
   in the renderer.
9. Nothing exits around a corner.
10. Input is touch or swipe. A swipe belongs to the block it
    started on, whatever it crosses.
11. Exit animation under 300 ms, input accepted again
    immediately. Taps must chain.
12. 60 fps on a phone with 20 blocks on screen. A visual
    that cannot hold it is cut.
13. Playable three seconds after opening the link. No
    splash, no instruction screen, no account.
14. Honour prefers-reduced-motion. Opacity and colour only.
15. Text contrast 4.5:1, small grey labels included.
16. One engineer session per repo.
17. Commit at every gate. Never leave the live link broken.
18. No new dependency without a one-line reason in the
    commit message.
19. The cancel gesture. A tap commits on finger lift, on the
    piece it started on; sliding the finger off before
    lifting cancels it at no cost. With strikes in play this
    keeps the game fair. When drag input lands, do not drop
    it: flag the conflict and ask.
