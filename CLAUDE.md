# lcs-image-diff

A JavaScript library that compares two images and generates a visual diff using the **Longest-Common-Subsequence (LCS) algorithm** to align rows before diffing. This prevents inflated diffs when content has shifted vertically. Works in both browser and Node.js.

## Project Structure

```
src/
  index.js                  # Main export: imageDiff()
  alignArrays.js            # Band-limited LCS dynamic programming
  computeAndInjectDiffs.js  # Row hashing, alignment, gap injection
  createDiffImage.js        # Renders the final diff image + DiffTrace
  getDiffPixel.js           # Per-pixel diff computation
  colorDelta.js             # YIQ perceptual color difference
  compose.js                # Alpha blending (integer math)
  DiffTrace.js              # SVG outline generation via imagetracerjs
  similarEnough.js          # Early-exit: skip LCS if >70% similar
  constants.js              # DIFF_TRACE_PADDING
  __tests__/                # Jest unit + snapshot tests
snapshots/                  # Visual regression baselines (before/after/diff.png)
static/                     # Test fixture images
server.js                   # Dev server for viewing diffs (port 3456)
```

## Commands

```bash
pnpm test                                          # Run all tests
pnpm test <test_file_name>                         # Run a single test file
pnpm test -t <matching_string> <test_file_name>    # Run a single describe/test block
pnpm run serve                                     # Dev server at http://localhost:3456
```

## Module System

ESM (`"type": "module"` in package.json). Tests require `NODE_OPTIONS=--experimental-vm-modules` (set automatically via the `test` script).

## Key Algorithms

**LCS alignment** (`alignArrays.js`): Band-limited DP — stores only a diagonal band of the DP table, reducing memory from O(m×n) to O(n × band_width). Direction constants: `UP_LEFT` (match), `UP` (gap in a), `LEFT` (gap in b).

**Frequency-capped row matching** (`computeAndInjectDiffs.js`): Rows appearing >20 times (`MAX_ROW_OCCURRENCES`) in either image are excluded as alignment anchors — prevents blank rows from causing false LCS matches. Excluded rows are marked with an object rather than a string, so no row hash can collide with the marker.

**Row hashing** (`computeAndInjectDiffs.js`): Each row is keyed on its own bytes, mapped one byte to one character — `Buffer` in Node, `String.fromCharCode` in browsers. The mapping is injective, so two rows compare equal only if identical.

**Color delta** (`colorDelta.js`): YIQ NTSC color space (from pixelmatch). Weighted: `0.5053×y² + 0.299×i² + 0.1957×q²`, normalized by `MAX_YIQ_DIFFERENCE`. Sign encodes lighter vs darker.

**Diff colors**: Magenta `#C52772` = changed pixels, Green `#6A8500` = added rows.

## Testing

Unit tests cover each module individually. `snapshots-test.js` does visual regression: loads `before.png` + `after.png` from subdirectories of `snapshots/`, runs `imageDiff`, MD5-hashes the output and compares to `diff.png`. The `diff.png` files are committed to the repo. If `diff.png` is missing, it is auto-generated on first run.

To regenerate all snapshot baselines: delete all `diff.png` files and run `pnpm test`.

## API

```js
import imageDiff from 'lcs-image-diff';

// Browser: pass ImageData objects
const { data, width, height, diff, trace } = imageDiff(image1, image2);
const svg = trace.toSVG();

// Node.js: pass bitmap objects. Same call -- the default row hash works in
// both, so no hashFunction is needed.
const result = imageDiff(bitmap1, bitmap2);

// A custom hashFunction is still accepted. The default keeps every byte, so
// rows compare equal only if identical; a shorter key is a little quicker but
// a collision aligns two different rows as one.
const withOwnHash = imageDiff(bitmap1, bitmap2, { hashFunction });
```

Return value: `{ data: Uint8ClampedArray, width, height, diff: number (0–1), trace: DiffTrace }`.

## Dependencies

- `imagetracerjs` — raster-to-SVG for `DiffTrace`
- `sharp` (dev) — PNG loading in tests
- `jest` (dev) — test runner
