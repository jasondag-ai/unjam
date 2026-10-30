import { describe, expect, it } from 'vitest';
import { applyExit, boardToText, canExit, cellsOf, isSolved, isStuck, partsOf, validateState, type Block, type State } from '../engine';
import { computeLayout } from '../game/layout';
import { blockers, cages, clumping, colourSpread, dependency, shapeMix, splits, threads } from '../search/measures';
import { isThick } from '../search/shapes';
import { makeRandom, tapSolution } from '../search/search';
import { BANDS, COLOUR_SHARE, type Band } from './bands';
import { lateCandidates } from './candidates';
import { world1 } from './world1';

// Job 024: three acts of five (dense tap, then split pieces), then five gravity levels, which
// have their own tests in gravity.test.ts.
const levels = world1.levels.filter((l) => !l.start.gravity);
const act1 = levels.slice(0, 10);
const splitAct = levels.slice(10, 15);
const filled = (s: State) => s.blocks.reduce((n, b) => n + b.shape.length, 0);
const fill = (s: State) => filled(s) / (s.rows * s.cols);
const free = (s: State) => s.blocks.filter((b) => canExit(s, b.id)).length;
const small = (s: State) => s.blocks.filter((b) => b.shape.length === 2 || b.shape.length === 3).length;
const ringCells = (s: State) =>
  s.blocks.flatMap(cellsOf).filter((c) => c.row === 0 || c.col === 0 || c.row === s.rows - 1 || c.col === s.cols - 1).length;
const within = (n: number, [lo, hi]: readonly [number, number]) => n >= lo && n <= hi;

/** Grid, piece count, fill, free pieces where the band sets them, and "mostly 2 and 3 cells". */
function inBand(s: State, band: Band): void {
  expect([s.cols, s.rows], 'grid').toEqual([band.cols, band.rows]);
  expect(within(s.blocks.length, band.pieces), `${s.blocks.length} pieces`).toBe(true);
  expect(within(fill(s), band.fill), `fill ${fill(s).toFixed(2)}`).toBe(true);
  if (band.free) expect(within(free(s), band.free), `${free(s)} free`).toBe(true);
  expect(small(s), '2 and 3 cell pieces').toBeGreaterThanOrEqual(band.smallShare * s.blocks.length);
}

describe('world1', () => {
  it('has 20 levels, numbered 1 to 20: 15 tap levels, then 5 gravity levels', () => {
    expect(world1.levels.map((l) => l.id)).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1)));
    expect(levels).toHaveLength(15);
    expect(world1.levels.slice(15).every((l) => l.start.gravity)).toBe(true);
  });

  it('every colour has a distinct glyph', () => {
    expect(new Set(Object.values(world1.glyphs)).size).toBe(Object.keys(world1.glyphs).length);
  });

  describe.each(levels.map((l) => [l.id, l.start] as const))('level %s', (_, s) => {
    it('is a valid portrait board on the world rails', () => {
      expect(() => validateState(s)).not.toThrow();
      expect(s.rails).toEqual(world1.rails);
      expect(s.rows).toBeGreaterThan(s.cols);
    });

    it('gives each of the four colours 20 to 30 percent of the pieces', () => {
      for (const colour of ['amber', 'cyan', 'violet', 'mint'] as const) {
        const share = s.blocks.filter((b) => b.colour === colour).length / s.blocks.length;
        expect(within(share, COLOUR_SHARE), `${colour} ${share.toFixed(2)}`).toBe(true);
      }
    });

    it('holds every piece to 1 to 7 cells', () => {
      for (const b of s.blocks) expect(within(b.shape.length, [1, 7])).toBe(true);
    });

    it('clears by taps alone, one tap per piece (two for a split piece)', () => {
      expect(tapSolution(s)).toHaveLength(s.blocks.reduce((n, b) => n + partsOf(b).length, 0));
    });

    it('cannot be stranded by taps: any free piece, in any order, still clears it', () => {
      // Exits only ever empty cells, so taking one free piece never blocks another.
      const rand = makeRandom(Number(s.blocks.length));
      for (let run = 0; run < 20; run++) {
        let state = s;
        while (!isSolved(state)) {
          expect(isStuck(state)).toBe(false);
          const free = state.blocks.filter((b) => canExit(state, b.id));
          state = applyExit(state, free[Math.floor(rand() * free.length)]!.id)!;
        }
      }
    });
  });
});

