import type { Block, Gate } from '../engine';
import type { Glyph, World } from '../levels/types';
import { blockRect, type Layout, type Rect } from './layout';

/** One block to draw this frame, offset from its resting place. */
export interface Draw {
  readonly block: Block;
  readonly dx: number;
  readonly dy: number;
  readonly alpha: number;
  /** Clip to the board so an exiting block disappears into its gate. */
  readonly clip: boolean;
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

  resize(layout: Layout, gates: readonly Gate[]): void {
    this.layout = layout;
    this.sprites.clear();
    this.background = this.paintBackground(layout, gates);
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
      const sprite = this.sprite(d.block, r);
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

  private sprite(block: Block, r: Rect): HTMLCanvasElement {
    const key = `${block.colour}:${r.w}x${r.h}`;
    const cached = this.sprites.get(key);
    if (cached) return cached;
    const dpr = this.layout!.dpr;
    const pad = GLOW * 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((r.w + pad * 2) * dpr);
    canvas.height = Math.ceil((r.h + pad * 2) * dpr);
    const g = canvas.getContext('2d')!;
    g.scale(dpr, dpr);
    const colour = this.world.palette.blocks[block.colour];
    const radius = Math.min(r.w, r.h) * 0.18;
    const box = { x: pad, y: pad, w: r.w, h: r.h };

    // Translucent fill of the block's own colour.
    g.globalAlpha = 0.16;
    g.fillStyle = colour;
    roundRect(g, box, radius);
    g.fill();

    // Outer glow, then the lit border on top of it.
    g.globalAlpha = 1;
    g.shadowColor = colour;
    g.shadowBlur = GLOW;
    g.strokeStyle = colour;
    g.lineWidth = BORDER;
    roundRect(g, inflate(box, -BORDER / 2), radius);
    g.stroke();
    g.shadowBlur = GLOW / 2;
    g.stroke();

    // Glyph mark (rule 1), always drawn.
    g.shadowBlur = 4;
    const size = Math.min(r.w, r.h) * 0.36;
    drawGlyph(g, this.world.glyphs[block.colour], box.x + box.w / 2, box.y + box.h / 2, size, colour, 2);

    this.sprites.set(key, canvas);
    return canvas;
  }

  private paintBackground(layout: Layout, gates: readonly Gate[]): HTMLCanvasElement {
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
    const n = Math.round(board.w / cell);
    g.strokeStyle = palette.grid;
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < n; i++) {
      const p = i * cell + 0.5;
      g.moveTo(board.x + p, board.y);
      g.lineTo(board.x + p, board.y + board.h);
      g.moveTo(board.x, board.y + p);
      g.lineTo(board.x + board.w, board.y + p);
    }
    g.stroke();

    // Frame.
    g.strokeStyle = palette.frame;
    g.strokeRect(board.x - 0.5, board.y - 0.5, board.w + 1, board.h + 1);

    // Gates: glowing bars on the frame, with their glyph just outside so a
    // gate is never told apart by colour alone (rule 1).
    for (const gate of gates) {
      const colour = palette.blocks[gate.colour];
      const { bar, mark } = gateGeometry(layout, gate);
      g.fillStyle = colour;
      g.shadowColor = colour;
      g.shadowBlur = 14;
      roundRect(g, bar, Math.min(bar.w, bar.h) / 2);
      g.fill();
      g.shadowBlur = 0;
      drawGlyph(g, glyphs[gate.colour], mark.x, mark.y, 9, colour, 1.5);
    }
    return canvas;
  }
}

function gateGeometry(layout: Layout, gate: Gate): { bar: Rect; mark: { x: number; y: number } } {
  const { board, cell, inset } = layout;
  const t = 4;
  const along = gate.index * cell + inset * 1.5;
  const len = cell - inset * 3;
  const mid = gate.index * cell + cell / 2;
  const out = 16;
  switch (gate.side) {
    case 'top':
      return { bar: { x: board.x + along, y: board.y - t / 2, w: len, h: t }, mark: { x: board.x + mid, y: board.y - out } };
    case 'bottom':
      return { bar: { x: board.x + along, y: board.y + board.h - t / 2, w: len, h: t }, mark: { x: board.x + mid, y: board.y + board.h + out } };
    case 'left':
      return { bar: { x: board.x - t / 2, y: board.y + along, w: t, h: len }, mark: { x: board.x - out, y: board.y + mid } };
    case 'right':
      return { bar: { x: board.x + board.w - t / 2, y: board.y + along, w: t, h: len }, mark: { x: board.x + board.w + out, y: board.y + mid } };
  }
}

function inflate(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
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
