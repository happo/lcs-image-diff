const colorDelta = require('../colorDelta');

it('is large when comparing black and white', () => {
  expect(colorDelta([0, 0, 0, 255], [255, 255, 255, 255])).toBeGreaterThan(
    0.92,
  );
});

it('is small when comparing black and very dark grey', () => {
  expect(colorDelta([0, 0, 0, 255], [10, 10, 10, 255])).toBeLessThan(0.02);
});

it('is medium when comparing black and medium grey', () => {
  const delta = colorDelta([0, 0, 0, 255], [127, 127, 127, 255]);
  expect(delta).toBeGreaterThan(0.21);
  expect(delta).toBeLessThan(0.24);
});

it('is medium when comparing red and blue', () => {
  const delta = colorDelta([255, 0, 0, 255], [0, 0, 255, 255]);
  expect(delta).toBeGreaterThan(0.5);
  expect(delta).toBeLessThan(0.51);
});

it('is one when comparing transparent and white', () => {
  expect(colorDelta([0, 0, 0, 0], [255, 255, 255, 255])).toEqual(1);
});

it('is large when comparing transparent and black', () => {
  expect(colorDelta([0, 0, 0, 0], [0, 0, 0, 255])).toBeGreaterThan(0.92);
});

it('is large when comparing white and transparent', () => {
  expect(colorDelta([255, 255, 255, 255], [0, 0, 0, 0])).toBeGreaterThan(0.92);
});
