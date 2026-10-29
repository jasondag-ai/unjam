import { cellsOf, partsOf, type Block, type Rails, type Side } from '../engine';
import type { Glyph, World } from '../levels/types';
import { blockMark, blockOutline, blockRect, type Layout, type Point, type Rect } from './layout';

/** One block to draw this frame, offset from its resting place. */
export interface Draw {
  readonly block: Block;
  readonly dx: number;
  readonly dy: number;
  readonly alpha: number;
  /** Clip to the board so an exiting block disappears into its rail. */
  readonly clip: boolean;
  /** A finger is down on it and lifting now would commit to it (job 018). */
  readonly pressed?: boolean;
}

const GLOW = 10;
const BORDER = 1.5;

/**
 * Canvas renderer. Glows are expensive (shadowBlur), so the background and
 * each block are drawn once per layout into offscreen sprites; a frame is
 * one background copy plus one copy per block (rule 12).
 */
export class Renderer {
  private layout: Layout | null = null;
  private background: HTMLCanvasElement | null = null;
  private sprites = new Map<string, HTMLCanvasElement>();

  constructor(private readonly ctx: CanvasRenderingContext2D, private readonly world: World) {}

  resize(layout: Layout, rails: Rails): void {
    this.layout = layout;
    this.sprites.clear();
    this.background = this.paintBackground(layout, rails);
  }

