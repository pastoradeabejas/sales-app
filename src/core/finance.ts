// Profit tab figures (D-031): periods, KPIs, breakdowns, inventory value and the monthly trend.
import { inRange, profitSummary, revenue, type ProfitSummary, type Range } from './stats.ts';
import type { Decimals, IsoDate, Order, OrderLine, ProductClass, Purchase, StockEvent } from './types.ts';

export type PeriodKind = 'month' | 'quarter' | 'year' | 'custom';

const ymd = (y: number, m: number, d: number): IsoDate => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const addDays = (d: IsoDate, n: number): IsoDate => {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const days = (r: Range) => Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86400000) + 1;

/** Calendar month, quarter or year containing the date. */
export function periodRange(kind: Exclude<PeriodKind, 'custom'>, date: IsoDate): Range {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  if (kind === 'year') return { from: `${y}-01-01`, to: `${y}-12-31` };
  const first = kind === 'quarter' ? m - ((m - 1) % 3) : m;
  const months = kind === 'quarter' ? 3 : 1;
  return { from: ymd(y, first, 1), to: ymd(y, first + months, 0) };
}

/** The period just before: the previous calendar period, or as many days before for a custom range. */
export function previousPeriod(kind: PeriodKind, r: Range): Range {
  const dayBefore = addDays(r.from, -1);
  if (kind !== 'custom') return periodRange(kind, dayBefore);
  return { from: addDays(r.from, -days(r)), to: dayBefore };
}

/** Change from prev to cur in %, or null when prev is 0. */
export function change(cur: number, prev: number): number | null {
  return prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100;
}

export interface Kpis {
  orders: number;
  avgOrder: number | null;
  /** Gross profit / sales with a known cost. */
  grossMargin: number | null;
  netMargin: number | null;
  /** Sales needed for gross profit to cover the expenses at this gross margin. */
  breakEven: number | null;
}

export function kpis(s: ProfitSummary, orders: Order[], r: Range): Kpis {
  const count = orders.filter((o) => !o.voided && inRange(o.date, r)).length;
  const known = s.cogs + s.gross;
  const grossMargin = known > 0 ? s.gross / known : null;
  return {
    orders: count,
    avgOrder: count ? s.sales / count : null,
    grossMargin,
    netMargin: s.sales > 0 ? s.net / s.sales : null,
    breakEven: grossMargin && grossMargin > 0 ? Math.round(s.expenses / grossMargin) : null,
  };
}

/** Expense lines (classes without stock tracking) per item, largest first. */
export function expensesByItem(
  purchases: Purchase[],
  classesById: Map<string, Pick<ProductClass, 'name' | 'trackStock'>>,
  r: Range,
): { classId: string; name: string; amount: number; share: number }[] {
  const sums = new Map<string, number>();
  for (const p of purchases) {
    if (p.voided || !inRange(p.date, r)) continue;
    for (const l of p.lines) if (classesById.get(l.classId)?.trackStock === false) sums.set(l.classId, (sums.get(l.classId) ?? 0) + l.lineTotal);
  }
  const total = [...sums.values()].reduce((a, b) => a + b, 0);
  return [...sums]
    .map(([classId, amount]) => ({ classId, name: classesById.get(classId)?.name ?? classId, amount, share: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

// Same rule as stats.ts: fixed = quantity × unitCost, variable = amount × unitCost / 10^decimals.
function lineCost(l: OrderLine): number | null {
  if (l.unitCost === null) return null;
  const raw = l.kind === 'fixed' ? (l.quantity ?? 0) * l.unitCost : (l.amount * l.unitCost) / 10 ** l.decimals;
  return Math.round(Number(raw.toFixed(6)));
}

type Acc = { sales: number; known: number; cost: number };
const addLine = (a: Acc, l: OrderLine) => {
  a.sales += l.lineTotal;
  const c = lineCost(l);
  if (c !== null) {
    a.known += l.lineTotal;
    a.cost += c;
  }
};
const result = (a: Acc) => ({
  sales: a.sales,
  profit: a.known - a.cost,
  margin: a.known > 0 ? (a.known - a.cost) / a.known : null,
  coveredShare: a.sales ? a.known / a.sales : 0,
});
const liveIn = (orders: Order[], r: Range) => orders.filter((o) => !o.voided && inRange(o.date, r));

/** Per product class: sales, known cost, profit, margin and amount sold, by sales. */
export function profitByProduct(orders: Order[], r: Range) {
  const by = new Map<string, Acc & { line: OrderLine; amount: number }>();
  for (const o of liveIn(orders, r)) {
    for (const l of o.lines) {
      const a = by.get(l.classId) ?? { sales: 0, known: 0, cost: 0, line: l, amount: 0 };
      addLine(a, l);
      a.amount += l.amount;
      by.set(l.classId, a);
    }
  }
  return [...by]
    .map(([classId, a]) => {
      const { sales, profit, margin, coveredShare } = result(a);
      return { classId, className: a.line.className, sales, cost: a.cost, profit, margin, coveredShare, amount: a.amount, unitName: a.line.unitName, decimals: a.line.decimals as Decimals };
    })
    .sort((x, y) => y.sales - x.sales);
}

/** Per client: sales, profit on lines with a known cost, margin and order count, by sales. */
export function profitByClient(orders: Order[], r: Range) {
  const by = new Map<string, Acc & { name: string; orders: number }>();
  for (const o of liveIn(orders, r)) {
    const a = by.get(o.clientId) ?? { sales: 0, known: 0, cost: 0, name: o.clientName, orders: 0 };
    for (const l of o.lines) addLine(a, l);
    a.orders += 1;
    by.set(o.clientId, a);
  }
  return [...by]
    .map(([clientId, a]) => ({ clientId, clientName: a.name, ...result(a), orders: a.orders }))
    .sort((x, y) => y.sales - x.sales);
}

/** Money in stock: positive stock × average cost (cents), by class; classes with an unknown cost are counted apart. */
export function inventoryValue(
  classes: ProductClass[],
  snapshot: Map<string, { stock: number; avgCost: number | null }>,
): { total: number; rows: { classId: string; name: string; group: string; value: number }[]; unknown: number } {
  const rows: { classId: string; name: string; group: string; value: number }[] = [];
  let unknown = 0;
  for (const c of classes) {
    const s = snapshot.get(c.id);
    if (!s || s.stock <= 0) continue;
    if (s.avgCost === null) {
      unknown++;
      continue;
    }
    rows.push({ classId: c.id, name: c.name, group: c.group ?? '', value: Math.round((s.stock / 10 ** c.unit.decimals) * s.avgCost) });
  }
  rows.sort((a, b) => b.value - a.value);
  return { total: rows.reduce((t, x) => t + x.value, 0), rows, unknown };
}

/** Sales, cost of goods, expenses and net profit for each of the last `months` calendar months, oldest first. */
export function monthlyTrend(
  orders: Order[],
  purchases: Purchase[],
  events: StockEvent[],
  classesById: Map<string, Pick<ProductClass, 'trackStock'>>,
  today: IsoDate,
  months = 12,
): { month: string; sales: number; cogs: number; expenses: number; net: number }[] {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return Array.from({ length: months }, (_, i) => {
    const r = periodRange('month', ymd(y, m - (months - 1 - i), 1));
    const s = profitSummary(orders, purchases, events, classesById, r);
    return { month: r.from.slice(0, 7), sales: revenue(orders, r), cogs: s.cogs, expenses: s.expenses, net: s.net };
  });
}
