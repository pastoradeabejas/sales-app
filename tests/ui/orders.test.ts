import { describe, expect, it } from 'vitest';
import type { Client, Order, OrderLine, Payment, ProductClass, Variant } from '../../src/core/types.ts';
import {
  creditMoved,
  dayLabel,
  defaultNote,
  draftFromOrder,
  draftLines,
  filterOrders,
  formatDay,
  groupByDay,
  matchClients,
  newestMonths,
  addedGroups,
  pickerGroups,
  productGroups,
  recentClients,
  shortDay,
  skippedNote,
  stockDelta,
  stockWarningText,
  variantIndex,
} from '../../src/ui/screens/orders/logic.ts';

const stamp = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', updatedBy: 'x' };

const variant = (id: string, label: string, over: Partial<Variant> = {}): Variant => ({
  ...stamp,
  id,
  label,
  kind: 'fixed',
  baseAmount: 500,
  price: 1400,
  cost: null,
  sortOrder: 1,
  archived: false,
  ...over,
});

const cheese: ProductClass = {
  ...stamp,
  id: 'cheese',
  schema: 1,
  name: 'Parmigiano Reggiano',
  unit: { name: 'kg', decimals: 3 },
  lowStockThreshold: null,
  trackStock: true,
  sellable: true,
  customFields: [],
  customValues: {},
  notes: '',
  archived: false,
  variants: [
    variant('p500', '500 g', { sortOrder: 1 }),
    variant('p1k', '1 kg', { baseAmount: 1000, price: 2600, sortOrder: 2, archived: true }),
    variant('pcut', 'Cut to order', { kind: 'variable', baseAmount: null, price: 2600, cost: null, sortOrder: 3 }),
  ],
};
const cpu: ProductClass = {
  ...cheese,
  id: 'cpu',
  name: 'Ryzen 5',
  unit: { name: 'pcs', decimals: 0 },
  trackStock: false,
  variants: [variant('r5600', '5600', { baseAmount: 1, price: 12000, cost: 9000 })],
};
const milk: ProductClass = { ...cheese, id: 'milk', name: 'Milk', sellable: false, variants: [] };
const old: ProductClass = { ...cheese, id: 'old', name: 'Old', archived: true, variants: [variant('o1', 'Box')] };
const classes = [cheese, cpu, milk, old];
const byId = new Map(classes.map((c) => [c.id, c]));

const line = (variantId: string, over: Partial<OrderLine> = {}): OrderLine => ({
  lineId: `L-${variantId}`,
  classId: 'cheese',
  variantId,
  className: 'Parmigiano Reggiano',
  variantLabel: '500 g',
  kind: 'fixed',
  unitName: 'kg',
  decimals: 3,
  quantity: 2,
  amount: 1000,
  unitPrice: 1400,
  unitCost: null,
  lineTotal: 2800,
  ...over,
});

const order = (id: string, over: Partial<Order> = {}): Order => ({
  ...stamp,
  id,
  schema: 1,
  date: '2026-11-22',
  clientId: 'marta',
  clientName: 'Marta',
  lines: [line('p500')],
  total: 2800,
  note: '',
  voided: false,
  voidReason: null,
  ...over,
});

const client = (id: string, name: string, archived = false): Client => ({
  ...stamp,
  id,
  schema: 1,
  name,
  phone: '',
  notes: '',
  tags: [],
  archived,
});

const payment = (id: string, amount: number, orderId: string | null, over: Partial<Payment> = {}): Payment => ({
  ...stamp,
  id,
  schema: 1,
  date: '2026-11-22',
  clientId: 'marta',
  orderId,
  amount,
  method: 'cash',
  note: '',
  voided: false,
  ...over,
});

