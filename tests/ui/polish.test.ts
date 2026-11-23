import { describe, expect, it } from 'vitest';
import { dateButtonLabel, quickChips, stepAmount } from '../../src/ui/screens/orders/polish.ts';
import { stockLine } from '../../src/ui/screens/overview/stockLine.ts';
import type { Movement } from '../../src/core/stock.ts';
import type { ProductClass } from '../../src/core/types.ts';

describe('dateButtonLabel', () => {
  it('labels today, yesterday and other days', () => {
    expect(dateButtonLabel('2026-11-24', '2026-11-24')).toBe('Today, 24 Nov');
    expect(dateButtonLabel('2026-11-23', '2026-11-24')).toBe('Yesterday, 23 Nov');
    expect(dateButtonLabel('2026-11-17', '2026-11-24')).toBe('Tue 17 Nov');
    expect(dateButtonLabel('2025-11-17', '2026-11-24')).toBe('Mon 17 Nov 2025');
    expect(dateButtonLabel('', '2026-11-24')).toBe('Choose date');
  });
});

describe('quick chips', () => {
  it('adds Owed first only when owed', () => {
    expect(quickChips(0).map((c) => c.cents)).toEqual([1000, 2000, 5000]);
    const c = quickChips(1250);
    expect(c[0]).toEqual({ label: 'Owed €12.50', cents: 1250 });
    expect(c).toHaveLength(4);
  });
  it('steps by a euro, never below 1 cent', () => {
    expect(stepAmount(1250, 100)).toBe(1350);
    expect(stepAmount(1250, -100)).toBe(1150);
    expect(stepAmount(50, -100)).toBe(1);
    expect(stepAmount(null, 100)).toBe(100);
  });
});

const cls = (o: Partial<ProductClass>) =>
  ({ sellable: true, lowStockThreshold: null, unit: { name: 'pcs', decimals: 0 }, ...o }) as ProductClass;
const mv = (kind: Movement['kind'], delta: number) => ({ kind, delta }) as Movement;

describe('stockLine', () => {
  it('raw material with last movement', () => {
    const c = cls({ sellable: false, unit: { name: 'kg', decimals: 0 } as ProductClass['unit'] });
    expect(stockLine(c, null, mv('transform-out', -500))).toBe('Raw material · last: −500 kg transform');
    expect(stockLine(c, null, null)).toBe('Raw material');
  });
  it('sellable days left or not enough data, with threshold', () => {
    expect(stockLine(cls({}), 23, null)).toBe('≈ 23 days left');
    expect(stockLine(cls({}), null, null)).toBe('not enough data');
    expect(stockLine(cls({ lowStockThreshold: 3 }), null, null)).toBe('not enough data · low below 3 pcs');
  });
});
