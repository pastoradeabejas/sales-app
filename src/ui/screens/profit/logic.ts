// Pure helpers for the Profit tab (D-031).
import { periodRange, type PeriodKind } from '../../../core/finance.ts';
import type { Range } from '../../../core/stats.ts';
import { MONTHS } from '../../months.ts';

export interface TrendPoint { key: string; label: string; sales: number; costs: number; net: number }

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

/** Change of a margin in percentage points: 30 % -> 33 % is "▲ 3.0 pts". */
export function pointsChange(cur: number | null, prev: number | null): { text: string; tone: 'up' | 'down' | 'flat' } {
  if (cur === null || prev === null) return { text: '—', tone: 'flat' };
  const pts = Math.round((cur - prev) * 1000) / 10;
  if (pts === 0) return { text: '0 pts', tone: 'flat' };
  return { text: `${pts > 0 ? '▲' : '▼'} ${Math.abs(pts).toFixed(1)} pts`, tone: pts > 0 ? 'up' : 'down' };
}

/** Margin fraction as "33.3 %"; "—" when unknown. */
export function marginText(m: number | null): string {
  if (m === null) return '—';
  const t = (Math.abs(m) * 100).toFixed(1);
  return `${m < 0 && Number(t) !== 0 ? '−' : ''}${t} %`;
}

export const shareText = (share: number) => `${Math.round(share * 100)} %`;

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

/** Chart points: each month's sales, costs (cost of goods + expenses) and net profit (negative on a loss). */
export function trendPoints(trend: { month: string; sales: number; cogs: number; expenses: number; net: number }[]): TrendPoint[] {
  return trend.map((t) => ({ key: t.month, label: monthLabel(t.month), sales: t.sales, costs: t.cogs + t.expenses, net: t.net }));
}

/** Short axis label in euros that fits the chart's left margin: "€2k", "−€1.5k", "€500". */
export function tickMoney(cents: number): string {
  const e = Math.abs(cents) / 100;
  const body = e >= 1000 ? `${Number((e / 1000).toFixed(1))}k` : String(Number(e.toFixed(2)));
  return `${cents < 0 ? '−' : ''}€${body}`;
}
