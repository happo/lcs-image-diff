import { describe, expect, it } from '@jest/globals';

import { asPixelWords } from '../antialiasing.ts';
import computeAndInjectDiffs from '../computeAndInjectDiffs.ts';
import { flatPixels, packRows } from '../flatRows.ts';

function solidImage(width: number, height: number, value: number) {
  return {
    data: new Uint8ClampedArray(width * height * 4).fill(value),
    width,
    height,
  };
}

// Stripes that differ row by row, so the alignment has something to anchor on
// and inserts rows where one image is taller.
function stripes(width: number, height: number, offset = 0) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    data.fill((y + offset) * 7 % 256, y * width * 4, (y + 1) * width * 4);
    for (let x = 0; x < width; x++) {
      data[(y * width + x) * 4 + 3] = 255;
    }
  }
  return { data, width, height };
}

function expectContiguous(rows: Uint8ClampedArray[]) {
  const rowBytes = rows[0].byteLength;
  const { buffer } = rows[0];
  expect(rows[0].byteOffset % 4).toBe(0);
  expect(buffer.byteLength).toBe(rowBytes * rows.length);
  rows.forEach((row, i) => {
    expect(row.buffer).toBe(buffer);
    expect(row.byteOffset).toBe(rows[0].byteOffset + i * rowBytes);
  });
}

describe('packRows', () => {
  it('leaves rows that are already one buffer alone', () => {
    const flat = new Uint8ClampedArray(24);
    const rows = [flat.subarray(0, 8), flat.subarray(8, 16), flat.subarray(16)];
    expect(packRows(rows)).toBe(rows);
  });

  it('copies scattered rows into one buffer, in order', () => {
    const rows = [
      new Uint8ClampedArray([1, 2, 3, 4]),
      new Uint8ClampedArray([5, 6, 7, 8]),
    ];
    const packed = packRows(rows);
    expectContiguous(packed);
    expect(packed.map(row => Array.from(row))).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
  });
});

describe('flatPixels', () => {
  it('views contiguous rows without copying them', () => {
    const flat = new Uint8ClampedArray(16);
    const rows = [flat.subarray(0, 8), flat.subarray(8)];
    const pixels = flatPixels(rows);
    expect(pixels.buffer).toBe(flat.buffer);
    expect(asPixelWords(pixels).buffer).toBe(flat.buffer);
  });

  it('copies rows that are not contiguous', () => {
    const rows = [
      new Uint8ClampedArray([1, 2, 3, 4]),
      new Uint8ClampedArray([5, 6, 7, 8]),
    ];
    expect(Array.from(flatPixels(rows))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('computeAndInjectDiffs', () => {
  it('returns each image as views of one buffer when nothing moves', () => {
    const { image1Data, image2Data } = computeAndInjectDiffs({
      image1: solidImage(4, 6, 255),
      image2: solidImage(4, 6, 250),
    });
    expectContiguous(image1Data);
    expectContiguous(image2Data);
  });

  it('returns each image as views of one buffer after injecting rows', () => {
    const { image1Data, image2Data, image1InjectedRows } =
      computeAndInjectDiffs({
        image1: stripes(4, 30),
        image2: stripes(4, 36, 0),
      });
    expect(image1InjectedRows.size).toBeGreaterThan(0);
    expectContiguous(image1Data);
    expectContiguous(image2Data);
  });

  it('returns each image as views of one buffer when widths differ', () => {
    const { image1Data, image2Data } = computeAndInjectDiffs({
      image1: stripes(3, 10),
      image2: stripes(5, 12),
    });
    expectContiguous(image1Data);
    expectContiguous(image2Data);
  });
});

describe('createDiffImage with ignoreAntialiasing', () => {
  it('draws the same diff from shared rows as from separate copies', async () => {
    const { default: createDiffImage } = await import('../createDiffImage.ts');
    const aligned = computeAndInjectDiffs({
      image1: stripes(6, 30),
      image2: stripes(6, 36, 3),
    });
    const copies = {
      image1Data: aligned.image1Data.map(row => row.slice()),
      image2Data: aligned.image2Data.map(row => row.slice()),
    };

    const shared = createDiffImage({ ...aligned, ignoreAntialiasing: true });
    const copied = createDiffImage({ ...copies, ignoreAntialiasing: true });

    expect(shared.data).toEqual(copied.data);
    expect(shared.trace.data).toEqual(copied.trace.data);
  });
});
