import { cellsOf, type Block, type Cell } from '../engine';

export const GUTTER = 16;
/**
 * Room outside the frame for the rails and their glyphs. Kept tight so a
 * 7x7 board still has 44 px cells on a 390 px wide phone (rule 2).
 */
export const FRAME_MARGIN = 20;
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
 * of the HUD bands above (`top`) and below (`bottom`). Cells are square; the
 * board takes the largest cell that fits both ways.
 */
export function computeLayout(
  width: number,
  height: number,
  dpr: number,
  rows: number,
  cols: number,
  top: number,
  bottom: number,
): Layout {
  const room = 2 * GUTTER + 2 * FRAME_MARGIN;
  const cell = Math.floor(Math.min((width - room) / cols, (height - top - bottom - room) / rows));
  const w = cell * cols;
  const h = cell * rows;
  const minY = top + GUTTER + FRAME_MARGIN;
  const maxY = height - bottom - GUTTER - FRAME_MARGIN - h;
  const y = Math.min(Math.max((height - h) / 2, minY), Math.max(minY, maxY));
  return {
    width,
    height,
    dpr,
    board: { x: Math.round((width - w) / 2), y: Math.round(y), w, h },
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

export interface Point {
  readonly x: number;
  readonly y: number;
}

const has = (cells: readonly Cell[], row: number, col: number) => cells.some((c) => c.row === row && c.col === col);

/**
 * One rectangle per cell, inset only on the sides that face away from the
 * block, so together they cover the block as drawn. Used for hit testing.
 */
export function blockCellRects(layout: Layout, block: Block): Rect[] {
  const cells = cellsOf(block);
  const { board, cell, inset } = layout;
  return cells.map(({ row, col }) => {
    const top = has(cells, row - 1, col) ? 0 : inset;
    const left = has(cells, row, col - 1) ? 0 : inset;
    const bottom = has(cells, row + 1, col) ? 0 : inset;
    const right = has(cells, row, col + 1) ? 0 : inset;
    return {
      x: board.x + col * cell + left,
      y: board.y + row * cell + top,
      w: cell - left - right,
      h: cell - top - bottom,
    };
  });
}

/** Middle of the block's cells. May fall outside a bent shape. */
export function blockCentre(layout: Layout, block: Block): Point {
  const cells = cellsOf(block);
  const { board, cell } = layout;
  const row = cells.reduce((n, c) => n + c.row, 0) / cells.length;
  const col = cells.reduce((n, c) => n + c.col, 0) / cells.length;
  return { x: board.x + (col + 0.5) * cell, y: board.y + (row + 0.5) * cell };
}

/** Centre of the block's own cell nearest its middle: where its glyph goes. */
export function blockMark(layout: Layout, block: Block): Point {
  const mid = blockCentre(layout, block);
  const { board, cell } = layout;
  const centres = cellsOf(block).map((c) => ({ x: board.x + (c.col + 0.5) * cell, y: board.y + (c.row + 0.5) * cell }));
  return centres.reduce((a, b) => (Math.hypot(b.x - mid.x, b.y - mid.y) < Math.hypot(a.x - mid.x, a.y - mid.y) ? b : a));
}

/**
 * The block's outline, clockwise, inset from its cell edges. Pieces of up to
 * six cells never enclose a hole, so the outline is one simple polygon.
 */
export function blockOutline(layout: Layout, block: Block): Point[] {
  const cells = cellsOf(block);
  // Clockwise boundary edges in grid units (x = col, y = row), keyed by start.
  const next = new Map<string, Point>();
  const add = (x1: number, y1: number, x2: number, y2: number) => next.set(`${x1},${y1}`, { x: x2, y: y2 });
  for (const { row: r, col: c } of cells) {
    if (!has(cells, r - 1, c)) add(c, r, c + 1, r);
    if (!has(cells, r, c + 1)) add(c + 1, r, c + 1, r + 1);
    if (!has(cells, r + 1, c)) add(c + 1, r + 1, c, r + 1);
    if (!has(cells, r, c - 1)) add(c, r + 1, c, r);
  }
  const first = cells.reduce((a, b) => (b.row < a.row || (b.row === a.row && b.col < a.col) ? b : a));
  const start = { x: first.col, y: first.row };
  const ring: Point[] = [start];
  for (let p = next.get(`${start.x},${start.y}`)!; p.x !== start.x || p.y !== start.y; p = next.get(`${p.x},${p.y}`)!) {
    ring.push(p);
  }
  // Keep corners only.
  const corners = ring.filter((p, i) => {
    const a = ring[(i + ring.length - 1) % ring.length]!;
    const b = ring[(i + 1) % ring.length]!;
    return (a.x - p.x) * (b.y - p.y) - (a.y - p.y) * (b.x - p.x) !== 0;
  });
  // Move each corner inward along both edge normals. For right angles this
  // is exact at outer and inner corners alike.
  const { board, cell, inset } = layout;
  return corners.map((p, i) => {
    const a = corners[(i + corners.length - 1) % corners.length]!;
    const b = corners[(i + 1) % corners.length]!;
    const d1 = { x: Math.sign(p.x - a.x), y: Math.sign(p.y - a.y) };
    const d2 = { x: Math.sign(b.x - p.x), y: Math.sign(b.y - p.y) };
    // Inward normal of a clockwise edge (y down) is (-dy, dx).
    return {
      x: board.x + p.x * cell + inset * (-d1.y - d2.y),
      y: board.y + p.y * cell + inset * (d1.x + d2.x),
    };
  });
}
