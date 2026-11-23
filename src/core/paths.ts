// Record file paths in the data repo (spec §3.8).
import type { RecordType } from './types.ts';

const DIR: Record<RecordType, string> = {
  product: 'products', client: 'clients', order: 'orders',
  payment: 'payments', stock: 'stock', recipe: 'recipes',
};
const DATED: ReadonlySet<RecordType> = new Set(['order', 'payment', 'stock']);

/** Path of a new record. Callers store it and reuse it for edits: a path never changes. */
export function recordPath(type: RecordType, record: { id: string; date?: string }): string {
  if (!DATED.has(type)) return `${DIR[type]}/${record.id}.json`;
  const [year, month] = (record.date ?? '').split('-');
  return `${DIR[type]}/${year}/${month}/${record.id}.json`;
}

/** Type and id of a record path; null for meta.json, README.md and unknown paths. */
export function parsePath(path: string): { type: RecordType; id: string } | null {
  const m = /^([a-z]+)\/(?:\d{4}\/\d{2}\/)?([^/]+)\.json$/.exec(path);
  const type = (Object.keys(DIR) as RecordType[]).find((t) => DIR[t] === m?.[1]);
  if (!m || !type) return null;
  if (DATED.has(type) !== /^[a-z]+\/\d{4}\//.test(path)) return null;
  return { type, id: m[2] };
}
