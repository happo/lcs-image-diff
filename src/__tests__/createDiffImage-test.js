const path = require('path');
const sharp = require('sharp');

const computeAndInjectDiffs = require('../computeAndInjectDiffs');
const createDiffImage = require('../createDiffImage');

let image1;
let image2;
let subject;

beforeEach(async () => {
  const image1Sharp = sharp(
    path.resolve(__dirname, 'test-images/aa-ffffff.png'),
  );
  const image2Sharp = sharp(
    path.resolve(__dirname, 'test-images/aa-f7f7f7.png'),
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
  expect(diff).toEqual(0.000008817411988770792);
  expect(maxDiff).toEqual(0.0009424140621439462);
});

describe('when images are of different width', () => {
  beforeEach(async () => {
    const image1Sharp = sharp(
      path.resolve(__dirname, 'test-images/alert-before.png'),
    );
    const image2Sharp = sharp(
      path.resolve(__dirname, 'test-images/alert-after.png'),
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
  });

  it('has a total diff and a max diff', async () => {
    const { diff, maxDiff } = await subject();
    expect(diff).toEqual(0.20997431506849315);
    expect(maxDiff).toEqual(1);
  });
});

describe('when images are of different height', () => {
  beforeEach(async () => {
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
  });

  it('has a total diff and a max diff', async () => {
    const { diff, maxDiff } = await subject();
    expect(diff).toBeTruthy();
    expect(maxDiff).toBeTruthy();
  });
});
