import { inRange, profit } from '../../../core/stats.ts';
import type { Range } from '../../../core/stats.ts';
import type { Order } from '../../../core/types.ts';

export interface ClassProfit { classId: string; className: string; profit: number; coveredShare: number }

/** Profit per class sold in the range, best first. */
export function profitByClass(orders: Order[], r: Range): ClassProfit[] {
  const names = new Map<string, string>();
  for (const o of orders) if (!o.voided && inRange(o.date, r)) for (const l of o.lines) if (!names.has(l.classId)) names.set(l.classId, l.className);
  return [...names]
    .map(([classId, className]) => ({ classId, className, ...profit(orders, r, { classId }) }))
    .sort((a, b) => b.profit - a.profit)
    .map(({ classId, className, profit: p, coveredShare }) => ({ classId, className, profit: p, coveredShare }));
}
