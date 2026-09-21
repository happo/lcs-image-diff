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

  it('skips the work when the alignment is empty', async () => {
    const [image1, image2] = await shiftedPair();

    // An empty alignment says the rows correspond, so nothing is injected --
    // even here, where computing one would have injected plenty.
    const { image1InjectedRows, image2InjectedRows } = computeAndInjectDiffs({
      image1,
      image2,
      alignment: [],
    });

    expect(image1InjectedRows.size).toBe(0);
    expect(image2InjectedRows.size).toBe(0);
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
