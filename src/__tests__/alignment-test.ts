import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

import { describe, expect, it } from '@jest/globals';
import sharp from 'sharp';

import imageDiff from '../index.ts';
import computeAndInjectDiffs from '../computeAndInjectDiffs.ts';
import type { ImageInput, RowAlignment } from '../computeAndInjectDiffs.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadImage(name: string): Promise<ImageInput> {
  const image = sharp(path.resolve(__dirname, '../../static', name));
  const { width, height } = await image.metadata();
  return { data: await image.raw().toBuffer(), width, height };
}

/** A pair whose heights differ, so the alignment has real work to do. */
async function shiftedPair(): Promise<[ImageInput, ImageInput]> {
  const original = await loadImage('google-logo.png');
  const taller = await loadImage('google-logo.png');

  // Drop the first 20 rows of one side: the content is the same, moved.
  const rowBytes = original.width * 4;
  return [
    original,
    {
      data: (taller.data as Uint8Array).slice(20 * rowBytes),
      width: taller.width,
      height: taller.height - 20,
    },
  ];
}

function alignmentOf(runs: RowAlignment): string {
  return runs.map(([op, count]) => `${op}${count}`).join(' ');
}

describe('the reported alignment', () => {
  it('describes every row of both images', async () => {
    const [image1, image2] = await shiftedPair();
    const { alignment } = computeAndInjectDiffs({ image1, image2 });

    const rowsOfImage1 = alignment
      .filter(([op]) => op === 'm' || op === 'b')
      .reduce((sum, [, count]) => sum + count, 0);
    const rowsOfImage2 = alignment
      .filter(([op]) => op === 'm' || op === 'a')
      .reduce((sum, [, count]) => sum + count, 0);

    expect(rowsOfImage1).toBe(image1.height);
    expect(rowsOfImage2).toBe(image2.height);
  });

  it('is empty when the rows already correspond', async () => {
    const image1 = await loadImage('google-logo.png');
    const image2 = await loadImage('google-logo.png');

    // Same image both sides, so `similarEnough` short-circuits. Empty is the
    // answer "aligned, nothing to inject" -- not the absence of an answer.
    expect(computeAndInjectDiffs({ image1, image2 }).alignment).toEqual([]);
  });
});

describe('applying a stored alignment', () => {
  it('reconstructs byte-identical images without searching again', async () => {
    const [image1, image2] = await shiftedPair();

    const computed = computeAndInjectDiffs({ image1, image2 });
    const [fresh1, fresh2] = await shiftedPair();
    const applied = computeAndInjectDiffs({
      image1: fresh1,
      image2: fresh2,
      alignment: computed.alignment,
    });

    expect(applied.alignment).toEqual(computed.alignment);
    expect(applied.image1Data.length).toBe(computed.image1Data.length);
    for (let row = 0; row < computed.image1Data.length; row++) {
      expect(applied.image1Data[row]).toEqual(computed.image1Data[row]);
      expect(applied.image2Data[row]).toEqual(computed.image2Data[row]);
    }
    expect([...applied.image1InjectedRows]).toEqual([
      ...computed.image1InjectedRows,
    ]);
    expect([...applied.image2InjectedRows]).toEqual([
      ...computed.image2InjectedRows,
    ]);
  });

  it('produces the same diff image as computing it', async () => {
    const [image1, image2] = await shiftedPair();
    const computed = imageDiff(image1, image2);

    const [fresh1, fresh2] = await shiftedPair();
    const applied = imageDiff(fresh1, fresh2, {
      alignment: computed.alignment,
    });

    expect(applied.data).toEqual(computed.data);
    expect(applied.diff).toBe(computed.diff);
    expect(applied.maxDiff).toBe(computed.maxDiff);
  });

  it('refuses an operation it does not recognise', async () => {
    const [image1, image2] = await shiftedPair();

    expect(() =>
      computeAndInjectDiffs({
        image1,
        image2,
        alignment: [['x', 4]] as unknown as RowAlignment,
      }),
    ).toThrow(/Unknown alignment operation/);
  });

});

