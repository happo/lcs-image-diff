const alignArrays = require('./alignArrays');
const compose = require('./compose');
const similarEnough = require('./similarEnough');

// Number of pixel rows grouped into a single alignment band. Larger values
// make the LCS faster and absorb small vertical shifts, at the cost of
// inserting filler in coarser increments.
const BAND_SIZE = 4;

// Horizontal subsampling factor when computing band hashes. Every H_SCALE
// pixels are averaged into one, shrinking the hash and smoothing over minor
// horizontal variations (anti-aliasing, sub-pixel shifts).
const H_SCALE = 8;

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
    for (let location = rowSize; location < rowSize + (paddingRight * 4); location += 1) {
      pixelsInRow[location] = 1;
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

/**
 * Produce a single hash representing a band of pixel rows. The band is
 * compressed in two dimensions before hashing:
 *
 *  - Vertically: all rows in the band are averaged channel-by-channel so that
 *    small vertical shifts (up to ~BAND_SIZE/2 rows) produce identical hashes.
 *  - Horizontally: neighbouring pixels are averaged in groups of H_SCALE so
 *    that minor horizontal shifts and anti-aliasing differences are absorbed
 *    and the resulting byte array fed to hashFunction is much smaller.
 *
 * @param {Uint8ClampedArray[]} rows  One or more rows from imageTo2DArray.
 * @param {Function} hashFn  The hash function to apply to the compressed row.
 * @return {string}
 */
function createScaledBandHash(rows, hashFn) {
  const byteWidth = rows[0].length;
  const pixelWidth = byteWidth >> 2; // divide by 4 (RGBA)
  const scaledWidth = Math.max(1, Math.ceil(pixelWidth / H_SCALE));

  const result = new Uint8ClampedArray(scaledWidth << 2); // * 4

  for (let px = 0; px < scaledWidth; px++) {
    let r = 0, g = 0, b = 0, a = 0, count = 0;
    const srcPxEnd = Math.min(pixelWidth, (px + 1) * H_SCALE);
    for (let srcPx = px * H_SCALE; srcPx < srcPxEnd; srcPx++) {
      const byteIdx = srcPx << 2;
      for (let ri = 0; ri < rows.length; ri++) {
        r += rows[ri][byteIdx];
        g += rows[ri][byteIdx + 1];
        b += rows[ri][byteIdx + 2];
        a += rows[ri][byteIdx + 3];
        count++;
      }
    }
    const base = px << 2;
    result[base]     = (r / count + 0.5) | 0;
    result[base + 1] = (g / count + 0.5) | 0;
    result[base + 2] = (b / count + 0.5) | 0;
    result[base + 3] = (a / count + 0.5) | 0;
  }

  return hashFn(result);
}

function align({ image1Data, image2Data, maxWidth, hashFunction }) {
  if (similarEnough({ image1Data, image2Data })) {
    return;
  }

  // Build one hash per row using a rolling BAND_SIZE-row window. Each hash
  // averages the current row with the next BAND_SIZE-1 rows, which smooths
  // over small vertical shifts and anti-aliasing differences while keeping
  // single-row alignment precision. (The non-overlapping band approach
  // introduced fragmented gaps when the shift wasn't a multiple of BAND_SIZE.)
  function buildRowHashes(imageData) {
    return imageData.map((_, i) =>
      createScaledBandHash(
        imageData.slice(i, Math.min(i + BAND_SIZE, imageData.length)),
        hashFunction,
      ),
    );
  }

  const hashes1 = buildRowHashes(image1Data);
  const hashes2 = buildRowHashes(image2Data);

  alignArrays(hashes1, hashes2);

  // Inject a single transparent filler row wherever the LCS placed a
  // placeholder — identical to the original approach.
  const image1Bg = image1Data[0].slice(0, 4);
  hashes1.forEach((hash, i) => {
    if (hash === alignArrays.PLACEHOLDER) {
      image1Data.splice(i, 0, transparentLine(image1Bg, maxWidth));
    }
  });

  const image2Bg = image2Data[0].slice(0, 4);
  hashes2.forEach((hash, i) => {
    if (hash === alignArrays.PLACEHOLDER) {
      image2Data.splice(i, 0, transparentLine(image2Bg, maxWidth));
    }
  });

  // After injection, image1Data[i] ↔ hashes1[i] and image2Data[i] ↔ hashes2[i].
  // Scattered "thin stripe" diffs occur when isolated type-1 positions (before
  // has a filler row, after has real content) sit close to isolated type-2
  // positions (before has real content, after has a filler row).  Rather than
  // rendering two separate single-pixel-tall diff stripes that are visually
  // distracting and hard to interpret, cancel nearby opposite pairs: remove
  // both the filler and its partner real row from each side so the region is
  // simply omitted from the final comparison.
  const P = alignArrays.PLACEHOLDER;
  // How many rows apart two opposite-side fillers can be and still be paired.
  const CONSOLIDATION_WINDOW = 50;
  const toDelete = new Set();

  for (let i = 0; i < hashes1.length; i++) {
    if (toDelete.has(i)) continue;
    const isType1 = hashes1[i] === P && hashes2[i] !== P;
    const isType2 = hashes2[i] === P && hashes1[i] !== P;
    if (!isType1 && !isType2) continue;

    // Search forward for the nearest opposite-type position within the window.
    for (let j = i + 1; j < Math.min(hashes1.length, i + CONSOLIDATION_WINDOW + 1); j++) {
      if (toDelete.has(j)) continue;
      const jIsType1 = hashes1[j] === P && hashes2[j] !== P;
      const jIsType2 = hashes2[j] === P && hashes1[j] !== P;
      if ((isType1 && jIsType2) || (isType2 && jIsType1)) {
        toDelete.add(i);
        toDelete.add(j);
        break;
      }
    }
  }

  // Remove paired positions in reverse order so earlier indices stay valid.
  Array.from(toDelete)
    .sort((a, b) => b - a)
    .forEach(idx => {
      image1Data.splice(idx, 1);
      image2Data.splice(idx, 1);
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
