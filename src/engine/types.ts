// Plain data only. Every engine function takes and returns these shapes.

export type Colour = 'cyan' | 'amber' | 'violet' | 'mint';

/** 'free' is for single-cell blocks, which may move along either axis. */
export type Axis = 'h' | 'v' | 'free';

export type Side = 'top' | 'right' | 'bottom' | 'left';

export type Direction = 'up' | 'right' | 'down' | 'left';

export interface Cell {
  readonly row: number;
  readonly col: number;
}

export interface Block {
  readonly id: string;
  readonly colour: Colour;
  /** Board cell that offset {row: 0, col: 0} sits on. */
  readonly anchor: Cell;
  /** Cell offsets from the anchor. */
  readonly shape: readonly Cell[];
  readonly axis: Axis;
}

/**
 * An edge segment. `index` is the column for top/bottom gates and the row
 * for left/right gates. Every edge segment without a gate is wall.
 */
export interface Gate {
  readonly side: Side;
  readonly index: number;
  readonly colour: Colour;
}

export interface State {
  /** Board is size x size. Unjam boards are 5. */
  readonly size: number;
  readonly blocks: readonly Block[];
  readonly gates: readonly Gate[];
  readonly moves: number;
}

/** Cells a block can slide in each direction. 0 for directions off its axis. */
export interface Slides {
  readonly up: number;
  readonly right: number;
  readonly down: number;
  readonly left: number;
}
