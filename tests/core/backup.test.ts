import { describe, it, expect } from 'vitest';
import { makeBackup, parseBackup, restorePlan, restoreCounts } from '../../src/core/backup.ts';
import { SCHEMA_VERSION } from '../../src/core/types.ts';

const s = { schema: 1, createdAt: '2026-11-20T10:00:00Z', updatedAt: '2026-11-20T10:00:00Z', updatedBy: 'A' };
const records = {
  products: [{ ...s, id: 'c1', name: 'Milk' }],
  clients: [{ ...s, id: 'k1', name: 'Lucía' }, { ...s, id: 'k2', name: 'Ana' }],
  orders: [{ ...s, id: 'o1' }],
  payments: [{ ...s, id: 'p1' }],
  stock: [{ ...s, id: 'e1' }],
  recipes: [{ ...s, id: 'r1' }],
  suppliers: [{ ...s, id: 's1' }],
  purchases: [{ ...s, id: 'u1' }],
  levels: [{ ...s, id: 'l1' }],
} as any;
const text = () => makeBackup(records, '2026-11-24T08:00:00Z');
const ok = (t: string) => {
  const r = parseBackup(t);
  if (!r.ok) throw new Error(r.error);
  return r.backup;
};

describe('backup', () => {
  it('round trip: make -> parse -> plan restores everything into an empty device', () => {
    const b = ok(text());
    expect(b).toMatchObject({ app: 'sales-bookkeeping', schemaVersion: SCHEMA_VERSION, exportedAt: '2026-11-24T08:00:00Z' });
    expect(b.records.clients[0].name).toBe('Lucía');
    const plan = restorePlan(b, new Map());
    expect(plan).toHaveLength(10);
    expect(restoreCounts(plan)).toEqual({ product: 1, client: 2, order: 1, payment: 1, stock: 1, recipe: 1, supplier: 1, purchase: 1, level: 1 });
    expect(plan.find((p) => p.record.id === 'c1')!.type).toBe('product');
  });
  it('is pretty-printed JSON', () => expect(text()).toContain('\n  "app"'));
  it('with existing records, keeps only newer ones', () => {
    const plan = restorePlan(ok(text()), new Map([['k1', '2026-11-20T10:00:00Z'], ['k2', '2026-11-19T00:00:00Z'], ['o1', '2026-12-01T00:00:00Z']]));
    expect(plan.map((p) => p.record.id).sort()).toEqual(['c1', 'e1', 'k2', 'l1', 'p1', 'r1', 's1', 'u1']);
  });
  it('rejects malformed JSON, wrong app, newer schema, missing arrays, bad records', () => {
    const base = JSON.parse(text());
    const bad = (o: object) => parseBackup(JSON.stringify({ ...base, ...o }));
    expect(parseBackup('{nope')).toEqual({ ok: false, error: 'Not a valid backup file' });
    expect(parseBackup('[1]')).toEqual({ ok: false, error: 'Not a Sales Book backup' });
    expect(bad({ app: 'other' })).toEqual({ ok: false, error: 'Not a Sales Book backup' });
    expect(bad({ schemaVersion: SCHEMA_VERSION + 1 })).toEqual({ ok: false, error: 'Backup is from a newer app version' });
    expect(bad({ records: { ...base.records, orders: undefined } })).toEqual({ ok: false, error: 'Backup is missing orders' });
    expect(bad({ records: { ...base.records, orders: [{ id: 'x' }] } })).toEqual({ ok: false, error: 'Backup has an invalid orders record' });
    expect(bad({ records: { ...base.records, purchases: [{ id: 'x' }] } })).toEqual({ ok: false, error: 'Backup has an invalid purchases record' });
  });
});

describe('backup from v1.3 (no suppliers, purchases or levels)', () => {
  it('restores with the new lists empty', () => {
    const old = JSON.parse(makeBackup(records, 'now'));
    for (const k of ['suppliers', 'purchases', 'levels']) delete old.records[k];
    old.schemaVersion = 1;
    const r = parseBackup(JSON.stringify(old));
    if (!r.ok) throw new Error(r.error);
    expect(r.backup.records.purchases).toEqual([]);
    expect(restorePlan(r.backup, new Map())).toHaveLength(7);
  });
});