describe('the curve', () => {
  it('fills 50, 68, 80, 85 and 87 percent on levels 1 to 5, then 88 to 90 on 6 to 10', () => {
    const percent = act1.map((l) => Math.round(100 * fill(l.start)));
    expect(percent.slice(0, 5)).toEqual([50, 68, 80, 85, 87]);
    for (const p of percent.slice(5)) expect(within(p, [88, 90]), `${p}%`).toBe(true);
  });

  it('gets thicker every level through act 1', () => {
    for (let i = 1; i < 10; i++) expect(fill(act1[i]!.start)).toBeGreaterThan(fill(act1[i - 1]!.start));
  });

  it('is 6 by 7 for level 1, 10 by 12 for level 2, 12 by 15 from level 3 on', () => {
    expect(levels.map((l) => `${l.start.cols}x${l.start.rows}`)).toEqual(['6x7', '10x12', ...Array(13).fill('12x15')]);
  });

  it('teaches on level 1: ten pieces, clustered, a minute at most', () => {
    expect(act1[0]!.start.blocks).toHaveLength(10);
  });

  it('keeps act 2 at 85 to 88 percent', () => {
    for (const l of splitAct) expect(within(Math.round(100 * fill(l.start)), [85, 88]), l.id).toBe(true);
  });
});

describe.each(act1.slice(0, 1).map((l) => [l.id, l.start] as const))('early band: level %s', (_, s) => {
  it('sits in the early band', () => inBand(s, BANDS.early));

  it('is clustered in the middle, outer ring mostly empty', () => {
    expect(ringCells(s)).toBeLessThanOrEqual(5); // of 22 ring cells
  });
});

describe.each(act1.slice(1, 2).map((l) => [l.id, l.start] as const))('middle band: level %s', (_, s) => {
  it('sits in the middle band', () => inBand(s, BANDS.middle));

  it('has no single-cell pieces, and some 4 and 5 cell pieces', () => {
    expect(s.blocks.every((b) => b.shape.length >= 2)).toBe(true);
    expect(s.blocks.filter((b) => b.shape.length >= 4).length).toBeGreaterThanOrEqual(3);
  });
});

/** Late boards: level 3 ramps in at 80 percent, below the band's 85. */
const lateBand = { ...BANDS.late, fill: [0.8, BANDS.late.fill[1]] as const };

describe.each(act1.slice(2).map((l) => [l.id, l.start] as const))('late band: level %s', (_, s) => {
  it('sits in the late band', () => inBand(s, lateBand));

  it('keeps two nests of L\'s and two long bars as landmarks (job 018)', () => {
    const groups = new Map<string, Block[]>();
    for (const b of s.blocks) if (b.group) groups.set(b.group, [...(groups.get(b.group) ?? []), b]);
    expect(groups.size).toBe(2);
    expect([...groups.values()].some((g) => g.length === 3 && g.some((b) => b.shape.length === 7))).toBe(true);
    expect(s.blocks.filter((b) => !b.group && b.shape.length >= 4).length).toBeGreaterThanOrEqual(2);
  });

  it('is 15 to 25 percent singles, with convoluted strokes, all one cell wide (job 019)', () => {
    const m = shapeMix(s);
    expect(within(m.singles / m.pieces, BANDS.late.singleShare!), `${m.singles} singles of ${m.pieces}`).toBe(true);
    expect(m.convoluted, 'convoluted').toBeGreaterThanOrEqual(0.2 * m.pieces);
    for (const b of s.blocks) expect(isThick(b.shape), b.id).toBe(false);
  });

  it('has no split pieces: they open act 2 (job 024)', () => {
    expect(splits(s)).toEqual([]);
  });

  it('cages a piece inside a U that waits for it (job 019)', () => {
    expect(cages(s).filter((c) => c.holdsU).length).toBeGreaterThanOrEqual(1);
  });

  it('has at least two threaded pieces with channels of 4 or more, one hidden from the edge (job 016)', () => {
    const long = threads(s).filter((t) => t.channel >= 4);
    expect(long.length).toBeGreaterThanOrEqual(2);
    expect(long.filter((t) => !t.open).length).toBeGreaterThanOrEqual(1);
  });

  it('keeps each shape group one colour, its pieces touching, and one holding another', () => {
    const lanes = blockers(s);
    const groups = new Map<string, Block[]>();
    for (const b of s.blocks) if (b.group) groups.set(b.group, [...(groups.get(b.group) ?? []), b]);
    for (const [name, g] of groups) {
      expect(new Set(g.map((b) => b.colour)).size, name).toBe(1);
      const ids = new Set(g.map((b) => b.id));
      expect(g.some((b) => [...lanes.get(b.id)!].some((x) => ids.has(x))), `${name} pieces depend on each other`).toBe(true);
    }
  });

  it('buries a piece behind three or more others, as a late board must', () => {
    const d = dependency(s);
    expect(d.buried).toBeGreaterThanOrEqual(3);
    expect(d.chain).toBeGreaterThanOrEqual(3);
  });
});

