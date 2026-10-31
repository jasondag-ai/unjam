import { applyExit, canExit, cellsOf, isSolved, isStuck, settle, type Block, type Colour, type Rails, type Side, type State } from '../engine';
import { clumping, colourSpread } from './measures';
import { makeRandom, pickKinds, type SearchParams } from './search';
import { SHAPES } from './shapes';

/**
 * Gravity boards (jobs 022, 024). A gravity board is played forward, not
 * built in reverse. The board is packed, then settled toward the pull. Then
 * it is replayed: at each turn the piece with the highest priority that can
 * leave by its wanted colour goes, and when none can, the highest piece that
 * can leave by any colour goes in one of those. Every piece takes the colour
 * it left by, so the replay is the solution and every board clears.
 * Annealing the priorities and wanted colours brings the colours to the mix
 * (job 012 spread, job 018 neighbours). A second pass holds the mix and moves
 * the share of random plays that strand toward a target.
 *
 * Settling ignores colour, so where every piece is when it leaves depends
 * only on the order. That is why recolouring along a fixed order cannot mix
 * the colours (the job 022 finding) and annealing the order can.
 */
export interface GravityParams
  extends Pick<SearchParams, 'rows' | 'cols' | 'pieces' | 'cells' | 'kinds' | 'sizeWeights' | 'kindWeights' | 'singleShare' | 'smallShare' | 'colourShare' | 'tries' | 'seed'> {
  readonly gravity: Side;
  /** Same as SearchParams.colourMix: every colour's spread ratio must reach this. */
  readonly colourMix: number;
  /** Annealing steps toward the colour mix, per board. */
  readonly mixSteps: number;
  /** Steps toward the strand target, per board, holding the mix. */
  readonly strandSteps: number;
  /** Share of random plays that should strand. */
  readonly strandTarget: readonly [number, number];
  /** Random plays per measure while tuning. */
  readonly playouts: number;
  readonly verbose?: boolean;
}

export interface GravityResult {
  readonly state: State;
  /** Taps that clear the board: the replay that dealt its colours. */
  readonly solution: readonly string[];
  readonly free: number;
  /** Share of random plays that stranded while tuning. */
  readonly strands: number;
  /** The lowest colour spread ratio (job 012). */
  readonly spread: number;
}

const ALL: readonly Colour[] = ['amber', 'cyan', 'violet', 'mint'];
/** One step toward the gravity rail. */
const PULL: Readonly<Record<Side, { row: number; col: number }>> = {
  bottom: { row: 1, col: 0 },
  top: { row: -1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 },
};

export function searchGravity(p: GravityParams, rails: Rails): GravityResult | null {
  const rand = makeRandom(p.seed);
  const params = { ...p, groups: [], free: [0, 99], ringMax: 99, centrePull: 0 } as unknown as SearchParams;
  let best: GravityResult | null = null;
  let bestMiss = Infinity;
  for (let t = 0; t < p.tries; t++) {
    const kinds = pickKinds(params, rand);
    const packed = kinds && pack(p, rails, kinds, rand);
    if (!packed) continue;
    const mixed = mix(packed, p, rand);
    if (!mixed) {
      if (p.verbose) console.error(`try ${t}: colour mix not reached`);
      continue;
    }
    const tuned = tune(packed, mixed, p, rand);
    const strands = plays(tuned.state, p.playouts * 4, makeRandom(p.seed + t)).strand;
    const [lo, hi] = p.strandTarget;
    const miss = Math.max(0, lo - strands, strands - hi);
    if (p.verbose) console.error(`try ${t}: strands ${(100 * strands).toFixed(0)}%`);
    if (miss < bestMiss) {
      const s = tuned.state;
      best = { state: s, solution: tuned.solution, free: s.blocks.filter((b) => canExit(s, b.id)).length, strands, spread: Math.min(...colourSpread(s).map((c) => c.ratio)) };
      bestMiss = miss;
    }
    if (bestMiss === 0) break;
  }
  return best;
}

/**
 * Pieces, biggest first, each where it touches the most of the board and the
 * walls from 400 random spots, a little toward the pull; then the board settles.
 */
