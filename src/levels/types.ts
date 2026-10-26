import type { Colour, State } from '../engine';

export type Glyph = 'square' | 'triangle' | 'circle' | 'diamond';

/** Everything a world looks like. The renderer reads colours only from here (rule 8). */
export interface World {
  readonly id: string;
  readonly palette: {
    readonly ground: string;
    readonly grid: string;
    readonly frame: string;
    readonly blocks: Readonly<Record<Colour, string>>;
  };
  /** One glyph per colour, always drawn (rule 1). */
  readonly glyphs: Readonly<Record<Colour, Glyph>>;
  readonly levels: readonly Level[];
}

export interface Level {
  readonly id: string;
  readonly start: State;
}
