// Plain data only. Every engine function takes and returns these shapes.

export type Colour = 'cyan' | 'amber' | 'violet' | 'mint';

export type Side = 'top' | 'right' | 'bottom' | 'left';

export type Direction = 'up' | 'right' | 'down' | 'left';

export interface Cell {
  readonly row: number;
  readonly col: number;
}

/** A polyomino of 1 to 7 cells. */
export interface Block {
  readonly id: string;
  /**
   * Pieces placed together as one shape (a nest of L's, a staircase) share a
   * group name. Data only: the rules ignore it.
   */
  readonly group?: string;
  readonly colour: Colour;
  /**
   * Job 021: a split piece. One colour per cell, in shape order, two or more
   * colours. Each colour's cells leave as one part through that colour's
   * rail, the other parts counting as solid. Left out, every cell is
   * `colour`. On a split piece `colour` is the main colour, the part the
   * generator meant to leave last.
   */
  readonly colours?: readonly Colour[];
  /** Board cell that offset {row: 0, col: 0} sits on. */
  readonly anchor: Cell;
  /** Cell offsets from the anchor. */
  readonly shape: readonly Cell[];
}

/**
 * One full-length rail per side, each a different colour. A block's colour
 * names the side it leaves by.
 */
export type Rails = Readonly<Record<Side, Colour>>;

export interface State {
  /** Board is rows tall by cols wide. Boards are portrait: rows >= cols. */
  readonly rows: number;
  readonly cols: number;
  readonly blocks: readonly Block[];
  readonly rails: Rails;
}

/** Cells a block can slide in each direction before it hits a block or the frame. */
export interface Slides {
  readonly up: number;
  readonly right: number;
  readonly down: number;
  readonly left: number;
}
