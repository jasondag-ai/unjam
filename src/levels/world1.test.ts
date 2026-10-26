import { describe, expect, it } from 'vitest';
import { boardToText, canExit, cellsOf, validateState, type State } from '../engine';
import { tapSolution } from '../search/search';
import { familyOf } from '../search/shapes';
import { BANDS, PIECE_SIZE, type Band } from './bands';
import { lateCandidates } from './candidates';
import { world1 } from './world1';

const levels = world1.levels;
const filled = (s: State) => s.blocks.reduce((n, b) => n + b.shape.length, 0);
const fill = (s: State) => filled(s) / (s.size * s.size);
const free = (s: State) => s.blocks.filter((b) => canExit(s, b.id)).length;
const families = (s: State) => new Set(s.blocks.map((b) => familyOf(b.shape)).filter(Boolean));
const ringCells = (s: State) =>
  s.blocks.flatMap(cellsOf).filter((c) => c.row === 0 || c.col === 0 || c.row === s.size - 1 || c.col === s.size - 1).length;
const within = (n: number, [lo, hi]: readonly [number, number]) => n >= lo && n <= hi;

/** Grid, piece count, fill, free pieces, and the job 003 mix where the band asks for it. */
function inBand(s: State, band: Band): void {
  const n = s.blocks.length;
  expect(s.size, 'grid').toBe(band.grid);
  expect(within(n, band.pieces), `${n} pieces`).toBe(true);
  expect(within(fill(s), band.fill), `fill ${fill(s).toFixed(2)}`).toBe(true);
  expect(within(free(s), band.free), `${free(s)} free`).toBe(true);
  if (band.mix) {
    expect(s.blocks.filter((b) => b.shape.length === 2).length, 'dominoes').toBeLessThanOrEqual(n / 3);
    expect(s.blocks.filter((b) => b.shape.length >= 3).length, '3+ cell pieces').toBeGreaterThanOrEqual(n / 2);
    expect(families(s).size, 'L/T/S/Z families').toBeGreaterThanOrEqual(3);
  }
}

describe('world1', () => {
  it('has 10 levels, numbered 1 to 10', () => {
    expect(levels.map((l) => l.id)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  it('every colour has a distinct glyph', () => {
    expect(new Set(Object.values(world1.glyphs)).size).toBe(Object.keys(world1.glyphs).length);
  });

  describe.each(levels.map((l) => [l.id, l.start] as const))('level %s', (_, s) => {
    it('is a valid board on the world rails, using every colour', () => {
      expect(() => validateState(s)).not.toThrow();
      expect(s.rails).toEqual(world1.rails);
      expect(new Set(s.blocks.map((b) => b.colour)).size).toBe(4);
    });

    it('holds every piece to 2 to 4 cells', () => {
      for (const b of s.blocks) expect(within(b.shape.length, PIECE_SIZE)).toBe(true);
    });

    it('clears by taps alone, one tap per piece', () => {
      expect(tapSolution(s)).toHaveLength(s.blocks.length);
    });
  });
});

describe('the curve', () => {
  it('gets thicker every level', () => {
    for (let i = 1; i < levels.length; i++) {
      expect(fill(levels[i]!.start)).toBeGreaterThan(fill(levels[i - 1]!.start));
    }
  });

  it('never drops a piece from one level to the next', () => {
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]!.start.blocks.length).toBeGreaterThanOrEqual(levels[i - 1]!.start.blocks.length);
    }
  });

  it('steps the grid up from 6x6 to 7x7 at level 6', () => {
    expect(levels.map((l) => l.start.size)).toEqual([6, 6, 6, 6, 6, 7, 7, 7, 7, 7]);
  });

  it('starts at the easy end of the early band', () => {
    const s = levels[0]!.start;
    expect(s.blocks.length).toBe(BANDS.early.pieces[0]);
    expect(fill(s)).toBeLessThan(0.33);
    expect(ringCells(s)).toBe(0);
  });

  it('ends at the top of the middle band', () => {
    const s = levels[9]!.start;
    expect(fill(s)).toBeGreaterThanOrEqual(0.62);
    expect(free(s)).toBe(1);
  });
});

describe.each(levels.slice(0, 5).map((l) => [l.id, l.start] as const))('early band: level %s', (_, s) => {
  it('sits in the early band', () => inBand(s, BANDS.early));

  it('leans to 2 and 3 cell pieces', () => {
    expect(s.blocks.filter((b) => b.shape.length <= 3).length).toBeGreaterThanOrEqual(s.blocks.length * 0.75);
  });

  it('is clustered in the middle, outer ring mostly empty', () => {
    expect(ringCells(s)).toBeLessThanOrEqual(5); // of 20 ring cells
  });
});

describe.each(levels.slice(5, 10).map((l) => [l.id, l.start] as const))('middle band: level %s', (_, s) => {
  it('sits in the middle band, with the job 003 mix', () => inBand(s, BANDS.middle));
});

describe('late-band candidates', () => {
  it('keeps the job 003 board, valid and clearable by taps, outside the level list', () => {
    const board = lateCandidates.find((l) => l.id === 'job-003')!.start;
    expect(() => validateState(board)).not.toThrow();
    expect(tapSolution(board)).toHaveLength(board.blocks.length);
    expect(boardToText(board).split('\n')[1]).toBe('m . A A . . . c');
    expect(levels.some((l) => l.start === board)).toBe(false);
  });
});
