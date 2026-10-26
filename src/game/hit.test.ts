import { describe, expect, it } from 'vitest';
import type { Block } from '../engine';
import { hitTest, type Target } from './hit';
import { blockCellRects, blockCentre, blockOutline, computeLayout, type Rect } from './layout';

const one = (id: string, rect: Rect): Target => ({ id, rects: [rect], centre: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 } });

// 60 px cells. Bar A spans x 0..120, B is x 124..180 with a 4 px gap.
const A = one('A', { x: 0, y: 0, w: 120, h: 56 });
const B = one('B', { x: 124, y: 0, w: 56, h: 56 });

describe('hitTest', () => {
  it('a tap on a block is that block, even near a neighbour centre', () => {
    expect(hitTest([A, B], 119, 28, 60)).toBe('A');
    expect(hitTest([A, B], 125, 28, 60)).toBe('B');
  });

  it('a tap in the gap between two blocks goes to the nearer centre', () => {
    // Gap x = 122: A centre is 62 away, B centre is 30 away.
    expect(hitTest([A, B], 122, 28, 60)).toBe('B');
  });

  it('a tap in free space next to a block still hits it', () => {
    expect(hitTest([A, B], 60, 80, 60)).toBe('A');
  });

  it('a tap far from every block hits nothing', () => {
    expect(hitTest([A, B], 60, 200, 60)).toBeNull();
  });

  it('a small block still gets a 44 px target', () => {
    const tiny = one('T', { x: 100, y: 100, w: 20, h: 20 });
    // 12 px outside its edge: inside the 44 px target even with 8 px cells.
    expect(hitTest([tiny], 132, 110, 8)).toBe('T');
    expect(hitTest([tiny], 133, 110, 8)).toBeNull();
  });

  it('a tap in the empty corner of an L goes to the nearer centre', () => {
    const layout = computeLayout(400, 400, 1, 6, 0, 0);
    const L: Block = { id: 'L', colour: 'cyan', anchor: { row: 0, col: 0 }, shape: [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 1, col: 1 }] };
    const N: Block = { id: 'N', colour: 'mint', anchor: { row: 0, col: 2 }, shape: [{ row: 0, col: 0 }, { row: 1, col: 0 }] };
    const targets = [L, N].map((b) => ({ id: b.id, rects: blockCellRects(layout, b), centre: blockCentre(layout, b) }));
    const { board, cell } = layout;
    const at = (col: number, row: number) => [board.x + col * cell, board.y + row * cell] as const;
    // Middle of the empty cell (row 0, col 1): L's centre is nearer than N's.
    expect(hitTest(targets, ...at(1.5, 0.5), cell)).toBe('L');
    // Near N's edge in that cell: only N is within reach.
    expect(hitTest(targets, ...at(1.9, 0.5), cell)).toBe('N');
  });
});

describe('blockOutline', () => {
  const layout = computeLayout(400, 400, 1, 6, 0, 0);
  const { board, cell, inset } = layout;

  it('traces an L clockwise with its inner corner inset too', () => {
    const L: Block = { id: 'L', colour: 'cyan', anchor: { row: 0, col: 0 }, shape: [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 1, col: 1 }] };
    const at = (col: number, row: number, dx: number, dy: number) => ({ x: board.x + col * cell + dx * inset, y: board.y + row * cell + dy * inset });
    expect(blockOutline(layout, L)).toEqual([
      at(0, 0, 1, 1),
      at(1, 0, -1, 1),
      at(1, 1, -1, 1), // inner corner
      at(2, 1, -1, 1),
      at(2, 2, -1, -1),
      at(0, 2, 1, -1),
    ]);
  });

  it('gives a bar four corners', () => {
    const bar: Block = { id: 'B', colour: 'cyan', anchor: { row: 2, col: 1 }, shape: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }] };
    expect(blockOutline(layout, bar)).toHaveLength(4);
  });
});
