import { describe, expect, it } from 'vitest';
import type { Client, Order, ProductClass } from '../../src/core/types.ts';
import { quietRows, quietText } from '../../src/ui/screens/clients/quiet.ts';
import { customFieldLabels, filterByCustomField } from '../../src/ui/screens/products/customFilter.ts';

const cls = (id: string, fields: { key: string; label: string }[], values: Record<string, string | number>): ProductClass =>
  ({ id, name: id, customFields: fields.map((f) => ({ ...f, type: 'text' })), customValues: values }) as unknown as ProductClass;

describe('custom field filter', () => {
  const a = cls('a', [{ key: 'aging', label: 'Aging' }], { aging: 24 });
  const b = cls('b', [{ key: 'origin', label: 'Origin' }, { key: 'aging', label: 'Aging' }], { origin: 'Île de Ré', aging: 6 });
  const c = cls('c', [], {});

  it('unions labels across classes', () => {
    expect(customFieldLabels([a, b, c])).toEqual([
      { key: 'aging', label: 'Aging' },
      { key: 'origin', label: 'Origin' },
    ]);
    expect(customFieldLabels([c])).toEqual([]);
  });

  it('matches numbers as text', () => {
    expect(filterByCustomField([a, b, c], 'aging', '24').map((x) => x.id)).toEqual(['a']);
    expect(filterByCustomField([a, b, c], 'aging', '').map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('is case and accent insensitive', () => {
    expect(filterByCustomField([a, b, c], 'origin', 'ILE de').map((x) => x.id)).toEqual(['b']);
  });

  it('without key returns all', () => {
    expect(filterByCustomField([a, b], '', 'zzz')).toHaveLength(2);
  });
});

describe('gone quiet rows', () => {
  const client = (id: string, archived = false): Client => ({ id, name: id, archived }) as unknown as Client;
  const order = (clientId: string, date: string): Order =>
    ({ id: clientId + date, clientId, date, voided: false, lines: [] }) as unknown as Order;

  it('skips archived clients', () => {
    const orders = ['2026-01-01', '2026-01-02', '2026-01-03'];
    const rows = quietRows(
      [...orders.map((d) => order('x', d)), ...orders.map((d) => order('y', d))],
      [client('x'), client('y', true)],
      '2026-11-24',
    );
    expect(rows.map((r) => r.clientId)).toEqual(['x']);
  });

  it('text', () => {
    expect(quietText(45, 6)).toBe('Last order 45 days ago · 6 orders');
    expect(quietText(1, 1)).toBe('Last order 1 day ago · 1 order');
  });
});
