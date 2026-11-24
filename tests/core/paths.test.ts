import { describe, expect, it } from 'vitest';
import { parsePath, recordPath } from '../../src/core/paths.ts';

describe('recordPath', () => {
  it('builds flat paths', () => {
    expect(recordPath('product', { id: 'A' })).toBe('products/A.json');
    expect(recordPath('client', { id: 'B' })).toBe('clients/B.json');
    expect(recordPath('recipe', { id: 'C' })).toBe('recipes/C.json');
    expect(recordPath('supplier', { id: 'D' })).toBe('suppliers/D.json');
    expect(recordPath('level', { id: 'E' })).toBe('levels/E.json');
  });
  it('builds dated paths from record.date', () => {
    const r = { id: 'X', date: '2026-11-22' };
    expect(recordPath('order', r)).toBe('orders/2026/11/X.json');
    expect(recordPath('payment', r)).toBe('payments/2026/11/X.json');
    expect(recordPath('stock', r)).toBe('stock/2026/11/X.json');
    expect(recordPath('purchase', r)).toBe('purchases/2026/11/X.json');
  });
});

describe('parsePath', () => {
  it('round trips every type', () => {
    for (const t of ['product', 'client', 'order', 'payment', 'stock', 'recipe', 'supplier', 'purchase', 'level'] as const) {
      const p = recordPath(t, { id: 'ID1', date: '2026-01-05' });
      expect(parsePath(p)).toEqual({ type: t, id: 'ID1' });
    }
  });
  it('returns null for non-record paths', () => {
    for (const p of ['meta.json', 'README.md', 'foo/x.json', 'orders/x.json', 'orders/2026/11/x.txt', 'products/a/b.json', 'purchases/x.json', 'levels/2026/11/x.json'])
      expect(parsePath(p)).toBeNull();
  });
});
