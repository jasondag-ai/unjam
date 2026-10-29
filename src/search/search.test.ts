import { describe, expect, it } from 'vitest';
import { canExit, cellsOf, validateState, type Rails } from '../engine';
import { colourSpread, splits } from './measures';
import { colourQuota, makeRandom, searchBoard, splitPieces, tapSolution, type SearchParams } from './search';
import { familyOf, isThick, KINDS, kindOf, notchOf, shapeClass, SHAPES } from './shapes';

const RAILS: Rails = { top: 'amber', right: 'cyan', bottom: 'violet', left: 'mint' };
const params: SearchParams = {
  rows: 7,
  cols: 6,
  pieces: 8,
  cells: 17,
  kinds: ['M', 'D', 'I3', 'L3', 'I4', 'L4'],
  groups: [],
  sizeWeights: { 1: 1, 2: 4, 3: 3, 4: 1 },
  smallShare: 0.6,
  colourShare: [0.2, 0.3],
  free: [2, 3],
  ringMax: 3,
  centrePull: 1,
  colourMix: 0,
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

  it('gives every kind its own shapes, in every rotation (job 019)', () => {
    const seen = new Map<string, string>();
    for (const kind of KINDS) {
      for (const shape of SHAPES[kind]) {
        const k = shape.map((c) => `${c.row},${c.col}`).join(' ');
        expect(seen.get(k), `${kind} repeats ${seen.get(k)}`).toBeUndefined();
        seen.set(k, kind);
      }
    }
  });

  it('draws every piece but the square as one-cell-wide strokes (job 019)', () => {
    for (const kind of KINDS) for (const shape of SHAPES[kind]) expect(isThick(shape), kind).toBe(kind === 'O4');
  });

  it('never touches itself only at a corner, so the outline traces as one ring', () => {
    for (const kind of KINDS) {
      for (const shape of SHAPES[kind]) {
        const has = (r: number, c: number) => shape.some((x) => x.row === r && x.col === c);
        for (const { row: r, col: c } of shape) {
          expect(has(r + 1, c + 1) && !has(r, c + 1) && !has(r + 1, c), kind).toBe(false);
          expect(has(r + 1, c - 1) && !has(r, c - 1) && !has(r + 1, c), kind).toBe(false);
        }
      }
    }
  });

  it('gives U\'s a notch and nothing else (job 019)', () => {
    for (const kind of KINDS) {
      for (const shape of SHAPES[kind]) expect(notchOf(shape).length > 0, kind).toBe(familyOf(shape) === 'U');
    }
    expect(notchOf(SHAPES.U5[0]!)).toHaveLength(1);
    expect(notchOf(SHAPES.U6[0]!)).toHaveLength(2);
    expect(notchOf(SHAPES.U7[0]!)).toHaveLength(2);
  });

  it('sorts shapes into singles, convoluted forms and plain bars and L\'s', () => {
    expect(shapeClass(SHAPES.M[0]!)).toBe('single');
    for (const k of ['U5', 'S7', 'Z5', 'T4', 'X5', 'W7'] as const) expect(shapeClass(SHAPES[k][0]!), k).toBe('convoluted');
    for (const k of ['D', 'I5', 'L3', 'L7'] as const) expect(shapeClass(SHAPES[k][0]!), k).toBe('plain');
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

  it('mixes colours on request, and the board still clears by taps', () => {
    const mixed = searchBoard(
      { ...params, rows: 9, cols: 8, pieces: 20, cells: 50, kinds: ['D', 'I3', 'L3', 'I4', 'L4', 'I5'], sizeWeights: { 2: 5, 3: 4, 4: 1, 5: 0.5 }, free: [1, 20], ringMax: 30, centrePull: 0.2, colourMix: 0.9, tries: 20 },
      RAILS,
    );
    expect(mixed).not.toBeNull();
    for (const c of colourSpread(mixed!.state)) expect(c.ratio, c.colour).toBeGreaterThanOrEqual(0.9);
    expect(tapSolution(mixed!.state)).toHaveLength(20);
  });

  it('gives up cleanly when the numbers cannot fit', () => {
    expect(searchBoard({ ...params, pieces: 3, cells: 17 }, RAILS)).toBeNull(); // too few pieces for the cells
    expect(searchBoard({ ...params, pieces: 9, cells: 18 }, RAILS)).toBeNull(); // 9 cannot split 20-30% four ways
  });
});

describe('splitPieces (job 021)', () => {
  const board = searchBoard(params, RAILS)!.state;

  it('splits pieces so one part must go first, and the board still clears by taps', () => {
    const { state, split } = splitPieces(board, 1, makeRandom(9));
    expect(split).toBe(1);
    expect(() => validateState(state)).not.toThrow();
    expect(splits(state)).toHaveLength(1);
    expect(splits(state).every((x) => x.forced && !x.locked)).toBe(true);
    expect(tapSolution(state)).not.toBeNull();
    // Only colours change: the cells are the board's own.
    expect(state.blocks.map((b) => [b.id, b.colour, b.anchor, b.shape])).toEqual(board.blocks.map((b) => [b.id, b.colour, b.anchor, b.shape]));
  });

  it('asked for a split through searchBoard, returns the same board, split', () => {
    const result = searchBoard({ ...params, splits: 1 }, RAILS)!;
    expect(result.split).toBe(1);
    expect(result.state.blocks.map((b) => b.shape)).toEqual(board.blocks.map((b) => b.shape));
  });
});
