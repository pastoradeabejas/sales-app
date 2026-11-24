// Pure helpers for the Profit tab (D-031).
import { periodRange, type PeriodKind } from '../../../core/finance.ts';
import type { Range } from '../../../core/stats.ts';
import type { ChartPoint } from '../../charts/geometry.ts';

/** "▲ 12 %" / "▼ 5 %" / "0 %", or "—" when there is no base to compare with. */
export function changeText(pct: number | null): string {
  if (pct === null) return '—';
  const r = Math.round(Math.abs(pct));
  if (r === 0) return '0 %';
  return `${pct > 0 ? '▲' : '▼'} ${r} %`;
}

export function changeTone(pct: number | null): 'up' | 'down' | 'flat' {
  if (pct === null || Math.round(Math.abs(pct)) === 0) return 'flat';
  return pct > 0 ? 'up' : 'down';
}

/** Margin fraction as "33.3 %"; "—" when unknown. */
export function marginText(m: number | null): string {
  if (m === null) return '—';
  const t = (Math.abs(m) * 100).toFixed(1);
  return `${m < 0 && Number(t) !== 0 ? '−' : ''}${t} %`;
}

export const shareText = (share: number) => `${Math.round(share * 100)} %`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11" -> "Nov". */
export const monthLabel = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1];

/** Selected period; a reversed custom range is swapped, an incomplete one falls back to the month. */
export function profitRange(kind: PeriodKind, today: string, custom: { from: string; to: string } | null): Range {
  if (kind !== 'custom') return periodRange(kind, today);
  if (!custom || !custom.from || !custom.to) return periodRange('month', today);
  return custom.from <= custom.to ? { from: custom.from, to: custom.to } : { from: custom.to, to: custom.from };
}

export const TOP = 10;
export const topRows = <T>(rows: T[], all: boolean): T[] => (all ? rows : rows.slice(0, TOP));

/** Chart bars: each month's height is sales; costs (cogs + expenses) and net profit split it. A loss shows costs only. */
export function trendPoints(trend: { month: string; sales: number; cogs: number; expenses: number; net: number }[]): ChartPoint[] {
  return trend.map((t) => {
    const paid = Math.max(t.net, 0);
    const unpaid = t.cogs + t.expenses;
    return { key: t.month, label: monthLabel(t.month), paid, unpaid, total: paid + unpaid };
  });
}

