'use strict';

/**
 * Verifies that the band-based alignment keeps the diff score low when one
 * image has an extra block of whitespace that shifts content vertically.
 *
 * The test builds two synthetic images that are identical except for a 32 px
 * (= 8 × BAND_SIZE) white gap inserted after the first third of the content in
 * the "after" image. After alignment the non-gap content should be matched
 * almost perfectly, so the overall diff should remain small.
 */

const crypto = require('crypto');
const imageDiff = require('../');

function hashFunction(data) {
  return crypto.createHash('md5').update(data).digest('hex');
}

const WIDTH    = 200;
const STRIPE_H = 8;   // height of each coloured stripe (> BAND_SIZE so bands stay uniform)
const STRIPES  = 30;  // number of stripes in the base image
const GAP_H    = 32;  // extra whitespace in the "after" image (multiple of BAND_SIZE=4)

/**
 * Build a raw RGBA buffer containing alternating coloured horizontal stripes.
 * An optional extra white block of `gapAfterStripe` height is inserted after
 * stripe number `gapPosition` to simulate a margin / padding change.
 */
function buildStripeImage(gapPosition = -1, gapHeight = 0) {
  const rows = [];
  const WHITE = [245, 245, 245, 255];

  // Stripe colours – use easily distinguishable hues so neighbouring bands
  // never accidentally produce the same hash.
  const palette = [
    [220,  80,  80, 255],
    [ 80, 180,  80, 255],
    [ 80,  80, 220, 255],
    [200, 160,  40, 255],
    [ 40, 180, 180, 255],
    [180,  40, 180, 255],
  ];

  for (let s = 0; s < STRIPES; s++) {
    const [r, g, b, a] = palette[s % palette.length];
    for (let row = 0; row < STRIPE_H; row++) {
      const buf = new Uint8ClampedArray(WIDTH * 4);
      for (let px = 0; px < WIDTH; px++) {
        buf[px * 4]     = r;
        buf[px * 4 + 1] = g;
        buf[px * 4 + 2] = b;
        buf[px * 4 + 3] = a;
      }
      rows.push(buf);
    }

    if (s === gapPosition && gapHeight > 0) {
      for (let row = 0; row < gapHeight; row++) {
        const buf = new Uint8ClampedArray(WIDTH * 4);
        for (let px = 0; px < WIDTH; px++) {
          buf[px * 4]     = WHITE[0];
          buf[px * 4 + 1] = WHITE[1];
          buf[px * 4 + 2] = WHITE[2];
          buf[px * 4 + 3] = WHITE[3];
        }
        rows.push(buf);
      }
    }
  }

  const height = rows.length;
  const data = new Uint8ClampedArray(WIDTH * height * 4);
  for (let r = 0; r < rows.length; r++) {
    data.set(rows[r], r * WIDTH * 4);
  }
  return { data, width: WIDTH, height };
}

describe('whitespace-shift alignment', () => {
  it('keeps diff low when content is shifted by a block of whitespace', () => {
    const SPLIT_AT = Math.floor(STRIPES / 3); // insert gap after the first third

    const before = buildStripeImage();                       // no gap
    const after  = buildStripeImage(SPLIT_AT, GAP_H);       // 32 px gap after stripe SPLIT_AT

    const result = imageDiff(before, after, { hashFunction });

    // The extra whitespace is ~32/(STRIPES*STRIPE_H+GAP_H) of the total content.
    // With band-based alignment the stripes below the gap re-align correctly,
    // so the diff should be small – well under 10 % of the image.
    expect(result.diff).toBeLessThan(0.10);
  });

  it('still detects real pixel-level changes within aligned rows', () => {
    // An all-white image vs an all-black image of the same size — maximum
    // possible perceptual difference on every pixel, no alignment can hide it.
    const height = STRIPES * STRIPE_H;
    const white = new Uint8ClampedArray(WIDTH * height * 4).fill(255);
    const black = new Uint8ClampedArray(WIDTH * height * 4);
    for (let i = 3; i < black.length; i += 4) black[i] = 255; // alpha = 255

    const before = { data: white, width: WIDTH, height };
    const after  = { data: black, width: WIDTH, height };

    const result = imageDiff(before, after, { hashFunction });
    // diff is normalised by byteWidth*height (not pixelWidth*height), so the
    // practical maximum for a fully-different image is ~0.23. Anything above
    // 0.20 unambiguously indicates significant pixel-level differences.
    expect(result.diff).toBeGreaterThan(0.20);
  });
});
