import { applyExit, canExit, cellsOf, isSolved, type Block, type Cell, type Colour, type Rails, type State } from '../engine';
import { SHAPES, SIZE, type Kind } from './shapes';

/** Everything that sets how hard a generated board is. */
export interface SearchParams {
  /** Grid is rows tall by cols wide. */
  readonly rows: number;
  readonly cols: number;
  /** Exact number of pieces. */
  readonly pieces: number;
  /** Exact number of filled cells: the density. */
  readonly cells: number;
  /** Piece kinds allowed on this board. */
  readonly kinds: readonly Kind[];
  /** Relative weight of each piece size, in cells. Sizes left out are not used. */
  readonly sizeWeights: Readonly<Partial<Record<number, number>>>;
  /** At least this share of the pieces are 2 or 3 cells ("mostly 2 and 3"). */
  readonly smallShare: number;
  /** Each colour's share of the pieces, inclusive range. */
  readonly colourShare: readonly [number, number];
  /** Pieces that can leave at the start, inclusive range. */
  readonly free: readonly [number, number];
  /** Central clustering: at most this many filled cells on the outer ring. */
  readonly ringMax: number;
  /** How hard pieces are pulled toward the middle, against blocking free pieces (1 = early boards). */
  readonly centrePull: number;
  readonly tries: number;
  readonly seed: number;
}

export interface SearchResult {
  readonly state: State;
  /** Pieces held by two or more different neighbours on the way to their rail. */
  readonly pinned: number;
}

const COLOURS: readonly Colour[] = ['amber', 'cyan', 'violet', 'mint'];
const STEP: Readonly<Record<keyof Rails, Cell>> = {
  top: { row: -1, col: 0 },
  right: { row: 0, col: 1 },
  bottom: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
};

/** Seeded random numbers (mulberry32), so a seed always gives the same board. */
export function makeRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a board in reverse (rule 6): start empty and add pieces one at a
 * time, each where it can still leave past the pieces already placed. The
 * first piece placed is the last one tapped, so the board clears by taps
 * alone by construction. Colours come from a fixed quota so each gets its
 * share. Each piece goes where it blocks the most free pieces, then where it
 * touches neighbours and sits closest to the middle, among a few random best
 * spots. Of all tries that
 * meet the parameters, the one whose largest empty patch is smallest wins
 * (crowded all over), then the one with fewest free pieces, then the most
 * pinned.
 */
export function searchBoard(params: SearchParams, rails: Rails): SearchResult | null {
  const rand = makeRandom(params.seed);
  const quota = colourQuota(params, rand);
  if (!quota) return null;
  let best: SearchResult | null = null;
  let bestRank: number[] = [];
  for (let t = 0; t < params.tries; t++) {
    const kinds = pickKinds(params, rand);
    if (!kinds) continue;
    const state = build(params, rails, kinds, colourQuota(params, rand)!, rand);
    if (!state || !meets(params, state)) continue;
    const pinned = state.blocks.filter((b) => blockerCount(state, b) >= 2).length;
    const rank = [largestGap(state), freeCount(state), -pinned];
    if (!best || compare(rank, bestRank) < 0) {
      best = { state: relabel(state), pinned };
      bestRank = rank;
    }
  }
  return best;
}

/**
 * How many pieces of each colour: every colour inside its share. Null when
 * no whole numbers fit (6, 7 or 9 pieces at 20 to 30 percent, for example).
 */
export function colourQuota(p: Pick<SearchParams, 'pieces' | 'colourShare'>, rand: () => number): Map<Colour, number> | null {
  const lo = Math.ceil(p.colourShare[0] * p.pieces - 1e-9);
  const hi = Math.floor(p.colourShare[1] * p.pieces + 1e-9);
  if (lo > hi || lo * COLOURS.length > p.pieces || hi * COLOURS.length < p.pieces) return null;
  const quota = new Map(COLOURS.map((c) => [c, lo] as const));
  let left = p.pieces - lo * COLOURS.length;
  while (left > 0) {
    const c = COLOURS[Math.floor(rand() * COLOURS.length)]!;
    if (quota.get(c)! < hi) {
      quota.set(c, quota.get(c)! + 1);
      left--;
    }
  }
  return quota;
}

/**
 * Piece kinds, drawn by size weight, then nudged one cell at a time (within
 * the allowed sizes) until they add up to exactly `cells`.
 */
