import { applyExit, canExit, cellsOf, isSolved, type Block, type Cell, type Colour, type Rails, type State } from '../engine';
import { FAMILY_OF, KINDS, SHAPES, SIZE, type Kind } from './shapes';

/** Everything that sets how hard a generated board is. */
export interface SearchParams {
  /** Grid is rows tall by cols wide. */
  readonly rows: number;
  readonly cols: number;
  /** Exact number of pieces. */
  readonly pieces: number;
  /** Exact number of filled cells: the density. */
  readonly cells: number;
  /** Smallest and largest piece, in cells. */
  readonly pieceSize: readonly [number, number];
  /** At least this many of L, T, S and Z must appear. */
  readonly minFamilies: number;
  /** At most this many two-cell pieces. */
  readonly maxDominoes: number;
  /** Pieces that can leave at the start, inclusive range. */
  readonly free: readonly [number, number];
  /** Central clustering: at most this many filled cells on the outer ring. */
  readonly ringMax: number;
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
 * alone by construction. Each piece goes where it blocks the most free
 * pieces and sits closest to the middle, among a few random best spots. Of all tries that meet the
 * parameters, the most pinned board wins.
 */
export function searchBoard(params: SearchParams, rails: Rails): SearchResult | null {
  const rand = makeRandom(params.seed);
  let best: SearchResult | null = null;
  for (let t = 0; t < params.tries; t++) {
    const kinds = pickKinds(params, rand);
    if (!kinds) continue;
    const state = build(params, rails, kinds, rand);
    if (!state || !meets(params, state)) continue;
    const pinned = state.blocks.filter((b) => blockerCount(state, b) >= 2).length;
    if (!best || pinned > best.pinned) best = { state: relabel(state), pinned };
  }
  return best;
}

/** Piece kinds whose sizes add up to exactly `cells`, with few enough dominoes and enough L/T/S/Z families. */
function pickKinds(p: SearchParams, rand: () => number): Kind[] | null {
  const [lo, hi] = p.pieceSize;
  const bySize = (n: number) => KINDS.filter((k) => SIZE[k] === n);
  for (let attempt = 0; attempt < 2000; attempt++) {
    const sizes = Array<number>(p.pieces).fill(lo);
    let extra = p.cells - lo * p.pieces;
    if (extra < 0 || extra > (hi - lo) * p.pieces) return null;
    while (extra > 0) {
      const i = Math.floor(rand() * p.pieces);
      if (sizes[i]! < hi) {
        sizes[i]!++;
        extra--;
      }
    }
    if (sizes.filter((n) => n === 2).length > p.maxDominoes) continue;
    const kinds = sizes.map((n) => {
      const options = bySize(n);
      if (options.length === 0) throw new Error(`No piece of ${n} cells in the catalogue`);
      return options[Math.floor(rand() * options.length)]!;
    });
    const families = new Set(kinds.map((k) => FAMILY_OF[k]).filter(Boolean));
    if (families.size >= p.minFamilies) return kinds;
  }
  return null;
}

function build(p: SearchParams, rails: Rails, kinds: readonly Kind[], rand: () => number): State | null {
  let state: State = { rows: p.rows, cols: p.cols, rails, blocks: [], moves: 0 };
  const cap = Math.ceil(p.pieces / COLOURS.length) + 1;
  const used = new Map<Colour, number>();
  const taken = new Set<string>();
  let ring = 0;
  const midRow = (p.rows - 1) / 2;
  const midCol = (p.cols - 1) / 2;
  const onRing = (c: Cell) => c.row === 0 || c.col === 0 || c.row === p.rows - 1 || c.col === p.cols - 1;

  for (let i = 0; i < kinds.length; i++) {
    const free = state.blocks.filter((b) => canExit(state, b.id)).map((b) => b.id);
    const options: { state: State; score: number; cells: Cell[] }[] = [];
    for (const shape of SHAPES[kinds[i]!]) {
      for (let row = 0; row < p.rows; row++) {
        for (let col = 0; col < p.cols; col++) {
          const cells = shape.map((o) => ({ row: row + o.row, col: col + o.col }));
          if (cells.some((c) => c.row >= p.rows || c.col >= p.cols || taken.has(`${c.row},${c.col}`))) continue;
          if (ring + cells.filter(onRing).length > p.ringMax) continue;
          for (const colour of COLOURS) {
            if ((used.get(colour) ?? 0) >= cap) continue;
            const block: Block = { id: `p${i}`, colour, anchor: { row, col }, shape };
            const next = { ...state, blocks: [...state.blocks, block] };
            if (!canExit(next, block.id)) continue;
            const blocked = free.filter((id) => !canExit(next, id)).length;
            const touching = cells.filter((c) =>
              Object.values(STEP).some((d) => taken.has(`${c.row + d.row},${c.col + d.col}`)),
            ).length;
            // Pull toward the middle so the board reads as one cluster.
            const spread = cells.reduce((n, c) => n + Math.abs(c.row - midRow) + Math.abs(c.col - midCol), 0) / cells.length;
            options.push({ state: next, cells, score: blocked * 3 + touching * 0.5 - spread + rand() * 2 });
          }
        }
      }
    }
    if (options.length === 0) return null;
    options.sort((a, b) => b.score - a.score);
    const pick = options[Math.floor(rand() * Math.min(3, options.length))]!;
    state = pick.state;
    for (const c of pick.cells) taken.add(`${c.row},${c.col}`);
    ring += pick.cells.filter(onRing).length;
    const colour = state.blocks.at(-1)!.colour;
    used.set(colour, (used.get(colour) ?? 0) + 1);
  }
  return state;
}

function meets(p: SearchParams, s: State): boolean {
  const free = s.blocks.filter((b) => canExit(s, b.id)).length;
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

/** Name pieces A, B, C... in reading order. */
function relabel(s: State): State {
  const order = [...s.blocks].sort((a, b) => a.anchor.row - b.anchor.row || a.anchor.col - b.anchor.col);
  return { ...s, blocks: order.map((b, i) => ({ ...b, id: String.fromCharCode(65 + i) })) };
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
