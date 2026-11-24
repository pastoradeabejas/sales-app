import { describe, expect, it } from 'vitest';
import type { Decimals, ProductClass, StockAdjust, StockTransform, TransformCosts } from '../../src/core/types.ts';
import {
  averageCostAt,
  buildTransformCosts,
  labourAmount,
  labourCosts,
  materialsCost,
  otherDifference,
  outputUnitCosts,
  sharesValid,
} from '../../src/core/costs.ts';
import { classTimeline } from '../../src/core/stock.ts';

const stamp = (date: string, time = '10:00') => ({
  createdAt: `${date}T${time}:00.000Z`, updatedAt: `${date}T${time}:00.000Z`, updatedBy: 'test', schema: 1,
});

let seq = 0;
const nextId = () => `id${String(++seq).padStart(4, '0')}`;

function cls(id: string, decimals: Decimals = 0): ProductClass {
  return {
    id, ...stamp('2026-01-01'), name: id, unit: { name: 'u', decimals }, lowStockThreshold: null,
    trackStock: true, sellable: true, customFields: [], customValues: {}, notes: '', archived: false, variants: [],
  };
}

const add = (date: string, classId: string, amount: number, unitCost: number | null): StockAdjust => ({
  id: nextId(), ...stamp(date), date, type: 'add', classId, amount, unitCost, reason: '', note: '', voided: false,
});

const transform = (date: string, inputs: [string, number][], outputs: [string, number][], costs: TransformCosts): StockTransform => ({
  id: nextId(), ...stamp(date), date, type: 'transform',
  inputs: inputs.map(([classId, amount]) => ({ classId, amount })),
  outputs: outputs.map(([classId, amount]) => ({ classId, amount })),
  recipeId: null, costs, note: '', voided: false,
});

const milk = cls('milk', 3);
const sugar = cls('sugar', 3);
const cups = cls('cups');
const yogurt = cls('yogurt');
const cheese = cls('cheese', 3);
const whey = cls('whey', 3);
const all = new Map([milk, sugar, cups, yogurt, cheese, whey].map((c) => [c.id, c]));
const avg = (costs: Record<string, number | null>) => (id: string) => costs[id] ?? null;

describe('materialsCost', () => {
  it('sums base units × average cost per input, in whole cents', () => {
    const r = materialsCost(
      [{ classId: 'milk', amount: 500000 }, { classId: 'sugar', amount: 333 }, { classId: 'cups', amount: 3 }],
      avg({ milk: 45, sugar: 100.5, cups: 2.5 }), all,
    );
    expect(r.lines).toEqual([
      { classId: 'milk', amount: 500000, avgCost: 45, cost: 22500 },
      { classId: 'sugar', amount: 333, avgCost: 100.5, cost: 33 }, // 33.4665
      { classId: 'cups', amount: 3, avgCost: 2.5, cost: 8 }, // 7.5 rounds half-up
    ]);
    expect(r).toMatchObject({ materials: 22541, complete: true });
  });

  it('is incomplete when an input has no known cost (counted as 0)', () => {
    const r = materialsCost([{ classId: 'milk', amount: 500000 }, { classId: 'sugar', amount: 1000 }], avg({ milk: 45 }), all);
    expect(r.lines[1]).toEqual({ classId: 'sugar', amount: 1000, avgCost: null, cost: null });
    expect(r).toMatchObject({ materials: 22500, complete: false });
  });
});

