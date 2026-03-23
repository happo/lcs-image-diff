import alignArrays from './alignArrays.js';
import compose from './compose.js';
import similarEnough from './similarEnough.js';

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

// Maximum number of times a row may appear in each image and still be used
// as an LCS anchor. Rows appearing more than this many times are treated as
// non-unique and never matched across images. Keeping this small (but > 1)
// lets repeated-but-not-ubiquitous rows (e.g. identical list items) serve as
// alignment anchors, while excluding truly ubiquitous rows (e.g. hundreds of
// identical white rows in a blank image) that would cause spurious matches.
const MAX_ROW_OCCURRENCES = 20;

// Match runs shorter than this are considered "small islands" and may be
// absorbed into surrounding change blocks during the second pass.
const MIN_LONG_MATCH = 3;

// When both immediate change-segment neighbours of a match island are at most
// this many rows, the island is very likely sitting in the middle of a
// scattered-change region (e.g. "C1 M22 C1 M22 C1").  In that case we use a
// much more aggressive absorption limit (SMALL_NEIGHBOR_MATCH) so that the
// larger match blocks in between also get absorbed and the scattered single-
// line placeholder groups collapse into one tidy change block.
const SMALL_NEIGHBOR_SIZE = 2;
const SMALL_NEIGHBOR_MATCH = 30;

/**
 * Second pass over the aligned arrays: absorbs small match islands (runs of
 * fewer than MIN_LONG_MATCH matching rows that are flanked on both sides by
 * change segments) into the surrounding change blocks, then compacts each
 * combined change block so all image1 rows (deletions) come first and all
 * image2 rows (additions) come last.  This eliminates scattered single-line
 * or few-line placeholder rows that make the visual diff noisy.
 */
function compactChangeRegions(
  unique1,
  unique2,
  image1Data,
  image2Data,
  image1Bg,
  image2Bg,
  maxWidth,
) {
  const n = unique1.length;
  const PLACEHOLDER = alignArrays.PLACEHOLDER;

  // Build alternating match/change segment list.
  const segs = [];
  let i = 0;
  while (i < n) {
    const isMatch =
      unique1[i] !== PLACEHOLDER && unique2[i] !== PLACEHOLDER;
    let j = i + 1;
    while (
      j < n &&
      (unique1[j] !== PLACEHOLDER && unique2[j] !== PLACEHOLDER) === isMatch
    ) {
      j++;
    }
    segs.push({ isMatch, start: i, end: j });
    i = j;
  }

  // Merge pass: absorb small flanked match islands into surrounding change
  // segments, then coalesce adjacent change segments.
  //
  // The absorption threshold depends on the *original* sizes of the two
  // neighbouring change segments (read directly from `segs`, which is never
  // mutated, so we always see the original sizes even after cascading merges):
  //   • If both neighbours are ≤ SMALL_NEIGHBOR_SIZE rows we use the more
  //     aggressive SMALL_NEIGHBOR_MATCH limit so that patterns like
  //     "C1 M22 C1 M22 C1" are compacted into a single change block.
  //   • Otherwise we use the conservative MIN_LONG_MATCH limit.
  const blocks = [];
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s];
    const prev = blocks[blocks.length - 1];
    if (!seg.isMatch && prev && !prev.isMatch) {
      // Adjacent change segments — extend the previous one.
      prev.end = seg.end;
    } else if (
      seg.isMatch &&
      prev &&
      !prev.isMatch &&
      s + 1 < segs.length &&
      !segs[s + 1].isMatch
    ) {
      // Match island flanked by change segments on both sides.
      // Decide threshold based on original neighbour sizes.
      const leftLen = segs[s - 1].end - segs[s - 1].start;
      const rightLen = segs[s + 1].end - segs[s + 1].start;
      const threshold =
        leftLen <= SMALL_NEIGHBOR_SIZE && rightLen <= SMALL_NEIGHBOR_SIZE
          ? SMALL_NEIGHBOR_MATCH
          : MIN_LONG_MATCH;
      if (seg.end - seg.start < threshold) {
        prev.end = seg.end;
      } else {
        blocks.push({ isMatch: true, start: seg.start, end: seg.end });
      }
    } else {
      blocks.push({ isMatch: seg.isMatch, start: seg.start, end: seg.end });
    }
  }

  const img1Ph = transparentLine(image1Bg, maxWidth);
  const img2Ph = transparentLine(image2Bg, maxWidth);

  // Process change blocks from right to left so earlier indices stay valid
  // after each splice.
  for (let b = blocks.length - 1; b >= 0; b--) {
    const block = blocks[b];
    if (block.isMatch) continue;

    const { start, end } = block;

    // Only compact blocks that contain absorbed match islands (both sides
    // non-placeholder at the same position).
    let hasIsland = false;
    for (let i = start; i < end; i++) {
      if (unique1[i] !== PLACEHOLDER && unique2[i] !== PLACEHOLDER) {
        hasIsland = true;
        break;
      }
    }
    if (!hasIsland) continue;

    // Collect non-placeholder rows from each side.
    const aU = [],
      aImg = [],
      bU = [],
      bImg = [];
    for (let i = start; i < end; i++) {
      if (unique1[i] !== PLACEHOLDER) {
        aU.push(unique1[i]);
        aImg.push(image1Data[i]);
      }
      if (unique2[i] !== PLACEHOLDER) {
        bU.push(unique2[i]);
        bImg.push(image2Data[i]);
      }
    }

    // Rebuild: image1 rows (DEL, with placeholder in image2) then image2
    // rows (ADD, with placeholder in image1).
    const newU1 = [],
      newU2 = [],
      newImg1 = [],
      newImg2 = [];
    for (let j = 0; j < aU.length; j++) {
      newU1.push(aU[j]);
      newU2.push(PLACEHOLDER);
      newImg1.push(aImg[j]);
      newImg2.push(img2Ph);
    }
    for (let j = 0; j < bU.length; j++) {
      newU1.push(PLACEHOLDER);
      newU2.push(bU[j]);
      newImg1.push(img1Ph);
      newImg2.push(bImg[j]);
    }

    unique1.splice(start, end - start, ...newU1);
    unique2.splice(start, end - start, ...newU2);
    image1Data.splice(start, end - start, ...newImg1);
    image2Data.splice(start, end - start, ...newImg2);
  }
}

