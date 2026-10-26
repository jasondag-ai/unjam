/**
 * The difficulty curve. The board is always 6x6; density is the difficulty.
 * Ranges are inclusive. Fill is a fraction of the 36 cells.
 */
export interface Band {
  readonly name: 'early' | 'middle' | 'late';
  readonly pieces: readonly [number, number];
  readonly fill: readonly [number, number];
  readonly free: readonly [number, number];
}

export const BANDS: Readonly<Record<Band['name'], Band>> = {
  // Small cluster of small pieces in the middle, outer ring mostly empty.
  early: { name: 'early', pieces: [5, 8], fill: [0.3, 0.45], free: [2, 3] },
  // The L, T, S and Z mix arrives.
  middle: { name: 'middle', pieces: [9, 13], fill: [0.5, 0.65], free: [1, 2] },
  // Bigger shapes, margin gone.
  late: { name: 'late', pieces: [14, 20], fill: [0.7, 0.8], free: [0, 1] },
};
