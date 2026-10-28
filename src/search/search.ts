import { applyExit, canExit, cellsOf, isSolved, type Block, type Cell, type Colour, type Rails, type Side, type State } from '../engine';
import { railDistance, threads } from './measures';
import { MOTIF_CELLS, MOTIF_PIECES, MOTIF_TURNS, placementOrder, SHAPES, SIZE, type Kind, type MotifName } from './shapes';

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
  /** Job 018: at least this many long bars (4 or 5 cells) outside the shape groups, as landmarks. */
  readonly bars?: number;
  /**
   * Job 018: a build may stop short of `pieces` and `cells` once this many
   * cells are filled (needs dealShares). Pieces that no longer fit are left
   * out, so the board's count is what fits.
   */
  readonly minCells?: number;
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
    const shares = colourQuota(params, rand)!;
    const built = build(params, rails, kinds, shares, rand);
    // A build that stopped early (minCells) deals shares for the pieces it has.
    const dealt = built && built.state.blocks.length < params.pieces ? colourQuota({ ...params, pieces: built.state.blocks.length }, rand) : shares;
    const state = built && dealt && params.colourMix > 0
      ? mixColours(built.state, params.colourMix, rand, built.fixed, params.dealShares ? dealt : null, params.clumpMargin ?? 0.05)
      : built?.state;
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
 * Piece kinds for the pieces outside groups, drawn by size weight, then
 * nudged one cell at a time (within the allowed sizes) until the board adds
 * up to exactly `cells`.
 */
function pickKinds(params: SearchParams, rand: () => number): Kind[] | null {
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
  for (let i = 0; i < bars; i++) picked[i] = picked[i]! >= 4 ? picked[i]! : 4;
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
  return picked.map((size, i) => {
    const options = p.kinds.filter((k) => SIZE[k] === size && (i >= bars || BAR_KINDS.includes(k)));
    return options[Math.floor(rand() * options.length)]!;
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
  type Option = {
    pieces: { cells: Cell[]; anchor: Cell; shape: Cell[]; path: Set<number> }[];
    colour: Colour;
    unit: { kind: Kind } | { motif: MotifName };
    blocked: number;
    walls: number;
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
      return { blocked, walls, holes, base: touching * 0.5 - spread * p.centrePull };
    };
    for (const kind of new Set(remaining)) {
      for (const shape of SHAPES[kind]) {
        for (let row = 0; row < p.rows; row++) {
          for (let col = 0; col < p.cols; col++) {
            const cells = shape.map((o) => ({ row: row + o.row, col: col + o.col }));
            if (cells.some((c) => !inside(c.row, c.col) || taken.has(key(c.row, c.col)) || reserved.has(key(c.row, c.col)))) continue;
            if (ring + cells.filter(onRing).length > p.ringMax) continue;
            const { blocked, walls, holes, base } = judge(cells);
            for (const colour of COLOURS) {
              if (!p.dealShares && (used.get(colour) ?? 0) >= quota.get(colour)!) continue;
              const path = pathOf(cells, STEP[sideOf.get(colour)!]);
              if ([...path].some((k) => taken.has(k))) continue;
              const thread = threading ? channel(cells, STEP[sideOf.get(colour)!], path, blocked) : null;
              // The chance term is drawn per valid colour, as before groups existed, so boards
              // without groups come out exactly as they did.
              options.push({ pieces: [{ cells, anchor: { row, col }, shape, path }], colour, unit: { kind }, blocked, walls, holes, score: base + rand() * 2, thread });
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
            const { blocked, walls, holes, base } = judge(all);
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
              options.push({ pieces: ordered, colour, unit: { motif }, blocked, walls, holes, score: base + rand() * 2, thread: null });
            }
          }
        }
      }
    }
    if (options.length === 0) {
      // Job 018: a board already full enough may stop here, leaving out the pieces that no longer
      // fit, once its threads are down and its groups placed.
      const filled = taken.size;
      if (p.minCells !== undefined && filled >= p.minCells && threadsLeft === 0 && groupsLeft.length === 0) break;
      return null;
    }
    // Block as many free pieces as possible; among those spots, touch
    // neighbours and keep to the middle, with a little chance. A thread's spot
    // comes first while one is still to plant, then walls for its channel.
    const planting = options.some((o) => o.thread);
    const walling = options.some((o) => o.walls > 0);
    const pool = planting ? options.filter((o) => o.thread) : walling ? options.filter((o) => o.walls > 0) : options;
    // Spots that strand no hole first (boards without single cells), then, unless
    // blockFirst is off, the ones blocking the most free pieces.
    const fewest = Math.min(...pool.map((o) => o.holes));
    const most = p.blockFirst === false ? 0 : Math.max(...pool.filter((o) => o.holes === fewest).map((o) => o.blocked));
    const best = pool.filter((o) => o.holes === fewest && o.blocked >= most).sort((a, b) => b.score - a.score);
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
    for (const piece of pick.pieces) {
      placed.push({ id: `p${pieceCount++}`, colour: pick.colour, anchor: piece.anchor, shape: piece.shape, ...(group ? { group } : {}) });
      paths.push(piece.path);
      for (const c of piece.cells) {
        taken.add(key(c.row, c.col));
        flanks.delete(key(c.row, c.col));
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
 */
function mixColours(
  s: State,
  target: number,
  rand: () => number,
  fixed: ReadonlySet<string>,
  shares: ReadonlyMap<Colour, number> | null,
  clumpMargin: number,
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
  for (let step = 0; step < 20000 && !done(); step++) {
    const fixing = stuckNow.length > 0 || spreadNow < target;
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
    const better = fixing
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
