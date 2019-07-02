const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const Jimp = require('jimp');

const imageDiff = require('../');

function hashFunction(data) {
  return crypto
    .createHash('md5')
    .update(data)
    .digest('hex');
}

const snapshots = childProcess
  .execSync('ls snapshots', { encoding: 'utf-8' })
  .split(/\n/)
  .filter(Boolean);

jest.setTimeout(60000);

describe('snapshot tests', () => {
  snapshots.forEach(snapshot => {
    it(snapshot, async () => {
      console.log('Starting', snapshot);
      const [image1, image2] = await Promise.all([
        Jimp.read(path.resolve('snapshots', snapshot, 'before.png')),
        Jimp.read(path.resolve('snapshots', snapshot, 'after.png')),
      ]);
      console.log('Images ready', snapshot);
      const diffImage = imageDiff(image1.bitmap, image2.bitmap, {
        hashFunction,
      });

      console.log('Created diff image', snapshot);
      const pathToDiff = path.resolve('snapshots', snapshot, 'diff.png');

      if (!fs.existsSync(pathToDiff)) {
        console.log(
          `No previous diff image for ${snapshot} found -- saving diff.png.`,
        );
        const newDiffImage = await new Jimp(diffImage);
        await newDiffImage.write(pathToDiff);
      }
      const expectedDiffImage = (await Jimp.read(pathToDiff)).bitmap;
      const diffHash = hashFunction(diffImage.data);
      const expectedHash = hashFunction(expectedDiffImage.data);
      if (diffHash !== expectedHash) {
        console.log(
          `Diff image did not match existing diff image. Remove this image and run again to re-generate:\n${pathToDiff}`,
        );
      }
      expect(diffHash).toEqual(expectedHash);
    });
  });
});