function pickKinds(p: SearchParams, rand: () => number): Kind[] | null {
  const sizes = [...new Set(p.kinds.map((k) => SIZE[k]))].filter((n) => (p.sizeWeights[n] ?? 0) > 0).sort((a, b) => a - b);
  if (sizes.length === 0) return null;
  const total = sizes.reduce((n, size) => n + p.sizeWeights[size]!, 0);
  const draw = () => {
    let r = rand() * total;
    for (const size of sizes) if ((r -= p.sizeWeights[size]!) < 0) return size;
    return sizes.at(-1)!;
  };
  const picked = Array.from({ length: p.pieces }, draw);
  let sum = picked.reduce((n, size) => n + size, 0);
  for (let guard = 0; sum !== p.cells && guard < 10000; guard++) {
    const i = Math.floor(rand() * picked.length);
    const next = sizes[sizes.indexOf(picked[i]!) + (sum < p.cells ? 1 : -1)];
    if (next === undefined) continue;
    sum += next - picked[i]!;
    picked[i] = next;
  }
  if (sum !== p.cells) return null;
  if (picked.filter((n) => n === 2 || n === 3).length < p.smallShare * p.pieces) return null;
  return picked.map((size) => {
    const options = p.kinds.filter((k) => SIZE[k] === size);
    return options[Math.floor(rand() * options.length)]!;
  });
}

const key = (row: number, col: number) => row * 100 + col;

/**
 * Place the pieces in reverse. Works on the set of taken cells: a spot is
 * allowed if every cell from it to its colour's rail is free, and it blocks
 * a free piece if it lands on that piece's path to its rail. At each step any
 * remaining kind may be placed, so the last few pieces still find room.
 */
function build(p: SearchParams, rails: Rails, kinds: readonly Kind[], quota: Map<Colour, number>, rand: () => number): State | null {
  const sideOf = new Map((Object.keys(rails) as (keyof Rails)[]).map((side) => [rails[side], STEP[side]] as const));
  const taken = new Set<number>();
  const placed: Block[] = [];
  const paths: Set<number>[] = [];
  const remaining = [...kinds];
  const used = new Map<Colour, number>();
  let ring = 0;
  const midRow = (p.rows - 1) / 2;
  const midCol = (p.cols - 1) / 2;
  const inside = (r: number, c: number) => r >= 0 && r < p.rows && c >= 0 && c < p.cols;
  const onRing = (c: Cell) => c.row === 0 || c.col === 0 || c.row === p.rows - 1 || c.col === p.cols - 1;
  const pathOf = (cells: readonly Cell[], d: Cell) => {
    const own = new Set(cells.map((c) => key(c.row, c.col)));
    const path = new Set<number>();
    for (const c of cells) {
      for (let r = c.row + d.row, k = c.col + d.col; inside(r, k); r += d.row, k += d.col) {
        if (!own.has(key(r, k))) path.add(key(r, k));
      }
    }
    return path;
  };

  for (let i = 0; i < kinds.length; i++) {
    const free = paths.filter((path) => ![...path].some((k) => taken.has(k)));
    const options: { block: Block; cells: Cell[]; path: Set<number>; kind: Kind; blocked: number; score: number }[] = [];
    for (const kind of new Set(remaining)) {
      for (const shape of SHAPES[kind]) {
        for (let row = 0; row < p.rows; row++) {
          for (let col = 0; col < p.cols; col++) {
            const cells = shape.map((o) => ({ row: row + o.row, col: col + o.col }));
            if (cells.some((c) => !inside(c.row, c.col) || taken.has(key(c.row, c.col)))) continue;
            const ringCells = cells.filter(onRing).length;
            if (ring + ringCells > p.ringMax) continue;
            const touching = cells.filter((c) => Object.values(STEP).some((d) => taken.has(key(c.row + d.row, c.col + d.col)))).length;
            // Pull toward the middle so early boards read as one cluster.
            const spread = cells.reduce((n, c) => n + Math.abs(c.row - midRow) + Math.abs(c.col - midCol), 0) / cells.length;
            const blocked = free.filter((path) => cells.some((c) => path.has(key(c.row, c.col)))).length;
            for (const colour of COLOURS) {
              if ((used.get(colour) ?? 0) >= quota.get(colour)!) continue;
              const path = pathOf(cells, sideOf.get(colour)!);
              if ([...path].some((k) => taken.has(k))) continue;
              const block: Block = { id: `p${i}`, colour, anchor: { row, col }, shape };
              options.push({ block, cells, path, kind, blocked, score: touching * 0.5 - spread * p.centrePull + rand() * 2 });
            }
          }
        }
      }
    }
    if (options.length === 0) return null;
    // Block as many free pieces as possible; among those spots, touch
    // neighbours and keep to the middle, with a little chance.
    const most = Math.max(...options.map((o) => o.blocked));
    const best = options.filter((o) => o.blocked === most).sort((a, b) => b.score - a.score);
    const pick = best[Math.floor(rand() * Math.min(3, best.length))]!;
    placed.push(pick.block);
    paths.push(pick.path);
    for (const c of pick.cells) taken.add(key(c.row, c.col));
    ring += pick.cells.filter(onRing).length;
    remaining.splice(remaining.indexOf(pick.kind), 1);
    used.set(pick.block.colour, (used.get(pick.block.colour) ?? 0) + 1);
  }
  return { rows: p.rows, cols: p.cols, rails, blocks: placed };
}

