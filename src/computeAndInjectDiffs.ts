import alignArrays, { PLACEHOLDER } from './alignArrays.ts';
import type { RowKey } from './alignArrays.ts';
import compose from './compose.ts';
import type { ColorLike } from './compose.ts';
import similarEnough from './similarEnough.ts';

/** The raw image, as browsers (`ImageData`) and Node bitmaps both supply it. */
export interface ImageInput {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/** A row of pixel data, in either of the two forms it is held in. */
export type Bytes = Uint8Array | Uint8ClampedArray;

/** Turns a row into something the aligner can compare with `===`. */
export type HashFunction = (row: Uint8ClampedArray) => RowKey;

function imageTo2DArray(
  { data, width, height }: ImageInput,
  paddingRight: number,
): Uint8ClampedArray[] {
  // The imageData is a 1D array. Each element in the array corresponds to a
  // decimal value that represents one of the RGBA channels for that pixel.
  const rowSize = width * 4;
  const padSize = paddingRight * 4;

  // A typed array can hand over a row as a view, so copying one becomes a
  // single native `set` instead of a few thousand element assignments. That is
  // what every caller supplies in practice -- an `ImageData`'s `data` in the
  // browser, a decoded bitmap in Node.
  //
  // `ImageInput` still permits a plain array, and the cheapest thing to do with
  // one is to make it a typed array once rather than slice it per row. It is
  // already much the more expensive input, since a JS array holds every byte as
  // a full number, so one more pass over it costs little beside that.
  //
  // `Uint8ClampedArray` and not `Uint8Array`, so a value outside 0..255 clamps
  // the way it did when it was assigned straight into the clamped rows below.
  // `Uint8Array` would wrap it instead.
  const pixels =
    data instanceof Uint8Array || data instanceof Uint8ClampedArray
      ? data
      : Uint8ClampedArray.from(data);

  const newData: Uint8ClampedArray[] = [];
  for (let row = 0; row < height; row += 1) {
    const pixelsInRow = new Uint8ClampedArray(rowSize + padSize);
    const start = row * rowSize;

    // A row that runs past the end of `data` copies what is there and leaves
    // the rest zero, which is what assigning `undefined` into a clamped array
    // did before.
    pixelsInRow.set(pixels.subarray(start, start + rowSize));

    // Fills nothing when there is no padding, since the row is already full.
    pixelsInRow.fill(1, rowSize);

    newData.push(pixelsInRow);
  }
  return newData;
}

// `String.fromCharCode` is applied to a slice of the row at a time: it takes
// the bytes as arguments, and a whole row would overflow the argument limit.
const CHARS_PER_CALL = 8192;

export function hashRowWithBuffer(row: Bytes): string {
  return Buffer.from(row.buffer, row.byteOffset, row.byteLength).toString(
    'latin1',
  );
}

export function hashRowWithCharCodes(row: Bytes): string {
  let result = '';
  for (let i = 0; i < row.length; i += CHARS_PER_CALL) {
    result += String.fromCharCode(...row.subarray(i, i + CHARS_PER_CALL));
  }
  return result;
}

// Rows arrive as `Uint8ClampedArray`, which the comparisons below do not
// accept. A `Uint8Array` over the same bytes costs nothing and is what both
// of them want.
const asBytes = (row: Uint8ClampedArray): Uint8Array =>
  new Uint8Array(row.buffer, row.byteOffset, row.byteLength);

/** Compares two rows in full. Node does it in one native call. */
export const rowsEqualWithBuffer = (a: Uint8Array, b: Uint8Array): boolean =>
  Buffer.compare(a, b) === 0;

/** Compares two rows in full, without Node's `Buffer`. */
export const rowsEqualInJavaScript = (a: Uint8Array, b: Uint8Array): boolean => {
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

function fingerprint(row: Uint8ClampedArray): number {
  let result = row.length;
  for (let i = 0; i < row.length; i += FINGERPRINT_STRIDE) {
    result = (Math.imul(result, 31) + row[i]) | 0;
  }
  return result;
}

export interface InternerOptions {
  rowsEqual?: (a: Uint8Array, b: Uint8Array) => boolean;
  hashRow?: (row: Bytes) => string;
}

interface Group {
  candidates: { bytes: Uint8Array; id: number }[];
  byContents: Map<string, number> | null;
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
}: InternerOptions = {}): HashFunction {
  const groups = new Map<number, Group>();
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

function transparentLine(
  rawBgPixel: ColorLike,
  width: number,
): Uint8ClampedArray {
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
function nonMatch(): object {
  return {};
}

function toUniqueHashes(
  hashes1: RowKey[],
  hashes2: RowKey[],
): [RowKey[], RowKey[]] {
  const counts1 = new Map<RowKey, number>();
  const counts2 = new Map<RowKey, number>();
  for (const h of hashes1) counts1.set(h, (counts1.get(h) || 0) + 1);
  for (const h of hashes2) counts2.set(h, (counts2.get(h) || 0) + 1);
  const unique1 = hashes1.map(h => {
    const c1 = counts1.get(h);
    const c2 = counts2.get(h);
    return c1 !== undefined &&
      c1 <= MAX_ROW_OCCURRENCES &&
      c2 !== undefined &&
      c2 <= MAX_ROW_OCCURRENCES
      ? h
      : nonMatch();
  });
  const unique2 = hashes2.map(h => {
    const c1 = counts1.get(h);
    const c2 = counts2.get(h);
    return c2 !== undefined &&
      c2 <= MAX_ROW_OCCURRENCES &&
      c1 !== undefined &&
      c1 <= MAX_ROW_OCCURRENCES
      ? h
      : nonMatch();
  });
  return [unique1, unique2];
}

// How close (in rows) two gap blocks must be to be cancelled or combined.
const SIMPLIFY_THRESHOLD = 40;

type SegmentType = 'before' | 'after' | 'neutral' | 'match';

/**
 * Where in the original images a row came from. Which indices a row carries
 * follows from its segment's type, so each is its own shape and the
 * reconstruction below can read them without checking.
 */
interface BeforeRow {
  i2: number;
}

interface AfterRow {
  i1: number;
}

interface MatchRow {
  i1: number;
  i2: number;
}

type NeutralRow = Record<string, never>;

/** A gap block: rows one image has and the other does not. */
type GapSegment =
  | { type: 'before'; rows: BeforeRow[] }
  | { type: 'after'; rows: AfterRow[] };

type Segment =
  | GapSegment
  | { type: 'neutral'; rows: NeutralRow[] }
  | { type: 'match'; rows: MatchRow[] };

/**
 * Builds a segment list from the aligned hash arrays. Each segment describes a
 * contiguous run of one type of operation:
 *   'before'  - arr1 has placeholder, arr2 has content (image2 has extra rows)
 *   'after'   - arr1 has content, arr2 has placeholder (image1 has extra rows)
 *   'neutral' - both have placeholder (padding)
 *   'match'   - both have content
 *
 * Row entries store the original imageData indices so rows can be freely
 * reordered or dropped during simplification without losing track of which
 * pixel data to use.
 */
function buildSegments(unique1: RowKey[], unique2: RowKey[]): Segment[] {
  const PH: RowKey = PLACEHOLDER;
  const segments: Segment[] = [];
  let i1 = 0;
  let i2 = 0;

  function typeOf(u1: RowKey, u2: RowKey): SegmentType {
    if (u1 === PH && u2 !== PH) return 'before';
    if (u1 !== PH && u2 === PH) return 'after';
    if (u1 === PH && u2 === PH) return 'neutral';
    return 'match';
  }

  for (let i = 0; i < unique1.length; ) {
    const type = typeOf(unique1[i], unique2[i]);

    // How long this run is. Counting first lets each branch below fill an
    // array of its own row shape.
    const start = i;
    while (i < unique1.length && typeOf(unique1[i], unique2[i]) === type) i++;
    const length = i - start;

    if (type === 'before') {
      const rows: BeforeRow[] = [];
      for (let n = 0; n < length; n++) rows.push({ i2: i2++ });
      segments.push({ type, rows });
    } else if (type === 'after') {
      const rows: AfterRow[] = [];
      for (let n = 0; n < length; n++) rows.push({ i1: i1++ });
      segments.push({ type, rows });
    } else if (type === 'neutral') {
      const rows: NeutralRow[] = [];
      for (let n = 0; n < length; n++) rows.push({});
      segments.push({ type, rows });
    } else {
      const rows: MatchRow[] = [];
      for (let n = 0; n < length; n++) rows.push({ i1: i1++, i2: i2++ });
      segments.push({ type, rows });
    }
  }
  return segments;
}

function isOppositeType(t1: SegmentType, t2: SegmentType): boolean {
  return (t1 === 'before' && t2 === 'after') || (t1 === 'after' && t2 === 'before');
}

/**
 * Simplifies the segment list in place:
 *   - Cancel: adjacent opposite-direction gap blocks cancel each other out.
 *   - Cancel: opposite-direction gap blocks within `threshold` match rows also
 *     cancel (min of the two counts is removed from each).
 *   - Combine: same-direction gap blocks separated by <= threshold match rows
 *     are merged into a single contiguous gap block (the match rows are kept
 *     but shifted to come after the merged gap).
 */
function simplifySegments(segments: Segment[], threshold: number): void {
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

      // Combine: two same-direction gaps -> merge them, keep match rows after
      if (s1.type === 'before' && s3.type === 'before') {
        segments.splice(s, 3,
          { type: 'before', rows: [...s1.rows, ...s3.rows] },
          { type: 'match', rows: sm.rows },
        );
        changed = true;
        break;
      }
      if (s1.type === 'after' && s3.type === 'after') {
        segments.splice(s, 3,
          { type: 'after', rows: [...s1.rows, ...s3.rows] },
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
          const newSegs: Segment[] = [];
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

interface ReconstructedImages {
  out1: Uint8ClampedArray[];
  out2: Uint8ClampedArray[];
  injected1: Set<number>;
  injected2: Set<number>;
}

/**
 * Reconstructs the final image arrays from a (possibly simplified) segment
 * list. Transparent placeholder lines are inserted where needed, and any rows
 * removed during simplification are simply omitted from the output.
 */
function reconstructImages(
  segments: Segment[],
  image1Data: Uint8ClampedArray[],
  image2Data: Uint8ClampedArray[],
  image1Bg: ColorLike,
  image2Bg: ColorLike,
  maxWidth: number,
): ReconstructedImages {
  const out1: Uint8ClampedArray[] = [];
  const out2: Uint8ClampedArray[] = [];

  // Which rows of each result were injected here rather than taken from the
  // image. This cannot be recovered from the pixels afterwards: an injected
  // line is the image's own background blended with a fixed grey, and real
  // content can be exactly that color.
  const injected1 = new Set<number>();
  const injected2 = new Set<number>();

  for (const seg of segments) {
    if (seg.type === 'before') {
      for (const row of seg.rows) {
        injected1.add(out1.length);
        out1.push(transparentLine(image1Bg, maxWidth));
        out2.push(image2Data[row.i2]);
      }
    } else if (seg.type === 'after') {
      for (const row of seg.rows) {
        injected2.add(out1.length);
        out1.push(image1Data[row.i1]);
        out2.push(transparentLine(image2Bg, maxWidth));
      }
    } else if (seg.type === 'neutral') {
      for (let n = 0; n < seg.rows.length; n++) {
        const y = out1.length;
        injected1.add(y);
        injected2.add(y);
        out1.push(transparentLine(image1Bg, maxWidth));
        out2.push(transparentLine(image2Bg, maxWidth));
      }
    } else {
      for (const row of seg.rows) {
        out1.push(image1Data[row.i1]);
        out2.push(image2Data[row.i2]);
      }
    }
  }

  return { out1, out2, injected1, injected2 };
}

function align({
  image1Data,
  image2Data,
  maxWidth,
  hashFunction,
}: {
  image1Data: Uint8ClampedArray[];
  image2Data: Uint8ClampedArray[];
  maxWidth: number;
  hashFunction: HashFunction;
}): { injected1: Set<number>; injected2: Set<number> } {
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

export interface ComputeAndInjectDiffsOptions {
  image1: ImageInput;
  image2: ImageInput;
  hashFunction?: HashFunction;
}

export interface ComputeAndInjectDiffsResult {
  image1Data: Uint8ClampedArray[];
  image2Data: Uint8ClampedArray[];
  image1InjectedRows: Set<number>;
  image2InjectedRows: Set<number>;
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
 */
export default function computeAndInjectDiffs({
  image1,
  image2,
  // A fresh interner per call: its numbers only mean anything within one
  // alignment, and it holds on to the rows it is given.
  hashFunction = createInterner(),
}: ComputeAndInjectDiffsOptions): ComputeAndInjectDiffsResult {
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
