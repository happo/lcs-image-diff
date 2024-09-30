const compose = require("./compose");
const { colorDeltaChannels } = require("./colorDelta");

const TRANSPARENT = [0, 0, 0, 0];

module.exports = function getDiffPixel(r1, g1, b1, a1, r2, g2, b2, a2) {
  // Compute a score that represents the difference between 2 pixels
  const diff = Math.abs(colorDeltaChannels(r1, g1, b1, a1, r2, g2, b2, a2));
  if (diff === 0) {
    if (a2 === 0) {
      return {
        diff,
        pixel: TRANSPARENT,
      };
    }
    return {
      diff,
      pixel: compose([r2, g2, b2, 140], TRANSPARENT),
    };
  }

  return {
    diff,
    pixel: compose([179, 54, 130, 255 * Math.max(0.2, diff)], TRANSPARENT),
  };
};
