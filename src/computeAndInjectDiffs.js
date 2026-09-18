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

// `String.fromCharCode` is applied to a slice of the row at a time: it takes
// the bytes as arguments, and a whole row would overflow the argument limit.
const CHARS_PER_CALL = 8192;

export function hashRowWithBuffer(row) {
  return Buffer.from(row.buffer, row.byteOffset, row.byteLength).toString(
    'latin1',
  );
}

export function hashRowWithCharCodes(row) {
  let result = '';
  for (let i = 0; i < row.length; i += CHARS_PER_CALL) {
    result += String.fromCharCode.apply(
      null,
      row.subarray(i, i + CHARS_PER_CALL),
    );
  }
  return result;
}

// Rows arrive as `Uint8ClampedArray`, which the comparisons below do not
// accept. A `Uint8Array` over the same bytes costs nothing and is what both
// of them want.
const asBytes = row => new Uint8Array(row.buffer, row.byteOffset, row.byteLength);

/** Compares two rows in full. Node does it in one native call. */
export const rowsEqualWithBuffer = (a, b) => Buffer.compare(a, b) === 0;

/** Compares two rows in full, without Node's `Buffer`. */
export const rowsEqualInJavaScript = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
};

const defaultRowsEqual =
  typeof Buffer !== 'undefined' ? rowsEqualWithBuffer : rowsEqualInJavaScript;

const defaultHashRow =
  typeof Buffer !== 'undefined' ? hashRowWithBuffer : hashRowWithCharCodes;

// How far apart the bytes are that decide which rows are worth comparing.
// Sampling is what makes this cheap, and being wrong only costs a comparison,
// so this only has to be good enough to keep the groups small. Not a multiple
// of four, so it does not look at the same channel of every pixel it samples.
const FINGERPRINT_STRIDE = 61;

// How many rows may share a fingerprint before we stop comparing them one by
// one. Without this a set of rows that all sample the same is quadratic.
const MAX_CANDIDATES = 8;

function fingerprint(row) {
  let result = row.length;
  for (let i = 0; i < row.length; i += FINGERPRINT_STRIDE) {
    result = (Math.imul(result, 31) + row[i]) | 0;
  }
  return result;
}

/**
 * Gives each distinct row a number, so the aligner compares numbers rather
 * than rows.
 *
 * Rows are bucketed by a sampled fingerprint and then compared in full, so the
 * numbers say exactly what the rows say: equal numbers mean identical rows,
 * with no chance of a digest collision aligning two rows that differ. Holding
 * a number per row rather than a copy of its bytes is also most of the memory
 * this used to take.
 *
 * Must not be shared between calls: the ids mean nothing outside one
 * alignment, and it keeps every row it is given alive.
 */
export function createInterner({
  rowsEqual = defaultRowsEqual,
  hashRow = defaultHashRow,
} = {}) {
  const groups = new Map();
  let nextId = 0;

  return row => {
    const rowFingerprint = fingerprint(row);
    let group = groups.get(rowFingerprint);
    if (group === undefined) {
      group = { candidates: [], byContents: null };
      groups.set(rowFingerprint, group);
    }

    const bytes = asBytes(row);

    // Too many rows sample alike to keep comparing them, so they are keyed by
    // their full contents instead. Costs what hashing every row used to.
    if (group.byContents !== null) {
      const key = hashRow(bytes);
      let id = group.byContents.get(key);
      if (id === undefined) {
        id = nextId;
        nextId += 1;
        group.byContents.set(key, id);
      }
      return id;
    }

    for (const candidate of group.candidates) {
      if (rowsEqual(candidate.bytes, bytes)) return candidate.id;
    }

    const id = nextId;
    nextId += 1;

    if (group.candidates.length >= MAX_CANDIDATES) {
      group.byContents = new Map(
        group.candidates.map(candidate => [hashRow(candidate.bytes), candidate.id]),
      );
      group.byContents.set(hashRow(bytes), id);
      group.candidates = [];
      return id;
    }

    group.candidates.push({ bytes, id });
    return id;
  };
}

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

/**
 * A value equal to itself and to nothing else, marking a row that may not be
 * used as an alignment anchor.
 *
 * It has to be an object. The aligner compares rows with `===`, and a hash is
 * whatever the hash function returned -- for the default that is the row's own
 * bytes as a string, so any string used here is one some row could produce.
 * The sentinels used to be `\0a${i}`, which a four-byte row spells exactly.
 */
function nonMatch() {
  return {};
}

