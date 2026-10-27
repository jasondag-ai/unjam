import type { Cell, Side } from '../engine';

/** Piece kinds the board search can place. J counts as an L. */
export type Kind =
  | 'M' | 'D' | 'I3' | 'L3' | 'I4' | 'L4' | 'J4' | 'T4' | 'S4' | 'Z4' | 'O4' | 'I5' | 'L5' | 'J5'
  | 'V5' | 'L6' | 'J6' | 'L7';

export type Family = 'L' | 'T' | 'S' | 'Z';

const parse = (rows: readonly string[]): Cell[] =>
  rows.flatMap((line, r) => [...line].flatMap((ch, c) => (ch === '#' ? [{ row: r, col: c }] : [])));

const normalise = (cells: readonly Cell[]): Cell[] => {
  const r0 = Math.min(...cells.map((c) => c.row));
  const c0 = Math.min(...cells.map((c) => c.col));
  return cells
    .map((c) => ({ row: c.row - r0, col: c.col - c0 }))
    .sort((a, b) => a.row - b.row || a.col - b.col);
};

const shapeKey = (cells: readonly Cell[]) => normalise(cells).map((c) => `${c.row},${c.col}`).join(' ');

/** The distinct quarter-turns of a shape. Pieces never flip. */
function rotations(rows: readonly string[]): Cell[][] {
  const out: Cell[][] = [];
  let cells = normalise(parse(rows));
  for (let i = 0; i < 4; i++) {
    if (!out.some((s) => shapeKey(s) === shapeKey(cells))) out.push(cells);
    cells = normalise(cells.map((c) => ({ row: c.col, col: -c.row })));
  }
  return out;
}

const DRAWN: Readonly<Record<Kind, readonly string[]>> = {
  M: ['#'],
  D: ['##'],
  I3: ['###'],
  L3: ['#.', '##'],
  I4: ['####'],
  L4: ['#.', '#.', '##'],
  J4: ['.#', '.#', '##'],
  T4: ['###', '.#.'],
  S4: ['.##', '##.'],
  Z4: ['##.', '.##'],
  O4: ['##', '##'],
  I5: ['#####'],
  L5: ['#.', '#.', '#.', '##'],
  J5: ['.#', '.#', '.#', '##'],
  // Big corner L's, as in the reference (job 014).
  V5: ['#..', '#..', '###'],
  L6: ['#..', '#..', '#..', '###'],
  J6: ['..#', '..#', '..#', '###'],
  L7: ['#...', '#...', '#...', '####'],
};

export const KINDS = Object.keys(DRAWN) as Kind[];

export const SHAPES: Readonly<Record<Kind, readonly Cell[][]>> = Object.fromEntries(
  KINDS.map((k) => [k, rotations(DRAWN[k])]),
) as Record<Kind, Cell[][]>;

export const SIZE: Readonly<Record<Kind, number>> = Object.fromEntries(
  KINDS.map((k) => [k, parse(DRAWN[k]).length]),
) as Record<Kind, number>;

export const FAMILY_OF: Readonly<Partial<Record<Kind, Family>>> = { L3: 'L', L4: 'L', J4: 'L', L5: 'L', J5: 'L', V5: 'L', L6: 'L', J6: 'L', L7: 'L', T4: 'T', S4: 'S', Z4: 'Z' };

const BY_KEY = new Map<string, Kind>(KINDS.flatMap((k) => SHAPES[k].map((s) => [shapeKey(s), k] as const)));

/** The kind of a placed shape, in any rotation, or null if it is not in the catalogue. */
export function kindOf(shape: readonly Cell[]): Kind | null {
  return BY_KEY.get(shapeKey(shape)) ?? null;
}

/** L, T, S or Z, or null for bars, squares, dominoes and single cells. */
export function familyOf(shape: readonly Cell[]): Family | null {
  const kind = kindOf(shape);
  return kind ? (FAMILY_OF[kind] ?? null) : null;
}

