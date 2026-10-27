import { describe, expect, it } from 'vitest';
import { applyExit, boardToText, canExit, cellsOf, isSolved, isStuck, validateState, type Block, type State } from '../engine';
import { computeLayout } from '../game/layout';
import { blockers, clumping, colourSpread, dependency } from '../search/measures';
import { makeRandom, tapSolution } from '../search/search';
import { BANDS, COLOUR_SHARE, type Band } from './bands';
import { lateCandidates } from './candidates';
import { world1 } from './world1';

const levels = world1.levels;
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
  it('has 15 levels, numbered 1 to 15', () => {
    expect(levels.map((l) => l.id)).toEqual(Array.from({ length: 15 }, (_, i) => String(i + 1)));
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

    it('clears by taps alone, one tap per piece', () => {
      expect(tapSolution(s)).toHaveLength(s.blocks.length);
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
  it('gets thicker every level', () => {
    for (let i = 1; i < levels.length; i++) {
      expect(fill(levels[i]!.start)).toBeGreaterThan(fill(levels[i - 1]!.start));
    }
  });

  it('never drops a piece from one level to the next inside a band (late boards use fewer, bigger pieces)', () => {
    for (let i = 1; i < levels.length; i++) {
      if (i === 5 || i === 10) continue;
      expect(levels[i]!.start.blocks.length).toBeGreaterThanOrEqual(levels[i - 1]!.start.blocks.length);
    }
  });

  it('is 6 wide by 7 tall for levels 1 to 5, 8 by 9 for 6 to 10, 9 by 11 for 11 to 15', () => {
    expect(levels.map((l) => `${l.start.cols}x${l.start.rows}`)).toEqual([
      ...Array(5).fill('6x7'), ...Array(5).fill('8x9'), ...Array(5).fill('9x11'),
    ]);
  });

  it('starts at the easy end and ends at the top of the middle band', () => {
    expect(fill(levels[0]!.start)).toBeLessThan(0.37);
    expect(ringCells(levels[0]!.start)).toBe(0);
    expect(levels[9]!.start.blocks).toHaveLength(BANDS.middle.pieces[1]);
    expect(fill(levels[9]!.start)).toBeGreaterThanOrEqual(0.78);
  });
});

describe.each(levels.slice(0, 5).map((l) => [l.id, l.start] as const))('early band: level %s', (_, s) => {
  it('sits in the early band', () => inBand(s, BANDS.early));

  it('is clustered in the middle, outer ring mostly empty', () => {
    expect(ringCells(s)).toBeLessThanOrEqual(5); // of 22 ring cells
  });
});

describe.each(levels.slice(5, 10).map((l) => [l.id, l.start] as const))('middle band: level %s', (_, s) => {
  it('sits in the middle band', () => inBand(s, BANDS.middle));

  it('has no single-cell pieces', () => {
    expect(s.blocks.every((b) => b.shape.length >= 2)).toBe(true);
  });
});

describe.each(levels.slice(10, 15).map((l) => [l.id, l.start] as const))('late band: level %s', (_, s) => {
  it('sits in the late band', () => inBand(s, BANDS.late));

  it('is shaped like the reference: a nest of three L\'s, a staircase, big L\'s, no single cells', () => {
    const groups = new Map<string, Block[]>();
    for (const b of s.blocks) if (b.group) groups.set(b.group, [...(groups.get(b.group) ?? []), b]);
    expect(groups.size).toBeGreaterThanOrEqual(4);
    expect([...groups.values()].some((g) => g.length === 3 && g.some((b) => b.shape.length === 7))).toBe(true);
    expect([...groups.values()].some((g) => g.every((b) => b.shape.length === 2))).toBe(true);
    expect(s.blocks.filter((b) => b.shape.length >= 6).length).toBeGreaterThanOrEqual(2);
    expect(s.blocks.every((b) => b.shape.length >= 2)).toBe(true);
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
});

describe('the late band ends at reference density', () => {
  it('level 15 is 30 pieces at 90 percent', () => {
    const s = levels[14]!.start;
    expect(s.blocks).toHaveLength(30);
    expect(fill(s)).toBeGreaterThanOrEqual(0.89);
  });
});

// Job 012. Ratio = a colour's average distance to its own rail against every piece's
// distance to that rail. 1 means colour says nothing about position.
describe.each(levels.slice(5, 15).map((l) => [l.id, l.start] as const))('colours mixed: level %s', (_, s) => {
  it('keeps every colour near the board average distance from its rail, not at its rail', () => {
    for (const c of colourSpread(s)) expect(c.ratio, `${c.colour} ${c.own.toFixed(2)} vs ${c.board.toFixed(2)}`).toBeGreaterThanOrEqual(0.9);
  });

  it('does not clump: same-colour neighbours within 5 points of a random deal', () => {
    const c = clumping(s);
    expect(c.share, `${(100 * c.share).toFixed(0)}% vs ${(100 * c.random).toFixed(0)}%`).toBeLessThanOrEqual(c.random + 0.05);
  });
});

describe.each(levels.slice(10, 15).map((l) => [l.id, l.start] as const))('dependency depth: level %s', (_, s) => {
  it('buries a piece behind three or more others, as a late board must', () => {
    const d = dependency(s);
    expect(d.buried).toBeGreaterThanOrEqual(3);
    expect(d.chain).toBeGreaterThanOrEqual(3);
  });
});

describe('middle band as a whole', () => {
  it('has some 4 and 5 cell pieces', () => {
    const big = levels.slice(5, 10).flatMap((l) => l.start.blocks).filter((b) => b.shape.length >= 4);
    expect(big.length).toBeGreaterThanOrEqual(3);
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

  it('keeps cells at 28 px or more in every band', () => {
    for (const [w, h] of phones) {
      for (const band of Object.values(BANDS)) expect(cellOn(w, h, band.rows, band.cols), band.name).toBeGreaterThanOrEqual(28);
    }
  });

  it('gives every piece a touch target of at least 44 px along its longest side', () => {
    for (const [w, h] of phones) {
      for (const { start: s } of levels) {
        const cell = cellOn(w, h, s.rows, s.cols);
        for (const b of s.blocks) expect(longest(b) * cell, `${b.id} on ${w}x${h}`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it('allows single-cell pieces only where a cell is 44 px or larger', () => {
    for (const [w, h] of phones) {
      for (const { start: s } of levels) {
        if (s.blocks.some((b) => b.shape.length === 1)) expect(cellOn(w, h, s.rows, s.cols)).toBeGreaterThanOrEqual(44);
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
