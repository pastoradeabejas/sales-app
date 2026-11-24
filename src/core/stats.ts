// Statistics (spec §4.4): pure functions over orders, payments and computed balances. Voided records are always excluded.
import { avgDaysToPay, daysBetween, oldestUnpaidDays } from './payments.ts';
import type { ClientBalance } from './payments.ts';
import type { Client, IsoDate, Order, OrderLine, Payment, ProductClass, Purchase, StockEvent, VariantKind } from './types.ts';

/** Inclusive date range. */
export type Range = { from: IsoDate; to: IsoDate };
export type Bucket = 'day' | 'week' | 'month';
export interface StatsFilter { classId?: string; variantId?: string; clientId?: string }

const DAY = 86400000;
const toMs = (d: IsoDate) => Date.parse(d + 'T00:00:00Z');
const fromMs = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10);
const addDays = (d: IsoDate, n: number) => fromMs(toMs(d) + n * DAY);
const live = (orders: Order[]) => orders.filter((o) => !o.voided);

/** Current Monday-based week, calendar month or calendar year containing today. */
export function rangeFor(kind: 'week' | 'month' | 'year', today: IsoDate): Range {
  if (kind === 'week') { const from = bucketStart(today, 'week'); return { from, to: addDays(from, 6) }; }
  const y = Number(today.slice(0, 4));
  if (kind === 'year') return { from: `${y}-01-01`, to: `${y}-12-31` };
  const m = Number(today.slice(5, 7));
  return { from: `${today.slice(0, 7)}-01`, to: fromMs(Date.UTC(y, m, 0)) };
}

/** True when the date lies in the range (inclusive). */
export function inRange(date: IsoDate, r: Range): boolean {
  return date >= r.from && date <= r.to;
}

/** Bucket size for a chart: day up to 31 days, week up to 183 days, else month (§4.4). */
export function autoBucket(r: Range): Bucket {
  const days = daysBetween(r.from, r.to) + 1;
  return days <= 31 ? 'day' : days <= 183 ? 'week' : 'month';
}

/** First day of the bucket holding the date (weeks start Monday). */
export function bucketStart(date: IsoDate, bucket: Bucket): IsoDate {
  if (bucket === 'day') return date;
  if (bucket === 'month') return date.slice(0, 7) + '-01';
  return addDays(date, -((new Date(toMs(date)).getUTCDay() + 6) % 7));
}

/** Every bucket start covering the range, in order. */
export function buckets(r: Range, bucket: Bucket): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = bucketStart(r.from, bucket); d <= r.to; ) {
    out.push(d);
    d = bucket === 'day' ? addDays(d, 1) : bucket === 'week' ? addDays(d, 7) : fromMs(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 1));
  }
  return out;
}

// Lines of an order that match the class / variant filter.
const matching = (o: Order, f: StatsFilter = {}): OrderLine[] =>
  o.lines.filter((l) => (!f.classId || l.classId === f.classId) && (!f.variantId || l.variantId === f.variantId));
const hasLineFilter = (f: StatsFilter = {}) => !!(f.classId || f.variantId);
// Live orders in range for the client filter.
const inScope = (orders: Order[], r: Range, f: StatsFilter = {}) =>
  live(orders).filter((o) => inRange(o.date, r) && (!f.clientId || o.clientId === f.clientId));
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const fraction = (balances: Map<string, ClientBalance>, o: Order) => balances.get(o.clientId)?.orders.get(o.id)?.paidFraction ?? 0;

/** Σ order totals in range (with class / variant filter: Σ matching line totals). */
export function revenue(orders: Order[], r: Range, f: StatsFilter = {}): number {
  return sum(inScope(orders, r, f), (o) => (hasLineFilter(f) ? sum(matching(o, f), (l) => l.lineTotal) : o.total));
}

/** Σ payment amounts dated in range, optionally for one client. */
export function collected(payments: Payment[], r: Range, clientId?: string): number {
  return sum(payments.filter((p) => !p.voided && inRange(p.date, r) && (!clientId || p.clientId === clientId)), (p) => p.amount);
}

