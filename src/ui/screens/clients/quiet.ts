import { daysBetween } from '../../../core/payments.ts';
import { goneQuiet } from '../../../core/stats.ts';
import type { Client, Order } from '../../../core/types.ts';

/** Gone-quiet clients (§4.4), non-archived only, with days since the last order. */
export function quietRows(orders: Order[], clients: Client[], today: string) {
  return goneQuiet(orders, clients.filter((c) => !c.archived), today).map((r) => ({ ...r, days: daysBetween(r.lastOrderDate, today) }));
}

export function quietText(days: number, orders: number): string {
  return `Last order ${days} ${days === 1 ? 'day' : 'days'} ago · ${orders} ${orders === 1 ? 'order' : 'orders'}`;
}
