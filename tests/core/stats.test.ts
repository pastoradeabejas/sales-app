import { describe, expect, it } from 'vitest';
import type { Client, Order, OrderLine, Payment } from '../../src/core/types.ts';
import { allocateAll } from '../../src/core/payments.ts';
import {
  autoBucket,
  bucketStart,
  buckets,
  clientStats,
  collected,
  goneQuiet,
  inRange,
  owedSummary,
  profit,
  profitSummary,
  rangeFor,
  revenue,
  timeSeries,
  topClients,
  unitsBought,
  unitsSold,
  variantMix,
  whoOwes,
} from '../../src/core/stats.ts';

const stamp = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', updatedBy: 't' };

// Honey (kg, 2 decimals): fixed "Jar" = 0.5 kg (50 scaled), variable "Bulk".
function jar(qty: number, unitCost: number | null = null, classId = 'honey'): OrderLine {
  return {
    lineId: 'l', classId, variantId: classId + '-jar', className: classId, variantLabel: 'Jar', kind: 'fixed',
    unitName: 'kg', decimals: 2, quantity: qty, amount: qty * 50, unitPrice: 500, unitCost, lineTotal: qty * 500,
  };
}
function bulk(amount: number, unitCost: number | null = null): OrderLine {
  return {
    lineId: 'l', classId: 'honey', variantId: 'honey-bulk', className: 'honey', variantLabel: 'Bulk', kind: 'variable',
    unitName: 'kg', decimals: 2, quantity: null, amount, unitPrice: 800, unitCost, lineTotal: Math.round((amount * 800) / 100),
  };
}
function order(id: string, date: string, clientId: string, lines: OrderLine[], extra: Partial<Order> = {}): Order {
  return {
    id, schema: 1, date, clientId, clientName: clientId.toUpperCase(), lines,
    total: lines.reduce((s, l) => s + l.lineTotal, 0), note: '', voided: false, voidReason: null, ...stamp, ...extra,
  };
}
function pay(id: string, date: string, clientId: string, amount: number, orderId: string | null = null, extra: Partial<Payment> = {}): Payment {
  return { id, schema: 1, date, clientId, orderId, amount, method: 'cash', note: '', voided: false, ...stamp, ...extra };
}
const client = (id: string): Client => ({ id, schema: 1, name: id.toUpperCase(), phone: '', notes: '', tags: [], archived: false, ...stamp });

