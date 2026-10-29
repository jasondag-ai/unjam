import { describe, expect, it } from 'vitest';
import { applyExit, canExit, isSettled, isSolved, isStuck, validateState } from '../engine';
import { makeRandom } from '../search/search';
import { BANDS } from './bands';
import { gravityLevels } from './gravity.generated';
import { world1 } from './world1';

// Job 022 (spike): gravity levels, after the main list.
describe('gravity levels', () => {
  it('come last, as levels 24 to 26, each pulling toward a different rail', () => {
    expect(world1.levels.slice(-3).map((l) => l.id)).toEqual(['24', '25', '26']);
    expect(new Set(gravityLevels.map((l) => l.start.gravity)).size).toBe(3);
  });

  describe.each(gravityLevels.map((l) => [l.id, l] as const))('level %s', (_, level) => {
    const s = level.start;

    it('is a settled board at middle-band size and density', () => {
      expect(() => validateState(s)).not.toThrow();
      expect(isSettled(s)).toBe(true);
      expect([s.cols, s.rows]).toEqual([BANDS.middle.cols, BANDS.middle.rows]);
      const fill = s.blocks.reduce((n, b) => n + b.shape.length, 0) / (s.rows * s.cols);
      expect(fill).toBeGreaterThanOrEqual(BANDS.middle.fill[0]);
      expect(fill).toBeLessThanOrEqual(BANDS.middle.fill[1]);
    });

    it('clears by its stored solution, one tap per piece', () => {
      let state = s;
      expect(level.solution).toHaveLength(s.blocks.length);
      for (const id of level.solution!) state = applyExit(state, id)!;
      expect(isSolved(state)).toBe(true);
    });

    it('can be stranded by taps alone: some order of free taps leaves it stuck', () => {
      let stranded = false;
      for (let seed = 1; seed < 400 && !stranded; seed++) {
        let state = s;
        const rand = makeRandom(seed);
        while (!isSolved(state) && !isStuck(state)) {
          const free = state.blocks.filter((b) => canExit(state, b.id));
          state = applyExit(state, free[Math.floor(rand() * free.length)]!.id)!;
        }
        stranded = isStuck(state);
      }
      expect(stranded).toBe(true);
    });
  });
});