describe('day labels', () => {
  it('names today and yesterday, else "22 Nov 2026"', () => {
    expect(dayLabel('2026-11-24', '2026-11-24')).toBe('Today');
    expect(dayLabel('2026-11-23', '2026-11-24')).toBe('Yesterday');
    expect(dayLabel('2026-11-22', '2026-11-24')).toBe('22 Nov 2026');
    expect(dayLabel('2026-02-28', '2026-03-01')).toBe('Yesterday');
    expect(dayLabel('2025-12-31', '2026-01-01')).toBe('Yesterday');
  });
  it('formats a day with an optional weekday', () => {
    expect(formatDay('2026-11-22')).toBe('22 Nov 2026');
    expect(formatDay('2026-11-22', true)).toBe('Sun 22 Nov 2026');
  });
  it('short day drops the year of the current year', () => {
    expect(shortDay('2026-11-24', '2026-11-24')).toBe('Today');
    expect(shortDay('2026-08-01', '2026-11-24')).toBe('1 Aug');
    expect(shortDay('2025-08-01', '2026-11-24')).toBe('1 Aug 2025');
  });
});

describe('groupByDay', () => {
  it('groups newest day first, newest order first, sum without voided', () => {
    const orders = [
      order('a', { date: '2026-11-23', total: 18500 }),
      order('b', { date: '2026-11-24', total: 3400, createdAt: '2026-11-24T08:00:00Z' }),
      order('c', { date: '2026-11-24', total: 12000, createdAt: '2026-11-24T10:00:00Z' }),
      order('d', { date: '2026-11-23', total: 2600, voided: true }),
      order('e', { date: '2026-11-18', total: 9100 }),
    ];
    const groups = groupByDay(orders, '2026-11-24');
    expect(groups.map((g) => [g.label, g.sum, g.orders.map((o) => o.id)])).toEqual([
      ['Today', 15400, ['c', 'b']],
      ['Yesterday', 18500, ['a', 'd']],
      ['18 Nov 2026', 9100, ['e']],
    ]);
  });
});

describe('filterOrders', () => {
  const orders = [
    order('a', { clientName: 'Marta' }),
    order('b', { clientName: 'Lucía', lines: [line('r5600', { classId: 'cpu', className: 'Ryzen 5', variantLabel: '5600' })] }),
    order('c', { clientName: 'Ana', note: 'Pick up Friday' }),
    order('d', { clientName: 'Sergio', voided: true }),
  ];
  const status: Record<string, 'unpaid' | 'partial' | 'paid' | 'voided'> = { a: 'unpaid', b: 'paid', c: 'partial', d: 'voided' };
  const opts = { statusOf: (o: Order) => status[o.id], nameOf: (o: Order) => o.clientName };
  const ids = (q: string, s: Parameters<typeof filterOrders>[1]['status']) =>
    filterOrders(orders, { ...opts, query: q, status: s }).map((o) => o.id);

  it('All excludes voided; each chip filters by status', () => {
    expect(ids('', 'all')).toEqual(['a', 'b', 'c']);
    expect(ids('', 'voided')).toEqual(['d']);
    expect(ids('', 'paid')).toEqual(['b']);
    expect(ids('', 'partial')).toEqual(['c']);
    expect(ids('', 'unpaid')).toEqual(['a']);
  });
  it('searches client name (accent-insensitive), product and note', () => {
    expect(ids('lucia', 'all')).toEqual(['b']);
    expect(ids('ryzen 5600', 'all')).toEqual(['b']);
    expect(ids('parmigiano', 'all')).toEqual(['a', 'c']);
    expect(ids('friday', 'all')).toEqual(['c']);
    expect(ids('sergio', 'all')).toEqual([]);
  });
  it('uses the current client name', () => {
    expect(filterOrders(orders, { ...opts, nameOf: (o) => (o.id === 'a' ? 'Marta Ruiz' : o.clientName), query: 'ruiz', status: 'all' }).map((o) => o.id)).toEqual(['a']);
  });
});

describe('newestMonths', () => {
  it('keeps the newest n months and tells if there are more', () => {
    const orders = [order('a', { date: '2026-11-02' }), order('b', { date: '2026-10-30' }), order('c', { date: '2026-08-01' })];
    expect(newestMonths(orders, 1)).toEqual({ shown: [orders[0]], more: true });
    expect(newestMonths(orders, 2).shown.map((o) => o.id)).toEqual(['a', 'b']);
    expect(newestMonths(orders, 3).more).toBe(false);
  });
});

