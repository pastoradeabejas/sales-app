// Pure helpers for the Purchases and Suppliers screens (§16.7).
import { normalizeName } from '../../../core/clients.ts';
import { fullName } from '../../../core/groups.ts';
import { parseMoney } from '../../../core/money.ts';
import { isExpenseItem } from '../../../core/purchases.ts';
import { formatAmount, parseAmount } from '../../../core/quantity.ts';
import type { Cents, Id, IsoDate, ProductClass, Purchase, PurchaseLine, Scaled, Supplier } from '../../../core/types.ts';
import { dayLabel } from '../orders/logic.ts';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const monthName = (date: IsoDate): string => MONTHS[Number(date.slice(5, 7)) - 1];

/** Non-voided spending on dates starting with `prefix` ("2026-11" or "2026"), optionally one supplier's. */
export const spentIn = (purchases: Purchase[], prefix: string, supplierId?: Id): Cents =>
  purchases.reduce((s, p) => (!p.voided && p.date.startsWith(prefix) && (!supplierId || p.supplierId === supplierId) ? s + p.total : s), 0);

/** "Packaging - Lid 900 pcs, Fuel": expense items show only the name. */
export const purchaseSummary = (lines: PurchaseLine[], isExpense: (l: PurchaseLine) => boolean): string =>
  lines.map((l) => (isExpense(l) ? l.className : `${l.className} ${formatAmount(l.amount, l.decimals, l.unitName)}`)).join(', ');

/** Search supplier name, line names and note (accent-insensitive); voided only when asked. */
export function filterPurchases(purchases: Purchase[], query: string, showVoided: boolean): Purchase[] {
  const words = normalizeName(query).split(' ').filter(Boolean);
  return purchases.filter((p) => {
    if (p.voided && !showVoided) return false;
    const hay = normalizeName([p.supplierName, ...p.lines.map((l) => l.className), p.note].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

export interface PurchaseDay {
  date: IsoDate;
  label: string;
  purchases: Purchase[];
}

/** Purchases grouped by day, newest day and newest purchase first. */
export function groupPurchasesByDay(purchases: Purchase[], today: IsoDate): PurchaseDay[] {
  const days: PurchaseDay[] = [];
  const sorted = [...purchases].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  for (const p of sorted) {
    let d = days[days.length - 1];
    if (d?.date !== p.date) days.push((d = { date: p.date, label: dayLabel(p.date, today), purchases: [] }));
    d.purchases.push(p);
  }
  return days;
}

/** The 5 most recently used non-archived suppliers. */
export function recentSuppliers(suppliers: Supplier[], purchases: Purchase[], n = 5): Supplier[] {
  const last = new Map<Id, string>();
  for (const p of purchases) {
    const key = `${p.date}|${p.createdAt}`;
    if (p.supplierId && !p.voided && (last.get(p.supplierId) ?? '') < key) last.set(p.supplierId, key);
  }
  return suppliers
    .filter((s) => !s.archived && last.has(s.id))
    .sort((a, b) => last.get(b.id)!.localeCompare(last.get(a.id)!))
    .slice(0, n);
}

/** Live supplier matches: non-archived, accent-insensitive, name prefix first. */
export function matchSuppliers(suppliers: Supplier[], query: string, limit = 8): Supplier[] {
  const q = normalizeName(query);
  if (!q) return [];
  return suppliers
    .filter((s) => !s.archived)
    .map((s) => ({ s, k: normalizeName(s.name) }))
    .filter((x) => x.k.includes(q))
    .sort((a, b) => Number(b.k.startsWith(q)) - Number(a.k.startsWith(q)) || a.s.name.localeCompare(b.s.name))
    .slice(0, limit)
    .map((x) => x.s);
}

/** Search by name or phone; archived only when asked. */
export function filterSuppliers(suppliers: Supplier[], query: string, showArchived: boolean): Supplier[] {
  const q = normalizeName(query);
  return suppliers
    .filter((s) => (showArchived || !s.archived) && (!q || [s.name, s.phone].some((t) => normalizeName(t).includes(q))))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface SupplierRow {
  supplier: Supplier;
  last: IsoDate | null;
  spentYear: Cents;
}

export function supplierRows(suppliers: Supplier[], purchases: Purchase[], today: IsoDate): SupplierRow[] {
  const last = new Map<Id, IsoDate>();
  for (const p of purchases) if (p.supplierId && !p.voided && p.date > (last.get(p.supplierId) ?? '')) last.set(p.supplierId, p.date);
  return suppliers.map((supplier) => ({
    supplier,
    last: last.get(supplier.id) ?? null,
    spentYear: spentIn(purchases, today.slice(0, 4), supplier.id),
  }));
}

/** Classes that can be bought: non-archived, stock-tracked or expense items. */
export const pickableClasses = (classes: ProductClass[]): ProductClass[] =>
  classes.filter((c) => !c.archived && (c.trackStock || isExpenseItem(c)));

/** A purchase line from the form inputs; expense items ignore the amount text (always 1 unit). */
export function buildPurchaseLine(cls: ProductClass, amountText: string, totalText: string, lineId: Id): { line: PurchaseLine; errors: string[] } {
  const name = fullName(cls);
  const expense = isExpenseItem(cls);
  const amount: Scaled | null = expense ? 10 ** cls.unit.decimals : parseAmount(amountText, cls.unit.decimals);
  const total = parseMoney(totalText);
  const errors: string[] = [];
  if (amount === null) errors.push(`Enter an amount for ${name}`);
  if (total === null) errors.push(`Enter the total paid for ${name}`);
  return {
    line: { lineId, classId: cls.id, className: name, unitName: cls.unit.name, decimals: cls.unit.decimals, amount: amount ?? 0, lineTotal: total ?? 0 },
    errors,
  };
}

/** "Lid: 921 → 1,821 pcs". */
export const stockHint = (stock: Scaled, amount: Scaled, decimals: ProductClass['unit']['decimals'], unit: string, name: string): string =>
  `${name}: ${formatAmount(stock, decimals)} → ${formatAmount(stock + amount, decimals, unit)}`;
