import { applyExit, canExit, cellsOf, findBlock, isSolved, type Block, type Cell, type Colour, type Rails, type Side, type State } from '../engine';
import { cages, heldBySibling, railDistance, threads } from './measures';
import { MOTIF_CELLS, MOTIF_PIECES, MOTIF_TURNS, notchOf, placementOrder, SHAPES, SIZE, type Kind, type MotifName } from './shapes';

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
  /**
   * Shape groups to place (job 014), each as one unit in one colour: nests
   * of L's and staircases. Their pieces and cells count toward the totals.
   */
  readonly groups: readonly MotifName[];
  /** Relative weight of each piece size, in cells. Sizes left out are not used. */
  readonly sizeWeights: Readonly<Partial<Record<number, number>>>;
  /** Job 019: relative weight of each kind within its size (default 1). Left out, kinds of a size are equally likely. */
  readonly kindWeights?: Readonly<Partial<Record<Kind, number>>>;
  /** Job 019: share of all pieces that are single cells, inclusive range. */
  readonly singleShare?: readonly [number, number];
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
  /**
   * Colour mixing (job 012): every colour's spread ratio (own-rail distance
   * against the board's, see measures.ts) must reach this. 0 is off.
   */
  readonly colourMix: number;
  /**
   * Threaded pieces (job 015): small pieces whose lane is a one-cell channel
   * through the crowd (see measures.ts threads). The board must have at
   * least this many. Left out, none are planted.
   */
  readonly threads?: number;
  /** Job 016: each thread's channel is at least this many cells (default 2). */
  readonly threadChannel?: number;
  /**
   * Job 016: this many of the threads have a channel closed at its outer end
   * by a piece, so it cannot be seen from the board edge.
   */
  readonly closedThreads?: number;
  /**
   * Job 015: build with any colour and let mixing deal each colour its
   * share. Needs colourMix. Off, the build keeps to the quota (levels 6 to
   * 10 were built that way and stay as they are).
   */
  readonly dealShares?: boolean;
  /**
   * Job 019: pieces caged in a U. The board must have at least this many
   * U's leaving toward their opening with a piece in their notch, so the U
   * waits for it (see measures.ts cages).
   */
  readonly cages?: number;
  /** Job 018: at least this many long bars (4 or 5 cells) outside the shape groups, as landmarks. */
  readonly bars?: number;
  /**
   * Place each piece where it blocks the most free pieces (default). Job 018
   * turns this off for 12x15 boards without single cells: it walls in the
   * middle early and the last pieces find no lane.
   */
  readonly blockFirst?: boolean;
  /**
   * Same-colour neighbours allowed, against what a random deal of the
   * board's colours gives: +0.05 (job 012, the default) is within five
   * points; job 018 asks for below random, a negative number.
   */
  readonly clumpMargin?: number;
  /**
   * Job 019: deal colours by peeling the board, then polish them by
   * annealing (see mixColours). Big interlocking strokes leave almost no
   * single trade that keeps every piece clearable, so a random deal and
   * plain hill climbing stall.
   */
  readonly peel?: boolean;
  /** Job 019: score per cell, so big strokes go down early (tapped late) while there is room for them. */
  readonly sizePull?: number;
  /**
   * Job 019: never take a spot that leaves fewer empty cells with a clear
   * line to an edge than there are pieces still to place.
   */
  readonly landing?: boolean;
  /**
   * Job 021: split this many pieces of the chosen board, each with its
   * order forced (see splitPieces). Done once on the winner, with its own
   * random numbers, so the board itself is the one the search picked.
   */
  readonly splits?: number;
  readonly tries: number;
  readonly seed: number;
}

