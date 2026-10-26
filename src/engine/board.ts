import type { Block, Cell, Direction, Side, State } from './types';

export const BOARD_SIZE = 5;
export const MIN_PIECE = 2;
export const MAX_PIECE = 6;

export const DIRECTIONS: readonly Direction[] = ['up', 'right', 'down', 'left'];

export const DELTA: Readonly<Record<Direction, Cell>> = {
  up: { row: -1, col: 0 },
  right: { row: 0, col: 1 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
};

export const DIRECTION_TO: Readonly<Record<Side, Direction>> = {
  top: 'up',
  right: 'right',
  bottom: 'down',
  left: 'left',
};

export const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

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

function isConnected(cells: readonly Cell[]): boolean {
  const keys = new Set(cells.map(key));
  const seen = new Set<string>([key(cells[0]!)]);
  const queue = [cells[0]!];
  while (queue.length > 0) {
    const c = queue.pop()!;
    for (const d of Object.values(DELTA)) {
      const k = key({ row: c.row + d.row, col: c.col + d.col });
      if (keys.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push({ row: c.row + d.row, col: c.col + d.col });
      }
    }
  }
  return seen.size === keys.size;
}

/** Throws on a malformed state. Use when building levels, not per move. */
export function validateState(state: State): void {
  const occ = new Map<string, string>();
  const ids = new Set<string>();
  for (const block of state.blocks) {
    if (ids.has(block.id)) throw new Error(`Duplicate block id ${block.id}`);
    ids.add(block.id);
    const n = block.shape.length;
    if (n < MIN_PIECE || n > MAX_PIECE) throw new Error(`Block ${block.id} has ${n} cells, needs ${MIN_PIECE} to ${MAX_PIECE}`);
    if (new Set(block.shape.map(key)).size !== n) throw new Error(`Block ${block.id} repeats a cell`);
    if (!isConnected(block.shape)) throw new Error(`Block ${block.id} is not one connected piece`);
    for (const cell of cellsOf(block)) {
      if (!inBounds(state, cell)) throw new Error(`Block ${block.id} is off the board at ${key(cell)}`);
      const other = occ.get(key(cell));
      if (other !== undefined) throw new Error(`Blocks ${other} and ${block.id} overlap at ${key(cell)}`);
      occ.set(key(cell), block.id);
    }
  }
  if (new Set(SIDES.map((s) => state.rails[s])).size !== SIDES.length) {
    throw new Error('Each side needs its own rail colour');
  }
}
