import { MIN_TARGET, type Point, type Rect } from './layout';

export interface Target {
  readonly id: string;
  /** The block as drawn, one rectangle per cell. */
  readonly rects: readonly Rect[];
  readonly centre: Point;
}

function distanceToRect(r: Rect, x: number, y: number): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

const distanceTo = (t: Target, x: number, y: number) => Math.min(...t.rects.map((r) => distanceToRect(r, x, y)));

/**
 * Rule 2. A tap on a block as drawn is that block. A tap anywhere else (a
 * gap, an empty cell, the margin) goes to the nearest block centre among
 * blocks within reach. Reach is 0.6 of a cell (past the middle of a free
 * cell beside the block, inset included), and never less than what makes
 * the target 44 px across, so targets grow into free space and never into a
 * neighbour, which already owns its own cells.
 */
export function hitTest(targets: readonly Target[], x: number, y: number, cell: number): string | null {
  for (const t of targets) {
    if (distanceTo(t, x, y) === 0) return t.id;
  }
  let best: string | null = null;
  let bestDist = Infinity;
  for (const t of targets) {
    const narrowest = Math.min(...t.rects.map((r) => Math.min(r.w, r.h)));
    const reach = Math.max(cell * 0.6, (MIN_TARGET - narrowest) / 2);
    if (distanceTo(t, x, y) > reach) continue;
    const d = Math.hypot(t.centre.x - x, t.centre.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = t.id;
    }
  }
  return best;
}
