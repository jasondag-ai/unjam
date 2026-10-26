import { cellsOf, type Block } from '../engine';

export const GUTTER = 16;
/** Room outside the frame for gate bars and their glyphs. */
export const FRAME_MARGIN = 26;
export const MIN_TARGET = 44;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Layout {
  /** Viewport in CSS px. */
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  /** Board interior (the cells), CSS px. */
  readonly board: Rect;
  readonly cell: number;
  /** Gap between a block's drawn edge and its cell edge. */
  readonly inset: number;
}

/**
 * Portrait layout: board centred in the viewport, 16 px gutters, kept clear
 * of the HUD bands above (`top`) and below (`bottom`).
 */
export function computeLayout(width: number, height: number, dpr: number, size: number, top: number, bottom: number): Layout {
  const outerMax = Math.min(width - 2 * GUTTER, height - top - bottom - 2 * GUTTER);
  const cell = Math.floor((outerMax - 2 * FRAME_MARGIN) / size);
  const side = cell * size;
  const minY = top + GUTTER + FRAME_MARGIN;
  const maxY = height - bottom - GUTTER - FRAME_MARGIN - side;
  const y = Math.min(Math.max((height - side) / 2, minY), Math.max(minY, maxY));
  return {
    width,
    height,
    dpr,
    board: { x: Math.round((width - side) / 2), y: Math.round(y), w: side, h: side },
    cell,
    inset: Math.max(2, Math.round(cell * 0.07)),
  };
}

/** The rectangle a block is drawn in: its cells' bounding box, inset. */
export function blockRect(layout: Layout, block: Block): Rect {
  const cells = cellsOf(block);
  const rows = cells.map((c) => c.row);
  const cols = cells.map((c) => c.col);
  const r0 = Math.min(...rows);
  const c0 = Math.min(...cols);
  const { board, cell, inset } = layout;
  return {
    x: board.x + c0 * cell + inset,
    y: board.y + r0 * cell + inset,
    w: (Math.max(...cols) - c0 + 1) * cell - 2 * inset,
    h: (Math.max(...rows) - r0 + 1) * cell - 2 * inset,
  };
}
