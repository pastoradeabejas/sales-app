// Pure helpers for the Overview screen (spec §8.2).
import { formatAmount } from '../../../core/quantity.ts';
import { rangeFor } from '../../../core/stats.ts';
import type { Decimals } from '../../../core/types.ts';
import type { Bucket, ClassSold, Metric, Range, VariantSold } from '../../../core/stats.ts';
import { MONTHS } from '../../months.ts';

export type RangeKind = 'week' | 'month' | 'year' | 'custom';

/** Selected range; a reversed custom range is swapped, a missing custom date falls back to the month. */
export function viewRange(kind: RangeKind, today: string, custom: { from: string; to: string } | null): Range {
  if (kind !== 'custom') return rangeFor(kind, today);
  if (!custom || !custom.from || !custom.to) return rangeFor('month', today);
  return custom.from <= custom.to ? { from: custom.from, to: custom.to } : { from: custom.to, to: custom.from };
}

/** Whole percents (largest remainder) that sum to 100; all zero when there is nothing. */
export function percents(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const out = raw.map(Math.floor);
  const order = raw.map((r, i) => ({ i, rem: r - out[i] })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  const missing = 100 - out.reduce((a, b) => a + b, 0);
  for (let k = 0; k < missing; k++) out[order[k].i]++;
  return out;
}

const AGES = [['0-7', '0–7 d'], ['8-30', '8–30 d'], ['31-90', '31–90 d'], ['90+', '90+ d']] as const;

export function debtSegments(age: Record<'0-7' | '8-30' | '31-90' | '90+', number>): { key: string; label: string; amount: number; pct: number }[] {
  const pct = percents(AGES.map(([k]) => age[k]));
  return AGES.map(([k, label], i) => ({ key: k, label, amount: age[k], pct: pct[i] }));
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : one + 's'}`;
export const owedDetail = (orders: number, oldestDays: number) => `${plural(orders, 'order')} · oldest ${plural(oldestDays, 'day')}`;

/** "12.2 kg" / "13 pcs". */
export const unitsText = (c: ClassSold) => formatAmount(c.amount, c.decimals as Decimals, c.unitName);

/** Variant total: item count for fixed, amount with unit for variable. */
export function variantText(v: VariantSold, c: ClassSold): string {
  return v.kind === 'fixed' ? `${v.quantity ?? 0} sold` : formatAmount(v.amount, c.decimals as Decimals, c.unitName);
}

/** Paid / unpaid bar percents and the "N unpaid" text of a variant. */
export function splitText(v: VariantSold, c: ClassSold): { paidPct: number; unpaidPct: number; unpaid: string } {
  const fixed = v.kind === 'fixed';
  const [paidPct, unpaidPct] = percents(fixed ? [v.paidQty, v.unpaidQty] : [v.paidAmount, v.unpaidAmount]);
  const unpaid = fixed ? String(Math.round(v.unpaidQty)) : formatAmount(Math.round(v.unpaidAmount), c.decimals as Decimals, c.unitName);
  return { paidPct, unpaidPct, unpaid: `${unpaid} unpaid` };
}

/** Piece classes chart items sold, others chart the amount. */
export const seriesMetric = (c: ClassSold): Metric => (c.variants.every((v) => v.kind === 'fixed') ? 'units' : 'amount');

export function bucketLabel(start: string, bucket: Bucket): string {
  const month = MONTHS[Number(start.slice(5, 7)) - 1];
  return bucket === 'month' ? month : `${Number(start.slice(8, 10))} ${month}`;
}


/** Overview sections shown one at a time under the owed card (D-032). */
export type Section = 'owes' | 'top' | 'units' | 'stock';
export const SECTION_KEY = 'overviewSection';
export const parseSection = (raw: string | null): Section | null =>
  raw === 'owes' || raw === 'top' || raw === 'units' || raw === 'stock' ? raw : null;
/** Tapping the open section's button closes it; any other button opens its section. */
export const toggleSection = (open: Section | null, tapped: Section): Section | null => (open === tapped ? null : tapped);
