# lcs-image-diff

A javascript function that takes two images and returns a new image
highlighting the differences between the two images. Uses the
[Longest-Common-Subsequence algorithm
(LCS)](https://en.wikipedia.org/wiki/Longest_common_subsequence_problem) to
align the two images (vertically). This will prevent unnecessarily big diffs
for images where content has shifted up or down. Works in the browser and in
Node.

## Examples
Image 1 | Image 2 | Image diff | Traced
------- | ------- | ---------- | ---------
![Image 1](https://happo.io/img/happo-io/0ce6187c17100958ad2aa43ce794ede9) | ![Image 2](https://happo.io/img/happo-io/831d05205dd6a094ae8cc5136824b77c) | ![Image diff](https://happo.io/accounts/8/diff/%2Fimg%2Fhappo-io%2F0ce6187c17100958ad2aa43ce794ede9/%2Fimg%2Fhappo-io%2F831d05205dd6a094ae8cc5136824b77c) | ![Diff with trace](trace-example-card.png)
![Image 1](https://happo.io/img/happo-io/ec485da33ce443baa327783cc7643431) | ![Image 2](https://happo.io/img/happo-io/3c65f11313f8ba196e4da06f39e50692) | ![Image diff](https://happo.io/accounts/8/diff/%2Fimg%2Fhappo-io%2Fec485da33ce443baa327783cc7643431/%2Fimg%2Fhappo-io%2F3c65f11313f8ba196e4da06f39e50692) | ![Diff with trace](trace-example-button.png)


## Installation

```bash
npm install lcs-image-diff
```

The package is written in TypeScript and ships its own type declarations, so
there is no `@types/lcs-image-diff` to install.

## Usage in the browser

_Pro tip:_ You're best off using this module in a web worker, to offload heavy
image manipulation from the main thread.

```js
const imageDiff = require('lcs-image-diff');

// `image1` and `image2` are instances of `ImageData`
// https://developer.mozilla.org/en-US/docs/Web/API/ImageData
// https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData
const { data, width, height, diff } = imageDiff(image1, image2);

// `data` is a `UInt8ClampedArray`
// `width` and `height` is the resulting size of the diff image
// `diff` is a number between 0 and 1 describing how much the two images differ.
```

## Usage in Node

Usage is the same as in the browser. Here's an example using images loaded with
[Jimp](https://github.com/oliver-moran/jimp).

```js
const Jimp = require('jimp');

const imageDiff = require('lcs-image-diff');

const image1 = (await Jimp.read('1.jpg')).bitmap;
const image2 = (await Jimp.read('2.jpg')).bitmap;

const { data, width, height, diff } = imageDiff(image1, image2);
```

### How rows are compared

Rows are keyed so they can be compared while aligning the two images. By
default each distinct row is given a number: rows are grouped by a sampled
fingerprint and then compared in full within a group, so two rows are only
treated as the same row when every byte matches. The sampling decides which
rows are worth comparing, never whether they are equal.

You can pass your own `hashFunction` instead. A digest makes the alignment a
little quicker, at the risk of a collision making two different rows align as
one.

```js
const crypto = require('crypto');

const { data, width, height, diff } = imageDiff(image1, image2, {
  hashFunction: data =>
    crypto.createHash('md5').update(data).digest('hex'),
});
```

## Ignoring small differences and anti-aliasing

By default every pixel that differs at all is drawn as a change and traced.
Two options narrow that down:

- `threshold` (default `0`): a pixel counts as changed only if its color
  delta is strictly greater than this. Deltas run from 0 (identical) to 1
  (as different as two colors can be), the same scale happo-compare's
  `compareThreshold` uses.
- `ignoreAntialiasing` (default `false`): pixels that look like anti-aliasing
  in either image do not count.

```js
const { data, trace } = imageDiff(image1, image2, {
  threshold: 0.01,
  ignoreAntialiasing: true,
});
```

Pixels that differ but do not count are left out of the trace and drawn with a
faint tint in the diff image, so you can still see where the images differ.
The `diff` and `maxDiff` values still include every differing pixel.

## Getting a diff trace

When presenting an image diff to a user, it can be helpful to highlight diff
areas. The diff image returned by the `imageDiff` function will do some of
that, but in some cases when only a few pixels have changed it can be useful to
further trace the diff. For that purpose, `imageDiff` will return a `trace`
object that can be used to generate an SVG image with paths tracing the diff.

```js
const imageDiff = require('lcs-image-diff');

const { data, width, height, trace } = imageDiff(image1, image2);
const svg = trace.toSVG();

document.getElementById('#trace-svg').innerHTML = svg;
```

The SVG image is slightly larger than the diff image so that it can properly
highlight edges and corners. For that reason, you need to place the SVG in a
container that bleeds out a little to account for the extra size.

```html
<div id="trace-svg" style="margin: 0 -10px"></div>
```

...or if you hate magic numbers, import the constant:

```js
import { DIFF_TRACE_PADDING } from 'lcs-image-diff';

document.getElementById('#trace-svg').style.margin = `0 ${DIFF_TRACE_PADDING}px`;
```

`imageDiff.DIFF_TRACE_PADDING` still works, but is deprecated and will be
removed in the next major.

## Replaying a stored alignment

Finding how the rows of two images line up is the expensive part of a diff.
`imageDiff` returns it as `alignment`, and you can hand it back for the same
two images to skip the search:

```js
const first = imageDiff(image1, image2);
// ...store first.alignment and first.alignmentStamp...
const again = imageDiff(image1, image2, {
  alignment: storedAlignment,
  alignmentStamp: storedStamp,
});
```

An alignment only replays exactly on a build that reads its runs the same way.
Store `alignmentStamp` with it and pass it back: an alignment this build would
read differently is refused with an error instead of being composed into a
wrong image. To decide before loading the library, ask the dependency-free
entry point:

```js
import { canReplayAlignment } from 'lcs-image-diff/alignmentReplay.js';

if (canReplayAlignment(storedStamp)) {
  // replay
}
```

The stamp is not a package version, so a release that changes only how an
alignment is found keeps replaying the alignments stored before it, in both
directions. For an alignment stored before stamps existed (4.3.0 to 4.4.2),
pass the version string that produced it instead of a stamp.

## Authors

- Henric Trotzig ([@trotzig](https://github.com/trotzig))
- Joe Lencioni ([@lencioni](https://github.com/lencioni))

---------------------

Make sure to check out [happo.io](https://happo.io) - the cross-browser
screenshot testing tool
