import type { Kind } from '../search/shapes';

/**
 * The difficulty curve (job 010). Boards are portrait. Piece count, fill
 * and the grid rise. Ranges are inclusive; fill is a fraction of the cells.
 */
export interface Band {
  readonly name: 'early' | 'middle' | 'late';
  readonly cols: number;
  readonly rows: number;
  readonly pieces: readonly [number, number];
  readonly fill: readonly [number, number];
  /**
   * Pieces that can leave at the start. Job 010's table dropped this column;
   * early boards keep 2 to 3. Middle and late boards take the fewest the
   * search finds (see HANDOFF decision 41).
   */
  readonly free?: readonly [number, number];
  /**
   * Mostly 2 and 3 cells, some 4 and 5 cell bars and L's, through the middle
   * band. The late band (job 019) adds convoluted strokes up to 7 cells and
   * singles, allowed wherever the press highlight is on and a cell is 24 px
   * or more (rule 2).
   */
  readonly kinds: readonly Kind[];
  /** At least this share of pieces are 2 or 3 cells. */
  readonly smallShare: number;
  readonly sizeWeights: Readonly<Partial<Record<number, number>>>;
  /** Job 019: weight of a kind within its size (default 1). */
  readonly kindWeights?: Readonly<Partial<Record<Kind, number>>>;
  /** Job 019: share of the pieces that are single cells. */
  readonly singleShare?: readonly [number, number];
}

/** Each of the four colours gets 20 to 30 percent of a board's pieces. */
export const COLOUR_SHARE: readonly [number, number] = [0.2, 0.3];

const BARS_AND_LS: readonly Kind[] = ['D', 'I3', 'L3', 'I4', 'L4', 'J4', 'I5', 'L5', 'J5'];

export const BANDS: Readonly<Record<Band['name'], Band>> = {
  // Clustered in the middle, outer ring mostly empty. Cells are 44 px or more, so single cells are allowed.
  early: {
    name: 'early', cols: 6, rows: 7, pieces: [6, 10], fill: [0.35, 0.5], free: [2, 3],
    kinds: ['M', ...BARS_AND_LS], sizeWeights: { 1: 1.5, 2: 4, 3: 3, 4: 1, 5: 0.4 }, smallShare: 0.6,
  },
  middle: {
    // Job 018: 10x12, 30 px cells on a 375 px phone.
    name: 'middle', cols: 10, rows: 12, pieces: [30, 43], fill: [0.65, 0.8],
    kinds: BARS_AND_LS, sizeWeights: { 2: 5, 3: 4, 4: 1.2, 5: 0.6 }, smallShare: 0.6,
  },
  late: {
    // Job 019: 12x15, 25 px cells on a 375 px phone. Skinny, convoluted strokes up to 7 cells
    // (U's above all: a U's notch cages a piece), 15 to 25 percent singles, and dominoes and
    // threes between; two nests of L's and two long bars from the level plan as landmarks;
    // threads' channels run through the crowd.
    name: 'late', cols: 12, rows: 15, pieces: [44, 52], fill: [0.85, 0.9],
    kinds: ['M', 'D', 'I3', 'L3', 'I4', 'T4', 'S4', 'Z4', 'I5', 'U5', 'T5', 'X5', 'S5', 'Z5', 'W5', 'U6', 'U7', 'T7', 'S7', 'Z7', 'W7'],
    kindWeights: { I4: 0.5, I5: 0.5, U5: 2, U7: 1.5 },
    sizeWeights: { 1: 2.4, 2: 2, 3: 1.2, 4: 1.6, 5: 2, 6: 0.4, 7: 0.9 }, smallShare: 0.2, singleShare: [0.15, 0.25],
  },
};
