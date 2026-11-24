import { describe, expect, it } from 'vitest';
import { SIDES, parseQuery, parseRoute, parseSides, tabHref, tabOf } from '../../src/ui/router.ts';

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
    ['#/recipes', 'recipes', {}],
    ['#/settings', 'settings', {}],
    ['#/purchases', 'purchases', {}],
    ['#/purchases/new', 'purchase-new', {}],
    ['#/purchases/p1', 'purchase', { id: 'p1' }],
    ['#/purchases/p1/edit', 'purchase-edit', { id: 'p1' }],
    ['#/suppliers', 'suppliers', {}],
    ['#/suppliers/s1', 'supplier', { id: 's1' }],
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
    ['clients', 'orders'],
    ['client', 'orders'],
    ['stock', 'stock'],
    ['stock-add', 'stock'],
    ['stock-remove', 'stock'],
    ['stock-transform', 'stock'],
    ['stock-class', 'stock'],
    ['products', 'stock'],
    ['product', 'stock'],
    ['recipes', 'stock'],
    ['purchases', 'expenses'],
    ['purchase-new', 'expenses'],
    ['purchase', 'expenses'],
    ['purchase-edit', 'expenses'],
    ['suppliers', 'expenses'],
    ['supplier', 'expenses'],
  ] as const)('%s is in the %s tab', (name, tab) => {
    expect(tabOf(name)).toBe(tab);
  });
});

describe('tab sides', () => {
  it('lists the two sides of each tab', () => {
    expect(SIDES).toEqual({ orders: ['orders', 'clients'], expenses: ['purchases', 'suppliers'], stock: ['stock', 'recipes'] });
  });

  it('builds the tab href from the remembered side', () => {
    expect(tabHref('overview', {})).toBe('#/overview');
    expect(tabHref('orders', {})).toBe('#/orders');
    expect(tabHref('orders', { orders: 'clients' })).toBe('#/clients');
    expect(tabHref('expenses', { expenses: 'suppliers' })).toBe('#/suppliers');
    expect(tabHref('stock', { stock: 'clients' })).toBe('#/stock');
  });

  it('parses the stored sides and ignores bad input', () => {
    expect(parseSides('{"orders":"clients","stock":"recipes"}')).toEqual({ orders: 'clients', stock: 'recipes' });
    expect(parseSides('{"stock":"products"}')).toEqual({});
    expect(parseSides('{"orders":"products","x":"y"}')).toEqual({});
    expect(parseSides('nope')).toEqual({});
    expect(parseSides(null)).toEqual({});
    expect(parseSides('[1]')).toEqual({});
  });
});

describe('parseQuery', () => {
  it('reads the query part of a hash', () => {
    expect(parseQuery('#/stock/transform?input=milk1&recipe=r%201')).toEqual({ input: 'milk1', recipe: 'r 1' });
  });

  it('is empty without a query', () => {
    expect(parseQuery('#/orders')).toEqual({});
    expect(parseQuery('')).toEqual({});
  });
});
