const { DIFF_TRACE_PADDING } = require('./constants');
const computeAndInjectDiffs = require('./computeAndInjectDiffs');
const createDiffImage = require('./createDiffImage');

function imageDiff(image1, image2, { hashFunction } = {}) {
  const { image1Data, image2Data } = computeAndInjectDiffs({
    image1,
    image2,
    hashFunction,
  });

  const { data, width, height, diff, trace } = createDiffImage({
    image1Data,
    image2Data,
  });
  return { data, width, height, diff, trace };
}

imageDiff.DIFF_TRACE_PADDING = DIFF_TRACE_PADDING;

module.exports = imageDiff;
