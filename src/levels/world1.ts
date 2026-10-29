import type { Rails } from '../engine';
import type { World } from './types';
import { gravityLevels } from './gravity.generated';
import { generatedLevels } from './world1.generated';

const rails: Rails = { top: 'amber', right: 'cyan', bottom: 'violet', left: 'mint' };

export const world1: World = {
  id: 'world1',
  palette: {
    ground: '#060B14',
    grid: 'rgba(140, 170, 210, 0.07)',
    frame: 'rgba(140, 170, 210, 0.22)',
    // Job 016: sky blue is the anchor (it was the blue Jason liked, v0.0.8). The others sit
    // around it in lightness, mint below it so the two are not both bright blue-greens.
    // Contrast on the ground is 8.4 to 9.9 (palette.test.ts).
    blocks: { cyan: '#40B4FF', amber: '#F2A93B', violet: '#B3A3FF', mint: '#4ABF6A' },
  },
  glyphs: { cyan: 'square', amber: 'triangle', violet: 'circle', mint: 'diamond' },
  rails,
  // Levels 1 to 10 come from the board search (tools/make-levels.ts).
  // Job 022 (spike): three gravity levels at the end, so nothing before them changes.
  levels: [...generatedLevels, ...gravityLevels],
};