describe('buildTransformCosts', () => {
  const yogurtOut = [{ classId: 'yogurt', amount: 10000 }];
  const extras = [{ label: 'Electricity', amount: 1200 }, { label: 'Time', amount: 3000 }];

  it('breakdown: total = materials + extras, single output gets share 1', () => {
    expect(buildTransformCosts({ mode: 'breakdown', materials: 22500, materialsComplete: true, extras, outputs: yogurtOut })).toEqual({
      mode: 'breakdown', materials: 22500, materialsComplete: true, extras, total: 26700,
      allocation: [{ classId: 'yogurt', share: 1 }],
    });
  });

  it('total: uses the entered total; other = total − materials, may be negative', () => {
    const c = buildTransformCosts({ mode: 'total', materials: 22500, materialsComplete: false, extras: [], enteredTotal: 30000, outputs: yogurtOut });
    expect(c).toMatchObject({ mode: 'total', total: 30000, materials: 22500, materialsComplete: false });
    expect(otherDifference(c)).toBe(7500);
    const low = buildTransformCosts({ mode: 'total', materials: 22500, materialsComplete: true, extras: [], enteredTotal: 20000, outputs: yogurtOut });
    expect(otherDifference(low)).toBe(-2500);
  });

  it('prefills equal shares and keeps given shares', () => {
    const outputs = ['cheese', 'whey', 'yogurt'].map((classId) => ({ classId, amount: 1 }));
    const eq = buildTransformCosts({ mode: 'breakdown', materials: 900, materialsComplete: true, extras: [], outputs });
    expect(eq.allocation.map((s) => s.share)).toEqual([1 / 3, 1 / 3, 1 / 3]);
    const shares = [{ classId: 'cheese', share: 0.5 }, { classId: 'whey', share: 0.3 }, { classId: 'yogurt', share: 0.2 }];
    expect(buildTransformCosts({ mode: 'breakdown', materials: 900, materialsComplete: true, extras: [], outputs, shares }).allocation).toEqual(shares);
  });

  it('rejects shares that do not sum to 1', () => {
    expect(() => buildTransformCosts({
      mode: 'breakdown', materials: 0, materialsComplete: true, extras: [], outputs: [{ classId: 'cheese', amount: 1 }],
      shares: [{ classId: 'cheese', share: 0.9 }],
    })).toThrow();
  });
});

describe('sharesValid', () => {
  it('requires shares in 0..1 summing to 1 within 1e-9', () => {
    expect(sharesValid([{ classId: 'a', share: 0.7 }, { classId: 'b', share: 0.2 }, { classId: 'c', share: 0.1 }])).toBe(true);
    expect(sharesValid([{ classId: 'a', share: 1 / 3 }, { classId: 'b', share: 1 / 3 }, { classId: 'c', share: 1 / 3 }])).toBe(true);
    expect(sharesValid([{ classId: 'a', share: 0.5 }, { classId: 'b', share: 0.49 }])).toBe(false);
    expect(sharesValid([{ classId: 'a', share: 1.5 }, { classId: 'b', share: -0.5 }])).toBe(false);
    expect(sharesValid([])).toBe(false);
  });
});

describe('outputUnitCosts', () => {
  it('gives cents per base unit with 4 decimals, estimate when materials are incomplete', () => {
    const c = buildTransformCosts({ mode: 'breakdown', materials: 22500, materialsComplete: false, extras: [{ label: 'Time', amount: 4200 }], outputs: [{ classId: 'yogurt', amount: 10000 }] });
    expect(outputUnitCosts(c, [{ classId: 'yogurt', amount: 10000 }], all)).toEqual([{ classId: 'yogurt', unitCost: 2.67, estimate: true }]);
  });

  it('splits by share across outputs in their own units', () => {
    const outputs = [{ classId: 'cheese', amount: 90000 }, { classId: 'whey', amount: 850000 }];
    const c = buildTransformCosts({ mode: 'total', materials: 45000, materialsComplete: true, extras: [], enteredTotal: 50000, outputs, shares: [{ classId: 'cheese', share: 0.8 }, { classId: 'whey', share: 0.2 }] });
    expect(outputUnitCosts(c, outputs, all)).toEqual([
      { classId: 'cheese', unitCost: 444.4444, estimate: false },
      { classId: 'whey', unitCost: 11.7647, estimate: false },
    ]);
  });
});

