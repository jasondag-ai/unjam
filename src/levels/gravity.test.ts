import { describe, expect, it } from 'vitest';
import { applyExit, canExit, isSettled, isSolved, isStuck, validateState } from '../engine';
import { clumping, colourSpread } from '../search/measures';
import { safeMoves, solver, strandRate } from '../search/gravity';
import { BANDS, COLOUR_SHARE } from './bands';
import { gravityLevels } from './gravity.generated';
import { world1 } from './world1';

// Job 024, act 3: five gravity levels after the fifteen tap levels.
describe('gravity levels', () => {
  it('come last, as levels 16 to 20, the pull turning from level to level', () => {
    expect(world1.levels.slice(-5).map((l) => l.id)).toEqual(['16', '17', '18', '19', '20']);
    expect(world1.levels.slice(-5)).toEqual(gravityLevels);
    const pulls = gravityLevels.map((l) => l.start.gravity);
    expect(new Set(pulls).size).toBe(4);
    for (let i = 1; i < pulls.length; i++) expect(pulls[i]).not.toBe(pulls[i - 1]);
  });

  describe.each(gravityLevels.map((l) => [l.id, l] as const))('level %s', (_, level) => {
    const s = level.start;

    it('is a settled late-band board at 85 to 88 percent', () => {
      expect(() => validateState(s)).not.toThrow();
      expect(isSettled(s)).toBe(true);
      expect([s.cols, s.rows]).toEqual([BANDS.late.cols, BANDS.late.rows]);
      const fill = s.blocks.reduce((n, b) => n + b.shape.length, 0) / (s.rows * s.cols);
      expect(Math.round(100 * fill)).toBeGreaterThanOrEqual(85);
      expect(Math.round(100 * fill)).toBeLessThanOrEqual(88);
    });

    it('clears by its stored solution, one tap per piece', () => {
      let state = s;
      expect(level.solution).toHaveLength(s.blocks.length);
      for (const id of level.solution!) state = applyExit(state, id)!;
      expect(isSolved(state)).toBe(true);
    });

    it('mixes colours as the tap levels do: shares, spread 0.9, neighbours below a random deal', () => {
      for (const colour of ['amber', 'cyan', 'violet', 'mint'] as const) {
        const share = s.blocks.filter((b) => b.colour === colour).length / s.blocks.length;
        expect(share >= COLOUR_SHARE[0] && share <= COLOUR_SHARE[1], `${colour} ${share.toFixed(2)}`).toBe(true);
      }
      for (const c of colourSpread(s)) expect(c.ratio, c.colour).toBeGreaterThanOrEqual(0.9);
      const c = clumping(s);
      expect(c.share).toBeLessThan(c.random);
    });

    it('strands some random plays', () => {
      expect(strandRate(s, 200, 7).stranded).toBeGreaterThan(0);
    });

    it('job 025: the solver agrees with the stored solution and with a stranded board', () => {
      const solvable = solver();
      let state = s;
      for (const id of level.solution!) {
        expect(solvable(state)).toBe(true);
        state = applyExit(state, id)!;
      }
      // First legal tap every time: play on until the board clears or strands.
      let t = s;
      while (!isSolved(t) && !isStuck(t)) t = applyExit(t, t.blocks.find((b) => canExit(t, b.id))!.id)!;
      expect(solvable(t)).toBe(isSolved(t));
      const safe = safeMoves(s, level.solution!, solvable);
      expect(safe.choices).toBeGreaterThan(0);
      expect(safe.worst.safe).toBeGreaterThan(0);
    });
  });
});
