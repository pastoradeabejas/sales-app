import { describe, expect, it } from 'vitest';
import { classTimeline } from '../../src/core/stock.ts';
import type { Decimals, Order, ProductClass, StockAdjust, StockTransform } from '../../src/core/types.ts';
import {
  chartModel,
  costsFromForm,
  dayLabel,
  daysLeftText,
  editRow,
  equalPercents,
  lastMovementText,
  movementLabel,
  movePreview,
  percentsToShares,
  rateText,
  reasonLabel,
  reasonValue,
  recentMovements,
  rowsFromList,
  sharesToPercents,
  toInputText,
  transformSummary,
  type CostForm,
} from '../../src/ui/screens/stock/logic.ts';

const stamp = (date: string, time = '10:00') => ({
  createdAt: `${date}T${time}:00.000Z`,
  updatedAt: `${date}T${time}:00.000Z`,
  updatedBy: 'test',
  schema: 1,
});

let seq = 0;
const nextId = () => `id${String(++seq).padStart(4, '0')}`;

function cls(id: string, name: string, decimals: Decimals, unit: string, extra: Partial<ProductClass> = {}): ProductClass {
  return {
    id, ...stamp('2026-01-01'), name, unit: { name: unit, decimals },
    lowStockThreshold: null, trackStock: true, sellable: true, customFields: [], customValues: {},
    notes: '', archived: false, variants: [], ...extra,
  };
}

function order(date: string, lines: [string, number][], time?: string): Order {
  return {
    id: nextId(), ...stamp(date, time), date, clientId: 'c1', clientName: 'Lucía',
    lines: lines.map(([classId, amount], i) => ({
      lineId: `l${i}`, classId, variantId: 'v', className: classId, variantLabel: 'v', kind: 'variable',
      unitName: 'u', decimals: 0, quantity: null, amount, unitPrice: 100, unitCost: null, lineTotal: 0,
    })),
    total: 0, note: '', voided: false, voidReason: null,
  };
}

function adjust(type: 'add' | 'remove', date: string, classId: string, amount: number, extra: Partial<StockAdjust> = {}, time?: string): StockAdjust {
  return { id: nextId(), ...stamp(date, time), date, type, classId, amount, unitCost: null, reason: type === 'remove' ? 'waste' : '', note: '', voided: false, ...extra };
}

function transform(date: string, inputs: [string, number][], outputs: [string, number][], extra: Partial<StockTransform> = {}, time?: string): StockTransform {
  return {
    id: nextId(), ...stamp(date, time), date, type: 'transform',
    inputs: inputs.map(([classId, amount]) => ({ classId, amount })),
    outputs: outputs.map(([classId, amount]) => ({ classId, amount })),
    recipeId: null, costs: null, note: '', voided: false, ...extra,
  };
}

const milk = cls('milk', 'Milk', 3, 'kg', { sellable: false });
const yogurt = cls('yog', 'Yogurt', 0, 'pcs');
const cheese = cls('chz', 'Parmigiano', 3, 'kg');
const whey = cls('whey', 'Whey', 3, 'kg', { sellable: false });
const byId = new Map([milk, yogurt, cheese, whey].map((c) => [c.id, c]));
const dec = (id: string) => byId.get(id)!.unit.decimals;

describe('movePreview', () => {
  it('adds and removes from the current stock', () => {
    expect(movePreview(1500, 'add', 250)).toEqual({ before: 1500, after: 1750, reset: false });
    expect(movePreview(1500, 'remove', 250)).toEqual({ before: 1500, after: 1250, reset: false });
  });
  it('an add on negative stock starts from 0 (reset rule)', () => {
    expect(movePreview(-8, 'add', 20)).toEqual({ before: -8, after: 20, reset: true });
  });
  it('a remove may go below 0', () => {
    expect(movePreview(10, 'remove', 30)).toEqual({ before: 10, after: -20, reset: false });
  });
  it('no amount yet leaves the stock unchanged', () => {
    expect(movePreview(5, 'add', null)).toEqual({ before: 5, after: 5, reset: false });
  });
});

