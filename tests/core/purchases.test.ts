import { describe, expect, it } from 'vitest';
import type { Decimals, Order, ProductClass, Purchase, PurchaseLine, StockAdjust } from '../../src/core/types.ts';
import { isExpenseItem, purchaseLineUnitCost, purchaseTotal, validatePurchase } from '../../src/core/purchases.ts';
import { classTimeline, stockSnapshot } from '../../src/core/stock.ts';
import { averageCostAt } from '../../src/core/costs.ts';

const stamp = (date: string, time = '10:00') => ({
  createdAt: `${date}T${time}:00.000Z`, updatedAt: `${date}T${time}:00.000Z`, updatedBy: 'test', schema: 1,
});
let seq = 0;
const nextId = () => `p${String(++seq).padStart(4, '0')}`;

const cls = (id: string, decimals: Decimals = 0, extra: Partial<ProductClass> = {}): ProductClass => ({
  id, ...stamp('2026-01-01'), name: id, unit: { name: decimals ? 'kg' : 'pcs', decimals },
  lowStockThreshold: null, trackStock: true, sellable: false, customFields: [], customValues: {},
  notes: '', archived: false, variants: [], ...extra,
});
const line = (classId: string, amount: number, lineTotal: number, decimals: Decimals = 0): PurchaseLine => ({
  lineId: nextId(), classId, className: classId, unitName: 'pcs', decimals, amount, lineTotal,
});
const purchase = (date: string, lines: PurchaseLine[], extra: Partial<Purchase> = {}, time?: string): Purchase => ({
  id: nextId(), ...stamp(date, time), date, supplierId: 's1', supplierName: 'Envases', lines,
  total: purchaseTotal(lines), method: 'cash', note: '', voided: false, ...extra,
});
const sale = (date: string, classId: string, amount: number): Order => ({
  id: nextId(), ...stamp(date), date, clientId: 'c', clientName: 'Ana', total: 0, note: '', voided: false, voidReason: null,
  lines: [{ lineId: 'l', classId, variantId: 'v', className: classId, variantLabel: 'v', kind: 'variable', unitName: 'pcs',
    decimals: 0, quantity: null, amount, unitPrice: 0, unitCost: null, lineTotal: 0 }],
});
const add = (date: string, classId: string, amount: number, unitCost: number | null): StockAdjust => ({
  id: nextId(), ...stamp(date), date, type: 'add', classId, amount, unitCost, reason: '', note: '', voided: false,
});

const lid = cls('lid');
const fuel = cls('fuel', 0, { trackStock: false, sellable: false });
const byId = new Map([lid, fuel].map((c) => [c.id, c]));

describe('purchase lines (§16.3)', () => {
  it('unit cost per base unit for decimals 0-3', () => {
    expect(purchaseLineUnitCost({ amount: 900, lineTotal: 13500, decimals: 0 })).toBe(15);
    expect(purchaseLineUnitCost({ amount: 25000, lineTotal: 15000, decimals: 3 })).toBe(600); // 25 kg for €150 = €6/kg
    expect(purchaseLineUnitCost({ amount: 150, lineTotal: 300, decimals: 2 })).toBe(200);
    expect(purchaseLineUnitCost({ amount: 3, lineTotal: 100, decimals: 1 })).toBe(333.3333);
  });
  it('total is the sum of line totals', () => {
    expect(purchaseTotal([line('lid', 900, 13500), line('fuel', 1, 4000)])).toBe(17500);
  });
  it('expense items have neither stock nor sales', () => {
    expect(isExpenseItem(fuel)).toBe(true);
    expect(isExpenseItem(lid)).toBe(false);
    expect(isExpenseItem(cls('x', 0, { trackStock: false, sellable: true }))).toBe(false);
  });
  it('validates lines', () => {
    expect(validatePurchase({ lines: [] })).toEqual(['add at least one line']);
    expect(validatePurchase({ lines: [line('lid', 0, 100)] })).toEqual(['amounts must be > 0']);
    expect(validatePurchase({ lines: [line('lid', 1, -1)] })).toEqual(['totals must be €0 to €1,000,000']);
    expect(validatePurchase({ lines: [line('lid', 1, 100_000_001)] })).toEqual(['totals must be €0 to €1,000,000']);
    expect(validatePurchase({ lines: [line('lid', 900, 13500), line('fuel', 1, 0)] })).toEqual([]);
  });
});

describe('purchases on the stock timeline (§16.3)', () => {
  it('raise stock and set the average: 900 @ €0.15 + 200 @ €0.25 = €0.1682', () => {
    const ps = [purchase('2026-11-01', [line('lid', 900, 13500)]), purchase('2026-11-02', [line('lid', 200, 5000)])];
    const t = classTimeline(lid, [], [], byId, ps);
    expect(t.map((m) => [m.kind, m.balanceAfter, m.avgCostAfter])).toEqual([['purchase', 900, 15], ['purchase', 1100, 16.8182]]);
    expect(t[0].ref).toEqual({ type: 'purchase', id: ps[0].id });
    expect(t[0].supplierName).toBe('Envases');
  });
  it('mix with adds without cost (current average) and sales', () => {
    const ps = [purchase('2026-11-01', [line('lid', 900, 13500)])];
    const snap = stockSnapshot([lid], [sale('2026-11-03', 'lid', 100)], [add('2026-11-02', 'lid', 200, null)], ps);
    expect(snap.get('lid')).toMatchObject({ stock: 1000, avgCost: 15 });
  });
  it('apply the negative reset', () => {
    const t = classTimeline(lid, [sale('2026-11-01', 'lid', 8)], [], byId, [purchase('2026-11-05', [line('lid', 20, 300)])]);
    expect(t[1]).toMatchObject({ kind: 'purchase', reset: true, balanceAfter: 20, avgCostAfter: 15 });
  });
  it('a voided purchase is ignored', () => {
    const ps = [purchase('2026-11-01', [line('lid', 900, 13500)]), purchase('2026-11-02', [line('lid', 200, 5000)], { voided: true })];
    expect(stockSnapshot([lid], [], [], ps).get('lid')).toMatchObject({ stock: 900, avgCost: 15 });
  });
  it('two lines of one class in a purchase count as one entry with the blended cost', () => {
    const t = classTimeline(lid, [], [], byId, [purchase('2026-11-01', [line('lid', 100, 1000), line('lid', 100, 3000)])]);
    expect(t.map((m) => [m.amount, m.avgCostAfter])).toEqual([[200, 20]]);
  });
  it('expense lines have no stock effect', () => {
    const snap = stockSnapshot([lid, fuel], [], [], [purchase('2026-11-01', [line('fuel', 1, 4000)])]);
    expect(snap.has('fuel')).toBe(false);
    expect(snap.get('lid')).toMatchObject({ stock: 0, avgCost: null });
  });
  it('averageCostAt sees purchases up to the date', () => {
    const ps = [purchase('2026-11-01', [line('lid', 900, 13500)]), purchase('2026-11-10', [line('lid', 900, 22500)])];
    expect(averageCostAt(lid, [], [], byId, { date: '2026-11-05', createdAt: '~' }, ps)).toBe(15);
    expect(averageCostAt(lid, [], [], byId, undefined, ps)).toBe(20);
  });
});