// Act 2 (jobs 021, 024): split pieces carry the puzzle.
describe.each(splitAct.map((l, i) => [l.id, l.start, [8, 10, 12, 12, 12][i]!] as const))('split level %s', (_, s, count) => {
  it('sits in the late band, with its landmarks', () => {
    inBand(s, BANDS.late);
    expect(new Set(s.blocks.filter((b) => b.group).map((b) => b.group)).size).toBe(2);
  });

  it(`has ${count} split pieces, each with its order forced and none locked`, () => {
    const found = splits(s);
    expect(found).toHaveLength(count);
    for (const x of found) expect(x.forced && !x.locked, x.id).toBe(true);
  });
});

describe('the late band ends at reference density', () => {
  it('level 10 is at 90 percent', () => {
    expect(fill(act1[9]!.start)).toBeGreaterThanOrEqual(0.9);
  });
});

// Job 012. Ratio = a colour's average distance to its own rail against every piece's
// distance to that rail. 1 means colour says nothing about position. Level 1 teaches, unmixed.
describe.each(levels.slice(1).map((l) => [l.id, l.start] as const))('colours mixed: level %s', (_, s) => {
  it('keeps every colour near the board average distance from its rail, not at its rail', () => {
    for (const c of colourSpread(s)) expect(c.ratio, `${c.colour} ${c.own.toFixed(2)} vs ${c.board.toFixed(2)}`).toBeGreaterThanOrEqual(0.9);
  });

  it('intermingles: same-colour neighbours below a random deal (job 018)', () => {
    const c = clumping(s);
    expect(c.share, `${(100 * c.share).toFixed(0)}% vs ${(100 * c.random).toFixed(0)}%`).toBeLessThan(c.random);
  });
});

describe('rule 2 on a 375 px phone', () => {
  // HUD bands as on the page: header about 68 px, footer about 100 px.
  const phones = [[375, 667], [375, 812]] as const;
  const cellOn = (w: number, h: number, rows: number, cols: number) => computeLayout(w, h, 3, rows, cols, 68, 100).cell;
  const longest = (b: Block) => {
    const rows = b.shape.map((c) => c.row);
    const cols = b.shape.map((c) => c.col);
    return Math.max(Math.max(...rows) - Math.min(...rows), Math.max(...cols) - Math.min(...cols)) + 1;
  };

  it('keeps cells at 24 px or more, and boards 14 or fewer wide, in every band (job 018)', () => {
    for (const [w, h] of phones) {
      for (const band of Object.values(BANDS)) {
        expect(cellOn(w, h, band.rows, band.cols), band.name).toBeGreaterThanOrEqual(24);
        expect(band.cols, band.name).toBeLessThanOrEqual(14);
      }
    }
  });

  it('gives every piece of two or more cells a touch target of at least 44 px along its longest side', () => {
    for (const [w, h] of phones) {
      for (const { start: s } of levels) {
        const cell = cellOn(w, h, s.rows, s.cols);
        for (const b of s.blocks) if (b.shape.length > 1) expect(longest(b) * cell, `${b.id} on ${w}x${h}`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it('allows single-cell pieces where a cell is 24 px or larger: the press highlight makes them safe (job 019)', () => {
    for (const [w, h] of phones) {
      for (const { start: s } of levels) {
        if (s.blocks.some((b) => b.shape.length === 1)) expect(cellOn(w, h, s.rows, s.cols)).toBeGreaterThanOrEqual(24);
      }
    }
  });
});

describe('late-band candidates', () => {
  it('keeps the job 003 board, valid and clearable by taps, outside the level list', () => {
    const board = lateCandidates.find((l) => l.id === 'job-003')!.start;
    expect(() => validateState(board)).not.toThrow();
    expect(tapSolution(board)).toHaveLength(board.blocks.length);
    expect(boardToText(board).split('\n')[1]).toBe('m . A A . . . c');
    expect(levels.some((l) => l.start === board)).toBe(false);
  });
});
