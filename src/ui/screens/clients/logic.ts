// Pure helpers for the Clients screens: search, sort, merge preview, receive defaults.
import { normalizeName } from '../../../core/clients.ts';
import type { ClientBalance } from '../../../core/payments.ts';
import type { Client, Order, Payment, PaymentMethod } from '../../../core/types.ts';
import { MONTHS } from '../../months.ts';

export type ClientSort = 'owed' | 'name' | 'last';

export interface ClientRow {
  client: Client;
  owed: number;
  credit: number;
  lastOrder: string | null;
}

/** Search by name, phone or tags (accent and case insensitive). */
export function filterClients(clients: Client[], query: string, showArchived: boolean): Client[] {
  const q = normalizeName(query);
  return clients.filter(
    (c) =>
      (showArchived || !c.archived) &&
      (!q || [c.name, c.phone, ...c.tags].some((s) => normalizeName(s).includes(q))),
  );
}

export function clientRows(clients: Client[], orders: Order[], balances: Map<string, ClientBalance>): ClientRow[] {
  const last = new Map<string, string>();
  for (const o of orders) if (!o.voided && o.date > (last.get(o.clientId) ?? '')) last.set(o.clientId, o.date);
  return clients.map((client) => ({
    client,
    owed: balances.get(client.id)?.owed ?? 0,
    credit: balances.get(client.id)?.credit ?? 0,
    lastOrder: last.get(client.id) ?? null,
  }));
}

export function sortRows(rows: ClientRow[], sort: ClientSort): ClientRow[] {
  const byName = (a: ClientRow, b: ClientRow) => a.client.name.localeCompare(b.client.name);
  const cmp =
    sort === 'name'
      ? byName
      : sort === 'owed'
        ? (a: ClientRow, b: ClientRow) => b.owed - a.owed || byName(a, b)
        : (a: ClientRow, b: ClientRow) => (b.lastOrder ?? '').localeCompare(a.lastOrder ?? '') || byName(a, b);
  return [...rows].sort(cmp);
}

/** Live orders and payments that a merge would move. */
export function mergePreview(orders: Order[], payments: Payment[], dupId: string) {
  return {
    orders: orders.filter((o) => o.clientId === dupId && !o.voided).length,
    payments: payments.filter((p) => p.clientId === dupId && !p.voided).length,
  };
}

export function mergeText(p: { orders: number; payments: number }): string {
  return `${p.orders} ${p.orders === 1 ? 'order' : 'orders'}, ${p.payments} ${p.payments === 1 ? 'payment' : 'payments'} will move`;
}

export function receiveDefaults(owed: number, lastMethod: PaymentMethod | null | undefined, today: string) {
  return { amount: owed, method: lastMethod ?? ('cash' as PaymentMethod), date: today };
}

export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const t of text.split(',').map((s) => s.trim())) if (t && !out.includes(t)) out.push(t);
  return out;
}

/** "2026-11-22" -> "22 Nov". */
export function shortDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}