const freeCount = (s: State) => s.blocks.filter((b) => canExit(s, b.id)).length;

const compare = (a: readonly number[], b: readonly number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
};

/** Size of the largest connected patch of empty cells. */
export function largestGap(s: State): number {
  const filled = new Set(s.blocks.flatMap(cellsOf).map((c) => key(c.row, c.col)));
  const seen = new Set<number>();
  let largest = 0;
  for (let r = 0; r < s.rows; r++) {
    for (let c = 0; c < s.cols; c++) {
      if (filled.has(key(r, c)) || seen.has(key(r, c))) continue;
      let size = 0;
      const stack = [[r, c] as const];
      seen.add(key(r, c));
      while (stack.length > 0) {
        const [y, x] = stack.pop()!;
        size++;
        for (const d of Object.values(STEP)) {
          const ny = y + d.row, nx = x + d.col;
          if (ny < 0 || ny >= s.rows || nx < 0 || nx >= s.cols || filled.has(key(ny, nx)) || seen.has(key(ny, nx))) continue;
          seen.add(key(ny, nx));
          stack.push([ny, nx]);
        }
      }
      largest = Math.max(largest, size);
    }
  }
  return largest;
}

function meets(p: SearchParams, s: State): boolean {
  const free = freeCount(s);
  if (free < p.free[0] || free > p.free[1]) return false;
  return COLOURS.every((c) => s.blocks.some((b) => b.colour === c));
}

/** How many different pieces stand between a block and its rail. */
export function blockerCount(s: State, block: Block): number {
  const side = (Object.keys(s.rails) as (keyof Rails)[]).find((k) => s.rails[k] === block.colour)!;
  const d = STEP[side];
  const owner = new Map<string, string>();
  for (const b of s.blocks) for (const c of cellsOf(b)) owner.set(`${c.row},${c.col}`, b.id);
  const ids = new Set<string>();
  for (const c of cellsOf(block)) {
    for (let r = c.row + d.row, k = c.col + d.col; r >= 0 && r < s.rows && k >= 0 && k < s.cols; r += d.row, k += d.col) {
      const id = owner.get(`${r},${k}`);
      if (id && id !== block.id) ids.add(id);
    }
  }
  return ids.size;
}

/** Name pieces A to Z, then a to z, in reading order. */
function relabel(s: State): State {
  const names = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  if (s.blocks.length > names.length) throw new Error(`More than ${names.length} pieces`);
  const order = [...s.blocks].sort((a, b) => a.anchor.row - b.anchor.row || a.anchor.col - b.anchor.col);
  return { ...s, blocks: order.map((b, i) => ({ ...b, id: names[i]! })) };
}

/** Clear by taps alone, any free piece each time. Exits only free cells, so this never misses a solution. */
export function tapSolution(state: State): string[] | null {
  const taps: string[] = [];
  let s = state;
  while (!isSolved(s)) {
    const free = s.blocks.find((b) => canExit(s, b.id));
    if (!free) return null;
    taps.push(free.id);
    s = applyExit(s, free.id)!;
  }
  return taps;
}
