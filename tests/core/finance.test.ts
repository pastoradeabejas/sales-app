import { describe, expect, it } from 'vitest';
import type { Order, OrderLine, ProductClass } from '../../src/core/types.ts';
import { profitSummary } from '../../src/core/stats.ts';
import {
  change,
  expensesByItem,
  inventoryValue,
  kpis,
  monthlyTrend,
  periodRange,
  previousPeriod,
  profitByClient,
  profitByProduct,
} from '../../src/core/finance.ts';

const stamp = { schema: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', updatedBy: 't' };
const line = (classId: string, lineTotal: number, unitCost: number | null, quantity = 1): OrderLine => ({
  lineId: 'l', classId, variantId: classId + 'v', className: classId.toUpperCase(), variantLabel: 'v', kind: 'fixed',
  unitName: 'pcs', decimals: 0, quantity, amount: quantity, unitPrice: lineTotal / quantity, unitCost, lineTotal,
});
const order = (id: string, date: string, clientId: string, lines: OrderLine[], voided = false): Order => ({
  ...stamp, id, date, clientId, clientName: clientId.toUpperCase(), lines, total: lines.reduce((s, l) => s + l.lineTotal, 0),
  note: '', voided, voidReason: null,
});
const cls = (id: string, extra: Partial<ProductClass> = {}): ProductClass => ({
  ...stamp, id, name: id, group: '', unit: { name: 'pcs', decimals: 0 }, lowStockThreshold: null, trackStock: true,
  sellable: true, customFields: [], customValues: {}, notes: '', archived: false, variants: [], ...extra,
});
const pl = (classId: string, lineTotal: number) => ({ lineId: 'x', classId, className: classId, unitName: 'pcs', decimals: 0 as const, amount: 1, lineTotal });
const purchase = (id: string, date: string, lines: ReturnType<typeof pl>[], voided = false) => ({
  ...stamp, id, date, supplierId: null, supplierName: '', lines, total: lines.reduce((s, l) => s + l.lineTotal, 0), method: 'cash' as const, note: '', voided,
});

const nov = { from: '2026-11-01', to: '2026-11-30' };

describe('periods (D-031)', () => {
  it('month, quarter and year containing the date', () => {
    expect(periodRange('month', '2026-11-24')).toEqual(nov);
    expect(periodRange('quarter', '2026-11-24')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(periodRange('quarter', '2026-02-10')).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(periodRange('year', '2026-11-24')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
  it('previous period: the calendar one before, or the same number of days before for custom', () => {
    expect(previousPeriod('month', nov)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(previousPeriod('quarter', { from: '2026-01-01', to: '2026-03-31' })).toEqual({ from: '2025-10-01', to: '2025-12-31' });
    expect(previousPeriod('year', { from: '2026-01-01', to: '2026-12-31' })).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(previousPeriod('custom', { from: '2026-11-11', to: '2026-11-20' })).toEqual({ from: '2026-11-01', to: '2026-11-10' });
  });
  it('change in %, null without a base', () => {
    expect(change(150, 100)).toBe(50);
    expect(change(50, 100)).toBe(-50);
    expect(change(10, 0)).toBeNull();
    expect(change(-50, -100)).toBe(50);
  });
});

const classes = new Map([['jar', cls('jar')], ['fuel', cls('fuel', { trackStock: false, sellable: false })], ['rent', cls('rent', { name: 'Rent', trackStock: false, sellable: false })]]);
const orders = [
  order('o1', '2026-11-03', 'ana', [line('jar', 1000, 400, 2), line('cheese', 600, null)]),
  order('o2', '2026-11-10', 'bea', [line('jar', 500, 200)]),
  order('o3', '2026-11-12', 'ana', [line('jar', 999, 1)], true),
  order('o4', '2026-10-05', 'bea', [line('jar', 2000, 500, 4)]),
];
const purchases = [
  purchase('p1', '2026-11-02', [pl('fuel', 400), pl('jar', 1000)]),
  purchase('p2', '2026-11-20', [pl('rent', 600)]),
  purchase('p3', '2026-11-21', [pl('rent', 9999)], true),
  purchase('p4', '2026-10-02', [pl('fuel', 300)]),
];

describe('kpis', () => {
  it('orders, average order, gross and net margins, break-even sales', () => {
    const s = profitSummary(orders, purchases, [], classes, nov);
    // sales 2100; with known cost 1500, cost 1000 -> gross 500 (33.3 %); expenses 1000; net -500
    expect(kpis(s, orders, nov)).toEqual({
      orders: 2, avgOrder: 1050, grossMargin: 500 / 1500, netMargin: -500 / 2100, breakEven: 3000,
    });
  });
  it('no sales: margins and break-even are null', () => {
    const s = profitSummary([], purchases, [], classes, nov);
    expect(kpis(s, [], nov)).toEqual({ orders: 0, avgOrder: null, grossMargin: null, netMargin: null, breakEven: null });
  });
});

describe('breakdowns', () => {
  it('expenses by item, largest first, with shares; stock lines and voided purchases left out', () => {
    expect(expensesByItem(purchases, classes, nov)).toEqual([
      { classId: 'rent', name: 'Rent', amount: 600, share: 0.6 },
      { classId: 'fuel', name: 'fuel', amount: 400, share: 0.4 },
    ]);
  });
  it('profit by product: sales, known cost, profit, margin and units', () => {
    expect(profitByProduct(orders, nov)).toEqual([
      { classId: 'jar', className: 'JAR', sales: 1500, cost: 1000, profit: 500, margin: 500 / 1500, coveredShare: 1, amount: 3, unitName: 'pcs', decimals: 0 },
      { classId: 'cheese', className: 'CHEESE', sales: 600, cost: 0, profit: 0, margin: null, coveredShare: 0, amount: 1, unitName: 'pcs', decimals: 0 },
    ]);
  });
  it('profit by client', () => {
    expect(profitByClient(orders, nov)).toEqual([
      { clientId: 'ana', clientName: 'ANA', sales: 1600, profit: 200, margin: 200 / 1000, coveredShare: 1000 / 1600, orders: 1 },
      { clientId: 'bea', clientName: 'BEA', sales: 500, profit: 300, margin: 0.6, coveredShare: 1, orders: 1 },
    ]);
  });
  it('inventory value = stock × average cost, unknown costs counted apart', () => {
    const snapshot = new Map([
      ['jar', { stock: 10, avgCost: 250, last: null }],
      ['honey', { stock: 2500, avgCost: 600, last: null }],
      ['box', { stock: 3, avgCost: null, last: null }],
      ['gone', { stock: -2, avgCost: 100, last: null }],
    ]);
    const list = [cls('jar'), cls('honey', { name: 'Honey', group: 'Bulk', unit: { name: 'kg', decimals: 3 } }), cls('box'), cls('gone')];
    expect(inventoryValue(list, snapshot)).toEqual({
      total: 2500 + 1500,
      rows: [
        { classId: 'jar', name: 'jar', group: '', value: 2500 },
        { classId: 'honey', name: 'Honey', group: 'Bulk', value: 1500 },
      ],
      unknown: 1,
    });
  });
  it('monthly trend: one point per month, oldest first', () => {
    const t = monthlyTrend(orders, purchases, [], classes, '2026-11-24', 3);
    expect(t.map((p) => p.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(t[1]).toEqual({ month: '2026-10', sales: 2000, cogs: 2000, expenses: 300, net: -300 });
    expect(t[2]).toMatchObject({ sales: 2100, net: -500 });
  });
});
