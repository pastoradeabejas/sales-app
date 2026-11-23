import { describe, expect, it } from 'vitest';
import type { Decimals, Order, ProductClass, StockAdjust, StockEvent, StockTransform, TransformCosts } from '../../src/core/types.ts';
import {
  classTimeline,
  daysLeft,
  isLowStock,
  sellRate,
  stockSnapshot,
  stockWarnings,
  validateTransform,
} from '../../src/core/stock.ts';

const stamp = (date: string, time = '10:00') => ({
  createdAt: `${date}T${time}:00.000Z`,
  updatedAt: `${date}T${time}:00.000Z`,
  updatedBy: 'test',
  schema: 1,
});

let seq = 0;
const nextId = () => `id${String(++seq).padStart(4, '0')}`;

function cls(id: string, decimals: Decimals = 0, extra: Partial<ProductClass> = {}): ProductClass {
  return {
    id, ...stamp('2026-01-01'), name: id, unit: { name: decimals ? 'kg' : 'pcs', decimals },
    lowStockThreshold: null, trackStock: true, sellable: true, customFields: [], customValues: {},
    notes: '', archived: false, variants: [], ...extra,
  };
}

function order(date: string, lines: [string, number][], extra: Partial<Order> = {}, time?: string): Order {
  return {
    id: nextId(), ...stamp(date, time), date, clientId: 'c1', clientName: 'Lucía',
    lines: lines.map(([classId, amount], i) => ({
      lineId: `l${i}`, classId, variantId: 'v', className: classId, variantLabel: 'v', kind: 'variable',
      unitName: 'u', decimals: 0, quantity: null, amount, unitPrice: 100, unitCost: null, lineTotal: 0,
    })),
    total: 0, note: '', voided: false, voidReason: null, ...extra,
  };
}

function add(date: string, classId: string, amount: number, unitCost: number | null = null, extra: Partial<StockAdjust> = {}, time?: string): StockAdjust {
  return { id: nextId(), ...stamp(date, time), date, type: 'add', classId, amount, unitCost, reason: '', note: '', voided: false, ...extra };
}

function remove(date: string, classId: string, amount: number, reason = 'waste', time?: string): StockAdjust {
  return { id: nextId(), ...stamp(date, time), date, type: 'remove', classId, amount, unitCost: null, reason, note: '', voided: false };
}

function transform(
  date: string, inputs: [string, number][], outputs: [string, number][],
  costs: TransformCosts | null = null, extra: Partial<StockTransform> = {}, time?: string,
): StockTransform {
  return {
    id: nextId(), ...stamp(date, time), date, type: 'transform',
    inputs: inputs.map(([classId, amount]) => ({ classId, amount })),
    outputs: outputs.map(([classId, amount]) => ({ classId, amount })),
    recipeId: null, costs, note: '', voided: false, ...extra,
  };
}

const costsOf = (total: number, allocation: [string, number][], materialsComplete = true): TransformCosts => ({
  mode: 'total', materials: 0, materialsComplete, extras: [], total,
  allocation: allocation.map(([classId, share]) => ({ classId, share })),
});

const byId = (...classes: ProductClass[]) => new Map(classes.map((c) => [c.id, c]));

const pcs = cls('pcs');
const milk = cls('milk', 3, { sellable: false });
const sugar = cls('sugar', 3, { sellable: false });
const yogurt = cls('yogurt');
const cheese = cls('cheese', 3);
const whey = cls('whey', 3);
const all = byId(pcs, milk, sugar, yogurt, cheese, whey);

const timeline = (c: ProductClass, orders: Order[], events: StockEvent[]) => classTimeline(c, orders, events, all);
const last = <T>(xs: T[]) => xs[xs.length - 1];