  frame(draws: readonly Draw[]): void {
    const { ctx, layout, background } = this;
    if (!layout || !background) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(background, 0, 0);
    ctx.setTransform(layout.dpr, 0, 0, layout.dpr, 0, 0);
    const { board } = layout;
    for (const d of draws) {
      const r = blockRect(layout, d.block);
      const sprite = this.sprite(d.block, r, d.pressed ?? false);
      ctx.globalAlpha = d.alpha;
      if (d.clip) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(board.x, board.y, board.w, board.h);
        ctx.clip();
      }
      ctx.drawImage(sprite, r.x - GLOW * 2 + d.dx, r.y - GLOW * 2 + d.dy, r.w + GLOW * 4, r.h + GLOW * 4);
      if (d.clip) ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** A pressed block is the same sprite, lit up: a denser fill, a thicker border and more glow. */
  private sprite(block: Block, r: Rect, pressed: boolean): HTMLCanvasElement {
    const shapeKey = block.shape.map((c) => `${c.row}.${c.col}`).join(' ');
    const key = `${block.colours?.join('.') ?? block.colour}:${shapeKey}${pressed ? ':pressed' : ''}`;
    const cached = this.sprites.get(key);
    if (cached) return cached;
    const layout = this.layout!;
    const dpr = layout.dpr;
    const pad = GLOW * 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((r.w + pad * 2) * dpr);
    canvas.height = Math.ceil((r.h + pad * 2) * dpr);
    const g = canvas.getContext('2d')!;
    g.scale(dpr, dpr);
    // Sprite space: the block's bounding box starts at (pad, pad).
    g.translate(pad - r.x, pad - r.y);
    const outline = blockOutline(layout, block);
    const parts = partsOf(block);
    if (parts.length === 1) {
      this.paintPiece(g, block, outline, block.colour, pressed);
    } else {
      // Job 021: a split piece. Each part paints the whole piece in its own colour, clipped to
      // its own cells (and the glow beyond their outer sides), so the outline runs around the
      // whole shape and changes colour where the parts meet. A dimmer seam marks the join.
      for (const part of parts) {
        g.save();
        territory(g, layout, block, part, pad);
        g.clip();
        this.paintPiece(g, part, outline, part.colour, pressed);
        g.save();
        roundPolygon(g, outline, (layout.cell - 2 * layout.inset) * 0.18);
        g.clip();
        g.globalAlpha = 0.5;
        g.shadowBlur = 0;
        g.strokeStyle = this.world.palette.blocks[part.colour];
        g.lineWidth = 2;
        seams(g, layout, block);
        g.stroke();
        g.restore();
        g.restore();
      }
    }
    this.sprites.set(key, canvas);
    return canvas;
  }

  /** Fill, glow, lit border and glyph in one colour. The glyph goes on `mark`'s cell nearest its middle. */
  private paintPiece(g: CanvasRenderingContext2D, mark: Block, outline: readonly Point[], colourName: Block['colour'], pressed: boolean): void {
    const layout = this.layout!;
    const colour = this.world.palette.blocks[colourName];
    const radius = (layout.cell - 2 * layout.inset) * 0.18;

    // Translucent fill of the block's own colour.
    g.globalAlpha = pressed ? 0.45 : 0.16;
    g.fillStyle = colour;
    roundPolygon(g, outline, radius);
    g.fill();

    // Outer glow, then the lit border on top of it.
    g.globalAlpha = 1;
    g.shadowColor = colour;
    g.shadowBlur = pressed ? GLOW * 1.6 : GLOW;
    g.strokeStyle = colour;
    const border = pressed ? BORDER * 2 : BORDER;
    g.lineWidth = border;
    roundPolygon(g, insetPolygon(outline, border / 2), radius);
    g.stroke();
    g.shadowBlur = GLOW / 2;
    g.stroke();

    // Glyph mark (rule 1), always drawn, in the cell nearest the block's middle.
    g.shadowBlur = 4;
    const at = blockMark(layout, mark);
    drawGlyph(g, this.world.glyphs[colourName], at.x, at.y, (layout.cell - 2 * layout.inset) * 0.36, colour, 2);
  }

  private paintBackground(layout: Layout, rails: Rails): HTMLCanvasElement {
    const { palette, glyphs } = this.world;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(layout.width * layout.dpr);
    canvas.height = Math.round(layout.height * layout.dpr);
    const g = canvas.getContext('2d')!;
    g.scale(layout.dpr, layout.dpr);
    g.fillStyle = palette.ground;
    g.fillRect(0, 0, layout.width, layout.height);

    // Faint grid behind the board.
    const { board, cell } = layout;
    const cols = Math.round(board.w / cell);
    const rows = Math.round(board.h / cell);
    g.strokeStyle = palette.grid;
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < cols; i++) {
      g.moveTo(board.x + i * cell + 0.5, board.y);
      g.lineTo(board.x + i * cell + 0.5, board.y + board.h);
    }
    for (let i = 1; i < rows; i++) {
      g.moveTo(board.x, board.y + i * cell + 0.5);
      g.lineTo(board.x + board.w, board.y + i * cell + 0.5);
    }
    g.stroke();

    // Frame.
    g.strokeStyle = palette.frame;
    g.strokeRect(board.x - 0.5, board.y - 0.5, board.w + 1, board.h + 1);

    // Rails: one glowing bar the full length of each side, with its glyph
    // just outside so a rail is never told apart by colour alone (rule 1).
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const colour = palette.blocks[rails[side]];
      const { bar, mark } = railGeometry(layout, side);
      g.fillStyle = colour;
      g.shadowColor = colour;
      g.shadowBlur = 14;
      roundRect(g, bar, Math.min(bar.w, bar.h) / 2);
      g.fill();
      g.shadowBlur = 0;
      drawGlyph(g, glyphs[rails[side]], mark.x, mark.y, 9, colour, 1.5);
    }
    return canvas;
  }
}

function railGeometry(layout: Layout, side: Side): { bar: Rect; mark: Point } {
  const { board, inset } = layout;
  const t = 4;
  const gap = inset * 1.5; // keeps the corners apart so each rail reads as its own
  const out = 12; // glyph centre, inside FRAME_MARGIN
  const midX = board.x + board.w / 2;
  const midY = board.y + board.h / 2;
  switch (side) {
    case 'top':
      return { bar: { x: board.x + gap, y: board.y - t / 2, w: board.w - 2 * gap, h: t }, mark: { x: midX, y: board.y - out } };
    case 'bottom':
      return { bar: { x: board.x + gap, y: board.y + board.h - t / 2, w: board.w - 2 * gap, h: t }, mark: { x: midX, y: board.y + board.h + out } };
    case 'left':
      return { bar: { x: board.x - t / 2, y: board.y + gap, w: t, h: board.h - 2 * gap }, mark: { x: board.x - out, y: midY } };
    case 'right':
      return { bar: { x: board.x + board.w - t / 2, y: board.y + gap, w: t, h: board.h - 2 * gap }, mark: { x: board.x + board.w + out, y: midY } };
  }
}

