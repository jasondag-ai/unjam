import { describe, expect, it } from 'vitest';
import { canExit, cellsOf, validateState, type Rails } from '../engine';
import { searchBoard, tapSolution, type SearchParams } from './search';
import { familyOf, kindOf, SHAPES } from './shapes';

const RAILS: Rails = { top: 'amber', right: 'cyan', bottom: 'violet', left: 'mint' };
const params: SearchParams = {
  size: 6, pieces: 6, cells: 14, pieceSize: [2, 3], minFamilies: 1, free: [2, 3], ringMax: 2, tries: 60, seed: 7,
};

describe('shape catalogue', () => {
  it('knows every rotation of its pieces', () => {
    expect(SHAPES.T4).toHaveLength(4);
    expect(SHAPES.S4).toHaveLength(2);
    expect(SHAPES.O4).toHaveLength(1);
    for (const shape of SHAPES.J4) expect(familyOf(shape)).toBe('L');
  });

  it('names placed shapes and their families', () => {
    expect(kindOf([{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }])).toBe('I3');
    expect(familyOf([{ row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }])).toBe('T');
    expect(familyOf([{ row: 0, col: 0 }, { row: 0, col: 1 }])).toBeNull();
  });
});

describe('searchBoard', () => {
  const result = searchBoard(params, RAILS);

  it('finds a board that meets every parameter', () => {
    expect(result).not.toBeNull();
    const s = result!.state;
    expect(() => validateState(s)).not.toThrow();
    expect(s.blocks).toHaveLength(params.pieces);
    expect(s.blocks.reduce((n, b) => n + b.shape.length, 0)).toBe(params.cells);
    for (const b of s.blocks) expect(b.shape.length).toBeGreaterThanOrEqual(2);
    for (const b of s.blocks) expect(b.shape.length).toBeLessThanOrEqual(3);
    const free = s.blocks.filter((b) => canExit(s, b.id)).length;
    expect(free).toBeGreaterThanOrEqual(2);
    expect(free).toBeLessThanOrEqual(3);
    const ring = s.blocks.flatMap(cellsOf).filter((c) => c.row === 0 || c.col === 0 || c.row === 5 || c.col === 5);
    expect(ring.length).toBeLessThanOrEqual(params.ringMax);
    expect(s.blocks.some((b) => familyOf(b.shape))).toBe(true);
  });

  it('clears by taps alone, by construction', () => {
    expect(tapSolution(result!.state)).toHaveLength(params.pieces);
  });

  it('gives the same board for the same seed', () => {
    expect(searchBoard(params, RAILS)).toEqual(result);
  });

  it('gives up cleanly when the numbers cannot fit', () => {
    expect(searchBoard({ ...params, pieces: 3, cells: 14 }, RAILS)).toBeNull();
  });
});