describe('reasons', () => {
  it('maps chips to stored reasons; Other uses the free text', () => {
    expect(reasonValue('waste', '')).toBe('waste');
    expect(reasonValue('own use', 'x')).toBe('own use');
    expect(reasonValue('other', '  broken jar ')).toBe('broken jar');
    expect(reasonValue('other', '  ')).toBe('');
    expect(reasonValue('', '')).toBe('');
  });
  it('labels known reasons and keeps free text', () => {
    expect(reasonLabel('count correction')).toBe('Count correction');
    expect(reasonLabel('broken jar')).toBe('broken jar');
  });
});

describe('toInputText', () => {
  it('formats without thousands separators so it parses back', () => {
    expect(toInputText(10000, 0)).toBe('10000');
    expect(toInputText(1500250, 3)).toBe('1500.25');
    expect(toInputText(500000, 3)).toBe('500');
  });
});

describe('transform rows', () => {
  const recipe = () => [...rowsFromList([{ classId: 'milk', amount: 500000 }], dec), ...rowsFromList([{ classId: 'yog', amount: 10000 }], dec)];

  it('rows from a recipe are linked to their base amount', () => {
    expect(recipe()).toEqual([
      { classId: 'milk', text: '500', base: 500000 },
      { classId: 'yog', text: '10000', base: 10000 },
    ]);
  });
  it('changing a linked row scales the others and unlinks the edited one', () => {
    const rows = editRow(recipe(), 0, '750', dec);
    expect(rows).toEqual([
      { classId: 'milk', text: '750', base: null },
      { classId: 'yog', text: '15000', base: 10000 },
    ]);
  });
  it('a row edited by hand is no longer overwritten by scaling', () => {
    let rows = editRow(recipe(), 0, '750', dec);
    rows = editRow(rows, 1, '14800', dec);
    expect(rows[1]).toEqual({ classId: 'yog', text: '14800', base: null });
    rows = editRow(rows, 0, '1000', dec);
    expect(rows.map((r) => r.text)).toEqual(['1000', '14800']);
  });
  it('scaling rounds each row to its class decimals', () => {
    const rows = [...rowsFromList([{ classId: 'milk', amount: 1000000 }], dec), ...rowsFromList([{ classId: 'chz', amount: 90000 }, { classId: 'whey', amount: 850000 }], dec)];
    expect(editRow(rows, 0, '333', dec).map((r) => r.text)).toEqual(['333', '29.97', '283.05']);
  });
  it('an invalid amount does not scale', () => {
    expect(editRow(recipe(), 0, 'abc', dec)[1].text).toBe('10000');
  });
  it('manual rows (no base) never scale', () => {
    const rows = [{ classId: 'milk', text: '1', base: null }, { classId: 'yog', text: '5', base: null }];
    expect(editRow(rows, 0, '2', dec)[1].text).toBe('5');
  });
});

describe('shares', () => {
  it('equal percents sum to 100', () => {
    expect(equalPercents(1)).toEqual(['100']);
    expect(equalPercents(2)).toEqual(['50', '50']);
    expect(equalPercents(3)).toEqual(['33.33', '33.33', '33.34']);
  });
  it('percent text to fractions, comma accepted; invalid gives null', () => {
    expect(percentsToShares(['a', 'b'], ['40', '60'])).toEqual([{ classId: 'a', share: 0.4 }, { classId: 'b', share: 0.6 }]);
    expect(percentsToShares(['a', 'b'], ['12,5', '87.5'])).toEqual([{ classId: 'a', share: 0.125 }, { classId: 'b', share: 0.875 }]);
    expect(percentsToShares(['a'], ['x'])).toBeNull();
    expect(percentsToShares(['a'], ['120'])).toBeNull();
  });
  it('fractions back to percent text', () => {
    expect(sharesToPercents([{ classId: 'a', share: 0.125 }, { classId: 'b', share: 0.875 }])).toEqual(['12.5', '87.5']);
  });
});

describe('transformSummary', () => {
  it('lists inputs and outputs with signed amounts', () => {
    expect(transformSummary([{ classId: 'milk', amount: 500000 }], [{ classId: 'yog', amount: 10000 }], byId)).toBe('Milk −500 kg → Yogurt +10,000 pcs');
    expect(transformSummary([{ classId: 'milk', amount: 1000000 }], [{ classId: 'chz', amount: 90000 }, { classId: 'whey', amount: 850000 }], byId))
      .toBe('Milk −1,000 kg → Parmigiano +90 kg, Whey +850 kg');
  });
});

