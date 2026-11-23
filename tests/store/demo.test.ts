import { describe, expect, it } from 'vitest';
import { demoRecords, loadDemo } from '../../src/store/demo.ts';
import { memoryBackend } from '../../src/store/memory.ts';
import { createStore } from '../../src/store/store.ts';
import type { Client, Order, Payment, ProductClass, Recipe, StockEvent } from '../../src/core/types.ts';

const today = '2026-11-23';
const now = '2026-11-23T09:00:00.000Z';
const items = demoRecords(today, now);
const of = <T>(type: string) => items.filter((i) => i.type === type).map((i) => i.record as T);
const products = of<ProductClass>('product');
const clients = of<Client>('client');
const orders = of<Order>('order');
const payments = of<Payment>('payment');
const stock = of<StockEvent>('stock');
const recipes = of<Recipe>('recipe');
const variants = new Map(products.flatMap((p) => p.variants.map((v) => [v.id, { p, v }] as const)));
const daysAgo = (d: string) => (Date.parse(today) - Date.parse(d)) / 86400000;

describe('demoRecords', () => {
  it('is deterministic with unique demo ids', () => {
    expect(demoRecords(today, now)).toEqual(items);
    const ids = items.map((i) => (i.record as { id: string }).id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('demo-'))).toBe(true);
  });

  it('has the sample catalogue, clients and recipe', () => {
    expect(products.map((p) => p.name)).toEqual(['Parmigiano Reggiano', 'Ryzen 5', 'Olive oil', 'Milk', 'Yogurt']);
    expect(products.find((p) => p.name === 'Milk')).toMatchObject({ sellable: false, unit: { name: 'kg', decimals: 3 } });
    const parm = products[0];
    expect(parm.variants.map((v) => `${v.label}/${v.kind}`)).toEqual(['200 g/fixed', '500 g/fixed', '3 kg/fixed', 'Cut to order/variable']);
    expect(clients.map((c) => c.name)).toEqual(['Marta', 'Lucía', 'Javier', 'Ana', 'Pedro', 'Carmen', 'Luis']);
    expect(recipes).toHaveLength(1);
    expect(recipes[0]).toMatchObject({ name: 'Yogurt from milk', inputs: [{ amount: 500000 }], outputs: [{ amount: 10000 }] });
  });

  it('every line total follows §4.1 and every order total is the sum of its lines', () => {
    expect(orders.length).toBeGreaterThanOrEqual(35);
    for (const o of orders) {
      for (const l of o.lines) {
        const { p, v } = variants.get(l.variantId)!;
        expect(l.classId).toBe(p.id);
        expect(l.decimals).toBe(p.unit.decimals);
        if (l.kind === 'fixed') {
          expect(l.amount).toBe(l.quantity! * v.baseAmount!);
          expect(l.lineTotal).toBe(l.quantity! * l.unitPrice);
        } else {
          expect(l.quantity).toBeNull();
          expect(l.lineTotal).toBe(Math.round((l.amount * l.unitPrice) / 10 ** l.decimals));
        }
      }
      expect(o.total).toBe(o.lines.reduce((s, l) => s + l.lineTotal, 0));
    }
  });

  it('spreads orders over about four months up to today', () => {
    const ages = orders.map((o) => daysAgo(o.date));
    expect(Math.min(...ages)).toBe(0);
    expect(Math.max(...ages)).toBeGreaterThan(100);
    expect(Math.max(...ages)).toBeLessThanOrEqual(130);
  });

  it('mixes linked and unlinked payments, a voided order with voided payments, and valid references', () => {
    const clientIds = new Set(clients.map((c) => c.id));
    const orderIds = new Set(orders.map((o) => o.id));
    expect(orders.every((o) => clientIds.has(o.clientId))).toBe(true);
    expect(payments.every((p) => clientIds.has(p.clientId) && (p.orderId === null || orderIds.has(p.orderId)))).toBe(true);
    expect(payments.some((p) => p.orderId === null)).toBe(true);
    const voided = orders.filter((o) => o.voided);
    expect(voided).toHaveLength(1);
    const linked = payments.filter((p) => p.orderId === voided[0].id);
    expect(linked.length).toBeGreaterThan(0);
    expect(linked.every((p) => p.voided)).toBe(true);
    const paidByOrder = (id: string) => payments.filter((p) => p.orderId === id).reduce((s, p) => s + p.amount, 0);
    const live = orders.filter((o) => !o.voided);
    expect(live.some((o) => paidByOrder(o.id) === 0)).toBe(true);
    expect(live.some((o) => paidByOrder(o.id) > 0 && paidByOrder(o.id) < o.total)).toBe(true);
    expect(live.some((o) => paidByOrder(o.id) === o.total)).toBe(true);
    expect(payments.every((p) => p.amount > 0 && daysAgo(p.date) >= 0)).toBe(true);
  });

  it('gives one client credit: their payments exceed their orders', () => {
    const credit = clients.filter((c) => {
      const owed = orders.filter((o) => o.clientId === c.id && !o.voided).reduce((s, o) => s + o.total, 0);
      const paid = payments.filter((p) => p.clientId === c.id && !p.voided).reduce((s, p) => s + p.amount, 0);
      return paid > owed;
    });
    expect(credit.map((c) => c.name)).toEqual(['Carmen']);
  });

  it('has stock adds with costs, one remove and one Milk → Yogurt transform with breakdown costs', () => {
    expect(stock.filter((s) => s.type === 'add').every((s) => s.type === 'add' && s.unitCost !== null)).toBe(true);
    expect(stock.filter((s) => s.type === 'remove')).toHaveLength(1);
    const t = stock.filter((s) => s.type === 'transform');
    expect(t).toHaveLength(1);
    const tr = t[0];
    if (tr.type !== 'transform') throw new Error('not a transform');
    const milk = products.find((p) => p.name === 'Milk')!;
    const yogurt = products.find((p) => p.name === 'Yogurt')!;
    expect(tr.inputs).toEqual([{ classId: milk.id, amount: 500000 }]);
    expect(tr.outputs).toEqual([{ classId: yogurt.id, amount: 10000 }]);
    expect(tr.recipeId).toBe(recipes[0].id);
    const c = tr.costs!;
    expect(c.mode).toBe('breakdown');
    expect(c.total).toBe(c.materials + c.extras.reduce((s, e) => s + e.amount, 0));
  });
});

describe('loadDemo', () => {
  it('writes every record without outbox entries and survives a reload', async () => {
    const backend = memoryBackend();
    await loadDemo(createStore(backend), today, now);
    const again = createStore(backend);
    expect(await again.outboxCount()).toBe(0);
    expect(await again.all('orders')).toHaveLength(orders.length);
    expect(await again.all('products')).toEqual(products);
    expect(await again.all('stock')).toHaveLength(stock.length);
  });
});
