import { DELTA, DIRECTIONS, DIRECTION_TO, SIDES, cellsOf, findBlock, inBounds, isFreeFor, occupancy } from './board';
import type { Block, Direction, Side, Slides, State } from './types';

/** How far the block can slide each way before it hits a block or the frame. */
export function legalSlides(state: State, blockId: string): Slides {
  const slides = { up: 0, right: 0, down: 0, left: 0 };
  const block = findBlock(state, blockId);
  if (!block) return slides;
  const occ = occupancy(state);
  const cells = cellsOf(block);
  for (const dir of DIRECTIONS) {
    const d = DELTA[dir];
    let k = 0;
    while (
      cells.every((c) => {
        const next = { row: c.row + d.row * (k + 1), col: c.col + d.col * (k + 1) };
        return inBounds(state, next) && isFreeFor(occ, next, blockId);
      })
    ) {
      k++;
    }
    slides[dir] = k;
  }
  return slides;
}

/** The side a block leaves by: the one whose rail is its colour. */
export function exitSide(state: State, block: Block): Side | null {
  return SIDES.find((s) => state.rails[s] === block.colour) ?? null;
}

/**
 * The side the block would leave by, or null.
 *
 * Colour decides where: the block travels straight toward the rail of its
 * own colour. Shape decides whether: every board cell any of its cells
 * passes through on the way to that rail must be empty.
 */
export function canExit(state: State, blockId: string): Side | null {
  const block = findBlock(state, blockId);
  if (!block) return null;
  const side = exitSide(state, block);
  if (!side) return null;
  const d = DELTA[DIRECTION_TO[side]];
  const occ = occupancy(state);
  for (const cell of cellsOf(block)) {
    let next = { row: cell.row + d.row, col: cell.col + d.col };
    while (inBounds(state, next)) {
      if (!isFreeFor(occ, next, block.id)) return null;
      next = { row: next.row + d.row, col: next.col + d.col };
    }
  }
  return side;
}

/** New state with the block moved one cell, or null if its shape does not fit there. */
export function applySlide(state: State, blockId: string, dir: Direction): State | null {
  if (legalSlides(state, blockId)[dir] < 1) return null;
  const d = DELTA[dir];
  return {
    ...state,
    blocks: state.blocks.map((b) =>
      b.id === blockId ? { ...b, anchor: { row: b.anchor.row + d.row, col: b.anchor.col + d.col } } : b,
    ),
  };
}

/** New state with the block removed through its rail, or null if it cannot exit. */
export function applyExit(state: State, blockId: string): State | null {
  if (!canExit(state, blockId)) return null;
  return {
    ...state,
    blocks: state.blocks.filter((b) => b.id !== blockId),
  };
}

export function isSolved(state: State): boolean {
  return state.blocks.length === 0;
}

/** Pieces remain and none of them can leave. Exits alone never cause this; slides can. */
export function isStuck(state: State): boolean {
  return !isSolved(state) && state.blocks.every((b) => !canExit(state, b.id));
}
