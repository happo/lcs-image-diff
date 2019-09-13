const compose = require('./compose');
const euclideanDistance = require('./euclideanDistance');

const TRANSPARENT = [0, 0, 0, 0];

module.exports = function getDiffPixel(previousPixel, currentPixel) {
  // Compute a score that represents the difference between 2 pixels
  //
  // This method simply takes the Euclidean distance between the RGBA channels
  // of 2 colors over the maximum possible Euclidean distance. This gives us a
  // percentage of how different the two colors are.
  //
  // Although it would be more perceptually accurate to calculate a proper
  // Delta E in Lab colorspace, we probably don't need perceptual accuracy for
  // this application, and it is nice to avoid the overhead of converting RGBA
  // to Lab.
  const diff = euclideanDistance(previousPixel, currentPixel);
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