describe('classTimeline: running balance', () => {
  it('resets a negative balance on the next add: −8 then +20 = 20', () => {
    const t = timeline(pcs, [order('2026-11-01', [['pcs', 8]])], [add('2026-11-08', 'pcs', 20)]);
    expect(t.map((m) => [m.kind, m.delta, m.balanceBefore, m.balanceAfter, m.reset])).toEqual([
      ['sale', -8, 0, -8, false],
      ['add', 20, -8, 20, true],
    ]);
  });

  it('places a backdated order before an earlier-entered add', () => {
    const addEv = add('2026-11-10', 'pcs', 20);
    const late = order('2026-11-05', [['pcs', 5]], {}, '23:00');
    late.createdAt = '2026-11-20T10:00:00.000Z';
    const t = timeline(pcs, [late], [addEv]);
    expect(t.map((m) => m.kind)).toEqual(['sale', 'add']);
    expect(last(t).balanceAfter).toBe(20);
    const after = order('2026-11-15', [['pcs', 5]]);
    expect(last(timeline(pcs, [after], [addEv])).balanceAfter).toBe(15);
  });

  it('resets a negative balance on a transform output', () => {
    const t = timeline(yogurt, [order('2026-11-01', [['yogurt', 30]])], [transform('2026-11-02', [['milk', 500000]], [['yogurt', 10000]])]);
    expect(last(t)).toMatchObject({ kind: 'transform-in', balanceBefore: -30, balanceAfter: 10000, reset: true, otherClassIds: ['milk'] });
  });

  it('derives stock from mixed events and sales, voided excluded, may end negative', () => {
    const orders = [
      order('2026-11-02', [['milk', 1370], ['pcs', 3]]),
      order('2026-11-03', [['milk', 9999]], { voided: true }),
      order('2026-11-06', [['milk', 9000]]),
    ];
    const events = [
      add('2026-11-01', 'milk', 12000),
      remove('2026-11-04', 'milk', 500),
      add('2026-11-04', 'milk', 7777, null, { voided: true }),
      transform('2026-11-05', [['milk', 3000]], [['yogurt', 60]]),
    ];
    const t = timeline(milk, orders, events);
    expect(t.map((m) => [m.kind, m.balanceAfter])).toEqual([
      ['add', 12000], ['sale', 10630], ['remove', 10130], ['transform-out', 7130], ['sale', -1870],
    ]);
    expect(t[2].reason).toBe('waste');
    expect(t[3].otherClassIds).toEqual(['yogurt']);
    expect(t[1]).toMatchObject({ amount: 1370, delta: -1370, clientName: 'Lucía', ref: { type: 'order', id: orders[0].id } });
  });

  it('sorts same-date entries by createdAt', () => {
    const t = timeline(pcs, [order('2026-11-01', [['pcs', 5]], {}, '09:00')], [add('2026-11-01', 'pcs', 10, null, {}, '12:00')]);
    expect(t.map((m) => m.balanceAfter)).toEqual([-5, 10]);
  });

  it('sums several lines of one class in one order into one sale', () => {
    const t = timeline(pcs, [order('2026-11-01', [['pcs', 2], ['pcs', 3]])], []);
    expect(t).toHaveLength(1);
    expect(t[0].amount).toBe(5);
  });

  it('returns [] for a class with trackStock false', () => {
    const off = cls('off', 0, { trackStock: false });
    expect(classTimeline(off, [order('2026-11-01', [['off', 1]])], [add('2026-11-01', 'off', 5)], byId(off))).toEqual([]);
  });
});

