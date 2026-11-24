import { describe, expect, it } from 'vitest';
import { changeText, changeTone, marginText, monthLabel, pointsChange, profitRange, shareText, tickMoney, topRows, trendPoints } from '../../src/ui/screens/profit/logic.ts';

describe('profit formatting', () => {
  it('formats the change vs the previous period', () => {
    expect(changeText(12)).toBe('▲ 12 %');
    expect(changeText(12.4)).toBe('▲ 12 %');
    expect(changeText(-5)).toBe('▼ 5 %');
    expect(changeText(0)).toBe('0 %');
    expect(changeText(null)).toBe('—');
  });

  it('names the tone of a change', () => {
    expect(changeTone(3)).toBe('up');
    expect(changeTone(-3)).toBe('down');
    expect(changeTone(0)).toBe('flat');
    expect(changeTone(null)).toBe('flat');
  });

  it('formats margins and shares', () => {
    expect(marginText(1 / 3)).toBe('33.3 %');
    expect(marginText(0)).toBe('0.0 %');
    expect(marginText(-0.05)).toBe('−5.0 %');
    expect(marginText(null)).toBe('—');
    expect(shareText(0.456)).toBe('46 %');
  });

  it('labels a month', () => {
    expect(monthLabel('2026-11')).toBe('Nov');
    expect(monthLabel('2026-01')).toBe('Jan');
  });
});

describe('profitRange', () => {
  it('uses the calendar period containing today', () => {
    expect(profitRange('month', '2026-11-24', null)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(profitRange('quarter', '2026-11-24', null)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(profitRange('year', '2026-11-24', null)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('uses a custom range, swapped when reversed, month when incomplete', () => {
    expect(profitRange('custom', '2026-11-24', { from: '2026-03-01', to: '2026-03-10' })).toEqual({ from: '2026-03-01', to: '2026-03-10' });
    expect(profitRange('custom', '2026-11-24', { from: '2026-03-10', to: '2026-03-01' })).toEqual({ from: '2026-03-01', to: '2026-03-10' });
    expect(profitRange('custom', '2026-11-24', { from: '', to: '2026-03-01' })).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });
});

describe('topRows', () => {
  const rows = Array.from({ length: 12 }, (_, i) => i);
  it('shows 10 rows unless all are asked for', () => {
    expect(topRows(rows, false)).toHaveLength(10);
    expect(topRows(rows, true)).toHaveLength(12);
    expect(topRows([1, 2], false)).toEqual([1, 2]);
  });
});

describe('trendPoints', () => {
  it('gives each month its sales, costs (cost of goods + expenses) and net profit, negative on a loss', () => {
    const [a, b] = trendPoints([
      { month: '2026-10', sales: 1000, cogs: 400, expenses: 100, net: 500 },
      { month: '2026-11', sales: 300, cogs: 200, expenses: 400, net: -300 },
    ]);
    expect(a).toEqual({ key: '2026-10', label: 'Oct', sales: 1000, costs: 500, net: 500 });
    expect(b).toEqual({ key: '2026-11', label: 'Nov', sales: 300, costs: 600, net: -300 });
  });
});

describe('margin changes in percentage points', () => {
  it('cur - prev in points, one decimal; null without both sides', () => {
    expect(pointsChange(0.33, 0.3)).toEqual({ text: '▲ 3.0 pts', tone: 'up' });
    expect(pointsChange(0.2, 0.25)).toEqual({ text: '▼ 5.0 pts', tone: 'down' });
    expect(pointsChange(0.3, 0.3)).toEqual({ text: '0 pts', tone: 'flat' });
    expect(pointsChange(null, 0.3)).toEqual({ text: '—', tone: 'flat' });
  });
});

describe('tickMoney', () => {
  it('short axis labels that fit: thousands as k, minus sign kept', () => {
    expect(tickMoney(200000)).toBe('€2k');
    expect(tickMoney(-100000)).toBe('−€1k');
    expect(tickMoney(250000)).toBe('€2.5k');
    expect(tickMoney(50000)).toBe('€500');
    expect(tickMoney(250)).toBe('€2.5');
    expect(tickMoney(0)).toBe('€0');
  });
});