export interface VariantSold {
  variantId: string; label: string; kind: VariantKind;
  /** Item count for fixed variants, null for variable. */
  quantity: number | null;
  amount: number; paidQty: number; unpaidQty: number; paidAmount: number; unpaidAmount: number;
}
export interface ClassSold { classId: string; className: string; unitName: string; decimals: number; amount: number; variants: VariantSold[] }

/** Units and amount sold per class and variant, split paid / unpaid by paidFraction; classes by amount desc, variants in order of first appearance. */
export function unitsSold(orders: Order[], balances: Map<string, ClientBalance>, r: Range, f: StatsFilter = {}): ClassSold[] {
  const classes = new Map<string, ClassSold>();
  for (const o of inScope(orders, r, f)) {
    const pf = fraction(balances, o);
    for (const l of matching(o, f)) {
      let c = classes.get(l.classId);
      if (!c) classes.set(l.classId, (c = { classId: l.classId, className: l.className, unitName: l.unitName, decimals: l.decimals, amount: 0, variants: [] }));
      let v = c.variants.find((x) => x.variantId === l.variantId);
      if (!v) c.variants.push((v = { variantId: l.variantId, label: l.variantLabel, kind: l.kind, quantity: l.kind === 'fixed' ? 0 : null, amount: 0, paidQty: 0, unpaidQty: 0, paidAmount: 0, unpaidAmount: 0 }));
      const q = l.quantity ?? 0;
      c.amount += l.amount;
      v.amount += l.amount;
      if (v.quantity !== null) v.quantity += q;
      v.paidQty += q * pf; v.unpaidQty += q * (1 - pf);
      v.paidAmount += l.amount * pf; v.unpaidAmount += l.amount * (1 - pf);
    }
  }
  return [...classes.values()].sort((a, b) => b.amount - a.amount);
}

export type Metric = 'units' | 'amount' | 'revenue' | 'collected';
export interface SeriesPoint { start: IsoDate; paid: number; unpaid: number; total: number; orderIds: string[] }

// Value of one order for a metric; null when the order contributes nothing (no matching line).
function orderValue(o: Order, metric: Metric, f: StatsFilter): number | null {
  if (metric === 'revenue' && !hasLineFilter(f)) return o.total;
  const lines = matching(o, f);
  if (lines.length === 0) return null;
  return sum(lines, (l) => (metric === 'units' ? l.quantity ?? 0 : metric === 'amount' ? l.amount : l.lineTotal));
}

/** Metric per bucket over the range; paid / unpaid by paidFraction (collected: all paid). */
export function timeSeries(orders: Order[], payments: Payment[], balances: Map<string, ClientBalance>, r: Range, metric: Metric, f: StatsFilter = {}, bucket: Bucket = autoBucket(r)): SeriesPoint[] {
  const points = new Map<IsoDate, SeriesPoint>(buckets(r, bucket).map((start) => [start, { start, paid: 0, unpaid: 0, total: 0, orderIds: [] }]));
  if (metric === 'collected') {
    for (const p of payments) {
      if (p.voided || !inRange(p.date, r) || (f.clientId && p.clientId !== f.clientId)) continue;
      const pt = points.get(bucketStart(p.date, bucket))!;
      pt.paid += p.amount; pt.total += p.amount;
      if (p.orderId && !pt.orderIds.includes(p.orderId)) pt.orderIds.push(p.orderId);
    }
  } else {
    for (const o of inScope(orders, r, f)) {
      const v = orderValue(o, metric, f);
      if (v === null) continue;
      const pt = points.get(bucketStart(o.date, bucket))!;
      const pf = fraction(balances, o);
      pt.paid += v * pf; pt.unpaid += v * (1 - pf); pt.total += v; pt.orderIds.push(o.id);
    }
  }
  return [...points.values()];
}

