import compose from './compose.ts';
import type { ColorLike, Rgba } from './compose.ts';
import { colorDeltaChannels } from './colorDelta.ts';

const TRANSPARENT: Rgba = [0, 0, 0, 0];

/**
 * How much of the change colour tints a pixel that differs but does not count
 * as a change (below the threshold, or anti-aliasing). Enough to see where the
 * images differ, little enough that the pixels that do count stand out.
 */
const UNCOUNTED_TINT: Rgba = [179, 54, 130, 64];

export interface DiffPixel {
  diff: number;
  pixel: ColorLike;
}

/**
 * Write the diff image's pixel for one pair of pixels into `out` at `i`, for
 * a pixel that is either unchanged (`diff` 0) or counts as a change.
 *
 * Writes rather than returns so the diff loop allocates nothing per pixel.
 * A tall page is tens of millions of pixels, and an array or two for each
 * kept the garbage collector busy enough to dominate the whole diff. Each
 * branch is what `compose` returns over a transparent background, which is
 * the foreground unchanged.
 */
export function writeDiffPixel(
  out: Uint8ClampedArray | number[],
  i: number,
  diff: number,
  r2: number,
  g2: number,
  b2: number,
  a2: number,
): void {
  if (diff === 0) {
    if (a2 === 0) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      return;
    }
    out[i] = r2;
    out[i + 1] = g2;
    out[i + 2] = b2;
    out[i + 3] = 140;
    return;
  }
  out[i] = 179;
  out[i + 1] = 54;
  out[i + 2] = 130;
  out[i + 3] = 255 * Math.max(0.2, diff);
}

export default function getDiffPixel(
  r1: number,
  g1: number,
  b1: number,
  a1: number,
  r2: number,
  g2: number,
  b2: number,
  a2: number,
): DiffPixel {
  // Compute a score that represents the difference between 2 pixels
  const diff = Math.abs(colorDeltaChannels(r1, g1, b1, a1, r2, g2, b2, a2));
  const pixel: number[] = [0, 0, 0, 0];
  writeDiffPixel(pixel, 0, diff, r2, g2, b2, a2);
  return { diff, pixel };
}

/**
 * A pixel that differs between the images but does not count as a change:
 * drawn the way an unchanged pixel is, with a faint tint of the change colour
 * over it.
 */
export function getUncountedDiffPixel(
  r2: number,
  g2: number,
  b2: number,
  a2: number,
): ColorLike {
  return compose(
    UNCOUNTED_TINT,
    a2 === 0 ? TRANSPARENT : [r2, g2, b2, 140],
  );
}
