/**
 * Anti-aliasing detection, shared with happo-compare.
 *
 * happo-compare decides which pixels of a pair changed, and a viewer draws
 * them. Both have to use the same rule or the viewer highlights pixels the
 * comparison decided were not a change -- so the rule lives here, and
 * happo-compare imports it rather than keeping its own copy.
 *
 * Everything here reads RGBA pixels, four bytes to the pixel.
 */

/** Width and height of a pixel buffer, in pixels. */
export interface PixelSize {
  width: number;
  height: number;
}

/** Anything RGBA bytes can be read out of by index. */
export type PixelBytes = Uint8Array | Uint8ClampedArray;

const CHANNELS = 4;

/**
 * View an RGBA pixel buffer one 32-bit word to the pixel.
 *
 * Comparing whole pixels as integers is what makes `hasManySiblings` cheap.
 * Both reads go through the same view, so the platform's byte order cancels
 * out and equality means exactly what the four byte comparisons meant.
 *
 * A typed-array view has to start on a 4-byte boundary. A buffer that does
 * not (a Node `Buffer` carved from the shared pool, say) is copied rather than
 * allowed to throw from inside the pixel walk.
 */
export function asPixelWords(img: PixelBytes): Uint32Array {
  const aligned =
    img.byteOffset % Uint32Array.BYTES_PER_ELEMENT === 0
      ? img
      : new Uint8Array(img);

  return new Uint32Array(
    aligned.buffer,
    aligned.byteOffset,
    aligned.length / CHANNELS,
  );
}

/**
 * Check if a pixel has 3+ adjacent pixels of the same color.
 *
 * Modified from https://github.com/mapbox/pixelmatch/blob/cc5cfed9/index.js
 *
 * `words` holds one 32-bit word per RGBA pixel.
 */
export function hasManySiblings(
  words: Uint32Array,
  x1: number,
  y1: number,
  size: PixelSize,
): boolean {
  const { width, height } = size;

  const pos = y1 * width + x1;
  const val = words[pos];

  // Away from the edges all 8 neighbours exist, so they can be counted without
  // any bounds checks or loop bookkeeping. This is the overwhelmingly common
  // case, and the branch that skips the center pixel disappears with it.
  if (x1 > 0 && x1 < width - 1 && y1 > 0 && y1 < height - 1) {
    return (
      +(val === words[pos - width - 1]) +
        +(val === words[pos - width]) +
        +(val === words[pos - width + 1]) +
        +(val === words[pos - 1]) +
        +(val === words[pos + 1]) +
        +(val === words[pos + width - 1]) +
        +(val === words[pos + width]) +
        +(val === words[pos + width + 1]) >
      2
    );
  }

  const x0 = x1 > 0 ? x1 - 1 : 0;
  const y0 = y1 > 0 ? y1 - 1 : 0;
  const x2 = x1 < width - 1 ? x1 + 1 : width - 1;
  const y2 = y1 < height - 1 ? y1 + 1 : height - 1;

  // On an edge a missing neighbour counts as an equal one, which is what keeps
  // a border pixel from looking like a lone intensity spike.
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;

  // go through 8 adjacent pixels
  for (let x = x0; x <= x2; x++) {
    let pos2 = y0 * width + x;

    for (let y = y0; y <= y2; y++, pos2 += width) {
      if (x === x1 && y === y1) {
        // Skip the current pixel
        continue;
      }

      zeroes += +(val === words[pos2]);

      if (zeroes > 2) {
        return true;
      }
    }
  }

  return false;
}

/** Rec. 601 luma weights, the same ones the YIQ transform in colorDelta uses. */
const R_TO_Y = 0.29889531;
const G_TO_Y = 0.58662247;
const B_TO_Y = 0.11448223;

