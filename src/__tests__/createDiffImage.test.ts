import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

import { beforeEach, describe, expect, it } from '@jest/globals';
import sharp from 'sharp';

import computeAndInjectDiffs from '../computeAndInjectDiffs.ts';
import type { ImageInput } from '../computeAndInjectDiffs.ts';
import createDiffImage from '../createDiffImage.ts';
import type { DiffImage } from '../createDiffImage.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let image1: ImageInput;
let image2: ImageInput;
let subject: () => DiffImage;

beforeEach(async () => {
  const image1Sharp = sharp(
    path.resolve(__dirname, 'test-images/aa-ffffff.png'),
  );
  const image2Sharp = sharp(
    path.resolve(__dirname, 'test-images/aa-f7f7f7.png'),
  );

  const [image1Metadata, image2Metadata] = await Promise.all([
    image1Sharp.metadata(),
    image2Sharp.metadata(),
  ]);

  const [image1Buffer, image2Buffer] = await Promise.all([
    image1Sharp.raw().toBuffer(),
    image2Sharp.raw().toBuffer(),
  ]);

  image1 = {
    data: image1Buffer,
    width: image1Metadata.width,
    height: image1Metadata.height,
  };
  image2 = {
    data: image2Buffer,
    width: image2Metadata.width,
    height: image2Metadata.height,
  };

  subject = () =>
    createDiffImage(
      computeAndInjectDiffs({
        image1,
        image2,
      }),
    );
});

it('has a total diff value and a max diff', async () => {
  const { diff, maxDiff } = await subject();
  expect(diff).toEqual(0.000008817411988770792);
  expect(maxDiff).toEqual(0.0009424140621439462);
});

describe('when images are of different width', () => {
  beforeEach(async () => {
    const image1Sharp = sharp(
      path.resolve(__dirname, 'test-images/alert-before.png'),
    );
    const image2Sharp = sharp(
      path.resolve(__dirname, 'test-images/alert-after.png'),
    );

    const [image1Metadata, image2Metadata] = await Promise.all([
      image1Sharp.metadata(),
      image2Sharp.metadata(),
    ]);

    const [image1Buffer, image2Buffer] = await Promise.all([
      image1Sharp.raw().toBuffer(),
      image2Sharp.raw().toBuffer(),
    ]);

    image1 = {
      data: image1Buffer,
      width: image1Metadata.width,
      height: image1Metadata.height,
    };
    image2 = {
      data: image2Buffer,
      width: image2Metadata.width,
      height: image2Metadata.height,
    };
  });

  it('has a total diff and a max diff', async () => {
    const { diff, maxDiff } = await subject();
    expect(diff).toEqual(0.20997431506849315);
    expect(maxDiff).toEqual(1);
  });
});

describe('when images are of different height', () => {
  beforeEach(async () => {
    const image1Sharp = sharp(
      path.resolve(__dirname, 'test-images/button-before.png'),
    );
    const image2Sharp = sharp(
      path.resolve(__dirname, 'test-images/button-after.png'),
    );

    const [image1Metadata, image2Metadata] = await Promise.all([
      image1Sharp.metadata(),
      image2Sharp.metadata(),
    ]);

    const [image1Buffer, image2Buffer] = await Promise.all([
      image1Sharp.raw().toBuffer(),
      image2Sharp.raw().toBuffer(),
    ]);

    image1 = {
      data: image1Buffer,
      width: image1Metadata.width,
      height: image1Metadata.height,
    };
    image2 = {
      data: image2Buffer,
      width: image2Metadata.width,
      height: image2Metadata.height,
    };
  });

  it('has a total diff and a max diff', async () => {
    const { diff, maxDiff } = await subject();
    expect(diff).toBeTruthy();
    expect(maxDiff).toBeTruthy();
  });
});

