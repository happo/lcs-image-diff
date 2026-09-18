import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

import computeAndInjectDiffs, {
  hashRowWithBuffer,
  hashRowWithCharCodes,
} from '../computeAndInjectDiffs.js';
import compose from '../compose.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function createHash(data) {
  return crypto.createHash('md5').update(data).digest('hex');
}

let image1;
let image2;
let hashFunction;
let subject;

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
  function solidImage(height, bandRow, bandColor) {
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
    ...compose([200, 200, 200, 50], new Uint8ClampedArray([255, 255, 255, 255]))
      .slice(0, 3),
    122,
  ];

  // Whichever image is shorter is the one that gets rows, so each set is
  // filled by its own branch and each needs its own case.
  it.each([
    ['image1 is shorter', 20, 26],
    ['image2 is shorter', 26, 20],
  ])('reports which rows it added when %s', async (_name, height1, height2) => {
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
  });

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
  const both = [
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

  it('does not read a row as an alignment sentinel', () => {
    // Rows that cannot anchor the alignment are marked with a value that must
    // not be anything a hash can produce. The marker used to be a string, and
    // a four-byte row spells one exactly, so a one-pixel-wide image could
    // produce a row equal to it. The bytes below spell the old marker for row
    // 10; they must align no differently from any other bytes.
    const image = (height, contentRow, bytes) => {
      const data = Buffer.alloc(height * 4);
      for (let y = 0; y < height; y++) {
        const pos = y * 4;
        const [r, g, b, a] = y === contentRow ? bytes : [255, 255, 255, 255];
        data[pos] = r;
        data[pos + 1] = g;
        data[pos + 2] = b;
        data[pos + 3] = a;
      }
      return { data, width: 1, height };
    };

    // Injected line, white, or the content row -- the shape of the result,
    // independent of what the content row's bytes happen to be.
    const shape = bytes =>
      computeAndInjectDiffs({
        image1: image(30, 10, bytes),
        image2: image(34, 12, [10, 20, 30, 255]),
      })
        .image1Data.map(row => {
          if (row[3] === 122) return 'injected';
          return row[0] === 255 && row[1] === 255 && row[2] === 255
            ? 'white'
            : 'content';
        })
        .join(' ');

    expect(shape([0, 97, 49, 48])).toBe(shape([7, 8, 9, 255]));
  });
});
