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
    // Job 015: cyan is the anchor; violet lifted, mint moved toward green and below cyan in
    // lightness. Contrast on the ground is 9.2 to 11.3 (palette.test.ts).
    blocks: { cyan: '#4CD6E6', amber: '#F2A93B', violet: '#B5A5FF', mint: '#4FC86E' },
  },
  glyphs: { cyan: 'square', amber: 'triangle', violet: 'circle', mint: 'diamond' },
  rails,
  // Levels 1 to 10 come from the board search (tools/make-levels.ts).
  levels: generatedLevels,
};
