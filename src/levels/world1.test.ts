import { describe, expect, it } from 'vitest';
import { boardToText, canExit, cellsOf, validateState, type Block, type State } from '../engine';
import { computeLayout } from '../game/layout';
import { tapSolution } from '../search/search';
import { BANDS, COLOUR_SHARE, type Band } from './bands';
import { lateCandidates } from './candidates';
import { world1 } from './world1';

const levels = world1.levels;
const filled = (s: State) => s.blocks.reduce((n, b) => n + b.shape.length, 0);
const fill = (s: State) => filled(s) / (s.rows * s.cols);
const free = (s: State) => s.blocks.filter((b) => canExit(s, b.id)).length;
const small = (s: State) => s.blocks.filter((b) => b.shape.length === 2 || b.shape.length === 3).length;
const ringCells = (s: State) =>
  s.blocks.flatMap(cellsOf).filter((c) => c.row === 0 || c.col === 0 || c.row === s.rows - 1 || c.col === s.cols - 1).length;
const within = (n: number, [lo, hi]: readonly [number, number]) => n >= lo && n <= hi;

/** Grid, piece count, fill, free pieces where the band sets them, and "mostly 2 and 3 cells". */
function inBand(s: State, band: Band): void {
  expect([s.cols, s.rows], 'grid').toEqual([band.cols, band.rows]);
  expect(within(s.blocks.length, band.pieces), `${s.blocks.length} pieces`).toBe(true);
  expect(within(fill(s), band.fill), `fill ${fill(s).toFixed(2)}`).toBe(true);
  if (band.free) expect(within(free(s), band.free), `${free(s)} free`).toBe(true);
  expect(small(s), 'mostly 2 and 3 cell pieces').toBeGreaterThanOrEqual(0.6 * s.blocks.length);
}

describe('world1', () => {
  it('has 10 levels, numbered 1 to 10', () => {
    expect(levels.map((l) => l.id)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  it('every colour has a distinct glyph', () => {
    expect(new Set(Object.values(world1.glyphs)).size).toBe(Object.keys(world1.glyphs).length);
  });

  describe.each(levels.map((l) => [l.id, l.start] as const))('level %s', (_, s) => {
    it('is a valid portrait board on the world rails', () => {
      expect(() => validateState(s)).not.toThrow();
      expect(s.rails).toEqual(world1.rails);
      expect(s.rows).toBeGreaterThan(s.cols);
    });

    it('gives each of the four colours 20 to 30 percent of the pieces', () => {
      for (const colour of ['amber', 'cyan', 'violet', 'mint'] as const) {
        const share = s.blocks.filter((b) => b.colour === colour).length / s.blocks.length;
        expect(within(share, COLOUR_SHARE), `${colour} ${share.toFixed(2)}`).toBe(true);
      }
    });

    it('holds every piece to 1 to 5 cells', () => {
      for (const b of s.blocks) expect(within(b.shape.length, [1, 5])).toBe(true);
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

  it('is 6 wide by 7 tall for levels 1 to 5, 8 by 9 for 6 to 10', () => {
    expect(levels.map((l) => `${l.start.cols}x${l.start.rows}`)).toEqual([
      '6x7', '6x7', '6x7', '6x7', '6x7', '8x9', '8x9', '8x9', '8x9', '8x9',
    ]);
  });

  it('starts at the easy end and ends at the top of the middle band', () => {
    expect(fill(levels[0]!.start)).toBeLessThan(0.37);
    expect(ringCells(levels[0]!.start)).toBe(0);
    expect(levels[9]!.start.blocks).toHaveLength(BANDS.middle.pieces[1]);
    expect(fill(levels[9]!.start)).toBeGreaterThanOrEqual(0.78);
  });
});

describe.each(levels.slice(0, 5).map((l) => [l.id, l.start] as const))('early band: level %s', (_, s) => {
  it('sits in the early band', () => inBand(s, BANDS.early));

  it('is clustered in the middle, outer ring mostly empty', () => {
    expect(ringCells(s)).toBeLessThanOrEqual(5); // of 22 ring cells
  });
});

describe.each(levels.slice(5, 10).map((l) => [l.id, l.start] as const))('middle band: level %s', (_, s) => {
  it('sits in the middle band', () => inBand(s, BANDS.middle));

  it('has no single-cell pieces', () => {
    expect(s.blocks.every((b) => b.shape.length >= 2)).toBe(true);
  });
});

describe('middle band as a whole', () => {
  it('has some 4 and 5 cell pieces', () => {
    const big = levels.slice(5).flatMap((l) => l.start.blocks).filter((b) => b.shape.length >= 4);
    expect(big.length).toBeGreaterThanOrEqual(3);
  });
});

describe('rule 2 on a 375 px phone', () => {
  // HUD bands as on the page: header about 68 px, footer about 100 px.
  const phones = [[375, 667], [375, 812]] as const;
  const cellOn = (w: number, h: number, rows: number, cols: number) => computeLayout(w, h, 3, rows, cols, 68, 100).cell;
  const longest = (b: Block) => {
    const rows = b.shape.map((c) => c.row);
    const cols = b.shape.map((c) => c.col);
    return Math.max(Math.max(...rows) - Math.min(...rows), Math.max(...cols) - Math.min(...cols)) + 1;
  };

  it('keeps cells at 28 px or more in every band', () => {
    for (const [w, h] of phones) {
      for (const band of Object.values(BANDS)) expect(cellOn(w, h, band.rows, band.cols), band.name).toBeGreaterThanOrEqual(28);
    }
  });

  it('gives every piece a touch target of at least 44 px along its longest side', () => {
    for (const [w, h] of phones) {
      for (const { start: s } of levels) {
        const cell = cellOn(w, h, s.rows, s.cols);
        for (const b of s.blocks) expect(longest(b) * cell, `${b.id} on ${w}x${h}`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it('allows single-cell pieces only where a cell is 44 px or larger', () => {
    for (const [w, h] of phones) {
      for (const { start: s } of levels) {
        if (s.blocks.some((b) => b.shape.length === 1)) expect(cellOn(w, h, s.rows, s.cols)).toBeGreaterThanOrEqual(44);
      }
    }
  });
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
