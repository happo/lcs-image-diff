import { beforeEach, describe, expect, it } from '@jest/globals';

import compose from '../compose.ts';
import type { ColorLike } from '../compose.ts';

let subject: () => ColorLike;
let foreground: number[];
let background: number[];

beforeEach(() => {
  foreground = [100, 100, 100, 100];
  background = [255, 255, 255, 255];
  subject = () =>
    compose(
      foreground,
      background,
    );
});

it('composes the colors', () => {
  expect(subject()).toEqual([194, 194, 194, 255]);
});

describe('when the foreground is opaque', () => {
  beforeEach(() => {
    foreground[3] = 255;
  });

  it('returns the foreground', () => {
    expect(subject()).toEqual(foreground);
  });
});

describe('when the background is fully transparent', () => {
  beforeEach(() => {
    background[3] = 0;
  });

  it('returns the foreground', () => {
    expect(subject()).toEqual(foreground);
  });
});
