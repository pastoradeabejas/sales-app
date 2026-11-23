// Payment allocation, status, owed and credit (spec §4.2), plus payment previews and debt stats (§4.4).
import type { Order, Payment } from './types.ts';

/** Order payment status. */
export type OrderStatus = 'unpaid' | 'partial' | 'paid' | 'voided';

/** Part of one payment applied to one order; linked = applied as the order's own linked payment. */
export interface Allocation {
  paymentId: string;
  amount: number;
  date: string;
  linked: boolean;
}

/** Computed payment state of one order. */
export interface OrderPayState {
  orderId: string;
  total: number;
  paid: number;
  owed: number;
  status: OrderStatus;
  paidFraction: number;
  paidDate: string | null;
  allocations: Allocation[];
}

/** Computed balance of one client: owed or credit (never both) and every order's state. */
export interface ClientBalance {
  clientId: string;
  owed: number;
  credit: number;
  orders: Map<string, OrderPayState>;
}

type Dated = { date: string; createdAt: string };
const byDate = (a: Dated, b: Dated) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;

/** Whole days from a to b (b − a), on YYYY-MM-DD dates in UTC. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

function buildState(o: Order, allocations: Allocation[]): OrderPayState {
  if (o.voided) {
    return { orderId: o.id, total: o.total, paid: 0, owed: 0, status: 'voided', paidFraction: 0, paidDate: null, allocations: [] };
  }
  const paid = allocations.reduce((s, a) => s + a.amount, 0);
  const status: OrderStatus = paid >= o.total ? 'paid' : paid === 0 ? 'unpaid' : 'partial';
  // Completed by its latest payment; money held before the order (credit) counts from the order date.
  const paidDate = status === 'paid' ? allocations.reduce((d, a) => (a.date > d ? a.date : d), o.date) : null;
  const paidFraction = o.total === 0 ? 1 : paid / o.total;
  return { orderId: o.id, total: o.total, paid, owed: o.total - paid, status, paidFraction, paidDate, allocations };
}

// Allocation for records already known to belong to one client.
function allocate(clientId: string, orders: Order[], payments: Payment[]): ClientBalance {
  const live = orders.filter((o) => !o.voided).sort(byDate);
  const remaining = new Map(live.map((o) => [o.id, o.total]));
  const allocs = new Map<string, Allocation[]>(live.map((o) => [o.id, []]));
  const give = (orderId: string, p: Payment, amount: number, linked: boolean) => {
    remaining.set(orderId, remaining.get(orderId)! - amount);
    allocs.get(orderId)!.push({ paymentId: p.id, amount, date: p.date, linked });
  };

  // Linked payments to their own order; excess and unlinked payments form the pool, in date order.
  const pool: { p: Payment; left: number }[] = [];
  for (const p of payments.filter((x) => !x.voided).sort(byDate)) {
    const r = p.orderId === null ? undefined : remaining.get(p.orderId);
    const take = r === undefined ? 0 : Math.min(r, p.amount);
    if (take > 0) give(p.orderId!, p, take, true);
    if (p.amount > take) pool.push({ p, left: p.amount - take });
  }

  // Pool to open orders, oldest first; the rest is credit.
  let i = 0;
  let credit = 0;
  for (const e of pool) {
    while (e.left > 0 && i < live.length) {
      const r = remaining.get(live[i].id)!;
      if (r <= 0) { i++; continue; }
      const take = Math.min(r, e.left);
      give(live[i].id, e.p, take, false);
      e.left -= take;
    }
    credit += e.left;
  }

  const states = new Map<string, OrderPayState>();
  let owed = 0;
  for (const o of orders) {
    const s = buildState(o, allocs.get(o.id) ?? []);
    states.set(o.id, s);
    owed += s.owed;
  }
  return { clientId, owed, credit, orders: states };
}

/** §4.2 allocation for one client; records of other clients are ignored. */
export function allocateClient(clientId: string, orders: Order[], payments: Payment[]): ClientBalance {
  return allocate(clientId, orders.filter((o) => o.clientId === clientId), payments.filter((p) => p.clientId === clientId));
}