/** Share of each variant's amount within a class, in order of first appearance. */
export function variantMix(orders: Order[], classId: string, r: Range): { variantId: string; label: string; amount: number; share: number }[] {
  const mix = new Map<string, { variantId: string; label: string; amount: number; share: number }>();
  for (const o of inScope(orders, r)) {
    for (const l of matching(o, { classId })) {
      const m = mix.get(l.variantId) ?? mix.set(l.variantId, { variantId: l.variantId, label: l.variantLabel, amount: 0, share: 0 }).get(l.variantId)!;
      m.amount += l.amount;
    }
  }
  const total = sum([...mix.values()], (m) => m.amount);
  return [...mix.values()].map((m) => ({ ...m, share: total === 0 ? 0 : m.amount / total }));
}

/** Best clients by revenue (cents) or amount (scaled units) in range, highest first. */
export function topClients(orders: Order[], r: Range, by: 'revenue' | 'amount', n = 5, classId?: string): { clientId: string; clientName: string; value: number }[] {
  const acc = new Map<string, { clientId: string; clientName: string; value: number }>();
  for (const o of inScope(orders, r)) {
    const value = by === 'revenue' && !classId ? o.total : sum(matching(o, { classId }), (l) => (by === 'revenue' ? l.lineTotal : l.amount));
    const c = acc.get(o.clientId) ?? acc.set(o.clientId, { clientId: o.clientId, clientName: o.clientName, value: 0 }).get(o.clientId)!;
    c.value += value;
  }
  return [...acc.values()].filter((c) => c.value > 0).sort((a, b) => b.value - a.value).slice(0, n);
}

// Live orders of one client with something owed.
const openOrders = (b: ClientBalance, orders: Order[]) => live(orders).filter((o) => o.clientId === b.clientId && (b.orders.get(o.id)?.owed ?? 0) > 0);

/** Clients who owe, highest first: owed, open order count, age of the oldest open order. Ties by client id. */
export function whoOwes(balances: Map<string, ClientBalance>, orders: Order[], today: IsoDate, n?: number): { clientId: string; clientName: string; owed: number; orderCount: number; oldestDays: number }[] {
  const rows = [...balances.values()].filter((b) => b.owed > 0).map((b) => {
    const open = openOrders(b, orders);
    return { clientId: b.clientId, clientName: open[0]?.clientName ?? '', owed: b.owed, orderCount: open.length, oldestDays: oldestUnpaidDays(b, open, today) ?? 0 };
  });
  rows.sort((a, b) => b.owed - a.owed || (a.clientId < b.clientId ? -1 : 1));
  return rows.slice(0, n);
}

/** Total owed, clients owing, open orders, open orders older than 30 days, credit held (all time). */
export function owedSummary(balances: Map<string, ClientBalance>, orders: Order[], today: IsoDate): { totalOwed: number; clients: number; unpaidOrders: number; over30: number; creditHeld: number } {
  const all = [...balances.values()];
  const open = all.flatMap((b) => openOrders(b, orders));
  return {
    totalOwed: sum(all, (b) => b.owed),
    clients: all.filter((b) => b.owed > 0).length,
    unpaidOrders: open.length,
    over30: open.filter((o) => daysBetween(o.date, today) > 30).length,
    creditHeld: sum(all, (b) => b.credit),
  };
}

/** Clients with 3+ orders all time whose last order is more than 45 days old (exactly 45 days is not yet quiet); oldest first. */
export function goneQuiet(orders: Order[], clients: Client[], today: IsoDate): { clientId: string; clientName: string; orderCount: number; lastOrderDate: IsoDate }[] {
  const out: { clientId: string; clientName: string; orderCount: number; lastOrderDate: IsoDate }[] = [];
  for (const c of clients) {
    const mine = live(orders).filter((o) => o.clientId === c.id);
    const last = mine.reduce((d, o) => (o.date > d ? o.date : d), '');
    if (mine.length >= 3 && daysBetween(last, today) > 45) out.push({ clientId: c.id, clientName: c.name, orderCount: mine.length, lastOrderDate: last });
  }
  return out.sort((a, b) => (a.lastOrderDate < b.lastOrderDate ? -1 : 1));
}

