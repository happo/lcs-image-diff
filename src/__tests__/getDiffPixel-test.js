const getDiffPixel = require('../getDiffPixel');

let subject;
let previousPixel;
let currentPixel;

beforeEach(() => {
  previousPixel = [255, 255, 255, 255];
  currentPixel = [255, 255, 255, 255];
  subject = () =>
    getDiffPixel(
      previousPixel[0],
      previousPixel[1],
      previousPixel[2],
      previousPixel[3],
      currentPixel[0],
      currentPixel[1],
      currentPixel[2],
      currentPixel[3],
    );
});

it('returns semi-opaque source if no diff', () => {
  expect(subject()).toEqual({ diff: 0, pixel: [255, 255, 255, 140] });
});

it('returns magenta when diff', () => {
  currentPixel = [120, 120, 255, 255];
  expect(subject()).toEqual({
    diff: 0.23089126029146917,
    pixel: [179, 54, 130, 58.877271374324636],
  });
});

it('returns diff when after is filler pixel', () => {
  currentPixel = [1, 1, 1, 1];
  expect(subject()).toEqual({
    diff: 1,
    pixel: [179, 54, 130, 255],
  });
});

it('returns diff when before is filler pixel', () => {
  previousPixel = [1, 1, 1, 1];
  expect(subject()).toEqual({
    diff: 1,
    pixel: [179, 54, 130, 255],
  });
});
