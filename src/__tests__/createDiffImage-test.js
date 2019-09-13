const crypto = require('crypto');
const path = require('path');

const Jimp = require('jimp');

const computeAndInjectDiffs = require('../computeAndInjectDiffs');
const createDiffImage = require('../createDiffImage');

let image1;
let image2;
let subject;

beforeEach(async () => {
  image1 = (await Jimp.read(
    'https://dummyimage.com/200/000/ffffff.png&text=aa',
  )).bitmap;
  image2 = (await Jimp.read(
    'https://dummyimage.com/200/000/f7f7f7.png&text=aa',
  )).bitmap;
  subject = () =>
    createDiffImage(
      computeAndInjectDiffs({
        image1,
        image2,
      }),
    );
});

it('has a total diff value and a max diff', async () => {
  const { maxDiff, diff } = await subject();
  expect(maxDiff).toEqual(0.027169424432452977);
  expect(diff).toEqual(0.00043751263781383705);
});