/**
 * Signed brightness delta between a pixel and one of its neighbours.
 *
 * The anti-aliasing detector is looking for an intensity ramp, so it wants
 * brightness alone -- not `colorDeltaChannels`, which answers a different
 * question: a full YIQ colour distance, normalized, carrying the ramp
 * direction only in its sign. Ordering neighbours by that picks the
 * "brightest" by overall colour distance, so a neighbour that is barely
 * lighter but very differently coloured wins over one that is plainly
 * brighter. It also treats the (1,1,1,1) filler pixel as maximally different,
 * which is meaningful when comparing the two images but not when comparing a
 * pixel to its own neighbour.
 *
 * Semi-transparent pixels are composited over white, matching the blend
 * `colorDeltaChannels` does. When the composited brightness cancels out
 * exactly but alpha does not, the alpha difference carries the ramp
 * direction, so only pixels equal in both count as equal siblings.
 *
 * Modified from https://github.com/mapbox/pixelmatch/blob/c6fee35a/index.js
 *
 * `m` is the offset of the neighbour pixel; the r/g/b/a arguments are the
 * center pixel, already read by the caller.
 */
function brightnessDelta(
  img: PixelBytes,
  m: number,
  r1: number,
  g1: number,
  b1: number,
  a1: number,
): number {
  const r2 = img[m];
  const g2 = img[m + 1];
  const b2 = img[m + 2];
  const a2 = img[m + 3];

  let dr = r1 - r2;
  let dg = g1 - g2;
  let db = b1 - b2;
  const da = a1 - a2;

  if (!dr && !dg && !db && !da) {
    return 0;
  }

  if (a1 < 255 || a2 < 255) {
    // Premultiply both against white and take the difference in one step.
    dr = (r1 * a1 - r2 * a2 - 255 * da) / 255;
    dg = (g1 * a1 - g2 * a2 - 255 * da) / 255;
    db = (b1 * a1 - b2 * a2 - 255 * da) / 255;

    const d = dr * R_TO_Y + dg * G_TO_Y + db * B_TO_Y;

    return d === 0 && da ? da / 2 : d;
  }

  return dr * R_TO_Y + dg * G_TO_Y + db * B_TO_Y;
}

/**
 * Check if a pixel is likely a part of anti-aliasing
 *
 * Based on "Anti-aliased Pixel and Intensity Slope Detector" paper by V.
 * Vysniauskas, 2009
 *
 * Modified from https://github.com/mapbox/pixelmatch/blob/cce03e19/index.js
 *
 * `img` is the image the pixel is checked in, `words` the same image one word
 * per pixel (see `asPixelWords`), and `otherWords` the image it is being
 * compared against. A pixel is only anti-aliasing when the ramp it sits on is
 * anchored by solid colour in *both* images.
 */
export function isAntialiased(
  img: PixelBytes,
  x1: number,
  y1: number,
  size: PixelSize,
  otherSize: PixelSize,
  words: Uint32Array,
  otherWords: Uint32Array,
): boolean {
  const { width, height } = size;
  const pos = (y1 * width + x1) * CHANNELS;

  const x0 = Math.max(x1 - 1, 0);
  const y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);

  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;

  let min = 0;
  let max = 0;
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;

  // Read the center pixel once rather than on every neighbour comparison.
  const cr = img[pos];
  const cg = img[pos + 1];
  const cb = img[pos + 2];
  const ca = img[pos + 3];

  // go through 8 adjacent pixels
  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) {
        // Skip the current pixel
        continue;
      }

      // brightness delta between the center pixel and adjacent one
      const pos2 = (y * width + x) * CHANNELS;
      const delta = brightnessDelta(img, pos2, cr, cg, cb, ca);

      // count the number of equal, darker and brighter adjacent pixels
      if (delta === 0) {
        zeroes++;

        // if found more than 2 equal siblings, it's definitely not
        // anti-aliasing
        if (zeroes > 2) {
          return false;
        }
      } else if (delta < min) {
        // remember the darkest pixel
        min = delta;
        minX = x;
        minY = y;
      } else if (delta > max) {
        // remember the brightest pixel
        max = delta;
        maxX = x;
        maxY = y;
      }
    }
  }

  // if there are no both darker and brighter pixels among siblings, it's not
  // anti-aliasing
  if (min === 0 || max === 0) {
    return false;
  }

  // if either the darkest or the brightest pixel has 3+ equal siblings in both
  // images (definitely not anti-aliased), this pixel is anti-aliased
  return (
    (hasManySiblings(words, minX, minY, size) &&
      hasManySiblings(otherWords, minX, minY, otherSize)) ||
    (hasManySiblings(words, maxX, maxY, size) &&
      hasManySiblings(otherWords, maxX, maxY, otherSize))
  );
}
