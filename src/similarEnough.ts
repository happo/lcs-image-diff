import { FILLER } from './flatRows.ts';

const ALLOWED_INEQUALITY = 0.3;

/**
 * Whether two rows are the same once both are padded out to one width.
 *
 * The narrower of two images is held unpadded, so its rows can be shorter than
 * the other image's. They compare as if padded with `FILLER`: the bytes both
 * rows hold must match, and whatever only the longer one holds must be filler.
 */
function rowsMatch(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  const shared = Math.min(a.length, b.length);
  for (let j = 0; j < shared; j++) {
    if (a[j] !== b[j]) {
      return false;
    }
  }
  const longer = a.length > b.length ? a : b;
  for (let j = shared; j < longer.length; j++) {
    if (longer[j] !== FILLER) {
      return false;
    }
  }
  return true;
}

export default function similarEnough({
  image1Data,
  image2Data,
}: {
  image1Data: ArrayLike<number>[];
  image2Data: ArrayLike<number>[];
}): boolean {
  const { length } = image1Data;
  if (length !== image2Data.length) {
    return false;
  }
  const allowedInequalRows = length * ALLOWED_INEQUALITY;
  let inequalRows = 0;
  for (let i = 0; i < length; i++) {
    if (!rowsMatch(image1Data[i], image2Data[i])) {
      inequalRows++;
      if (inequalRows > allowedInequalRows) {
        return false;
      }
    }
  }
  return true;
}
