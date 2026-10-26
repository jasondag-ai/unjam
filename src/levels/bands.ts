/**
 * The difficulty curve. Piece count, fill and the grid rise; piece size
 * does not. Ranges are inclusive. Fill is a fraction of the grid's cells.
 */
export interface Band {
  readonly name: 'early' | 'middle' | 'late';
  /** Grid is grid x grid. */
  readonly grid: number;
  readonly pieces: readonly [number, number];
  readonly fill: readonly [number, number];
  readonly free: readonly [number, number];
  /**
   * Job 003 mix: at least half the pieces 3 or 4 cells, dominoes at most a
   * third, and at least three of L, T, S and Z.
   */
  readonly mix: boolean;
}

/** Every piece in every band is 2 to 4 cells. */
export const PIECE_SIZE: readonly [number, number] = [2, 4];

export const BANDS: Readonly<Record<Band['name'], Band>> = {
  // Leans to 2 and 3 cell pieces, clustered in the middle, outer ring mostly empty.
  early: { name: 'early', grid: 6, pieces: [5, 8], fill: [0.3, 0.45], free: [2, 3], mix: false },
  middle: { name: 'middle', grid: 7, pieces: [9, 14], fill: [0.5, 0.65], free: [1, 2], mix: true },
  late: { name: 'late', grid: 8, pieces: [14, 20], fill: [0.7, 0.8], free: [0, 1], mix: true },
};
