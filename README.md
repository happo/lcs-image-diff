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

## Authors

- Henric Trotzig ([@trotzig](https://github.com/trotzig))
- Joe Lencioni ([@lencioni](https://github.com/lencioni))

---------------------

Make sure to check out [happo.io](https://happo.io) - the cross-browser
screenshot testing tool