function toUniqueHashes(hashes1, hashes2) {
  const counts1 = new Map();
  const counts2 = new Map();
  for (const h of hashes1) counts1.set(h, (counts1.get(h) || 0) + 1);
  for (const h of hashes2) counts2.set(h, (counts2.get(h) || 0) + 1);
  const unique1 = hashes1.map((h, i) => {
    const c1 = counts1.get(h);
    const c2 = counts2.get(h);
    return c1 <= MAX_ROW_OCCURRENCES && c2 && c2 <= MAX_ROW_OCCURRENCES
      ? h
      : `\0a${i}`;
  });
  const unique2 = hashes2.map((h, i) => {
    const c1 = counts1.get(h);
    const c2 = counts2.get(h);
    return c2 <= MAX_ROW_OCCURRENCES && c1 && c1 <= MAX_ROW_OCCURRENCES
      ? h
      : `\0b${i}`;
  });
  return [unique1, unique2];
}

function align({ image1Data, image2Data, maxWidth, hashFunction }) {
  if (similarEnough({ image1Data, image2Data })) {
    return;
  }

  const hashedImage1Data = image1Data.map(hashFunction);
  const hashedImage2Data = image2Data.map(hashFunction);

  const [unique1, unique2] = toUniqueHashes(hashedImage1Data, hashedImage2Data);
  alignArrays(unique1, unique2);

  const image1Bg = image1Data[0].slice(0, 4);
  unique1.forEach((hashedLine, i) => {
    if (hashedLine === alignArrays.PLACEHOLDER) {
      image1Data.splice(i, 0, transparentLine(image1Bg, maxWidth));
    }
  });

  const image2Bg = image2Data[0].slice(0, 4);
  unique2.forEach((hashedLine, i) => {
    if (hashedLine === alignArrays.PLACEHOLDER) {
      image2Data.splice(i, 0, transparentLine(image2Bg, maxWidth));
    }
  });

  // Second pass: compact scattered small match islands to reduce noise.
  compactChangeRegions(
    unique1,
    unique2,
    image1Data,
    image2Data,
    image1Bg,
    image2Bg,
    maxWidth,
  );
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
export default function computeAndInjectDiffs({
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
}
