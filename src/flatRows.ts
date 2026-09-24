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

/** What rows narrower than their image are padded out with, in every byte. */
export const FILLER = 1;

/** Whether `rows` are consecutive, equally sized views filling one buffer. */
function isContiguous(
  rows: Uint8ClampedArray[],
  rowBytes = rows[0]?.byteLength,
): boolean {
  if (rows.length === 0) {
    return false;
  }
  const { buffer, byteOffset } = rows[0];
  if (
    rows[0].byteLength !== rowBytes ||
    buffer.byteLength !== rowBytes * rows.length ||
    byteOffset !== 0
  ) {
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
 * or `rows` itself when they already are and that buffer is not `borrowed`.
 *
 * `borrowed` is a buffer the rows may view but must not be handed out on:
 * the caller's own pixels, which `computeAndInjectDiffs` reads in place
 * rather than copying, and which a caller writing into the result would
 * otherwise overwrite.
 *
 * Each row comes out `rowBytes` long, which defaults to the first row's
 * length. A row shorter than that is padded on the right with `FILLER`: the
 * narrower of two images is aligned from rows that view the caller's pixels
 * as they are, and this is where its padding is first written. No row may be
 * longer. The buffer starts at offset 0, so it is word-aligned and
 * `asPixelWords` can view it without copying.
 */
export function packRows(
  rows: Uint8ClampedArray[],
  borrowed?: ArrayBufferLike,
  rowBytes = rows[0]?.length,
): Uint8ClampedArray[] {
  if (
    rows.length === 0 ||
    (isContiguous(rows, rowBytes) && rows[0].buffer !== borrowed)
  ) {
    return rows;
  }
  const flat = new Uint8ClampedArray(rowBytes * rows.length);
  return rows.map((row, i) => {
    const start = i * rowBytes;
    flat.set(row, start);
    if (row.length < rowBytes) {
      flat.fill(FILLER, start + row.length, start + rowBytes);
    }
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
