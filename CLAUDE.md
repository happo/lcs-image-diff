# lcs-image-diff

A TypeScript library that compares two images and generates a visual diff using the **Longest-Common-Subsequence (LCS) algorithm** to align rows before diffing. This prevents inflated diffs when content has shifted vertically. Works in both browser and Node.js.

## Project Structure

```
src/
  index.ts                  # Main export: imageDiff()
  alignArrays.ts            # Band-limited LCS dynamic programming
  computeAndInjectDiffs.ts  # Row interning, alignment, gap injection
  createDiffImage.ts        # Renders the final diff image + DiffTrace
  getDiffPixel.ts           # Per-pixel diff computation
  colorDelta.ts             # YIQ perceptual color difference
  compose.ts                # Alpha blending (integer math)
  DiffTrace.ts              # SVG outline generation via imagetracerjs
  similarEnough.ts          # Early-exit: skip LCS if >70% similar
  constants.ts              # DIFF_TRACE_PADDING
  imagetracerjs.d.ts        # Types for the untyped `imagetracerjs` dependency
  __tests__/                # Jest unit + snapshot tests
dist/                       # Build output (git-ignored); what the package ships
snapshots/                  # Visual regression baselines (before/after/diff.png)
static/                     # Test fixture images
server.ts                   # Dev server for viewing diffs (port 3456)
profile.ts                  # Times imageDiff over every snapshot
```

## Commands

```bash
pnpm test                                          # Run all tests
pnpm test <test_file_name>                         # Run a single test file
pnpm test -t <matching_string> <test_file_name>    # Run a single describe/test block
pnpm tsc                                           # Type check everything (no emit)
pnpm run build                                     # Emit dist/ from src/
pnpm run serve                                     # Dev server at http://localhost:3456
pnpm run profile                                   # Time imageDiff over the snapshots
```

## Module System

ESM (`"type": "module"` in package.json), TypeScript 7 with `module: nodenext`.

Relative imports carry a `.js` extension even though the files are `.ts` -- that
is what `nodenext` resolution wants and what the emitted JS needs. Jest maps the
extension back off again (`moduleNameMapper` in `jest.config.js`).

`tsconfig.json` type checks everything and emits nothing;
`tsconfig.build.json` is the one that writes `dist/`.

Tests run through `babel-jest`, which only strips the types -- jest loads the
result as ESM, so `NODE_OPTIONS=--experimental-vm-modules` is still needed (set
automatically via the `test` script). Babel does not type check; `pnpm tsc`
does.

`server.ts` and `profile.ts` run under `tsx`, because Node's own type stripping
will not resolve a `.js` specifier to a `.ts` file.

## Key Algorithms

**LCS alignment** (`alignArrays.ts`): Band-limited DP — stores only a diagonal band of the DP table, reducing memory from O(m×n) to O(n × band_width). Direction constants: `UP_LEFT` (match), `UP` (gap in a), `LEFT` (gap in b).

**Frequency-capped row matching** (`computeAndInjectDiffs.ts`): Rows appearing >20 times (`MAX_ROW_OCCURRENCES`) in either image are excluded as alignment anchors — prevents blank rows from causing false LCS matches. Excluded rows are marked with an object rather than a string, so no row key — a number by default, or whatever a custom `hashFunction` returns — can collide with the marker.

**Row interning** (`computeAndInjectDiffs.ts`): Each distinct row is given a number, so the LCS compares numbers rather than rows. Rows are grouped by a sampled fingerprint (every `FINGERPRINT_STRIDE` bytes) and then compared **in full** within a group — `Buffer.compare` in Node, a byte loop in browsers — so equal numbers mean identical rows. The fingerprint only decides which rows are worth comparing; it never decides equality. Once a group exceeds `MAX_CANDIDATES` distinct rows it switches to keying them by their full contents (`hashRowWithBuffer` / `hashRowWithCharCodes`), which bounds what would otherwise be a quadratic scan. The interner is created per call: its numbers mean nothing outside one alignment and it holds the rows it is given.

**Color delta** (`colorDelta.ts`): YIQ NTSC color space (from pixelmatch). Weighted: `0.5053×y² + 0.299×i² + 0.1957×q²`, normalized by `MAX_YIQ_DIFFERENCE`. Sign encodes lighter vs darker.

**Diff colors**: Magenta `#C52772` = changed pixels, Green `#6A8500` = added rows.

## Testing

Unit tests cover each module individually. `snapshots-test.ts` does visual regression: loads `before.png` + `after.png` from subdirectories of `snapshots/`, runs `imageDiff`, MD5-hashes the output and compares to `diff.png`. The `diff.png` files are committed to the repo. If `diff.png` is missing, it is auto-generated on first run.

To regenerate all snapshot baselines: delete all `diff.png` files and run `pnpm test`.

## API

Types ship with the package (`dist/index.d.ts`).

```ts
import imageDiff from 'lcs-image-diff';

// Browser: pass ImageData objects
const { data, width, height, diff, trace } = imageDiff(image1, image2);
const svg = trace.toSVG();

// Node.js: pass bitmap objects. Same call -- the default row keying works in
// both, so no hashFunction is needed.
const result = imageDiff(bitmap1, bitmap2);

// A custom hashFunction is still accepted. The default compares rows in full,
// so rows compare equal only if identical; a digest is a little quicker but a
// collision aligns two different rows as one.
const withOwnHash = imageDiff(bitmap1, bitmap2, { hashFunction });
```

Return value: `{ data: Uint8ClampedArray, width, height, diff: number (0–1), trace: DiffTrace }`.

## Dependencies

- `imagetracerjs` — raster-to-SVG for `DiffTrace` (untyped; see `src/imagetracerjs.d.ts`)
- `typescript` (dev) — v7, the native compiler
- `sharp` (dev) — PNG loading in tests
- `jest` (dev) — test runner, with `babel-jest` + `@babel/preset-typescript`
- `tsx` (dev) — runs `server.ts` and `profile.ts`

Dependency versions are subject to the `minimumReleaseAge` cooldown in
`pnpm-workspace.yaml`, so a range whose only match is a package published in the
last two days will fail to install.