function pack(p: GravityParams, rails: Rails, kinds: readonly (keyof typeof SHAPES)[], rand: () => number): State | null {
  const pull = PULL[p.gravity];
  const queue = kinds.map((k) => ({ k, w: SHAPES[k][0]!.length + rand() * 2 })).sort((a, b) => b.w - a.w).map((x) => x.k);
  const taken = new Set<string>();
  const blocks: Block[] = [];
  for (const [i, kind] of queue.entries()) {
    let best: Block | null = null;
    let bestScore = -Infinity;
    for (let t = 0; t < 400; t++) {
      const shape = SHAPES[kind][Math.floor(rand() * SHAPES[kind].length)]!;
      const anchor = { row: Math.floor(rand() * p.rows), col: Math.floor(rand() * p.cols) };
      const cells = shape.map((c) => ({ row: anchor.row + c.row, col: anchor.col + c.col }));
      if (!cells.every((c) => c.row >= 0 && c.row < p.rows && c.col >= 0 && c.col < p.cols && !taken.has(`${c.row},${c.col}`))) continue;
      const mine = new Set(cells.map((c) => `${c.row},${c.col}`));
      let touch = 0;
      for (const c of cells) {
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const row = c.row + dr;
          const col = c.col + dc;
          if (mine.has(`${row},${col}`)) continue;
          if (row < 0 || row >= p.rows || col < 0 || col >= p.cols) touch += dr === pull.row && dc === pull.col ? 1 : 0.6;
          else if (taken.has(`${row},${col}`)) touch += 1;
        }
      }
      const depth = cells.reduce((n, c) => n + c.row * pull.row + c.col * pull.col, 0) / cells.length;
      const score = touch + depth * 0.15 + rand();
      if (score > bestScore) {
        bestScore = score;
        best = { id: `g${i}`, colour: 'amber', anchor, shape };
      }
    }
    if (!best) return null;
    for (const c of cellsOf(best)) taken.add(`${c.row},${c.col}`);
    blocks.push(best);
  }
  return settle({ rows: p.rows, cols: p.cols, rails, gravity: p.gravity, blocks });
}

const recolour = (s: State, id: string, colour: Colour): State => ({ ...s, blocks: s.blocks.map((b) => (b.id === id ? { ...b, colour } : b)) });

/** Play the board forward by priority and wanted colour (see the top of this file). Null if it sticks. */
function replay(start: State, prio: readonly number[], want: readonly Colour[]): { state: State; solution: string[] } | null {
  const index = new Map(start.blocks.map((b, i) => [b.id, i]));
  const colour = new Map<string, Colour>();
  const solution: string[] = [];
  let s = start;
  while (s.blocks.length > 0) {
    const queue = [...s.blocks].sort((a, b) => prio[index.get(b.id)!]! - prio[index.get(a.id)!]!);
    const go = (b: Block, c: Colour) => {
      colour.set(b.id, c);
      solution.push(b.id);
      s = applyExit(recolour(s, b.id, c), b.id)!;
    };
    const wanted = queue.find((b) => canExit(recolour(s, b.id, want[index.get(b.id)!]!), b.id));
    if (wanted) {
      go(wanted, want[index.get(wanted.id)!]!);
      continue;
    }
    let moved = false;
    for (const b of queue) {
      const c = ALL.find((x) => canExit(recolour(s, b.id, x), b.id));
      if (c) {
        go(b, c);
        moved = true;
        break;
      }
    }
    if (!moved) return null;
  }
  return { state: { ...start, blocks: start.blocks.map((b) => ({ ...b, colour: colour.get(b.id)! })) }, solution };
}

/** How far a board is from the mix: shares, every colour's spread, same-colour neighbours. */
function mixCost(s: State, p: GravityParams): number {
  const n = s.blocks.length;
  let share = 0;
  for (const c of ALL) {
    const k = s.blocks.filter((b) => b.colour === c).length;
    share += Math.max(0, Math.ceil(p.colourShare[0] * n) - k) + Math.max(0, k - Math.floor(p.colourShare[1] * n));
  }
  const spread = colourSpread(s).reduce((m, c) => m + Math.max(0, p.colourMix + 0.02 - c.ratio), 0);
  const clump = clumping(s);
  return share * 3 + spread * 10 + Math.max(0, clump.share - clump.random + 0.02) * 15;
}

/** Shares within range, every spread ratio at colourMix, neighbours below a random deal. */
export function mixed(s: State, colourMix: number, range: readonly [number, number]): boolean {
  const n = s.blocks.length;
  const shares = ALL.every((c) => {
    const k = s.blocks.filter((b) => b.colour === c).length / n;
    return k >= range[0] && k <= range[1];
  });
  const clump = clumping(s);
  return shares && Math.min(...colourSpread(s).map((c) => c.ratio)) >= colourMix && clump.share < clump.random;
}

interface Replay {
  readonly prio: number[];
  readonly want: Colour[];
  readonly state: State;
  readonly solution: string[];
}

/** Anneal priorities and wanted colours until the replayed colours mix. */
function mix(start: State, p: GravityParams, rand: () => number): Replay | null {
  const n = start.blocks.length;
  const prio = start.blocks.map(() => rand());
  const want = start.blocks.map(() => ALL[Math.floor(rand() * ALL.length)]!);
  const first = replay(start, prio, want);
  if (!first) return null;
  let now = mixCost(first.state, p);
  let best: Replay = { prio: [...prio], want: [...want], ...first };
  let bestCost = now;
  for (let step = 0; step < p.mixSteps && !mixed(best.state, p.colourMix, p.colourShare); step++) {
    const i = Math.floor(rand() * n);
    const was = [prio[i]!, want[i]!] as const;
    if (rand() < 0.5) prio[i] = rand();
    else want[i] = ALL[Math.floor(rand() * ALL.length)]!;
    const r = replay(start, prio, want);
    const cost = r ? mixCost(r.state, p) : Infinity;
    const temperature = (1 - step / p.mixSteps) * 0.3 + 0.005;
    if (r && (cost <= now || rand() < Math.exp((now - cost) / temperature))) {
      now = cost;
      if (cost < bestCost) {
        bestCost = cost;
        best = { prio: [...prio], want: [...want], ...r };
      }
    } else {
      prio[i] = was[0];
      want[i] = was[1];
    }
  }
  return mixed(best.state, p.colourMix, p.colourShare) ? best : null;
}

