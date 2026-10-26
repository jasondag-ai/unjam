# STANDING_RULES.md — Unjam
These override the PRD and CLAUDE.md. A rule is added the
moment the CEO says something once. Every build and asset
is checked against all of them.
1. Colour is never the only signal. Every block carries its
   own glyph mark, always on, never a setting.
2. Minimum touch target 44 CSS px, expanded away from
   neighbours. A tap between two blocks resolves to the
   nearer block centre.
3. The engine stays pure. No DOM, canvas, browser globals
   or timers in src/engine/.
4. State is immutable. Moves return a new board. Undo is a
   list of past boards.
5. No fail state. Past par costs stars, never the level. No
   lives, energy, timers, ads or accounts.
6. Every level solvable by construction. Generated in
   reverse, never hand-authored past M1.
7. Par comes from the solver, never a guess.
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