/** Client profile tiles (§8.7): spend, average days to pay, first / last order date, order count. */
export function clientStats(orders: Order[], balances: Map<string, ClientBalance>, clientId: string, today: IsoDate): { totalSpent: number; avgDaysToPay: number | null; firstOrder: IsoDate | null; lastOrder: IsoDate | null; orderCount: number } {
  void today;
  const mine = live(orders).filter((o) => o.clientId === clientId).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    totalSpent: sum(mine, (o) => o.total),
    avgDaysToPay: avgDaysToPay(balances.values(), mine, '0000-01-01', '9999-12-31', clientId),
    firstOrder: mine[0]?.date ?? null,
    lastOrder: mine[mine.length - 1]?.date ?? null,
    orderCount: mine.length,
  };
}

export interface BoughtVariant { classId: string; className: string; variantId: string; label: string; kind: VariantKind; quantity: number | null; amount: number; unitName: string; decimals: number }

/** Everything one client ever bought, per variant, in order of first purchase (§8.7). */
export function unitsBought(orders: Order[], clientId: string): BoughtVariant[] {
  const out = new Map<string, BoughtVariant>();
  for (const o of live(orders).filter((x) => x.clientId === clientId).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    for (const l of o.lines) {
      const v = out.get(l.variantId) ?? out.set(l.variantId, { classId: l.classId, className: l.className, variantId: l.variantId, label: l.variantLabel, kind: l.kind, quantity: l.kind === 'fixed' ? 0 : null, amount: 0, unitName: l.unitName, decimals: l.decimals }).get(l.variantId)!;
      if (v.quantity !== null) v.quantity += l.quantity ?? 0;
      v.amount += l.amount;
    }
  }
  return [...out.values()];
}

// Line cost in cents, rounded half up; null when unknown.
function lineCost(l: OrderLine): number | null {
  if (l.unitCost === null) return null;
  const raw = l.kind === 'fixed' ? (l.quantity ?? 0) * l.unitCost : (l.amount * l.unitCost) / 10 ** l.decimals;
  return Math.round(Number(raw.toFixed(6)));
}

/** Profit over lines with a known cost, and the share of revenue they cover (0..1). */
export function profit(orders: Order[], r: Range, f: StatsFilter = {}): { revenueWithCost: number; cost: number; profit: number; coveredShare: number } {
  let all = 0;
  let known = 0;
  let cost = 0;
  for (const o of inScope(orders, r, f)) {
    for (const l of matching(o, f)) {
      all += l.lineTotal;
      const c = lineCost(l);
      if (c === null) continue;
      known += l.lineTotal; cost += c;
    }
  }
  return { revenueWithCost: known, cost, profit: known - cost, coveredShare: all === 0 ? 0 : known / all };
}

export interface ProfitSummary {
  sales: number;
  /** Cost of the sold lines with a known cost (materials and labour inside). */
  cogs: number;
  coveredShare: number;
  /** Sales with known cost − cogs. */
  gross: number;
  /** Purchase lines that add no stock (class without stock tracking). */
  expenses: number;
  net: number;
  /** Labour booked in transforms; information only, already inside product costs. */
  labour: number;
  /** All purchases: stock and expenses. */
  spent: number;
}

/** Profit card figures over a range (§16.6). */
export function profitSummary(
  orders: Order[],
  purchases: Purchase[],
  events: StockEvent[],
  classesById: Map<string, Pick<ProductClass, 'trackStock'>>,
  r: Range,
): ProfitSummary {
  const p = profit(orders, r);
  let expenses = 0;
  let spent = 0;
  for (const pu of purchases) {
    if (pu.voided || !inRange(pu.date, r)) continue;
    spent += pu.total;
    for (const l of pu.lines) if (classesById.get(l.classId)?.trackStock === false) expenses += l.lineTotal;
  }
  let labour = 0;
  for (const e of events) {
    if (e.voided || e.type !== 'transform' || !inRange(e.date, r)) continue;
    for (const l of e.costs?.labour ?? []) labour += l.amount;
  }
  return {
    sales: revenue(orders, r), cogs: p.cost, coveredShare: p.coveredShare, gross: p.profit,
    expenses, net: p.profit - expenses, labour, spent,
  };
}
