import { DIFF_TRACE_PADDING } from './constants.js';
import computeAndInjectDiffs from './computeAndInjectDiffs.js';
import type { HashFunction, ImageInput } from './computeAndInjectDiffs.js';
import createDiffImage from './createDiffImage.js';
import type DiffTrace from './DiffTrace.js';

export type { ColorLike, Rgba } from './compose.js';
export type { RowKey } from './alignArrays.js';
export type { HashFunction, ImageInput } from './computeAndInjectDiffs.js';
export type { default as DiffTrace } from './DiffTrace.js';

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

function imageDiff(
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

imageDiff.DIFF_TRACE_PADDING = DIFF_TRACE_PADDING;

export default imageDiff;
