import { DIFF_TRACE_PADDING } from './constants.ts';
import computeAndInjectDiffs from './computeAndInjectDiffs.ts';
import type { HashFunction, ImageInput } from './computeAndInjectDiffs.ts';
import createDiffImage from './createDiffImage.ts';
import type DiffTrace from './DiffTrace.ts';

export { DIFF_TRACE_PADDING };

export type { ColorLike, Rgba } from './compose.ts';
export type { RowKey } from './alignArrays.ts';
export type { HashFunction, ImageInput } from './computeAndInjectDiffs.ts';
export type { default as DiffTrace } from './DiffTrace.ts';

export interface ImageDiffOptions {
  hashFunction?: HashFunction;
}

export interface ImageDiffResult {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  diff: number;
  maxDiff: number;
  trace: DiffTrace;
}

export default function imageDiff(
  image1: ImageInput,
  image2: ImageInput,
  { hashFunction }: ImageDiffOptions = {},
): ImageDiffResult {
  const { image1Data, image2Data } = computeAndInjectDiffs({
    image1,
    image2,
    hashFunction,
  });

  const { data, width, height, diff, trace, maxDiff } = createDiffImage({
    image1Data,
    image2Data,
  });

  const differentDimensions =
    image1.width !== image2.width || image1.height !== image2.height;

  return {
    data,
    width,
    height,
    diff,
    trace,
    maxDiff: differentDimensions ? 1 : maxDiff,
  };
}

/**
 * @deprecated Import `DIFF_TRACE_PADDING` instead:
 * `import { DIFF_TRACE_PADDING } from 'lcs-image-diff'`. Hanging it off the
 * function is kept for back-compat and goes away in the next major.
 */
const DEPRECATED_DIFF_TRACE_PADDING = DIFF_TRACE_PADDING;

// Documented on its own const above so the deprecation reaches the emitted
// declaration -- a comment on the assignment alone does not survive the emit.
imageDiff.DIFF_TRACE_PADDING = DEPRECATED_DIFF_TRACE_PADDING;
