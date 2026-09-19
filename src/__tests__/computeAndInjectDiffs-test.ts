import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import crypto from 'crypto';

import { beforeEach, describe, expect, it } from '@jest/globals';
import sharp from 'sharp';

import computeAndInjectDiffs, {
  createInterner,
  hashRowWithBuffer,
  hashRowWithCharCodes,
  rowsEqualInJavaScript,
} from '../computeAndInjectDiffs.ts';
import type {
  ComputeAndInjectDiffsResult,
  HashFunction,
  ImageInput,
  InternerOptions,
} from '../computeAndInjectDiffs.ts';
import compose from '../compose.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function createHash(data: Uint8ClampedArray): string {
  return crypto.createHash('md5').update(data).digest('hex');
}

let image1: ImageInput;
let image2: ImageInput;
let hashFunction: HashFunction | undefined;
let subject: () => ComputeAndInjectDiffsResult;

beforeEach(async () => {
  const image1Sharp = sharp(
    path.resolve(__dirname, '../../static/google-logo.png'),
  );
  const image2Sharp = sharp(
    path.resolve(__dirname, '../../static/github-logo.png'),
  );

  const [image1Metadata, image2Metadata] = await Promise.all([
    image1Sharp.metadata(),
    image2Sharp.metadata(),
  ]);

  const [image1Buffer, image2Buffer] = await Promise.all([
    image1Sharp.raw().toBuffer(),
    image2Sharp.raw().toBuffer(),
  ]);

  image1 = {
    data: image1Buffer,
    width: image1Metadata.width,
    height: image1Metadata.height,
  };
  image2 = {
    data: image2Buffer,
    width: image2Metadata.width,
    height: image2Metadata.height,
  };
  hashFunction = undefined;
  subject = () =>
    computeAndInjectDiffs({
      image1,
      image2,
      hashFunction,
    });
});

it('makes the images the same height', async () => {
  const { image1Data, image2Data } = await subject();
  expect(image1Data.length).toBe(image2Data.length);
});

it('can take a custom hashFunction', async () => {
  hashFunction = createHash;
  const { image1Data, image2Data } = await subject();
  expect(image1Data.length).toBe(image2Data.length);
});

describe('injected rows', () => {
  // A solid image of `height` rows, with `bandRow` painted `bandColor`.
  function solidImage(
    height: number,
    bandRow: number,
    bandColor: number[],
  ): ImageInput {
    const width = 20;
    const data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pos = (y * width + x) * 4;
        const [r, g, b, a] =
          y === bandRow ? bandColor : [255, 255, 255, 255];
        data[pos] = r;
        data[pos + 1] = g;
        data[pos + 2] = b;
        data[pos + 3] = a;
      }
    }
    return { data, width, height };
  }

  // What an injected line is filled with for a white image.
  const injectedColor = [
    ...[
      ...compose(
        [200, 200, 200, 50],
        new Uint8ClampedArray([255, 255, 255, 255]),
      ),
    ].slice(0, 3),
    122,
  ];

  // Whichever image is shorter is the one that gets rows, so each set is
  // filled by its own branch and each needs its own case.
  const shorterImageCases: [string, number, number][] = [
    ['image1 is shorter', 20, 26],
    ['image2 is shorter', 26, 20],
  ];

  it.each(shorterImageCases)(
    'reports which rows it added when %s',
    async (_name, height1, height2) => {
      const { image1Data, image2Data, image1InjectedRows, image2InjectedRows } =
        computeAndInjectDiffs({
          image1: solidImage(height1, 4, [200, 30, 30, 255]),
          image2: solidImage(height2, 4, [200, 30, 30, 255]),
        });

      expect(image1InjectedRows.size).toBe(image1Data.length - height1);
      expect(image2InjectedRows.size).toBe(image2Data.length - height2);

      // Only the shorter one needed any.
      expect(Math.min(image1InjectedRows.size, image2InjectedRows.size)).toBe(0);
      expect(Math.max(image1InjectedRows.size, image2InjectedRows.size)).toBe(6);

      for (const y of image1InjectedRows) {
        expect([...image1Data[y].slice(0, 4)]).toEqual(injectedColor);
      }
      for (const y of image2InjectedRows) {
        expect([...image2Data[y].slice(0, 4)]).toEqual(injectedColor);
      }
    },
  );

  it('reports nothing when the images are not aligned', async () => {
    const image = solidImage(20, 4, [200, 30, 30, 255]);
    const { image1InjectedRows, image2InjectedRows } = computeAndInjectDiffs({
      image1: image,
      image2: solidImage(20, 4, [200, 30, 30, 255]),
    });

    expect(image1InjectedRows.size).toBe(0);
    expect(image2InjectedRows.size).toBe(0);
  });

  it('does not report image content that happens to be the injected color', async () => {
    // The color an injected line is filled with is derived from the image's
    // own background, so an image can legitimately contain it. Callers rely on
    // these sets to tell the two apart, which pixel values cannot do.
    const { image1Data, image1InjectedRows } = computeAndInjectDiffs({
      image1: solidImage(20, 4, injectedColor),
      image2: solidImage(26, 12, [30, 30, 200, 255]),
    });

    const contentRows = image1Data
      .map((row, y) => ({ row, y }))
      .filter(({ row }) => [...row.slice(0, 4)].every((v, i) => v === injectedColor[i]))
      .filter(({ y }) => !image1InjectedRows.has(y));

    // The painted row survives as content rather than being called injected.
    expect(contentRows.length).toBe(1);
  });
});

