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

export interface Clumping {
  /** Share of touching pairs of pieces that are the same colour. */
  readonly share: number;
  /** What a random deal of this board's colours would give. */
  readonly random: number;
}

/**
 * Job 012: do colours clump? Compare touching same-colour pairs with a random
 * deal. Pieces of one shape group (job 014) are meant to touch, so those pairs
 * are left out.
 */
export function clumping(s: State): Clumping {
  const owner = new Map<string, Block>();
  for (const b of s.blocks) for (const c of cellsOf(b)) owner.set(`${c.row},${c.col}`, b);
  const pairs = new Map<string, boolean>();
  for (const b of s.blocks) {
    for (const c of cellsOf(b)) {
      for (const o of [owner.get(`${c.row},${c.col + 1}`), owner.get(`${c.row + 1},${c.col}`)]) {
        if (o && o !== b && !(b.group && o.group === b.group)) pairs.set([b.id, o.id].sort().join(' '), o.colour === b.colour);
      }
    }
  }
  const n = s.blocks.length;
  const counts = [...new Set(s.blocks.map((b) => b.colour))].map((c) => s.blocks.filter((b) => b.colour === c).length);
  const same = [...pairs.values()].filter(Boolean).length;
  return {
    share: pairs.size === 0 ? 0 : same / pairs.size,
    random: counts.reduce((t, k) => t + k * (k - 1), 0) / (n * (n - 1)),
  };
}

export interface Thread {
  readonly id: string;
  /** Empty, walled cells from the piece toward its rail: the channel. */
  readonly channel: number;
  /** True if the channel runs to the board edge; false if a piece closes its outer end (job 016). */
  readonly open: boolean;
  /** Pieces whose own lane runs through this one. */
  readonly holds: readonly string[];
}

/**
 * Jobs 015 and 016: threaded pieces. A small piece (1 to 3 cells, one cell
 * wide across its way out) whose lane starts with a channel: a run of at
 * least two empty cells with a filled cell on both sides of each, ending at
 * the board edge (open) or at a piece (closed, so it cannot be seen from the
 * edge). It stands in another piece's lane, so taking it frees what sits
 * behind.
 */
export function threads(s: State): Thread[] {
  const filled = new Set(s.blocks.flatMap(cellsOf).map((c) => `${c.row},${c.col}`));
  const inside = (r: number, c: number) => r >= 0 && r < s.rows && c >= 0 && c < s.cols;
  const lanes = blockers(s);
  const result: Thread[] = [];
  for (const b of s.blocks) {
    const cells = cellsOf(b);
    if (cells.length > 3) continue;
    const d = STEP[sideOf(s.rails, b.colour)];
    const across = d.row === 0 ? 'row' : 'col';
    if (new Set(cells.map((c) => c[across])).size !== 1) continue;
    // The leading cell: the one nearest the rail.
    const lead = cells.reduce((best, c) => (c.row * d.row + c.col * d.col > best.row * d.row + best.col * d.col ? c : best));
    const side = { row: d.col, col: d.row };
    let channel = 0;
    let walled = true;
    let r = lead.row + d.row;
    let k = lead.col + d.col;
    for (; inside(r, k) && !filled.has(`${r},${k}`); r += d.row, k += d.col, channel++) {
      const walls = [[r + side.row, k + side.col], [r - side.row, k - side.col]] as const;
      if (!walls.every(([y, x]) => inside(y, x) && filled.has(`${y},${x}`))) walled = false;
    }
    const holds = s.blocks.filter((o) => lanes.get(o.id)!.has(b.id)).map((o) => o.id);
    if (walled && channel >= 2 && holds.length > 0) result.push({ id: b.id, channel, open: !inside(r, k), holds });
  }
  return result;
}
