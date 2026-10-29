import { applyExit, boardToText, canExit, cellsOf, isSettled, isSolved, isStuck, type Block, type Colour, type Rails, type Side, type State } from '../engine';
import { clumping, colourSpread, railDistance } from './measures';
import { makeRandom, pickKinds, type SearchParams } from './search';
import { SHAPES } from './shapes';

/**
 * Job 022 (spike): gravity boards. Built in reverse, like every board, with
 * one extra move: a piece may go in under a stack, lifting the stack away
 * from the gravity rail to make room. Each step is checked forward: taking
 * the new piece out and letting the board settle must give back exactly the
 * board before it. So the build order, reversed, clears the board (rule 6),
 * and the falls along the way are part of the intended solution.
 */
export interface GravityParams
  extends Pick<SearchParams, 'rows' | 'cols' | 'pieces' | 'cells' | 'kinds' | 'sizeWeights' | 'smallShare' | 'colourShare' | 'tries' | 'seed'> {
  readonly gravity: Side;
  /** Same as SearchParams.colourMix: every colour's spread ratio must reach this. */
  readonly colourMix: number;
  /** Score per piece lifted when a piece goes in: falls on the way to the solution. */
  readonly liftPull: number;
  /** Score for a piece that could leave by a rail far from it (distance over the board's size). */
  readonly farPull: number;
  /** Annealing steps when dealing colours. */
  readonly colourSteps: number;
  /** Penalty per line stacked to within two cells of the far rail. */
  readonly headroom: number;
  /** Random plays per finished board to measure how often it strands. */
  readonly playouts: number;
  readonly verbose?: boolean;
}

export interface GravityResult {
  readonly state: State;
  /** The build order reversed: taps that clear the board. */
  readonly solution: readonly string[];
  /** Pieces lifted during the build: falls on the way to the solution. */
  readonly falls: number;
  readonly free: number;
  /** Share of random plays (p.playouts of them) that stranded. */
  readonly strands: number;
  /** The lowest colour spread ratio (job 012). */
  readonly spread: number;
}

const UP: Readonly<Record<Side, { row: number; col: number }>> = {
  bottom: { row: -1, col: 0 },
  top: { row: 1, col: 0 },
  left: { row: 0, col: 1 },
  right: { row: 0, col: -1 },
};

export function searchGravity(p: GravityParams, rails: Rails): GravityResult | null {
  const rand = makeRandom(p.seed);
  const params = { ...p, groups: [], free: [0, 99], ringMax: 99, centrePull: 0 } as SearchParams;
  let best: GravityResult | null = null;
  let bestRank: number[] = [];
  for (let t = 0; t < p.tries; t++) {
    const kinds = pickKinds(params, rand);
    if (!kinds) continue;
    const built = build(p, rails, kinds, rand);
    if (!built) continue;
    const s = dealColours(built.state, built.solution, p, rand);
    const spread = Math.min(...colourSpread(s).map((c) => c.ratio));
    const clump = clumping(s);
    const mixed = spread >= p.colourMix && clump.share < clump.random && shared(s, p.colourShare);
    const strands = strandRate(s, p.playouts, p.seed + t).stranded / p.playouts;
    const free = s.blocks.filter((b) => canExit(s, b.id)).length;
    if (p.verbose) console.error(`try ${t}: spread ${spread.toFixed(2)} clump ${clump.share.toFixed(2)}/${clump.random.toFixed(2)} shares ${shared(s, p.colourShare)} falls ${built.falls} free ${free} strands ${(100 * strands).toFixed(0)}%`);
    // Mixed colours first, then a board random play strands sometimes but not always (gravity
    // matters, and there is a way through), then the best spread, then the fewest free pieces.
    const rank = [mixed ? 0 : 1, strands >= 0.1 && strands <= 0.9 ? 0 : 1, -Math.round(spread * 20), free];
    if (!best || before(rank, bestRank)) {
      best = { state: s, solution: built.solution, falls: built.falls, free, strands, spread };
      bestRank = rank;
    }
  }
  return best;
}