export interface SearchResult {
  readonly state: State;
  /** Pieces held by two or more different neighbours on the way to their rail. */
  readonly pinned: number;
  /** Job 021: pieces split (asked for with `splits`). */
  readonly split?: number;
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
    const shares = colourQuota(params, rand)!;
    const built = build(params, rails, kinds, shares, rand);
    const state = built && params.colourMix > 0
      ? mixColours(built.state, params.colourMix, rand, built.fixed, params.dealShares ? shares : null, params.clumpMargin ?? 0.05, params.peel ?? false)
      : built?.state;
    if (!state || !meets(params, state)) continue;
    const pinned = state.blocks.filter((b) => blockerCount(state, b) >= 2).length;
    const rank = [largestGap(state), freeCount(state), -pinned];
    if (!best || compare(rank, bestRank) < 0) {
      best = { state: relabel(state), pinned };
      bestRank = rank;
    }
  }
  if (best && params.splits) {
    const { state, split } = splitPieces(best.state, params.splits, makeRandom(params.seed + 7919));
    if (split < params.splits) return null;
    best = { ...best, state, split };
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
 * Piece kinds for the pieces outside groups, drawn by size weight, then
 * nudged one cell at a time (within the allowed sizes) until the board adds
 * up to exactly `cells`.
 */
export function pickKinds(params: SearchParams, rand: () => number): Kind[] | null {
  const p = {
    ...params,
    pieces: params.pieces - params.groups.reduce((n, g) => n + MOTIF_PIECES[g], 0),
    cells: params.cells - params.groups.reduce((n, g) => n + MOTIF_CELLS[g], 0),
  };
  if (p.pieces < 0 || p.cells < 0) return null;
  const sizes = [...new Set(p.kinds.map((k) => SIZE[k]))].filter((n) => (p.sizeWeights[n] ?? 0) > 0).sort((a, b) => a - b);
  if (sizes.length === 0) return null;
  const total = sizes.reduce((n, size) => n + p.sizeWeights[size]!, 0);
  const draw = () => {
    let r = rand() * total;
    for (const size of sizes) if ((r -= p.sizeWeights[size]!) < 0) return size;
    return sizes.at(-1)!;
  };
  const picked = Array.from({ length: p.pieces }, draw);
  // Long bars (job 018) are the first few picks, held at 4 or 5 cells.
  const bars = Math.min(p.bars ?? 0, picked.length);
  for (let i = 0; i < bars; i++) picked[i] = picked[i]! === 5 ? 5 : 4;
  let sum = picked.reduce((n, size) => n + size, 0);
  for (let guard = 0; sum !== p.cells && guard < 10000; guard++) {
    const i = bars + Math.floor(rand() * (picked.length - bars));
    if (i >= picked.length) break;
    const next = sizes[sizes.indexOf(picked[i]!) + (sum < p.cells ? 1 : -1)];
    if (next === undefined) continue;
    sum += next - picked[i]!;
    picked[i] = next;
  }
  if (sum !== p.cells) return null;
  if (picked.filter((n) => n === 2 || n === 3).length < p.smallShare * p.pieces) return null;
  if (p.singleShare) {
    const share = picked.filter((n) => n === 1).length / params.pieces;
    if (share < p.singleShare[0] || share > p.singleShare[1]) return null;
  }
  const weights = p.kindWeights;
  return picked.map((size, i) => {
    const options = p.kinds.filter((k) => SIZE[k] === size && (i >= bars || BAR_KINDS.includes(k)));
    if (!weights) return options[Math.floor(rand() * options.length)]!;
    let r = rand() * options.reduce((n, k) => n + (weights[k] ?? 1), 0);
    for (const k of options) if ((r -= weights[k] ?? 1) < 0) return k;
    return options.at(-1)!;
  });
}

const key = (row: number, col: number) => row * 100 + col;
const BAR_KINDS: readonly Kind[] = ['I4', 'I5'];

/**
 * Place the pieces in reverse. Works on the set of taken cells: a spot is
 * allowed if every cell from it to its colour's rail is free, and it blocks
 * a free piece if it lands on that piece's path to its rail. At each step any
 * remaining kind or group may be placed, so the last few still find room.
 * A group's pieces go down in its own reverse tap order, each needing a
 * clear path past the board and the group pieces already down.
 */
function build(
  p: SearchParams,
  rails: Rails,
  kinds: readonly Kind[],
  quota: Map<Colour, number>,
  rand: () => number,
): { state: State; fixed: ReadonlySet<string> } | null {
  const sideOf = new Map((Object.keys(rails) as (keyof Rails)[]).map((side) => [rails[side], side] as const));
  const taken = new Set<number>();
  const placed: Block[] = [];
  const paths: Set<number>[] = [];
  const remaining = [...kinds];
  const groupsLeft = [...p.groups];
  const used = new Map<Colour, number>();
  // Threads (jobs 015, 016): planted at the first spots that qualify once a quarter of the board
  // is down, in front of a piece already there. The channel is kept empty, the next pieces wall it
  // in on both sides (and close its outer end, for a closed one, planted first), and the thread
  // and the piece it holds keep their colours through mixing.
  const total = kinds.length + p.groups.length;
  let threadsLeft = p.threads ?? 0;
  let closedLeft = p.closedThreads ?? 0;
  const channelLength = p.threadChannel ?? 2;
  const singles = p.kinds.some((k) => SIZE[k] === 1);
  const reserved = new Set<number>();
  const flanks = new Set<number>();
  // Cages (job 019): once a U is down leaving toward its opening, its empty notch cells, by U.
  let cagesLeft = p.cages ?? 0;
  const notches = new Map<number, string>();
  const fixed = new Set<string>();
  let ring = 0;
  let pieceCount = 0;
  let groupCount = 0;
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
  /** Cells on both sides of a lane, across its direction; null if the lane runs along the edge. */
  const sidesOf = (path: ReadonlySet<number>, d: Cell) => {
    const out: number[] = [];
    for (const k of path) {
      const r = Math.floor(k / 100), c = k % 100;
      if (!inside(r + d.col, c + d.row) || !inside(r - d.col, c - d.row)) return null;
      out.push(key(r + d.col, c + d.row), key(r - d.col, c - d.row));
    }
    return out;
  };
  /**
   * A thread's spot: 1 to 3 cells, one cell wide across its way out, in
   * front of a piece already down, with a channel of `channelLength` cells
   * or more clear of the edge rows and columns and of other threads. An open
   * channel is the whole lane; a closed one is the first `channelLength`
   * cells, and the next cell (the cap) must still be free to fill. Gives the
   * channel cells and the cap, or null.
   */
  const channel = (cells: readonly Cell[], d: Cell, path: ReadonlySet<number>, blocked: number) => {
    const across = d.row === 0 ? 'row' : 'col';
    const closed = closedLeft > 0;
    if (cells.length > 3 || blocked === 0 || path.size < channelLength + (closed ? 1 : 0)) return null;
    if (new Set(cells.map((c) => c[across])).size !== 1) return null;
    const lane = [...path].sort((a, b) => (Math.floor(a / 100) - Math.floor(b / 100)) * d.row + ((a % 100) - (b % 100)) * d.col);
    const run = new Set(closed ? lane.slice(0, channelLength) : lane);
    const cap = closed ? lane[channelLength]! : null;
    if ([...run, ...(cap === null ? [] : [cap])].some((k) => reserved.has(k) || flanks.has(k))) return null;
    const walls = sidesOf(run, d);
    if (walls === null || walls.some((k) => reserved.has(k))) return null;
    return { run, walls, cap };
  };
  /** Empty cells, with `cells` filled too, that have a clear straight line to some edge. */
  const landing = (cells: readonly Cell[]) => {
    const own = new Set(cells.map((c) => key(c.row, c.col)));
    const full = (r: number, c: number) => taken.has(key(r, c)) || own.has(key(r, c));
    let n = 0;
    for (let r = 0; r < p.rows; r++) {
      for (let c = 0; c < p.cols; c++) {
        if (full(r, c) || reserved.has(key(r, c))) continue;
        const clear = Object.values(STEP).some((d) => {
          for (let y = r + d.row, x = c + d.col; inside(y, x); y += d.row, x += d.col) if (full(y, x)) return false;
          return true;
        });
        if (clear) n++;
      }
    }
    return n;
  };
  type Option = {
    pieces: { cells: Cell[]; anchor: Cell; shape: Cell[]; path: Set<number> }[];
    colour: Colour;
    unit: { kind: Kind } | { motif: MotifName };
    blocked: number;
    walls: number;
    caging: number;
    holes: number;
    score: number;
    thread: ReturnType<typeof channel>;
  };

  for (let step = 0; step < total; step++) {
    const freeIds = paths.flatMap((path, i) => ([...path].some((k) => taken.has(k)) ? [] : [i]));
    const free = freeIds.map((i) => paths[i]!);
    const threading = threadsLeft > 0 && step >= total / 4;
    const options: Option[] = [];
    const judge = (cells: readonly Cell[]) => {
      const touching = cells.filter((c) => Object.values(STEP).some((d) => taken.has(key(c.row + d.row, c.col + d.col)))).length;
      // Pull toward the middle so early boards read as one cluster.
      const spread = cells.reduce((n, c) => n + Math.abs(c.row - midRow) + Math.abs(c.col - midCol), 0) / cells.length;
      const blocked = free.filter((path) => cells.some((c) => path.has(key(c.row, c.col)))).length;
      // Wall in the threads' channels.
      const walls = flanks.size === 0 ? 0 : cells.filter((c) => flanks.has(key(c.row, c.col))).length;
      // Fill a U's notch.
      const caging = notches.size === 0 ? 0 : cells.filter((c) => notches.has(key(c.row, c.col))).length;
      // Without single cells (job 018), an empty cell cut off from every other is a hole no piece
      // can fill; count the ones this spot would make.
      let holes = 0;
      if (!singles) {
        const own = new Set(cells.map((c) => key(c.row, c.col)));
        const open = (r: number, c: number) => inside(r, c) && !taken.has(key(r, c)) && !reserved.has(key(r, c)) && !own.has(key(r, c));
        const seen = new Set<number>();
        for (const c of cells) {
          for (const d of Object.values(STEP)) {
            const r = c.row + d.row, k = c.col + d.col;
            if (!open(r, k) || seen.has(key(r, k))) continue;
            seen.add(key(r, k));
            if (!Object.values(STEP).some((e) => open(r + e.row, k + e.col))) holes++;
          }
        }
      }
      return { blocked, walls, caging, holes, base: touching * 0.5 - spread * p.centrePull + cells.length * (p.sizePull ?? 0) };
    };
    for (const kind of new Set(remaining)) {
      for (const shape of SHAPES[kind]) {
        for (let row = 0; row < p.rows; row++) {
          for (let col = 0; col < p.cols; col++) {
            const cells = shape.map((o) => ({ row: row + o.row, col: col + o.col }));
            if (cells.some((c) => !inside(c.row, c.col) || taken.has(key(c.row, c.col)) || reserved.has(key(c.row, c.col)))) continue;
            if (ring + cells.filter(onRing).length > p.ringMax) continue;
            const { blocked, walls, caging, holes, base } = judge(cells);
            for (const colour of COLOURS) {
              if (!p.dealShares && (used.get(colour) ?? 0) >= quota.get(colour)!) continue;
              const path = pathOf(cells, STEP[sideOf.get(colour)!]);
              if ([...path].some((k) => taken.has(k))) continue;
              const thread = threading ? channel(cells, STEP[sideOf.get(colour)!], path, blocked) : null;
              // The chance term is drawn per valid colour, as before groups existed, so boards
              // without groups come out exactly as they did.
              options.push({ pieces: [{ cells, anchor: { row, col }, shape, path }], colour, unit: { kind }, blocked, walls, caging, holes, score: base + rand() * 2, thread });
            }
          }
        }
      }
    }
    for (const motif of new Set(groupsLeft)) {
      for (const turn of MOTIF_TURNS[motif]) {
        for (let row = 0; row < p.rows; row++) {
          for (let col = 0; col < p.cols; col++) {
            const pieces = turn.map((shape) => shape.map((o) => ({ row: row + o.row, col: col + o.col })));
            const all = pieces.flat();
            if (all.some((c) => !inside(c.row, c.col) || taken.has(key(c.row, c.col)) || reserved.has(key(c.row, c.col)))) continue;
            if (ring + all.filter(onRing).length > p.ringMax) continue;
            const { blocked, walls, caging, holes, base } = judge(all);
            for (const colour of COLOURS) {
              if (!p.dealShares && (used.get(colour) ?? 0) + turn.length > quota.get(colour)!) continue;
              const side = sideOf.get(colour)!;
              const order = placementOrder(turn, side);
              if (!order) continue;
              const down = new Set(taken);
              const ordered = [];
              for (const i of order) {
                const path = pathOf(pieces[i]!, STEP[side]);
                if ([...path].some((k) => down.has(k))) break;
                ordered.push({ cells: pieces[i]!, anchor: { row, col }, shape: [...turn[i]!], path });
                for (const c of pieces[i]!) down.add(key(c.row, c.col));
              }
              if (ordered.length < order.length) continue;
              options.push({ pieces: ordered, colour, unit: { motif }, blocked, walls, caging, holes, score: base + rand() * 2, thread: null });
            }
          }
        }
      }
    }
    if (options.length === 0) return null;
    // Block as many free pieces as possible; among those spots, touch
    // neighbours and keep to the middle, with a little chance. A thread's spot
    // comes first while one is still to plant, then a piece for a U's notch,
    // then walls for a channel.
    const planting = options.some((o) => o.thread);
    const caging = options.some((o) => o.caging > 0);
    const walling = options.some((o) => o.walls > 0);
    const pool = planting ? options.filter((o) => o.thread)
      : caging ? options.filter((o) => o.caging > 0)
      : walling ? options.filter((o) => o.walls > 0)
      : options;
    // Spots that strand no hole first (boards without single cells), then, unless
    // blockFirst is off, the ones blocking the most free pieces.
    const fewest = Math.min(...pool.map((o) => o.holes));
    const most = p.blockFirst === false ? 0 : Math.max(...pool.filter((o) => o.holes === fewest).map((o) => o.blocked));
    const ranked = pool.filter((o) => o.holes === fewest && o.blocked >= most).sort((a, b) => b.score - a.score);
    let best = ranked;
    if (p.landing) {
      // Job 019: keep at least one empty cell with a clear line to an edge for every unit still to place.
      const left = remaining.length + groupsLeft.length - 1;
      const kept: Option[] = [];
      for (const o of ranked) {
        if (landing(o.pieces.flatMap((x) => x.cells)) >= left) kept.push(o);
        if (kept.length === 3) break;
      }
      if (kept.length > 0) best = kept;
    }
    const pick = best[Math.floor(rand() * Math.min(3, best.length))]!;
    const group = 'motif' in pick.unit ? `g${++groupCount}` : undefined;
    if (pick.thread) {
      threadsLeft--;
      if (pick.thread.cap !== null) closedLeft--;
      fixed.add(`p${pieceCount}`);
      const held = freeIds.find((i) => pick.pieces[0]!.cells.some((c) => paths[i]!.has(key(c.row, c.col))))!;
      // A held piece in a shape group keeps the whole group's colour.
      const heldGroup = placed[held]!.group;
      for (const b of placed) if (b.id === `p${held}` || (heldGroup && b.group === heldGroup)) fixed.add(b.id);
      for (const k of pick.thread.run) reserved.add(k);
      for (const k of [...pick.thread.walls, ...(pick.thread.cap === null ? [] : [pick.thread.cap])]) flanks.add(k);
    }
    if (pick.caging > 0) {
      // The U and the piece it cages keep their colours: both leave out of the opening.
      const u = notches.get([...pick.pieces[0]!.cells].map((c) => key(c.row, c.col)).find((k) => notches.has(k))!)!;
      fixed.add(u);
      fixed.add(`p${pieceCount}`);
      if (--cagesLeft === 0) notches.clear();
      else for (const [k, id] of notches) if (id === u) notches.delete(k);
    }
    for (const piece of pick.pieces) {
      if (cagesLeft > 0 && !pick.thread) {
        const notch = notchOf(piece.shape).map((o) => key(piece.anchor.row + o.row, piece.anchor.col + o.col));
        // Only a U leaving toward its opening has its notch in its own lane.
        if (notch.length > 0 && notch.every((k) => piece.path.has(k) && !taken.has(k) && !reserved.has(k))) {
          for (const k of notch) notches.set(k, `p${pieceCount}`);
        }
      }
      placed.push({ id: `p${pieceCount++}`, colour: pick.colour, anchor: piece.anchor, shape: piece.shape, ...(group ? { group } : {}) });
      paths.push(piece.path);
      for (const c of piece.cells) {
        taken.add(key(c.row, c.col));
        flanks.delete(key(c.row, c.col));
      }
      if (notches.size > 0) {
        // A notch cell now taken by anyone else is filled; a U whose notch filled up otherwise drops out.
        const u = [...piece.cells].map((c) => notches.get(key(c.row, c.col))).find((id) => id !== undefined);
        if (u !== undefined) for (const [k, id] of notches) if (id === u) notches.delete(k);
      }
      ring += piece.cells.filter(onRing).length;
    }
    if ('kind' in pick.unit) remaining.splice(remaining.indexOf(pick.unit.kind), 1);
    else groupsLeft.splice(groupsLeft.indexOf(pick.unit.motif), 1);
    used.set(pick.colour, (used.get(pick.colour) ?? 0) + pick.pieces.length);
  }
  return { state: { rows: p.rows, cols: p.cols, rails, blocks: placed }, fixed };
}

/**
 * Job 012: deal the board's colours out again at random, so colour says
 * nothing about position, then repair by swapping two pieces' colours
 * (shares stay the same). First, swaps that leave fewer pieces stuck while
 * every colour keeps the spread target. Then, swaps that break up
 * same-colour neighbours, down to what a random deal gives plus the margin
 * (five points by default; below random for job 018), keeping the board
 * clearable and the spread. Null if it cannot get there.
 *
 * Positions never change here, so each piece's blockers toward each rail,
 * its distance to each rail and which pieces touch are worked out once.
 * A shape group (job 014) is one unit: its pieces share a colour and change
 * colour together, trading with a unit of the same size or with as many
 * single pieces; touching inside it is not clumping. Fixed pieces (threads,
 * job 015) keep the colour they were built with. With shares given, the deal
 * hands out those counts rather than the build's.
 *
 * Peeling (job 019) deals instead by clearing the board in thought: take a
 * piece with a clear lane, give it the colour of a rail it can reach now,
 * remove it, repeat. Removing never blocks anything, so the colouring clears
 * by construction. Each colour is picked for its share, a far rail (spread)
 * and no same-colour neighbour. Groups and fixed pieces keep the colours
 * they were built with. The polish then anneals: it scores spread and
 * clumping shortfalls, never takes a trade that leaves a piece stuck, takes
 * any other that does not raise the score, and now and then one that does,
 * less often as it cools.
 */
function mixColours(
  s: State,
  target: number,
  rand: () => number,
  fixed: ReadonlySet<string>,
  shares: ReadonlyMap<Colour, number> | null,
  clumpMargin: number,
  peel: boolean,
): State | null {
  const sides = (Object.keys(s.rails) as Side[]);
  const sideOf = new Map(sides.map((side) => [s.rails[side], side] as const));
  const n = s.blocks.length;
  const index = new Map(s.blocks.map((b, i) => [b.id, i] as const));
  const owner = new Map<number, number>();
  s.blocks.forEach((b, i) => cellsOf(b).forEach((c) => owner.set(key(c.row, c.col), i)));
  // lanes[i][side]: pieces between piece i and that rail. dist[i][side]: rows or columns to that rail.
  const lanes = s.blocks.map((b, i) =>
    Object.fromEntries(sides.map((side) => {
      const d = STEP[side];
      const ids = new Set<number>();
      for (const c of cellsOf(b)) {
        for (let r = c.row + d.row, k = c.col + d.col; r >= 0 && r < s.rows && k >= 0 && k < s.cols; r += d.row, k += d.col) {
          const o = owner.get(key(r, k));
          if (o !== undefined && o !== i) ids.add(o);
        }
      }
      return [side, [...ids]];
    })) as Record<Side, number[]>,
  );
  const dist = s.blocks.map((b) => Object.fromEntries(sides.map((side) => [side, railDistance(cellsOf(b), side, s.rows, s.cols)])) as Record<Side, number>);
  const unitNames = [...new Set(s.blocks.map((b, i) => b.group ?? `#${i}`))];
  const unitOf = s.blocks.map((b, i) => unitNames.indexOf(b.group ?? `#${i}`));
  const units = unitNames.map((_, u) => unitOf.flatMap((x, i) => (x === u ? [i] : [])));
  const pinned = s.blocks.map((b) => fixed.has(b.id));
  // A group may only take a colour whose path runs through its own pieces, so one
  // piece of it still holds another and it reads as one shape.
  const allowed = units.map((u) =>
    u.length === 1
      ? new Set(sideOf.keys())
      : new Set([...sideOf].filter(([, side]) => u.some((i) => lanes[i]![side].some((j) => u.includes(j)))).map(([c]) => c)),
  );
  const touching: [number, number][] = [];
  const seenPair = new Set<number>();
  s.blocks.forEach((b, i) => cellsOf(b).forEach((c) => {
    for (const d of [STEP.right, STEP.bottom]) {
      const j = owner.get(key(c.row + d.row, c.col + d.col));
      if (j === undefined || j === i || unitOf[i] === unitOf[j] || seenPair.has(Math.min(i, j) * 1000 + Math.max(i, j))) continue;
      seenPair.add(Math.min(i, j) * 1000 + Math.max(i, j));
      touching.push([i, j]);
    }
  }));

  /** Pieces that taps can never clear, for this colouring (removal in dependency order). */
  const stuck = (colours: readonly Colour[]): number[] => {
    const waiting = colours.map((c, i) => lanes[i]![sideOf.get(c)!].length);
    const freedBy: number[][] = Array.from({ length: n }, () => []);
    colours.forEach((c, i) => lanes[i]![sideOf.get(c)!].forEach((j) => freedBy[j]!.push(i)));
    const queue = waiting.flatMap((w, i) => (w === 0 ? [i] : []));
    const gone = new Array<boolean>(n).fill(false);
    while (queue.length > 0) {
      const i = queue.pop()!;
      gone[i] = true;
      for (const j of freedBy[i]!) if (--waiting[j]! === 0) queue.push(j);
    }
    return gone.flatMap((g, i) => (g ? [] : [i]));
  };
  /** The worst colour's spread ratio (see measures.ts colourSpread). */
  const spread = (colours: readonly Colour[]): number => {
    let worst = Infinity;
    for (const [colour, side] of sideOf) {
      let own = 0, mine = 0, all = 0;
      colours.forEach((c, i) => {
        all += dist[i]![side];
        if (c === colour) { own += dist[i]![side]; mine++; }
      });
      worst = Math.min(worst, all === 0 ? 1 : own / mine / (all / n));
    }
    return worst;
  };

  /** Share of touching pairs that are the same colour. */
  const clump = (colours: readonly Colour[]) =>
    touching.length === 0 ? 0 : touching.filter(([i, j]) => colours[i] === colours[j]).length / touching.length;

  const colours = s.blocks.map((b) => b.colour);
  if (units.every((u) => u.length === 1) && fixed.size === 0 && !shares) {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [colours[i], colours[j]] = [colours[j]!, colours[i]!];
    }
  } else {
    // Groups first, each to a colour with enough left; then the single pieces at random.
    const left = new Map<Colour, number>();
    if (shares) {
      for (const [c, k] of shares) left.set(c, k);
      colours.forEach((c, i) => { if (pinned[i]) left.set(c, left.get(c)! - 1); });
      if ([...left.values()].some((k) => k < 0)) return null;
    } else {
      colours.forEach((c, i) => { if (!pinned[i]) left.set(c, (left.get(c) ?? 0) + 1); });
    }
    for (const u of [...units].filter((u) => u.length > 1 && !pinned[u[0]!]).sort((a, b) => b.length - a.length)) {
      const fits = [...left].filter(([c, k]) => k >= u.length && allowed[units.indexOf(u)]!.has(c)).map(([c]) => c);
      if (fits.length === 0) return null;
      const c = fits[Math.floor(rand() * fits.length)]!;
      left.set(c, left.get(c)! - u.length);
      for (const i of u) colours[i] = c;
    }
    const rest = [...left].flatMap(([c, k]) => Array<Colour>(k).fill(c));
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [rest[i], rest[j]] = [rest[j]!, rest[i]!];
    }
    units.filter((u) => u.length === 1 && !pinned[u[0]!]).forEach((u, k) => (colours[u[0]!] = rest[k]!));
  }
  if (peel) {
    if (!shares) return null;
    const keep = s.blocks.map((_, i) => pinned[i] || units[unitOf[i]!]!.length > 1);
    const left = new Map(shares);
    s.blocks.forEach((b, i) => {
      if (!keep[i]) return;
      colours[i] = b.colour;
      left.set(b.colour, left.get(b.colour)! - 1);
    });
    if ([...left.values()].some((k) => k < 0)) return null;
    const mean = Object.fromEntries(sides.map((side) => [side, dist.reduce((t, d) => t + d[side], 0) / n])) as Record<Side, number>;
    const gone = new Array<boolean>(n).fill(false);
    const coloured = keep.slice();
    const neighbours = Array.from({ length: n }, () => [] as number[]);
    for (const [i, j] of touching) {
      neighbours[i]!.push(j);
      neighbours[j]!.push(i);
    }
    const open = (i: number) => sides.filter((side) => lanes[i]![side].every((j) => gone[j]));
    for (let removed = 0; removed < n; removed++) {
      // Fixed pieces go as soon as their own lane is clear; otherwise the piece with the most
      // rails open, so pieces wait for a choice where they can.
      let best = -1;
      let most = 0;
      for (let i = 0; i < n; i++) {
        if (gone[i]) continue;
        const sidesOpen = open(i);
        if (keep[i]) {
          if (sidesOpen.includes(sideOf.get(colours[i]!)!)) { best = i; break; }
          continue;
        }
        const k = sidesOpen.length + rand() * 0.5;
        if (sidesOpen.length > 0 && k > most) { best = i; most = k; }
      }
      if (best < 0) return null;
      if (!keep[best]) {
        let pick: Colour | null = null;
        let top = -Infinity;
        for (const side of open(best)) {
          const c = s.rails[side];
          const same = neighbours[best]!.filter((j) => coloured[j] && colours[j] === c).length;
          const score = (left.get(c)! > 0 ? 0 : -100) + dist[best]![side] / Math.max(1, mean[side]) - 1.5 * same + rand() * 0.3;
          if (score > top) { top = score; pick = c; }
        }
        colours[best] = pick!;
        coloured[best] = true;
        left.set(pick!, left.get(pick!)! - 1);
      }
      gone[best] = true;
    }
    // A colour over its share gives single pieces to colours under theirs, keeping the board clearable.
    for (let step = 0; step < 20000 && [...left.values()].some((k) => k < 0); step++) {
      const i = Math.floor(rand() * n);
      if (keep[i] || left.get(colours[i]!)! >= 0) continue;
      const under = COLOURS.filter((c) => left.get(c)! > 0);
      const was = colours[i]!;
      colours[i] = under[Math.floor(rand() * under.length)]!;
      if (stuck(colours).length > 0) colours[i] = was;
      else {
        left.set(was, left.get(was)! + 1);
        left.set(colours[i]!, left.get(colours[i]!)! - 1);
      }
    }
    if ([...left.values()].some((k) => k !== 0)) return null;
  }
  const counts = [...new Set(colours)].map((c) => colours.filter((x) => x === c).length);
  const clumpMax = counts.reduce((t, k) => t + k * (k - 1), 0) / (n * (n - 1)) + clumpMargin;
  /**
   * Trade colours between the units holding pieces a and b; a group may trade
   * with as many single pieces of the other colour (b plus others picked at
   * random). Returns how to undo it, or null if no trade fits.
   */
  const trade = (a: number, b: number): [number, Colour][] | null => {
    const ua = units[unitOf[a]!]!;
    const ub = units[unitOf[b]!]!;
    const ca = colours[a]!;
    const cb = colours[b]!;
    if (ca === cb || pinned[a] || pinned[b] || !allowed[unitOf[a]!]!.has(cb) || !allowed[unitOf[b]!]!.has(ca)) return null;
    let sideA = ua;
    let sideB = ub;
    if (ua.length !== ub.length) {
      if (ua.length > 1 && ub.length > 1) return null;
      const [group, single, colour] = ua.length > 1 ? [ua, b, cb] : [ub, a, ca];
      const others = units.filter((u) => u.length === 1 && u[0] !== single && !pinned[u[0]!] && colours[u[0]!] === colour).map((u) => u[0]!);
      if (others.length < group.length - 1) return null;
      for (let k = others.length - 1; k > 0; k--) {
        const j = Math.floor(rand() * (k + 1));
        [others[k], others[j]] = [others[j]!, others[k]!];
      }
      const singles = [single, ...others.slice(0, group.length - 1)];
      [sideA, sideB] = ua.length > 1 ? [group, singles] : [singles, group];
    }
    const undo: [number, Colour][] = [...sideA, ...sideB].map((i) => [i, colours[i]!]);
    for (const i of sideA) colours[i] = cb;
    for (const i of sideB) colours[i] = ca;
    return undo;
  };
  let stuckNow = stuck(colours);
  let spreadNow = spread(colours);
  let clumpNow = clump(colours);
  const done = () => stuckNow.length === 0 && spreadNow >= target && clumpNow <= clumpMax;
  const cost = (st: number, sp: number, cl: number) => st + 200 * Math.max(0, target - sp) + 200 * Math.max(0, cl - clumpMax);
  const steps = peel ? 100000 : 20000;
  for (let step = 0; step < steps && !done(); step++) {
    const fixing = stuckNow.length > 0 || spreadNow < target || (peel && rand() < 0.5);
    const sameColour = touching.filter(([i, j]) => colours[i] === colours[j]);
    const a = fixing
      ? stuckNow.length > 0 ? stuckNow[Math.floor(rand() * stuckNow.length)]! : Math.floor(rand() * n)
      : sameColour[Math.floor(rand() * sameColour.length)]![Math.floor(rand() * 2)]!;
    const b = Math.floor(rand() * n);
    const undo = trade(a, b);
    if (!undo) continue;
    const nextStuck = stuck(colours);
    const nextSpread = spread(colours);
    const nextClump = clump(colours);
    const rise = cost(nextStuck.length, nextSpread, nextClump) - cost(stuckNow.length, spreadNow, clumpNow);
    const better = peel
      ? nextStuck.length === 0 && (rise <= 0 || rand() < Math.exp(-rise / (1 - step / steps + 0.02)))
      : fixing
      ? (nextStuck.length < stuckNow.length && nextSpread >= target) ||
        (nextStuck.length === stuckNow.length && nextSpread > spreadNow)
      : nextStuck.length === 0 && nextSpread >= target && nextClump < clumpNow;
    if (better) {
      stuckNow = nextStuck;
      spreadNow = nextSpread;
      clumpNow = nextClump;
    } else {
      for (const [i, c] of undo) colours[i] = c;
    }
  }
  if (!done()) return null;
  return { ...s, blocks: s.blocks.map((b) => ({ ...b, colour: colours[index.get(b.id)!]! })) };
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
  if ((p.threads ?? 0) > 0) {
    const found = threads(s).filter((t) => t.channel >= (p.threadChannel ?? 2));
    if (found.length < p.threads! || found.filter((t) => !t.open).length < (p.closedThreads ?? 0)) return false;
  }
  if ((p.cages ?? 0) > 0 && cages(s).filter((c) => c.holdsU).length < p.cages!) return false;
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

