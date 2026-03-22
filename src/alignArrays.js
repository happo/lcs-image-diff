const PLACEHOLDER = '+';
const MIN_DRIFT_RANGE = 200;

// Movement direction constants stored in the solution band
const NONE = 0;
const UP_LEFT = 1;
const UP = 2;
const LEFT = 3;

/**
 * Constructs an array of placeholder strings, e.g.
 * ['+', '+', '+'].
 *
 * @param {number} count
 * @return Array<String>
 */
function placeholders(count) {
  return new Array(count).fill(PLACEHOLDER);
}

/**
 * Computes the longest common subsequence of two arrays, then uses that
 * solution to inject gaps into the arrays, making them align on common
 * subsequences.
 *
 * Uses band-limited flat typed arrays instead of an array-of-arrays for the
 * DP tables. For tall images (e.g. 5000 rows, driftRange ~500) this reduces
 * the working set from ~250 MB to ~16 MB, which fits in L3 cache and gives a
 * large throughput improvement.
 *
 * Band layout for row i:
 *   columns run from max(0, i - halfDrift - 1) to min(bLength, i + halfDrift)
 *   The extra -1 gives one padding column so j-1 accesses never underflow.
 *   bandWidth = usedDriftRange + 4  (covers the range above with room to spare)
 *   colOff(i) = max(0, i - halfDrift - 1)
 *   index(i, j) = i * bandWidth + j - colOff(i)
 *
 * @param {Array} a
 * @param {Array} b
 */
function alignArrays(a, b) {
  const aLength = a.length;
  const bLength = b.length;

  const usedDriftRange =
    Math.max(Math.max(aLength, bLength) / 10, MIN_DRIFT_RANGE) | 0;
  const halfDrift = (usedDriftRange + 1) >> 1;
  // +4: 1 left-padding column (EXTRA=1) + 1 right-padding + 2 safety margin
  const bandWidth = usedDriftRange + 4;

  // Flat typed arrays: single contiguous allocation, sequential access
  // pattern, fits in cache for typical image sizes.
  // memo values never exceed min(aLength, bLength) which is well under 2^31.
  // solution values are 0-3, so Uint8Array suffices.
  const memo = new Int32Array((aLength + 1) * bandWidth);
  const solution = new Uint8Array((aLength + 1) * bandWidth);

  for (let i = 1; i <= aLength; i++) {
    const jMin = Math.max(1, i - halfDrift);
    const jMax = Math.min(bLength, i + halfDrift);
    const iOff = i * bandWidth;
    const iPrevOff = (i - 1) * bandWidth;
    // colOff(i) and colOff(i-1): column offsets so band indices stay >= 0
    const colOff = Math.max(0, i - halfDrift - 1);
    const prevColOff = Math.max(0, i - halfDrift - 2);

    for (let j = jMin; j <= jMax; j++) {
      if (a[i - 1] === b[j - 1]) {
        memo[iOff + j - colOff] = memo[iPrevOff + j - 1 - prevColOff] + 1;
        solution[iOff + j - colOff] = UP_LEFT;
      } else {
        const fromUp = memo[iPrevOff + j - prevColOff];
        const fromLeft = memo[iOff + j - 1 - colOff];
        if (fromUp >= fromLeft) {
          memo[iOff + j - colOff] = fromUp;
          solution[iOff + j - colOff] = UP;
        } else {
          memo[iOff + j - colOff] = fromLeft;
          solution[iOff + j - colOff] = LEFT;
        }
      }
    }
  }

  // Backtrack through the solution band to inject PLACEHOLDER gaps.
  // Out-of-band reads must return NONE (0), matching the original full-matrix
  // behaviour where unwritten cells default to zero.
  function getMovement(i, j) {
    const co = Math.max(0, i - halfDrift - 1);
    const bandIdx = j - co;
    if (bandIdx < 0 || bandIdx >= bandWidth) return NONE;
    return solution[i * bandWidth + bandIdx];
  }

  let ai = aLength;
  let bi = bLength;
  let changes = 0;

  let movement = getMovement(ai, bi);
  while (movement !== NONE) {
    if (movement === UP_LEFT) {
      if (changes < 0) {
        b.splice(bi, 0, ...placeholders(-changes));
      } else if (changes > 0) {
        a.splice(ai, 0, ...placeholders(changes));
      }
      ai -= 1;
      bi -= 1;
      changes = 0;
    } else if (movement === LEFT) {
      bi -= 1;
      changes += 1;
    } else {
      // UP
      ai -= 1;
      changes -= 1;
    }
    movement = getMovement(ai, bi);
  }

  // Pad the shorter array so both have the same length.
  const aLen = a.length;
  const bLen = b.length;
  if (aLen !== bLen) {
    const shorterArray = aLen > bLen ? b : a;
    const diff = Math.abs(aLen - bLen);
    if (a[0] === b[0]) {
      shorterArray.splice(shorterArray.length - 1, 0, ...placeholders(diff));
    } else {
      shorterArray.splice(0, 0, ...placeholders(diff));
    }
  }
}

alignArrays.PLACEHOLDER = PLACEHOLDER;

export default alignArrays;