describe('row hashing', () => {
  // Jest runs under Node, so the module always picks the Buffer
  // implementation. The other one ships to browsers, so it is tested directly
  // and against its counterpart.
  const both: [string, (row: Uint8ClampedArray) => string][] = [
    ['Buffer', hashRowWithBuffer],
    ['fromCharCode', hashRowWithCharCodes],
  ];

  it.each(both)('%s keeps every byte value distinct', (_name, hash) => {
    const row = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) row[i] = i;

    const hashed = hash(row);
    expect(hashed).toHaveLength(256);
    expect(new Set(hashed).size).toBe(256);
  });

  it.each(both)('%s distinguishes rows differing in one byte', (_name, hash) => {
    const a = new Uint8ClampedArray(64).fill(7);
    const b = new Uint8ClampedArray(64).fill(7);
    b[63] = 8;

    expect(hash(a)).not.toBe(hash(b));
    expect(hash(a)).toBe(hash(a.slice()));
  });

  it('agrees across a row longer than one fromCharCode call', () => {
    // The browser implementation walks the row 8192 bytes at a time.
    const row = new Uint8ClampedArray(20000);
    for (let i = 0; i < row.length; i++) row[i] = (i * 31) % 256;

    expect(hashRowWithCharCodes(row)).toBe(hashRowWithBuffer(row));
  });

  it('agrees on rows of every length around the slice boundary', () => {
    for (const length of [0, 1, 8191, 8192, 8193, 16384, 16385]) {
      const row = new Uint8ClampedArray(length);
      for (let i = 0; i < length; i++) row[i] = (i * 17 + 3) % 256;

      expect(hashRowWithCharCodes(row)).toBe(hashRowWithBuffer(row));
    }
  });

  it('does not match a row against an alignment sentinel', () => {
    // Rows too common to anchor the alignment are marked with a value that
    // must not be anything a hash can produce. The marker used to be a string,
    // and at one pixel wide a row is four bytes and spells one exactly: these
    // bytes are the marker the aligner used for row 10.
    const marker = [0, 97, 49, 48];
    const white = [255, 255, 255, 255];

    // White occurs far more than MAX_ROW_OCCURRENCES, so every white row is
    // excluded and row 10 of image1 is given the marker. The marker-spelling
    // row occurs once in each image, so it keeps its real hash -- which is
    // that same string, and the two used to be matched to each other.
    const image = (height: number, markerRow: number): ImageInput => {
      const data = Buffer.alloc(height * 4);
      for (let y = 0; y < height; y++) {
        data.set(y === markerRow ? marker : white, y * 4);
      }
      return { data, width: 1, height };
    };

    const align = (hashFn?: HashFunction): string => {
      const { image1Data, image2Data } = computeAndInjectDiffs({
        image1: image(30, 25),
        image2: image(34, 5),
        ...(hashFn ? { hashFunction: hashFn } : {}),
      });
      return [image1Data, image2Data]
        .map(rows => rows.map(row => [...row].join(',')).join('|'))
        .join('//');
    };

    // md5 cannot produce the marker, so it aligns these correctly. With the
    // string marker the default aligned them to 29 rows instead of 34.
    expect(align()).toBe(align(createHash));
  });
});

