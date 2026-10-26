import type { Cell } from '../engine';

/** Piece kinds the board search can place. J counts as an L. */
export type Kind = 'D' | 'I3' | 'L3' | 'I4' | 'L4' | 'J4' | 'T4' | 'S4' | 'Z4' | 'O4';

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
};

export const KINDS = Object.keys(DRAWN) as Kind[];

export const SHAPES: Readonly<Record<Kind, readonly Cell[][]>> = Object.fromEntries(
  KINDS.map((k) => [k, rotations(DRAWN[k])]),
) as Record<Kind, Cell[][]>;

export const SIZE: Readonly<Record<Kind, number>> = Object.fromEntries(
  KINDS.map((k) => [k, parse(DRAWN[k]).length]),
) as Record<Kind, number>;

export const FAMILY_OF: Readonly<Partial<Record<Kind, Family>>> = { L3: 'L', L4: 'L', J4: 'L', T4: 'T', S4: 'S', Z4: 'Z' };

const BY_KEY = new Map<string, Kind>(KINDS.flatMap((k) => SHAPES[k].map((s) => [shapeKey(s), k] as const)));

/** The kind of a placed shape, in any rotation, or null if it is not in the catalogue. */
export function kindOf(shape: readonly Cell[]): Kind | null {
  return BY_KEY.get(shapeKey(shape)) ?? null;
}

/** L, T, S or Z, or null for bars, squares and dominoes. */
export function familyOf(shape: readonly Cell[]): Family | null {
  const kind = kindOf(shape);
  return kind ? (FAMILY_OF[kind] ?? null) : null;
}