describe('ranges', () => {
  it('rangeFor week is Monday-based', () => {
    expect(rangeFor('week', '2026-11-24')).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(rangeFor('week', '2026-11-29')).toEqual({ from: '2026-11-23', to: '2026-11-29' }); // Sunday
    expect(rangeFor('week', '2026-03-01')).toEqual({ from: '2026-02-23', to: '2026-03-01' }); // across month end
    expect(rangeFor('week', '2026-01-01')).toEqual({ from: '2025-12-29', to: '2026-01-04' }); // across year end
  });
  it('rangeFor month and year', () => {
    expect(rangeFor('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(rangeFor('month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(rangeFor('year', '2026-06-15')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
  it('inRange is inclusive', () => {
    const r = { from: '2026-05-01', to: '2026-05-31' };
    expect(inRange('2026-05-01', r)).toBe(true);
    expect(inRange('2026-05-31', r)).toBe(true);
    expect(inRange('2026-04-30', r)).toBe(false);
    expect(inRange('2026-06-01', r)).toBe(false);
  });
});

describe('buckets', () => {
  it('autoBucket thresholds', () => {
    expect(autoBucket({ from: '2026-05-01', to: '2026-05-31' })).toBe('day'); // 31 days
    expect(autoBucket({ from: '2026-05-01', to: '2026-06-01' })).toBe('week'); // 32 days
    expect(autoBucket({ from: '2026-01-01', to: '2026-07-02' })).toBe('week'); // 183 days
    expect(autoBucket({ from: '2026-01-01', to: '2026-07-03' })).toBe('month'); // 184 days
  });
  it('bucketStart', () => {
    expect(bucketStart('2026-05-17', 'day')).toBe('2026-05-17');
    expect(bucketStart('2026-11-29', 'week')).toBe('2026-11-23'); // Sunday
    expect(bucketStart('2026-11-30', 'week')).toBe('2026-11-30'); // Monday
    expect(bucketStart('2026-03-01', 'week')).toBe('2026-02-23');
    expect(bucketStart('2026-01-01', 'week')).toBe('2025-12-29');
    expect(bucketStart('2026-05-17', 'month')).toBe('2026-05-01');
  });
  it('buckets cover the range', () => {
    expect(buckets({ from: '2026-05-30', to: '2026-06-02' }, 'day')).toEqual(['2026-05-30', '2026-05-31', '2026-06-01', '2026-06-02']);
    expect(buckets({ from: '2026-11-25', to: '2026-12-08' }, 'week')).toEqual(['2026-11-23', '2026-11-30', '2026-12-07']);
    expect(buckets({ from: '2026-12-15', to: '2027-02-03' }, 'month')).toEqual(['2026-12-01', '2027-01-01', '2027-02-01']);
  });
});

const may = { from: '2026-05-01', to: '2026-05-31' };

describe('revenue and collected', () => {
  const orders = [
    order('o1', '2026-05-02', 'a', [jar(2), bulk(100)]), // 1000 + 800
    order('o2', '2026-05-31', 'b', [jar(1)]), // 500
    order('o3', '2026-06-01', 'a', [jar(9)]), // out of range
    order('o4', '2026-05-10', 'a', [jar(5)], { voided: true }),
  ];
  it('sums order totals in range, voided excluded', () => {
    expect(revenue(orders, may)).toBe(2300);
  });
  it('filters by class, variant and client', () => {
    expect(revenue(orders, may, { classId: 'honey' })).toBe(2300);
    expect(revenue(orders, may, { variantId: 'honey-bulk' })).toBe(800);
    expect(revenue(orders, may, { clientId: 'b' })).toBe(500);
    expect(revenue(orders, may, { classId: 'other' })).toBe(0);
  });
  it('collected sums payments in range, voided excluded', () => {
    const ps = [pay('p1', '2026-05-03', 'a', 300), pay('p2', '2026-06-01', 'a', 100), pay('p3', '2026-05-04', 'b', 50), pay('p4', '2026-05-05', 'a', 999, null, { voided: true })];
    expect(collected(ps, may)).toBe(350);
    expect(collected(ps, may, 'a')).toBe(300);
  });
});

describe('unitsSold', () => {
  // o1 total 1500 (3 jars), paid 600 -> fraction 0.4. o2 unpaid, 1 jar + 100 bulk.
  const orders = [order('o1', '2026-05-02', 'a', [jar(3)]), order('o2', '2026-05-03', 'b', [jar(1), bulk(100)]), order('o3', '2026-05-04', 'a', [jar(7)], { voided: true })];
  const payments = [pay('p1', '2026-05-02', 'a', 600, 'o1')];
  const balances = allocateAll(orders, payments);

  it('splits paid and unpaid by paidFraction', () => {
    const [honey] = unitsSold(orders, balances, may);
    expect(honey).toMatchObject({ classId: 'honey', unitName: 'kg', decimals: 2, amount: 300 });
    const j = honey.variants.find((v) => v.variantId === 'honey-jar')!;
    expect(j).toMatchObject({ label: 'Jar', kind: 'fixed', quantity: 4, amount: 200 });
    expect(j.paidQty).toBeCloseTo(1.2);
    expect(j.unpaidQty).toBeCloseTo(2.8);
    expect(j.paidAmount).toBeCloseTo(60);
    expect(j.unpaidAmount).toBeCloseTo(140);
    const b = honey.variants.find((v) => v.variantId === 'honey-bulk')!;
    expect(b).toMatchObject({ kind: 'variable', quantity: null, amount: 100, paidAmount: 0, unpaidAmount: 100 });
  });
  it('sorts classes by amount desc and honours filters', () => {
    const more = [...orders, order('o5', '2026-05-05', 'a', [jar(1, null, 'tea')])];
    const res = unitsSold(more, allocateAll(more, payments), may);
    expect(res.map((c) => c.classId)).toEqual(['honey', 'tea']);
    expect(unitsSold(more, allocateAll(more, payments), may, { clientId: 'b' })[0].amount).toBe(150);
    expect(unitsSold(more, allocateAll(more, payments), may, { variantId: 'honey-bulk' })[0].variants).toHaveLength(1);
  });
});

describe('timeSeries', () => {
  const orders = [
    order('o1', '2026-05-04', 'a', [jar(2)]), // Mon, 1000, fully paid
    order('o2', '2026-05-06', 'a', [jar(2)]), // 1000, half paid
    order('o3', '2026-05-20', 'b', [jar(1), bulk(100)]), // unpaid
    order('o4', '2026-05-21', 'b', [jar(9)], { voided: true }),
  ];
  const payments = [pay('p1', '2026-05-04', 'a', 1000, 'o1'), pay('p2', '2026-05-07', 'a', 500, 'o2'), pay('p3', '2026-05-22', 'b', 70)];
  const balances = allocateAll(orders, payments);

  it('revenue by day sums to total with paid/unpaid split', () => {
    const s = timeSeries(orders, payments, balances, may, 'revenue');
    expect(s).toHaveLength(31);
    expect(s.reduce((t, b) => t + b.total, 0)).toBe(revenue(orders, may));
    const d = s.find((b) => b.start === '2026-05-06')!;
    expect(d).toMatchObject({ paid: 500, unpaid: 500, total: 1000, orderIds: ['o2'] });
    expect(s.find((b) => b.start === '2026-05-05')).toMatchObject({ total: 0, orderIds: [] });
  });
  it('weekly buckets for units and amount', () => {
    const s = timeSeries(orders, payments, balances, may, 'units', undefined, 'week');
    expect(s.map((b) => b.start)).toEqual(['2026-04-27', '2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25']);
    expect(s[1]).toMatchObject({ total: 4, paid: 3, unpaid: 1 });
    expect(s[3].total).toBe(1); // bulk has no item count
    const a = timeSeries(orders, payments, balances, may, 'amount', undefined, 'week');
    expect(a.reduce((t, b) => t + b.total, 0)).toBe(100 + 100 + 50 + 100);
  });
  it('collected has paid = total', () => {
    const s = timeSeries(orders, payments, balances, may, 'collected');
    expect(s.reduce((t, b) => t + b.total, 0)).toBe(collected(payments, may));
    expect(s.find((b) => b.start === '2026-05-22')).toMatchObject({ paid: 70, unpaid: 0, total: 70 });
  });
});

describe('variantMix and topClients', () => {
  const orders = [
    order('o1', '2026-05-02', 'a', [jar(2), bulk(100)]),
    order('o2', '2026-05-03', 'b', [jar(6)]),
    order('o3', '2026-05-04', 'c', [jar(1)]),
    order('o4', '2026-05-05', 'c', [jar(50)], { voided: true }),
  ];
  it('variant mix shares sum to 1', () => {
    const mix = variantMix(orders, 'honey', may);
    expect(mix).toEqual([
      { variantId: 'honey-jar', label: 'Jar', amount: 450, share: 450 / 550 },
      { variantId: 'honey-bulk', label: 'Bulk', amount: 100, share: 100 / 550 },
    ]);
    expect(variantMix(orders, 'nope', may)).toEqual([]);
  });
  it('top clients by revenue and amount', () => {
    expect(topClients(orders, may, 'revenue', 2)).toEqual([
      { clientId: 'b', clientName: 'B', value: 3000 },
      { clientId: 'a', clientName: 'A', value: 1800 },
    ]);
    expect(topClients(orders, may, 'amount')[0]).toEqual({ clientId: 'b', clientName: 'B', value: 300 });
    expect(topClients(orders, may, 'revenue', 5, 'tea')).toEqual([]);
    expect(topClients(orders, may, 'revenue', 5, 'honey')).toHaveLength(3);
  });
});

describe('owed', () => {
  const today = '2026-06-30';
  const orders = [
    order('o1', '2026-05-01', 'a', [jar(2)]), // 1000, 60 days old, unpaid
    order('o2', '2026-06-25', 'a', [jar(1)]), // 500, 5 days
    order('o3', '2026-06-01', 'b', [jar(4)]), // 2000, 29 days, partial 500
    order('o4', '2026-06-02', 'c', [jar(1)]), // paid
    order('o5', '2026-06-03', 'a', [jar(9)], { voided: true }),
  ];
  const payments = [pay('p1', '2026-06-02', 'b', 500, 'o3'), pay('p2', '2026-06-02', 'c', 700, 'o4')];
  const balances = allocateAll(orders, payments);

  it('whoOwes sorts by owed desc', () => {
    expect(whoOwes(balances, orders, today)).toEqual([
      { clientId: 'b', clientName: 'B', owed: 1500, orderCount: 1, oldestDays: 29 },
      { clientId: 'a', clientName: 'A', owed: 1500, orderCount: 2, oldestDays: 60 },
    ].sort((x, y) => y.owed - x.owed || (x.clientId < y.clientId ? -1 : 1)));
    expect(whoOwes(balances, orders, today, 1)).toHaveLength(1);
  });
  it('owedSummary', () => {
    expect(owedSummary(balances, orders, today)).toEqual({ totalOwed: 3000, clients: 2, unpaidOrders: 3, over30: 1, creditHeld: 200 });
  });
});

describe('goneQuiet', () => {
  const today = '2026-06-30'; // 45 days earlier = 2026-05-16
  const three = (c: string, last: string) => [order(c + '1', '2026-01-01', c, []), order(c + '2', '2026-02-01', c, []), order(c + '3', last, c, [])];
  const orders = [...three('a', '2026-05-16'), ...three('b', '2026-05-15'), ...three('c', '2026-06-20'), order('d1', '2026-01-01', 'd', []), order('d2', '2026-01-02', 'd', []), ...three('e', '2026-01-03').map((o) => ({ ...o, voided: true }))];
  const clients = ['a', 'b', 'c', 'd', 'e'].map(client);
  it('needs 3+ orders and more than 45 days of silence', () => {
    const q = goneQuiet(orders, clients, today);
    expect(q.map((c) => c.clientId)).toEqual(['b']); // a is exactly 45 days: not yet
    expect(q[0]).toMatchObject({ clientName: 'B', lastOrderDate: '2026-05-15', orderCount: 3 });
  });
});

describe('client stats', () => {
  const orders = [
    order('o1', '2026-05-01', 'a', [jar(2), bulk(100)]), // 1800
    order('o2', '2026-05-10', 'a', [jar(1)]), // 500
    order('o3', '2026-05-12', 'a', [jar(1)], { voided: true }),
    order('o4', '2026-05-11', 'b', [jar(1)]),
  ];
  const payments = [pay('p1', '2026-05-05', 'a', 1800, 'o1')];
  const balances = allocateAll(orders, payments);
  it('clientStats', () => {
    expect(clientStats(orders, balances, 'a', '2026-06-01')).toEqual({ totalSpent: 2300, avgDaysToPay: 4, firstOrder: '2026-05-01', lastOrder: '2026-05-10', orderCount: 2 });
    expect(clientStats(orders, balances, 'zz', '2026-06-01')).toEqual({ totalSpent: 0, avgDaysToPay: null, firstOrder: null, lastOrder: null, orderCount: 0 });
  });
  it('unitsBought per variant, voided excluded', () => {
    expect(unitsBought(orders, 'a')).toEqual([
      { classId: 'honey', className: 'honey', variantId: 'honey-jar', label: 'Jar', kind: 'fixed', quantity: 3, amount: 150, unitName: 'kg', decimals: 2 },
      { classId: 'honey', className: 'honey', variantId: 'honey-bulk', label: 'Bulk', kind: 'variable', quantity: null, amount: 100, unitName: 'kg', decimals: 2 },
    ]);
  });
});

describe('profit', () => {
  it('uses only lines with known cost and reports coverage', () => {
    const orders = [
      order('o1', '2026-05-02', 'a', [jar(2, 300), bulk(100, 450)]), // jars 1000 (cost 600), bulk 800 (cost 450)
      order('o2', '2026-05-03', 'a', [jar(2)]), // unknown cost, 1000
      order('o3', '2026-05-04', 'a', [jar(2, 100)], { voided: true }),
      order('o4', '2026-06-04', 'a', [jar(2, 100)]),
    ];
    const p = profit(orders, may);
    expect(p).toEqual({ revenueWithCost: 1800, cost: 1050, profit: 750, coveredShare: 1800 / 2800 });
  });
  it('rounds half up and handles no revenue', () => {
    const o = order('o1', '2026-05-02', 'a', [jar(1, 100.5)]);
    expect(profit([o], may).cost).toBe(101);
    expect(profit([], may)).toEqual({ revenueWithCost: 0, cost: 0, profit: 0, coveredShare: 0 });
    expect(profit([o], may, { classId: 'other' }).coveredShare).toBe(0);
  });
});

describe('profitSummary (§16.6)', () => {
  const cls = (id: string, trackStock: boolean, sellable: boolean) => ({ id, trackStock, sellable }) as any;
  const classes = new Map([['lid', cls('lid', true, false)], ['fuel', cls('fuel', false, false)], ['honey', cls('honey', true, true)]]);
  const pl = (classId: string, lineTotal: number) => ({ lineId: 'x', classId, className: classId, unitName: 'pcs', decimals: 0, amount: 1, lineTotal });
  const purchase = (id: string, date: string, lines: ReturnType<typeof pl>[], voided = false) => ({
    id, schema: 1, date, supplierId: null, supplierName: '', lines, total: lines.reduce((s, l) => s + l.lineTotal, 0),
    method: 'cash', note: '', voided, ...stamp,
  }) as any;
  const transform = (id: string, date: string, labour: number[], voided = false) => ({
    id, schema: 1, date, type: 'transform', inputs: [], outputs: [], recipeId: null, note: '', voided, ...stamp,
    costs: { mode: 'breakdown', materials: 0, materialsComplete: true, extras: [], total: 0, allocation: [],
      labour: labour.map((amount) => ({ levelId: 'L', levelName: 'L', minutes: 1, hourlyRate: 1, amount })) },
  }) as any;

  it('sales, cost of goods, gross, expenses, net, labour and spent over the range', () => {
    const orders = [
      order('o1', '2026-05-03', 'a', [jar(4, 300), jar(2)]), // 2000 with cost 1200, 1000 unknown
      order('o2', '2026-06-01', 'a', [jar(1, 300)]), // outside
      order('o3', '2026-05-09', 'a', [jar(10, 300)], { voided: true }),
    ];
    const purchases = [
      purchase('p1', '2026-05-02', [pl('lid', 13500), pl('fuel', 4000)]),
      purchase('p2', '2026-05-20', [pl('fuel', 2500)]),
      purchase('p3', '2026-05-21', [pl('fuel', 9999)], true),
      purchase('p4', '2026-04-30', [pl('fuel', 1000)]),
    ];
    const events = [transform('t1', '2026-05-05', [8000, 169]), transform('t2', '2026-05-06', [500], true), transform('t3', '2026-06-01', [700])];
    expect(profitSummary(orders, purchases, events, classes, may)).toEqual({
      sales: 3000, cogs: 1200, coveredShare: 2000 / 3000, gross: 800,
      expenses: 6500, net: -5700, labour: 8169, spent: 20000,
    });
  });
  it('is all zero with no records', () => {
    expect(profitSummary([], [], [], classes, may)).toEqual({ sales: 0, cogs: 0, coveredShare: 0, gross: 0, expenses: 0, net: 0, labour: 0, spent: 0 });
  });
});
