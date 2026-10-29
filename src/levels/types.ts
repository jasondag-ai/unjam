import type { Colour, Rails, State } from '../engine';

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
  /** Which colour rail runs along each side. */
  readonly rails: Rails;
  readonly levels: readonly Level[];
}

export interface Level {
  readonly id: string;
  readonly start: State;
  /**
   * Job 022 (spike): taps that clear a gravity board. On a gravity board the
   * order matters, so the build's order is kept with the level.
   */
  readonly solution?: readonly string[];
}
