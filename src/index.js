import { DIFF_TRACE_PADDING } from './constants.js';
import computeAndInjectDiffs from './computeAndInjectDiffs.js';
import createDiffImage from './createDiffImage.js';

function imageDiff(image1, image2, { hashFunction } = {}) {
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