describe('deciding which pixels count as changed', () => {
  type Pixel = [number, number, number, number];

  const BLACK: Pixel = [0, 0, 0, 255];
  const GREY: Pixel = [128, 128, 128, 255];
  const DARKER_GREY: Pixel = [110, 110, 110, 255];
  const WHITE: Pixel = [255, 255, 255, 255];
  const OFF_WHITE: Pixel = [250, 250, 250, 255];

  function rows(pixels: Pixel[][]): Uint8ClampedArray[] {
    return pixels.map(row => new Uint8ClampedArray(row.flat()));
  }

  function solid(pixel: Pixel): Pixel[][] {
    return Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => pixel));
  }

  // A black-to-white edge whose grey ramp column darkens between the images:
  // what a rasterizer does to the same edge from one run to the next.
  function edge(ramp: Pixel): Pixel[][] {
    return Array.from({ length: 5 }, () => [BLACK, BLACK, ramp, WHITE, WHITE]);
  }

  function tracedPixels(result: DiffImage): number {
    let count = 0;
    for (let i = 3; i < result.trace.data.length; i += 4) {
      if (result.trace.data[i] > 0) {
        count += 1;
      }
    }
    return count;
  }

  function pixelAt(result: DiffImage, x: number, y: number): number[] {
    const i = (y * result.width + x) * 4;
    return Array.from(result.data.subarray(i, i + 4));
  }

  it('counts every differing pixel by default', () => {
    const result = createDiffImage({
      image1Data: rows(solid(WHITE)),
      image2Data: rows(solid(OFF_WHITE)),
    });
    expect(tracedPixels(result)).toBeGreaterThan(0);
    expect(pixelAt(result, 2, 2)).toEqual([179, 54, 130, 51]);
  });

  describe('with a threshold', () => {
    it('leaves pixels at or below it out of the trace', () => {
      const result = createDiffImage({
        image1Data: rows(solid(WHITE)),
        image2Data: rows(solid(OFF_WHITE)),
        threshold: 0.01,
      });
      expect(tracedPixels(result)).toBe(0);
    });

    it('draws them faintly rather than as unchanged', () => {
      const unchanged = createDiffImage({
        image1Data: rows(solid(OFF_WHITE)),
        image2Data: rows(solid(OFF_WHITE)),
      });
      const belowThreshold = createDiffImage({
        image1Data: rows(solid(WHITE)),
        image2Data: rows(solid(OFF_WHITE)),
        threshold: 0.01,
      });
      const counted = createDiffImage({
        image1Data: rows(solid(WHITE)),
        image2Data: rows(solid(OFF_WHITE)),
      });

      const faint = pixelAt(belowThreshold, 2, 2);
      expect(faint).not.toEqual(pixelAt(unchanged, 2, 2));
      expect(faint).not.toEqual(pixelAt(counted, 2, 2));
      // Tinted toward magenta: more red than blue or green.
      expect(faint[0]).toBeGreaterThan(faint[1]);
    });

    it('still counts pixels above it', () => {
      const result = createDiffImage({
        image1Data: rows(solid(WHITE)),
        image2Data: rows(solid(BLACK)),
        threshold: 0.01,
      });
      expect(tracedPixels(result)).toBeGreaterThan(0);
    });

    it('does not change the measured diff', () => {
      const options = {
        image1Data: rows(solid(WHITE)),
        image2Data: rows(solid(OFF_WHITE)),
      };
      const without = createDiffImage(options);
      const withThreshold = createDiffImage({ ...options, threshold: 0.01 });
      expect(withThreshold.diff).toEqual(without.diff);
      expect(withThreshold.maxDiff).toEqual(without.maxDiff);
    });
  });

  describe('with ignoreAntialiasing', () => {
    it('leaves anti-aliased pixels out of the trace', () => {
      const result = createDiffImage({
        image1Data: rows(edge(GREY)),
        image2Data: rows(edge(DARKER_GREY)),
        ignoreAntialiasing: true,
      });
      expect(tracedPixels(result)).toBe(0);
      expect(pixelAt(result, 2, 2)).not.toEqual([179, 54, 130, 51]);
    });

    it('counts them without it', () => {
      const result = createDiffImage({
        image1Data: rows(edge(GREY)),
        image2Data: rows(edge(DARKER_GREY)),
      });
      expect(tracedPixels(result)).toBeGreaterThan(0);
    });

    it('still counts a change that is not anti-aliasing', () => {
      const result = createDiffImage({
        image1Data: rows(solid(WHITE)),
        image2Data: rows(solid(BLACK)),
        ignoreAntialiasing: true,
      });
      expect(tracedPixels(result)).toBeGreaterThan(0);
    });
  });
});
