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
  /** Mostly 2 and 3 cells, some 4 and 5 cell bars and L's; single cells only where a cell is 44 px or more. */
  readonly kinds: readonly Kind[];
  /** At least this share of pieces are 2 or 3 cells. */
  readonly smallShare: number;
  readonly sizeWeights: Readonly<Partial<Record<number, number>>>;
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
    name: 'middle', cols: 8, rows: 9, pieces: [18, 26], fill: [0.65, 0.8],
    kinds: BARS_AND_LS, sizeWeights: { 2: 5, 3: 4, 4: 1.2, 5: 0.6 }, smallShare: 0.6,
  },
  late: {
    // Job 015: legibility is the difficulty. Many small pieces, 1 to 3 cells (single cells allowed
    // at 33 px, nearest-centre hits carry them), a few long bars, and two or three nests of L's from
    // the level plan as landmarks. Fill 82 to 88 percent leaves room for threads' channels (job 016).
    name: 'late', cols: 9, rows: 11, pieces: [34, 44], fill: [0.82, 0.88],
    kinds: ['M', 'D', 'I3', 'L3', 'I4', 'I5'], sizeWeights: { 1: 3, 2: 5, 3: 3, 4: 0.5, 5: 0.4 }, smallShare: 0.45,
  },
};
