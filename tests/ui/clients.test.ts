import { describe, expect, it } from 'vitest';
import {
  clientRows,
  filterClients,
  mergePreview,
  mergeText,
  parseTags,
  receiveDefaults,
  shortDate,
  sortRows,
} from '../../src/ui/screens/clients/logic.ts';
import type { Client, Order, Payment } from '../../src/core/types.ts';

const cl = (id: string, name: string, extra: Partial<Client> = {}): Client =>
  ({ id, name, phone: '', notes: '', tags: [], archived: false, ...extra }) as Client;
const ord = (id: string, clientId: string, date: string, voided = false): Order =>
  ({ id, clientId, date, voided, lines: [], total: 100 }) as unknown as Order;
const pay = (id: string, clientId: string, voided = false): Payment => ({ id, clientId, voided }) as Payment;

describe('filterClients', () => {
  const list = [cl('1', 'José', { phone: '600 111', tags: ['Bar'] }), cl('2', 'Marta'), cl('3', 'Old', { archived: true })];
  it('matches name ignoring accents and case', () => expect(filterClients(list, 'jose', true).map((c) => c.id)).toEqual(['1']));
  it('matches phone and tags', () => {
    expect(filterClients(list, '600', true).map((c) => c.id)).toEqual(['1']);
    expect(filterClients(list, 'bar', true).map((c) => c.id)).toEqual(['1']);
  });
  it('hides archived unless asked', () => {
    expect(filterClients(list, '', false).map((c) => c.id)).toEqual(['1', '2']);
    expect(filterClients(list, '', true)).toHaveLength(3);
  });
});

describe('sortRows', () => {
  const clients = [cl('a', 'Ana'), cl('b', 'Zoe'), cl('c', 'Bea')];
  const orders = [ord('o1', 'a', '2026-01-01'), ord('o2', 'b', '2026-03-01'), ord('o3', 'b', '2026-04-01', true)];
  const balances = new Map([
    ['a', { clientId: 'a', owed: 500, credit: 0, orders: new Map() }],
    ['b', { clientId: 'b', owed: 900, credit: 0, orders: new Map() }],
  ]);
  const rows = clientRows(clients, orders, balances);
  it('ignores voided orders for last order', () => expect(rows.find((r) => r.client.id === 'b')!.lastOrder).toBe('2026-03-01'));
  it('owed: biggest first, then name', () => expect(sortRows(rows, 'owed').map((r) => r.client.id)).toEqual(['b', 'a', 'c']));
  it('name', () => expect(sortRows(rows, 'name').map((r) => r.client.id)).toEqual(['a', 'c', 'b']));
  it('last order: newest first, no orders last', () => expect(sortRows(rows, 'last').map((r) => r.client.id)).toEqual(['b', 'a', 'c']));
});

describe('merge', () => {
  const orders = [ord('1', 'd', '2026-01-01'), ord('2', 'd', '2026-01-02'), ord('3', 'd', '2026-01-03'), ord('4', 'k', '2026-01-03'), ord('5', 'd', '2026-01-03', true)];
  const payments = [pay('1', 'd'), pay('2', 'd'), pay('3', 'k'), pay('4', 'd', true)];
  it('counts live records', () => expect(mergePreview(orders, payments, 'd')).toEqual({ orders: 3, payments: 2 }));
  it('text', () => {
    expect(mergeText({ orders: 3, payments: 2 })).toBe('3 orders, 2 payments will move');
    expect(mergeText({ orders: 1, payments: 1 })).toBe('1 order, 1 payment will move');
  });
});

describe('receiveDefaults', () => {
  it('defaults to owed, last method, today', () =>
    expect(receiveDefaults(1450, 'bizum', '2026-11-24')).toEqual({ amount: 1450, method: 'bizum', date: '2026-11-24' }));
  it('falls back to cash', () => expect(receiveDefaults(0, undefined, '2026-11-24').method).toBe('cash'));
});

describe('helpers', () => {
  it('parseTags', () => expect(parseTags(' Bar, , vip ,Bar')).toEqual(['Bar', 'vip']));
  it('shortDate', () => expect(shortDate('2026-11-22')).toBe('22 Nov'));
});