describe('averageCostAt', () => {
  const events = [add('2026-11-01', 'milk', 10000, 40), add('2026-11-10', 'milk', 10000, 60)];

  it('is the average after the last movement up to the given point', () => {
    expect(averageCostAt(milk, [], events, all)).toBe(50);
    expect(averageCostAt(milk, [], events, all, { date: '2026-11-05', createdAt: '2026-11-20T00:00:00.000Z' })).toBe(40);
    expect(averageCostAt(milk, [], events, all, { date: '2026-11-10', createdAt: '2026-11-10T10:00:00.000Z' })).toBe(50);
    expect(averageCostAt(milk, [], events, all, { date: '2026-10-01', createdAt: '2026-11-20T00:00:00.000Z' })).toBeNull();
    expect(averageCostAt(sugar, [], events, all)).toBeNull();
  });

  it('feeds a transform end to end: materials snapshot → output average', () => {
    const inputs = [{ classId: 'milk', amount: 20000 }];
    const outputs = [{ classId: 'yogurt', amount: 400 }];
    const m = materialsCost(inputs, (id) => averageCostAt(all.get(id)!, [], events, all), all);
    expect(m.materials).toBe(1000);
    const costs = buildTransformCosts({ mode: 'breakdown', materials: m.materials, materialsComplete: m.complete, extras: [{ label: 'Electricity', amount: 200 }], outputs });
    const tr = transform('2026-11-12', [['milk', 20000]], [['yogurt', 400]], costs);
    expect(averageCostAt(yogurt, [], [...events, tr], all)).toBe(3);
    expect(classTimeline(milk, [], [...events, tr], all).at(-1)).toMatchObject({ balanceAfter: 0, avgCostAfter: 50 });
  });
});

describe('labour (§16.5)', () => {
  const levels = new Map([
    ['L1', { id: 'L1', name: 'Level 1', hourlyRate: 1200 }],
    ['L2', { id: 'L2', name: 'Level 2', hourlyRate: 1450 }],
  ] as const);
  const out = [{ classId: 'jar', amount: 10 }];

  it('amount = minutes × rate / 60, half-up to cents', () => {
    expect(labourAmount(400, 1200)).toBe(8000);
    expect(labourAmount(7, 1450)).toBe(169); // 169.17
    expect(labourAmount(3, 1450)).toBe(73); // 72.5 -> 73
    expect(labourAmount(0, 1200)).toBe(0);
  });
  it('snapshots each row with the level name and rate; unknown levels are skipped', () => {
    expect(labourCosts([{ levelId: 'L1', minutes: 400 }, { levelId: 'L2', minutes: 7 }, { levelId: 'X', minutes: 5 }], levels as any)).toEqual([
      { levelId: 'L1', levelName: 'Level 1', minutes: 400, hourlyRate: 1200, amount: 8000 },
      { levelId: 'L2', levelName: 'Level 2', minutes: 7, hourlyRate: 1450, amount: 169 },
    ]);
  });
  it('breakdown: total = materials + labour + extras', () => {
    const labour = labourCosts([{ levelId: 'L1', minutes: 400 }], levels as any);
    const c = buildTransformCosts({ mode: 'breakdown', materials: 2000, materialsComplete: true, labour, extras: [{ label: 'Labels', amount: 100 }], outputs: out });
    expect(c.labour).toEqual(labour);
    expect(c.total).toBe(10100);
    expect(outputUnitCosts(c, out, new Map([['jar', cls('jar')]]))[0].unitCost).toBe(1010);
  });
  it('total mode: other = total − materials − labour', () => {
    const labour = labourCosts([{ levelId: 'L1', minutes: 400 }], levels as any);
    const c = buildTransformCosts({ mode: 'total', materials: 2000, materialsComplete: true, labour, extras: [], enteredTotal: 12000, outputs: out });
    expect(c.total).toBe(12000);
    expect(otherDifference(c)).toBe(2000);
  });
  it('old transforms without labour keep working', () => {
    const c = buildTransformCosts({ mode: 'total', materials: 2000, materialsComplete: true, extras: [], enteredTotal: 3000, outputs: out });
    expect('labour' in c).toBe(false);
    expect(otherDifference(c)).toBe(1000);
  });
});
