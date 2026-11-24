import { describe, expect, it } from 'vitest';
import {
  costLabel,
  expenseFigures,
  fieldKey,
  priceLabel,
  moveVariant,
  parseVariantForm,
  sideClasses,
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
  it('is unique within a group only (D-015)', () => {
    const grouped = [
      { id: 'j', name: '500g Jar', group: 'Honey/Rosemary', archived: false },
      { id: 't', name: 'Lid', archived: false },
    ];
    expect(validateClassName('500G jar', grouped, undefined, ' Honey / Rosemary ')).toMatch(/already/);
    expect(validateClassName('500g Jar', grouped, undefined, 'Honey/Thyme')).toBeNull();
    expect(validateClassName('500g Jar', grouped)).toBeNull();
    expect(validateClassName('lid', grouped, undefined, '')).toMatch(/already/);
    expect(validateClassName('lid', grouped, undefined, 'Packaging')).toBeNull();
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

describe('costLabel', () => {
  const v = (kind: 'fixed' | 'variable', cost: number | null, baseAmount: number | null = null) => ({ kind, cost, baseAmount });
  it('shows the class average per unit, or a dash when unknown', () => {
    expect(costLabel(null, 15, 0, 'pcs')).toBe('€0.15/pcs');
    expect(costLabel(null, null, 0, 'pcs')).toBe('—');
  });
  it('prefers the variant cost', () => {
    expect(costLabel(v('fixed', 390), 1000, 0, 'jar')).toBe('€3.90');
    expect(costLabel(v('variable', 950), 1000, 2, 'kg')).toBe('€9.50/kg');
  });
  it('falls back to the class average for the variant', () => {
    expect(costLabel(v('fixed', null, 75), 1200, 2, 'kg')).toBe('€9.00');
    expect(costLabel(v('variable', null), 1200, 2, 'kg')).toBe('€12.00/kg');
    expect(costLabel(v('fixed', null, 1), null, 0, 'jar')).toBe('—');
  });
});

describe('sideClasses (D-025)', () => {
  const c = (id: string, sellable: boolean, trackStock = true) => ({ id, sellable, trackStock });
  const all = [c('jar', true), c('bulk', false), c('lid', false), c('fuel', false, false), c('service', true, false)];
  it('Products: what is sold; Stock: inventory not sold (bulk, packaging); Expenses: expense items (D-028)', () => {
    expect(sideClasses(all, 'products').map((x) => x.id)).toEqual(['jar', 'service']);
    expect(sideClasses(all, 'stock').map((x) => x.id)).toEqual(['bulk', 'lid']);
    expect(sideClasses(all, 'expenses').map((x) => x.id)).toEqual(['fuel']);
  });
});

describe('expenseFigures (Expenses list, D-029)', () => {
  const l = (classId: string, lineTotal: number) => ({ classId, lineTotal });
  const p = (date: string, lines: ReturnType<typeof l>[], voided = false) => ({ date, createdAt: `${date}T10:00:00Z`, voided, lines });
  const purchases = [
    p('2025-12-30', [l('fuel', 3000)]),
    p('2026-10-14', [l('fuel', 4000), l('fuel', 500)]),
    p('2026-11-02', [l('fuel', 4100), l('phone', 2900)]),
    p('2026-11-20', [l('fuel', 9999)], true),
  ];
  it('last paid (newest purchase, its lines summed), this month and this year; voided ignored', () => {
    expect(expenseFigures(purchases, 'fuel', '2026-11-24')).toEqual({ last: 4100, lastDate: '2026-11-02', month: 4100, year: 8600 });
    expect(expenseFigures(purchases, 'vet', '2026-11-24')).toEqual({ last: null, lastDate: null, month: 0, year: 0 });
  });
});
