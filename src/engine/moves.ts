import { DELTA, DIRECTIONS, SIDE_OF, cellsOf, directionsFor, findBlock, inBounds, isFreeFor, occupancy } from './board';
import type { Block, Direction, Gate, Slides, State } from './types';

/** How far the block can slide each way along its axis before a block or wall. */
export function legalSlides(state: State, blockId: string): Slides {
  const slides = { up: 0, right: 0, down: 0, left: 0 };
  const block = findBlock(state, blockId);
  if (!block) return slides;
  const occ = occupancy(state);
  const cells = cellsOf(block);
  for (const dir of directionsFor(block.axis)) {
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

/**
 * The gate the block would leave through, or null.
 *
 * A block exits in a straight line along its axis. Every board cell between
 * it and the edge, in each of its own rows (or columns), must be empty, and
 * each of those rows (or columns) needs a gate of the block's colour on that
 * edge. Directions are tried clockwise from up; the first that works wins.
 * For a block more than one cell thick across the exit, the gate at the
 * lowest index is returned.
 */
export function canExit(state: State, blockId: string): Gate | null {
  const block = findBlock(state, blockId);
  if (!block) return null;
  const occ = occupancy(state);
  const cells = cellsOf(block);
  for (const dir of DIRECTIONS) {
    if (!directionsFor(block.axis).includes(dir)) continue;
    const gate = exitThrough(state, occ, block, cells, dir);
    if (gate) return gate;
  }
  return null;
}

function exitThrough(
  state: State,
  occ: Map<string, string>,
  block: Block,
  cells: ReturnType<typeof cellsOf>,
  dir: Direction,
): Gate | null {
  const d = DELTA[dir];
  for (const cell of cells) {
    let next = { row: cell.row + d.row, col: cell.col + d.col };
    while (inBounds(state, next)) {
      if (!isFreeFor(occ, next, block.id)) return null;
      next = { row: next.row + d.row, col: next.col + d.col };
    }
  }
  const side = SIDE_OF[dir];
  const across = [...new Set(cells.map((c) => (dir === 'up' || dir === 'down' ? c.col : c.row)))].sort((a, b) => a - b);
  const gates: Gate[] = [];
  for (const index of across) {
    const gate = state.gates.find((g) => g.side === side && g.index === index && g.colour === block.colour);
    if (!gate) return null;
    gates.push(gate);
  }
  return gates[0] ?? null;
}

/** New state with the block moved, or null if the slide is not legal. */
export function applySlide(state: State, blockId: string, dir: Direction, distance: number): State | null {
  if (!Number.isInteger(distance) || distance < 1) return null;
  if (distance > legalSlides(state, blockId)[dir]) return null;
  const d = DELTA[dir];
  return {
    ...state,
    blocks: state.blocks.map((b) =>
      b.id === blockId
        ? { ...b, anchor: { row: b.anchor.row + d.row * distance, col: b.anchor.col + d.col * distance } }
        : b,
    ),
    moves: state.moves + 1,
  };
}

/** New state with the block removed through its gate, or null if it cannot exit. */
export function applyExit(state: State, blockId: string): State | null {
  if (!canExit(state, blockId)) return null;
  return {
    ...state,
    blocks: state.blocks.filter((b) => b.id !== blockId),
    moves: state.moves + 1,
  };
}

export function isSolved(state: State): boolean {
  return state.blocks.length === 0;
}
