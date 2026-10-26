import { describe, expect, it } from 'vitest';
import { applyExit, boardToText, canExit, isSolved, validateState, type Cell, type State } from '../engine';
import { world1 } from './world1';

/**
 * Clear the board by taps alone. Exits only ever free cells, so a block
 * that can leave never loses that by another leaving first: taking any free
 * block each step is enough, and failing means no tap order works.
 */
function tapSolution(state: State): string[] | null {
  const taps: string[] = [];
  let s = state;
  while (!isSolved(s)) {
    const free = s.blocks.find((b) => canExit(s, b.id));
    if (!free) return null;
    taps.push(free.id);
    s = applyExit(s, free.id)!;
  }
  return taps;
}

const key = (cells: readonly Cell[]) => {
  const r0 = Math.min(...cells.map((c) => c.row));
  const c0 = Math.min(...cells.map((c) => c.col));
  return cells.map((c) => `${c.row - r0},${c.col - c0}`).sort().join(' ');
};
const turns = (cells: readonly Cell[]) => {
  const out = [cells];
  for (let i = 0; i < 3; i++) out.push(out[i]!.map((c) => ({ row: c.col, col: -c.row })));
  return out.map(key);
};
const parse = (rows: string[]) => rows.flatMap((line, r) => [...line].flatMap((ch, c) => (ch === '#' ? [{ row: r, col: c }] : [])));
const FAMILIES: Record<string, string[][]> = {
  L: [['#.', '##'], ['#.', '#.', '##'], ['.#', '.#', '##']],
  T: [['###', '.#.']],
  S: [['.##', '##.']],
  Z: [['##.', '.##']],
};
/** L, T, S or Z (any rotation; J counts as L), or null for bars, squares and dominoes. */
function family(shape: readonly Cell[]): string | null {
  const k = key(shape);
  for (const [name, shapes] of Object.entries(FAMILIES)) {
    if (shapes.some((rows) => turns(parse(rows)).includes(k))) return name;
  }
  return null;
}

describe('world1 level 1', () => {
  const level = world1.levels[0]!;
  const s = level.start;
  const filled = s.blocks.reduce((n, b) => n + b.shape.length, 0);

  it('is a valid 6x6 board on the world rails', () => {
    expect(() => validateState(s)).not.toThrow();
    expect(s.size).toBe(6);
    expect(s.rails).toEqual(world1.rails);
  });

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

  it('is packed: 8 to 10 pieces filling 60 to 75 percent of the cells', () => {
    expect(s.blocks.length).toBeGreaterThanOrEqual(8);
    expect(s.blocks.length).toBeLessThanOrEqual(10);
    expect(filled / (s.size * s.size)).toBeGreaterThanOrEqual(0.6);
    expect(filled / (s.size * s.size)).toBeLessThanOrEqual(0.75);
  });

  it('is a mix of real shapes, not rows of pairs', () => {
    const n = s.blocks.length;
    expect(s.blocks.filter((b) => b.shape.length === 2).length).toBeLessThanOrEqual(n / 3);
    expect(s.blocks.filter((b) => b.shape.length >= 3).length).toBeGreaterThanOrEqual(n / 2);
    const families = new Set(s.blocks.map((b) => family(b.shape)).filter(Boolean));
    expect(families.size).toBeGreaterThanOrEqual(3);
  });

  it('uses every colour', () => {
    expect(new Set(s.blocks.map((b) => b.colour)).size).toBe(4);
  });

  it('lets at most two pieces leave at the start', () => {
    expect(s.blocks.filter((b) => canExit(s, b.id)).length).toBeLessThanOrEqual(2);
  });

  it('classifies shapes', () => {
    expect(family(parse(['###', '.#.']))).toBe('T');
    expect(family(parse(['#', '#', '#']))).toBeNull();
    expect(family(parse(['.#', '.#', '##']))).toBe('L');
  });

  it('clears by taps alone, one tap per piece', () => {
    const taps = tapSolution(s);
    expect(taps).not.toBeNull();
    expect(taps).toHaveLength(s.blocks.length);
  });

  it('every colour has a distinct glyph', () => {
    expect(new Set(Object.values(world1.glyphs)).size).toBe(Object.keys(world1.glyphs).length);
  });
});