describe('costsFromForm', () => {
  const outs = [{ classId: 'yog', amount: 10000 }];
  const base: CostForm = { opened: true, mode: 'breakdown', extras: [], totalText: '', shareTexts: ['100'] };
  const mat = { materials: 2250, complete: true };

  it('null when the section was never opened', () => {
    expect(costsFromForm({ ...base, opened: false }, mat, outs)).toEqual({ costs: null, error: '' });
  });
  it('null when nothing at all is known (no materials cost, no extras)', () => {
    expect(costsFromForm(base, { materials: 0, complete: false }, outs).costs).toBeNull();
  });
  it('breakdown: materials plus extras, empty extras skipped', () => {
    const r = costsFromForm({ ...base, extras: [{ label: 'Electricity', text: '12' }, { label: '', text: '3,50' }, { label: 'Time', text: '' }] }, mat, outs);
    expect(r.error).toBe('');
    expect(r.costs).toEqual({
      mode: 'breakdown', materials: 2250, materialsComplete: true,
      extras: [{ label: 'Electricity', amount: 1200 }, { label: 'Other', amount: 350 }],
      total: 3800, allocation: [{ classId: 'yog', share: 1 }],
    });
  });
  it('breakdown: an invalid extra amount is an error', () => {
    expect(costsFromForm({ ...base, extras: [{ label: 'Time', text: 'abc' }] }, mat, outs).error).not.toBe('');
  });
  it('total mode: empty total is left empty, invalid is an error, valid is stored', () => {
    expect(costsFromForm({ ...base, mode: 'total' }, mat, outs).costs).toBeNull();
    expect(costsFromForm({ ...base, mode: 'total', totalText: 'x' }, mat, outs).error).not.toBe('');
    expect(costsFromForm({ ...base, mode: 'total', totalText: '20', extras: [{ label: 'Time', text: '5' }] }, mat, outs).costs)
      .toMatchObject({ mode: 'total', total: 2000, extras: [] });
  });
  it('several outputs use the shares, which must sum to 100%', () => {
    const two = [{ classId: 'chz', amount: 90000 }, { classId: 'whey', amount: 850000 }];
    const ok = costsFromForm({ ...base, shareTexts: ['80', '20'] }, mat, two);
    expect(ok.costs?.allocation).toEqual([{ classId: 'chz', share: 0.8 }, { classId: 'whey', share: 0.2 }]);
    expect(costsFromForm({ ...base, shareTexts: ['80', '30'] }, mat, two).error).toBe('Shares must add up to 100%.');
  });
});

describe('labels and texts', () => {
  const today = '2026-11-22';
  it('day labels', () => {
    expect(dayLabel('2026-11-22', today)).toBe('today');
    expect(dayLabel('2026-11-21', today)).toBe('yesterday');
    expect(dayLabel('2026-11-03', today)).toBe('3 Nov');
    expect(dayLabel('2025-12-31', today)).toBe('31 Dec 2025');
  });

  const events = [
    adjust('add', '2026-11-10', 'milk', 1020000),
    adjust('remove', '2026-11-12', 'milk', 20000, { reason: 'waste' }),
    transform('2026-11-22', [['milk', 500000]], [['yog', 10000]]),
  ];
  const milkT = classTimeline(milk, [], events, byId);
  const yogT = classTimeline(yogurt, [order('2026-11-22', [['yog', 24]], '11:00')], events, byId);

  it('movement labels', () => {
    expect(milkT.map((m) => movementLabel(m, byId))).toEqual(['Add', 'Remove (waste)', 'Transform out (to Yogurt)']);
    expect(yogT.map((m) => movementLabel(m, byId))).toEqual(['Transform in (from Milk)', 'Sale (Lucía)']);
  });
  it('last movement text', () => {
    expect(lastMovementText(milkT[2], milk, today)).toBe('−500 kg · transform · today');
    expect(lastMovementText(milkT[0], milk, today)).toBe('+1,020 kg · add · 10 Nov');
    expect(lastMovementText(null, milk, today)).toBe('No movements yet');
  });
  it('days left only for sellable classes', () => {
    expect(daysLeftText(milk, 100, { perDay: 10, enoughData: true })).toBe('');
    expect(daysLeftText(yogurt, 100, { perDay: 1, enoughData: false })).toBe('not enough data');
    expect(daysLeftText(yogurt, 235, { perDay: 10, enoughData: true })).toBe('≈ 23 days');
    expect(daysLeftText(yogurt, -3, { perDay: 10, enoughData: true })).toBe('≈ 0 days');
  });
  it('sell rate per week, one decimal at most', () => {
    expect(rateText(300, cheese)).toBe('≈ 2.1 kg / week');
    expect(rateText(10 / 7, yogurt)).toBe('≈ 10 pcs / week');
  });
});

