import { beforeEach, describe, expect, it } from '@jest/globals';

import similarEnough from '../similarEnough.ts';

let subject: () => boolean;
let image1Data: number[][];
let image2Data: number[][];

const BLACK = [0, 0, 0, 255];
const WHITE = [255, 255, 255, 255];

beforeEach(() => {
  image1Data = [];
  image2Data = [];
  subject = () => similarEnough({ image1Data, image2Data });
});

describe('when images are empty', () => {
  it('returns true', () => {
    expect(subject()).toBe(true);
  });
});

describe('when image1 is empty but image2 is not', () => {
  beforeEach(() => {
    image2Data = [[...BLACK, ...WHITE]];
  });

  it('returns false', () => {
    expect(subject()).toBe(false);
  });
});

describe('when 50% of rows are different', () => {
  beforeEach(() => {
    image1Data = [
      [...BLACK, ...WHITE],
      [...BLACK, ...WHITE],
      [...WHITE, ...BLACK],
      [...WHITE, ...BLACK],
    ];
    image2Data = [
      [...BLACK, ...WHITE],
      [...BLACK, ...WHITE],
      [...BLACK, ...WHITE],
      [...BLACK, ...WHITE],
    ];
  });

  it('returns false', () => {
    expect(subject()).toBe(false);
  });
});

describe('when only one row is different', () => {
  beforeEach(() => {
    image1Data = [
      [...BLACK, ...WHITE],
      [...BLACK, ...WHITE],
      [...WHITE, ...BLACK],
      [...BLACK, ...WHITE],
    ];
    image2Data = [
      [...BLACK, ...WHITE],
      [...BLACK, ...WHITE],
      [...BLACK, ...WHITE],
      [...BLACK, ...WHITE],
    ];
  });

  it('returns true', () => {
    expect(subject()).toBe(true);
  });
});

describe('when images are of different height', () => {
  beforeEach(() => {
    image1Data = [
      [...BLACK, ...WHITE],
      [...BLACK, ...WHITE],
      [...BLACK, ...WHITE],
      [...BLACK, ...WHITE],
      [...BLACK, ...WHITE],
    ];
    image2Data = [
      [...BLACK, ...WHITE],
      [...BLACK, ...WHITE],
      [...BLACK, ...WHITE],
      [...BLACK, ...WHITE],
    ];
  });

  it('returns false', () => {
    expect(subject()).toBe(false);
  });
});
