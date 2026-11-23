import { describe, expect, it } from 'vitest';
import { barGeometry, niceMax, lineGeometry, VIEW } from '../../src/ui/charts/geometry.ts';
import {
  bucketLabel, debtSegments, owedDetail, percents, seriesMetric, splitText, unitsText, variantText, viewRange,
} from '../../src/ui/screens/overview/logic.ts';
import type { ClassSold, VariantSold } from '../../src/core/stats.ts';

describe('viewRange', () => {
  it('uses the preset ranges', () => {
    expect(viewRange('month', '2026-11-24', null)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(viewRange('week', '2026-11-24', null)).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(viewRange('year', '2026-11-24', null)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
  it('uses the custom dates, swapping them when reversed', () => {
    expect(viewRange('custom', '2026-11-24', { from: '2026-10-01', to: '2026-10-15' })).toEqual({ from: '2026-10-01', to: '2026-10-15' });
    expect(viewRange('custom', '2026-11-24', { from: '2026-10-15', to: '2026-10-01' })).toEqual({ from: '2026-10-01', to: '2026-10-15' });
  });
  it('falls back to the month when a custom date is missing', () => {
    expect(viewRange('custom', '2026-11-24', { from: '', to: '2026-10-01' })).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(viewRange('custom', '2026-11-24', null)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });
});

describe('percents and debt bar', () => {
  it('sums to 100', () => {
    expect(percents([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(percents([10850, 17000, 5600, 7800]).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('is all zero without amounts', () => {
    expect(percents([0, 0])).toEqual([0, 0]);
  });
  it('builds four labelled segments', () => {
    const s = debtSegments({ '0-7': 100, '8-30': 100, '31-90': 0, '90+': 0 });
    expect(s.map((x) => x.label)).toEqual(['0–7 d', '8–30 d', '31–90 d', '90+ d']);
    expect(s.map((x) => x.pct)).toEqual([50, 50, 0, 0]);
  });
});

describe('texts', () => {
  const cls = (unitName: string, decimals: 0 | 1 | 2 | 3, amount: number): ClassSold => ({ classId: 'c', className: 'C', unitName, decimals, amount, variants: [] });
  it('formats class amounts by unit', () => {
    expect(unitsText(cls('kg', 1, 122))).toBe('12.2 kg');
    expect(unitsText(cls('pcs', 0, 13))).toBe('13 pcs');
  });
  const fixed: VariantSold = { variantId: 'v', label: '500 g', kind: 'fixed', quantity: 18, amount: 9, paidQty: 12.4, unpaidQty: 5.6, paidAmount: 0, unpaidAmount: 0 };
  const variable: VariantSold = { variantId: 'w', label: 'Cut', kind: 'variable', quantity: null, amount: 4600, paidQty: 0, unpaidQty: 0, paidAmount: 3200, unpaidAmount: 1400 };
  it('formats variants', () => {
    expect(variantText(fixed, cls('kg', 1, 90))).toBe('18 sold');
    expect(variantText(variable, cls('kg', 3, 0))).toBe('4.6 kg');
  });
  it('splits paid and unpaid into percents and an unpaid text', () => {
    expect(splitText(fixed, cls('kg', 1, 90))).toEqual({ paidPct: 69, unpaidPct: 31, unpaid: '6 unpaid' });
    expect(splitText(variable, cls('kg', 3, 0))).toEqual({ paidPct: 70, unpaidPct: 30, unpaid: '1.4 kg unpaid' });
  });
  it('describes who owes', () => {
    expect(owedDetail(3, 21)).toBe('3 orders · oldest 21 days');
    expect(owedDetail(1, 1)).toBe('1 order · oldest 1 day');
  });
  it('picks the chart metric', () => {
    expect(seriesMetric({ ...cls('pcs', 0, 1), variants: [fixed] })).toBe('units');
    expect(seriesMetric({ ...cls('kg', 3, 1), variants: [fixed, variable] })).toBe('amount');
  });
  it('labels buckets', () => {
    expect(bucketLabel('2026-11-24', 'day')).toBe('24 Nov');
    expect(bucketLabel('2026-11-23', 'week')).toBe('23 Nov');
    expect(bucketLabel('2026-11-01', 'month')).toBe('Nov');
  });
});

describe('chart geometry', () => {
  it('rounds the maximum up to a nice number', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(4.6)).toBe(5);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(12)).toBe(20);
    expect(niceMax(120)).toBe(200);
    expect(niceMax(1000)).toBe(1000);
  });
  const pts = [{ paid: 3, unpaid: 2 }, { paid: 0, unpaid: 0 }, { paid: 5, unpaid: 5 }];
  it('stacks bars inside the plot with paid at the bottom', () => {
    const g = barGeometry(pts);
    const bottom = VIEW.h - VIEW.bottom;
    expect(g.max).toBe(10);
    expect(g.ticks.map((t) => t.value)).toEqual([0, 5, 10]);
    expect(g.bars).toHaveLength(3);
    const b = g.bars[0];
    expect(b.paidY + b.paidH).toBeCloseTo(bottom);
    expect(b.unpaidY + b.unpaidH).toBeCloseTo(b.paidY);
    expect(g.bars[1].paidH + g.bars[1].unpaidH).toBe(0);
    expect(g.bars[2].unpaidY).toBeCloseTo(VIEW.top);
    expect(g.bars[0].x).toBeLessThan(g.bars[1].x);
    expect(g.bars[2].x + g.bars[2].w).toBeLessThanOrEqual(VIEW.w - VIEW.right);
  });
  it('places line points at band centres, higher value higher up', () => {
    const l = lineGeometry([{ total: 5 }, { total: 0 }, { total: 10 }]);
    expect(l.points).toHaveLength(3);
    expect(l.points[2].y).toBeLessThan(l.points[0].y);
    expect(l.points[1].y).toBeCloseTo(VIEW.h - VIEW.bottom);
  });
  it('shows at most about six x labels', () => {
    const many = Array.from({ length: 31 }, () => ({ paid: 1, unpaid: 0 }));
    expect(barGeometry(many).labelIdx.length).toBeLessThanOrEqual(7);
    expect(barGeometry(pts).labelIdx).toEqual([0, 1, 2]);
  });
});