describe('row interning', () => {
  // The default keys rows by identity rather than by their bytes. The result
  // has to be what an exact, collision-free hash produces.
  const image = (
    height: number,
    paint: (y: number, x: number) => number[],
  ): ImageInput => {
    const width = 8;
    const data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pos = (y * width + x) * 4;
        const [r, g, b, a] = paint(y, x);
        data[pos] = r;
        data[pos + 1] = g;
        data[pos + 2] = b;
        data[pos + 3] = a;
      }
    }
    return { data, width, height };
  };

  const rowsOf = (result: ComputeAndInjectDiffsResult): string =>
    result.image1Data.map(row => [...row].join(',')).join('|') +
    '//' +
    result.image2Data.map(row => [...row].join(',')).join('|');

  const bothWays = (
    image1: ImageInput,
    image2: ImageInput,
  ): [string, string] => {
    const interned = computeAndInjectDiffs({ image1, image2 });
    const exact = computeAndInjectDiffs({
      image1,
      image2,
      hashFunction: hashRowWithBuffer,
    });
    return [rowsOf(interned), rowsOf(exact)];
  };

  it('aligns the same as an exact hash', () => {
    const [interned, exact] = bothWays(
      image(30, y => (y === 12 ? [10, 20, 30, 255] : [255, 255, 255, 255])),
      image(36, y => (y === 12 ? [10, 20, 30, 255] : [255, 255, 255, 255])),
    );

    expect(interned).toBe(exact);
  });

  it('aligns the same when rows differ only where the sampler never looks', () => {
    // Every row distinct, differing in one byte the stride skips, so they all
    // land in one group and the fallback that bounds it takes over.
    const paint = (offset: number) => (y: number, x: number) =>
      x === 1 ? [(y + offset) & 0xff, 0, 0, 255] : [255, 255, 255, 255];

    const [interned, exact] = bothWays(image(40, paint(0)), image(46, paint(3)));

    expect(interned).toBe(exact);
  });

  it('aligns the same when every row is identical', () => {
    const white = () => [255, 255, 255, 255];
    const [interned, exact] = bothWays(image(30, white), image(36, white));

    expect(interned).toBe(exact);
  });

  describe('without Node', () => {
    // Jest runs under Node, so the default picks the Buffer comparison and the
    // Buffer hash. Browsers get the other two, and nothing reached them
    // through a real alignment. Driving them through `computeAndInjectDiffs`
    // covers interning and its fallback the way a browser would run them.
    const inBrowser = (): HashFunction =>
      createInterner({
        rowsEqual: rowsEqualInJavaScript,
        hashRow: hashRowWithCharCodes,
      });

    const comparedBothWays = (
      image1: ImageInput,
      image2: ImageInput,
    ): [string, string] => [
      rowsOf(computeAndInjectDiffs({ image1, image2, hashFunction: inBrowser() })),
      rowsOf(
        computeAndInjectDiffs({
          image1,
          image2,
          hashFunction: hashRowWithBuffer,
        }),
      ),
    ];

    it('aligns the same as an exact hash', () => {
      const [browser, exact] = comparedBothWays(
        image(30, y => (y === 12 ? [10, 20, 30, 255] : [255, 255, 255, 255])),
        image(36, y => (y === 12 ? [10, 20, 30, 255] : [255, 255, 255, 255])),
      );

      expect(browser).toBe(exact);
    });

    it('aligns the same when the fallback takes over', () => {
      const paint = (offset: number) => (y: number, x: number) =>
        x === 1 ? [(y + offset) & 0xff, 0, 0, 255] : [255, 255, 255, 255];

      const [browser, exact] = comparedBothWays(
        image(40, paint(0)),
        image(46, paint(3)),
      );

      expect(browser).toBe(exact);
    });
  });

  // Rows that differ only in their very last byte. A comparison that stops
  // early, or a fingerprint trusted on its own, reads these as one row.
  const internerCases: [string, InternerOptions | undefined][] = [
    ['in Node', undefined],
    [
      'without Node',
      { rowsEqual: rowsEqualInJavaScript, hashRow: hashRowWithCharCodes },
    ],
  ];

  it.each(internerCases)(
    'tells rows apart that differ only in the last byte, %s',
    (_name, options) => {
      const paint = (offset: number) => (y: number, x: number) =>
        x === 7 ? [255, 255, 255, (y + offset) & 0xff] : [255, 255, 255, 255];

      const interned = rowsOf(
        computeAndInjectDiffs({
          image1: image(30, paint(0)),
          image2: image(36, paint(5)),
          hashFunction: createInterner(options),
        }),
      );
      const exact = rowsOf(
        computeAndInjectDiffs({
          image1: image(30, paint(0)),
          image2: image(36, paint(5)),
          hashFunction: hashRowWithBuffer,
        }),
      );

      expect(interned).toBe(exact);
    },
  );
});

