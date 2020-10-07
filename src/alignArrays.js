const CryptoJS = require('crypto-js');

const MOVEMENT = {
  none: 0,
  upLeft: 1,
  up: 2,
  left: 3,
};

const PLACEHOLDER = '+';
const MIN_DRIFT_RANGE = 200;

/**
 * Creates a 2d matrix of a certain size.
 *
 * @param {number} height
 * @param {number} width
 * @return {Array<Array>}
 */
function initMatrix(height, width) {
  const rows = new Array(height);
  for (let i = 0; i < rows.length; i += 1) {
    rows[i] = new Int32Array(width);
  }
  return rows;
}

/**
 * Compute a solution matrix to find the longest common subsequence between two
 * arrays. Adapted from
 * http://algorithms.tutorialhorizon.com/dynamic-programming-longest-common-subsequence/
 *
 * @param {Array} a
 * @param {Array} b
 * @return {Array<Array>} a matrix containing MOVEMENT markers
 */
function longestCommonSubsequence(a, b) {
  const aLength = a.length;
  const bLength = b.length;
  const memo = initMatrix(aLength + 1, bLength + 1);
  const solution = initMatrix(aLength + 1, bLength + 1);

  const usedDriftRange = Math.abs(
    Math.max(Math.max(aLength, bLength) / 10, MIN_DRIFT_RANGE),
  );

  // Loop and find the solution
  for (let i = 1; i <= aLength; i += 1) {
    for (
      let j = Math.max(1, i - usedDriftRange / 2);
      j <= Math.min(bLength, i + usedDriftRange / 2);
      j += 1
    ) {
      if (a[i - 1] === b[j - 1]) {
        // upLeft
        memo[i][j] = memo[i - 1][j - 1] + 1;
        solution[i][j] = MOVEMENT.upLeft;
      } else {
        memo[i][j] = Math.max(memo[i - 1][j], memo[i][j - 1]);
        if (memo[i][j] === memo[i - 1][j]) {
          solution[i][j] = MOVEMENT.up;
        } else {
          solution[i][j] = MOVEMENT.left;
        }
      }
    }
  }
  return solution;
}

/**
 * Constructs an array of placeholder strings, e.g.
 * ['x', 'x', 'x'].
 *
 * @param {number} count
 * @return Array<String>
 */
function placeholders(count) {
  return new Array(count).fill(PLACEHOLDER);
}

/**
 * Apply an lcs solution to arrays. Note that this will MUTATE the arrays,
 * injecting "+" where gaps are needed.
 *
 * @param {Array<Array>} solution as computed by `longestCommonSubsequence`
 * @param {Array} a
 * @param {Array} b
 */
function applySolution(solution, a, b) {
  // Start at the bottom right end of the solution
  let ai = a.length;
  let bi = b.length;
  let changes = 0;

  let movement = solution[ai][bi];
  while (movement) {
    if (movement === MOVEMENT.upLeft) {
      if (changes < 0) {
        b.splice(bi, 0, ...placeholders(Math.abs(changes)));
      } else if (changes > 0) {
        a.splice(ai, 0, ...placeholders(changes));
      }
      ai -= 1;
      bi -= 1;
      changes = 0;
    } else if (movement === MOVEMENT.left) {
      bi -= 1;
      changes += 1;
    } else if (movement === MOVEMENT.up) {
      ai -= 1;
      changes -= 1;
    }
    movement = solution[ai][bi];
  }

  // Pad the shorter array
  const aLength = a.length;
  const bLength = b.length;
  const shorterArray = aLength > bLength ? b : a;
  shorterArray.splice(0, 0, ...placeholders(Math.abs(aLength - bLength)));
}

function computeCacheKey(a, b) {
  const md5 = CryptoJS.algo.MD5.create();
  for (let i = 0; i < a.length; i++) {
    md5.update(a[i]);
  }
  for (let j = 0; j < b.length; j++) {
    md5.update(b[j]);
  }
  return `lcs-diff-${md5.finalize().toString()}`;
}

function getFromCache(key) {
  if (!window) {
    return;
  }
  const cached = window.localStorage.getItem(key);
  if (cached) {
    return JSON.parse(cached);
  }
}

function putInCache(key, solution) {
  if (!window) {
    return;
  }
  window.localStorage.setItem(
    key,
    JSON.stringify(solution, (_, val) => {
      if (val instanceof Int32Array) {
        const obj = {};
        val.forEach((move, i) => {
          if (move !== MOVEMENT.none) {
            obj[i] = move;
          }
        });
        return obj;
      }
      return val;
    }),
  );
}

/**
 * Computes the longest common subsequence of two arrays, then uses that
 * solution to inject gaps into the arrays, making them align on common
 * subsequences.
 *
 * @param {Array} a
 * @param {Array} b
 */
function alignArrays(a, b) {
  const cacheKey = computeCacheKey(a, b);
  let lcsSolution = getFromCache(cacheKey);
  if (!lcsSolution) {
    lcsSolution = longestCommonSubsequence(a, b);
    putInCache(cacheKey, lcsSolution);
  }
  applySolution(lcsSolution, a, b);
}

alignArrays.PLACEHOLDER = PLACEHOLDER;

module.exports = alignArrays;