function toUniqueHashes(hashes1, hashes2) {
  const counts1 = new Map();
  const counts2 = new Map();
  for (const h of hashes1) counts1.set(h, (counts1.get(h) || 0) + 1);
  for (const h of hashes2) counts2.set(h, (counts2.get(h) || 0) + 1);
  const unique1 = hashes1.map(h => {
    const c1 = counts1.get(h);
    const c2 = counts2.get(h);
    return c1 <= MAX_ROW_OCCURRENCES && c2 && c2 <= MAX_ROW_OCCURRENCES
      ? h
      : nonMatch();
  });
  const unique2 = hashes2.map(h => {
    const c1 = counts1.get(h);
    const c2 = counts2.get(h);
    return c2 <= MAX_ROW_OCCURRENCES && c1 && c1 <= MAX_ROW_OCCURRENCES
      ? h
      : nonMatch();
  });
  return [unique1, unique2];
}

// How close (in rows) two gap blocks must be to be cancelled or combined.
const SIMPLIFY_THRESHOLD = 40;

/**
 * Builds a segment list from the aligned hash arrays. Each segment describes a
 * contiguous run of one type of operation:
 *   'before'  – arr1 has placeholder, arr2 has content (image2 has extra rows)
 *   'after'   – arr1 has content, arr2 has placeholder (image1 has extra rows)
 *   'neutral' – both have placeholder (padding)
 *   'match'   – both have content
 *
 * Row entries store the original imageData indices so rows can be freely
 * reordered or dropped during simplification without losing track of which
 * pixel data to use.
 */
function buildSegments(unique1, unique2) {
  const PH = alignArrays.PLACEHOLDER;
  const segments = [];
  let i1 = 0;
  let i2 = 0;

  function typeOf(u1, u2) {
    if (u1 === PH && u2 !== PH) return 'before';
    if (u1 !== PH && u2 === PH) return 'after';
    if (u1 === PH && u2 === PH) return 'neutral';
    return 'match';
  }

  for (let i = 0; i < unique1.length; ) {
    const type = typeOf(unique1[i], unique2[i]);
    const rows = [];
    while (i < unique1.length && typeOf(unique1[i], unique2[i]) === type) {
      if (type === 'before') {
        rows.push({ i2: i2++ });
      } else if (type === 'after') {
        rows.push({ i1: i1++ });
      } else if (type === 'neutral') {
        rows.push({});
      } else {
        rows.push({ i1: i1++, i2: i2++ });
      }
      i++;
    }
    segments.push({ type, rows });
  }
  return segments;
}

function isOppositeType(t1, t2) {
  return (t1 === 'before' && t2 === 'after') || (t1 === 'after' && t2 === 'before');
}

/**
 * Simplifies the segment list in place:
 *   - Cancel: adjacent opposite-direction gap blocks cancel each other out.
 *   - Cancel: opposite-direction gap blocks within `threshold` match rows also
 *     cancel (min of the two counts is removed from each).
 *   - Combine: same-direction gap blocks separated by ≤ threshold match rows
 *     are merged into a single contiguous gap block (the match rows are kept
 *     but shifted to come after the merged gap).
 */
function simplifySegments(segments, threshold) {
  let changed = true;
  while (changed) {
    changed = false;

    // Cancel adjacent opposite gaps
    for (let s = 0; s < segments.length - 1; s++) {
      const s1 = segments[s];
      const s2 = segments[s + 1];
      if (isOppositeType(s1.type, s2.type)) {
        const n = Math.min(s1.rows.length, s2.rows.length);
        if (n > 0) {
          s1.rows.splice(s1.rows.length - n);
          s2.rows.splice(0, n);
          if (s2.rows.length === 0) segments.splice(s + 1, 1);
          if (s1.rows.length === 0) segments.splice(s, 1);
          changed = true;
          break;
        }
      }
    }
    if (changed) continue;

    // Combine or cancel gap blocks separated by a small match segment
    for (let s = 0; s < segments.length - 2; s++) {
      const s1 = segments[s];
      const sm = segments[s + 1];
      const s3 = segments[s + 2];

      if (sm.type !== 'match' || sm.rows.length > threshold) continue;

      // Combine: two same-direction gaps → merge them, keep match rows after
      if (s1.type === s3.type && (s1.type === 'before' || s1.type === 'after')) {
        segments.splice(s, 3,
          { type: s1.type, rows: [...s1.rows, ...s3.rows] },
          { type: 'match', rows: sm.rows },
        );
        changed = true;
        break;
      }

      // Cancel: opposite-direction gaps close to each other
      if (isOppositeType(s1.type, s3.type)) {
        const n = Math.min(s1.rows.length, s3.rows.length);
        if (n > 0) {
          s1.rows.splice(s1.rows.length - n);
          s3.rows.splice(0, n);
          const newSegs = [];
          if (s1.rows.length > 0) newSegs.push(s1);
          newSegs.push(sm);
          if (s3.rows.length > 0) newSegs.push(s3);
          segments.splice(s, 3, ...newSegs);
          changed = true;
          break;
        }
      }
    }
  }
}

