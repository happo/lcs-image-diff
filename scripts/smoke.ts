#!/usr/bin/env node
// Exercises the built package the way a consumer does.
//
// The test suite imports from `src`, so nothing else checks that `main`,
// `types` and `exports` actually point at something that loads and runs. This
// imports by package name rather than by path, so Node and TypeScript both
// resolve it through `exports` exactly as an installed copy would.
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import sharp from 'sharp';

import imageDiff from 'lcs-image-diff';
import type { ImageInput, ImageDiffResult } from 'lcs-image-diff';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function load(name: string): Promise<ImageInput> {
  const image = sharp(path.resolve(__dirname, '..', 'static', name));
  const [metadata, data] = await Promise.all([
    image.metadata(),
    image.ensureAlpha().raw().toBuffer(),
  ]);
  return { data, width: metadata.width, height: metadata.height };
}

const [image1, image2] = await Promise.all([
  load('google-logo.png'),
  load('github-logo.png'),
]);

const result: ImageDiffResult = imageDiff(image1, image2);

// The diff covers the larger of the two images.
assert.strictEqual(result.width, 80, 'width');
assert.strictEqual(result.height, 80, 'height');
assert.strictEqual(result.data.length, 80 * 80 * 4, 'data length');
assert.ok(result.diff > 0 && result.diff < 1, `diff in range: ${result.diff}`);
assert.strictEqual(result.maxDiff, 1, 'maxDiff for differently sized images');

// The trace is the other half of the public surface.
assert.match(result.trace.toSVG(), /^<svg[^>]*viewBox="0 0 100 100"/, 'trace svg');

// Documented in the README, and only reachable if the expando survived the
// declaration emit.
assert.strictEqual(imageDiff.DIFF_TRACE_PADDING, 10, 'DIFF_TRACE_PADDING');

console.log('smoke: package entry point OK');