describe('the runs themselves', () => {
  it('reads as a shift rather than as wholesale change', async () => {
    const [image1, image2] = await shiftedPair();
    const { alignment } = computeAndInjectDiffs({ image1, image2 });

    // The whole point of aligning: content that moved should report a gap and
    // a long match, not every row differing.
    expect(alignmentOf(alignment)).toMatch(/^[bap]\d+ m\d+/);
  });
});

/**
 * An image made of runs of solid rows, as `[value, rowCount]`. Synthetic so the
 * alignment is predictable enough to aim a test at one branch of
 * `simplifySegments`.
 */
function rowsImage(runs: Array<[number, number]>): ImageInput {
  const width = 4;
  const rowBytes = width * 4;
  const height = runs.reduce((sum, [, count]) => sum + count, 0);
  const data = new Uint8ClampedArray(height * rowBytes);

  let row = 0;
  for (const [value, count] of runs) {
    for (let n = 0; n < count; n++, row++) {
      for (let i = 0; i < rowBytes; i += 4) {
        data[row * rowBytes + i] = value;
        data[row * rowBytes + i + 1] = value;
        data[row * rowBytes + i + 2] = value;
        data[row * rowBytes + i + 3] = 255;
      }
    }
  }

  return { data, width, height };
}

/** The first byte of each row, which `rowsImage` makes the row's identity. */
function rowValues(rows: Uint8ClampedArray[]): number[] {
  return rows.map(row => row[0]);
}

describe('an alignment that simplification rewrites', () => {
  // Two gaps in the same direction separated by ten matching rows. Ten is under
  // SIMPLIFY_THRESHOLD, so `simplifySegments` combines them -- emitting the
  // merged gap ahead of the match rows that sat between its halves, which puts
  // the output out of source order.
  const combining = (): [ImageInput, ImageInput] => [
    rowsImage([
      [10, 10],
      [200, 5],
      [20, 10],
      [210, 5],
      [30, 10],
    ]),
    rowsImage([
      [10, 10],
      [20, 10],
      [30, 10],
    ]),
  ];

  it('replays byte-identically', () => {
    const [image1, image2] = combining();
    const computed = computeAndInjectDiffs({ image1, image2 });

    const [fresh1, fresh2] = combining();
    const applied = computeAndInjectDiffs({
      image1: fresh1,
      image2: fresh2,
      alignment: computed.alignment,
    });

    // Counts alone described this wrongly while the runs were taken after
    // simplification: ten rows came back holding the wrong content.
    expect(rowValues(applied.image1Data)).toEqual(
      rowValues(computed.image1Data),
    );
    expect(rowValues(applied.image2Data)).toEqual(
      rowValues(computed.image2Data),
    );
  });

  it('reports both gaps rather than the combined one', () => {
    const [image1, image2] = combining();
    const { alignment } = computeAndInjectDiffs({ image1, image2 });

    // The runs describe the alignment before simplification, so each gap is
    // still its own entry and no two adjacent runs share an operation.
    expect(alignment).toEqual([
      ['m', 10],
      ['b', 5],
      ['m', 10],
      ['b', 5],
      ['m', 10],
    ]);
  });

  it('accounts for every row of both images', () => {
    const [image1, image2] = combining();
    const { alignment } = computeAndInjectDiffs({ image1, image2 });

    const rows1 = alignment
      .filter(([op]) => op === 'm' || op === 'b')
      .reduce((sum, [, count]) => sum + count, 0);
    const rows2 = alignment
      .filter(([op]) => op === 'm' || op === 'a')
      .reduce((sum, [, count]) => sum + count, 0);

    expect(rows1).toBe(image1.height);
    expect(rows2).toBe(image2.height);
  });
});