/** Shapes and places only: each piece needs a clear lane to some rail when its turn comes. */
function build(p: GravityParams, rails: Rails, kinds: readonly (keyof typeof SHAPES)[], rand: () => number): { state: State; solution: string[]; falls: number } | null {
  let s: State = { rows: p.rows, cols: p.cols, rails, gravity: p.gravity, blocks: [] };
  const order: string[] = [];
  let falls = 0;
  // Big pieces first (they are tapped last), a little shuffled.
  const queue = kinds.map((k) => ({ k, w: SHAPES[k][0]!.length + rand() * 1.5 })).sort((a, b) => b.w - a.w).map((x) => x.k);
  for (let i = 0; i < queue.length; i++) {
    const id = `g${i}`;
    const options: { state: State; lifted: number; score: number }[] = [];
    const tries: { shape: (typeof SHAPES)[keyof typeof SHAPES][number]; row: number; col: number }[] = [];
    for (const shape of SHAPES[queue[i]!]) {
      for (let row = 0; row < p.rows; row++) for (let col = 0; col < p.cols; col++) tries.push({ shape, row, col });
    }
    shuffle(tries, rand);
    for (const t of tries) {
      const placed = place(s, { id, colour: 'amber', anchor: { row: t.row, col: t.col }, shape: t.shape });
      if (!placed) continue;
      // Keep headroom: a line stacked to the far rail leaves the last pieces nowhere to go.
      const full = crowded(placed.state);
      // A piece that can leave by a far rail lets colour stop following position (job 012).
      options.push({ ...placed, score: placed.lifted * p.liftPull - full * p.headroom + contacts(placed.state, placed.piece) * 0.3 + placed.far * p.farPull + rand() });
      if (options.length >= 48) break;
    }
    if (options.length === 0) {
      if (p.verbose) console.error(`  stuck at piece ${i} of ${queue.length} (${queue[i]})\n${boardToText(s)}`);
      return null;
    }
    const pick = options.reduce((a, b) => (b.score > a.score ? b : a));
    s = pick.state;
    falls += pick.lifted;
    order.unshift(id);
  }
  return { state: s, solution: order, falls };
}

/**
 * Colours for a built board. Settling ignores colour, so the boards along
 * the solution are fixed by the shapes: at each piece's turn, the rails it
 * could leave by are known, and any choice among them still clears. Choose
 * by annealing toward each colour's share, spread (job 012) and fewer
 * same-colour neighbours than a random deal (job 018).
 */
function dealColours(state: State, solution: readonly string[], p: GravityParams, rand: () => number): State {
  const sides = Object.keys(state.rails) as Side[];
  const allowed = new Map<string, Colour[]>();
  let s = state;
  for (const id of solution) {
    const recolour = (c: Colour): State => ({ ...s, blocks: s.blocks.map((b) => (b.id === id ? { ...b, colour: c } : b)) });
    const ok = sides.map((k) => state.rails[k]).filter((c) => canExit(recolour(c), id));
    allowed.set(id, ok);
    s = applyExit(recolour(ok[0]!), id)!;
  }
  const ids = state.blocks.map((b) => b.id);
  const colours = ids.map((id) => allowed.get(id)![Math.floor(rand() * allowed.get(id)!.length)]!);
  const board = () => ({ ...state, blocks: state.blocks.map((b, i) => ({ ...b, colour: colours[i]! })) });
  const cost = (): number => {
    const b = board();
    const n = ids.length;
    let share = 0;
    for (const k of sides) {
      const count = colours.filter((c) => c === state.rails[k]).length;
      share += Math.max(0, Math.ceil(p.colourShare[0] * n) - count) + Math.max(0, count - Math.floor(p.colourShare[1] * n));
    }
    const spread = Math.min(...colourSpread(b).map((c) => c.ratio));
    const clump = clumping(b);
    return share * 100 + Math.max(0, p.colourMix - spread) * 200 + Math.max(0, clump.share - clump.random + 0.01) * 200;
  };
  let now = cost();
  let bestCost = now;
  let best = [...colours];
  for (let step = 0; step < p.colourSteps && bestCost > 0; step++) {
    const i = Math.floor(rand() * ids.length);
    const options = allowed.get(ids[i]!)!;
    if (options.length < 2) continue;
    const was = colours[i]!;
    colours[i] = options[Math.floor(rand() * options.length)]!;
    const next = cost();
    const temperature = 1 - step / p.colourSteps + 0.02;
    if (next <= now || rand() < Math.exp((now - next) / (temperature * 10))) {
      now = next;
      if (now < bestCost) {
        bestCost = now;
        best = [...colours];
      }
    } else {
      colours[i] = was;
    }
  }
  return { ...state, blocks: state.blocks.map((b, i) => ({ ...b, colour: best[i]! })) };
}

/** Every colour inside its share of the pieces. */
function shared(s: State, range: readonly [number, number]): boolean {
  const n = s.blocks.length;
  return (['amber', 'cyan', 'violet', 'mint'] as const).every((c) => {
    const share = s.blocks.filter((b) => b.colour === c).length / n;
    return share >= range[0] && share <= range[1];
  });
}

/** How many pieces touch this one. */
function contacts(s: State, piece: Block): number {
  const mine = new Set(cellsOf(piece).map((c) => `${c.row},${c.col}`));
  return s.blocks.filter((b) => b.id !== piece.id && cellsOf(b).some((c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => mine.has(`${c.row + dr!},${c.col + dc!}`)))).length;
}

/**
 * Put piece P into the board, lifting what stands in its way (and whatever
 * rests on that) away from the gravity rail. Null unless P can leave, the
 * board is settled, and taking P out settles back to `s` exactly.
 */