describe('price override', () => {
  it('notes the default price only when it differs', () => {
    expect(defaultNote(1400, cheese.variants[0])).toBe('');
    expect(defaultNote(1200, cheese.variants[0])).toBe('default €14.00');
  });
});

describe('draftFromOrder', () => {
  const past = order('p', {
    lines: [
      line('p500', { quantity: 3, unitPrice: 1200 }),
      line('p1k', { variantLabel: '1 kg', quantity: 1, amount: 1000, unitPrice: 2600 }),
      line('pcut', { kind: 'variable', variantLabel: 'Cut to order', quantity: null, amount: 1370, unitPrice: 2600 }),
      line('o1', { classId: 'old', className: 'Old', variantLabel: 'Box', quantity: 1 }),
    ],
  });
  it('preloads quantities, amounts and prices used, skipping archived variants and classes', () => {
    const { draft, skipped } = draftFromOrder(past, byId, true);
    expect(draft.qty).toEqual({ p500: 3, pcut: 1370 });
    expect(draft.prices).toEqual({ p500: 1200, pcut: 2600 });
    expect(skipped).toEqual(['1 kg', 'Box']);
  });
  it('keeps every line when editing', () => {
    const { draft, skipped } = draftFromOrder(past, byId, false);
    expect(draft.qty).toEqual({ p500: 3, p1k: 1, pcut: 1370, o1: 1 });
    expect(skipped).toEqual([]);
  });
  it('merges repeated variants', () => {
    const { draft } = draftFromOrder(order('x', { lines: [line('p500', { quantity: 1 }), line('p500', { quantity: 2 })] }), byId, true);
    expect(draft.qty).toEqual({ p500: 3 });
  });
  it('writes the skipped note', () => {
    expect(skippedNote([])).toBe('');
    expect(skippedNote(['1 kg'])).toBe('1 line skipped: 1 kg is archived');
    expect(skippedNote(['1 kg', 'Box'])).toBe('2 lines skipped: 1 kg, Box are archived');
  });
});

describe('draftLines', () => {
  const idx = variantIndex(classes);
  let n = 0;
  const nextId = () => `new${++n}`;
  it('builds lines with prices, cost snapshot and drops zeros', () => {
    n = 0;
    const lines = draftLines({ qty: { p500: 2, pcut: 1370, r5600: 0 }, prices: { p500: 1200 } }, idx, (id) => (id === 'cheese' ? 1500 : null), nextId);
    expect(lines.map((l) => [l.lineId, l.variantId, l.quantity, l.amount, l.unitPrice, l.unitCost, l.lineTotal])).toEqual([
      ['new1', 'p500', 2, 1000, 1200, 750, 2400],
      ['new2', 'pcut', null, 1370, 2600, 1500, 3562],
    ]);
  });
  it('keeps lineId and cost snapshot of lines already in the edited order', () => {
    n = 0;
    const prev = order('e', { lines: [line('p500', { lineId: 'keep', unitCost: 700 }), line('gone', { lineId: 'orphan', variantId: 'gone' })] });
    const lines = draftLines({ qty: { p500: 1, gone: 2, r5600: 1 }, prices: {} }, idx, () => null, nextId, prev);
    expect(lines.map((l) => [l.lineId, l.unitCost, l.lineTotal])).toEqual([
      ['keep', 700, 1400],
      ['orphan', null, 2800],
      ['new1', 9000, 12000],
    ]);
  });
});

describe('productGroups', () => {
  it('lists sellable non-archived classes, archived variants hidden, recently sold first (classes then by name)', () => {
    const orders = [
      order('a', { date: '2026-11-01', lines: [line('p500')] }),
      order('b', { date: '2026-11-20', lines: [line('pcut', { kind: 'variable' })] }),
      order('c', { date: '2026-11-23', lines: [line('p500')], voided: true }),
    ];
    const groups = productGroups(classes, orders, new Set());
    expect(groups.map((g) => [g.cls.id, g.variants.map((v) => v.id)])).toEqual([
      ['cheese', ['pcut', 'p500']],
      ['cpu', ['r5600']],
    ]);
  });
  it('includes archived variants and classes already in the order', () => {
    const groups = productGroups(classes, [], new Set(['p1k', 'o1']));
    expect(groups.map((g) => [g.cls.id, g.variants.map((v) => v.id)])).toEqual([
      ['old', ['o1']],
      ['cheese', ['p500', 'p1k', 'pcut']],
      ['cpu', ['r5600']],
    ]);
  });
});

