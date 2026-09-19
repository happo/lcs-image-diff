export const PLACEHOLDER = '+';

/**
 * What a row is keyed by while it is being aligned. Keys are compared with
 * `===`, so an object is only ever equal to itself -- which is how rows that
 * may not anchor the alignment are marked.
 */
export type RowKey = string | number | object;

// Movement direction constants stored in the solution strip
const NONE = 0;
const UP_LEFT = 1;
const UP = 2;
const LEFT = 3;

/**
 * Constructs an array of placeholder strings, e.g.
 * ['+', '+', '+'].
 */
function placeholders(count: number): string[] {
  return new Array<string>(count).fill(PLACEHOLDER);
}

/**
 * Computes the longest common subsequence of two arrays, then uses that
 * solution to inject gaps into the arrays, making them align on common
 * subsequences.
 *
 * The DP table is band-limited: for row `i` only columns
 * `max(0, i - halfDrift - 1)` through `min(bLength, i + halfDrift)` are
 * computed, and everything outside reads as zero. The band is part of the
 * result, not just an optimization -- a cell outside it holds `NONE`, which
 * ends the backtrack.
 *
 * Neither table is held in full. `halfDrift` is half the taller image, so the
 * band spans most of the matrix, and materializing all of it costs
 * `O(aLength * bLength)`: a pair of 20,000-row screenshots wanted 1.6 GB for
 * `memo` and another 400 MB for `solution`, in one comparison, with no
 * ceiling. Instead:
 *
 * - `memo` is computed a row at a time, since the recurrence only ever reads
 *   the row above and the cell to the left. Every `stripeHeight`-th row is
 *   kept as a checkpoint.
 * - `solution` is not stored at all during the forward pass. The backtrack
 *   walks upward, so when it enters a stripe that stripe's directions are
 *   recomputed from the checkpoint below it. Each stripe is rebuilt at most
 *   once, which is one extra pass over the DP in total.
 *
 * With `stripeHeight` around `2 * sqrt(aLength)` the two together are
 * `O(sqrt(aLength) * bandWidth)` -- about 12 MB for those same 20,000-row
 * screenshots, down from 2 GB.
 *
 * The recurrence, the tie-break between `UP` and `LEFT`, and the backtrack are
 * untouched. Only where the numbers live has changed, so the alignment this
 * produces is the same one it always produced.
 *
 * Band layout for row i:
 *   columns run from max(0, i - halfDrift - 1) to min(bLength, i + halfDrift)
 *   The extra -1 gives one padding column so j-1 accesses never underflow.
 *   bandWidth = usedDriftRange + 4  (covers the range above with room to spare)
 *   colOff(i) = max(0, i - halfDrift - 1)
 *   index(i, j) = j - colOff(i)
 */
