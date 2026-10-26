import { MIN_TARGET, type Rect } from './layout';

export interface Target {
  readonly id: string;
  readonly rect: Rect;
}

function distanceToRect(r: Rect, x: number, y: number): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/**
 * Rule 2. A tap on a block's drawn rectangle is that block. A tap anywhere
 * else (a gap, an empty cell, the margin) goes to the nearest block centre
 * among blocks within reach. Reach is half a cell, and never less than what
 * makes the target 44 px across, so targets grow into free space and never
 * into a neighbour, which already owns its own rectangle.
 */
export function hitTest(targets: readonly Target[], x: number, y: number, cell: number): string | null {
  for (const t of targets) {
    if (distanceToRect(t.rect, x, y) === 0) return t.id;
  }
  let best: string | null = null;
  let bestDist = Infinity;
  for (const t of targets) {
    const reach = Math.max(cell / 2, (MIN_TARGET - Math.min(t.rect.w, t.rect.h)) / 2);
    if (distanceToRect(t.rect, x, y) > reach) continue;
    const d = Math.hypot(t.rect.x + t.rect.w / 2 - x, t.rect.y + t.rect.h / 2 - y);
    if (d < bestDist) {
      bestDist = d;
      best = t.id;
    }
  }
  return best;
}
