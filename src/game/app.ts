import {
  applyExit,
  canExit,
  canUndo,
  commit,
  createHistory,
  current,
  exitSide,
  findBlock,
  isSolved,
  restart,
  undo,
  type Block,
  type History,
  type Side,
} from '../engine';
import type { World } from '../levels/types';
import { hitTest } from './hit';
import { blockCellRects, blockCentre, blockRect, computeLayout, type Layout } from './layout';
import { Renderer, type Draw } from './render';

const EXIT_MS = 220; // rule 11: under 300 ms
const SHAKE_MS = 200;
const SHAKE_PX = 4;
const PULSE_MS = 240;
/** A pointer that moves further than this is not a tap. */
const TAP_SLOP = 12;

type Anim =
  | { kind: 'exit'; block: Block; side: Side; start: number }
  | { kind: 'shake'; id: string; start: number };

export interface Hud {
  readonly canvas: HTMLCanvasElement;
  readonly header: HTMLElement;
  readonly footer: HTMLElement;
  readonly level: HTMLElement;
  readonly moves: HTMLElement;
  readonly next: HTMLButtonElement;
  readonly undo: HTMLButtonElement;
  readonly restart: HTMLButtonElement;
}

export function startGame(hud: Hud, world: World): void {
  const ctx = hud.canvas.getContext('2d')!;
  const renderer = new Renderer(ctx, world);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let levelIndex = 0;
  let history: History = createHistory(world.levels[0]!.start);
  let layout: Layout;
  let anims: Anim[] = [];
  let frameRequested = false;

  function relayout(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    hud.canvas.width = Math.round(width * dpr);
    hud.canvas.height = Math.round(height * dpr);
    hud.canvas.style.width = `${width}px`;
    hud.canvas.style.height = `${height}px`;
    const top = hud.header.getBoundingClientRect().bottom;
    const bottom = height - hud.footer.getBoundingClientRect().top;
    const start = world.levels[levelIndex]!.start;
    layout = computeLayout(width, height, dpr, start.size, top, bottom);
    renderer.resize(layout, start.rails);
    requestFrame();
  }

  function updateHud(): void {
    const state = current(history);
    const solved = isSolved(state);
    hud.level.textContent = `Level ${world.levels[levelIndex]!.id}`;
    hud.moves.textContent = solved ? `Cleared in ${state.moves} moves` : `Moves ${state.moves}`;
    hud.undo.disabled = !canUndo(history);
    hud.restart.disabled = !canUndo(history);
    const hasNext = solved && levelIndex < world.levels.length - 1;
    hud.next.classList.toggle('hidden', !hasNext);
    hud.next.disabled = !hasNext;
  }

  function loadLevel(index: number): void {
    levelIndex = index;
    resetTo(createHistory(world.levels[index]!.start));
    relayout();
  }

  // The engine state changes at once; animations only replay it visually,
  // so the next tap is accepted immediately and taps chain (rule 11).
  function tap(id: string, now: number): void {
    const state = current(history);
    if (!findBlock(state, id)) return;
    const side = canExit(state, id);
    if (side) {
      anims = anims.filter((a) => !(a.kind === 'shake' && a.id === id));
      anims.push({ kind: 'exit', block: findBlock(state, id)!, side, start: now });
      history = commit(history, applyExit(state, id));
      updateHud();
    } else {
      anims = anims.filter((a) => !(a.kind === 'shake' && a.id === id));
      anims.push({ kind: 'shake', id, start: now });
    }
    requestFrame();
  }

  function resetTo(next: History): void {
    history = next;
    anims = [];
    updateHud();
    requestFrame();
  }

  function requestFrame(): void {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(drawFrame);
  }

  function drawFrame(now: number): void {
    frameRequested = false;
    const reduced = motion.matches;
    anims = anims.filter((a) => now - a.start < (a.kind === 'exit' ? EXIT_MS : reduced ? PULSE_MS : SHAKE_MS));
    const draws: Draw[] = [];
    for (const block of current(history).blocks) {
      const shake = anims.find((a) => a.kind === 'shake' && a.id === block.id);
      draws.push(shake ? shakeDraw(block, now - shake.start, reduced) : { block, dx: 0, dy: 0, alpha: 1, clip: false });
    }
    for (const a of anims) {
      if (a.kind === 'exit') draws.push(exitDraw(a.block, a.side, now - a.start, reduced));
    }
    renderer.frame(draws);
    if (anims.length > 0) requestFrame();
  }

  function exitDraw(block: Block, side: Side, elapsed: number, reduced: boolean): Draw {
    const t = Math.min(elapsed / EXIT_MS, 1);
    if (reduced) return { block, dx: 0, dy: 0, alpha: 1 - t, clip: false };
    const r = blockRect(layout, block);
    const b = layout.board;
    const p = t * (0.4 + 0.6 * t); // quick start, accelerating out
    const travel = {
      top: { dx: 0, dy: -(r.y + r.h - b.y) },
      bottom: { dx: 0, dy: b.y + b.h - r.y },
      left: { dx: -(r.x + r.w - b.x), dy: 0 },
      right: { dx: b.x + b.w - r.x, dy: 0 },
    }[side];
    return { block, dx: travel.dx * p, dy: travel.dy * p, alpha: 1, clip: true };
  }

  function shakeDraw(block: Block, elapsed: number, reduced: boolean): Draw {
    if (reduced) {
      // Opacity only (rule 14): dip and recover.
      const t = elapsed / PULSE_MS;
      return { block, dx: 0, dy: 0, alpha: 1 - 0.6 * Math.sin(Math.PI * t), clip: false };
    }
    const t = elapsed / SHAKE_MS;
    const offset = SHAKE_PX * Math.sin(t * Math.PI * 6) * (1 - t);
    // Shake toward the rail it wants to reach.
    const side = exitSide(current(history), block);
    const vertical = side === 'top' || side === 'bottom';
    return { block, dx: vertical ? 0 : offset, dy: vertical ? offset : 0, alpha: 1, clip: false };
  }

  // Input. The block is chosen where the pointer went down; a release close
  // to that point is a tap. Each pointer is tracked, so two fingers chain.
  const downs = new Map<number, { id: string | null; x: number; y: number }>();
  const pointAt = (e: PointerEvent) => {
    const rect = hud.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  hud.canvas.addEventListener('pointerdown', (e) => {
    const { x, y } = pointAt(e);
    const targets = current(history).blocks.map((block) => ({
      id: block.id,
      rects: blockCellRects(layout, block),
      centre: blockCentre(layout, block),
    }));
    downs.set(e.pointerId, { id: hitTest(targets, x, y, layout.cell), x, y });
  });
  hud.canvas.addEventListener('pointerup', (e) => {
    const down = downs.get(e.pointerId);
    downs.delete(e.pointerId);
    if (!down?.id) return;
    const { x, y } = pointAt(e);
    if (Math.hypot(x - down.x, y - down.y) > TAP_SLOP) return;
    tap(down.id, performance.now());
  });
  hud.canvas.addEventListener('pointercancel', (e) => downs.delete(e.pointerId));

  hud.undo.addEventListener('click', () => resetTo(undo(history)));
  hud.restart.addEventListener('click', () => resetTo(restart(history)));
  hud.next.addEventListener('click', () => loadLevel(levelIndex + 1));
  window.addEventListener('resize', relayout);

  updateHud();
  relayout();
}
