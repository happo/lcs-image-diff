const Jimp = require('jimp');
const path = require('path');

const imageDiff = require('../');

let image1;
let image2;
let hashFunction;
let subject;

beforeEach(async () => {
  hashFunction = undefined;
  image1 = (await Jimp.read(
    path.resolve(__dirname, '../../static/google-logo.png'),
  )).bitmap;
  image2 = (await Jimp.read(
    path.resolve(__dirname, '../../static/github-logo.png'),
  )).bitmap;
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
