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
  antialiasing.ts           # Anti-aliased pixel detection (shared with happo-compare)
  flatRows.ts               # Rows as views of one buffer, read flat without copying
  compose.ts                # Alpha blending (integer math)
  DiffTrace.ts              # SVG outline generation via imagetracerjs
  similarEnough.ts          # Early-exit: skip LCS if >70% similar
  constants.ts              # DIFF_TRACE_PADDING
  imagetracerjs.d.ts        # Types for the untyped `imagetracerjs` dependency
  __tests__/                # Jest unit + snapshot tests
scripts/
  smoke.ts                  # Imports the BUILT package and exercises it
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
pnpm run smoke                                     # Check the built package
pnpm run serve                                     # Dev server at http://localhost:3456
pnpm run profile                                   # Time imageDiff over the snapshots
```

## Module System

ESM (`"type": "module"` in package.json), TypeScript 7 with `module: nodenext`.

Relative imports name the real file: `./foo.ts`, not `./foo.js`. That is what
lets Node run the sources directly -- its type stripping will not resolve a
`.js` specifier to a `.ts` file. `rewriteRelativeImportExtensions` turns them
into `./foo.js` on emit, so `dist/` is ordinary JavaScript. `erasableSyntaxOnly`
keeps the source to syntax Node can strip, which rules out enums, namespaces
and parameter properties.

Because of that there is no toolchain for running a script: `node server.ts`
and `node profile.ts` work as they are.

`tsconfig.json` type checks everything and emits nothing;
`tsconfig.build.json` is the one that writes `dist/`; `tsconfig.smoke.json`
checks `scripts/smoke.ts` against the built package and so only works after a
build, which is why it is kept out of `pnpm tsc`.

Tests run through `babel-jest`, which only strips the types -- jest loads the
result as ESM, so `NODE_OPTIONS=--experimental-vm-modules` is still needed (set
automatically via the `test` script). Babel does not type check; `pnpm tsc`
does.

## Key Algorithms

**LCS alignment** (`alignArrays.ts`): Band-limited DP — stores only a diagonal band of the DP table, reducing memory from O(m×n) to O(n × band_width). Direction constants: `UP_LEFT` (match), `UP` (gap in a), `LEFT` (gap in b).

**Frequency-capped row matching** (`computeAndInjectDiffs.ts`): Rows appearing >20 times (`MAX_ROW_OCCURRENCES`) in either image are excluded as alignment anchors — prevents blank rows from causing false LCS matches. Excluded rows are marked with an object rather than a string, so no row key — a number by default, or whatever a custom `hashFunction` returns — can collide with the marker.

**Row interning** (`computeAndInjectDiffs.ts`): Each distinct row is given a number, so the LCS compares numbers rather than rows. Rows are grouped by a sampled fingerprint (every `FINGERPRINT_STRIDE` bytes) and then compared **in full** within a group — `Buffer.compare` in Node, a byte loop in browsers — so equal numbers mean identical rows. The fingerprint only decides which rows are worth comparing; it never decides equality. Once a group exceeds `MAX_CANDIDATES` distinct rows it switches to keying them by their full contents (`hashRowWithBuffer` / `hashRowWithCharCodes`), which bounds what would otherwise be a quadratic scan. The interner is created per call: its numbers mean nothing outside one alignment and it holds the rows it is given.

**Color delta** (`colorDelta.ts`): YIQ NTSC color space (from pixelmatch). Weighted: `0.5053×y² + 0.299×i² + 0.1957×q²`, normalized by `MAX_YIQ_DIFFERENCE`. Sign encodes lighter vs darker.

**Which pixels count** (`createDiffImage.ts`, `antialiasing.ts`): by default any differing pixel is a change. `threshold` and `ignoreAntialiasing` narrow that to happo-compare's rule -- colour delta above the threshold, and not anti-aliasing in either image -- so a viewer given a comparison's settings highlights the pixels that comparison measured. happo-compare imports `isAntialiased` from here rather than keeping its own copy, which is what keeps the two from drifting. The check reads each image flat (it looks at the rows above and below), so each aligned image comes back as consecutive views of one buffer of its own (`flatRows.ts`), which `createDiffImage` reads in place rather than copying. To get there without an extra copy, `imageTo2DArray` hands out rows that *view the caller's pixels* when no padding is needed; aligning only reads them, and `computeAndInjectDiffs` writes each aligned image into its own buffer once, at the end (`materialize`), so the result never shares memory with the input. That holds for the narrower of two images of different widths too: it is aligned as if padded to the wider one with filler pixels `(1, 1, 1, 1)`, but the interner fingerprints, compares and keys each row as its padded form would be (`createPaddedIntern`), `similarEnough` treats the missing bytes as filler, and a stored alignment hashes nothing -- so the padding is first written by `materialize`, into that one buffer. The exception is a caller's own `hashFunction`, which is handed the padded row itself, so with one the narrower image is still copied with its padding up front. A differing pixel that does not count is left out of the trace and drawn faintly tinted instead of in the change colour. `diff` and `maxDiff` still include every differing pixel: they describe how far apart the images are, not what was highlighted.

**No allocation per pixel** (`createDiffImage.ts`, `getDiffPixel.ts`): the diff loop writes each pixel into the output with `writeDiffPixel` rather than building arrays through `compose`. A tall page is tens of millions of pixels, and a couple of small arrays each kept V8's garbage collector busy enough to dominate the diff -- and made its speed depend on how large the rest of the heap happened to be. Only pixels drawn with the faint "uncounted" tint still go through `compose`.

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

// Only count pixels happo-compare would: above its compareThreshold, and not
// anti-aliasing.
const likeTheComparison = imageDiff(image1, image2, {
  threshold: 0.01,
  ignoreAntialiasing: true,
});
```

Return value: `{ data: Uint8ClampedArray, width, height, diff: number (0–1), trace: DiffTrace }`.

`DIFF_TRACE_PADDING` is a named export. It is also still reachable as
`imageDiff.DIFF_TRACE_PADDING`, which is deprecated and goes away in the next
major -- the deprecation is written on its own const in `index.ts` so that it
reaches the emitted declaration.

Three modules are exported individually. They are listed one by one in
`exports` rather than matched by a wildcard, so the public surface is only
what callers actually import -- adding another means adding an entry.

```js
import computeAndInjectDiffs from 'lcs-image-diff/computeAndInjectDiffs.js';
import { colorDeltaChannels } from 'lcs-image-diff/colorDelta.js';
import { asPixelWords, isAntialiased } from 'lcs-image-diff/antialiasing.js';
```

The first two are also reachable under a `src/` prefix, which predates this package
having an `exports` field. Callers elsewhere still use that spelling; it goes
away in a breaking change. `scripts/smoke.ts` covers every one of these paths
so none of them can break silently.

## Dependencies

- `imagetracerjs` — raster-to-SVG for `DiffTrace` (untyped; see `src/imagetracerjs.d.ts`)
- `typescript` (dev) — v7, the native compiler
- `sharp` (dev) — PNG loading in tests
- `jest` (dev) — test runner, with `babel-jest` + `@babel/preset-typescript`

Dependency versions are subject to the `minimumReleaseAge` cooldown in
`pnpm-workspace.yaml`, so a range whose only match is a package published in the
last two days will fail to install.
