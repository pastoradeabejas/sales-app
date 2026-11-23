import { describe, expect, it } from 'vitest';
import type { Order, Payment } from '../../src/core/types.ts';
import {
  allocateAll,
  allocateClient,
  avgDaysToPay,
  daysBetween,
  debtAge,
  newOrderPayment,
  oldestUnpaidDays,
  orderState,
  paidFromCredit,
  previewNewOrder,
  previewReceive,
} from '../../src/core/payments.ts';

const stamp = (t = '2026-01-01T00:00:00Z') => ({ createdAt: t, updatedAt: t, updatedBy: 'test' });

function order(id: string, date: string, total: number, extra: Partial<Order> = {}): Order {
  return {
    id, schema: 1, date, clientId: 'c1', clientName: 'Marta', lines: [], total,
    note: '', voided: false, voidReason: null, ...stamp(), ...extra,
  };
}

function pay(id: string, date: string, amount: number, orderId: string | null = null, extra: Partial<Payment> = {}): Payment {
  return {
    id, schema: 1, date, clientId: 'c1', orderId, amount, method: 'cash',
    note: '', voided: false, ...stamp(), ...extra,
  };
}

const st = (b: ReturnType<typeof allocateClient>, id: string) => b.orders.get(id)!;

describe('daysBetween', () => {
  it('counts calendar days b − a in UTC', () => {
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0);
    expect(daysBetween('2026-01-01', '2026-01-08')).toBe(7);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // across DST
    expect(daysBetween('2026-01-08', '2026-01-01')).toBe(-7);
  });
});

describe('allocateClient: owed and status', () => {
  it('goes unpaid → partial → paid', () => {
    const o = [order('o1', '2026-01-01', 3000)];
    let b = allocateClient('c1', o, []);
    expect(st(b, 'o1')).toMatchObject({ paid: 0, owed: 3000, status: 'unpaid', paidFraction: 0, paidDate: null });
    expect(b.owed).toBe(3000);

    b = allocateClient('c1', o, [pay('p1', '2026-01-02', 1000, 'o1')]);
    expect(st(b, 'o1')).toMatchObject({ paid: 1000, owed: 2000, status: 'partial', paidDate: null });
    expect(st(b, 'o1').paidFraction).toBeCloseTo(1 / 3);

    b = allocateClient('c1', o, [pay('p1', '2026-01-02', 1000, 'o1'), pay('p2', '2026-01-05', 2000)]);
    expect(st(b, 'o1')).toMatchObject({ paid: 3000, owed: 0, status: 'paid', paidFraction: 1, paidDate: '2026-01-05' });
    expect(b).toMatchObject({ owed: 0, credit: 0 });
  });

  it('a 0-total order is paid on its own date', () => {
    const b = allocateClient('c1', [order('o1', '2026-01-03', 0)], []);
    expect(st(b, 'o1')).toMatchObject({ status: 'paid', paidFraction: 1, paidDate: '2026-01-03', owed: 0 });
  });

  it('ignores other clients and voided payments', () => {
    const b = allocateClient(
      'c1',
      [order('o1', '2026-01-01', 1000), order('x1', '2026-01-01', 500, { clientId: 'c2' })],
      [pay('p1', '2026-01-02', 400, 'o1', { voided: true }), pay('p2', '2026-01-02', 900, null, { clientId: 'c2' })],
    );
    expect(b.clientId).toBe('c1');
    expect(b.orders.has('x1')).toBe(false);
    expect(st(b, 'o1')).toMatchObject({ paid: 0, status: 'unpaid' });
    expect(b).toMatchObject({ owed: 1000, credit: 0 });
  });
});

describe('allocateClient: voided orders', () => {
  it('excludes them and shows them as voided', () => {
    const b = allocateClient('c1', [order('o1', '2026-01-01', 1000, { voided: true }), order('o2', '2026-01-02', 500)], []);
    expect(st(b, 'o1')).toMatchObject({ status: 'voided', paid: 0, owed: 0, allocations: [] });
    expect(b.owed).toBe(500);
  });

  it('a live payment linked to a voided order flows to other orders, then credit', () => {
    const orders = [order('o1', '2026-01-01', 1000, { voided: true }), order('o2', '2026-01-02', 600)];
    const b = allocateClient('c1', orders, [pay('p1', '2026-01-03', 1000, 'o1')]);
    expect(st(b, 'o1')).toMatchObject({ status: 'voided', paid: 0 });
    expect(st(b, 'o2')).toMatchObject({ status: 'paid', paid: 600 });
    expect(st(b, 'o2').allocations).toEqual([{ paymentId: 'p1', amount: 600, date: '2026-01-03', linked: false }]);
    expect(b).toMatchObject({ owed: 0, credit: 400 });
  });

  it('a payment linked to a missing order goes to the pool', () => {
    const b = allocateClient('c1', [order('o1', '2026-01-01', 300)], [pay('p1', '2026-01-03', 500, 'gone')]);
    expect(st(b, 'o1').paid).toBe(300);
    expect(b.credit).toBe(200);
  });
});

