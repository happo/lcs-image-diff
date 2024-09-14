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

function isFillerPixel([r, g, b, a]) {
  return r === 1 && g === 1 && b === 1 && a === 1;
}

// calculate color difference according to the paper "Measuring perceived color
// difference using YIQ NTSC transmission color space in mobile applications" by
// Y. Kotsarenko and F. Ramos
//
// Modified from https://github.com/mapbox/pixelmatch
module.exports = function colorDelta(previousPixel, currentPixel) {
  // We are not using array destructuring because it is significantly slower,
  // and we are sensitive to performance here.
  let r1 = previousPixel[0];
  let g1 = previousPixel[1];
  let b1 = previousPixel[2];
  let a1 = previousPixel[3];
  let r2 = currentPixel[0];
  let g2 = currentPixel[1];
  let b2 = currentPixel[2];
  let a2 = currentPixel[3];

  if (r1 === r2 && g1 === g2 && b1 === b2 && a1 === a2) {
    return 0;
  }

  if (
    (isFillerPixel(currentPixel) && a1 > 0) ||
    (isFillerPixel(previousPixel) && a2 > 0)
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

  const y = rgb2y(r1, g1, b1) - rgb2y(r2, g2, b2);
  const i = rgb2i(r1, g1, b1) - rgb2i(r2, g2, b2);
  const q = rgb2q(r1, g1, b1) - rgb2q(r2, g2, b2);

  return (0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q) / MAX_YIQ_DIFFERENCE;
};