describe('recentMovements', () => {
  const today = '2026-11-22';
  const events = [
    adjust('add', '2026-11-20', 'milk', 2000000, { unitCost: 45 }),
    adjust('remove', '2026-11-21', 'yog', 16, { reason: 'waste' }),
    transform('2026-11-22', [['milk', 500000]], [['yog', 10000]], { recipeId: 'r1' }, '09:10'),
    adjust('add', '2026-11-19', 'milk', 1, { voided: true }),
  ];
  const orders = [order('2026-11-22', [['chz', 1250], ['yog', 24]], '12:00')];
  const recipes = [{ id: 'r1', name: 'Yogurt from milk' }];
  const items = recentMovements(orders, events, recipes, byId, today);

  it('newest first, voided skipped, limited', () => {
    expect(items.map((i) => i.kind)).toEqual(['sale', 'transform', 'remove', 'add']);
    expect(recentMovements(orders, events, recipes, byId, today, 2)).toHaveLength(2);
  });
  it('titles, subtitles, deltas and links', () => {
    expect(items[0]).toMatchObject({ title: 'Sale · Lucía', sub: 'Today', deltas: ['Parmigiano −1.25 kg', 'Yogurt −24 pcs'], href: `#/orders/${orders[0].id}` });
    expect(items[1]).toMatchObject({ title: 'Transform · Yogurt from milk', deltas: ['Milk −500 kg', 'Yogurt +10,000 pcs'], href: '#/stock/milk' });
    expect(items[2]).toMatchObject({ title: 'Remove · Waste', sub: 'Yesterday · Yogurt', deltas: ['−16 pcs'], href: '#/stock/yog' });
    expect(items[3]).toMatchObject({ title: 'Add · Milk', sub: '20 Nov · €0.45 / kg', deltas: ['+2,000 kg'] });
  });
  it('ignores sales of untracked classes', () => {
    const map = new Map(byId);
    map.set('x', cls('x', 'X', 0, 'pcs', { trackStock: false }));
    expect(recentMovements([order(today, [['x', 1]])], [], [], map, today)).toEqual([]);
  });
});

describe('chartModel', () => {
  const events = [
    adjust('add', '2026-11-10', 'milk', 1000000),
    transform('2026-11-15', [['milk', 1000000]], [['chz', 90000]]),
    adjust('add', '2026-11-20', 'milk', 2000000),
  ];
  const t = classTimeline(milk, [], events, byId);

  it('null without movements', () => {
    expect(chartModel([], '2026-11-22')).toBeNull();
  });
  it('step line from 0 through the balance of each day, extended to today', () => {
    const m = chartModel(t, '2026-11-30', 200, 100, 10)!;
    // days 10 → 30 Nov = 20 days over 200 px; balances 0..2,000,000 over y 90..10.
    expect(m.points).toEqual([[0, 90], [0, 50], [50, 50], [50, 90], [100, 90], [100, 10], [200, 10]]);
    expect(m.markers).toEqual([
      { x: 0, y: 50, kind: 'add' },
      { x: 50, y: 90, kind: 'transform' },
      { x: 100, y: 10, kind: 'add' },
    ]);
    expect(m.max).toBe(2000000);
    expect(m.min).toBe(0);
    expect(m.days).toEqual([
      { date: '2026-11-10', balance: 1000000 },
      { date: '2026-11-15', balance: 0 },
      { date: '2026-11-20', balance: 2000000 },
    ]);
  });
  it('negative balances extend the range below 0', () => {
    const neg = classTimeline(yogurt, [order('2026-11-10', [['yog', 10]])], [], byId);
    const m = chartModel(neg, '2026-11-10', 100, 100, 0)!;
    expect(m.min).toBe(-10);
    expect(m.points[m.points.length - 1]).toEqual([100, 100]);
  });
});
