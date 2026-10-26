import { describe, expect, it } from 'vitest';
import { hitTest, type Target } from './hit';

// 60 px cells. Bar A spans x 0..120, dot B is x 124..180 with a 4 px gap.
const A: Target = { id: 'A', rect: { x: 0, y: 0, w: 120, h: 56 } };
const B: Target = { id: 'B', rect: { x: 124, y: 0, w: 56, h: 56 } };

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
    const tiny: Target = { id: 'T', rect: { x: 100, y: 100, w: 20, h: 20 } };
    // 12 px outside its edge: inside the 44 px target even with 8 px cells.
    expect(hitTest([tiny], 132, 110, 8)).toBe('T');
    expect(hitTest([tiny], 133, 110, 8)).toBeNull();
  });
});