describe('stock delta and warning', () => {
  it('subtracts new amounts and adds back the old order amounts', () => {
    const now = [line('p500', { amount: 1500 }), line('r5600', { classId: 'cpu', amount: 1 })];
    expect(stockDelta(now)).toEqual(new Map([['cheese', -1500], ['cpu', -1]]));
    expect(stockDelta(now, [line('p500', { amount: 1000 })])).toEqual(new Map([['cheese', -500], ['cpu', -1]]));
  });
  it('writes the warning text', () => {
    expect(stockWarningText([{ classId: 'cheese', after: -400 }], byId)).toBe('Parmigiano Reggiano stock would be −0.400 kg. Save anyway?');
  });
});

describe('creditMoved', () => {
  it('is the credit an edit frees when the total drops below what was paid', () => {
    const before = order('o', { total: 5000 });
    const pays = [payment('p', 5000, 'o')];
    expect(creditMoved([before], pays, { ...before, total: 3000 })).toBe(2000);
    expect(creditMoved([before], pays, { ...before, total: 6000 })).toBe(0);
  });
  it('freed money fills other open orders before credit', () => {
    const a = order('a', { total: 5000 });
    const b = order('b', { total: 1500, date: '2026-11-23' });
    expect(creditMoved([a, b], [payment('p', 5000, 'a')], { ...a, total: 3000 })).toBe(500);
  });
});

describe('clients', () => {
  const clients = [client('marta', 'Marta'), client('lucia', 'Lucía'), client('ana', 'Ana'), client('old', 'Olga', true), client('pablo', 'Pablo')];
  it('recent clients by last non-voided order, non-archived, max n', () => {
    const orders = [
      order('1', { clientId: 'ana', date: '2026-11-20' }),
      order('2', { clientId: 'marta', date: '2026-11-22' }),
      order('3', { clientId: 'old', date: '2026-11-23' }),
      order('4', { clientId: 'lucia', date: '2026-11-24', voided: true }),
      order('5', { clientId: 'lucia', date: '2026-11-01' }),
    ];
    expect(recentClients(clients, orders).map((c) => c.id)).toEqual(['marta', 'ana', 'lucia']);
    expect(recentClients(clients, orders, 1).map((c) => c.id)).toEqual(['marta']);
  });
  it('matches names accent-insensitively, prefix first, archived hidden', () => {
    expect(matchClients(clients, 'LUC').map((c) => c.id)).toEqual(['lucia']);
    expect(matchClients(clients, 'a').map((c) => c.id)).toEqual(['ana', 'lucia', 'marta', 'pablo']);
    expect(matchClients(clients, 'olga')).toEqual([]);
    expect(matchClients(clients, ' ')).toEqual([]);
  });
});

describe('order form shows only the added products (D-026)', () => {
  const groups = productGroups(classes, [], new Set());
  it('keeps only added variants, and classes that have one', () => {
    expect(addedGroups(groups, new Set(['pcut'])).map((g) => [g.cls.id, g.variants.map((v) => v.id)])).toEqual([['cheese', ['pcut']]]);
    expect(addedGroups(groups, new Set())).toEqual([]);
  });
  it('picker search matches product or variant names, accent- and case-insensitive', () => {
    expect(pickerGroups(groups, '').map((g) => g.cls.id)).toEqual(['cheese', 'cpu']);
    expect(pickerGroups(groups, 'ryzen').map((g) => g.cls.id)).toEqual(['cpu']);
    const byLabel = pickerGroups(groups, '5600');
    expect(byLabel.map((g) => [g.cls.id, g.variants.map((v) => v.id)])).toEqual([['cpu', ['r5600']]]);
    expect(pickerGroups(groups, 'PARMIGIANO')[0].variants.length).toBe(groups[0].variants.length);
    expect(pickerGroups(groups, 'zzz')).toEqual([]);
  });
});