describe('classTimeline: average cost', () => {
  it('updates on adds with cost, keeps it on adds without cost, sales and removes', () => {
    const t = timeline(pcs, [order('2026-11-03', [['pcs', 5]])], [
      add('2026-11-01', 'pcs', 10, 100),
      add('2026-11-02', 'pcs', 10),
      remove('2026-11-04', 'pcs', 5),
      add('2026-11-05', 'pcs', 10, 250),
    ]);
    expect(t.map((m) => m.avgCostAfter)).toEqual([100, 100, 100, 100, (10 * 100 + 10 * 250) / 20]);
  });

  it('is unknown until a cost is entered', () => {
    const t = timeline(pcs, [], [add('2026-11-01', 'pcs', 10), add('2026-11-02', 'pcs', 10, 50)]);
    expect(t.map((m) => m.avgCostAfter)).toEqual([null, 50]);
  });

  it('rounds to 4 decimals and works in base units', () => {
    const t = timeline(pcs, [], [add('2026-11-01', 'pcs', 3, 100), add('2026-11-02', 'pcs', 6, 101)]);
    expect(last(t).avgCostAfter).toBe(100.6667);
    const k = timeline(milk, [], [add('2026-11-01', 'milk', 1500, 400), add('2026-11-02', 'milk', 500, 800)]);
    expect(last(k).avgCostAfter).toBe(500);
  });

  it('uses balance 0 after a negative reset', () => {
    const t = timeline(pcs, [order('2026-11-02', [['pcs', 15]])], [add('2026-11-01', 'pcs', 10, 100), add('2026-11-03', 'pcs', 10, 300)]);
    expect(last(t)).toMatchObject({ reset: true, balanceAfter: 10, avgCostAfter: 300 });
  });

  it('transform output with costs: unit cost = total × share / output base units', () => {
    const t = timeline(yogurt, [], [transform('2026-11-01', [['milk', 500000]], [['yogurt', 10000]], costsOf(26700, [['yogurt', 1]]))]);
    expect(last(t).avgCostAfter).toBe(2.67);
  });

  it('splits multi-output costs by share and mixes with existing stock', () => {
    const tr = transform('2026-11-02', [['milk', 1000000]], [['cheese', 90000], ['whey', 850000]], costsOf(50000, [['cheese', 0.8], ['whey', 0.2]]));
    expect(last(timeline(cheese, [], [tr])).avgCostAfter).toBe(444.4444);
    expect(last(timeline(whey, [], [tr])).avgCostAfter).toBe(11.7647);
    const mixed = timeline(cheese, [], [add('2026-11-01', 'cheese', 90000, 500), tr]);
    expect(last(mixed).avgCostAfter).toBe(472.2222);
  });

  it('adds at the current average when the transform has no costs or no share for the output', () => {
    const base = add('2026-11-01', 'whey', 1000, 20);
    const noCosts = transform('2026-11-02', [['milk', 1000]], [['whey', 1000]]);
    const noShare = transform('2026-11-02', [['milk', 1000]], [['cheese', 1000], ['whey', 1000]], costsOf(9000, [['cheese', 1]]));
    expect(last(timeline(whey, [], [base, noCosts])).avgCostAfter).toBe(20);
    expect(last(timeline(whey, [], [base, noShare])).avgCostAfter).toBe(20);
  });

  it('transform inputs keep the average', () => {
    const t = timeline(milk, [], [add('2026-11-01', 'milk', 1000000, 45), transform('2026-11-02', [['milk', 500000]], [['yogurt', 10000]])]);
    expect(last(t)).toMatchObject({ kind: 'transform-out', avgCostAfter: 45, balanceAfter: 500000 });
  });
});

describe('transforms', () => {
  it('moves stock for multi-input / multi-output transforms', () => {
    const events = [
      add('2026-11-01', 'milk', 1000000),
      add('2026-11-01', 'sugar', 20000),
      transform('2026-11-02', [['milk', 1000000], ['sugar', 5000]], [['cheese', 90000], ['whey', 850000]]),
    ];
    const snap = stockSnapshot([milk, sugar, cheese, whey], [], events);
    expect([...snap].map(([id, s]) => [id, s.stock])).toEqual([['milk', 0], ['sugar', 15000], ['cheese', 90000], ['whey', 850000]]);
    expect(snap.get('sugar')?.last?.otherClassIds).toEqual(['cheese', 'whey']);
  });

  it('voiding a transform restores its inputs and removes its outputs', () => {
    const events = [add('2026-11-01', 'milk', 1000000), transform('2026-11-02', [['milk', 500000]], [['yogurt', 10000]], null, { voided: true })];
    const snap = stockSnapshot([milk, yogurt], [], events);
    expect(snap.get('milk')?.stock).toBe(1000000);
    expect(snap.get('yogurt')).toEqual({ stock: 0, avgCost: null, last: null });
  });
});

describe('stockSnapshot', () => {
  it('covers tracked classes only, with stock, average cost and last movement', () => {
    const off = cls('off', 0, { trackStock: false });
    const snap = stockSnapshot([pcs, off, yogurt], [order('2026-11-03', [['pcs', 4], ['off', 1]])], [add('2026-11-01', 'pcs', 10, 120), add('2026-11-01', 'off', 3)]);
    expect([...snap.keys()]).toEqual(['pcs', 'yogurt']);
    expect(snap.get('pcs')).toMatchObject({ stock: 6, avgCost: 120, last: { kind: 'sale', balanceAfter: 6 } });
  });

  it('matches classTimeline for every class', () => {
    const orders = [order('2026-11-02', [['milk', 1370]])];
    const events = [add('2026-11-01', 'milk', 12000, 300), transform('2026-11-03', [['milk', 2000]], [['yogurt', 40]], costsOf(1000, [['yogurt', 1]]))];
    const snap = stockSnapshot([milk, yogurt], orders, events);
    for (const c of [milk, yogurt]) {
      const t = classTimeline(c, orders, events, all);
      expect(snap.get(c.id)).toEqual({ stock: last(t).balanceAfter, avgCost: last(t).avgCostAfter, last: last(t) });
    }
  });
});

