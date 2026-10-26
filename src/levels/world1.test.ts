import { describe, expect, it } from 'vitest';
import { boardToText, canExit, cellsOf, validateState, type State } from '../engine';
import { tapSolution } from '../search/search';
import { familyOf } from '../search/shapes';
import { BANDS, type Band } from './bands';
import { world1 } from './world1';

const levels = world1.levels;
const filled = (s: State) => s.blocks.reduce((n, b) => n + b.shape.length, 0);
const fill = (s: State) => filled(s) / (s.size * s.size);
const free = (s: State) => s.blocks.filter((b) => canExit(s, b.id)).length;
const families = (s: State) => new Set(s.blocks.map((b) => familyOf(b.shape)).filter(Boolean));
const ringCells = (s: State) =>
  s.blocks.flatMap(cellsOf).filter((c) => c.row === 0 || c.col === 0 || c.row === s.size - 1 || c.col === s.size - 1).length;
const within = (n: number, [lo, hi]: readonly [number, number]) => n >= lo && n <= hi;

function inBand(s: State, band: Band): void {
  expect(within(s.blocks.length, band.pieces), `${s.blocks.length} pieces`).toBe(true);
  expect(within(fill(s), band.fill), `fill ${fill(s).toFixed(2)}`).toBe(true);
  expect(within(free(s), band.free), `${free(s)} free`).toBe(true);
}

describe('world1', () => {
  it('has 10 levels, numbered 1 to 10', () => {
    expect(levels.map((l) => l.id)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  it('every colour has a distinct glyph', () => {
    expect(new Set(Object.values(world1.glyphs)).size).toBe(Object.keys(world1.glyphs).length);
  });

  describe.each(levels.map((l) => [l.id, l.start] as const))('level %s', (_, s) => {
    it('is a valid 6x6 board on the world rails, using every colour', () => {
      expect(() => validateState(s)).not.toThrow();
      expect(s.size).toBe(6);
      expect(s.rails).toEqual(world1.rails);
      expect(new Set(s.blocks.map((b) => b.colour)).size).toBe(4);
    });

    it('clears by taps alone, one tap per piece', () => {
      expect(tapSolution(s)).toHaveLength(s.blocks.length);
    });
  });
});

describe('the density curve', () => {
  it('gets thicker every level', () => {
    for (let i = 1; i < levels.length; i++) {
      expect(fill(levels[i]!.start)).toBeGreaterThan(fill(levels[i - 1]!.start));
    }
  });

  it('never drops a piece from one generated level to the next', () => {
    for (let i = 1; i < 9; i++) {
      expect(levels[i]!.start.blocks.length).toBeGreaterThanOrEqual(levels[i - 1]!.start.blocks.length);
    }
  });

  it('starts at the easy end of the early band', () => {
    const s = levels[0]!.start;
    expect(s.blocks.length).toBe(BANDS.early.pieces[0]);
    expect(fill(s)).toBeLessThan(0.33);
    expect(ringCells(s)).toBe(0);
  });
});

describe.each(levels.slice(0, 5).map((l) => [l.id, l.start] as const))('early band: level %s', (_, s) => {
  it('sits in the early band', () => inBand(s, BANDS.early));

  it('is mostly 2 and 3 cell pieces', () => {
    expect(s.blocks.filter((b) => b.shape.length <= 3).length).toBeGreaterThanOrEqual(s.blocks.length * 0.75);
  });

  it('is clustered in the middle, outer ring mostly empty', () => {
    expect(ringCells(s)).toBeLessThanOrEqual(5); // of 20 ring cells
  });
});

describe.each(levels.slice(5, 9).map((l) => [l.id, l.start] as const))('middle band: level %s', (_, s) => {
  it('sits in the middle band', () => inBand(s, BANDS.middle));

  it('brings in the L, T, S and Z shapes', () => {
    expect(families(s).size).toBeGreaterThanOrEqual(1);
  });
});

describe('level 10, the job 003 board', () => {
  const s = levels[9]!.start;

  it('matches its picture', () => {
    expect(boardToText(s)).toBe(
      [
        '+ a a a a a a +',
        'm . A A . . . c',
        'm . B A C C D c',
        'm B B C C E D c',
        'm F F F . E D c',
        'm . F G G E E c',
        'm H H G G . . c',
        '+ v v v v v v +',
      ].join('\n'),
    );
  });

  it('keeps the job 003 mix: 8 to 10 pieces, 60 to 75 percent, real shapes', () => {
    const n = s.blocks.length;
    expect(within(n, [8, 10])).toBe(true);
    expect(within(fill(s), [0.6, 0.75])).toBe(true);
    expect(s.blocks.filter((b) => b.shape.length === 2).length).toBeLessThanOrEqual(n / 3);
    expect(s.blocks.filter((b) => b.shape.length >= 3).length).toBeGreaterThanOrEqual(n / 2);
    expect(families(s).size).toBeGreaterThanOrEqual(3);
    expect(free(s)).toBeLessThanOrEqual(2);
  });
});
