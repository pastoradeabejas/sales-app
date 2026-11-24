import { describe, it, expect } from 'vitest';
import {
  lineTotal, orderTotal, saleUnitCost, buildLine, dropEmptyLines, validateOrder,
  lineSummary, unitSummary, startFromPicks, isFutureDate,
} from '../../src/core/orders.ts';
import type { Order, OrderLine, ProductClass, Variant } from '../../src/core/types.ts';

const stamp = { createdAt: '', updatedAt: '', updatedBy: '' };
const fixedV: Variant = { ...stamp, id: 'vf', label: '500 g', kind: 'fixed', baseAmount: 500, price: 1400, cost: null, sortOrder: 0, archived: false };
const varV: Variant = { ...stamp, id: 'vv', label: 'Cut to order', kind: 'variable', baseAmount: null, price: 2600, cost: null, sortOrder: 1, archived: false };
const cls: ProductClass = {
  ...stamp, id: 'c1', schema: 1, name: 'Parmigiano Reggiano', unit: { name: 'kg', decimals: 3 },
  lowStockThreshold: null, trackStock: true, sellable: true, customFields: [], customValues: {}, notes: '',
  archived: false, variants: [fixedV, varV],
};

describe('totals', () => {
  it('fixed and variable', () => {
    expect(lineTotal({ kind: 'fixed', quantity: 2, amount: 1000, unitPrice: 1400, decimals: 3 })).toBe(2800);
    expect(lineTotal({ kind: 'variable', quantity: null, amount: 1370, unitPrice: 2600, decimals: 3 })).toBe(3562);
  });
  it('orderTotal sums', () => {
    expect(orderTotal([{ lineTotal: 100 }, { lineTotal: 250 }] as OrderLine[])).toBe(350);
  });
});

describe('saleUnitCost', () => {
  it('prefers variant cost', () => {
    expect(saleUnitCost({ ...fixedV, cost: 750 }, 1, 3)).toBe(750);
  });
  it('derives from class average', () => {
    expect(saleUnitCost(fixedV, 2, 3)).toBe(1); // 2 per base unit x 0.5
    expect(saleUnitCost(varV, 2.5, 3)).toBe(2.5);
    expect(saleUnitCost({ ...fixedV, baseAmount: 333 }, 1, 3)).toBe(0.333);
  });
  it('null when unknown', () => {
    expect(saleUnitCost(fixedV, null, 3)).toBeNull();
  });
});

describe('buildLine', () => {
  it('fixed', () => {
    const l = buildLine(cls, fixedV, { quantity: 2, classAvgCost: null }, 'L1');
    expect(l).toMatchObject({
      lineId: 'L1', classId: 'c1', variantId: 'vf', className: 'Parmigiano Reggiano', variantLabel: '500 g',
      kind: 'fixed', unitName: 'kg', decimals: 3, quantity: 2, amount: 1000, unitPrice: 1400, unitCost: null, lineTotal: 2800,
    });
  });
  it('variable with price override', () => {
    const l = buildLine(cls, varV, { amount: 1370, unitPrice: 2000, classAvgCost: 1.5 }, 'L2');
    expect(l).toMatchObject({ quantity: null, amount: 1370, unitPrice: 2000, unitCost: 1.5, lineTotal: 2740 });
  });
  it('snapshots the full name of a grouped product (D-015)', () => {
    const l = buildLine({ ...cls, name: '500g Jar', group: 'Honey/Rosemary' }, fixedV, { quantity: 1, classAvgCost: null }, 'L3');
    expect(l.className).toBe('Honey - Rosemary - 500g Jar');
  });
});

describe('dropEmptyLines', () => {
  it('drops zeros', () => {
    const a = { quantity: 0, amount: 0 } as OrderLine;
    const b = { quantity: null, amount: 0 } as OrderLine;
    const c = { quantity: 1, amount: 500 } as OrderLine;
    expect(dropEmptyLines([a, b, c])).toEqual([c]);
  });
});

