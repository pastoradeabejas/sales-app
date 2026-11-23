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
  [120, 0, 'p500:2', 'P'], [118, 2, 'r5600:1', 'P'], [116, 3, 'p200:3 o05:2', 'P'], [113, 1, 'pcut:1373', 'L'],
  [110, 4, 'o5:1', 'P'], [108, 5, 'p500:1 p200:2', 'P'], [105, 6, 'r3600:2', 'P'], [102, 0, 'pcut:860 o05:1', 'P'],
  [99, 1, 'p3k:1', 'L'], [96, 2, 'r7600:1', 'H'], [93, 3, 'p500:2', 'P'], [90, 4, 'pcut:2140', 'P'],
  [87, 5, 'o05:4', 'P'], [84, 6, 'p200:2', 'U'], [81, 0, 'r5600:1', 'P'], [78, 1, 'p500:1 o05:2', 'L'],
  [75, 2, 'pcut:1015', 'P'], [72, 3, 'o5:1 p200:1', 'P'], [69, 4, 'r3600:1', 'V'], [66, 5, 'p3k:1', 'P'],
  [63, 0, 'p500:3', 'P'], [59, 6, 'ycup:12', 'P'], [56, 1, 'y4:6 pcut:745', 'L'], [53, 2, 'ycup:24', 'P'],
  [50, 3, 'pcut:1290', 'H'], [47, 4, 'y4:10', 'P'], [44, 5, 'p500:2 y4:4', 'P'], [41, 0, 'o05:3', 'P'],
  [37, 6, 'r7600:1', 'H'], [34, 1, 'p200:4', 'L'], [30, 2, 'y4:8 ycup:6', 'U'], [27, 3, 'p500:1', 'P'],
  [23, 4, 'pcut:1580 o05:1', 'U'], [20, 5, 'ycup:20', 'P'], [16, 0, 'p3k:1 p500:1', 'H'], [13, 1, 'y4:5', 'P'],
  [9, 6, 'pcut:930', 'U'], [6, 3, 'ycup:10 y4:2', 'U'], [3, 0, 'p200:2 o05:2', 'U'], [1, 4, 'r5600:1', 'P'],
  [0, 2, 'pcut:1137', 'U'],
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
    n: number, name: string, unit: string, decimals: Decimals, low: number | null, sellable: boolean,
    vs: [key: string, label: string, baseAmount: number | null, price: number, cost: number | null][],
  ): ProductClass => {
    const cls: ProductClass = {
      ...base, id: `demo-class-${n}`, name, unit: { name: unit, decimals }, lowStockThreshold: low, trackStock: true,
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
  const parm = product(1, 'Parmigiano Reggiano', 'kg', 3, 2000, true, [
    ['p200', '200 g', 200, 600, 320], ['p500', '500 g', 500, 1400, 750], ['p3k', '3 kg', 3000, 7800, 4200],
    ['pcut', 'Cut to order', null, 2600, null],
  ]);
  parm.customFields = [{ key: 'aging', label: 'Aging (months)', type: 'number' }];
  parm.customValues = { aging: 24 };
  const ryzen = product(2, 'Ryzen 5', 'pcs', 0, 3, true, [
    ['r3600', '3600', 1, 9500, 7000], ['r5600', '5600', 1, 13500, 10500], ['r7600', '7600', 1, 21000, 16500],
  ]);
  const oil = product(3, 'Olive oil', 'L', 2, 500, true, [['o05', '0.5 L bottle', 50, 650, 450], ['o5', '5 L tin', 500, 5200, 4500]]);
  const milk = product(4, 'Milk', 'kg', 3, 50000, false, []);
  const yogurt = product(5, 'Yogurt', 'pcs', 0, 200, true, [['ycup', '125 g cup', 1, 80, 2.67], ['y4', '4-pack', 4, 290, 10.68]]);
  const products = [parm, ryzen, oil, milk, yogurt];

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

  const event = (n: number, days: number, rest: object) =>
    ({ ...base, id: `demo-stock-${n}`, date: ago(days), note: '', voided: false, ...rest }) as StockEvent;
  const adjust = (n: number, days: number, type: 'add' | 'remove', classId: string, amount: number, unitCost: number | null, reason = '') =>
    event(n, days, { type, classId, amount, unitCost, reason });
  const recipe: Recipe = {
    ...base, id: 'demo-recipe-yogurt', name: 'Yogurt from milk',
    inputs: [{ classId: milk.id, amount: 500000 }], outputs: [{ classId: yogurt.id, amount: 10000 }],
    extras: [{ label: 'Electricity', amount: 1200 }, { label: 'Time', amount: 3000 }],
    shares: [{ classId: yogurt.id, share: 1 }], archived: false,
  };
  const stock: StockEvent[] = [
    adjust(1, 122, 'add', parm.id, 30000, 1500),
    adjust(2, 122, 'add', ryzen.id, 20, 8500),
    adjust(3, 121, 'add', oil.id, 4000, 900),
    adjust(4, 62, 'add', milk.id, 600000, 45),
    event(5, 60, {
      type: 'transform', inputs: recipe.inputs, outputs: recipe.outputs, recipeId: recipe.id,
      costs: { mode: 'breakdown', materials: 22500, materialsComplete: true, extras: recipe.extras, total: 26700, allocation: recipe.shares },
    }),
    adjust(6, 40, 'remove', parm.id, 450, null, 'waste'),
    adjust(7, 35, 'add', parm.id, 12000, 1550),
  ];

  const as = (type: RecordType, records: object[]) => records.map((record) => ({ type, record }));
  return [
    ...as('product', products), ...as('client', clients), ...as('order', orders),
    ...as('payment', payments), ...as('stock', stock), ...as('recipe', [recipe]),
  ];
}

/** Writes the demo records into the store, without outbox entries. */
export function loadDemo(store: Store, today: IsoDate, now: Timestamp): Promise<void> {
  return store.seed(demoRecords(today, now) as { type: RecordType; record: { id: string } }[]);
}
