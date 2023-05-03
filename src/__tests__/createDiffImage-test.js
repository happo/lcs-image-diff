const crypto = require('crypto');
const path = require('path');

const Jimp = require('jimp');

const computeAndInjectDiffs = require('../computeAndInjectDiffs');
const createDiffImage = require('../createDiffImage');

let image1;
let image2;
let subject;

beforeEach(async () => {
  image1 = (await Jimp.read('http://127.0.0.1:5411/aa-ffffff.png')).bitmap;
  image2 = (await Jimp.read('http://127.0.0.1:5411/aa-f7f7f7.png')).bitmap;
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

describe('when images are of different width', () => {
  beforeEach(async () => {
    image1 = (await Jimp.read('http://127.0.0.1:5411/alert-before.png')).bitmap;
    image2 = (await Jimp.read('http://127.0.0.1:5411/alert-after.png')).bitmap;
  });

  it('has a total diff and a max diff', async () => {
    const { diff, maxDiff } = await subject();
    expect(diff).toEqual(0.20997431506849315);
    expect(maxDiff).toEqual(1);
  });
});

describe('when images are of different height', () => {
  beforeEach(async () => {
    image1 = (await Jimp.read('http://127.0.0.1:5411/button-before.png')).bitmap;
    image2 = (await Jimp.read('http://127.0.0.1:5411/button-after.png')).bitmap;
  });

  it('has a total diff and a max diff', async () => {
    const { diff, maxDiff } = await subject();
    expect(diff).toBeTruthy()
    expect(maxDiff).toBeTruthy();
  });
});
