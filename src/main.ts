import { startGame } from './game/app';
import { world1 } from './levels/world1';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

document.documentElement.style.setProperty('--ground', world1.palette.ground);
byId('build').textContent = `build ${__BUILD_ID__}`;

startGame(
  {
    canvas: byId<HTMLCanvasElement>('board'),
    header: byId('hud'),
    footer: byId('build'),
    moves: byId('moves'),
    undo: byId<HTMLButtonElement>('undo'),
    restart: byId<HTMLButtonElement>('restart'),
  },
  world1,
  world1.levels[0]!,
);
