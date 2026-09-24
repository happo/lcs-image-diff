/**
 * Rows held as views of one buffer, so a whole image can be read flat without
 * copying it.
 *
 * `computeAndInjectDiffs` works row by row, but the anti-aliasing check reads
 * a pixel's neighbours on the rows above and below and so wants the image
 * flat. When the rows are consecutive views of one buffer, that buffer *is*
 * the flat image, and the check reads it where it is rather than holding a
 * second full-size copy of each image while it runs.
 */

/** Whether `rows` are consecutive, equally sized views filling one buffer. */
function isContiguous(rows: Uint8ClampedArray[]): boolean {
  if (rows.length === 0) {
    return false;
  }
  const { buffer, byteOffset, byteLength: rowBytes } = rows[0];
  if (buffer.byteLength !== rowBytes * rows.length || byteOffset !== 0) {
    return false;
  }
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (
      row.buffer !== buffer ||
      row.byteLength !== rowBytes ||
      row.byteOffset !== i * rowBytes
    ) {
      return false;
    }
  }
  return true;
}

/**
 * The same rows, as consecutive views of one freshly allocated buffer --
 * or `rows` itself when they already are.
 *
 * All rows must be the same length. The buffer starts at offset 0, so it is
 * word-aligned and `asPixelWords` can view it without copying.
 */
export function packRows(rows: Uint8ClampedArray[]): Uint8ClampedArray[] {
  if (rows.length === 0 || isContiguous(rows)) {
    return rows;
  }
  const rowBytes = rows[0].length;
  const flat = new Uint8ClampedArray(rowBytes * rows.length);
  return rows.map((row, i) => {
    const start = i * rowBytes;
    flat.set(row, start);
    return flat.subarray(start, start + rowBytes);
  });
}

/**
 * The rows as one flat buffer: a view of the one they already share when they
 * are contiguous (see `packRows`), otherwise a copy.
 */
export function flatPixels(rows: Uint8ClampedArray[]): Uint8ClampedArray {
  if (isContiguous(rows)) {
    const { buffer } = rows[0];
    return new Uint8ClampedArray(buffer, 0, buffer.byteLength);
  }
  const rowBytes = rows[0]?.length ?? 0;
  const flat = new Uint8ClampedArray(rowBytes * rows.length);
  rows.forEach((row, i) => flat.set(row, i * rowBytes));
  return flat;
}