/** Name pieces A to Z, a to z, 0 to 9, then Greek letters, in reading order: one character each. */
function relabel(s: State): State {
  const names = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ΓΔΘΛΞΠΣΦΨΩαβγδεζηθικλμνξπρστφχψω'];
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

/**
 * Job 021: turn up to `want` pieces into split pieces whose order is forced.
 * A piece P of colour c becomes two parts: B keeps c and A takes a colour a.
 * A stands in B's lane, so A must go first, and A's lane never runs through
 * B, so the piece can always clear. Replaying a tap solution, A's lane must
 * be clear of other pieces at the moment P left, so the board still clears
 * by taps (rule 6): A goes, then B through P's old lane. Shape groups,
 * threaded pieces and cages are left alone. Returns the board and how many
 * pieces were split.
 */
export function splitPieces(state: State, want: number, rand: () => number): { state: State; split: number } {
  const keep = new Set<string>();
  for (const b of state.blocks) if (b.group) keep.add(b.id);
  for (const t of threads(state)) [t.id, ...t.holds].forEach((id) => keep.add(id));
  for (const c of cages(state)) [c.id, c.by].forEach((id) => keep.add(id));
  let s = state;
  let split = 0;
  for (; split < want; split++) {
    const taps = tapSolution(s);
    if (!taps) throw new Error('splitPieces needs a board that clears');
    let best: { id: string; colours: Colour[]; score: number } | null = null;
    let cur = s;
    for (const id of taps) {
      const b = findBlock(cur, id)!;
      if (!findBlock(s, id)!.colours && !keep.has(id) && b.shape.length >= 2) {
        for (const option of splitsOf(cur, b)) {
          const score = Math.min(option.a, b.shape.length - option.a) * 2 + b.shape.length * 0.5 + rand() * 2;
          if (!best || score > best.score) best = { id, colours: option.colours, score };
        }
      }
      cur = applyExit(cur, id)!;
    }
    if (!best) break;
    const { id, colours } = best;
    s = { ...s, blocks: s.blocks.map((b) => (b.id === id ? { ...b, colours } : b)) };
  }
  return { state: s, split };
}

/** Every forced split of block b, with b about to leave from `now`: A's colour per cell and A's size. */
function splitsOf(now: State, b: Block): { colours: Colour[]; a: number }[] {
  const n = b.shape.length;
  const out: { colours: Colour[]; a: number }[] = [];
  const others = new Set(now.blocks.filter((o) => o.id !== b.id).flatMap(cellsOf).map((c) => key(c.row, c.col)));
  for (let mask = 1; mask < (1 << n) - 1; mask++) {
    const inA = b.shape.map((_, i) => (mask >> i) & 1);
    if (!connected(b.shape.filter((_, i) => inA[i])) || !connected(b.shape.filter((_, i) => !inA[i]))) continue;
    for (const a of COLOURS) {
      if (a === b.colour) continue;
      const colours = inA.map((x) => (x ? a : b.colour));
      const whole: Block = { ...b, colours };
      const partA: Block = { ...b, colour: a, shape: b.shape.filter((_, i) => inA[i]) };
      const partB: Block = { ...b, shape: b.shape.filter((_, i) => !inA[i]) };
      if (!heldBySibling(now, whole, partB) || heldBySibling(now, whole, partA)) continue;
      const side = (Object.keys(now.rails) as Side[]).find((k) => now.rails[k] === a)!;
      const d = STEP[side];
      const clear = cellsOf(partA).every((c) => {
        for (let r = c.row + d.row, k = c.col + d.col; r >= 0 && r < now.rows && k >= 0 && k < now.cols; r += d.row, k += d.col) {
          if (others.has(key(r, k))) return false;
        }
        return true;
      });
      if (clear) out.push({ colours, a: partA.shape.length });
    }
  }
  return out;
}

function connected(cells: readonly Cell[]): boolean {
  if (cells.length === 0) return false;
  const all = new Set(cells.map((c) => key(c.row, c.col)));
  const seen = new Set([key(cells[0]!.row, cells[0]!.col)]);
  const stack = [cells[0]!];
  while (stack.length > 0) {
    const c = stack.pop()!;
    for (const d of Object.values(STEP)) {
      const k = key(c.row + d.row, c.col + d.col);
      if (all.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push({ row: c.row + d.row, col: c.col + d.col });
      }
    }
  }
  return seen.size === all.size;
}
