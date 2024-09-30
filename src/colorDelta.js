const MAX_YIQ_DIFFERENCE = 35215;

function rgb2y(r, g, b) {
  return r * 0.29889531 + g * 0.58662247 + b * 0.11448223;
}

function rgb2i(r, g, b) {
  return r * 0.59597799 - g * 0.2741761 - b * 0.32180189;
}

function rgb2q(r, g, b) {
  return r * 0.21147017 - g * 0.52261711 + b * 0.31114694;
}

// blend semi-transparent color with white
function blend(color, alpha) {
  return 255 + (color - 255) * alpha;
}

function isFillerPixel(r, g, b, a) {
  return r === 1 && g === 1 && b === 1 && a === 1;
}

/**
 * Calculate color difference between two pixels
 *
 * The difference is calculated according to the paper "Measuring perceived
 * color difference using YIQ NTSC transmission color space in mobile
 * applications" by Y. Kotsarenko and F. Ramos.
 *
 * Modified from https://github.com/mapbox/pixelmatch
 */
function colorDeltaChannels(r1, g1, b1, a1, r2, g2, b2, a2) {
  if (r1 === r2 && g1 === g2 && b1 === b2 && a1 === a2) {
    return 0;
  }

  if (
    (isFillerPixel(r1, g1, b1, a1) && a1 > 0) ||
    (isFillerPixel(r2, g2, b2, a2) && a2 > 0)
  ) {
    return 1;
  }

  if (a1 < 255) {
    a1 /= 255;
    r1 = blend(r1, a1);
    g1 = blend(g1, a1);
    b1 = blend(b1, a1);
  }

  if (a2 < 255) {
    a2 /= 255;
    r2 = blend(r2, a2);
    g2 = blend(g2, a2);
    b2 = blend(b2, a2);
  }

  const y1 = rgb2y(r1, g1, b1);
  const y2 = rgb2y(r2, g2, b2);
  const y = y1 - y2;
  const i = rgb2i(r1, g1, b1) - rgb2i(r2, g2, b2);
  const q = rgb2q(r1, g1, b1) - rgb2q(r2, g2, b2);

  const delta =
    (0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q) / MAX_YIQ_DIFFERENCE;

  // encode whether the pixel lightens or darkens in the sign
  return y1 > y2 ? -delta : delta;
}

/**
 * Calculate color difference between two pixels
 *
 * The difference is calculated according to the paper "Measuring perceived
 * color difference using YIQ NTSC transmission color space in mobile
 * applications" by Y. Kotsarenko and F. Ramos.
 *
 * Modified from https://github.com/mapbox/pixelmatch
 *
 * @deprecated use `colorDeltaChannels` instead
 */
function colorDelta(previousPixel, currentPixel) {
  return colorDeltaChannels(
    previousPixel[0],
    previousPixel[1],
    previousPixel[2],
    previousPixel[3],
    currentPixel[0],
    currentPixel[1],
    currentPixel[2],
    currentPixel[3],
  );
}

module.exports = colorDelta;
module.exports.colorDeltaChannels = colorDeltaChannels;
