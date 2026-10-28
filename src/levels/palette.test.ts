import { describe, expect, it } from 'vitest';
import { world1 } from './world1';

// WCAG relative luminance and contrast ratio.
const channel = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
const rgb = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16)) as [number, number, number];
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
/** OKLab lightness, 0 to 1: how light a colour looks, whatever its hue. */
const lightness = (hex: string) => {
  const [r, g, b] = rgb(hex).map(channel) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
};

describe('palette (jobs 015 and 016)', () => {
  const { ground, blocks } = world1.palette;
  const colours = Object.entries(blocks);

  it('keeps the sky blue #40B4FF as cyan, the anchor', () => {
    expect(blocks.cyan).toBe('#40B4FF');
  });

  it('gives all four colours roughly equal contrast on the ground, well past 4.5:1', () => {
    const ratios = colours.map(([, hex]) => contrast(hex, ground));
    for (const r of ratios) expect(r).toBeGreaterThanOrEqual(8);
    expect(Math.max(...ratios) / Math.min(...ratios)).toBeLessThanOrEqual(1.25);
  });

  it('separates every pair by lightness, not hue alone (rule 15)', () => {
    for (const [a, x] of colours) {
      for (const [b, y] of colours) {
        if (a < b) expect(Math.abs(lightness(x) - lightness(y)), `${a} vs ${b}`).toBeGreaterThanOrEqual(0.015);
      }
    }
  });
});