/** Hold the mix; move the share of random plays that strand into the target. */
function tune(start: State, from: Replay, p: GravityParams, rand: () => number): Replay {
  const [lo, hi] = p.strandTarget;
  const miss = (s: State) => {
    const strand = plays(s, p.playouts, makeRandom(p.seed)).strand;
    return Math.max(0, lo - strand, strand - hi);
  };
  const prio = [...from.prio];
  const want = [...from.want];
  let best = from;
  let now = miss(from.state);
  for (let step = 0; step < p.strandSteps && now > 0; step++) {
    const i = Math.floor(rand() * prio.length);
    const was = [prio[i]!, want[i]!] as const;
    if (rand() < 0.5) prio[i] = rand();
    else want[i] = ALL[Math.floor(rand() * ALL.length)]!;
    const r = replay(start, prio, want);
    const m = r && mixed(r.state, p.colourMix, p.colourShare) ? miss(r.state) : Infinity;
    if (r && m <= now) {
      now = m;
      best = { prio: [...prio], want: [...want], ...r };
    } else {
      prio[i] = was[0];
      want[i] = was[1];
    }
  }
  return best;
}

/** Random plays: tap any piece that can leave, until cleared or stuck. Share stranded. */
function plays(state: State, runs: number, rand: () => number): { strand: number } {
  let stranded = 0;
  for (let r = 0; r < runs; r++) {
    let s = state;
    while (!isSolved(s) && !isStuck(s)) {
      const free = s.blocks.filter((b) => canExit(s, b.id));
      s = applyExit(s, free[Math.floor(rand() * free.length)]!.id)!;
    }
    if (!isSolved(s)) stranded++;
  }
  return { strand: stranded / runs };
}

/** Random play from the start, `runs` times: how many strand. */
export function strandRate(state: State, runs: number, seed: number): { stranded: number; runs: number } {
  return { stranded: Math.round(plays(state, runs, makeRandom(seed)).strand * runs), runs };
}

/**
 * Whether a board can still be cleared, by depth-first search over taps (job 025). Under
 * gravity a position follows from which pieces remain, so one memo serves every query on
 * boards played from the same start.
 */
export function solver(): (s: State) => boolean {
  const memo = new Map<string, boolean>();
  const solvable = (s: State): boolean => {
    if (isSolved(s)) return true;
    const k = s.blocks.map((b) => `${b.id}${b.shape.length}`).sort().join(' ');
    const known = memo.get(k);
    if (known !== undefined) return known;
    const ok = s.blocks.some((b) => canExit(s, b.id) && solvable(applyExit(s, b.id)!));
    memo.set(k, ok);
    return ok;
  };
  return solvable;
}

export interface SafeMoves {
  /** Average over the states with a choice (two or more legal taps) of safe taps / legal taps. */
  readonly average: number;
  /** The worst such state, as safe and legal counts. */
  readonly worst: { readonly safe: number; readonly legal: number };
  /** States with a choice. */
  readonly choices: number;
}

/**
 * Job 025: walk a solution and, at each state, count the legal taps and those that leave the
 * board solvable. A forced tap (one legal) is left out: it is no choice.
 */
export function safeMoves(start: State, solution: readonly string[], solvable = solver()): SafeMoves {
  let s = start;
  let sum = 0;
  let choices = 0;
  let worst = { safe: 1, legal: 1 };
  for (const id of solution) {
    const legal = s.blocks.filter((b) => canExit(s, b.id));
    if (legal.length > 1) {
      const safe = legal.filter((b) => solvable(applyExit(s, b.id)!)).length;
      sum += safe / legal.length;
      choices++;
      if (safe / legal.length < worst.safe / worst.legal) worst = { safe, legal: legal.length };
    }
    s = applyExit(s, id)!;
  }
  return { average: choices ? sum / choices : 1, worst, choices };
}

/**
 * Random play until the board clears or strands: for each strand, how many taps back the
 * first one that lost the board was (the undos it takes to recover).
 */
export function undosToRecover(start: State, runs: number, seed: number, solvable = solver()): number[] {
  const rand = makeRandom(seed);
  const back: number[] = [];
  for (let r = 0; r < runs; r++) {
    let s = start;
    let step = 0;
    let lost = -1;
    while (!isSolved(s) && !isStuck(s)) {
      const free = s.blocks.filter((b) => canExit(s, b.id));
      s = applyExit(s, free[Math.floor(rand() * free.length)]!.id)!;
      if (lost < 0 && !solvable(s)) lost = step;
      step++;
    }
    if (isStuck(s)) back.push(step - lost);
  }
  return back;
}
