import {
  canUndo,
  current,
  exitSide,
  isSolved,
  isStuck,
  MAX_STRIKES,
  restartAttempt,
  startAttempt,
  tap as tapPiece,
  undoAttempt,
  type Attempt,
  type Block,
  type Side,
} from '../engine';
import type { World } from '../levels/types';
import { hitTest, tapOnRelease, type Target } from './hit';
import { blockCellRects, blockCentre, blockRect, computeLayout, type Layout } from './layout';
import { Renderer, type Draw } from './render';

const EXIT_MS = 220; // rule 11: under 300 ms
const SHAKE_MS = 200;
const SHAKE_PX = 4;
const PULSE_MS = 240;
/** Job 022: pieces settling after an exit slide there over this long. */
const FALL_MS = 180;
/** How long "3 strikes" stays up after the level restarts. */
const OUT_NOTE_MS = 1600;

type Anim =
  | { kind: 'exit'; block: Block; side: Side; start: number }
  | { kind: 'shake'; id: string; start: number }
  /** Job 022: a piece that settled, drawn sliding from where it was (dx, dy away) to where it is. */
  | { kind: 'fall'; id: string; dx: number; dy: number; start: number };

export interface Hud {
  readonly canvas: HTMLCanvasElement;
  readonly header: HTMLElement;
  readonly footer: HTMLElement;
  /** Tap to jump to any level (for testing). */
  readonly level: HTMLSelectElement;
  readonly strikes: HTMLElement;
  /** Under the board: "Next level" on a clear, "Undo" when stuck (job 025). */
  readonly action: HTMLButtonElement;
  /** Beside it when stuck: "Restart". */
  readonly again: HTMLButtonElement;
  /** Shown on gravity levels only (job 025): there an exit reshapes the board. */
  readonly undo: HTMLButtonElement;
  readonly restart: HTMLButtonElement;
}

