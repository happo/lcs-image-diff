import { describe, expect, it } from 'vitest';

import colorDelta, { colorDeltaChannels } from '../colorDelta.ts';

describe('colorDelta', () => {
  it('produces the same results as colorDeltaChannels', () => {
    const pixels = [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [1, 46, 250, 0],
      [1, 42, 250, 4],
    ];

    for (const a of pixels) {
      for (const b of pixels) {
        expect(colorDelta(a, b)).toEqual(
          colorDeltaChannels(a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3]),
        );
      }
    }
  });
});

it('is large when comparing black and white', () => {
  expect(colorDeltaChannels(0, 0, 0, 255, 255, 255, 255, 255)).toBeGreaterThan(
    0.92,
  );
});

it('is small when comparing black and very dark grey', () => {
  expect(colorDeltaChannels(0, 0, 0, 255, 10, 10, 10, 255)).toBeLessThan(0.02);
});

it('is medium when comparing black and medium grey', () => {
  const delta = colorDeltaChannels(0, 0, 0, 255, 127, 127, 127, 255);
  expect(delta).toBeGreaterThan(0.21);
  expect(delta).toBeLessThan(0.24);
});

it('is medium when comparing red and blue', () => {
  const delta = Math.abs(colorDeltaChannels(255, 0, 0, 255, 0, 0, 255, 255));
  expect(delta).toBeGreaterThan(0.5);
  expect(delta).toBeLessThan(0.51);
});

it('is one when comparing filler pixel and white', () => {
  expect(colorDeltaChannels(1, 1, 1, 1, 255, 255, 255, 255)).toEqual(1);
});

it('is large when comparing transparent and black', () => {
  expect(
    Math.abs(colorDeltaChannels(0, 0, 0, 0, 0, 0, 0, 255)),
  ).toBeGreaterThan(0.92);
});

it('is large when comparing white and filler pixel', () => {
  expect(colorDeltaChannels(255, 255, 255, 255, 1, 1, 1, 1)).toBeGreaterThan(
    0.92,
  );
});

it('is one when comparing filler pixel and some other color', () => {
  expect(colorDeltaChannels(1, 1, 1, 1, 33, 33, 33, 10)).toEqual(1);
});

it('is small when comparing transparent and similar color', () => {
  expect(colorDeltaChannels(1, 46, 250, 0, 1, 42, 250, 4)).toBeLessThan(0.05);
});

it('is negative when comparing white and black', () => {
  expect(colorDeltaChannels(255, 255, 255, 255, 0, 0, 0, 255)).toBeLessThan(0);
});

it('is positive when comparing black and white', () => {
  expect(colorDeltaChannels(0, 0, 0, 255, 255, 255, 255, 255)).toBeGreaterThan(
    0,
  );
});
