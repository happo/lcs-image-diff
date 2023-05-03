const alignArrays = require('./alignArrays');
const compose = require('./compose');
const similarEnough = require('./similarEnough');

function imageTo2DArray({ data, width, height }, paddingRight) {
  // The imageData is a 1D array. Each element in the array corresponds to a
  // decimal value that represents one of the RGBA channels for that pixel.
  const rowSize = width * 4;

  const newData = [];
  for (let row = 0; row < height; row += 1) {
    const pixelsInRow = new Uint8ClampedArray(rowSize + paddingRight * 4);
    for (let location = 0; location < rowSize; location += 1) {
      pixelsInRow[location] = data[row * rowSize + location];
    }
    newData.push(pixelsInRow);
  }
  return newData;
}

function resolveHashFn() {
  // Safari has a bug where trying to reference `btoa` inside a web worker will
  // result in an error, so we fall back to the slower (?) `JSON.stringify`. The
  // only way to prevent this seems to be by using a try/catch. We do this in its
  // own function to prevent our align function from being de-optimized.
  //
  // https://bugs.webkit.org/show_bug.cgi?id=158576
  try {
    // Firefox, for some reason, gives us the same string when feeding typed
    // arrays to `btoa`. Here, we can detect this behavior and fall back to the
    // slower (?) but more accurate `JSON.stringify`.
    if (btoa(new Uint8ClampedArray([0])) === btoa(new Uint8ClampedArray([1]))) {
      // Firefox
      return JSON.stringify;
    }
    return btoa;
  } catch (e) {
    return JSON.stringify;
  }
}

const HASH_FN = resolveHashFn();

function transparentLine(rawBgPixel, width) {
  const bgPixel = compose([200, 200, 200, 50], rawBgPixel);
  const result = new Uint8ClampedArray(width * 4);
  for (let i = 0; i < width * 4; i += 4) {
    result[i] = bgPixel[0];
    result[i + 1] = bgPixel[1];
    result[i + 2] = bgPixel[2];
    result[i + 3] = 122;
  }
  return result;
}

function align({ image1Data, image2Data, maxWidth, hashFunction }) {
  if (similarEnough({ image1Data, image2Data })) {
    return;
  }

  const hashedImage1Data = image1Data.map(hashFunction);
  const hashedImage2Data = image2Data.map(hashFunction);

  alignArrays(hashedImage1Data, hashedImage2Data);

  const image1Bg = image1Data[0].slice(0, 4);
  hashedImage1Data.forEach((hashedLine, i) => {
    if (hashedLine === alignArrays.PLACEHOLDER) {
      image1Data.splice(i, 0, transparentLine(image1Bg, maxWidth));
    }
  });

  const image2Bg = image2Data[0].slice(0, 4);
  hashedImage2Data.forEach((hashedLine, i) => {
    if (hashedLine === alignArrays.PLACEHOLDER) {
      image2Data.splice(i, 0, transparentLine(image2Bg, maxWidth));
    }
  });
}

/**
 * Takes two 2d images, computes the diff between the two, and injects pixels to
 * both in order to:
 * a) make both images the same height
 * b) properly visualize differences
 *
 * Please note that this method MUTATES data.
 *
 * @param {Array} image1
 * @param {Array} image2
 * @return {Object}
 */
module.exports = function computeAndInjectDiffs({
  image1,
  image2,
  hashFunction = HASH_FN,
}) {
  const maxWidth = Math.max(image1.width, image2.width);

  const image1Data = imageTo2DArray(image1, maxWidth - image1.width);
  const image2Data = imageTo2DArray(image2, maxWidth - image2.width);

  align({
    image1Data,
    image2Data,
    maxWidth,
    hashFunction,
  });

  return {
    image1Data,
    image2Data,
  };
};
