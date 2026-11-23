import { describe, expect, it } from 'vitest';
import { parseTextScale, TEXT_SCALE } from '../../src/ui/textSize.ts';

describe('parseTextScale', () => {
  it('defaults to 1 for missing or bad values', () => {
    for (const v of [null, undefined, '', 'big', 'NaN']) expect(parseTextScale(v)).toBe(1);
  });

  it('keeps values inside the range, rounded to the step', () => {
    expect(parseTextScale('1.2')).toBe(1.2);
    expect(parseTextScale('1.23')).toBe(1.25);
  });

  it('clamps to the range', () => {
    expect(parseTextScale('0.5')).toBe(TEXT_SCALE.min);
    expect(parseTextScale('3')).toBe(TEXT_SCALE.max);
  });
});