describe('sellRate and daysLeft', () => {
  const today = '2026-11-30';
  const salesOn = (days: string[]) => days.map((d) => order(d, [['pcs', 3]]));
  const days = (n: number) => Array.from({ length: n }, (_, i) => `2026-11-${String(30 - i * 4).padStart(2, '0')}`);

  it('is sold over the last 30 days including today / 30', () => {
    const orders = [
      ...salesOn(days(7)), // 30, 26, 22, 18, 14, 10, 6
      order('2026-11-01', [['pcs', 100]]), // first day of the window
      order('2026-10-31', [['pcs', 1000]]), // outside
      order('2026-12-01', [['pcs', 1000]]), // future
      order('2026-11-20', [['pcs', 1000]], { voided: true }),
      order('2026-11-20', [['milk', 1000]]),
    ];
    expect(sellRate('pcs', orders, today)).toEqual({ perDay: (21 + 100) / 30, enoughData: true });
  });

  it('needs sales on at least 7 distinct days', () => {
    const six = [...salesOn(days(6)), ...salesOn(days(6))];
    expect(sellRate('pcs', six, today).enoughData).toBe(false);
    expect(sellRate('pcs', salesOn(days(7)), today).enoughData).toBe(true);
  });

  it('crosses month boundaries', () => {
    expect(sellRate('pcs', [order('2026-02-28', [['pcs', 30]])], '2026-03-29').perDay).toBe(1);
    expect(sellRate('pcs', [order('2026-02-27', [['pcs', 30]])], '2026-03-29').perDay).toBe(0);
  });

  it('days left rounds down, null without rate or stock', () => {
    expect(daysLeft(100, 3)).toBe(33);
    expect(daysLeft(100, 0)).toBeNull();
    expect(daysLeft(0, 2)).toBeNull();
    expect(daysLeft(-5, 2)).toBeNull();
  });
});

describe('isLowStock and stockWarnings', () => {
  it('is low when stock ≤ threshold', () => {
    const c = cls('x', 0, { lowStockThreshold: 10 });
    expect(isLowStock(c, 10)).toBe(true);
    expect(isLowStock(c, 11)).toBe(false);
    expect(isLowStock(pcs, -100)).toBe(false);
  });

  it('lists classes that would go below 0', () => {
    const snap = stockSnapshot([milk, yogurt, pcs], [], [add('2026-11-01', 'milk', 1000)]);
    const delta = new Map([['milk', -1120], ['yogurt', 50], ['pcs', -0], ['untracked', -5]]);
    expect(stockWarnings(delta, snap)).toEqual([{ classId: 'milk', after: -120 }]);
    expect(stockWarnings(new Map([['milk', -1000]]), snap)).toEqual([]);
  });
});

describe('validateTransform', () => {
  const t = (inputs: [string, number][], outputs: [string, number][]) => ({
    inputs: inputs.map(([classId, amount]) => ({ classId, amount })),
    outputs: outputs.map(([classId, amount]) => ({ classId, amount })),
  });

  it('accepts a valid transform', () => {
    expect(validateTransform(t([['milk', 1], ['sugar', 1]], [['cheese', 1], ['whey', 1]]), all)).toEqual([]);
  });

  it('requires 1–5 inputs and outputs', () => {
    expect(validateTransform(t([], [['yogurt', 1]]), all)).toHaveLength(1);
    expect(validateTransform(t([['milk', 1]], []), all)).toHaveLength(1);
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => cls(id));
    const m = byId(...six, yogurt);
    expect(validateTransform(t(six.map((c) => [c.id, 1]), [['yogurt', 1]]), m)).toHaveLength(1);
  });

  it('rejects amounts ≤ 0, a class on both sides, and untracked or unknown classes', () => {
    expect(validateTransform(t([['milk', 0]], [['yogurt', 1]]), all)).toHaveLength(1);
    expect(validateTransform(t([['milk', 1]], [['milk', 1]]), all)).toHaveLength(1);
    const off = cls('off', 0, { trackStock: false });
    expect(validateTransform(t([['off', 1]], [['yogurt', 1]]), byId(off, yogurt))).toHaveLength(1);
    expect(validateTransform(t([['ghost', 1]], [['yogurt', 1]]), all)).toHaveLength(1);
  });
});
