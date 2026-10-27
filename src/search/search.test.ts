import { describe, expect, it } from 'vitest';
import { canExit, cellsOf, validateState, type Rails } from '../engine';
import { colourQuota, makeRandom, searchBoard, tapSolution, type SearchParams } from './search';
import { familyOf, kindOf, SHAPES } from './shapes';

const RAILS: Rails = { top: 'amber', right: 'cyan', bottom: 'violet', left: 'mint' };
const params: SearchParams = {
  rows: 7,
  cols: 6,
  pieces: 8,
  cells: 17,
  kinds: ['M', 'D', 'I3', 'L3', 'I4', 'L4'],
  sizeWeights: { 1: 1, 2: 4, 3: 3, 4: 1 },
  smallShare: 0.6,
  colourShare: [0.2, 0.3],
  free: [2, 3],
  ringMax: 3,
  centrePull: 1,
  tries: 60,
  seed: 7,
};

describe('shape catalogue', () => {
  it('knows every rotation of its pieces', () => {
    expect(SHAPES.M).toHaveLength(1);
    expect(SHAPES.T4).toHaveLength(4);
    expect(SHAPES.S4).toHaveLength(2);
    expect(SHAPES.I5).toHaveLength(2);
    expect(SHAPES.L5).toHaveLength(4);
    for (const shape of SHAPES.J5) expect(familyOf(shape)).toBe('L');
  });

  it('names placed shapes and their families', () => {
    expect(kindOf([{ row: 0, col: 0 }])).toBe('M');
    expect(kindOf([{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }])).toBe('I3');
    expect(familyOf([{ row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }])).toBe('T');
    expect(familyOf([{ row: 0, col: 0 }, { row: 0, col: 1 }])).toBeNull();
  });
});

describe('colourQuota', () => {
  const quota = (pieces: number) => colourQuota({ pieces, colourShare: [0.2, 0.3] }, makeRandom(1));

  it('gives every colour 20 to 30 percent of the pieces', () => {
    for (const pieces of [8, 10, 18, 22, 26, 40]) {
      const q = quota(pieces)!;
      expect([...q.values()].reduce((a, b) => a + b, 0)).toBe(pieces);
      for (const n of q.values()) {
        expect(n / pieces).toBeGreaterThanOrEqual(0.2);
        expect(n / pieces).toBeLessThanOrEqual(0.3);
      }
    }
  });

  it('is impossible for 6, 7, 9 and 11 pieces', () => {
    for (const pieces of [6, 7, 9, 11]) expect(quota(pieces)).toBeNull();
  });
});

describe('searchBoard', () => {
  const result = searchBoard(params, RAILS);

  it('finds a portrait board that meets every parameter', () => {
    expect(result).not.toBeNull();
    const s = result!.state;
    expect(() => validateState(s)).not.toThrow();
    expect([s.cols, s.rows]).toEqual([6, 7]);
    expect(s.blocks).toHaveLength(params.pieces);
    expect(s.blocks.reduce((n, b) => n + b.shape.length, 0)).toBe(params.cells);
    for (const b of s.blocks) expect(params.kinds).toContain(kindOf(b.shape));
    expect(s.blocks.filter((b) => b.shape.length === 2 || b.shape.length === 3).length).toBeGreaterThanOrEqual(0.6 * params.pieces);
    const free = s.blocks.filter((b) => canExit(s, b.id)).length;
    expect(free).toBeGreaterThanOrEqual(2);
    expect(free).toBeLessThanOrEqual(3);
    const ring = s.blocks.flatMap(cellsOf).filter((c) => c.row === 0 || c.col === 0 || c.row === 6 || c.col === 5);
    expect(ring.length).toBeLessThanOrEqual(params.ringMax);
    for (const colour of ['amber', 'cyan', 'violet', 'mint'] as const) {
      expect(s.blocks.filter((b) => b.colour === colour)).toHaveLength(2);
    }
  });

  it('clears by taps alone, by construction', () => {
    expect(tapSolution(result!.state)).toHaveLength(params.pieces);
  });

  it('gives the same board for the same seed', () => {
    expect(searchBoard(params, RAILS)).toEqual(result);
  });

  it('works on a big middle-band board', () => {
    const big = searchBoard(
      { ...params, rows: 9, cols: 8, pieces: 20, cells: 50, kinds: ['D', 'I3', 'L3', 'I4', 'L4', 'I5'], sizeWeights: { 2: 5, 3: 4, 4: 1, 5: 0.5 }, free: [1, 20], ringMax: 30, centrePull: 0.2, tries: 5 },
      RAILS,
    );
    expect(big).not.toBeNull();
    expect(tapSolution(big!.state)).toHaveLength(20);
  });

  it('gives up cleanly when the numbers cannot fit', () => {
    expect(searchBoard({ ...params, pieces: 3, cells: 17 }, RAILS)).toBeNull(); // too few pieces for the cells
    expect(searchBoard({ ...params, pieces: 9, cells: 18 }, RAILS)).toBeNull(); // 9 cannot split 20-30% four ways
  });
});
