import { beforeEach, describe, expect, it } from '@jest/globals';

import { colorDeltaChannels } from '../colorDelta.ts';
import compose from '../compose.ts';

import getDiffPixel, { writeDiffPixel } from '../getDiffPixel.ts';
import type { DiffPixel } from '../getDiffPixel.ts';

let subject: () => DiffPixel;
let previousPixel: number[];
let currentPixel: number[];

beforeEach(() => {
  previousPixel = [255, 255, 255, 255];
  currentPixel = [255, 255, 255, 255];
  subject = () =>
    getDiffPixel(
      previousPixel[0],
      previousPixel[1],
      previousPixel[2],
      previousPixel[3],
      currentPixel[0],
      currentPixel[1],
      currentPixel[2],
      currentPixel[3],
    );
});

it('returns semi-opaque source if no diff', () => {
  expect(subject()).toEqual({ diff: 0, pixel: [255, 255, 255, 140] });
});

it('returns magenta when diff', () => {
  currentPixel = [120, 120, 255, 255];
  expect(subject()).toEqual({
    diff: 0.23089126029146917,
    pixel: [179, 54, 130, 58.877271374324636],
  });
});

it('returns diff when after is filler pixel', () => {
  currentPixel = [1, 1, 1, 1];
  expect(subject()).toEqual({
    diff: 1,
    pixel: [179, 54, 130, 255],
  });
});

it('returns diff when before is filler pixel', () => {
  previousPixel = [1, 1, 1, 1];
  expect(subject()).toEqual({
    diff: 1,
    pixel: [179, 54, 130, 255],
  });
});

describe('writeDiffPixel', () => {
  // What getDiffPixel returned before it wrote into a buffer instead, built
  // from compose() the way it used to be.
  function composed(diff: number, r2: number, g2: number, b2: number, a2: number) {
    const transparent = [0, 0, 0, 0] as const;
    if (diff === 0) {
      return a2 === 0 ? transparent : compose([r2, g2, b2, 140], transparent);
    }
    return compose([179, 54, 130, 255 * Math.max(0.2, diff)], transparent);
  }

  it('writes exactly what composing the pixel produced', () => {
    const values = [0, 1, 17, 128, 200, 254, 255];
    const out = new Uint8ClampedArray(4);
    const expected = new Uint8ClampedArray(4);
    for (const v1 of values) {
      for (const v2 of values) {
        for (const a2 of [0, 1, 140, 255]) {
          const diff = Math.abs(
            colorDeltaChannels(v1, v1, v2, 255, v2, v1, v2, a2),
          );
          writeDiffPixel(out, 0, diff, v2, v1, v2, a2);
          expected.set(Array.from(composed(diff, v2, v1, v2, a2)));
          expect(Array.from(out)).toEqual(Array.from(expected));
        }
      }
    }
  });
});
