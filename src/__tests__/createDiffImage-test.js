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
  const { diff, maxDiff } = await subject();
  expect(diff).toEqual(0.000013924627638992437);
  expect(maxDiff).toEqual(0.0009183359547574563);
});