describe('an alignment that does not belong to these images', () => {
  it('is refused rather than reconstructed', () => {
    const image1 = rowsImage([[10, 20]]);
    const image2 = rowsImage([[20, 20]]);

    // Right shape and within the output bound, but it describes 30 rows of
    // each image where there are 20. Without the check the implied indices run
    // past the end of an image and undefined rows are read as content.
    expect(() =>
      computeAndInjectDiffs({
        image1,
        image2,
        alignment: [['m', 30]],
      }),
    ).toThrow(/belongs to a different pair of images/);
  });
});

describe('validating runs that came from storage', () => {
  it('refuses an operation inherited from Object.prototype', () => {
    const image1 = rowsImage([[10, 20]]);
    const image2 = rowsImage([[20, 20]]);

    // A plain-object lookup resolves 'toString' to a function rather than to
    // undefined, which slipped past the check and was treated as a match.
    expect(() =>
      computeAndInjectDiffs({
        image1,
        image2,
        alignment: [['toString', 20]] as unknown as RowAlignment,
      }),
    ).toThrow(/Unknown alignment operation/);
  });

  it.each([0, -4, 2.5, NaN])('refuses a length of %p', length => {
    const image1 = rowsImage([[10, 20]]);
    const image2 = rowsImage([[20, 20]]);

    expect(() =>
      computeAndInjectDiffs({
        image1,
        image2,
        alignment: [['m', length]],
      }),
    ).toThrow(/invalid length/);
  });
});

describe('runs that would be expensive to materialize', () => {
  it('rejects an enormous count without expanding it', () => {
    const image1 = rowsImage([[10, 20]]);
    const image2 = rowsImage([[20, 20]]);

    // Checked as arithmetic on the runs. Expanded into rows first, as it once
    // was, this allocates a trillion objects before anything can object to it.
    const started = Date.now();
    expect(() =>
      computeAndInjectDiffs({
        image1,
        image2,
        alignment: [['m', 1e12]],
      }),
    ).toThrow(/more than the 40 the two images can produce/);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('rejects an enormous padding run, which the row totals do not bound', () => {
    const image1 = rowsImage([[10, 20]]);
    const image2 = rowsImage([[20, 20]]);

    // `p` consumes from neither image, so it leaves the per-image totals
    // correct and is caught only by the bound on output rows.
    const started = Date.now();
    expect(() =>
      computeAndInjectDiffs({
        image1,
        image2,
        alignment: [
          ['m', 20],
          ['p', 1e12],
        ],
      }),
    ).toThrow(/output rows/);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('the identity alignment', () => {
  it('is refused when the images are different heights', () => {
    // `[]` says the rows already correspond, which cannot be true here. Left
    // unchecked the two arrays come back unequal in length and the caller reads
    // undefined rows off the end of the shorter one.
    expect(() =>
      computeAndInjectDiffs({
        image1: rowsImage([[10, 20]]),
        image2: rowsImage([[20, 30]]),
        alignment: [],
      }),
    ).toThrow(/rows correspond one to one/);
  });

  it('leaves equal-height images untouched', () => {
    const { image1Data, image2Data, image1InjectedRows } =
      computeAndInjectDiffs({
        image1: rowsImage([[10, 20]]),
        image2: rowsImage([[20, 20]]),
        alignment: [],
      });

    expect(image1Data.length).toBe(20);
    expect(image2Data.length).toBe(20);
    expect(image1InjectedRows.size).toBe(0);
  });

  it('survives a round trip through imageDiff', () => {
    // Equal heights are not enough on their own: `similarEnough` also wants
    // most rows to match, so these differ in 2 rows of 20 rather than in all
    // of them.
    const mostlyMatching = (): [ImageInput, ImageInput] => [
      rowsImage([
        [10, 18],
        [99, 2],
      ]),
      rowsImage([
        [10, 18],
        [88, 2],
      ]),
    ];

    const [image1, image2] = mostlyMatching();
    const computed = imageDiff(image1, image2);
    expect(computed.alignment).toEqual([]);

    const [fresh1, fresh2] = mostlyMatching();
    expect(
      imageDiff(fresh1, fresh2, { alignment: computed.alignment }).data,
    ).toEqual(computed.data);
  });
});
