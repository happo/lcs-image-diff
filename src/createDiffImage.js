const getDiffPixel = require('./getDiffPixel');
const DiffTrace = require('./DiffTrace');

const GREEN = [106, 133, 0, 255];
const MAGENTA = [197, 39, 114, 255];

function getDataIndex(row, width, index) {
  return (width * row) + index;
}

module.exports = function createDiffImage({ image1Data, image2Data }) {
  const width = image1Data[0].length;
  const height = image1Data.length;

  const data = new Uint8ClampedArray(width * height);
  const trace = new DiffTrace({ width, height });
  let totalDiff = 0;
  let maxDiff = 0;

  for (let row = 0; row < height; row += 1) {
    // Render image
    for (let index = 0; index < width; index += 4) {
      const { diff, pixel } = getDiffPixel(
        [
          image1Data[row][index],
          image1Data[row][index + 1],
          image1Data[row][index + 2],
          image1Data[row][index + 3],
        ],
        [
          image2Data[row][index],
          image2Data[row][index + 1],
          image2Data[row][index + 2],
          image2Data[row][index + 3],
        ],
      );

      totalDiff += diff;
      if (diff > maxDiff) {
        maxDiff = diff;
      }

      /* eslint-disable prefer-destructuring */
      if (diff > 0) {
        let diffColor = MAGENTA;
        if (image1Data[row][3] === 0 && image1Data[row][0] === 1) {
          // Pixel is transparent in previous image, which means that a row was
          // added here.
          diffColor = GREEN;
        }

        trace.diff({ row, index, color: diffColor });
      }

      const dataIndex = getDataIndex(row, width, index);
      data[dataIndex + 0] = pixel[0]; // r
      data[dataIndex + 1] = pixel[1]; // g
      data[dataIndex + 2] = pixel[2]; // b
      data[dataIndex + 3] = pixel[3]; // a
      /* eslint-enable prefer-destructuring */
    }
  }

  return {
    diff: totalDiff / (width * height),
    maxDiff,
    trace,
    data,
    width: width / 4,
    height,
  };
};