/**
 * Reconstructs the final image arrays from a (possibly simplified) segment
 * list. Transparent placeholder lines are inserted where needed, and any rows
 * removed during simplification are simply omitted from the output.
 */
function reconstructImages(segments, image1Data, image2Data, image1Bg, image2Bg, maxWidth) {
  const out1 = [];
  const out2 = [];

  // Which rows of each result were injected here rather than taken from the
  // image. This cannot be recovered from the pixels afterwards: an injected
  // line is the image's own background blended with a fixed grey, and real
  // content can be exactly that color.
  const injected1 = new Set();
  const injected2 = new Set();

  for (const seg of segments) {
    for (const row of seg.rows) {
      const y = out1.length;
      if (seg.type === 'before') {
        out1.push(transparentLine(image1Bg, maxWidth));
        injected1.add(y);
        out2.push(image2Data[row.i2]);
      } else if (seg.type === 'after') {
        out1.push(image1Data[row.i1]);
        out2.push(transparentLine(image2Bg, maxWidth));
        injected2.add(y);
      } else if (seg.type === 'neutral') {
        out1.push(transparentLine(image1Bg, maxWidth));
        injected1.add(y);
        out2.push(transparentLine(image2Bg, maxWidth));
        injected2.add(y);
      } else {
        out1.push(image1Data[row.i1]);
        out2.push(image2Data[row.i2]);
      }
    }
  }

  return { out1, out2, injected1, injected2 };
}

function align({ image1Data, image2Data, maxWidth, hashFunction }) {
  if (similarEnough({ image1Data, image2Data })) {
    // Nothing was aligned, so nothing was injected.
    return { injected1: new Set(), injected2: new Set() };
  }

  const hashedImage1Data = image1Data.map(hashFunction);
  const hashedImage2Data = image2Data.map(hashFunction);

  const [unique1, unique2] = toUniqueHashes(hashedImage1Data, hashedImage2Data);
  alignArrays(unique1, unique2);

  const image1Bg = image1Data[0].slice(0, 4);
  const image2Bg = image2Data[0].slice(0, 4);

  const segments = buildSegments(unique1, unique2);
  simplifySegments(segments, SIMPLIFY_THRESHOLD);
  const { out1, out2, injected1, injected2 } = reconstructImages(
    segments, image1Data, image2Data, image1Bg, image2Bg, maxWidth,
  );

  // Mutate in place to match the existing API contract
  image1Data.length = 0;
  image2Data.length = 0;
  for (const row of out1) image1Data.push(row);
  for (const row of out2) image2Data.push(row);

  return { injected1, injected2 };
}

/**
 * Takes two 2d images, computes the diff between the two, and injects pixels to
 * both in order to:
 * a) make both images the same height
 * b) properly visualize differences
 *
 * Please note that this method MUTATES data.
 *
 * `image1InjectedRows` and `image2InjectedRows` hold the row indices this
 * method added to each image to make up a height difference. They are the only way to
 * tell those rows apart from the image's own content -- an injected line is
 * the image's background blended with a fixed grey, which real content can
 * match exactly.
 *
 * @param {Array} image1
 * @param {Array} image2
 * @return {{ image1Data: Array, image2Data: Array, image1InjectedRows: Set<number>, image2InjectedRows: Set<number> }}
 */
export default function computeAndInjectDiffs({
  image1,
  image2,
  // A fresh interner per call: its numbers only mean anything within one
  // alignment, and it holds on to the rows it is given.
  hashFunction = createInterner(),
}) {
  const maxWidth = Math.max(image1.width, image2.width);

  const image1Data = imageTo2DArray(image1, maxWidth - image1.width);
  const image2Data = imageTo2DArray(image2, maxWidth - image2.width);

  const { injected1, injected2 } = align({
    image1Data,
    image2Data,
    maxWidth,
    hashFunction,
  });

  return {
    image1Data,
    image2Data,
    image1InjectedRows: injected1,
    image2InjectedRows: injected2,
  };
}
