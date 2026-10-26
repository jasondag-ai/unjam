import type { Axis, Block, Cell, Direction, Side, State } from './types';

export const BOARD_SIZE = 5;

/** Clockwise from the top. Also the order canExit tries directions in. */
export const DIRECTIONS: readonly Direction[] = ['up', 'right', 'down', 'left'];

export const DELTA: Readonly<Record<Direction, Cell>> = {
  up: { row: -1, col: 0 },
  right: { row: 0, col: 1 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
};

export const SIDE_OF: Readonly<Record<Direction, Side>> = {
  up: 'top',
  right: 'right',
  down: 'bottom',
  left: 'left',
};

export function directionsFor(axis: Axis): readonly Direction[] {
  if (axis === 'h') return ['right', 'left'];
  if (axis === 'v') return ['up', 'down'];
  return DIRECTIONS;
}

export function cellsOf(block: Block): Cell[] {
  return block.shape.map((o) => ({ row: block.anchor.row + o.row, col: block.anchor.col + o.col }));
}

export function findBlock(state: State, blockId: string): Block | undefined {
  return state.blocks.find((b) => b.id === blockId);
}

export function inBounds(state: State, cell: Cell): boolean {
  return cell.row >= 0 && cell.row < state.size && cell.col >= 0 && cell.col < state.size;
}

const key = (cell: Cell) => `${cell.row},${cell.col}`;

/** Map of occupied cell -> block id. A cell absent from the map is empty. */
export function occupancy(state: State): Map<string, string> {
  const map = new Map<string, string>();
  for (const block of state.blocks) {
    for (const cell of cellsOf(block)) map.set(key(cell), block.id);
  }
  return map;
}

/** Empty, or held by the block itself (a block never blocks its own path). */
export function isFreeFor(occ: Map<string, string>, cell: Cell, blockId: string): boolean {
  const owner = occ.get(key(cell));
  return owner === undefined || owner === blockId;
}

/** Throws on a malformed state. Use when building levels, not per move. */
export function validateState(state: State): void {
  const occ = new Map<string, string>();
  const ids = new Set<string>();
  for (const block of state.blocks) {
    if (ids.has(block.id)) throw new Error(`Duplicate block id ${block.id}`);
    ids.add(block.id);
    if (block.shape.length === 0) throw new Error(`Block ${block.id} has no cells`);
    const single = block.shape.length === 1;
    if (single && block.axis !== 'free') throw new Error(`Single-cell block ${block.id} must be 'free'`);
    if (!single && block.axis === 'free') throw new Error(`Multi-cell block ${block.id} needs an axis`);
    for (const cell of cellsOf(block)) {
      if (!inBounds(state, cell)) throw new Error(`Block ${block.id} is off the board at ${key(cell)}`);
      const other = occ.get(key(cell));
      if (other !== undefined) throw new Error(`Blocks ${other} and ${block.id} overlap at ${key(cell)}`);
      occ.set(key(cell), block.id);
    }
  }
  const gates = new Set<string>();
  for (const gate of state.gates) {
    const g = `${gate.side}:${gate.index}`;
    if (gates.has(g)) throw new Error(`Duplicate gate ${g}`);
    gates.add(g);
    if (gate.index < 0 || gate.index >= state.size) throw new Error(`Gate ${g} is off the board`);
  }
}
