import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

import computeAndInjectDiffs from '../computeAndInjectDiffs.js';
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
