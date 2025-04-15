const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const sharp = require('sharp');

const imageDiff = require('../');

function hashFunction(data) {
  return crypto.createHash('md5').update(data).digest('hex');
}

const snapshots = childProcess
  .execSync('ls snapshots', { encoding: 'utf-8' })
  .split(/\n/)
  .filter(Boolean);

jest.setTimeout(60000);

describe('snapshot tests', () => {
  snapshots.forEach(snapshot => {
    it(snapshot, async () => {
      const pathToBefore = path.resolve('snapshots', snapshot, 'before.png');
      const pathToAfter = path.resolve('snapshots', snapshot, 'after.png');

      console.log('Starting', snapshot, pathToBefore, pathToAfter);

      const image1Sharp = sharp(pathToBefore);
      const image2Sharp = sharp(pathToAfter);

      const [image1Metadata, image2Metadata] = await Promise.all([
        image1Sharp.metadata(),
        image2Sharp.metadata(),
      ]);

      const [image1, image2] = await Promise.all([
        image1Sharp.raw().toBuffer(),
        image2Sharp.raw().toBuffer(),
      ]);

      console.log('Images ready', snapshot);

      const diffImage = imageDiff(
        {
          data: image1,
          width: image1Metadata.width,
          height: image1Metadata.height,
        },
        {
          data: image2,
          width: image2Metadata.width,
          height: image2Metadata.height,
        },
        {
          hashFunction,
        },
      );

      console.log('Created diff image', snapshot);
      const pathToDiff = path.resolve('snapshots', snapshot, 'diff.png');

      // To update diff images when making changes, delete the existing diff.png
      // files and run this test again.
      //
      // find snapshots -name diff.png | xargs rm
      if (!fs.existsSync(pathToDiff)) {
        console.log(
          `No previous diff image for ${snapshot} found -- saving diff.png.`,
        );
        await sharp(diffImage.data, {
          raw: {
            width: diffImage.width,
            height: diffImage.height,
            channels: 4,
          },
        }).toFile(pathToDiff);
      }

      const expectedDiffImage = await sharp(pathToDiff).raw().toBuffer();
      const diffHash = hashFunction(diffImage.data);
      const expectedHash = hashFunction(expectedDiffImage);

      if (diffHash !== expectedHash) {
        console.log(
          `Diff image did not match existing diff image. Remove this image and run again to re-generate:\n${pathToDiff}`,
        );
      }
      expect(diffHash).toEqual(expectedHash);
    });
  });
});
