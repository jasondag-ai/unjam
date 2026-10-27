import type { Rails } from '../engine';
import type { World } from './types';
import { generatedLevels } from './world1.generated';

const rails: Rails = { top: 'amber', right: 'cyan', bottom: 'violet', left: 'mint' };

export const world1: World = {
  id: 'world1',
  palette: {
    ground: '#060B14',
    grid: 'rgba(140, 170, 210, 0.07)',
    frame: 'rgba(140, 170, 210, 0.22)',
    blocks: { cyan: '#40B4FF', amber: '#F2A93B', violet: '#7D6CF5', mint: '#5BE8A8' },
  },
  glyphs: { cyan: 'square', amber: 'triangle', violet: 'circle', mint: 'diamond' },
  rails,
  // Levels 1 to 10 come from the board search (tools/make-levels.ts).
  levels: generatedLevels,
};