describe('validateOrder', () => {
  const ok = buildLine(cls, fixedV, { quantity: 2, classAvgCost: null }, 'L1');
  const date = '2026-11-22';
  it('accepts valid', () => {
    expect(validateOrder({ clientId: 'x', lines: [ok], date })).toEqual([]);
  });
  it('reports problems', () => {
    expect(validateOrder({ clientId: '', lines: [], date: '22/11/2026' }).length).toBe(3);
    expect(validateOrder({ clientId: 'x', lines: [{ ...ok, quantity: 10000 }], date }).length).toBe(1);
    expect(validateOrder({ clientId: 'x', lines: [{ ...ok, quantity: 1.5 }], date }).length).toBe(1);
    expect(validateOrder({ clientId: 'x', lines: [{ ...ok, unitPrice: 100_000_001 }], date }).length).toBe(1);
    const v = buildLine(cls, varV, { amount: 0, classAvgCost: null }, 'L2');
    expect(validateOrder({ clientId: 'x', lines: [v], date }).length).toBe(1);
    expect(validateOrder({ clientId: 'x', lines: [{ ...v, amount: 1_000_000_001 }], date }).length).toBe(1);
  });
  it('rejects impossible dates', () => {
    expect(validateOrder({ clientId: 'x', lines: [ok], date: '2026-02-30' }).length).toBe(1);
  });
});

describe('summaries', () => {
  const f = buildLine(cls, fixedV, { quantity: 2, classAvgCost: null }, 'L1');
  const v = buildLine(cls, varV, { amount: 1370, classAvgCost: null }, 'L2');
  it('lineSummary', () => {
    expect(lineSummary([f, v])).toBe('2× Parmigiano Reggiano 500 g, 1.37 kg Parmigiano Reggiano Cut to order');
  });
  it('unitSummary', () => {
    expect(unitSummary([f, { ...f, quantity: 1 }, v])).toBe('3 items · 1.37 kg');
    expect(unitSummary([v])).toBe('1.37 kg');
    expect(unitSummary([{ ...f, quantity: 1 }])).toBe('1 item');
    expect(unitSummary([])).toBe('');
  });
});

describe('startFromPicks', () => {
  const mk = (id: string, date: string, parts: [string, number][], over: Partial<Order> = {}): Order => ({
    ...stamp, id, schema: 1, date, clientId: 'c', clientName: 'C', total: 0, note: '', voided: false, voidReason: null,
    createdAt: date + 'T10:00:00Z',
    lines: parts.map(([variantId, q], i) => ({
      lineId: id + i, classId: 'k', variantId, className: '', variantLabel: '', kind: 'fixed' as const, unitName: '', decimals: 0 as const,
      quantity: q, amount: q, unitPrice: 0, unitCost: null, lineTotal: 0,
    })),
    ...over,
  });
  it('spec example plus duplicate', () => {
    const o1 = mk('1', '2026-01-01', [['A', 6]]);
    const o2 = mk('2', '2026-01-02', [['B', 10]]);
    const o3 = mk('3', '2026-01-03', [['A', 3], ['B', 3]]);
    const dup = mk('4', '2026-01-04', [['B', 3], ['A', 3]]);
    expect(startFromPicks([o1, o2, o3], 'c').map((o) => o.id)).toEqual(['3', '2', '1']);
    expect(startFromPicks([o1, o2, o3, dup], 'c').map((o) => o.id)).toEqual(['4', '2', '1']);
  });
  it('skips voided, other clients; respects n', () => {
    const a = mk('a', '2026-01-01', [['A', 1]]);
    const b = mk('b', '2026-01-02', [['B', 1]], { voided: true });
    const c = mk('c', '2026-01-03', [['C', 1]], { clientId: 'z' });
    const d = mk('d', '2026-01-04', [['D', 1]]);
    expect(startFromPicks([a, b, c, d], 'c', 1).map((o) => o.id)).toEqual(['d']);
    expect(startFromPicks([a, b, c, d], 'c').map((o) => o.id)).toEqual(['d', 'a']);
  });
  it('same date: newest createdAt first', () => {
    const a = mk('a', '2026-01-01', [['A', 1]], { createdAt: '2026-01-01T09:00:00Z' });
    const b = mk('b', '2026-01-01', [['B', 1]], { createdAt: '2026-01-01T11:00:00Z' });
    expect(startFromPicks([a, b], 'c').map((o) => o.id)).toEqual(['b', 'a']);
  });
});

describe('isFutureDate', () => {
  it('compares', () => {
    expect(isFutureDate('2026-11-24', '2026-11-23')).toBe(true);
    expect(isFutureDate('2026-11-23', '2026-11-23')).toBe(false);
  });
});
