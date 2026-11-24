// CSV exports (spec §8.1): RFC 4180 writer plus one function per export file.
import { fullName } from './groups.ts';
import { allocateAll, orderState } from './payments.ts';
import type { ClientBalance } from './payments.ts';
import { toBaseUnits } from './quantity.ts';
import type { Cents, Client, Order, Payment, ProductClass, Purchase, StockEvent, Supplier, UnitCost } from './types.ts';

type Cell = string | number | null | boolean;

const field = (v: Cell) => {
  const s = v === null ? '' : String(v);
  return /[",\r\n]|^ | $/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** RFC 4180 CSV with CRLF line ends and a UTF-8 BOM (so Excel on Mac reads accents). */
export function toCsv(header: string[], rows: Cell[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(field).join(',') + '\r\n').join('');
}

const euros = (c: Cents) => (c / 100).toFixed(2);
// Unit cost (cents per unit) in euros: 2 to 6 decimals.
const unitCost = (c: UnitCost | null) => (c === null ? null : (c / 100).toFixed(6).replace(/0{1,4}$/, ''));

/** Orders export: one row per order with paid, owed and status. */
export function ordersCsv(orders: Order[], payments: Payment[]): string {
  const balances = allocateAll(orders, payments);
  return toCsv(
    ['id', 'date', 'client', 'total_eur', 'paid_eur', 'owed_eur', 'status', 'note', 'voided', 'void_reason', 'created_at', 'updated_by'],
    orders.map((o) => {
      const s = orderState(balances.get(o.clientId), o);
      return [o.id, o.date, o.clientName, euros(o.total), euros(s.paid), euros(s.owed), s.status, o.note, o.voided, o.voidReason, o.createdAt, o.updatedBy];
    }),
  );
}

/** Order lines export: one row per line, amounts in base units. */
export function linesCsv(orders: Order[]): string {
  return toCsv(
    ['order_id', 'date', 'client', 'class', 'variant', 'kind', 'quantity', 'amount', 'unit', 'unit_price_eur', 'line_total_eur', 'unit_cost_eur', 'voided'],
    orders.flatMap((o) =>
      o.lines.map((l) => [o.id, o.date, o.clientName, l.className, l.variantLabel, l.kind, l.quantity, toBaseUnits(l.amount, l.decimals), l.unitName, euros(l.unitPrice), euros(l.lineTotal), unitCost(l.unitCost), o.voided]),
    ),
  );
}

/** Payments export: one row per payment. */
export function paymentsCsv(payments: Payment[], clientsById: Map<string, Client>): string {
  return toCsv(
    ['id', 'date', 'client', 'order_id', 'amount_eur', 'method', 'note', 'voided'],
    payments.map((p) => [p.id, p.date, clientsById.get(p.clientId)?.name ?? p.clientId, p.orderId, euros(p.amount), p.method, p.note, p.voided]),
  );
}

/** Clients export: one row per client with owed and credit. */
export function clientsCsv(clients: Client[], balances: Map<string, ClientBalance>): string {
  return toCsv(
    ['id', 'name', 'phone', 'tags', 'notes', 'owed_eur', 'credit_eur', 'archived'],
    clients.map((c) => [c.id, c.name, c.phone, c.tags.join(';'), c.notes, euros(balances.get(c.id)?.owed ?? 0), euros(balances.get(c.id)?.credit ?? 0), c.archived]),
  );
}

/** Stock export: one row per movement; a transform gives "transform in" and "transform out" rows. */
export function stockCsv(events: StockEvent[], classesById: Map<string, ProductClass>): string {
  const row = (e: StockEvent, type: string, classId: string, amount: number, cost: UnitCost | null, reason: string): Cell[] => {
    const c = classesById.get(classId);
    return [e.id, e.date, type, c ? fullName(c) : classId, toBaseUnits(amount, c?.unit.decimals ?? 0), c?.unit.name ?? '', unitCost(cost), reason, e.note, e.voided];
  };
  return toCsv(
    ['event_id', 'date', 'type', 'class', 'amount', 'unit', 'unit_cost_eur', 'reason', 'note', 'voided'],
    events.flatMap((e) =>
      e.type === 'transform'
        ? [...e.inputs.map((x) => row(e, 'transform in', x.classId, x.amount, null, '')), ...e.outputs.map((x) => row(e, 'transform out', x.classId, x.amount, null, ''))]
        : [row(e, e.type, e.classId, e.amount, e.unitCost, e.reason)],
    ),
  );
}

/** Purchases export: one row per line. */
export function purchasesCsv(purchases: Purchase[]): string {
  return toCsv(
    ['date', 'purchase_id', 'supplier', 'item', 'amount', 'unit', 'line_total_eur', 'method', 'note', 'voided'],
    purchases.flatMap((p) =>
      p.lines.map((l) => [p.date, p.id, p.supplierName, l.className, toBaseUnits(l.amount, l.decimals), l.unitName, euros(l.lineTotal), p.method, p.note, p.voided]),
    ),
  );
}

/** Suppliers export: one row per supplier. */
export function suppliersCsv(suppliers: Supplier[]): string {
  return toCsv(['name', 'phone', 'notes', 'archived'], suppliers.map((s) => [s.name, s.phone, s.notes, s.archived]));
}

export interface ExportData {
  orders: Order[];
  payments: Payment[];
  clients: Client[];
  stock: StockEvent[];
  classes: ProductClass[];
  purchases: Purchase[];
  suppliers: Supplier[];
}

/** All seven CSV files, named sales-<kind>-<today>.csv. */
export function exportFiles(d: ExportData, today: string): { name: string; content: string }[] {
  const files: [string, string][] = [
    ['orders', ordersCsv(d.orders, d.payments)],
    ['lines', linesCsv(d.orders)],
    ['payments', paymentsCsv(d.payments, new Map(d.clients.map((c) => [c.id, c])))],
    ['clients', clientsCsv(d.clients, allocateAll(d.orders, d.payments))],
    ['stock', stockCsv(d.stock, new Map(d.classes.map((c) => [c.id, c])))],
    ['purchases', purchasesCsv(d.purchases)],
    ['suppliers', suppliersCsv(d.suppliers)],
  ];
  return files.map(([kind, content]) => ({ name: `sales-${kind}-${today}.csv`, content }));
}
