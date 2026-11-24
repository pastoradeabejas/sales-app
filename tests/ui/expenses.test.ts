import { describe, expect, it } from 'vitest';
import type { ProductClass, Purchase, PurchaseLine, Supplier } from '../../src/core/types.ts';
import {
  buildPurchaseLine,
  filterPurchases,
  filterSuppliers,
  groupPurchasesByDay,
  matchSuppliers,
  monthName,
  pickableClasses,
  purchaseSummary,
  recentSuppliers,
  spentIn,
  stockHint,
  supplierRows,
} from '../../src/ui/screens/expenses/logic.ts';

const sup = (id: string, name: string, extra: Partial<Supplier> = {}): Supplier => ({ id, name, phone: '', notes: '', archived: false, ...extra }) as Supplier;
const line = (name: string, extra: Partial<PurchaseLine> = {}): PurchaseLine =>
  ({ lineId: name, classId: name, className: name, unitName: 'pcs', decimals: 0, amount: 1, lineTotal: 100, ...extra }) as PurchaseLine;
const pur = (id: string, date: string, extra: Partial<Purchase> = {}): Purchase =>
  ({ id, date, createdAt: `${date}T10:00:0${id}`, supplierId: null, supplierName: '', lines: [line('Fuel')], total: 100, note: '', voided: false, ...extra }) as Purchase;
const cls = (id: string, extra: Partial<ProductClass> = {}): ProductClass =>
  ({ id, name: id, trackStock: true, sellable: false, archived: false, unit: { name: 'pcs', decimals: 0 }, ...extra }) as ProductClass;

describe('spentIn / monthName', () => {
  const ps = [pur('1', '2026-11-03', { total: 500 }), pur('2', '2026-11-20', { total: 250, voided: true }), pur('3', '2026-10-30', { total: 900 })];
  it('sums non-voided purchases of a month or year', () => {
    expect(spentIn(ps, '2026-11')).toBe(500);
    expect(spentIn(ps, '2026')).toBe(1400);
  });
  it('filters by supplier', () => {
    expect(spentIn([pur('1', '2026-11-03', { supplierId: 'a', total: 7 }), pur('2', '2026-11-03', { total: 9 })], '2026', 'a')).toBe(7);
  });
  it('names the month', () => expect(monthName('2026-11-24')).toBe('November'));
});

describe('purchaseSummary', () => {
  it('shows amounts for tracked lines and only the name for expense items', () => {
    const lines = [line('Packaging - Lid', { amount: 900 }), line('Fuel')];
    expect(purchaseSummary(lines, (l) => l.className === 'Fuel')).toBe('Packaging - Lid 900 pcs, Fuel');
  });
});

describe('filterPurchases', () => {
  const ps = [
    pur('1', '2026-11-03', { supplierName: 'Ñandú Ltd' }),
    pur('2', '2026-11-04', { lines: [line('Lid')], note: 'urgent' }),
    pur('3', '2026-11-05', { voided: true }),
  ];
  it('hides voided unless asked', () => {
    expect(filterPurchases(ps, '', false).map((p) => p.id)).toEqual(['1', '2']);
    expect(filterPurchases(ps, '', true)).toHaveLength(3);
  });
  it('searches supplier, line and note accent-insensitively', () => {
    expect(filterPurchases(ps, 'nandu', false).map((p) => p.id)).toEqual(['1']);
    expect(filterPurchases(ps, 'lid', false).map((p) => p.id)).toEqual(['2']);
    expect(filterPurchases(ps, 'URGENT', false).map((p) => p.id)).toEqual(['2']);
  });
});

describe('groupPurchasesByDay', () => {
  it('groups newest first with labels', () => {
    const g = groupPurchasesByDay([pur('1', '2026-11-22'), pur('2', '2026-11-24'), pur('3', '2026-11-23'), pur('4', '2026-11-24')], '2026-11-24');
    expect(g.map((x) => x.label)).toEqual(['Today', 'Yesterday', '22 Nov 2026']);
    expect(g[0].purchases.map((p) => p.id)).toEqual(['4', '2']);
  });
});

describe('suppliers', () => {
  const ss = [sup('a', 'Ana'), sup('b', 'Bruno'), sup('c', 'Álvaro', { archived: true })];
  const ps = [
    pur('1', '2026-11-01', { supplierId: 'b' }),
    pur('2', '2026-11-10', { supplierId: 'a' }),
    pur('3', '2026-12-01', { supplierId: 'b', voided: true }),
    pur('4', '2026-06-01', { supplierId: 'b', total: 300 }),
  ];
  it('recent: by last use, non-archived, max n', () => {
    expect(recentSuppliers(ss, ps).map((s) => s.id)).toEqual(['a', 'b']);
    expect(recentSuppliers(ss, ps, 1).map((s) => s.id)).toEqual(['a']);
  });
  it('match: non-archived, accent-insensitive, prefix first', () => {
    expect(matchSuppliers(ss, 'an').map((s) => s.id)).toEqual(['a']);
    expect(matchSuppliers(ss, 'alvaro')).toEqual([]);
    expect(matchSuppliers(ss, '')).toEqual([]);
  });
  it('filter: search and archived toggle', () => {
    expect(filterSuppliers(ss, '', false).map((s) => s.id)).toEqual(['a', 'b']);
    expect(filterSuppliers(ss, 'alva', true).map((s) => s.id)).toEqual(['c']);
  });
  it('rows: last purchase and spent this year', () => {
    const r = supplierRows(ss, ps, '2026-11-24');
    expect(r.find((x) => x.supplier.id === 'b')).toMatchObject({ last: '2026-11-01', spentYear: 400 });
    expect(r.find((x) => x.supplier.id === 'c')).toMatchObject({ last: null, spentYear: 0 });
  });
});

describe('pickableClasses', () => {
  it('keeps non-archived tracked or expense classes', () => {
    const cs = [cls('a'), cls('b', { archived: true }), cls('c', { trackStock: false }), cls('d', { trackStock: false, sellable: true })];
    expect(pickableClasses(cs).map((c) => c.id)).toEqual(['a', 'c']);
  });
});

describe('buildPurchaseLine', () => {
  const lid = cls('Lid', { group: 'Packaging' });
  const fuel = cls('Fuel', { trackStock: false });
  it('builds a tracked line with the class snapshot', () => {
    const r = buildPurchaseLine(lid, '900', '135,50', 'L1');
    expect(r.errors).toEqual([]);
    expect(r.line).toMatchObject({ lineId: 'L1', classId: 'Lid', className: 'Packaging - Lid', unitName: 'pcs', decimals: 0, amount: 900, lineTotal: 13550 });
  });
  it('expense items always have amount 1 scaled', () => {
    const r = buildPurchaseLine({ ...fuel, unit: { name: 'l', decimals: 2 } } as ProductClass, '', '20', 'L2');
    expect(r.line.amount).toBe(100);
    expect(r.errors).toEqual([]);
  });
  it('reports invalid inputs', () => {
    expect(buildPurchaseLine(lid, 'x', '5', 'L').errors).toEqual(['Enter an amount for Packaging - Lid']);
    expect(buildPurchaseLine(lid, '5', '', 'L').errors).toEqual(['Enter the total paid for Packaging - Lid']);
  });
});

describe('stockHint', () => {
  it('shows current to new stock', () => expect(stockHint(921, 900, 0, 'pcs', 'Lid')).toBe('Lid: 921 → 1,821 pcs'));
});
