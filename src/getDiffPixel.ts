import compose from './compose.ts';
import type { ColorLike, Rgba } from './compose.ts';
import { colorDeltaChannels } from './colorDelta.ts';

const TRANSPARENT: Rgba = [0, 0, 0, 0];

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
