import { DELTA, DIRECTIONS, DIRECTION_TO, SIDES, cellsOf, findBlock, inBounds, isFreeFor, occupancy } from './board';
import type { Block, Colour, Direction, Side, Slides, State } from './types';

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
 * A block's parts, one per colour, in order of first appearance (job 021).
 * Each part keeps the block's id and anchor. An ordinary block is one part.
 */
export function partsOf(block: Block): Block[] {
  const colours = block.colours;
  if (!colours) return [block];
  return [...new Set(colours)].map((colour) => ({
    id: block.id,
    ...(block.group ? { group: block.group } : {}),
    colour,
    anchor: block.anchor,
    shape: block.shape.filter((_, i) => colours[i] === colour),
  }));
}

/**
 * Can this part of a block leave? It travels straight toward the rail of its
 * own colour, and every board cell its cells pass through must be empty or
 * its own. The block's other parts count as solid.
 */
function partCanExit(state: State, part: Block, occ: Map<string, string>): Side | null {
  const side = exitSide(state, part);
  if (!side) return null;
  const d = DELTA[DIRECTION_TO[side]];
  const own = new Set(cellsOf(part).map((c) => `${c.row},${c.col}`));
  for (const cell of cellsOf(part)) {
    let next = { row: cell.row + d.row, col: cell.col + d.col };
    while (inBounds(state, next)) {
      const k = `${next.row},${next.col}`;
      if (occ.has(k) && !own.has(k)) return null;
      next = { row: next.row + d.row, col: next.col + d.col };
    }
  }
  return side;
}

/**
 * The part of a block a tap would send out, and its side, or null. A tap
 * tries every part in order and takes the first that can go (job 021).
 */
export function exitingPart(state: State, blockId: string): { part: Block; side: Side } | null {
  const block = findBlock(state, blockId);
  if (!block) return null;
  const occ = occupancy(state);
  for (const part of partsOf(block)) {
    const side = partCanExit(state, part, occ);
    if (side) return { part, side };
  }
  return null;
}

/**
 * The side the block (or, on a split piece, its first free part) would
 * leave by, or null.
 *
 * Colour decides where: the block travels straight toward the rail of its
 * own colour. Shape decides whether: every board cell any of its cells
 * passes through on the way to that rail must be empty.
 */
export function canExit(state: State, blockId: string): Side | null {
  return exitingPart(state, blockId)?.side ?? null;
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

/**
 * New state with the block removed through its rail, or null if it cannot
 * exit. On a split piece only the part that can go leaves; the rest stays
 * where it is, an ordinary piece of the remaining colour (job 021).
 */
export function applyExit(state: State, blockId: string): State | null {
  const exiting = exitingPart(state, blockId);
  if (!exiting) return null;
  const left = remainder(findBlock(state, blockId)!, exiting.part.colour);
  return {
    ...state,
    blocks: left ? state.blocks.map((b) => (b.id === blockId ? left : b)) : state.blocks.filter((b) => b.id !== blockId),
  };
}

/** What stays of a block once its part of this colour has gone, or null if nothing does. */
function remainder(block: Block, gone: Colour): Block | null {
  if (!block.colours) return null;
  const keep = block.colours.map((c) => c !== gone);
  const colours = block.colours.filter((_, i) => keep[i]);
  if (colours.length === 0) return null;
  const { colours: _, ...rest } = block;
  const shape = block.shape.filter((_, i) => keep[i]);
  const main = colours.includes(block.colour) ? block.colour : colours[0]!;
  return new Set(colours).size > 1 ? { ...rest, colour: main, shape, colours } : { ...rest, colour: main, shape };
}

export function isSolved(state: State): boolean {
  return state.blocks.length === 0;
}

/** Pieces remain and none of them can leave. Exits alone never cause this; slides can. */
export function isStuck(state: State): boolean {
  return !isSolved(state) && state.blocks.every((b) => !canExit(state, b.id));
}