/** §4.2 allocation for every client that has an order or a payment. */
export function allocateAll(orders: Order[], payments: Payment[]): Map<string, ClientBalance> {
  const groups = new Map<string, { orders: Order[]; payments: Payment[] }>();
  const group = (id: string) => groups.get(id) ?? groups.set(id, { orders: [], payments: [] }).get(id)!;
  for (const o of orders) group(o.clientId).orders.push(o);
  for (const p of payments) group(p.clientId).payments.push(p);
  const out = new Map<string, ClientBalance>();
  for (const [id, g] of groups) out.set(id, allocate(id, g.orders, g.payments));
  return out;
}

/** State of one order from its client's balance; an unknown order counts as unpaid. */
export function orderState(balance: ClientBalance | undefined, order: Order): OrderPayState {
  return balance?.orders.get(order.id) ?? buildState(order, []);
}

/** Part of an order's paid amount that came from credit / pool money ("Paid from credit €X"). */
export function paidFromCredit(state: OrderPayState): number {
  return state.allocations.reduce((s, a) => s + (a.linked ? 0 : a.amount), 0);
}

/** Cents of the linked payment to create when saving a new order (D-007); 0 = none. */
export function newOrderPayment(input: { status: 'unpaid' | 'partial' | 'paid'; total: number; credit: number; paidNow?: number }): number {
  if (input.status === 'paid') return Math.max(0, input.total - input.credit);
  return input.status === 'partial' ? (input.paidNow ?? 0) : 0;
}

/** Status preview of a new order counting the client's credit (§8.4 footer). */
export function previewNewOrder(balance: ClientBalance | undefined, total: number, paymentNow: number): { creditUsed: number; status: OrderStatus } {
  const linked = Math.min(total, paymentNow);
  const creditUsed = Math.min(balance?.credit ?? 0, total - linked);
  const paid = linked + creditUsed;
  return { creditUsed, status: paid >= total ? 'paid' : paid === 0 ? 'unpaid' : 'partial' };
}

/** Preview of an unlinked payment: open orders it covers, oldest first, and what becomes credit (§8.7). */
export function previewReceive(balance: ClientBalance, orders: Order[], amount: number): { covers: { orderId: string; amount: number; closes: boolean }[]; toCredit: number } {
  const covers: { orderId: string; amount: number; closes: boolean }[] = [];
  let left = amount;
  const open = orders.filter((o) => (balance.orders.get(o.id)?.owed ?? 0) > 0).sort(byDate);
  for (const o of open) {
    if (left <= 0) break;
    const owed = balance.orders.get(o.id)!.owed;
    const take = Math.min(owed, left);
    covers.push({ orderId: o.id, amount: take, closes: take === owed });
    left -= take;
  }
  return { covers, toCredit: left };
}

/** Owed amounts grouped by order age in days (today − order date). */
export function debtAge(balances: Iterable<ClientBalance>, orders: Order[], today: string): { '0-7': number; '8-30': number; '31-90': number; '90+': number } {
  const out = { '0-7': 0, '8-30': 0, '31-90': 0, '90+': 0 };
  const dates = new Map(orders.map((o) => [o.id, o.date]));
  for (const b of balances) {
    for (const s of b.orders.values()) {
      const date = dates.get(s.orderId);
      if (s.owed <= 0 || date === undefined) continue;
      const d = daysBetween(date, today);
      out[d <= 7 ? '0-7' : d <= 30 ? '8-30' : d <= 90 ? '31-90' : '90+'] += s.owed;
    }
  }
  return out;
}

/** Age in days of the client's oldest order with something owed; null if nothing is owed. */
export function oldestUnpaidDays(balance: ClientBalance, orders: Order[], today: string): number | null {
  let max: number | null = null;
  for (const o of orders) {
    if ((balance.orders.get(o.id)?.owed ?? 0) <= 0) continue;
    const d = daysBetween(o.date, today);
    if (max === null || d > max) max = d;
  }
  return max;
}

/** Mean days from order date to paidDate over fully paid orders dated in [from, to] (§4.4); null if none. */
export function avgDaysToPay(balances: Iterable<ClientBalance>, orders: Order[], from: string, to: string, clientId?: string): number | null {
  const states = new Map<string, OrderPayState>();
  for (const b of balances) if (clientId === undefined || b.clientId === clientId) for (const [id, s] of b.orders) states.set(id, s);
  let sum = 0;
  let n = 0;
  for (const o of orders) {
    const s = states.get(o.id);
    if (!s || s.status !== 'paid' || s.total === 0 || o.date < from || o.date > to) continue;
    sum += daysBetween(o.date, s.paidDate!);
    n++;
  }
  return n === 0 ? null : sum / n;
}