describe('plain array input', () => {
  // `ImageInput` types `data` as `ArrayLike<number>`, so a plain array is a
  // supported input even though every other test here hands over a `Buffer`.
  // Rows are copied out with `subarray` when the input can produce a view and
  // sliced when it cannot, which is two code paths that have to agree.
  const paint = (y: number, x: number): number[] =>
    (x + y) % 5 === 0 ? [20, 60 + y, 120, 255] : [255, 255, 255, 255];

  const buffered = (width: number, height: number): ImageInput => {
    const data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pos = (y * width + x) * 4;
        const [r, g, b, a] = paint(y, x);
        data[pos] = r;
        data[pos + 1] = g;
        data[pos + 2] = b;
        data[pos + 3] = a;
      }
    }
    return { data, width, height };
  };

  const asPlainArray = ({ data, width, height }: ImageInput): ImageInput => ({
    data: Array.from({ length: width * height * 4 }, (_, i) => data[i]),
    width,
    height,
  });

  // Different heights so rows are injected, and different widths so the rows
  // are padded out -- the padding is written by the same code.
  const image1 = buffered(9, 14);
  const image2 = buffered(12, 20);

  it('produces the same rows as a typed array', () => {
    const fromBuffers = computeAndInjectDiffs({ image1, image2 });
    const fromArrays = computeAndInjectDiffs({
      image1: asPlainArray(image1),
      image2: asPlainArray(image2),
    });

    expect(fromArrays.image1Data).toEqual(fromBuffers.image1Data);
    expect(fromArrays.image2Data).toEqual(fromBuffers.image2Data);
    expect(fromArrays.image1InjectedRows).toEqual(
      fromBuffers.image1InjectedRows,
    );
    expect(fromArrays.image2InjectedRows).toEqual(
      fromBuffers.image2InjectedRows,
    );
  });

  it('clamps values outside 0..255 rather than wrapping them', () => {
    // A plain array can hold anything, and it used to reach the rows one
    // element at a time, where storing it in a `Uint8ClampedArray` clamped it.
    // Converting the whole input in one go has to clamp too -- `Uint8Array`
    // would wrap 300 round to 44 instead of holding it at 255.
    const raw = (height: number): number[] =>
      Array.from({ length: 4 * height * 4 }, (_, i) =>
        [300, -5, 1.5, 200][i % 4],
      );

    // What the old element-at-a-time copy produced, by definition.
    const clamped = (values: number[]): Uint8ClampedArray => {
      const out = new Uint8ClampedArray(values.length);
      for (let i = 0; i < values.length; i++) {
        out[i] = values[i];
      }
      return out;
    };

    const asIs = (height: number): ImageInput => ({
      data: raw(height),
      width: 4,
      height,
    });
    const preClamped = (height: number): ImageInput => ({
      data: clamped(raw(height)),
      width: 4,
      height,
    });

    expect(
      computeAndInjectDiffs({ image1: asIs(6), image2: asIs(9) }).image1Data,
    ).toEqual(
      computeAndInjectDiffs({ image1: preClamped(6), image2: preClamped(9) })
        .image1Data,
    );
  });
});
