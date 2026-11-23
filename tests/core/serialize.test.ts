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
    expect(JSON.parse(metaContent('2026-11-22T10:00:00Z'))).toEqual({ app: 'sales-bookkeeping', schemaVersion: 1, createdAt: '2026-11-22T10:00:00Z' });
    expect(metaContent('t').endsWith('\n')).toBe(true);
    expect(META_JSON).toBe('meta.json');
  });
  it('parseRecord throws a clear error', () => {
    expect(() => parseRecord('client', '{oops')).toThrow(/client/);
    expect(parseRecord('client', '{"id":"a"}')).toEqual({ id: 'a' });
  });
});
