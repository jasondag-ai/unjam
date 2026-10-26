import { describe, expect, it } from 'vitest';
import { applyExit, boardToText, canExit, isSolved, validateState, type State } from '../engine';
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
        'm . A A B C C c',
        'm . D D B E . c',
        'm . F F E E . c',
        'm . . . E G H c',
        'm I . J K G H c',
        'm I J J K L L c',
        '+ v v v v v v +',
      ].join('\n'),
    );
  });

  it('is packed: 12 to 16 pieces filling 60 to 75 percent of the cells', () => {
    expect(s.blocks.length).toBeGreaterThanOrEqual(12);
    expect(s.blocks.length).toBeLessThanOrEqual(16);
    expect(filled / (s.size * s.size)).toBeGreaterThanOrEqual(0.6);
    expect(filled / (s.size * s.size)).toBeLessThanOrEqual(0.75);
  });

  it('has pieces that are not straight bars, and every colour', () => {
    const bent = s.blocks.filter((b) => new Set(b.shape.map((c) => c.row)).size > 1 && new Set(b.shape.map((c) => c.col)).size > 1);
    expect(bent.length).toBeGreaterThanOrEqual(2);
    expect(new Set(s.blocks.map((b) => b.colour)).size).toBe(4);
  });

  it('lets at most two pieces leave at the start', () => {
    expect(s.blocks.filter((b) => canExit(s, b.id)).length).toBeLessThanOrEqual(2);
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
