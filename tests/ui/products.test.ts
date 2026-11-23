import { describe, expect, it } from 'vitest';
import {
  fieldKey,
  priceLabel,
  moveVariant,
  parseVariantForm,
  sortClasses,
  sortedVariants,
  validateClassName,
} from '../../src/ui/screens/products/logic.ts';

const cls = (id: string, name: string, archived = false) => ({ id, name, archived });
const variant = (id: string, label: string, sortOrder: number, archived = false) => ({ id, label, sortOrder, archived });

describe('validateClassName', () => {
  const all = [cls('a', 'Café'), cls('b', 'Old', true)];
  it('requires a name', () => expect(validateClassName('  ', all)).toBe('Name is required'));
  it('limits to 60', () => expect(validateClassName('x'.repeat(61), all)).toMatch(/too long/));
  it('rejects case/accent-insensitive duplicates', () => expect(validateClassName(' CAFE ', all)).toMatch(/already/));
  it('allows own name and archived names', () => {
    expect(validateClassName('café', all, 'a')).toBeNull();
    expect(validateClassName('old', all)).toBeNull();
  });
});

describe('sortClasses', () => {
  it('puts non-archived first, then by name', () => {
    const r = sortClasses([cls('1', 'b', true), cls('2', 'z'), cls('3', 'A')]);
    expect(r.map((c) => c.id)).toEqual(['3', '2', '1']);
  });
});

describe('sortedVariants / moveVariant', () => {
  const vs = [variant('a', 'A', 2), variant('b', 'B', 1), variant('c', 'C', 3)];
  it('sorts by sortOrder', () => expect(sortedVariants(vs).map((v) => v.id)).toEqual(['b', 'a', 'c']));
  it('moves down and renumbers', () => {
    const r = moveVariant(vs, 'b', 1);
    expect(r.map((v) => [v.id, v.sortOrder])).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });
  it('moves up', () => expect(moveVariant(vs, 'c', -1).map((v) => v.id)).toEqual(['b', 'c', 'a']));
  it('ignores moves past the ends', () => {
    expect(moveVariant(vs, 'b', -1).map((v) => v.id)).toEqual(['b', 'a', 'c']);
    expect(moveVariant(vs, 'c', 1).map((v) => v.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('parseVariantForm', () => {
  const sib = [variant('x', 'Big', 1), variant('y', 'Gone', 2, true)];
  const ok = { label: '500 g', kind: 'fixed' as const, amountText: '0,5', priceText: '14', costText: '' };
  it('parses a fixed variant', () => {
    const r = parseVariantForm(ok, 3, sib);
    expect(r.errors).toEqual({});
    expect(r.value).toEqual({ label: '500 g', kind: 'fixed', baseAmount: 500, price: 1400, cost: null });
  });
  it('parses a variable variant with cost', () => {
    const r = parseVariantForm({ ...ok, kind: 'variable', amountText: '', costText: '7,5' }, 3, sib);
    expect(r.value).toEqual({ label: '500 g', kind: 'variable', baseAmount: null, price: 1400, cost: 750 });
  });
  it('allows price 0', () => expect(parseVariantForm({ ...ok, priceText: '0' }, 3, sib).value?.price).toBe(0));
  it('flags empty label, bad amount, bad price, bad cost', () => {
    const r = parseVariantForm({ label: ' ', kind: 'fixed', amountText: '0', priceText: 'x', costText: 'y' }, 2, sib);
    expect(Object.keys(r.errors).sort()).toEqual(['amount', 'cost', 'label', 'price']);
    expect(r.value).toBeNull();
  });
  it('ignores amount for variable', () => {
    expect(parseVariantForm({ ...ok, kind: 'variable', amountText: 'junk' }, 3, sib).errors.amount).toBeUndefined();
  });
  it('requires a unique label among non-archived, except self', () => {
    expect(parseVariantForm({ ...ok, label: ' big ' }, 3, sib).errors.label).toMatch(/already/);
    expect(parseVariantForm({ ...ok, label: 'big' }, 3, sib, 'x').errors.label).toBeUndefined();
    expect(parseVariantForm({ ...ok, label: 'gone' }, 3, sib).errors.label).toBeUndefined();
  });
});

describe('fieldKey', () => {
  it('slugs the label and avoids existing keys', () => {
    expect(fieldKey('Aging (months)', [])).toBe('aging_months');
    expect(fieldKey('Aging', ['aging'])).toBe('aging_2');
    expect(fieldKey('???', [])).toBe('field');
  });
});

describe('priceLabel', () => {
  it('shows per-item or per-unit prices', () => {
    expect(priceLabel({ kind: 'fixed', price: 1400 }, 'kg')).toBe('€14.00');
    expect(priceLabel({ kind: 'variable', price: 2600 }, 'kg')).toBe('€26.00/kg');
  });
});
