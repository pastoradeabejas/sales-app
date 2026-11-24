import { describe, expect, it } from 'vitest';
import { demoRecords, loadDemo, DEMO_DAYS } from '../../src/store/demo.ts';
import { memoryBackend } from '../../src/store/memory.ts';
import { createStore } from '../../src/store/store.ts';
import { monthlyTrend } from '../../src/core/finance.ts';
import { fullName } from '../../src/core/groups.ts';
import { allocateAll, debtAge } from '../../src/core/payments.ts';
import { isExpenseItem } from '../../src/core/purchases.ts';
import { classTimeline, isLowStock, stockSnapshot } from '../../src/core/stock.ts';
import { sharesValid } from '../../src/core/costs.ts';
import type { Client, Order, Payment, ProductClass, Purchase, Recipe, StockEvent, StockTransform, Supplier, WorkLevel } from '../../src/core/types.ts';

const today = '2026-11-23';
const now = '2026-11-23T09:00:00.000Z';
const t0 = performance.now();
const items = demoRecords(today, now);
const ms = performance.now() - t0;
const of = <T>(type: string) => items.filter((i) => i.type === type).map((i) => i.record as T);
const products = of<ProductClass>('product');
const clients = of<Client>('client');
const orders = of<Order>('order');
const payments = of<Payment>('payment');
const stock = of<StockEvent>('stock');
const recipes = of<Recipe>('recipe');
const purchases = of<Purchase>('purchase');
const suppliers = of<Supplier>('supplier');
const levels = of<WorkLevel>('level');
const byId = new Map(products.map((p) => [p.id, p]));
const variants = new Map(products.flatMap((p) => p.variants.map((v) => [v.id, { p, v }] as const)));
const daysAgo = (d: string) => (Date.parse(today) - Date.parse(d)) / 86400000;
const transforms = stock.filter((e): e is StockTransform => e.type === 'transform');
const live = orders.filter((o) => !o.voided);
const named = (name: string) => products.find((p) => fullName(p) === name)!;