export default function alignArrays(a: RowKey[], b: RowKey[]): void {
  const aLength = a.length;
  const bLength = b.length;

  const usedDriftRange = Math.max(aLength, bLength);
  const halfDrift = (usedDriftRange + 1) >> 1;
  // +4: 1 left-padding column (EXTRA=1) + 1 right-padding + 2 safety margin
  const bandWidth = usedDriftRange + 4;

  // Rows per stripe. Checkpoints cost `aLength / stripeHeight` rows of
  // `Int32Array`, the materialized stripe costs `stripeHeight` rows of
  // `Uint8Array`, and `2 * sqrt(aLength)` is where the sum of the two is
  // smallest.
  const stripeHeight = Math.max(1, Math.ceil(2 * Math.sqrt(aLength || 1)));
  const checkpointCount = Math.floor(aLength / stripeHeight) + 1;

  // Checkpoint `c` is memo row `c * stripeHeight`. Row 0 is all zeroes, so
  // checkpoint 0 is already correct.
  const checkpoints = new Int32Array(checkpointCount * bandWidth);

  const colOffFor = (i: number): number =>
    i - halfDrift - 1 > 0 ? i - halfDrift - 1 : 0;

  /**
   * Fills `cur` with memo row `i`, reading memo row `i - 1` from `prev`, and
   * optionally records the direction taken for each cell.
   *
   * Only `[jMin, jMax]` is written. The two cells just outside it are cleared
   * because the next row reads one column past each end, and these arrays are
   * reused rather than freshly zeroed. Nothing reads further out than that.
   */
  function computeRow(
    i: number,
    prev: Int32Array,
    cur: Int32Array,
    solution: Uint8Array | null,
    solutionOffset: number,
  ): void {
    const jMin = Math.max(1, i - halfDrift);
    const jMax = Math.min(bLength, i + halfDrift);
    const colOff = colOffFor(i);
    const prevColOff = colOffFor(i - 1);

    const lowPad = jMin - 1 - colOff;
    if (lowPad >= 0) {
      cur[lowPad] = 0;
    }

    for (let j = jMin; j <= jMax; j++) {
      const at = j - colOff;

      if (a[i - 1] === b[j - 1]) {
        cur[at] = prev[j - 1 - prevColOff] + 1;
        if (solution !== null) {
          solution[solutionOffset + at] = UP_LEFT;
        }
      } else {
        const fromUp = prev[j - prevColOff];
        const fromLeft = cur[at - 1];
        if (fromUp >= fromLeft) {
          cur[at] = fromUp;
          if (solution !== null) {
            solution[solutionOffset + at] = UP;
          }
        } else {
          cur[at] = fromLeft;
          if (solution !== null) {
            solution[solutionOffset + at] = LEFT;
          }
        }
      }
    }

    const highPad = jMax + 1 - colOff;
    if (highPad < bandWidth) {
      cur[highPad] = 0;
    }
  }

  // Forward pass: every row is computed, only the checkpoints are kept.
  let prevRow = new Int32Array(bandWidth);
  let curRow = new Int32Array(bandWidth);

  for (let i = 1; i <= aLength; i++) {
    computeRow(i, prevRow, curRow, null, 0);

    if (i % stripeHeight === 0) {
      checkpoints.set(curRow, (i / stripeHeight) * bandWidth);
    }

    const swap = prevRow;
    prevRow = curRow;
    curRow = swap;
  }

  // The directions for one stripe, rebuilt on demand. Cleared on every rebuild:
  // the backtrack probes cells outside the band and has to read `NONE` there,
  // which a leftover direction from the previous stripe would not be.
  const stripeSolution = new Uint8Array(stripeHeight * bandWidth);
  let materializedStripe = -1;

  function materializeStripe(stripe: number): void {
    const checkpointRow = stripe * stripeHeight;
    const lastRow = Math.min(aLength, checkpointRow + stripeHeight);

    stripeSolution.fill(0);

    let from = prevRow;
    let into = curRow;
    from.set(
      checkpoints.subarray(stripe * bandWidth, (stripe + 1) * bandWidth),
    );

    for (let i = checkpointRow + 1; i <= lastRow; i++) {
      computeRow(
        i,
        from,
        into,
        stripeSolution,
        (i - checkpointRow - 1) * bandWidth,
      );

      const swap = from;
      from = into;
      into = swap;
    }

    materializedStripe = stripe;
  }

  // Backtrack through the directions to inject PLACEHOLDER gaps. Out-of-band
  // reads must return NONE (0), matching the original full-matrix behaviour
  // where unwritten cells default to zero.
  function getMovement(i: number, j: number): number {
    if (i < 1) {
      return NONE;
    }

    const bandIdx = j - colOffFor(i);
    if (bandIdx < 0 || bandIdx >= bandWidth) {
      return NONE;
    }

    // Row `i` sits in the stripe above the nearest checkpoint at or below it.
    const stripe = Math.floor((i - 1) / stripeHeight);
    if (stripe !== materializedStripe) {
      materializeStripe(stripe);
    }

    return stripeSolution[
      (i - 1 - stripe * stripeHeight) * bandWidth + bandIdx
    ];
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