/**
 * Path of one part's ground: each of its cells, pushed out by `pad` on every
 * side that faces away from the whole piece, so its glow is its own.
 */
function territory(g: CanvasRenderingContext2D, layout: Layout, block: Block, part: Block, pad: number): void {
  const all = new Set(cellsOf(block).map((c) => `${c.row},${c.col}`));
  const out = (row: number, col: number) => (all.has(`${row},${col}`) ? 0 : pad);
  const { board, cell } = layout;
  g.beginPath();
  for (const { row, col } of cellsOf(part)) {
    const top = out(row - 1, col);
    const left = out(row, col - 1);
    g.rect(board.x + col * cell - left, board.y + row * cell - top, cell + left + out(row, col + 1), cell + top + out(row + 1, col));
  }
}

/** Path along every cell edge where two parts of a split piece meet. */
function seams(g: CanvasRenderingContext2D, layout: Layout, block: Block): void {
  const colourAt = new Map<string, string>();
  cellsOf(block).forEach((c, i) => colourAt.set(`${c.row},${c.col}`, block.colours![i]!));
  const { board, cell } = layout;
  g.beginPath();
  for (const [k, colour] of colourAt) {
    const [row, col] = k.split(',').map(Number) as [number, number];
    const right = colourAt.get(`${row},${col + 1}`);
    const below = colourAt.get(`${row + 1},${col}`);
    const x = board.x + (col + 1) * cell;
    const y = board.y + (row + 1) * cell;
    if (right && right !== colour) {
      g.moveTo(x, y - cell);
      g.lineTo(x, y);
    }
    if (below && below !== colour) {
      g.moveTo(x - cell, y);
      g.lineTo(x, y);
    }
  }
}

/** Shrink a clockwise right-angled polygon by `by` (same rule as blockOutline). */
function insetPolygon(points: readonly Point[], by: number): Point[] {
  return points.map((p, i) => {
    const a = points[(i + points.length - 1) % points.length]!;
    const b = points[(i + 1) % points.length]!;
    const d1 = { x: Math.sign(p.x - a.x), y: Math.sign(p.y - a.y) };
    const d2 = { x: Math.sign(b.x - p.x), y: Math.sign(b.y - p.y) };
    return { x: p.x + by * (-d1.y - d2.y), y: p.y + by * (d1.x + d2.x) };
  });
}

/** Polygon with every corner rounded, outer and inner alike. */
function roundPolygon(g: CanvasRenderingContext2D, points: readonly Point[], radius: number): void {
  const n = points.length;
  const last = points[n - 1]!;
  const first = points[0]!;
  g.beginPath();
  g.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % n]!;
    const prev = points[(i + n - 1) % n]!;
    const r = Math.min(radius, Math.hypot(p.x - prev.x, p.y - prev.y) / 2, Math.hypot(q.x - p.x, q.y - p.y) / 2);
    g.arcTo(p.x, p.y, q.x, q.y, r);
  }
  g.closePath();
}

function roundRect(g: CanvasRenderingContext2D, r: Rect, radius: number): void {
  g.beginPath();
  g.roundRect(r.x, r.y, r.w, r.h, radius);
}

function drawGlyph(g: CanvasRenderingContext2D, glyph: Glyph, cx: number, cy: number, size: number, colour: string, width: number): void {
  const s = size / 2;
  g.strokeStyle = colour;
  g.lineWidth = width;
  g.lineJoin = 'round';
  g.beginPath();
  switch (glyph) {
    case 'square':
      g.rect(cx - s * 0.85, cy - s * 0.85, s * 1.7, s * 1.7);
      break;
    case 'triangle':
      g.moveTo(cx, cy - s);
      g.lineTo(cx + s * 1.05, cy + s * 0.8);
      g.lineTo(cx - s * 1.05, cy + s * 0.8);
      g.closePath();
      break;
    case 'circle':
      g.arc(cx, cy, s * 0.95, 0, Math.PI * 2);
      break;
    case 'diamond':
      g.moveTo(cx, cy - s * 1.1);
      g.lineTo(cx + s * 1.1, cy);
      g.lineTo(cx, cy + s * 1.1);
      g.lineTo(cx - s * 1.1, cy);
      g.closePath();
      break;
  }
  g.stroke();
}
