import { describe, expect, it } from 'vitest';
import { batch, parseBatches } from '../../src/core/recipes.ts';

// Transform runs a recipe a whole number of times (D-019).
const fill = {
  inputs: [{ classId: 'jar', amount: 1 }, { classId: 'lid', amount: 1 }, { classId: 'bulk', amount: 500 }],
  outputs: [{ classId: 'jar500', amount: 1 }],
  extras: [{ label: 'Labels', amount: 10 }, { label: 'Time', amount: 40 }],
};

describe('batch', () => {
  it('multiplies inputs, outputs and extras by the number of batches', () => {
    expect(batch(fill, 10)).toEqual({
      inputs: [{ classId: 'jar', amount: 10 }, { classId: 'lid', amount: 10 }, { classId: 'bulk', amount: 5000 }],
      outputs: [{ classId: 'jar500', amount: 10 }],
      extras: [{ label: 'Labels', amount: 100 }, { label: 'Time', amount: 400 }],
    });
    expect(batch(fill, 1)).toEqual(fill);
  });
});

describe('parseBatches', () => {
  it('accepts whole numbers from 1, else null', () => {
    expect(parseBatches('3')).toBe(3);
    expect(parseBatches(' 12 ')).toBe(12);
    for (const bad of ['', '0', '-1', '1.5', '2,5', 'abc']) expect(parseBatches(bad)).toBeNull();
  });
});
