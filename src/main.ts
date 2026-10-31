import { startGame } from './game/app';
import { world1 } from './levels/world1';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

document.documentElement.style.setProperty('--ground', world1.palette.ground);
byId('build').textContent = `v${__APP_VERSION__} · build ${__BUILD_ID__}`;

startGame(
  {
    canvas: byId<HTMLCanvasElement>('board'),
    header: byId('hud'),
    footer: byId('foot'),
    level: byId<HTMLSelectElement>('level'),
    strikes: byId('strikes'),
    action: byId<HTMLButtonElement>('action'),
    again: byId<HTMLButtonElement>('again'),
    undo: byId<HTMLButtonElement>('undo'),
    restart: byId<HTMLButtonElement>('restart'),
  },
  world1,
);
