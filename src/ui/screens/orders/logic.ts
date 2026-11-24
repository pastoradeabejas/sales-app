// Pure helpers for the Orders screens (list, form, detail).
import { normalizeName } from '../../../core/clients.ts';
import { fullName } from '../../../core/groups.ts';
import { formatMoney } from '../../../core/money.ts';
import { buildLine } from '../../../core/orders.ts';
import { allocateClient, type OrderStatus } from '../../../core/payments.ts';
import { formatAmount } from '../../../core/quantity.ts';
import type { Cents, Client, Id, IsoDate, Order, OrderLine, Payment, ProductClass, Scaled, Variant } from '../../../core/types.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const utc = (d: IsoDate) => new Date(`${d}T00:00:00Z`);

function yesterday(today: IsoDate): IsoDate {
  const t = utc(today);
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

/** "22 Nov 2026", or "Sun 22 Nov 2026". */
export function formatDay(date: IsoDate, weekday = false): string {
  const t = utc(date);
  const s = `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
  return weekday ? `${WEEKDAYS[t.getUTCDay()]} ${s}` : s;
}

/** "Today", "Yesterday" or "22 Nov 2026". */
export function dayLabel(date: IsoDate, today: IsoDate): string {
  return date === today ? 'Today' : date === yesterday(today) ? 'Yesterday' : formatDay(date);
}

/** Like dayLabel, without the year when it is the current one ("18 Nov"). */
export function shortDay(date: IsoDate, today: IsoDate): string {
  const label = dayLabel(date, today);
  return date.slice(0, 4) === today.slice(0, 4) ? label.replace(/ \d{4}$/, '') : label;
}

const newestFirst = (a: Order, b: Order) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

export interface DayGroup {
  date: IsoDate;
  label: string;
  /** Sum of the day's non-voided totals. */
  sum: Cents;
  orders: Order[];
}

/** Orders grouped by day, newest day and newest order first. */
export function groupByDay(orders: Order[], today: IsoDate): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const o of [...orders].sort(newestFirst)) {
    let g = groups[groups.length - 1];
    if (g?.date !== o.date) groups.push((g = { date: o.date, label: dayLabel(o.date, today), sum: 0, orders: [] }));
    g.orders.push(o);
    if (!o.voided) g.sum += o.total;
  }
  return groups;
}

export type StatusFilter = 'all' | OrderStatus;

/** Search (client, product, note; accent-insensitive) and status chip; All excludes voided. */
export function filterOrders(
  orders: Order[],
  opts: { query: string; status: StatusFilter; statusOf: (o: Order) => OrderStatus; nameOf: (o: Order) => string },
): Order[] {
  const words = normalizeName(opts.query).split(' ').filter(Boolean);
  return orders.filter((o) => {
    const s = opts.statusOf(o);
    if (opts.status === 'all' ? s === 'voided' : s !== opts.status) return false;
    if (!words.length) return true;
    const hay = normalizeName([opts.nameOf(o), ...o.lines.map((l) => `${l.className} ${l.variantLabel}`), o.note].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/** Orders of the newest n months (by date), and whether older months exist. */
export function newestMonths(orders: Order[], n: number): { shown: Order[]; more: boolean } {
  const months = [...new Set(orders.map((o) => o.date.slice(0, 7)))].sort().reverse();
  const keep = new Set(months.slice(0, n));
  return { shown: orders.filter((o) => keep.has(o.date.slice(0, 7))), more: months.length > n };
}

/** "default €14.00" when the price differs from the variant's current price, else ''. */
export function defaultNote(price: Cents, v: Variant): string {
  return price === v.price ? '' : `default ${formatMoney(v.price)}`;
}

/** Form state: per variant, quantity (fixed) or scaled amount (variable), and price overrides. */
export interface Draft {
  qty: Record<Id, number>;
  prices: Record<Id, Cents>;
}

export type VariantIndex = Map<Id, { cls: ProductClass; variant: Variant }>;

export function variantIndex(classes: ProductClass[]): VariantIndex {
  return new Map(classes.flatMap((cls) => cls.variants.map((variant) => [variant.id, { cls, variant }] as const)));
}

/** Draft from an order: prices used then. With skipArchived (start from), archived variants/classes are left out. */
export function draftFromOrder(order: Order, classesById: Map<Id, ProductClass>, skipArchived: boolean): { draft: Draft; skipped: string[] } {
  const draft: Draft = { qty: {}, prices: {} };
  const skipped: string[] = [];
  for (const l of order.lines) {
    const cls = classesById.get(l.classId);
    const v = cls?.variants.find((x) => x.id === l.variantId);
    if (skipArchived && (!cls || !v || cls.archived || v.archived)) {
      skipped.push(l.variantLabel);
      continue;
    }
    draft.qty[l.variantId] = (draft.qty[l.variantId] ?? 0) + (l.kind === 'fixed' ? (l.quantity ?? 0) : l.amount);
    draft.prices[l.variantId] ??= l.unitPrice;
  }
  return { draft, skipped };
}

/** "1 line skipped: 1 kg is archived". */
export function skippedNote(skipped: string[]): string {
  if (!skipped.length) return '';
  const one = skipped.length === 1;
  return `${skipped.length} ${one ? 'line' : 'lines'} skipped: ${skipped.join(', ')} ${one ? 'is' : 'are'} archived`;
}

/** Order lines of a draft (zeros dropped). Lines already in the edited order keep their lineId and cost snapshot. */
export function draftLines(
  draft: Draft,
  index: VariantIndex,
  avgCostOf: (classId: Id) => number | null,
  nextId: () => Id,
  prev?: Order,
): OrderLine[] {
  const lines: OrderLine[] = [];
  for (const [variantId, n] of Object.entries(draft.qty)) {
    if (!(n > 0)) continue;
    const old = prev?.lines.find((l) => l.variantId === variantId);
    const hit = index.get(variantId);
    if (!hit) {
      if (old) lines.push(old);
      continue;
    }
    const fixed = hit.variant.kind === 'fixed';
    const unitPrice = draft.prices[variantId] ?? hit.variant.price;
    const built = buildLine(hit.cls, hit.variant, { quantity: fixed ? n : undefined, amount: fixed ? undefined : n, unitPrice, classAvgCost: avgCostOf(hit.cls.id) }, old?.lineId ?? nextId());
    lines.push(old ? { ...built, unitCost: old.unitCost } : built);
  }
  return lines;
}

export interface ProductGroup {
  cls: ProductClass;
  variants: Variant[];
}

/** Picker groups: sellable non-archived classes and variants (plus those in `include`), recently sold first. */
export function productGroups(classes: ProductClass[], orders: Order[], include: Set<Id>): ProductGroup[] {
  const last = new Map<Id, IsoDate>();
  for (const o of orders) {
    if (o.voided) continue;
    for (const l of o.lines) {
      if ((last.get(l.variantId) ?? '') < o.date) last.set(l.variantId, o.date);
      if ((last.get(l.classId) ?? '') < o.date) last.set(l.classId, o.date);
    }
  }
  const recent = (a: { id: Id }, b: { id: Id }) => (last.get(b.id) ?? '').localeCompare(last.get(a.id) ?? '');
  return classes
    .map((cls) => {
      const listed = !cls.archived && cls.sellable;
      const variants = cls.variants
        .filter((v) => include.has(v.id) || (listed && !v.archived))
        .sort((a, b) => recent(a, b) || a.sortOrder - b.sortOrder);
      return { cls, variants };
    })
    .filter((g) => g.variants.length > 0)
    .sort((a, b) => recent(a.cls, b.cls) || fullName(a.cls).localeCompare(fullName(b.cls)));
}

/** Stock change per class of saving these lines; an edited order's old lines are given back. */
export function stockDelta(lines: OrderLine[], oldLines: OrderLine[] = []): Map<Id, Scaled> {
  const delta = new Map<Id, Scaled>();
  const add = (l: OrderLine, sign: number) => delta.set(l.classId, (delta.get(l.classId) ?? 0) + sign * l.amount);
  lines.forEach((l) => add(l, -1));
  oldLines.forEach((l) => add(l, 1));
  return delta;
}

/** "Parmigiano Reggiano stock would be −0.400 kg. Save anyway?" (one sentence per class). */
export function stockWarningText(warnings: { classId: Id; after: Scaled }[], classesById: Map<Id, ProductClass>): string {
  const parts = warnings.map((w) => {
    const cls = classesById.get(w.classId);
    return cls ? `${fullName(cls)} stock would be ${formatAmount(w.after, cls.unit.decimals, cls.unit.name, { fixed: true })}.` : '';
  });
  return `${parts.filter(Boolean).join(' ')} Save anyway?`;
}

/** Credit the original client gains when an order is replaced by its edited version. */
export function creditMoved(orders: Order[], payments: Payment[], edited: Order): Cents {
  const prev = orders.find((o) => o.id === edited.id);
  const clientId = prev?.clientId ?? edited.clientId;
  const before = allocateClient(clientId, orders, payments).credit;
  const after = allocateClient(clientId, orders.map((o) => (o.id === edited.id ? edited : o)), payments).credit;
  return Math.max(0, after - before);
}

/** Up to n non-archived clients by their latest non-voided order. */
export function recentClients(clients: Client[], orders: Order[], n = 5): Client[] {
  const last = new Map<Id, string>();
  for (const o of orders) {
    const key = `${o.date}|${o.createdAt}`;
    if (!o.voided && (last.get(o.clientId) ?? '') < key) last.set(o.clientId, key);
  }
  return clients
    .filter((c) => !c.archived && last.has(c.id))
    .sort((a, b) => last.get(b.id)!.localeCompare(last.get(a.id)!))
    .slice(0, n);
}

/** Live client matches: non-archived, accent-insensitive, name prefix first. */
export function matchClients(clients: Client[], query: string, limit = 8): Client[] {
  const q = normalizeName(query);
  if (!q) return [];
  const keyed = clients.filter((c) => !c.archived).map((c) => ({ c, k: normalizeName(c.name) })).filter((x) => x.k.includes(q));
  return keyed
    .sort((a, b) => Number(b.k.startsWith(q)) - Number(a.k.startsWith(q)) || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map((x) => x.c);
}
