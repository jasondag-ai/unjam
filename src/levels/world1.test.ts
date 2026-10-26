import { describe, expect, it } from 'vitest';
import { applyExit, boardToText, canExit, isSolved, validateState, type State } from '../engine';
import { world1 } from './world1';

/** Depth-first search over exits only: can the board be cleared by tapping alone? */
function tapSolution(state: State): string[] | null {
  if (isSolved(state)) return [];
  for (const block of state.blocks) {
    const next = applyExit(state, block.id);
    if (!next) continue;
    const rest = tapSolution(next);
    if (rest) return [block.id, ...rest];
  }
  return null;
}

describe('world1', () => {
  const level = world1.levels[0]!;

  it('level 1 is a valid board', () => {
    expect(() => validateState(level.start)).not.toThrow();
  });

  it('level 1 matches its picture', () => {
    expect(boardToText(level.start)).toBe(
      ['+-v-a---a-m-+', '| A A . B . c', '| C . D B . |', 'c C E D F F |', '| G E . . H |', 'c G . I I H c', '+-----m-----+'].join('\n'),
    );
  });

  it('level 1 is cleared by taps alone, one tap per block', () => {
    const solution = tapSolution(level.start);
    expect(solution).not.toBeNull();
    expect(solution).toHaveLength(level.start.blocks.length);
  });

  it('level 1 starts with exactly one block free to leave', () => {
    expect(level.start.blocks.filter((b) => canExit(level.start, b.id)).map((b) => b.id)).toEqual(['B']);
  });

  it('every colour has a distinct glyph', () => {
    expect(new Set(Object.values(world1.glyphs)).size).toBe(Object.keys(world1.glyphs).length);
  });
});