/**
 * Shape groups (job 014): pieces placed together as one recognisable shape,
 * in one colour, like the reference. Drawn with letters: each letter is one
 * piece of the group.
 */
export type MotifName = 'nest2' | 'nest2big' | 'nest3' | 'stair3';

const MOTIFS: Readonly<Record<MotifName, readonly string[]>> = {
  // An L with a smaller L tucked in its corner.
  nest2: ['aaa', 'abb', 'ab.'],
  nest2big: ['aaaa', 'abbb', 'ab..', 'ab..'],
  // Three L's, each inside the last.
  nest3: ['aaaa', 'abbb', 'abcc', 'abc.'],
  // Three dominoes stepping down.
  stair3: ['aa..', '.bb.', '..cc'],
};

export const MOTIF_NAMES = Object.keys(MOTIFS) as MotifName[];

/** One way a group can sit: its pieces' cells, relative to the group's top-left. */
export type MotifTurn = readonly (readonly Cell[])[];

function motifTurns(rows: readonly string[]): MotifTurn[] {
  const letters = [...new Set(rows.join('').replace(/\./g, ''))].sort();
  let pieces: Cell[][] = letters.map((l) =>
    rows.flatMap((line, r) => [...line].flatMap((ch, c) => (ch === l ? [{ row: r, col: c }] : []))),
  );
  const out: MotifTurn[] = [];
  for (let i = 0; i < 4; i++) {
    const all = pieces.flat();
    const r0 = Math.min(...all.map((c) => c.row));
    const c0 = Math.min(...all.map((c) => c.col));
    out.push(pieces.map((p) => p.map((c) => ({ row: c.row - r0, col: c.col - c0 }))));
    pieces = pieces.map((p) => p.map((c) => ({ row: c.col, col: -c.row })));
  }
  return out;
}

export const MOTIF_TURNS: Readonly<Record<MotifName, readonly MotifTurn[]>> = Object.fromEntries(
  MOTIF_NAMES.map((m) => [m, motifTurns(MOTIFS[m])]),
) as Record<MotifName, MotifTurn[]>;

export const MOTIF_PIECES: Readonly<Record<MotifName, number>> = Object.fromEntries(
  MOTIF_NAMES.map((m) => [m, MOTIF_TURNS[m][0]!.length]),
) as Record<MotifName, number>;

export const MOTIF_CELLS: Readonly<Record<MotifName, number>> = Object.fromEntries(
  MOTIF_NAMES.map((m) => [m, MOTIF_TURNS[m][0]!.flat().length]),
) as Record<MotifName, number>;

const STEP: Readonly<Record<Side, Cell>> = {
  top: { row: -1, col: 0 },
  right: { row: 0, col: 1 },
  bottom: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
};

/**
 * The order to place a group's pieces in reverse (last tapped first) when
 * they all leave by `side`, or null if they would block each other in a loop
 * or not depend on each other at all (then it would not read as one shape).
 */
export function placementOrder(turn: MotifTurn, side: Side): number[] | null {
  const d = STEP[side];
  const owner = new Map<string, number>();
  turn.forEach((p, i) => p.forEach((c) => owner.set(`${c.row},${c.col}`, i)));
  const span = Math.max(...turn.flat().map((c) => Math.max(c.row, c.col))) + 1;
  const waitsFor = turn.map((p, i) => {
    const ids = new Set<number>();
    for (const c of p) {
      for (let k = 1; k <= span; k++) {
        const o = owner.get(`${c.row + d.row * k},${c.col + d.col * k}`);
        if (o !== undefined && o !== i) ids.add(o);
      }
    }
    return ids;
  });
  if (waitsFor.every((w) => w.size === 0)) return null;
  // Tap order: repeatedly take a piece nothing in the group still blocks.
  const tapped: number[] = [];
  const left = new Set(turn.map((_, i) => i));
  while (left.size > 0) {
    const next = [...left].find((i) => [...waitsFor[i]!].every((j) => !left.has(j)));
    if (next === undefined) return null;
    tapped.push(next);
    left.delete(next);
  }
  return tapped.reverse();
}