export function startGame(hud: Hud, world: World): void {
  const ctx = hud.canvas.getContext('2d')!;
  const renderer = new Renderer(ctx, world);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let levelIndex = 0;
  let attempt: Attempt = startAttempt(world.levels[0]!.start);
  let outUntil = 0;
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
    layout = computeLayout(width, height, dpr, start.rows, start.cols, top, bottom);
    renderer.resize(layout, start.rails, start.gravity);
    requestFrame();
  }

  function updateHud(): void {
    const state = current(attempt.history);
    const solved = isSolved(state);
    const stuck = isStuck(state);
    hud.level.value = String(levelIndex);
    const marks = Array.from({ length: MAX_STRIKES }, (_, i) => (i < attempt.strikes ? '✕' : '○')).join(' ');
    hud.strikes.textContent = solved
      ? 'Cleared'
      : stuck
        ? 'Stuck: no piece can leave'
        : performance.now() < outUntil
          ? '3 strikes: level restarted'
          : `Strikes ${marks}`;
    hud.strikes.setAttribute(
      'aria-label',
      solved ? 'Cleared' : stuck ? 'Stuck: no piece can leave' : `Strikes: ${attempt.strikes} of ${MAX_STRIKES}`,
    );
    hud.undo.hidden = !state.gravity;
    hud.undo.disabled = !canUndo(attempt.history);
    hud.restart.disabled = !canUndo(attempt.history) && attempt.strikes === 0 && !stuck;
    const hasNext = solved && levelIndex < world.levels.length - 1;
    hud.action.textContent = stuck ? 'Undo' : 'Next level';
    hud.again.hidden = !stuck;
    hud.action.classList.toggle('hidden', !hasNext && !stuck);
    hud.action.disabled = !hasNext && !stuck;
  }

  function loadLevel(index: number): void {
    levelIndex = index;
    outUntil = 0;
    resetTo(startAttempt(world.levels[index]!.start));
    relayout();
  }

  // The engine state changes at once; animations only replay it visually,
  // so the next tap is accepted immediately and taps chain (rule 11).
  // Rule 5: a tap on a piece whose lane is not clear is a strike; the third
  // restarts the level.
  function tap(id: string, now: number): void {
    const before = current(attempt.history);
    const result = tapPiece(attempt, id);
    if (result.kind === 'none') return;
    attempt = result.attempt;
    anims = anims.filter((a) => !(a.kind === 'shake' && a.id === id));
    if (result.kind === 'exit') {
      anims.push({ kind: 'exit', block: result.block, side: result.side, start: now });
      // Job 022: on a gravity level the rest may settle. Each moved piece slides from where it
      // was drawn (including any fall still under way) to its new place.
      for (const b of current(attempt.history).blocks) {
        const was = before.blocks.find((x) => x.id === b.id);
        if (!was || (was.anchor.row === b.anchor.row && was.anchor.col === b.anchor.col)) continue;
        const still = fallOffset(b.id, now);
        anims = anims.filter((a) => !(a.kind === 'fall' && a.id === b.id));
        const dx = (was.anchor.col - b.anchor.col) * layout.cell + still.dx;
        const dy = (was.anchor.row - b.anchor.row) * layout.cell + still.dy;
        if (!motion.matches) anims.push({ kind: 'fall', id: b.id, dx, dy, start: now });
      }
    } else {
      if (result.kind === 'out') {
        anims = [];
        outUntil = now + OUT_NOTE_MS;
        setTimeout(updateHud, OUT_NOTE_MS);
      }
      anims.push({ kind: 'shake', id, start: now });
    }
    updateHud();
    requestFrame();
  }

  function resetTo(next: Attempt): void {
    attempt = next;
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
    anims = anims.filter((a) => now - a.start < (a.kind === 'exit' ? EXIT_MS : a.kind === 'fall' ? FALL_MS : reduced ? PULSE_MS : SHAKE_MS));
    const draws: Draw[] = [];
    for (const block of current(attempt.history).blocks) {
      const shake = anims.find((a) => a.kind === 'shake' && a.id === block.id);
      const pressed = [...presses.values()].some((p) => p.over === block.id);
      const fall = fallOffset(block.id, now);
      const draw = shake ? shakeDraw(block, now - shake.start, reduced) : { block, dx: 0, dy: 0, alpha: 1, clip: false };
      draws.push({ ...draw, dx: draw.dx + fall.dx, dy: draw.dy + fall.dy, pressed });
    }
    for (const a of anims) {
      if (a.kind === 'exit') draws.push(exitDraw(a.block, a.side, now - a.start, reduced));
    }
    renderer.frame(draws);
    if (anims.length > 0) requestFrame();
  }

  /** How far a settling piece still is from its place: eased in, so it drops and lands. */
  function fallOffset(id: string, now: number): { dx: number; dy: number } {
    const a = anims.find((x) => x.kind === 'fall' && x.id === id);
    if (!a || a.kind !== 'fall') return { dx: 0, dy: 0 };
    const t = Math.min((now - a.start) / FALL_MS, 1);
    const left = 1 - t * t;
    return { dx: a.dx * left, dy: a.dy * left };
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
    const side = exitSide(current(attempt.history), block);
    const vertical = side === 'top' || side === 'bottom';
    return { block, dx: vertical ? 0 : offset, dy: vertical ? offset : 0, alpha: 1, clip: false };
  }

  // Input. The piece is chosen where the finger goes down; the tap commits on
  // lift only if the finger is still on that piece (rule 19: sliding off
  // cancels at no cost). Each pointer is tracked, so two fingers chain.
  // While a finger is down, the piece lifting would commit to is lit, and
  // goes dark when the finger slides off it (job 018).
  const presses = new Map<number, { down: string | null; over: string | null }>();
  const pointAt = (e: PointerEvent) => {
    const rect = hud.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const targets = (): Target[] =>
    current(attempt.history).blocks.map((block) => ({
      id: block.id,
      rects: blockCellRects(layout, block),
      centre: blockCentre(layout, block),
    }));
  hud.canvas.addEventListener('pointerdown', (e) => {
    const { x, y } = pointAt(e);
    const down = hitTest(targets(), x, y, layout.cell);
    presses.set(e.pointerId, { down, over: down });
    requestFrame();
  });
  hud.canvas.addEventListener('pointermove', (e) => {
    const press = presses.get(e.pointerId);
    if (!press) return;
    const { x, y } = pointAt(e);
    const over = tapOnRelease(targets(), press.down, x, y, layout.cell);
    if (over === press.over) return;
    presses.set(e.pointerId, { ...press, over });
    requestFrame();
  });
  hud.canvas.addEventListener('pointerup', (e) => {
    const downId = presses.get(e.pointerId)?.down ?? null;
    presses.delete(e.pointerId);
    const { x, y } = pointAt(e);
    const id = tapOnRelease(targets(), downId, x, y, layout.cell);
    if (id) tap(id, performance.now());
    requestFrame();
  });
  hud.canvas.addEventListener('pointercancel', (e) => {
    presses.delete(e.pointerId);
    requestFrame();
  });

  hud.undo.addEventListener('click', () => resetTo(undoAttempt(attempt)));
  hud.restart.addEventListener('click', () => {
    outUntil = 0;
    resetTo(restartAttempt(attempt));
  });
  world.levels.forEach((level, i) => hud.level.add(new Option(`Level ${level.id}`, String(i))));
  hud.level.addEventListener('change', () => {
    loadLevel(Number(hud.level.value));
    hud.level.blur();
  });
  hud.action.addEventListener('click', () => {
    if (isStuck(current(attempt.history))) resetTo(undoAttempt(attempt));
    else loadLevel(levelIndex + 1);
  });
  hud.again.addEventListener('click', () => resetTo(restartAttempt(attempt)));
  window.addEventListener('resize', relayout);

  updateHud();
  relayout();
}