function place(s: State, piece: Block): { state: State; lifted: number; piece: Block; far: number; open: number } | null {
  const cells = cellsOf(piece);
  if (!cells.every((c) => c.row >= 0 && c.row < s.rows && c.col >= 0 && c.col < s.cols)) return null;
  const up = UP[s.gravity!];
  const owner = new Map<string, string>();
  for (const b of s.blocks) for (const c of cellsOf(b)) owner.set(`${c.row},${c.col}`, b.id);
  const hit = new Set(cells.map((c) => owner.get(`${c.row},${c.col}`)).filter((x): x is string => !!x));
  let blocks: Block[] = [...s.blocks, piece];
  let lifted = 0;
  if (hit.size > 0) {
    const mine = new Set(cells.map((c) => `${c.row},${c.col}`));
    let found: Block[] | null = null;
    for (let k = 1; k <= Math.max(s.rows, s.cols) && !found; k++) {
      const lift = new Set(hit);
      for (let grew = true; grew; ) {
        grew = false;
        const moved = new Set<string>();
        for (const b of s.blocks) if (lift.has(b.id)) for (const c of cellsOf(b)) moved.add(`${c.row + up.row * k},${c.col + up.col * k}`);
        for (const [cell, id] of owner) if (moved.has(cell) && !lift.has(id)) { lift.add(id); grew = true; }
        if (!grew) {
          const fits = [...moved].every((m) => {
            const [r, c] = m.split(',').map(Number) as [number, number];
            return r >= 0 && r < s.rows && c >= 0 && c < s.cols && !mine.has(m);
          });
          if (fits) {
            found = s.blocks.map((b) => (lift.has(b.id) ? { ...b, anchor: { row: b.anchor.row + up.row * k, col: b.anchor.col + up.col * k } } : b));
            lifted = lift.size;
          }
        }
      }
    }
    if (!found) return null;
    blocks = [...found, piece];
  }
  // Any rail will do for now; colours are dealt once the board is built.
  const open = (['amber', 'cyan', 'violet', 'mint'] as const).filter((c) =>
    canExit({ ...s, blocks: blocks.map((b) => (b.id === piece.id ? { ...b, colour: c } : b)) }, piece.id));
  const colour = open[0];
  if (!colour) return null;
  blocks = blocks.map((b) => (b.id === piece.id ? { ...b, colour } : b));
  piece = { ...piece, colour };
  const next: State = { ...s, blocks };
  if (!isSettled(next)) return null;
  const back = applyExit(next, piece.id)!;
  const at = new Map(back.blocks.map((b) => [b.id, b.anchor]));
  if (!s.blocks.every((b) => at.get(b.id)?.row === b.anchor.row && at.get(b.id)?.col === b.anchor.col)) return null;
  // How far the piece is from the farthest rail it could leave by, over the board's size.
  const sides = Object.keys(s.rails) as Side[];
  const far = Math.max(...open.map((c) => {
    const side = sides.find((k) => s.rails[k] === c)!;
    return railDistance(cells, side, s.rows, s.cols) / (side === 'top' || side === 'bottom' ? s.rows : s.cols);
  }));
  return { state: next, lifted, piece, far, open: open.length };
}

/** Lines along the pull whose stack comes within two cells of the far rail. */
function crowded(s: State): number {
  const along = s.gravity === 'top' || s.gravity === 'bottom';
  const lines = along ? s.cols : s.rows;
  const length = along ? s.rows : s.cols;
  const reach = Array<number>(lines).fill(0);
  for (const c of s.blocks.flatMap(cellsOf)) {
    const line = along ? c.col : c.row;
    const pos = along ? c.row : c.col;
    // Height of this cell above the gravity rail, counted from 1.
    const height = s.gravity === 'bottom' ? length - pos : s.gravity === 'top' ? pos + 1 : s.gravity === 'right' ? length - pos : pos + 1;
    reach[line] = Math.max(reach[line]!, height);
  }
  return reach.filter((h) => h > length - 2).length;
}

/** Is rank a ahead of rank b (smaller at the first place they differ)? */
function before(a: readonly number[], b: readonly number[]): boolean {
  const i = a.findIndex((v, k) => v !== b[k]);
  return i >= 0 && a[i]! < b[i]!;
}

function shuffle<T>(a: T[], rand: () => number): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
}

/** Random play: from the start, tap any piece that can leave, until cleared or stuck. */
export function strandRate(state: State, runs: number, seed: number): { stranded: number; runs: number } {
  const rand = makeRandom(seed);
  let stranded = 0;
  for (let r = 0; r < runs; r++) {
    let s = state;
    while (!isSolved(s) && !isStuck(s)) {
      const free = s.blocks.filter((b) => canExit(s, b.id));
      s = applyExit(s, free[Math.floor(rand() * free.length)]!.id)!;
    }
    if (!isSolved(s)) stranded++;
  }
  return { stranded, runs };
}