describe('allocateClient: linked first, then pool oldest first', () => {
  const orders = [
    order('o3', '2026-01-03', 1000),
    order('o1', '2026-01-01', 1000),
    order('o2', '2026-01-02', 1000),
  ];

  it('applies linked payments to their own order before the pool', () => {
    // linked to o3 (newest), plus an unlinked payment that is dated earlier
    const b = allocateClient('c1', orders, [pay('u1', '2026-01-04', 1500), pay('l3', '2026-01-05', 1000, 'o3')]);
    expect(st(b, 'o3')).toMatchObject({ paid: 1000, status: 'paid' });
    expect(st(b, 'o3').allocations).toEqual([{ paymentId: 'l3', amount: 1000, date: '2026-01-05', linked: true }]);
    expect(st(b, 'o1')).toMatchObject({ paid: 1000, status: 'paid' });
    expect(st(b, 'o2')).toMatchObject({ paid: 500, status: 'partial' });
    expect(b).toMatchObject({ owed: 500, credit: 0 });
  });

  it('exact amount closes all three', () => {
    const b = allocateClient('c1', orders, [pay('u1', '2026-01-04', 3000)]);
    expect([...b.orders.values()].every((s) => s.status === 'paid')).toBe(true);
    expect(b).toMatchObject({ owed: 0, credit: 0 });
  });

  it('partial amount fills oldest first', () => {
    const b = allocateClient('c1', orders, [pay('u1', '2026-01-04', 1200)]);
    expect(st(b, 'o1').status).toBe('paid');
    expect(st(b, 'o2')).toMatchObject({ paid: 200, status: 'partial' });
    expect(st(b, 'o3')).toMatchObject({ paid: 0, status: 'unpaid' });
    expect(b.owed).toBe(1800);
  });

  it('overpayment becomes credit', () => {
    const b = allocateClient('c1', orders, [pay('u1', '2026-01-04', 3500)]);
    expect(b).toMatchObject({ owed: 0, credit: 500 });
  });

  it('linked excess goes to the pool (oldest open order)', () => {
    const b = allocateClient('c1', orders, [pay('l3', '2026-01-04', 1400, 'o3')]);
    expect(st(b, 'o3')).toMatchObject({ paid: 1000, status: 'paid' });
    expect(st(b, 'o1')).toMatchObject({ paid: 400, status: 'partial' });
    expect(st(b, 'o1').allocations).toEqual([{ paymentId: 'l3', amount: 400, date: '2026-01-04', linked: false }]);
  });

  it('sorts same-date orders by createdAt', () => {
    const same = [
      order('b', '2026-01-01', 500, stamp('2026-01-01T10:00:00Z')),
      order('a', '2026-01-01', 500, stamp('2026-01-01T09:00:00Z')),
    ];
    const b = allocateClient('c1', same, [pay('u1', '2026-01-02', 500)]);
    expect(st(b, 'a').status).toBe('paid');
    expect(st(b, 'b').status).toBe('unpaid');
  });
});

