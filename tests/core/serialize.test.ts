import { describe, expect, it } from 'vitest';
import { META_JSON, metaContent, parseRecord, serializeRecord } from '../../src/core/serialize.ts';

const keysOf = (text: string) => Object.keys(JSON.parse(text));

describe('serializeRecord', () => {
  it('uses 2-space indent and a trailing newline', () => {
    const s = serializeRecord('client', { id: 'a', schema: 1 });
    expect(s).toBe('{\n  "id": "a",\n  "schema": 1\n}\n');
  });
  it('orders client keys per the spec', () => {
    const s = serializeRecord('client', {
      updatedBy: 'x', updatedAt: 'u', createdAt: 'c', archived: false, tags: [],
      notes: '', phone: '', name: 'M', schema: 1, id: 'a',
    });
    expect(keysOf(s)).toEqual(['id', 'schema', 'name', 'phone', 'notes', 'tags', 'archived', 'createdAt', 'updatedAt', 'updatedBy']);
  });
  it('orders product, variant and unit keys, nested', () => {
    const s = serializeRecord('product', {
      variants: [{ updatedBy: 'x', id: 'v', label: 'l', archived: false, sortOrder: 1, cost: null, price: 1, baseAmount: 1, kind: 'fixed', createdAt: 'c', updatedAt: 'u' }],
      unit: { decimals: 3, name: 'kg' }, name: 'P', id: 'a', schema: 1, updatedAt: 'u',
    });
    const o = JSON.parse(s);
    expect(Object.keys(o)).toEqual(['id', 'schema', 'name', 'unit', 'variants', 'updatedAt']);
    expect(Object.keys(o.unit)).toEqual(['name', 'decimals']);
    expect(Object.keys(o.variants[0])).toEqual(['id', 'label', 'kind', 'baseAmount', 'price', 'cost', 'sortOrder', 'archived', 'createdAt', 'updatedAt', 'updatedBy']);
  });
  it('orders order lines', () => {
    const s = serializeRecord('order', {
      total: 1, lines: [{ lineTotal: 1, unitCost: null, unitPrice: 1, amount: 1, quantity: 1, decimals: 0, unitName: 'p', kind: 'fixed', variantLabel: 'v', className: 'c', variantId: 'v', classId: 'c', lineId: 'l' }],
      date: 'd', id: 'a', schema: 1,
    });
    const o = JSON.parse(s);
    expect(Object.keys(o)).toEqual(['id', 'schema', 'date', 'lines', 'total']);
    expect(Object.keys(o.lines[0])).toEqual(['lineId', 'classId', 'variantId', 'className', 'variantLabel', 'kind', 'unitName', 'decimals', 'quantity', 'amount', 'unitPrice', 'unitCost', 'lineTotal']);
  });
  it('orders stock transform and costs', () => {
    const s = serializeRecord('stock', {
      voided: false, note: '', costs: { allocation: [], total: 1, extras: [{ amount: 1, label: 'e' }], materialsComplete: true, materials: 1, mode: 'total' },
      recipeId: null, outputs: [{ amount: 1, classId: 'c' }], inputs: [], type: 'transform', date: 'd', id: 'a', schema: 1,
    });
    const o = JSON.parse(s);
    expect(Object.keys(o)).toEqual(['id', 'schema', 'date', 'type', 'inputs', 'outputs', 'recipeId', 'costs', 'note', 'voided']);
    expect(Object.keys(o.costs)).toEqual(['mode', 'materials', 'materialsComplete', 'extras', 'total', 'allocation']);
    expect(Object.keys(o.costs.extras[0])).toEqual(['label', 'amount']);
    expect(Object.keys(o.outputs[0])).toEqual(['classId', 'amount']);
  });
  it('puts unknown keys after known ones, alphabetically', () => {
    const s = serializeRecord('client', { zeta: 1, name: 'M', alpha: 2, id: 'a', updatedBy: 'x' });
    expect(keysOf(s)).toEqual(['id', 'name', 'updatedBy', 'alpha', 'zeta']);
  });
  it('is idempotent', () => {
    const x = { updatedBy: 'x', name: 'Lucía', id: 'a', extra: { b: 1, a: [1, { d: 1, c: 2 }] } };
    const once = serializeRecord('client', x);
    expect(serializeRecord('client', parseRecord('client', once) as object)).toBe(once);
  });
});

describe('meta and parse', () => {
  it('builds meta.json', () => {
    expect(JSON.parse(metaContent('2026-11-22T10:00:00Z'))).toEqual({ app: 'sales-bookkeeping', schemaVersion: 2, createdAt: '2026-11-22T10:00:00Z' });
    expect(metaContent('t').endsWith('\n')).toBe(true);
    expect(META_JSON).toBe('meta.json');
  });
  it('parseRecord throws a clear error', () => {
    expect(() => parseRecord('client', '{oops')).toThrow(/client/);
    expect(parseRecord('client', '{"id":"a"}')).toEqual({ id: 'a' });
  });
});

describe('v1.4 records (spec §16)', () => {
  it('orders supplier, level and purchase keys', () => {
    expect(keysOf(serializeRecord('supplier', { updatedBy: 'x', archived: false, notes: '', phone: '', name: 'S', schema: 1, id: 'a' })))
      .toEqual(['id', 'schema', 'name', 'phone', 'notes', 'archived', 'updatedBy']);
    expect(keysOf(serializeRecord('level', { archived: false, hourlyRate: 1200, name: 'Level 1', id: 'a' })))
      .toEqual(['id', 'name', 'hourlyRate', 'archived']);
    const o = JSON.parse(serializeRecord('purchase', {
      voided: false, note: '', method: 'cash', total: 1,
      lines: [{ lineTotal: 1, amount: 1, decimals: 0, unitName: 'pcs', className: 'Lid', classId: 'c', lineId: 'l' }],
      supplierName: 'S', supplierId: null, date: 'd', id: 'a',
    }));
    expect(Object.keys(o)).toEqual(['id', 'date', 'supplierId', 'supplierName', 'lines', 'total', 'method', 'note', 'voided']);
    expect(Object.keys(o.lines[0])).toEqual(['lineId', 'classId', 'className', 'unitName', 'decimals', 'amount', 'lineTotal']);
  });
  it('orders labour in recipes and transform costs', () => {
    const r = JSON.parse(serializeRecord('recipe', { archived: false, labour: [{ minutes: 40, levelId: 'L' }], shares: [], extras: [], name: 'R', id: 'a' }));
    expect(Object.keys(r)).toEqual(['id', 'name', 'extras', 'shares', 'labour', 'archived']);
    expect(Object.keys(r.labour[0])).toEqual(['levelId', 'minutes']);
    const t = JSON.parse(serializeRecord('stock', {
      costs: { allocation: [], total: 1, extras: [], labour: [{ amount: 8000, hourlyRate: 1200, minutes: 400, levelName: 'L1', levelId: 'L' }], materialsComplete: true, materials: 1, mode: 'breakdown' },
      type: 'transform', id: 'a',
    }));
    expect(Object.keys(t.costs)).toEqual(['mode', 'materials', 'materialsComplete', 'labour', 'extras', 'total', 'allocation']);
    expect(Object.keys(t.costs.labour[0])).toEqual(['levelId', 'levelName', 'minutes', 'hourlyRate', 'amount']);
  });
  it('a new data repo starts at the current schema', () => {
    expect(JSON.parse(metaContent('t')).schemaVersion).toBe(2);
  });
});
