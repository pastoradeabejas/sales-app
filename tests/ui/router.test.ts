import { describe, expect, it } from 'vitest';
import { parseRoute, tabOf } from '../../src/ui/router.ts';

describe('parseRoute', () => {
  it.each([
    ['#/overview', 'overview', {}],
    ['#/orders', 'orders', {}],
    ['#/orders/new', 'order-new', {}],
    ['#/orders/01JD3K9X2M7QW8F4', 'order', { id: '01JD3K9X2M7QW8F4' }],
    ['#/orders/01JD3K9X2M7QW8F4/edit', 'order-edit', { id: '01JD3K9X2M7QW8F4' }],
    ['#/clients', 'clients', {}],
    ['#/clients/abc', 'client', { id: 'abc' }],
    ['#/stock', 'stock', {}],
    ['#/stock/add', 'stock-add', {}],
    ['#/stock/remove', 'stock-remove', {}],
    ['#/stock/transform', 'stock-transform', {}],
    ['#/stock/milk1', 'stock-class', { classId: 'milk1' }],
    ['#/products', 'products', {}],
    ['#/products/cls1', 'product', { classId: 'cls1' }],
    ['#/settings', 'settings', {}],
  ])('%s -> %s', (hash, name, params) => {
    expect(parseRoute(hash)).toEqual({ name, params });
  });

  it('ignores a query string and a trailing slash', () => {
    expect(parseRoute('#/orders/abc?from=list')).toEqual({ name: 'order', params: { id: 'abc' } });
    expect(parseRoute('#/clients/')).toEqual({ name: 'clients', params: {} });
  });

  it('decodes params', () => {
    expect(parseRoute('#/clients/a%20b')).toEqual({ name: 'client', params: { id: 'a b' } });
  });

  it('sends empty and unknown hashes to overview', () => {
    for (const hash of ['', '#', '#/', '#/nope', '#/orders/a/b/c', 'orders', '#/clients/%E0%A4%A'])
      expect(parseRoute(hash)).toEqual({ name: 'overview', params: {} });
  });
});

describe('tabOf', () => {
  it.each([
    ['overview', 'overview'],
    ['settings', 'overview'],
    ['orders', 'orders'],
    ['order-new', 'orders'],
    ['order', 'orders'],
    ['order-edit', 'orders'],
    ['clients', 'clients'],
    ['client', 'clients'],
    ['stock', 'stock'],
    ['stock-add', 'stock'],
    ['stock-remove', 'stock'],
    ['stock-transform', 'stock'],
    ['stock-class', 'stock'],
    ['products', 'products'],
    ['product', 'products'],
  ] as const)('%s is in the %s tab', (name, tab) => {
    expect(tabOf(name)).toBe(tab);
  });
});
