// Demo mode sample data (spec §2.1, §15): deterministic records relative to `today`, loaded without outbox.
import { buildTransformCosts, labourCosts } from '../core/costs.ts';
import {
  SCHEMA_VERSION,
  type Client, type Decimals, type IsoDate, type Order, type OrderLine, type Payment, type PaymentMethod,
  type ProductClass, type Purchase, type PurchaseLine, type Recipe, type RecordType, type StockEvent, type Supplier, type Timestamp, type LabourRow, type Variant, type WorkLevel,
} from '../core/types.ts';
import type { Store } from './store.ts';

type Item = { type: RecordType; record: object };

const shift = (date: IsoDate, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
// Half-up rounding of a / d for non-negative integers, without floats.
const roundDiv = (a: number, d: number) => Math.floor((2 * a + d) / (2 * d));

// Order specs: [days ago, client index, lines "variant:qty-or-scaled-amount", payment].
// P paid on a linked payment, H half paid, U unpaid, L paid later by an unlinked payment, V voided.
const ORDERS: [number, number, string, 'P' | 'H' | 'U' | 'L' | 'V'][] = [
  [120, 0, 'f5:2', 'P'], [118, 2, 'r5:1 f1:1', 'P'], [116, 3, 'f5:3 pol:2', 'P'], [113, 1, 'comb:1373', 'L'],
  [110, 4, 'r1:1', 'P'], [108, 5, 'f5:1 pol:2', 'P'], [105, 6, 'f1:2', 'P'], [102, 0, 'comb:860 r5:1', 'P'],
  [99, 1, 'o5:2 o1:1', 'L'], [96, 2, 'r1:1', 'H'], [93, 3, 'f5:2', 'P'], [90, 4, 'comb:2140', 'P'],
  [87, 5, 'r5:4', 'P'], [84, 6, 'f5:2', 'U'], [81, 0, 'f1:1', 'P'], [78, 1, 'f5:1 r5:2', 'L'],
  [75, 2, 'comb:1015', 'P'], [72, 3, 'o1:1 f5:1', 'P'], [69, 4, 'r1:1', 'V'], [66, 5, 'o5:3', 'P'],
  [63, 0, 'f5:3', 'P'], [59, 6, 'pol:3', 'P'], [56, 1, 'pol:6 comb:745', 'L'], [53, 2, 'o5:4', 'P'],
  [50, 3, 'comb:1290', 'H'], [47, 4, 'box:2', 'P'], [44, 5, 'f5:2 pol:4', 'P'], [41, 0, 'r5:3', 'P'],
  [37, 6, 'box:1', 'H'], [34, 1, 'f5:4', 'L'], [30, 2, 'pol:8 r5:6', 'U'], [27, 3, 'f1:1', 'P'],
  [23, 4, 'comb:1580 o1:1', 'U'], [20, 5, 'box:3', 'P'], [16, 0, 'r1:2 f5:1', 'H'], [13, 1, 'pol:5', 'P'],
  [9, 6, 'comb:930', 'U'], [6, 3, 'box:2 pol:2', 'U'], [3, 0, 'f5:2 r5:2', 'U'], [1, 4, 'r1:1', 'P'],
  [0, 2, 'comb:1137', 'U'],
  // Dairy and meat (D-017).
  [115, 0, 'mk:4 y4:2', 'P'], [107, 2, 'chw:1250 fc:2', 'P'], [101, 4, 'cho:2 pl:1500', 'P'], [94, 6, 'mk:6 chq:1', 'H'],
  [86, 3, 'mbf:1000 y1:6', 'P'], [79, 1, 'fc:3 mk:3', 'L'], [71, 5, 'chw:800 cho:1', 'P'], [62, 0, 'y4:3 mk:4', 'P'],
  [52, 2, 'mb5:2 pl:1200', 'U'], [38, 4, 'stk:900 mk:2', 'P'], [31, 6, 'chq:2 fc:2', 'P'], [24, 3, 'stk:1100 mbf:600', 'H'],
  [17, 0, 'y4:2 cho:3', 'P'], [11, 0, 'mk:6 fc:2', 'U'], [5, 2, 'chw:640 stk:500', 'P'], [2, 5, 'mb5:1 y1:4', 'P'],
  [0, 6, 'mk:3 cho:1', 'U'],
];

const CLIENTS: [string, string, string[]][] = [
  ['Marta', '+34 600 111 222', ['family']], ['Lucía', '+34 611 222 333', ['neighbour']], ['Javier', '', ['work']],
  ['Ana', '', []], ['Pedro', '+34 622 333 444', []], ['Carmen', '', ['family']], ['Luis', '', []],
];

/** Sample records for Demo mode; `today` is the local date, `now` stamps every record. */
export function demoRecords(today: IsoDate, now: Timestamp): Item[] {
  const stamp = { createdAt: now, updatedAt: now, updatedBy: 'Demo' };
  const base = { ...stamp, schema: SCHEMA_VERSION };
  const ago = (n: number) => shift(today, -n);

  const variants = new Map<string, { cls: ProductClass; v: Variant }>();
  const product = (
    n: number, group: string, name: string, unit: string, decimals: Decimals, low: number | null, sellable: boolean,
    vs: [key: string, label: string, baseAmount: number | null, price: number, cost: number | null][],
  ): ProductClass => {
    const cls: ProductClass = {
      ...base, id: `demo-class-${String(n).padStart(2, '0')}`, name, group, unit: { name: unit, decimals }, lowStockThreshold: low, trackStock: true,
      sellable, customFields: [], customValues: {}, notes: '', archived: false, variants: [],
    };
    cls.variants = vs.map(([key, label, baseAmount, price, cost], i) => {
      const v: Variant = {
        ...stamp, id: `demo-var-${key}`, label, kind: baseAmount === null ? 'variable' : 'fixed',
        baseAmount, price, cost, sortOrder: i + 1, archived: false,
      };
      variants.set(key, { cls, v });
      return v;
    });
    return cls;
  };
  const bulk = (n: number, honey: string) => product(n, `Honey/${honey}`, 'Bulk', 'kg', 3, 5000, false, []);
  const jar = (n: number, honey: string, name: string, key: string, label: string, price: number, cost: number, low: number) =>
    product(n, `Honey/${honey}`, name, 'jar', 0, low, true, [[key, label, 1, price, cost]]);
  const flowerBulk = bulk(1, 'Flower');
  const f5 = jar(2, 'Flower', '500g Jar', 'f5', '500 g', 850, 390, 10);
  const f1 = jar(3, 'Flower', '1kg Jar', 'f1', '1 kg', 1500, 770, 10);
  const rosemaryBulk = bulk(4, 'Rosemary');
  const r5 = jar(5, 'Rosemary', '500g Jar', 'r5', '500 g', 950, 465, 10);
  const r1 = jar(6, 'Rosemary', '1kg Jar', 'r1', '1 kg', 1700, 880, 10);
  const oakBulk = bulk(7, 'Oak');
  const o5 = jar(8, 'Oak', '500g Jar', 'o5', '500 g', 900, 515, 10);
  const o1 = jar(9, 'Oak', '1kg Jar', 'o1', '1 kg', 1600, 980, 10);
  const packaging = (n: number, name: string, low: number) => product(n, 'Packaging', name, 'pcs', 0, low, false, []);
  const emptyJar5 = packaging(10, 'Empty jar 500g', 30);
  const emptyJar1 = packaging(11, 'Empty jar 1kg', 20);
  const lid = packaging(12, 'Lid', 50);
  const giftBox = packaging(13, 'Gift box', 5);
  const xmasBox = product(14, 'Gifts', 'Christmas box', 'pcs', 0, 3, true, [['box', 'Box', 1, 2500, 1520]]);
  const comb = product(15, 'Honeycomb', 'Honeycomb', 'kg', 3, 2000, true, [['comb', 'By weight', null, 3000, 2000]]);
  const pollen = product(16, 'Pollen', '250g Jar', 'jar', 0, 8, true, [['pol', '250 g', 1, 700, 250]]);
  const rawMilk = product(17, 'Dairy/Milk', 'Raw milk', 'L', 0, 50, false, []);
  const bottle = product(18, 'Dairy/Milk', '1L Bottle', 'bottle', 0, 10, true, [['mk', '1 L', 1, 180, 90]]);
  const curedCheese = product(19, 'Dairy/Cheese', 'Cured cheese', 'kg', 3, 2000, true, [
    ['chw', 'By weight', null, 1800, 900], ['chq', 'Quarter 750 g', 750, 1350, 700],
  ]);
  const freshCheese = product(20, 'Dairy/Cheese', 'Fresh cheese', 'pcs', 0, 6, true, [['fc', '250 g', 1, 350, 160]]);
  const yogurt = product(21, 'Dairy/Yogurt', 'Natural yogurt', 'pot', 0, 10, true, [['y1', 'Single', 1, 90, 40], ['y4', 'Pack of 4', 4, 320, 160]]);
  const chorizo = product(22, 'Meat/Pork', 'Chorizo', 'pcs', 0, 5, true, [['cho', 'Piece', 1, 650, 380]]);
  const porkLoin = product(23, 'Meat/Pork', 'Pork loin', 'kg', 3, 3000, true, [['pl', 'By weight', null, 1100, 700]]);
  const minced = product(24, 'Meat/Beef', 'Minced beef', 'kg', 3, 2000, true, [
    ['mbf', 'By weight', null, 1300, 850], ['mb5', '500 g pack', 500, 700, 430],
  ]);
  const steak = product(25, 'Meat/Beef', 'Steak', 'kg', 3, 1000, true, [['stk', 'By weight', null, 2600, 1700]]);
  const expense = (n: number, name: string): ProductClass => ({
    ...product(n, 'Expenses', name, 'pcs', 0, null, false, []), trackStock: false,
  });
  const fuel = expense(26, 'Fuel');
  const marketFee = expense(27, 'Market fee');
  const hiveTreatment = expense(28, 'Hive treatment');
  const products = [
    flowerBulk, f5, f1, rosemaryBulk, r5, r1, oakBulk, o5, o1, emptyJar5, emptyJar1, lid, giftBox, xmasBox, comb, pollen,
    rawMilk, bottle, curedCheese, freshCheese, yogurt, chorizo, porkLoin, minced, steak, fuel, marketFee, hiveTreatment,
  ];

  const supplier = (n: number, name: string): Supplier => ({ ...base, id: `demo-supplier-${n}`, name, phone: '', notes: '', archived: false });
  const [envases, apicola, gasolinera] = [supplier(1, 'Envases Levante'), supplier(2, 'Apícola Sur'), supplier(3, 'Gasolinera')];
  const levels: WorkLevel[] = [['Level 1', 1200], ['Level 2', 1450], ['Level 3', 1800]].map(([name, hourlyRate], i) => ({
    ...base, id: `demo-level-${i + 1}`, name: name as string, hourlyRate: hourlyRate as number, archived: false,
  }));
  const levelsById = new Map(levels.map((l) => [l.id, l]));

  const clients: Client[] = CLIENTS.map(([name, phone, tags]) => ({
    ...base, id: `demo-client-${name === 'Lucía' ? 'lucia' : name.toLowerCase()}`, name, phone, notes: '', tags, archived: false,
  }));

  const orders: Order[] = [];
  const payments: Payment[] = [];
  const methods: PaymentMethod[] = ['cash', 'bizum', 'cash', 'other'];
  const pay = (clientId: string, orderId: string | null, date: IsoDate, amount: number, note = '', voided = false) =>
    payments.push({
      ...base, id: `demo-pay-${String(payments.length + 1).padStart(2, '0')}`, date, clientId, orderId, amount,
      method: methods[payments.length % methods.length], note, voided,
    });
  const later: Order[] = [];

  ORDERS.forEach(([days, ci, spec, status], i) => {
    const id = `demo-order-${String(i + 1).padStart(2, '0')}`;
    const lines = spec.split(' ').map((part, j): OrderLine => {
      const [key, num] = part.split(':');
      const { cls, v } = variants.get(key)!;
      const fixed = v.kind === 'fixed';
      const amount = fixed ? Number(num) * v.baseAmount! : Number(num);
      return {
        lineId: `${id}-l${j + 1}`, classId: cls.id, variantId: v.id, className: cls.name, variantLabel: v.label,
        kind: v.kind, unitName: cls.unit.name, decimals: cls.unit.decimals, quantity: fixed ? Number(num) : null,
        amount, unitPrice: v.price, unitCost: v.cost,
        lineTotal: fixed ? Number(num) * v.price : roundDiv(amount * v.price, 10 ** cls.unit.decimals),
      };
    });
    const client = clients[ci];
    const order: Order = {
      ...base, id, date: ago(days), clientId: client.id, clientName: client.name, lines,
      total: lines.reduce((s, l) => s + l.lineTotal, 0), note: '', voided: status === 'V',
      voidReason: status === 'V' ? 'Entered twice' : null,
    };
    orders.push(order);
    if (status === 'P') pay(client.id, id, ago(Math.max(0, i % 3 === 0 ? days - 2 : days)), order.total);
    if (status === 'H') pay(client.id, id, order.date, Math.max(100, Math.floor(order.total / 200) * 100));
    if (status === 'V') pay(client.id, id, order.date, order.total, '', true);
    if (status === 'L') later.push(order);
  });
  pay(clients[1].id, null, ago(28), later.reduce((s, o) => s + o.total, 0), 'Paid everything up to date');
  pay(clients[5].id, null, ago(10), 2000, 'Advance');

  let seq = 0;
  const event = (days: number, rest: object) =>
    ({ ...base, id: `demo-stock-${++seq}`, date: ago(days), note: '', voided: false, ...rest }) as StockEvent;
  // Cost per base unit of every product: the jars' own cost, then the adds (materials of later transforms).
  const unitCost = new Map<string, number>();
  for (const { cls, v } of variants.values()) if (v.kind === 'fixed') unitCost.set(cls.id, v.cost!);
  const stock: StockEvent[] = [];
  const add = (days: number, cls: ProductClass, amount: number, cost: number) => {
    unitCost.set(cls.id, cost);
    stock.push(event(days, { type: 'add', classId: cls.id, amount, unitCost: cost, reason: '' }));
  };
  // Purchases are always paid at once; a tracked line feeds the class average cost like an add with a unit cost.
  const purchases: Purchase[] = [];
  const buy = (days: number, from: Supplier | null, lines: [ProductClass, number, number][]) => {
    const rows = lines.map(([cls, amount, cost], j): PurchaseLine => {
      if (cls.trackStock) unitCost.set(cls.id, cost);
      return {
        lineId: `demo-purchase-${purchases.length + 1}-l${j + 1}`, classId: cls.id, className: cls.group ? `${cls.group}/${cls.name}` : cls.name,
        unitName: cls.unit.name, decimals: cls.unit.decimals, amount, lineTotal: roundDiv(amount * cost, 10 ** cls.unit.decimals),
      };
    });
    purchases.push({
      ...base, id: `demo-purchase-${purchases.length + 1}`, date: ago(days), supplierId: from?.id ?? null, supplierName: from?.name ?? '',
      lines: rows, total: rows.reduce((t, l) => t + l.lineTotal, 0), method: methods[purchases.length % methods.length], note: '', voided: false,
    });
  };
  const recipes: Recipe[] = [];
  const recipe = (key: string, name: string, inputs: [ProductClass, number][], out: ProductClass, extras: [string, number][], outAmount = 1, labour?: LabourRow[]) => {
    const r: Recipe = {
      ...base, id: `demo-recipe-${key}`, name, inputs: inputs.map(([c, amount]) => ({ classId: c.id, amount })),
      outputs: [{ classId: out.id, amount: outAmount }], extras: extras.map(([label, amount]) => ({ label, amount })),
      shares: [{ classId: out.id, share: 1 }], ...(labour ? { labour } : {}), archived: false,
    };
    recipes.push(r);
    return r;
  };
  // Runs recipe `r` `times` times (breakdown costs: materials plus the scaled extras).
  const make = (days: number, r: Recipe, times: number) => {
    const inputs = r.inputs.map((i) => ({ ...i, amount: i.amount * times }));
    const decimals = (id: string) => products.find((p) => p.id === id)!.unit.decimals;
    const materials = Math.round(inputs.reduce((s, i) => s + (i.amount / 10 ** decimals(i.classId)) * unitCost.get(i.classId)!, 0));
    const extras = r.extras.map((e) => ({ ...e, amount: e.amount * times }));
    const outputs = r.outputs.map((o) => ({ ...o, amount: o.amount * times }));
    const labour = r.labour && labourCosts(r.labour.map((l) => ({ ...l, minutes: l.minutes * times })), levelsById);
    stock.push(event(days, {
      type: 'transform', inputs, outputs, recipeId: r.id,
      costs: buildTransformCosts({ mode: 'breakdown', materials, materialsComplete: true, labour, extras, outputs, shares: r.shares }),
    }));
  };
  const fill = (key: string, honey: string, size: string, bulkCls: ProductClass, empty: ProductClass, out: ProductClass, kg: number, time: number) =>
    recipe(key, `Fill ${honey} ${size}`, [[empty, 1], [lid, 1], [bulkCls, kg]], out, [['Labels', 10], ['Time', time]], 1, [{ levelId: 'demo-level-1', minutes: time }]);
  const fillF5 = fill('f5', 'Flower', '500g', flowerBulk, emptyJar5, f5, 500, 40);
  const fillF1 = fill('f1', 'Flower', '1kg', flowerBulk, emptyJar1, f1, 1000, 60);
  const fillR5 = fill('r5', 'Rosemary', '500g', rosemaryBulk, emptyJar5, r5, 500, 40);
  const fillR1 = fill('r1', 'Rosemary', '1kg', rosemaryBulk, emptyJar1, r1, 1000, 60);
  const fillO5 = fill('o5', 'Oak', '500g', oakBulk, emptyJar5, o5, 500, 40);
  const fillO1 = fill('o1', 'Oak', '1kg', oakBulk, emptyJar1, o1, 1000, 60);
  const boxRecipe = recipe('box', 'Christmas box', [[f5, 1], [r1, 1], [giftBox, 1]], xmasBox, [['Time', 100]]);

  buy(125, apicola, [[flowerBulk, 60000, 650], [rosemaryBulk, 40000, 800], [oakBulk, 25000, 900]]);
  buy(125, envases, [[emptyJar5, 200, 35], [emptyJar1, 120, 50], [lid, 320, 12], [giftBox, 20, 150]]);
  add(125, pollen, 48, 250); add(125, comb, 14000, 2000);
  make(122, fillF5, 40); make(122, fillF1, 20);
  make(121, fillR5, 30); make(121, fillR1, 25);
  make(100, fillO5, 20); make(100, fillO1, 10);
  buy(80, apicola, [[rosemaryBulk, 10000, 820]]);
  buy(75, apicola, [[flowerBulk, 20000, 680]]);
  make(65, fillF5, 30);
  stock.push(event(60, { type: 'remove', classId: f5.id, amount: 3, unitCost: null, reason: 'broken' }));
  make(55, fillR5, 16);
  make(48, boxRecipe, 10);

  // Dairy made from raw milk; meat bought in.
  const cheeseRecipe = recipe('cheese', 'Make cured cheese', [[rawMilk, 10]], curedCheese, [['Rennet & salt', 150], ['Time', 300]], 1000);
  const freshRecipe = recipe('fresh', 'Make fresh cheese', [[rawMilk, 2]], freshCheese, [['Time', 30]]);
  const bottleRecipe = recipe('bottle', 'Bottle milk', [[rawMilk, 1]], bottle, [['Bottle', 40]]);
  const yogurtRecipe = recipe('yogurt', 'Make yogurt', [[rawMilk, 1]], yogurt, [['Cultures', 20], ['Pots', 80]], 8);
  add(125, rawMilk, 800, 45); add(125, chorizo, 40, 380);
  make(120, cheeseRecipe, 20); make(119, freshRecipe, 30); make(118, bottleRecipe, 60); make(118, yogurtRecipe, 20);
  add(110, porkLoin, 15000, 700); add(110, minced, 12000, 850);
  add(60, rawMilk, 400, 45);
  make(58, bottleRecipe, 40); make(57, freshRecipe, 20); make(56, yogurtRecipe, 10);
  add(40, steak, 8000, 1700);

  // Running costs over the demo months: fuel twice a month, a weekly market fee, one hive treatment.
  for (let d = 115; d >= 10; d -= 15) buy(d, gasolinera, [[fuel, 1, 4000]]);
  for (let d = 119; d >= 0; d -= 7) buy(d, null, [[marketFee, 1, 2500]]);
  buy(90, null, [[hiveTreatment, 1, 6000]]);

  const as = (type: RecordType, records: object[]) => records.map((record) => ({ type, record }));
  return [
    ...as('product', products), ...as('client', clients), ...as('order', orders),
    ...as('payment', payments), ...as('stock', stock), ...as('recipe', recipes),
    ...as('supplier', [envases, apicola, gasolinera]), ...as('level', levels), ...as('purchase', purchases),
  ];
}

/** Writes the demo records into the store, without outbox entries. */
export function loadDemo(store: Store, today: IsoDate, now: Timestamp): Promise<void> {
  return store.seed(demoRecords(today, now) as { type: RecordType; record: { id: string } }[]);
}
