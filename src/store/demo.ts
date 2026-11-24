// Demo mode sample data (spec §2.1, §15): deterministic records relative to `today`, loaded without outbox.
import {
  SCHEMA_VERSION,
  type Client, type Decimals, type IsoDate, type Order, type OrderLine, type Payment, type PaymentMethod,
  type ProductClass, type Recipe, type RecordType, type StockEvent, type Timestamp, type Variant,
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
  const products = [
    flowerBulk, f5, f1, rosemaryBulk, r5, r1, oakBulk, o5, o1, emptyJar5, emptyJar1, lid, giftBox, xmasBox, comb, pollen,
  ];

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
  const recipes: Recipe[] = [];
  const recipe = (key: string, name: string, inputs: [ProductClass, number][], out: ProductClass, extras: [string, number][]) => {
    const r: Recipe = {
      ...base, id: `demo-recipe-${key}`, name, inputs: inputs.map(([c, amount]) => ({ classId: c.id, amount })),
      outputs: [{ classId: out.id, amount: 1 }], extras: extras.map(([label, amount]) => ({ label, amount })),
      shares: [{ classId: out.id, share: 1 }], archived: false,
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
    stock.push(event(days, {
      type: 'transform', inputs, outputs: r.outputs.map((o) => ({ ...o, amount: o.amount * times })), recipeId: r.id,
      costs: {
        mode: 'breakdown', materials, materialsComplete: true, extras,
        total: materials + extras.reduce((s, e) => s + e.amount, 0), allocation: r.shares,
      },
    }));
  };
  const fill = (key: string, honey: string, size: string, bulkCls: ProductClass, empty: ProductClass, out: ProductClass, kg: number, time: number) =>
    recipe(key, `Fill ${honey} ${size}`, [[empty, 1], [lid, 1], [bulkCls, kg]], out, [['Labels', 10], ['Time', time]]);
  const fillF5 = fill('f5', 'Flower', '500g', flowerBulk, emptyJar5, f5, 500, 40);
  const fillF1 = fill('f1', 'Flower', '1kg', flowerBulk, emptyJar1, f1, 1000, 60);
  const fillR5 = fill('r5', 'Rosemary', '500g', rosemaryBulk, emptyJar5, r5, 500, 40);
  const fillR1 = fill('r1', 'Rosemary', '1kg', rosemaryBulk, emptyJar1, r1, 1000, 60);
  const fillO5 = fill('o5', 'Oak', '500g', oakBulk, emptyJar5, o5, 500, 40);
  const fillO1 = fill('o1', 'Oak', '1kg', oakBulk, emptyJar1, o1, 1000, 60);
  const boxRecipe = recipe('box', 'Christmas box', [[f5, 1], [r1, 1], [giftBox, 1]], xmasBox, [['Time', 100]]);

  add(125, flowerBulk, 60000, 650); add(125, rosemaryBulk, 40000, 800); add(125, oakBulk, 25000, 900);
  add(125, emptyJar5, 200, 35); add(125, emptyJar1, 120, 50); add(125, lid, 320, 12); add(125, giftBox, 20, 150);
  add(125, pollen, 48, 250); add(125, comb, 14000, 2000);
  make(122, fillF5, 40); make(122, fillF1, 20);
  make(121, fillR5, 30); make(121, fillR1, 25);
  make(100, fillO5, 20); make(100, fillO1, 10);
  add(80, rosemaryBulk, 10000, 820);
  add(75, flowerBulk, 20000, 680);
  make(65, fillF5, 30);
  stock.push(event(60, { type: 'remove', classId: f5.id, amount: 3, unitCost: null, reason: 'broken' }));
  make(55, fillR5, 16);
  make(48, boxRecipe, 10);

  const as = (type: RecordType, records: object[]) => records.map((record) => ({ type, record }));
  return [
    ...as('product', products), ...as('client', clients), ...as('order', orders),
    ...as('payment', payments), ...as('stock', stock), ...as('recipe', recipes),
  ];
}

/** Writes the demo records into the store, without outbox entries. */
export function loadDemo(store: Store, today: IsoDate, now: Timestamp): Promise<void> {
  return store.seed(demoRecords(today, now) as { type: RecordType; record: { id: string } }[]);
}
