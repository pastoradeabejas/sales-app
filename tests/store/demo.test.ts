import { describe, expect, it } from 'vitest';
import { demoRecords, loadDemo } from '../../src/store/demo.ts';
import { memoryBackend } from '../../src/store/memory.ts';
import { createStore } from '../../src/store/store.ts';
import { profitSummary } from '../../src/core/stats.ts';
import { isExpenseItem } from '../../src/core/purchases.ts';
import { fullName } from '../../src/core/groups.ts';
import type { Client, Order, Payment, ProductClass, Purchase, Recipe, StockEvent, Supplier, WorkLevel } from '../../src/core/types.ts';

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
const purchases = of<Purchase>('purchase');
const suppliers = of<Supplier>('supplier');
const levels = of<WorkLevel>('level');
const variants = new Map(products.flatMap((p) => p.variants.map((v) => [v.id, { p, v }] as const)));
const levelsById = new Map(levels.map((l) => [l.id, l]));
const daysAgo = (d: string) => (Date.parse(today) - Date.parse(d)) / 86400000;

describe('demoRecords', () => {
  it('is deterministic with unique demo ids', () => {
    expect(demoRecords(today, now)).toEqual(items);
    const ids = items.map((i) => (i.record as { id: string }).id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('demo-'))).toBe(true);
  });

  it('has the farm shop catalogue (honey, dairy, meat) in groups, clients and recipes', () => {
    expect(products.map(fullName)).toEqual([
      'Honey - Flower - Bulk', 'Honey - Flower - 500g Jar', 'Honey - Flower - 1kg Jar',
      'Honey - Rosemary - Bulk', 'Honey - Rosemary - 500g Jar', 'Honey - Rosemary - 1kg Jar',
      'Honey - Oak - Bulk', 'Honey - Oak - 500g Jar', 'Honey - Oak - 1kg Jar',
      'Packaging - Empty jar 500g', 'Packaging - Empty jar 1kg', 'Packaging - Lid', 'Packaging - Gift box',
      'Gifts - Christmas box', 'Honeycomb - Honeycomb', 'Pollen - 250g Jar',
      'Dairy - Milk - Raw milk', 'Dairy - Milk - 1L Bottle', 'Dairy - Cheese - Cured cheese', 'Dairy - Cheese - Fresh cheese',
      'Dairy - Yogurt - Natural yogurt', 'Meat - Pork - Chorizo', 'Meat - Pork - Pork loin', 'Meat - Beef - Minced beef',
      'Meat - Beef - Steak',
      'Honey - Heather - Bulk', 'Honey - Heather - 500g Jar', 'Honey - Heather - 1kg Jar', 'Candles - Beeswax candle',
      'Wellness - Propolis tincture', 'Dairy - Butter - Butter', 'Dairy - Kefir - Kefir', 'Meat - Pork - Sausages',
      'Meat - Lamb - Lamb chops', 'Eggs - Eggs',
      'Packaging - Labels', 'Raw materials - Candle wick', 'Raw materials - Beeswax', 'Packaging - Butter paper',
      'Packaging - Kefir bottle', 'Raw materials - Sausage casing', 'Packaging - Egg box', 'Raw materials - Pork shoulder',
      'Raw materials - Loose eggs',
      'Expenses - Fuel', 'Expenses - Market fee', 'Expenses - Hive treatment', 'Expenses - Electricity', 'Expenses - Vet',
      'Expenses - Packaging transport', 'Expenses - Market stall rent', 'Expenses - Phone', 'Expenses - Insurance',
      'Expenses - Equipment', 'Expenses - Feed',
    ]);
    expect(products.filter((p) => p.sellable).length).toBeGreaterThanOrEqual(25);
    expect(products.find((p) => p.name === 'Sausages')!.variants.map((v) => `${v.label}/${v.kind}/${v.cost}`)).toEqual(['By weight/variable/900', '400 g pack/fixed/380']);
    expect(products.find((p) => p.name === 'Eggs')!.variants.map((v) => `${v.label}/${v.baseAmount}/${v.cost}`)).toEqual(['Dozen/12/220', 'Half dozen/6/null']);
    expect(products.find((p) => p.name === 'Beeswax candle')!.variants.map((v) => v.label)).toEqual(['Small', 'Large']);
    expect(products.find((p) => p.name === 'Natural yogurt')!.variants.map((v) => `${v.label}/${v.baseAmount}`)).toEqual(['Single/1', 'Pack of 4/4']);
    expect(products.find((p) => p.name === 'Cured cheese')!.variants.map((v) => `${v.label}/${v.kind}`)).toEqual(['By weight/variable', 'Quarter 750 g/fixed']);
    expect(products.find((p) => fullName(p) === 'Honey - Flower - Bulk')).toMatchObject({ sellable: false, unit: { name: 'kg', decimals: 3 } });
    const jar = products.find((p) => fullName(p) === 'Honey - Rosemary - 500g Jar')!;
    expect(jar).toMatchObject({ sellable: true, unit: { name: 'jar', decimals: 0 }, lowStockThreshold: 10 });
    expect(jar.variants.map((v) => `${v.label}/${v.kind}/${v.baseAmount}`)).toEqual(['500 g/fixed/1']);
    expect(products.find((p) => p.name === 'Honeycomb')!.variants.map((v) => `${v.label}/${v.kind}`)).toEqual(['By weight/variable']);
    expect(clients.slice(0, 7).map((c) => c.name)).toEqual(['Marta', 'Lucía', 'Javier', 'Ana', 'Pedro', 'Carmen', 'Luis']);
    expect(recipes.map((r) => r.name)).toEqual([
      'Fill Flower 500g', 'Fill Flower 1kg', 'Fill Rosemary 500g', 'Fill Rosemary 1kg', 'Fill Oak 500g', 'Fill Oak 1kg', 'Christmas box',
      'Fill Heather 500g', 'Fill Heather 1kg', 'Make large candle', 'Make small candle', 'Make butter', 'Make kefir', 'Make sausages',
      'Pack eggs', 'Deluxe gift box', 'Make cured cheese', 'Make fresh cheese', 'Bottle milk', 'Make yogurt',
    ]);
    const names = (r: Recipe) => r.inputs.map((i) => `${i.amount} ${fullName(products.find((p) => p.id === i.classId)!)}`);
    expect(names(recipes[0])).toEqual(['1 Packaging - Empty jar 500g', '1 Packaging - Lid', '500 Honey - Flower - Bulk']);
    expect(names(recipes[6])).toEqual(['1 Honey - Flower - 500g Jar', '1 Honey - Rosemary - 1kg Jar', '1 Packaging - Gift box']);
    const cheese = recipes.find((r) => r.name === 'Make cured cheese')!;
    expect(names(cheese)).toEqual(['10 Dairy - Milk - Raw milk']);
    expect(cheese.outputs[0].amount).toBe(1000);
  });

  it('never lets any stock go below zero over time', () => {
    const moves: [string, number, string, number][] = []; // [date, order (stock before sales), class, delta]
    for (const e of stock) {
      if (e.type === 'transform') {
        e.inputs.forEach((x) => moves.push([e.date, 0, x.classId, -x.amount]));
        e.outputs.forEach((x) => moves.push([e.date, 0, x.classId, x.amount]));
      } else moves.push([e.date, 0, e.classId, e.type === 'add' ? e.amount : -e.amount]);
    }
    for (const p of purchases) p.lines.forEach((l) => moves.push([p.date, 0, l.classId, l.amount]));
    for (const o of orders.filter((x) => !x.voided)) o.lines.forEach((l) => moves.push([o.date, 1, l.classId, -l.amount]));
    moves.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
    const balance = new Map<string, number>();
    for (const [date, , id, d] of moves) {
      balance.set(id, (balance.get(id) ?? 0) + d);
      expect(balance.get(id), `${id} on ${date}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('every line total follows §4.1 and every order total is the sum of its lines', () => {
    expect(orders.length).toBeGreaterThanOrEqual(150);
    expect(orders.length).toBeLessThanOrEqual(250);
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

  it('has stock adds with costs, one remove, fill transforms and one Christmas box transform with breakdown costs', () => {
    expect(stock.filter((s) => s.type === 'add').every((s) => s.type === 'add' && s.unitCost !== null)).toBe(true);
    expect(stock.filter((s) => s.type === 'remove')).toHaveLength(1);
    const transforms = stock.flatMap((s) => (s.type === 'transform' ? [s] : []));
    expect(transforms.length).toBeGreaterThanOrEqual(8);
    const recipeIds = new Set(recipes.map((r) => r.id));
    for (const tr of transforms) {
      expect(recipeIds.has(tr.recipeId!)).toBe(true);
      const c = tr.costs!;
      expect(c.mode).toBe('breakdown');
      expect(c.extras.length).toBeGreaterThan(0);
      expect(c.total).toBe(c.materials + (c.labour ?? []).reduce((s, l) => s + l.amount, 0) + c.extras.reduce((s, e) => s + e.amount, 0));
    }
    const boxId = products.find((p) => p.name === 'Christmas box')!.id;
    const box = transforms.filter((t) => t.recipeId === 'demo-recipe-box');
    expect(box).toHaveLength(1);
    expect(box[0].outputs).toEqual([{ classId: boxId, amount: 10 }]);
    expect(box[0].costs!.extras).toEqual([{ label: 'Time', amount: 1000 }]);
    const fill = transforms[0];
    expect(fill.costs!.extras.map((e) => e.label)).toEqual(['Labels']);
  });
});

describe('suppliers, work levels and purchases (§16.8)', () => {
  it('has 8 suppliers, 3 work levels and labour on the recipes and transforms', () => {
    expect(suppliers.map((s) => s.name)).toEqual([
      'Envases Levante', 'Apícola Sur', 'Gasolinera', 'Piensos del Valle', 'Clínica Veterinaria Sol', 'Iberluz', 'Seguros Mediterráneo', 'Imprenta Gráfica',
    ]);
    expect(levels.map((l) => `${l.name}/${l.hourlyRate}`)).toEqual(['Level 1/1200', 'Level 2/1450', 'Level 3/1800']);
    expect(recipes.length).toBeGreaterThanOrEqual(12);
    expect(recipes.filter((r) => r.labour).length).toBeGreaterThanOrEqual(12);
    expect(recipes.every((r) => !r.labour || r.labour.every((l) => levelsById.has(l.levelId) && l.minutes > 0))).toBe(true);
    const fills = recipes.filter((r) => r.name.startsWith('Fill'));
    expect(fills.map((r) => r.labour![0].minutes)).toEqual([2, 3, 2, 3, 2, 3, 2, 3]);
    const fillTransform = stock.find((e) => e.type === 'transform' && e.recipeId === fills[0].id);
    expect(fillTransform!.type === 'transform' && fillTransform!.costs!.labour).toEqual([
      { levelId: 'demo-level-1', levelName: 'Level 1', minutes: 80, hourlyRate: 1200, amount: 1600 },
    ]);
  });

  it('has purchases whose expense lines are expense items and whose totals add up', () => {
    const byId = new Map(products.map((p) => [p.id, p]));
    expect(purchases.length).toBeGreaterThan(60);
    const expenseNames = new Set<string>();
    for (const p of purchases) {
      expect(p.total).toBe(p.lines.reduce((s, l) => s + l.lineTotal, 0));
      expect(p.supplierId === null ? p.supplierName : suppliers.find((s) => s.id === p.supplierId)!.name).toBe(p.supplierName);
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
    expect(new Set(purchases.map((p) => p.supplierId)).size).toBeGreaterThanOrEqual(8);
  });

  it('has at least 25 clients with tags, some quiet and some owing for 30, 60 and 90+ days', () => {
    expect(clients.length).toBeGreaterThanOrEqual(25);
    expect(new Set(clients.flatMap((c) => c.tags))).toEqual(new Set(['family', 'neighbour', 'work', 'market', 'shop', 'restaurant']));
    const last = (id: string) => Math.min(...orders.filter((o) => o.clientId === id).map((o) => daysAgo(o.date)));
    expect(clients.every((c) => orders.some((o) => o.clientId === c.id))).toBe(true);
    expect(clients.filter((c) => last(c.id) > 60).length).toBeGreaterThanOrEqual(3);
    const unpaidAges = orders.filter((o) => !o.voided && !payments.some((p) => p.orderId === o.id && !p.voided)).map((o) => daysAgo(o.date));
    for (const [from, to] of [[30, 60], [60, 90], [90, 200]]) expect(unpaidAges.some((a) => a >= from && a < to)).toBe(true);
  });

  it('has a Profit summary over the last month with sales, expenses and labour', () => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const from = new Date(Date.parse(today) - 29 * 86400000).toISOString().slice(0, 10);
    const sum = profitSummary(orders, purchases, stock, byId, { from, to: today });
    expect(sum.sales).toBeGreaterThan(0);
    expect(sum.expenses).toBeGreaterThan(0);
    expect(sum.labour).toBeGreaterThan(0);
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
