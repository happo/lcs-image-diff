const compose = require('./compose');
const colorDelta = require('./colorDelta');

const TRANSPARENT = [0, 0, 0, 0];

module.exports = function getDiffPixel(previousPixel, currentPixel) {
  // Compute a score that represents the difference between 2 pixels
  const diff = colorDelta(previousPixel, currentPixel);
  if (diff === 0) {
    if (currentPixel[3] === 0) {
      return {
        diff,
        pixel: TRANSPARENT,
      };
    }
    return {
      diff,
      pixel: compose(
        [currentPixel[0], currentPixel[1], currentPixel[2], 140],
        TRANSPARENT,
      ),
    };
  }

  return {
    diff,
    pixel: compose(
      [179, 54, 130, 255 * Math.max(0.2, diff)],
      TRANSPARENT,
    ),
  };
};