describe('demoRecords: shape', () => {
  it('is deterministic, fast, with unique demo ids', () => {
    expect(demoRecords(today, now)).toEqual(items);
    expect(ms).toBeLessThan(1500);
    const ids = items.map((i) => (i.record as { id: string }).id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('demo-'))).toBe(true);
  });

  it('spans 15 months up to today, with many orders and clients', () => {
    expect(DEMO_DAYS).toBeGreaterThanOrEqual(450);
    const ages = orders.map((o) => daysAgo(o.date));
    expect(Math.min(...ages)).toBe(0);
    expect(Math.max(...ages)).toBeGreaterThan(430);
    expect(Math.max(...ages)).toBeLessThanOrEqual(DEMO_DAYS);
    expect(orders.length).toBeGreaterThanOrEqual(700);
    expect(orders.length).toBeLessThanOrEqual(1400);
    expect(clients.length).toBeGreaterThanOrEqual(30);
    expect(clients.every((c) => orders.some((o) => o.clientId === c.id))).toBe(true);
  });

  it('stamps records at their own date, stock moves before the sales of the day', () => {
    for (const r of [...orders, ...payments, ...stock, ...purchases]) expect(r.createdAt.slice(0, 10)).toBe(r.date);
    const firstOrder = new Map<string, string>();
    for (const o of orders) if (!firstOrder.has(o.date) || o.createdAt < firstOrder.get(o.date)!) firstOrder.set(o.date, o.createdAt);
    for (const p of purchases) if (firstOrder.has(p.date)) expect(p.createdAt < firstOrder.get(p.date)!).toBe(true);
    for (const t of transforms) if (firstOrder.has(t.date)) expect(t.createdAt < firstOrder.get(t.date)!).toBe(true);
  });

  it('every line total follows §4.1 and every order total is the sum of its lines', () => {
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

  it('references are valid', () => {
    const clientIds = new Set(clients.map((c) => c.id));
    const orderIds = new Set(orders.map((o) => o.id));
    expect(orders.every((o) => clientIds.has(o.clientId))).toBe(true);
    expect(payments.every((p) => clientIds.has(p.clientId) && (p.orderId === null || orderIds.has(p.orderId)))).toBe(true);
    expect(payments.every((p) => p.amount > 0 && daysAgo(p.date) >= 0)).toBe(true);
    expect(payments.every((p) => p.orderId === null || orders.find((o) => o.id === p.orderId)!.clientId === p.clientId)).toBe(true);
    const supplierIds = new Set(suppliers.map((s) => s.id));
    expect(purchases.every((p) => p.supplierId === null || supplierIds.has(p.supplierId))).toBe(true);
    const recipeIds = new Set(recipes.map((r) => r.id));
    expect(transforms.every((t) => t.recipeId === null || recipeIds.has(t.recipeId))).toBe(true);
  });
});

describe('demoRecords: payments', () => {
  const balances = allocateAll(orders, payments);
  const paidByOrder = (id: string) => payments.filter((p) => p.orderId === id && !p.voided).reduce((s, p) => s + p.amount, 0);

  it('has orders paid at once, paid later, partly paid in instalments and unpaid', () => {
    expect(live.some((o) => paidByOrder(o.id) === o.total)).toBe(true);
    expect(live.some((o) => paidByOrder(o.id) > 0 && paidByOrder(o.id) < o.total)).toBe(true);
    expect(live.some((o) => payments.filter((p) => p.orderId === o.id && !p.voided).length >= 3)).toBe(true);
    expect(payments.some((p) => p.orderId === null && !p.voided)).toBe(true);
  });

  it('has debt in every age band and clients that hold credit', () => {
    const age = debtAge(balances.values(), orders, today);
    for (const band of ['0-7', '8-30', '31-90', '90+'] as const) expect(age[band], band).toBeGreaterThan(0);
    expect([...balances.values()].some((b) => b.credit > 0)).toBe(true);
    // Credit used: an order covered by pool money (an advance) with no linked payment.
    expect([...balances.values()].some((b) => [...b.orders.values()].some((s) => s.status === 'paid' && s.allocations.every((a) => !a.linked)))).toBe(true);
  });

  it('has one voided order with its voided payment and one voided payment on its own', () => {
    const voided = orders.filter((o) => o.voided);
    expect(voided).toHaveLength(1);
    expect(voided[0].voidReason).toBeTruthy();
    expect(payments.filter((p) => p.orderId === voided[0].id).every((p) => p.voided)).toBe(true);
    expect(payments.some((p) => p.voided && p.orderId !== voided[0].id)).toBe(true);
  });
});

describe('demoRecords: prices and costs', () => {
  it('raised prices: older orders of a variant keep a lower price than today', () => {
    const f5 = named('Honey - Flower - 500g Jar').variants[0];
    const prices = live.flatMap((o) => o.lines.filter((l) => l.variantId === f5.id).map((l) => ({ age: daysAgo(o.date), price: l.unitPrice })));
    expect(prices.filter((x) => x.age > 300).every((x) => x.price < f5.price)).toBe(true);
    expect(prices.filter((x) => x.age < 100).some((x) => x.price === f5.price)).toBe(true);
  });

  it('has discounted lines (price below the price list of that day)', () => {
    const meat = live.flatMap((o) => o.lines).filter((l) => variants.get(l.variantId)!.v.kind === 'variable');
    expect(new Set(meat.filter((l) => l.variantId === meat[0].variantId).map((l) => l.unitPrice)).size).toBeGreaterThanOrEqual(2);
    const clientsWithDiscount = live.filter((o) => o.lines.some((l) => l.unitPrice < variants.get(l.variantId)!.v.price * 0.95 && daysAgo(o.date) < 150));
    expect(clientsWithDiscount.length).toBeGreaterThan(0);
  });

  it('has sales lines with an unknown cost, but most with a known one', () => {
    const lines = live.flatMap((o) => o.lines);
    const unknown = lines.filter((l) => l.unitCost === null).length;
    expect(unknown).toBeGreaterThan(0);
    expect(unknown / lines.length).toBeLessThan(0.15);
  });

  it('purchase prices rise over time, so the average cost of a bought class goes up', () => {
    const bulk = named('Honey - Flower - Bulk');
    const t = classTimeline(bulk, orders, stock, byId, purchases);
    const costs = t.filter((m) => m.kind === 'purchase').map((m) => m.avgCostAfter!);
    expect(costs.length).toBeGreaterThanOrEqual(3);
    expect(costs.at(-1)!).toBeGreaterThan(costs[0]);
  });

  it('transforms: breakdown costs with labour on all three levels, one total-mode, one with two outputs split by shares, one voided', () => {
    for (const t of transforms) {
      const c = t.costs!;
      expect(sharesValid(c.allocation)).toBe(true);
      if (c.mode === 'breakdown') expect(c.total).toBe(c.materials + (c.labour ?? []).reduce((s, l) => s + l.amount, 0) + c.extras.reduce((s, e) => s + e.amount, 0));
    }
    expect(new Set(transforms.flatMap((t) => (t.costs?.labour ?? []).map((l) => l.levelId)))).toEqual(new Set(levels.map((l) => l.id)));
    expect(transforms.filter((t) => t.costs?.mode === 'total').length).toBeGreaterThanOrEqual(1);
    const two = transforms.find((t) => t.outputs.length === 2)!;
    expect(two.costs!.allocation.map((s) => s.share)).toEqual([0.8, 0.2]);
    expect(transforms.filter((t) => t.voided)).toHaveLength(1);
  });
});

describe('demoRecords: stock', () => {
  const tracked = products.filter((p) => p.trackStock);
  const comb = named('Honeycomb - Honeycomb');

  it('never goes below zero, except honeycomb once, which resets on the next purchase', () => {
    for (const c of tracked) {
      const t = classTimeline(c, orders, stock, byId, purchases);
      if (c.id === comb.id) continue;
      for (const m of t) expect(m.balanceAfter, `${fullName(c)} on ${m.date}`).toBeGreaterThanOrEqual(0);
    }
    const t = classTimeline(comb, orders, stock, byId, purchases);
    expect(t.some((m) => m.balanceAfter < 0)).toBe(true);
    expect(t.some((m) => m.reset)).toBe(true);
    expect(t.at(-1)!.balanceAfter).toBeGreaterThanOrEqual(0);
  });

  it('ends with an item at zero and items on low stock', () => {
    const snap = stockSnapshot(products, orders, stock, purchases);
    const sellable = tracked.filter((p) => p.sellable && !p.archived);
    expect(sellable.some((p) => snap.get(p.id)!.stock === 0)).toBe(true);
    expect(sellable.filter((p) => isLowStock(p, snap.get(p.id)!.stock)).length).toBeGreaterThanOrEqual(2);
  });

  it('has removes for every reason', () => {
    const reasons = new Set(stock.flatMap((e) => (e.type === 'remove' ? [e.reason] : [])));
    for (const r of ['waste', 'gift', 'own use', 'count correction']) expect(reasons.has(r), r).toBe(true);
    expect([...reasons].some((r) => !['waste', 'gift', 'own use', 'count correction'].includes(r))).toBe(true);
  });
});

describe('demoRecords: catalogue and clients', () => {
  it('has the farm shop catalogue in groups, recipes and work levels', () => {
    const names = products.map(fullName);
    for (const n of ['Honey - Flower - 500g Jar', 'Honey - Heather - 1kg Jar', 'Dairy - Cheese - Cured cheese', 'Dairy - Cheese - Whey', 'Meat - Pork - Sausages', 'Eggs - Eggs', 'Expenses - Insurance'])
      expect(names, n).toContain(n);
    expect(products.filter((p) => p.sellable).length).toBeGreaterThanOrEqual(25);
    expect(recipes.length).toBeGreaterThanOrEqual(15);
    expect(levels.map((l) => l.name)).toEqual(['Level 1', 'Level 2', 'Level 3']);
    expect(products.some((p) => p.customFields.length > 0 && Object.keys(p.customValues).length > 0)).toBe(true);
  });

  it('has an archived product and an archived variant that still appear in old orders', () => {
    const archived = products.filter((p) => p.archived);
    expect(archived.length).toBeGreaterThanOrEqual(1);
    expect(live.some((o) => o.lines.some((l) => archived.some((p) => p.id === l.classId)))).toBe(true);
    const oldVariant = products.flatMap((p) => p.variants.filter((v) => v.archived && !p.archived));
    expect(oldVariant.length).toBeGreaterThanOrEqual(1);
    expect(live.some((o) => o.lines.some((l) => l.variantId === oldVariant[0].id))).toBe(true);
  });

  it('has an archived client, a renamed client, tags and clients gone quiet', () => {
    expect(clients.some((c) => c.archived)).toBe(true);
    expect(clients.some((c) => orders.some((o) => o.clientId === c.id && o.clientName !== c.name))).toBe(true);
    expect(new Set(clients.flatMap((c) => c.tags))).toEqual(new Set(['family', 'neighbour', 'work', 'market', 'shop', 'restaurant']));
    const last = (id: string) => Math.min(...orders.filter((o) => o.clientId === id).map((o) => daysAgo(o.date)));
    expect(clients.filter((c) => !c.archived && last(c.id) > 60).length).toBeGreaterThanOrEqual(2);
  });
});

describe('demoRecords: purchases and profit', () => {
  it('has purchases whose expense lines are expense items and whose totals add up', () => {
    const expenseNames = new Set<string>();
    for (const p of purchases) {
      expect(p.total).toBe(p.lines.reduce((s, l) => s + l.lineTotal, 0));
      expect(p.supplierId === null ? '' : suppliers.find((s) => s.id === p.supplierId)!.name).toBe(p.supplierName);
      for (const l of p.lines) {
        const c = byId.get(l.classId)!;
        if (c.group === 'Expenses') {
          expect(isExpenseItem(c)).toBe(true);
          expenseNames.add(c.name);
        } else expect(c.trackStock).toBe(true);
      }
    }
    expect(expenseNames.size).toBeGreaterThanOrEqual(8);
    expect(purchases.some((p) => p.supplierId === null)).toBe(true);
    expect(purchases.filter((p) => p.voided)).toHaveLength(1);
    expect(purchases.some((p) => p.lines.length > 1)).toBe(true);
  });

  it('most of the last 12 months make a profit, some make a loss, December sells most', () => {
    const trend = monthlyTrend(orders, purchases, stock, byId, today);
    const profitable = trend.filter((m) => m.net > 0).length;
    expect(profitable).toBeGreaterThanOrEqual(8);
    expect(trend.some((m) => m.net < 0)).toBe(true);
    const dec = trend.find((m) => m.month.endsWith('-12'))!;
    expect(trend.every((m) => m.sales <= dec.sales)).toBe(true);
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
