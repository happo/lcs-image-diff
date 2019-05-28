const compose = require('../compose');

let subject;
let foreground;
let background;

beforeEach(() => {
  foreground = [100, 100, 100, 100];
  background = [255, 255, 255, 255];
  subject = () =>
    compose(
      foreground,
      background,
    );
});

it('composes the colors', () => {
  expect(subject()).toEqual([194, 194, 194, 255]);
});

describe('when the foreground is opaque', () => {
  beforeEach(() => {
    foreground[3] = 255;
  });

  it('returns the foreground', () => {
    expect(subject()).toEqual(foreground);
  });
});

describe('when the background is fully transparent', () => {
  beforeEach(() => {
    background[3] = 0;
  });

  it('returns the foreground', () => {
    expect(subject()).toEqual(foreground);
  });
});
