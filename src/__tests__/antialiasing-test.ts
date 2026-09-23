import { describe, expect, it } from '@jest/globals';

import { asPixelWords, hasManySiblings, isAntialiased } from '../antialiasing.ts';

type Pixel = [number, number, number, number];

const BLACK: Pixel = [0, 0, 0, 255];
const GREY: Pixel = [128, 128, 128, 255];
const WHITE: Pixel = [255, 255, 255, 255];

function image(rows: Pixel[][]) {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8ClampedArray(rows.flat(2));
  return { data, words: asPixelWords(data), size: { width, height } };
}

// Black on the left, white on the right, and a grey column between them: the
// ramp a rasterizer leaves along a vertical edge.
function edge() {
  return image(
    Array.from({ length: 5 }, () => [BLACK, BLACK, GREY, WHITE, WHITE]),
  );
}

function isAntialiasedIn(
  img: ReturnType<typeof image>,
  other: ReturnType<typeof image>,
  x: number,
  y: number,
): boolean {
  return isAntialiased(
    img.data,
    x,
    y,
    img.size,
    other.size,
    img.words,
    other.words,
  );
}

describe('asPixelWords', () => {
  it('views one word per pixel', () => {
    expect(asPixelWords(new Uint8ClampedArray(16)).length).toBe(4);
  });

  it('copies a buffer that does not start on a word boundary', () => {
    const backing = new Uint8Array(17);
    const words = asPixelWords(backing.subarray(1));
    expect(words.length).toBe(4);
    expect(words.buffer).not.toBe(backing.buffer);
  });
});

describe('hasManySiblings', () => {
  it('is true for a pixel inside a solid area', () => {
    const { words, size } = edge();
    expect(hasManySiblings(words, 0, 2, size)).toBe(true);
  });

  it('is false for a pixel unlike its neighbours', () => {
    const { words, size } = image([
      [WHITE, BLACK, WHITE],
      [BLACK, GREY, BLACK],
      [WHITE, BLACK, WHITE],
    ]);
    expect(hasManySiblings(words, 1, 1, size)).toBe(false);
  });
});

describe('isAntialiased', () => {
  it('is true for the ramp pixel along an edge', () => {
    const img = edge();
    expect(isAntialiasedIn(img, edge(), 2, 2)).toBe(true);
  });

  it('is false for a lone pixel on a solid background', () => {
    const img = image([
      [WHITE, WHITE, WHITE],
      [WHITE, GREY, WHITE],
      [WHITE, WHITE, WHITE],
    ]);
    expect(isAntialiasedIn(img, img, 1, 1)).toBe(false);
  });

  it('is false when the other image has no solid colour to anchor the ramp', () => {
    const img = edge();
    const noisy = image(
      Array.from({ length: 5 }, (_, y) =>
        Array.from({ length: 5 }, (_, x): Pixel => {
          const v = (x * 53 + y * 97) % 256;
          return [v, v, v, 255];
        }),
      ),
    );
    expect(isAntialiasedIn(img, noisy, 2, 2)).toBe(false);
  });
});
