// JSON backup export / import (spec §8.1): file format, validation and restore plan.
import { SCHEMA_VERSION } from './types.ts';
import type { Client, Order, Payment, ProductClass, Purchase, Recipe, RecordType, StockEvent, Supplier, WorkLevel } from './types.ts';

export interface Backup {
  app: 'sales-bookkeeping';
  schemaVersion: number;
  exportedAt: string;
  records: {
    products: ProductClass[];
    clients: Client[];
    orders: Order[];
    payments: Payment[];
    stock: StockEvent[];
    recipes: Recipe[];
    suppliers: Supplier[];
    purchases: Purchase[];
    levels: WorkLevel[];
  };
}

type Records = Backup['records'];
type AnyRecord = Records[keyof Records][number];

// Backup key -> record type, in restore order.
const TYPES: [keyof Records, RecordType][] = [
  ['products', 'product'], ['clients', 'client'], ['orders', 'order'], ['payments', 'payment'], ['stock', 'stock'], ['recipes', 'recipe'],
  ['suppliers', 'supplier'], ['purchases', 'purchase'], ['levels', 'level'],
];
// Lists added in v1.4: a backup without them restores them as empty.
const OPTIONAL = new Set<keyof Records>(['suppliers', 'purchases', 'levels']);

/** Pretty JSON of every record, stamped with the export time. */
export function makeBackup(records: Records, now: string): string {
  const backup: Backup = { app: 'sales-bookkeeping', schemaVersion: SCHEMA_VERSION, exportedAt: now, records };
  return JSON.stringify(backup, null, 2);
}

const fail = (error: string) => ({ ok: false as const, error });

/** Parse and validate a backup file; returns a clear error message when it cannot be restored. */
export function parseBackup(text: string): { ok: true; backup: Backup } | { ok: false; error: string } {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return fail('Not a valid backup file');
  }
  if (data?.app !== 'sales-bookkeeping' || typeof data.schemaVersion !== 'number') return fail('Not a Sales Book backup');
  if (data.schemaVersion > SCHEMA_VERSION) return fail('Backup is from a newer app version');
  for (const [key] of TYPES) {
    if (OPTIONAL.has(key) && data.records && data.records[key] === undefined) data.records[key] = [];
    const list = data.records?.[key];
    if (!Array.isArray(list)) return fail(`Backup is missing ${key}`);
    if (list.some((r) => !r || typeof r.id !== 'string' || typeof r.createdAt !== 'string' || typeof r.updatedAt !== 'string')) {
      return fail(`Backup has an invalid ${key} record`);
    }
  }
  return { ok: true, backup: data as Backup };
}

/**
 * Records to write on restore. `existing` maps id -> updatedAt of records already on the device
 * (empty on a fresh device, so everything is restored); a record is kept only if it is new or newer.
 */
export function restorePlan(backup: Backup, existing: Map<string, string>): { type: RecordType; record: AnyRecord }[] {
  return TYPES.flatMap(([key, type]) =>
    (backup.records[key] as AnyRecord[])
      .filter((r) => !existing.has(r.id) || r.updatedAt > existing.get(r.id)!)
      .map((record) => ({ type, record })),
  );
}

/** Records per type in a plan, for "Restore 40 orders, 12 clients…". */
export function restoreCounts(plan: { type: RecordType }[]): Record<RecordType, number> {
  const counts: Record<RecordType, number> = { product: 0, client: 0, order: 0, payment: 0, stock: 0, recipe: 0, supplier: 0, purchase: 0, level: 0 };
  for (const p of plan) counts[p.type]++;
  return counts;
}
