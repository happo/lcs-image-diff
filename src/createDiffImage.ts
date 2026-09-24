import { asPixelWords, isAntialiased } from './antialiasing.ts';
import type { Rgba } from './compose.ts';
import DiffTrace from './DiffTrace.ts';
import { flatPixels } from './flatRows.ts';
import getDiffPixel, { getUncountedDiffPixel } from './getDiffPixel.ts';

const GREEN: Rgba = [106, 133, 0, 255];
const MAGENTA: Rgba = [197, 39, 114, 255];

function getDataIndex(row: number, width: number, index: number): number {
  return width * row + index;
}

export interface DiffImage {
  diff: number;
  maxDiff: number;
  trace: DiffTrace;
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Which differing pixels count as a change: the ones drawn in the change
 * colour and traced. The rest are drawn with a faint tint of it instead.
 *
 * These are happo-compare's rule, so a viewer passing the settings a
 * comparison ran with highlights the same pixels the comparison measured.
 */
export interface ChangedPixelOptions {
  /**
   * A pixel counts only if its colour delta (0 to 1, see `colorDeltaChannels`)
   * is above this. Defaults to 0, so any difference counts.
   */
  threshold?: number;
  /**
   * Leave out pixels that look like anti-aliasing in either image. See
   * `isAntialiased`. Defaults to false.
   */
  ignoreAntialiasing?: boolean;
}

export default function createDiffImage({
  image1Data,
  image2Data,
  threshold = 0,
  ignoreAntialiasing = false,
}: {
  image1Data: Uint8ClampedArray[];
  image2Data: Uint8ClampedArray[];
} & ChangedPixelOptions): DiffImage {
  // Images have the same width and height here
  const width = image1Data[0].length;
  const height = image1Data.length;

  const data = new Uint8ClampedArray(width * height);
  const trace = new DiffTrace({ width, height });
  let totalDiff = 0;
  let maxDiff = 0;

  // The anti-aliasing check looks at a pixel's neighbours on the rows above
  // and below, so it needs the images whole rather than as rows. The rows
  // `computeAndInjectDiffs` returns already share one buffer per image, so
  // this views them where they are; rows from anywhere else are copied.
  const flat = ignoreAntialiasing
    ? [flatPixels(image1Data), flatPixels(image2Data)]
    : undefined;
  const words = flat?.map(asPixelWords);
  const size = { width: width / 4, height };

  for (let row = 0; row < height; row += 1) {
    // Render image
    for (let index = 0; index < width; index += 4) {
      const r2 = image2Data[row][index];
      const g2 = image2Data[row][index + 1];
      const b2 = image2Data[row][index + 2];
      const a2 = image2Data[row][index + 3];

      let { diff, pixel } = getDiffPixel(
        image1Data[row][index],
        image1Data[row][index + 1],
        image1Data[row][index + 2],
        image1Data[row][index + 3],
        r2,
        g2,
        b2,
        a2,
      );

      // `diff` and `maxDiff` describe how far apart the images are, so every
      // differing pixel adds to them whether or not it counts as a change.
      totalDiff += diff;
      if (diff > maxDiff) {
        maxDiff = diff;
      }

      // The same rule happo-compare uses to decide a pixel changed: above the
      // threshold, and not explained by anti-aliasing in either image.
      let counted = diff > threshold;
      if (counted && flat && words) {
        const x = index / 4;
        counted =
          !isAntialiased(flat[0], x, row, size, size, words[0], words[1]) &&
          !isAntialiased(flat[1], x, row, size, size, words[1], words[0]);
      }

      if (counted) {
        let diffColor = MAGENTA;
        if (image1Data[row][3] === 0 && image1Data[row][0] === 1) {
          // Pixel is transparent in previous image, which means that a row was
          // added here.
          diffColor = GREEN;
        }

        trace.diff({ row, index, color: diffColor });
      } else if (diff > 0) {
        pixel = getUncountedDiffPixel(r2, g2, b2, a2);
      }

      const dataIndex = getDataIndex(row, width, index);
      data[dataIndex + 0] = pixel[0]; // r
      data[dataIndex + 1] = pixel[1]; // g
      data[dataIndex + 2] = pixel[2]; // b
      data[dataIndex + 3] = pixel[3]; // a
    }
  }

  return {
    diff: totalDiff / (width * height),
    maxDiff,
    trace,
    data,
    width: width / 4,
    height,
  };
}
