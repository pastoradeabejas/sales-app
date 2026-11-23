import { describe, expect, it } from 'vitest';
import type { Decimals } from '../../src/core/types.ts';
import { recipeYield, scaleRows } from '../../src/core/recipes.ts';

const decimals: Record<string, Decimals> = { milk: 3, yogurt: 0, cheese: 3, whey: 3, sugar: 3 };
const decimalsOf = (id: string) => decimals[id];
const yogurtRecipe = [{ classId: 'milk', amount: 500000 }, { classId: 'yogurt', amount: 10000 }];

describe('scaleRows', () => {
  it('scales every row by the changed row factor (§13 examples)', () => {
    const scale = (amount: number) => scaleRows(yogurtRecipe, yogurtRecipe, { index: 0, amount }, decimalsOf);
    expect(scale(500000)).toEqual([500000, 10000]);
    expect(scale(750000)).toEqual([750000, 15000]);
    expect(scale(333333)).toEqual([333333, 6667]);
  });

  it('scales from an output row too, rounding half-up per class', () => {
    expect(scaleRows(yogurtRecipe, yogurtRecipe, { index: 1, amount: 15000 }, decimalsOf)).toEqual([750000, 15000]);
    expect(scaleRows(yogurtRecipe, yogurtRecipe, { index: 1, amount: 1 }, decimalsOf)).toEqual([50, 1]);
    const r = [{ classId: 'milk', amount: 3 }, { classId: 'yogurt', amount: 1 }];
    expect(scaleRows(r, r, { index: 1, amount: 5 }, decimalsOf)).toEqual([15, 5]);
    expect(scaleRows(r, r, { index: 0, amount: 1 }, decimalsOf)).toEqual([1, 0]); // 0.333 → 0
    expect(scaleRows(r, r, { index: 0, amount: 2 }, decimalsOf)).toEqual([2, 1]); // 0.667 → 1
    const half = [{ classId: 'milk', amount: 2 }, { classId: 'yogurt', amount: 1 }];
    expect(scaleRows(half, half, { index: 0, amount: 3 }, decimalsOf)).toEqual([3, 2]); // 1.5 → 2
  });

  it('scales multi-input / multi-output recipes from the base, not the current rows', () => {
    const base = [
      { classId: 'milk', amount: 1000000 }, { classId: 'sugar', amount: 5000 },
      { classId: 'cheese', amount: 90000 }, { classId: 'whey', amount: 850000 },
    ];
    const edited = base.map((r, i) => (i === 2 ? { ...r, amount: 12345 } : r));
    expect(scaleRows(edited, base, { index: 0, amount: 1500000 }, decimalsOf)).toEqual([1500000, 7500, 135000, 1275000]);
  });
});

describe('recipeYield', () => {
  it('is output base units per 1 input base unit', () => {
    expect(recipeYield(yogurtRecipe[0], yogurtRecipe[1], decimalsOf)).toBe(20);
    expect(recipeYield({ classId: 'milk', amount: 1000000 }, { classId: 'cheese', amount: 90000 }, decimalsOf)).toBe(0.09);
  });
});
