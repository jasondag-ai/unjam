import { cellsOf, type Block, type Cell, type Colour, type Rails, type Side, type State } from '../engine';

const STEP: Readonly<Record<Side, Cell>> = {
  top: { row: -1, col: 0 },
  right: { row: 0, col: 1 },
  bottom: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
};

const sideOf = (rails: Rails, colour: Colour): Side => (Object.keys(rails) as Side[]).find((s) => rails[s] === colour)!;

/** Empty rows (or columns) between a piece's cells and one edge of the board. */
export function railDistance(cells: readonly Cell[], side: Side, rows: number, cols: number): number {
  if (side === 'top') return Math.min(...cells.map((c) => c.row));
  if (side === 'bottom') return rows - 1 - Math.max(...cells.map((c) => c.row));
  if (side === 'left') return Math.min(...cells.map((c) => c.col));
  return cols - 1 - Math.max(...cells.map((c) => c.col));
}

export interface ColourSpread {
  readonly colour: Colour;
  /** Average distance from this colour's pieces to their own rail. */
  readonly own: number;
  /** Average distance from every piece on the board to that same rail. */
  readonly board: number;
  /** own / board: 1 means colour says nothing about position; small means it clusters at its rail. */
  readonly ratio: number;
}

/** Job 012: does colour correlate with position? One row per colour. */
export function colourSpread(s: State): ColourSpread[] {
  return (['amber', 'cyan', 'violet', 'mint'] as const).map((colour) => {
    const side = sideOf(s.rails, colour);
    const dist = (b: Block) => railDistance(cellsOf(b), side, s.rows, s.cols);
    const mine = s.blocks.filter((b) => b.colour === colour);
    const own = mine.reduce((n, b) => n + dist(b), 0) / mine.length;
    const board = s.blocks.reduce((n, b) => n + dist(b), 0) / s.blocks.length;
    return { colour, own, board, ratio: board === 0 ? 1 : own / board };
  });
}

/** For each piece, the pieces standing in its lane to its rail. */
export function blockers(s: State): Map<string, Set<string>> {
  const owner = new Map<string, string>();
  for (const b of s.blocks) for (const c of cellsOf(b)) owner.set(`${c.row},${c.col}`, b.id);
  const result = new Map<string, Set<string>>();
  for (const b of s.blocks) {
    const d = STEP[sideOf(s.rails, b.colour)];
    const ids = new Set<string>();
    for (const c of cellsOf(b)) {
      for (let r = c.row + d.row, k = c.col + d.col; r >= 0 && r < s.rows && k >= 0 && k < s.cols; r += d.row, k += d.col) {
        const id = owner.get(`${r},${k}`);
        if (id && id !== b.id) ids.add(id);
      }
    }
    result.set(b.id, ids);
  }
  return result;
}

export interface Dependency {
  /** Pieces that must leave before the most-buried piece can go. */
  readonly buried: number;
  readonly buriedPiece: string;
  /** Longest run of pieces each blocking the next. */
  readonly chain: number;
}

/**
 * Job 012: the depth of a tap-only board. A piece can leave once everything
 * in its lane has gone, and each of those once everything in theirs has.
 */
export function dependency(s: State): Dependency {
  const direct = blockers(s);
  const closure = new Map<string, Set<string>>();
  const depth = new Map<string, number>();
  const visit = (id: string, seen: Set<string>): void => {
    if (closure.has(id)) return;
    if (seen.has(id)) throw new Error(`Pieces block each other in a loop at ${id}`);
    seen.add(id);
    const all = new Set<string>();
    let deepest = 0;
    for (const b of direct.get(id)!) {
      visit(b, seen);
      all.add(b);
      for (const x of closure.get(b)!) all.add(x);
      deepest = Math.max(deepest, depth.get(b)! + 1);
    }
    closure.set(id, all);
    depth.set(id, deepest);
  };
  for (const b of s.blocks) visit(b.id, new Set());
  let buriedPiece = s.blocks[0]?.id ?? '';
  for (const b of s.blocks) if (closure.get(b.id)!.size > (closure.get(buriedPiece)?.size ?? -1)) buriedPiece = b.id;
  return {
    buried: closure.get(buriedPiece)?.size ?? 0,
    buriedPiece,
    chain: Math.max(0, ...depth.values()),
  };
}
