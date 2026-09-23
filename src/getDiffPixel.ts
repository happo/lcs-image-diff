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
  if (diff === 0) {
    if (a2 === 0) {
      return {
        diff,
        pixel: TRANSPARENT,
      };
    }
    return {
      diff,
      pixel: compose([r2, g2, b2, 140], TRANSPARENT),
    };
  }

  return {
    diff,
    pixel: compose([179, 54, 130, 255 * Math.max(0.2, diff)], TRANSPARENT),
  };
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
