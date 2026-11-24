// Stable, diff-friendly JSON for record files (spec §3.8).
import { SCHEMA_VERSION, type RecordType } from './types.ts';

const STAMPS = ['createdAt', 'updatedAt', 'updatedBy'];
const BASE = ['id', 'schema'];
const withStamps = (...keys: string[]) => [...BASE, ...keys, ...STAMPS];

// Top-level key order per record type (field order of the §3 examples).
const TOP: Record<RecordType, string[]> = {
  product: withStamps('name', 'group', 'unit', 'lowStockThreshold', 'trackStock', 'sellable', 'customFields', 'customValues', 'notes', 'archived', 'variants'),
  client: withStamps('name', 'phone', 'notes', 'tags', 'archived'),
  order: withStamps('date', 'clientId', 'clientName', 'lines', 'total', 'note', 'voided', 'voidReason'),
  payment: withStamps('date', 'clientId', 'orderId', 'amount', 'method', 'note', 'voided'),
  // add/remove and transform events share one list; absent keys are skipped.
  stock: withStamps('date', 'type', 'classId', 'amount', 'unitCost', 'reason', 'inputs', 'outputs', 'recipeId', 'costs', 'note', 'voided'),
  recipe: withStamps('name', 'inputs', 'outputs', 'extras', 'shares', 'labour', 'archived'),
  supplier: withStamps('name', 'phone', 'notes', 'archived'),
  purchase: withStamps('date', 'supplierId', 'supplierName', 'lines', 'total', 'method', 'note', 'voided'),
  level: withStamps('name', 'hourlyRate', 'archived'),
};

// Key order of nested objects, chosen by the key that holds them.
const NESTED: Record<string, string[]> = {
  unit: ['name', 'decimals'],
  customFields: ['key', 'label', 'type'],
  variants: ['id', 'label', 'kind', 'baseAmount', 'price', 'cost', 'extraCost', 'sortOrder', 'archived', ...STAMPS],
  lines: ['lineId', 'classId', 'variantId', 'className', 'variantLabel', 'kind', 'unitName', 'decimals', 'quantity', 'amount', 'unitPrice', 'unitCost', 'lineTotal'],
  inputs: ['classId', 'amount'],
  outputs: ['classId', 'amount'],
  costs: ['mode', 'materials', 'materialsComplete', 'labour', 'extras', 'total', 'allocation'],
  labour: ['levelId', 'levelName', 'minutes', 'hourlyRate', 'amount'],
  extras: ['label', 'amount'],
  allocation: ['classId', 'share'],
  shares: ['classId', 'share'],
};

/** Copy with object keys in `known` order, then unknown keys alphabetically. */
function ordered(value: unknown, known: string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => ordered(v, known));
  if (value === null || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  const sorted = [...known.filter((k) => k in obj), ...keys.filter((k) => !known.includes(k)).sort()];
  return Object.fromEntries(sorted.map((k) => [k, ordered(obj[k], NESTED[k] ?? [])]));
}

/** Pretty JSON (2 spaces, trailing newline) with stable key order. */
export function serializeRecord(type: RecordType, record: object): string {
  return JSON.stringify(ordered(record, TOP[type]), null, 2) + '\n';
}

/** Parse a record file; throws an Error naming the record type on bad JSON. */
export function parseRecord(type: RecordType, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid ${type} JSON: ${(e as Error).message}`);
  }
}

/** Path of the data repo meta file. */
export const META_JSON = 'meta.json';

/** Content of meta.json for a new data repo (§3.7). */
export function metaContent(createdAt: string): string {
  return JSON.stringify({ app: 'sales-bookkeeping', schemaVersion: SCHEMA_VERSION, createdAt }, null, 2) + '\n';
}