describe('allocateClient: credit', () => {
  it('a prepayment pays a later order from credit', () => {
    const p = [pay('u1', '2026-01-01', 2000)];
    expect(allocateClient('c1', [], p)).toMatchObject({ owed: 0, credit: 2000 });
    const b = allocateClient('c1', [order('o1', '2026-01-05', 1500)], p);
    expect(st(b, 'o1')).toMatchObject({ status: 'paid', paidDate: '2026-01-05' });
    expect(paidFromCredit(st(b, 'o1'))).toBe(1500);
    expect(b).toMatchObject({ owed: 0, credit: 500 });
  });

  it('an order edited below its paid amount moves the excess to credit', () => {
    const b = allocateClient('c1', [order('o1', '2026-01-01', 800)], [pay('l1', '2026-01-01', 1000, 'o1')]);
    expect(st(b, 'o1')).toMatchObject({ status: 'paid', paid: 800 });
    expect(paidFromCredit(st(b, 'o1'))).toBe(0);
    expect(b.credit).toBe(200);
  });

  it('… or to other open orders', () => {
    const b = allocateClient(
      'c1',
      [order('o1', '2026-01-01', 800), order('o2', '2026-01-02', 1000)],
      [pay('l1', '2026-01-01', 1000, 'o1')],
    );
    expect(st(b, 'o2')).toMatchObject({ paid: 200, status: 'partial' });
    expect(b).toMatchObject({ owed: 800, credit: 0 });
  });

  it('never has both debt and credit', () => {
    const orders = [order('o1', '2026-01-01', 1000), order('o2', '2026-01-02', 1000), order('o3', '2026-01-03', 700)];
    const cases = [
      [pay('l1', '2026-01-02', 3000, 'o1')],
      [pay('l3', '2026-01-02', 900, 'o3'), pay('u', '2026-01-04', 100)],
      [pay('l2', '2026-01-02', 1500, 'o2'), pay('l3', '2026-01-03', 1500, 'o3')],
    ];
    for (const p of cases) {
      const b = allocateClient('c1', orders, p);
      expect(b.owed === 0 || b.credit === 0).toBe(true);
    }
  });

  it('paidFromCredit sums non-linked allocations', () => {
    const b = allocateClient('c1', [order('o1', '2026-01-05', 1000)], [pay('u', '2026-01-01', 300), pay('l', '2026-01-06', 500, 'o1')]);
    expect(st(b, 'o1').paid).toBe(800);
    expect(paidFromCredit(st(b, 'o1'))).toBe(300);
  });
});

describe('paidDate', () => {
  it('is the date of the payment that completed the order', () => {
    const b = allocateClient(
      'c1',
      [order('o1', '2026-01-01', 1000)],
      [pay('l1', '2026-01-03', 400, 'o1'), pay('u', '2026-01-10', 600)],
    );
    expect(st(b, 'o1').paidDate).toBe('2026-01-10');
  });

  it('is the latest payment date even when a linked payment is applied first', () => {
    const b = allocateClient(
      'c1',
      [order('o1', '2026-01-01', 1000)],
      [pay('u', '2026-01-03', 400), pay('l1', '2026-01-10', 600, 'o1')],
    );
    expect(st(b, 'o1').paidDate).toBe('2026-01-10');
  });
});

describe('allocateAll and orderState', () => {
  it('groups by client', () => {
    const orders = [order('o1', '2026-01-01', 1000), order('o2', '2026-01-01', 500, { clientId: 'c2' })];
    const payments = [pay('p1', '2026-01-02', 1000), pay('p2', '2026-01-02', 800, null, { clientId: 'c3' })];
    const all = allocateAll(orders, payments);
    expect(all.get('c1')).toMatchObject({ owed: 0, credit: 0 });
    expect(all.get('c2')).toMatchObject({ owed: 500, credit: 0 });
    expect(all.get('c3')).toMatchObject({ owed: 0, credit: 800 });
    expect(orderState(all.get('c1'), orders[0]).status).toBe('paid');
  });

  it('orderState of an unknown order is unpaid', () => {
    const o = order('o9', '2026-01-01', 700);
    expect(orderState(undefined, o)).toMatchObject({ orderId: 'o9', total: 700, paid: 0, owed: 700, status: 'unpaid' });
  });

  it('handles thousands of records quickly', () => {
    const orders: Order[] = [];
    const payments: Payment[] = [];
    for (let i = 0; i < 5000; i++) {
      orders.push(order(`o${i}`, '2026-01-01', 1000, { clientId: `c${i % 200}` }));
      payments.push(pay(`p${i}`, '2026-01-02', 500, null, { clientId: `c${i % 200}` }));
    }
    const t = performance.now();
    const all = allocateAll(orders, payments);
    expect(performance.now() - t).toBeLessThan(500);
    expect(all.get('c0')!.owed).toBe(25 * 500);
  });
});

describe('newOrderPayment (D-007)', () => {
  it('unpaid creates no payment', () => {
    expect(newOrderPayment({ status: 'unpaid', total: 3000, credit: 0 })).toBe(0);
  });
  it('partial takes the entered amount', () => {
    expect(newOrderPayment({ status: 'partial', total: 3000, credit: 500, paidNow: 1000 })).toBe(1000);
  });
  it('paid without credit pays the total', () => {
    expect(newOrderPayment({ status: 'paid', total: 3000, credit: 0 })).toBe(3000);
  });
  it('paid with some credit pays total − credit', () => {
    expect(newOrderPayment({ status: 'paid', total: 3000, credit: 2000 })).toBe(1000);
  });
  it('paid fully covered by credit creates no payment', () => {
    expect(newOrderPayment({ status: 'paid', total: 3000, credit: 3000 })).toBe(0);
    expect(newOrderPayment({ status: 'paid', total: 3000, credit: 5000 })).toBe(0);
  });
});

