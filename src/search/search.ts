import { applyExit, canExit, cellsOf, isSolved, type Block, type Cell, type Colour, type Rails, type Side, type State } from '../engine';
import { railDistance } from './measures';
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
    const built = build(params, rails, kinds, colourQuota(params, rand)!, rand);
    const state = built && params.colourMix > 0 ? mixColours(built, params.colourMix, rand) : built;
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
 * remaining kind or group may be placed, so the last few still find room.
 * A group's pieces go down in its own reverse tap order, each needing a
 * clear path past the board and the group pieces already down.
 */
function build(p: SearchParams, rails: Rails, kinds: readonly Kind[], quota: Map<Colour, number>, rand: () => number): State | null {
  const sideOf = new Map((Object.keys(rails) as (keyof Rails)[]).map((side) => [rails[side], side] as const));
  const taken = new Set<number>();
  const placed: Block[] = [];
  const paths: Set<number>[] = [];
  const remaining = [...kinds];
  const groupsLeft = [...p.groups];
  const used = new Map<Colour, number>();
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
  type Option = {
    pieces: { cells: Cell[]; anchor: Cell; shape: Cell[]; path: Set<number> }[];
    colour: Colour;
    unit: { kind: Kind } | { motif: MotifName };
    blocked: number;
    score: number;
  };

  for (let step = 0; step < kinds.length + p.groups.length; step++) {
    const free = paths.filter((path) => ![...path].some((k) => taken.has(k)));
    const options: Option[] = [];
    const judge = (cells: readonly Cell[]) => {
      const touching = cells.filter((c) => Object.values(STEP).some((d) => taken.has(key(c.row + d.row, c.col + d.col)))).length;
      // Pull toward the middle so early boards read as one cluster.
      const spread = cells.reduce((n, c) => n + Math.abs(c.row - midRow) + Math.abs(c.col - midCol), 0) / cells.length;
      const blocked = free.filter((path) => cells.some((c) => path.has(key(c.row, c.col)))).length;
      return { blocked, base: touching * 0.5 - spread * p.centrePull };
    };
    for (const kind of new Set(remaining)) {
      for (const shape of SHAPES[kind]) {
        for (let row = 0; row < p.rows; row++) {
          for (let col = 0; col < p.cols; col++) {
            const cells = shape.map((o) => ({ row: row + o.row, col: col + o.col }));
            if (cells.some((c) => !inside(c.row, c.col) || taken.has(key(c.row, c.col)))) continue;
            if (ring + cells.filter(onRing).length > p.ringMax) continue;
            const { blocked, base } = judge(cells);
            for (const colour of COLOURS) {
              if ((used.get(colour) ?? 0) >= quota.get(colour)!) continue;
              const path = pathOf(cells, STEP[sideOf.get(colour)!]);
              if ([...path].some((k) => taken.has(k))) continue;
              // The chance term is drawn per valid colour, as before groups existed, so boards
              // without groups come out exactly as they did.
              options.push({ pieces: [{ cells, anchor: { row, col }, shape, path }], colour, unit: { kind }, blocked, score: base + rand() * 2 });
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
            if (all.some((c) => !inside(c.row, c.col) || taken.has(key(c.row, c.col)))) continue;
            if (ring + all.filter(onRing).length > p.ringMax) continue;
            const { blocked, base } = judge(all);
            for (const colour of COLOURS) {
              if ((used.get(colour) ?? 0) + turn.length > quota.get(colour)!) continue;
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
              options.push({ pieces: ordered, colour, unit: { motif }, blocked, score: base + rand() * 2 });
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
    const group = 'motif' in pick.unit ? `g${++groupCount}` : undefined;
    for (const piece of pick.pieces) {
      placed.push({ id: `p${pieceCount++}`, colour: pick.colour, anchor: piece.anchor, shape: piece.shape, ...(group ? { group } : {}) });
      paths.push(piece.path);
      for (const c of piece.cells) taken.add(key(c.row, c.col));
      ring += piece.cells.filter(onRing).length;
    }
    if ('kind' in pick.unit) remaining.splice(remaining.indexOf(pick.unit.kind), 1);
    else groupsLeft.splice(groupsLeft.indexOf(pick.unit.motif), 1);
    used.set(pick.colour, (used.get(pick.colour) ?? 0) + pick.pieces.length);
  }
  return { rows: p.rows, cols: p.cols, rails, blocks: placed };
}

/**
 * Job 012: deal the board's colours out again at random, so colour says
 * nothing about position, then repair by swapping two pieces' colours
 * (shares stay the same). First, swaps that leave fewer pieces stuck while
 * every colour keeps the spread target. Then, swaps that break up
 * same-colour neighbours, down to what a random deal gives plus five
 * points, keeping the board clearable and the spread. Null if it cannot get
 * there.
 *
 * Positions never change here, so each piece's blockers toward each rail,
 * its distance to each rail and which pieces touch are worked out once.
 * A shape group (job 014) is one unit: its pieces share a colour and change
 * colour together, trading with a unit of the same size or with as many
 * single pieces; touching inside it is not clumping.
 */
function mixColours(s: State, target: number, rand: () => number): State | null {
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
  const counts = [...new Set(colours)].map((c) => colours.filter((x) => x === c).length);
  const clumpMax = counts.reduce((t, k) => t + k * (k - 1), 0) / (n * (n - 1)) + 0.05;
  if (units.every((u) => u.length === 1)) {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [colours[i], colours[j]] = [colours[j]!, colours[i]!];
    }
  } else {
    // Groups first, each to a colour with enough left; then the single pieces at random.
    const left = new Map<Colour, number>();
    for (const c of colours) left.set(c, (left.get(c) ?? 0) + 1);
    for (const u of [...units].filter((u) => u.length > 1).sort((a, b) => b.length - a.length)) {
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
    units.filter((u) => u.length === 1).forEach((u, k) => (colours[u[0]!] = rest[k]!));
  }
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
    if (ca === cb || !allowed[unitOf[a]!]!.has(cb) || !allowed[unitOf[b]!]!.has(ca)) return null;
    let sideA = ua;
    let sideB = ub;
    if (ua.length !== ub.length) {
      if (ua.length > 1 && ub.length > 1) return null;
      const [group, single, colour] = ua.length > 1 ? [ua, b, cb] : [ub, a, ca];
      const others = units.filter((u) => u.length === 1 && u[0] !== single && colours[u[0]!] === colour).map((u) => u[0]!);
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
