const Jimp = require('jimp');
const crypto = require('crypto');
const path = require('path');

const computeAndInjectDiffs = require('../computeAndInjectDiffs');

function createHash(data) {
  return crypto
    .createHash('md5')
    .update(data)
    .digest('hex');
};

let image1;
let image2;
let hashFunction;
let subject;

beforeEach(async () => {
  image1 = (await Jimp.read(
    path.resolve(__dirname, '../../static/google-logo.png'),
  )).bitmap;
  image2 = (await Jimp.read(
    path.resolve(__dirname, '../../static/github-logo.png'),
  )).bitmap;
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