describe('previewNewOrder', () => {
  const withCredit = allocateClient('c1', [], [pay('u', '2026-01-01', 2000)]);
  it('counts credit in the status', () => {
    expect(previewNewOrder(withCredit, 3000, 0)).toEqual({ creditUsed: 2000, status: 'partial' });
    expect(previewNewOrder(withCredit, 3000, 1000)).toEqual({ creditUsed: 2000, status: 'paid' });
    expect(previewNewOrder(withCredit, 1500, 0)).toEqual({ creditUsed: 1500, status: 'paid' });
    expect(previewNewOrder(withCredit, 3000, 3000)).toEqual({ creditUsed: 0, status: 'paid' });
  });
  it('without credit', () => {
    expect(previewNewOrder(undefined, 3000, 0)).toEqual({ creditUsed: 0, status: 'unpaid' });
    expect(previewNewOrder(undefined, 3000, 1000)).toEqual({ creditUsed: 0, status: 'partial' });
  });
});

describe('previewReceive', () => {
  const orders = [order('o2', '2026-01-02', 1000), order('o1', '2026-01-01', 1000), order('o3', '2026-01-03', 1000)];
  const b = allocateClient('c1', orders, [pay('l', '2026-01-02', 300, 'o1')]);

  it('covers open orders oldest first', () => {
    expect(previewReceive(b, orders, 1500)).toEqual({
      covers: [
        { orderId: 'o1', amount: 700, closes: true },
        { orderId: 'o2', amount: 800, closes: false },
      ],
      toCredit: 0,
    });
  });

  it('keeps the rest as credit', () => {
    const r = previewReceive(b, orders, 3000);
    expect(r.covers.map((c) => c.orderId)).toEqual(['o1', 'o2', 'o3']);
    expect(r.covers.every((c) => c.closes)).toBe(true);
    expect(r.toCredit).toBe(300);
  });
});

describe('debtAge and oldestUnpaidDays', () => {
  const today = '2026-04-30';
  const ago = (n: number) => new Date(Date.UTC(2026, 3, 30) - n * 86400000).toISOString().slice(0, 10);
  const orders = [7, 8, 30, 31, 90, 91, 0].map((d, i) => order(`o${i}`, ago(d), 100 * (i + 1)));

  it('buckets owed by order age at the boundaries', () => {
    const b = allocateClient('c1', orders, []);
    expect(debtAge([b], orders, today)).toEqual({
      '0-7': 100 + 700, // 7 and 0 days
      '8-30': 200 + 300,
      '31-90': 400 + 500,
      '90+': 600,
    });
    expect(oldestUnpaidDays(b, orders, today)).toBe(91);
  });

  it('uses owed, not total, and skips paid orders', () => {
    const b = allocateClient('c1', orders, [pay('u', today, 750)]); // pays 91d (600) and 150 of 90d
    expect(debtAge([b], orders, today)['90+']).toBe(0);
    expect(debtAge([b], orders, today)['31-90']).toBe(400 + 350);
    expect(oldestUnpaidDays(b, orders, today)).toBe(90);
  });

  it('oldestUnpaidDays is null when nothing is owed', () => {
    const b = allocateClient('c1', [], []);
    expect(oldestUnpaidDays(b, [], today)).toBeNull();
  });
});

describe('avgDaysToPay', () => {
  const orders = [
    order('o1', '2026-01-01', 1000),
    order('o2', '2026-01-10', 1000),
    order('o3', '2026-01-20', 1000), // unpaid
    order('o4', '2026-02-01', 1000), // out of range
    order('x1', '2026-01-05', 1000, { clientId: 'c2' }),
  ];
  const payments = [
    pay('l1', '2026-01-05', 1000, 'o1'), // 4 days
    pay('l2', '2026-01-20', 1000, 'o2'), // 10 days
    pay('l4', '2026-02-02', 1000, 'o4'),
    pay('lx', '2026-01-07', 1000, 'x1', { clientId: 'c2' }), // 2 days
  ];
  const all = allocateAll(orders, payments);

  it('averages fully paid orders in range', () => {
    expect(avgDaysToPay(all.values(), orders, '2026-01-01', '2026-01-31')).toBeCloseTo((4 + 10 + 2) / 3);
  });
  it('filters by client', () => {
    expect(avgDaysToPay(all.values(), orders, '2026-01-01', '2026-01-31', 'c1')).toBe(7);
  });
  it('is null with no paid orders', () => {
    expect(avgDaysToPay(all.values(), orders, '2026-03-01', '2026-03-31')).toBeNull();
  });
});
