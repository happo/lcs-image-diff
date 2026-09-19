import { describe, expect, it } from '@jest/globals';

import alignArrays from '../alignArrays.ts';

function test(
  aStr: string,
  bStr: string,
  expectedAStr: string,
  expectedBStr: string,
): void {
  const a = aStr.split('');
  const b = bStr.split('');
  alignArrays(a, b);
  expect(a.join('')).toEqual(expectedAStr);
  expect(b.join('')).toEqual(expectedBStr);
}

it('handles additions and deletions', () => {
  test(
    'ACBDEA',
    'ABCDA',
    'A+CBDEA',
    'ABC+D+A',
  );
});

describe('different start', () => {
  it('works when start is different', () => {
    test(
      'ZACBDEA',
      'XABCDA',
      'ZA+CBDEA',
      'XABC+D+A',
    );
  });

  it('works when B has deletions in the start', () => {
    test(
      'AA',
      'XAA',
      '+AA',
      'XAA',
    );
  });
});

describe('completely different', () => {
  it('works when A is longer', () => {
    test(
      'CCCBBBCCC',
      'AAAA',
      'CCCBBBCCC',
      '+++++AAAA',
    );
  });

  it('works when B is longer', () => {
    test(
      'AAAA',
      'CCCBBBCCC',
      '+++++AAAA',
      'CCCBBBCCC',
    );
  });
});

it('aligns content shifted far enough to cross many stripes', () => {
  // The backtrack rebuilds the direction table one stripe at a time, from the
  // nearest checkpoint below it. Short inputs fit in a stripe or two and never
  // exercise that; 900 rows is roughly fifteen of them. The shift is also far
  // larger than the drift cap this algorithm used to have, which is the case
  // that cap was removed for.
  const common = Array.from({ length: 900 }, (_, i) => `row-${i}`);
  const inserted = Array.from({ length: 400 }, (_, i) => `new-${i}`);

  const a = common.slice();
  const b = [...inserted, ...common];

  alignArrays(a, b);

  expect(a).toHaveLength(b.length);
  expect(a.slice(0, 400)).toEqual(new Array(400).fill('+'));
  expect(a.slice(400)).toEqual(common);
  expect(b).toEqual([...inserted, ...common]);
});
