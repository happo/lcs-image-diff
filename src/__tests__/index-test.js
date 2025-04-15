const path = require('path');
const sharp = require('sharp');

const imageDiff = require('../');

let image1;
let image2;
let hashFunction;
let subject;

beforeEach(async () => {
  hashFunction = undefined;
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
  subject = () => imageDiff(image1, image2, hashFunction);
});

it('generates a diff image', () => {
  expect(image1.width).toEqual(80);
  expect(image1.height).toEqual(80);
  expect(image2.width).toEqual(64);
  expect(image2.height).toEqual(64);
  const img = subject();
  expect(img.width).toEqual(80);
  expect(img.height).toEqual(80);
  expect(img.data.length).toBe(80 * 80 * 4);
});

it('produces a trace svg', () => {
  const img = subject();
  expect(img.trace.toSVG()).toMatch(/<svg.*viewBox="0 0 100 100".*<\/svg>/);
});

it('has meta-data', () => {
  const { diff, maxDiff } = subject();
  expect(diff).toBeLessThan(0.3);
  expect(maxDiff).toEqual(1);
});

it('has maxDiff=1 when images are of different size', async () => {
  const image1Sharp = sharp(
    path.resolve(__dirname, 'test-images/button-before.png'),
  );
  const image2Sharp = sharp(
    path.resolve(__dirname, 'test-images/button-after.png'),
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
  const { diff, maxDiff } = subject();
  expect(diff).toBeLessThan(1);
  expect(maxDiff).toEqual(1);
});
