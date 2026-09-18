import imagetracer from 'imagetracerjs';

import type { Rgba } from './compose.js';
import { DIFF_TRACE_PADDING } from './constants.js';

const { imagedataToSVG } = imagetracer;

const BLEED = 1;

function getDataIndex(row: number, width: number, index: number): number {
  return (width * row) + index;
}

export default class DiffTrace {
  readonly width: number;

  readonly height: number;

  readonly data: Uint8ClampedArray;

  constructor({ width, height }: { width: number; height: number }) {
    this.width = width + (DIFF_TRACE_PADDING * 2 * 4);
    this.height = height + (DIFF_TRACE_PADDING * 2);
    this.data = new Uint8ClampedArray(this.width * this.height);
  }

  diff({
    row,
    index,
    color,
  }: {
    row: number;
    index: number;
    color: Rgba;
  }): void {
    const dRow = row + DIFF_TRACE_PADDING;
    const dIndex = index + (DIFF_TRACE_PADDING * 4);
    for (
      let dr = Math.max(0, dRow - BLEED);
      dr < Math.min(dRow + BLEED + 1, this.height);
      dr += 1
    ) {
      for (
        let di = Math.max(dIndex - BLEED * 4, 0);
        di < Math.min(dIndex + (BLEED * 4) + 1, this.width);
        di += 4
      ) {
        const diffIndex = getDataIndex(dr, this.width, di);
        this.data[diffIndex + 0] = color[0]; // r
        this.data[diffIndex + 1] = color[1]; // g
        this.data[diffIndex + 2] = color[2]; // b
        this.data[diffIndex + 3] = color[3]; // a
      }
    }
  }

  toSVG(): string {
    return imagedataToSVG({
      data: this.data,
      height: this.height,
      width: this.width / 4,
    }, {
      numberofcolors: 3,
      colorsampling: 0,
      qtres: 0,
      ltres: 0,
      roundcoords: -1,
      viewbox: true,
      pathomit: 0,
      strokewidth: 1.5,
    });
  }
}
